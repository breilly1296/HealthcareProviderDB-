import { randomBytes, createHash } from 'crypto';
import { SignJWT } from 'jose';
import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { decryptCardPii } from '../lib/encryption';
import logger from '../utils/logger';
import {
  MS_PER_HOUR,
  MAGIC_LINK_EXPIRY_MS,
  MAGIC_LINK_MAX_PER_HOUR,
  SESSION_DURATION_MS,
  ACCESS_TOKEN_EXPIRY,
} from '../config/constants';

// ============================================================================
// Environment / config
// ============================================================================

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const MAGIC_LINK_BASE_URL = process.env.MAGIC_LINK_BASE_URL || 'https://verifymyprovider.com';
const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * JWT secret encoded as Uint8Array for jose SignJWT.
 * Lazily initialized so the module can be imported before env vars are loaded.
 */
let jwtSecret: Uint8Array | null = null;

function getJwtSecret(): Uint8Array {
  if (jwtSecret) return jwtSecret;
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  jwtSecret = new TextEncoder().encode(secret);
  return jwtSecret;
}

// ============================================================================
// Helpers
// ============================================================================

/** SHA-256 hash a string and return hex digest */
function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Generate a signed access token JWT */
async function signAccessToken(userId: string, email: string, sessionId: string): Promise<string> {
  return new SignJWT({ email, sid: sessionId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(ACCESS_TOKEN_EXPIRY)
    .sign(getJwtSecret());
}

/** Session expiry date from now */
function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_DURATION_MS);
}

// ============================================================================
// sendMagicLink
// ============================================================================

export async function sendMagicLink(email: string, ipAddress?: string) {
  // Normalize
  const normalizedEmail = email.toLowerCase().trim();

  // Rate limit: max 5 magic links per email per hour
  const oneHourAgo = new Date(Date.now() - MS_PER_HOUR);
  const recentCount = await prisma.magicLinkToken.count({
    where: {
      email: normalizedEmail,
      createdAt: { gte: oneHourAgo },
    },
  });

  if (recentCount >= MAGIC_LINK_MAX_PER_HOUR) {
    throw AppError.tooManyRequests(
      'Too many login requests. Please try again in an hour.'
    );
  }

  // Generate token
  const token = randomBytes(32).toString('hex');

  // Store with 15-min expiry
  await prisma.magicLinkToken.create({
    data: {
      email: normalizedEmail,
      token,
      expiresAt: new Date(Date.now() + MAGIC_LINK_EXPIRY_MS),
    },
  });

  // Build magic link — points directly to the backend API route.
  // The load balancer routes /api/* to the backend service, so cookies
  // are set on the same domain and the redirect lands on the frontend.
  const magicLink = `${MAGIC_LINK_BASE_URL}/api/v1/auth/verify?token=${token}`;

  // Send email via Resend
  if (!RESEND_API_KEY) {
    logger.warn({ email: normalizedEmail }, 'RESEND_API_KEY not configured, skipping email send');
  } else {
    try {
      const response = await fetch(RESEND_API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'VerifyMyProvider <login@verifymyprovider.com>',
          to: normalizedEmail,
          subject: 'Your login link for VerifyMyProvider',
          html: [
            '<!DOCTYPE html>',
            '<html><head><meta charset="utf-8"></head><body style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;max-width:480px;margin:0 auto;padding:32px 16px;color:#1a1a1a;">',
            '<h2 style="margin:0 0 16px;">Sign in to VerifyMyProvider</h2>',
            '<p style="margin:0 0 24px;line-height:1.5;">Click the button below to sign in. This link expires in 15 minutes.</p>',
            `<a href="${magicLink}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 24px;border-radius:6px;font-weight:600;">Sign in</a>`,
            '<p style="margin:24px 0 0;font-size:13px;color:#6b7280;line-height:1.5;">If the button doesn\'t work, copy and paste this link into your browser:</p>',
            `<p style="margin:4px 0 0;font-size:13px;color:#6b7280;word-break:break-all;">${magicLink}</p>`,
            '<p style="margin:24px 0 0;font-size:13px;color:#6b7280;">If you didn\'t request this email, you can safely ignore it.</p>',
            '</body></html>',
          ].join(''),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        logger.error({ status: response.status, body, email: normalizedEmail }, 'Resend API error');
      } else {
        logger.info({ email: normalizedEmail }, 'Magic link email sent');
      }
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : 'Unknown error', email: normalizedEmail },
        'Failed to send magic link email'
      );
    }
  }

  return { success: true, message: 'If that email is registered or valid, you will receive a login link.' };
}

// ============================================================================
// verifyMagicLink
// ============================================================================

export async function verifyMagicLink(token: string, ipAddress?: string, userAgent?: string) {
  // Find token
  const magicToken = await prisma.magicLinkToken.findUnique({
    where: { token },
  });

  if (!magicToken) {
    throw AppError.unauthorized('Invalid or expired login link');
  }

  if (magicToken.usedAt) {
    throw AppError.unauthorized('This login link has already been used');
  }

  if (magicToken.expiresAt < new Date()) {
    throw AppError.unauthorized('This login link has expired');
  }

  // Mark token as used
  await prisma.magicLinkToken.update({
    where: { id: magicToken.id },
    data: { usedAt: new Date() },
  });

  // Find or create user
  const user = await prisma.user.upsert({
    where: { email: magicToken.email },
    update: {
      emailVerified: new Date(),
    },
    create: {
      email: magicToken.email,
      emailVerified: new Date(),
    },
  });

  // Generate refresh token and hash it
  const rawRefreshToken = randomBytes(32).toString('hex');
  const refreshTokenHash = sha256(rawRefreshToken);

  // Create session
  const session = await prisma.session.create({
    data: {
      userId: user.id,
      refreshToken: refreshTokenHash,
      expiresAt: sessionExpiresAt(),
      ipAddress: ipAddress || null,
      userAgent: userAgent ? userAgent.substring(0, 500) : null,
    },
  });

  // Generate access token JWT
  const accessToken = await signAccessToken(user.id, user.email, session.id);

  logger.info({ userId: user.id, sessionId: session.id }, 'User authenticated via magic link');

  return {
    user: { id: user.id, email: user.email },
    accessToken,
    refreshToken: rawRefreshToken,
  };
}

// ============================================================================
// refreshSession
// ============================================================================

export async function refreshSession(refreshToken: string) {
  const refreshTokenHash = sha256(refreshToken);

  // Find session by hashed refresh token
  const session = await prisma.session.findUnique({
    where: { refreshToken: refreshTokenHash },
    include: { user: true },
  });

  if (!session) {
    throw AppError.unauthorized('Invalid refresh token');
  }

  if (session.expiresAt < new Date()) {
    // Clean up expired session
    await prisma.session.delete({ where: { id: session.id } });
    throw AppError.unauthorized('Session expired, please sign in again');
  }

  // Rotate refresh token
  const newRawRefreshToken = randomBytes(32).toString('hex');
  const newRefreshTokenHash = sha256(newRawRefreshToken);

  // Update session with new refresh token hash and extend expiry (sliding window)
  await prisma.session.update({
    where: { id: session.id },
    data: {
      refreshToken: newRefreshTokenHash,
      expiresAt: sessionExpiresAt(),
    },
  });

  // Generate new access token
  const accessToken = await signAccessToken(session.user.id, session.user.email, session.id);

  logger.info({ userId: session.user.id, sessionId: session.id }, 'Session refreshed');

  return {
    accessToken,
    refreshToken: newRawRefreshToken,
  };
}

// ============================================================================
// logout
// ============================================================================

export async function logout(sessionId: string) {
  await prisma.session.delete({
    where: { id: sessionId },
  }).catch(() => {
    // Session may already be deleted — not an error
  });

  logger.info({ sessionId }, 'Session deleted');

  return { success: true };
}

// ============================================================================
// getMe
// ============================================================================

export async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      _count: {
        select: { savedProviders: true },
      },
    },
  });

  if (!user) {
    throw AppError.notFound('User not found');
  }

  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerified,
    createdAt: user.createdAt,
    savedProviderCount: user._count.savedProviders,
  };
}

// ============================================================================
// exportUserData (GDPR / data portability)
// ============================================================================

export async function exportUserData(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      savedProviders: {
        select: {
          providerNpi: true,
          createdAt: true,
        },
      },
      insuranceCard: true,
    },
  });

  if (!user) {
    throw AppError.notFound('User not found');
  }

  // Decrypt insurance card PII if present
  let insuranceCard = null;
  if (user.insuranceCard) {
    const card = user.insuranceCard;
    const decrypted = decryptCardPii({
      subscriberIdEnc: card.subscriberIdEnc,
      groupNumberEnc: card.groupNumberEnc,
      rxbinEnc: card.rxbinEnc,
      rxpcnEnc: card.rxpcnEnc,
      rxgrpEnc: card.rxgrpEnc,
    });

    insuranceCard = {
      insuranceCompany: card.insuranceCompany,
      planName: card.planName,
      planType: card.planType,
      providerNetwork: card.providerNetwork,
      subscriberName: card.subscriberName,
      subscriberId: decrypted.subscriber_id,
      groupNumber: decrypted.group_number,
      effectiveDate: card.effectiveDate,
      copayPcp: card.copayPcp,
      copaySpecialist: card.copaySpecialist,
      copayUrgent: card.copayUrgent,
      copayEr: card.copayEr,
      deductibleIndiv: card.deductibleIndiv,
      deductibleFamily: card.deductibleFamily,
      oopMaxIndiv: card.oopMaxIndiv,
      oopMaxFamily: card.oopMaxFamily,
      rxbin: decrypted.rxbin,
      rxpcn: decrypted.rxpcn,
      rxgrp: decrypted.rxgrp,
      scannedAt: card.scannedAt,
      updatedAt: card.updatedAt,
    };
  }

  return {
    account: {
      id: user.id,
      email: user.email,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt,
    },
    savedProviders: user.savedProviders,
    insuranceCard,
    exportedAt: new Date().toISOString(),
  };
}
