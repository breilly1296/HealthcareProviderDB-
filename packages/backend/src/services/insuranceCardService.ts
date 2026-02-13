import prisma from '../lib/prisma';
import { AppError } from '../middleware/errorHandler';
import { encryptCardPii, decryptCardPii, encrypt } from '../lib/encryption';
import logger from '../utils/logger';

// ============================================================================
// Types
// ============================================================================

export interface ExtractedCardData {
  insurance_company?: string | null;
  plan_name?: string | null;
  plan_type?: string | null;
  provider_network?: string | null;
  network_notes?: string | null;
  subscriber_name?: string | null;
  subscriber_id?: string | null;
  group_number?: string | null;
  effective_date?: string | null;
  copay_pcp?: string | null;
  copay_specialist?: string | null;
  copay_urgent?: string | null;
  copay_er?: string | null;
  deductible_individual?: string | null;
  deductible_family?: string | null;
  oop_max_individual?: string | null;
  oop_max_family?: string | null;
  rxbin?: string | null;
  rxpcn?: string | null;
  rxgrp?: string | null;
  card_side?: string | null;
  confidence_score?: number | null;
}

export interface UserInsuranceCardResponse {
  id: string;
  insuranceCompany: string | null;
  planName: string | null;
  planType: string | null;
  providerNetwork: string | null;
  networkNotes: string | null;
  subscriberName: string | null;
  subscriberId: string | null;
  groupNumber: string | null;
  effectiveDate: string | null;
  copayPcp: string | null;
  copaySpecialist: string | null;
  copayUrgent: string | null;
  copayEr: string | null;
  deductibleIndiv: string | null;
  deductibleFamily: string | null;
  oopMaxIndiv: string | null;
  oopMaxFamily: string | null;
  rxbin: string | null;
  rxpcn: string | null;
  rxgrp: string | null;
  cardSide: string | null;
  confidenceScore: number | null;
  scannedAt: Date;
  updatedAt: Date;
  matchedPlan: {
    planId: string;
    planName: string | null;
    issuerName: string | null;
    planType: string | null;
    state: string | null;
    carrier: string | null;
  } | null;
}

// ============================================================================
// Shared select for matched plan relation
// ============================================================================

const MATCHED_PLAN_INCLUDE = {
  matchedPlan: {
    select: {
      planId: true,
      planName: true,
      issuerName: true,
      planType: true,
      state: true,
      carrier: true,
    },
  },
} as const;

// ============================================================================
// matchPlan — find the best InsurancePlan match for extracted card data
// ============================================================================

async function matchPlan(
  insuranceCompany?: string | null,
  planName?: string | null,
  planType?: string | null,
): Promise<string | null> {
  if (!insuranceCompany) return null;

  const issuerOrCarrier = [
    { issuerName: { contains: insuranceCompany, mode: 'insensitive' as const } },
    { carrier: { contains: insuranceCompany, mode: 'insensitive' as const } },
  ];

  // Strategy 1: Issuer/carrier + plan name
  if (planName) {
    const match = await prisma.insurancePlan.findFirst({
      where: {
        AND: [
          { OR: issuerOrCarrier },
          {
            OR: [
              { planName: { contains: planName, mode: 'insensitive' } },
              { rawName: { contains: planName, mode: 'insensitive' } },
            ],
          },
        ],
      },
      orderBy: { providerCount: 'desc' },
      select: { planId: true },
    });
    if (match) return match.planId;
  }

  // Strategy 2: Issuer/carrier + plan type
  if (planType) {
    const match = await prisma.insurancePlan.findFirst({
      where: {
        AND: [
          { OR: issuerOrCarrier },
          { planType: { equals: planType, mode: 'insensitive' } },
        ],
      },
      orderBy: { providerCount: 'desc' },
      select: { planId: true },
    });
    if (match) return match.planId;
  }

  // Strategy 3: Issuer/carrier only (broadest match)
  const match = await prisma.insurancePlan.findFirst({
    where: { OR: issuerOrCarrier },
    orderBy: { providerCount: 'desc' },
    select: { planId: true },
  });
  return match?.planId ?? null;
}

// ============================================================================
// formatCardResponse — decrypt PII and map to API response shape
// ============================================================================

/** PII field names in the decrypted response (enc column → response key) */
const PII_FIELD_MAP: Record<string, string> = {
  subscriberIdEnc: 'subscriberId',
  groupNumberEnc: 'groupNumber',
  rxbinEnc: 'rxbin',
  rxpcnEnc: 'rxpcn',
  rxgrpEnc: 'rxgrp',
};

function formatCardResponse(
  card: Record<string, unknown> & { matchedPlan?: Record<string, unknown> | null },
  audit: { userId: string; requestId?: string },
): UserInsuranceCardResponse {
  const pii = decryptCardPii({
    subscriberIdEnc: card.subscriberIdEnc as string | null,
    groupNumberEnc: card.groupNumberEnc as string | null,
    rxbinEnc: card.rxbinEnc as string | null,
    rxpcnEnc: card.rxpcnEnc as string | null,
    rxgrpEnc: card.rxgrpEnc as string | null,
  });

  // Audit: log which PII fields were actually decrypted (had non-null ciphertext)
  const decryptedFields = Object.entries(PII_FIELD_MAP)
    .filter(([encKey]) => card[encKey] != null)
    .map(([, responseName]) => responseName);

  if (decryptedFields.length > 0) {
    logger.info({
      event: 'insurance_card.decrypted',
      userId: audit.userId,
      requestId: audit.requestId,
      fields: decryptedFields,
    }, 'PII fields decrypted for response');
  }

  return {
    id: card.id as string,
    insuranceCompany: card.insuranceCompany as string | null,
    planName: card.planName as string | null,
    planType: card.planType as string | null,
    providerNetwork: card.providerNetwork as string | null,
    networkNotes: card.networkNotes as string | null,
    subscriberName: card.subscriberName as string | null,
    subscriberId: pii.subscriber_id ?? null,
    groupNumber: pii.group_number ?? null,
    effectiveDate: card.effectiveDate as string | null,
    copayPcp: card.copayPcp as string | null,
    copaySpecialist: card.copaySpecialist as string | null,
    copayUrgent: card.copayUrgent as string | null,
    copayEr: card.copayEr as string | null,
    deductibleIndiv: card.deductibleIndiv as string | null,
    deductibleFamily: card.deductibleFamily as string | null,
    oopMaxIndiv: card.oopMaxIndiv as string | null,
    oopMaxFamily: card.oopMaxFamily as string | null,
    rxbin: pii.rxbin ?? null,
    rxpcn: pii.rxpcn ?? null,
    rxgrp: pii.rxgrp ?? null,
    cardSide: card.cardSide as string | null,
    confidenceScore: card.confidenceScore as number | null,
    scannedAt: card.scannedAt as Date,
    updatedAt: card.updatedAt as Date,
    matchedPlan: (card.matchedPlan as UserInsuranceCardResponse['matchedPlan']) ?? null,
  };
}

// ============================================================================
// saveInsuranceCard — encrypt PII, match plan, upsert by userId
// ============================================================================

export async function saveInsuranceCard(
  userId: string,
  data: ExtractedCardData,
  requestId?: string,
): Promise<UserInsuranceCardResponse> {
  const encryptedPii = encryptCardPii({
    subscriber_id: data.subscriber_id,
    group_number: data.group_number,
    rxbin: data.rxbin,
    rxpcn: data.rxpcn,
    rxgrp: data.rxgrp,
  });

  const matchedPlanId = await matchPlan(
    data.insurance_company,
    data.plan_name,
    data.plan_type,
  );

  const fields = {
    insuranceCompany: data.insurance_company ?? null,
    planName: data.plan_name ?? null,
    planType: data.plan_type ?? null,
    providerNetwork: data.provider_network ?? null,
    networkNotes: data.network_notes ?? null,
    subscriberName: data.subscriber_name ?? null,
    effectiveDate: data.effective_date ?? null,
    copayPcp: data.copay_pcp ?? null,
    copaySpecialist: data.copay_specialist ?? null,
    copayUrgent: data.copay_urgent ?? null,
    copayEr: data.copay_er ?? null,
    deductibleIndiv: data.deductible_individual ?? null,
    deductibleFamily: data.deductible_family ?? null,
    oopMaxIndiv: data.oop_max_individual ?? null,
    oopMaxFamily: data.oop_max_family ?? null,
    cardSide: data.card_side ?? null,
    confidenceScore: data.confidence_score ?? null,
    matchedPlanId,
    ...encryptedPii,
  };

  const card = await prisma.userInsuranceCard.upsert({
    where: { userId },
    create: { userId, ...fields },
    update: fields,
    include: MATCHED_PLAN_INCLUDE,
  });

  const fieldsExtracted = Object.values(data).filter(v => v != null && v !== '').length;

  logger.info({
    event: 'insurance_card.scanned',
    userId,
    requestId,
    matchedPlanId,
    confidence: data.confidence_score ?? null,
    fieldsExtracted,
  }, 'Insurance card scanned and saved');

  return formatCardResponse(card, { userId, requestId });
}

// ============================================================================
// getInsuranceCard
// ============================================================================

export async function getInsuranceCard(
  userId: string,
  requestId?: string,
): Promise<UserInsuranceCardResponse | null> {
  const card = await prisma.userInsuranceCard.findUnique({
    where: { userId },
    include: MATCHED_PLAN_INCLUDE,
  });

  if (!card) return null;

  logger.info({
    event: 'insurance_card.viewed',
    userId,
    requestId,
  }, 'Insurance card data retrieved');

  return formatCardResponse(card, { userId, requestId });
}

// ============================================================================
// deleteInsuranceCard
// ============================================================================

export async function deleteInsuranceCard(userId: string, requestId?: string): Promise<{ success: true }> {
  const existing = await prisma.userInsuranceCard.findUnique({
    where: { userId },
    select: { id: true },
  });

  if (!existing) {
    throw AppError.notFound('No insurance card found for this user');
  }

  await prisma.userInsuranceCard.delete({ where: { userId } });

  logger.info({
    event: 'insurance_card.deleted',
    userId,
    requestId,
  }, 'Insurance card deleted');

  return { success: true };
}

// ============================================================================
// updateInsuranceCard — partial updates with re-encryption and re-matching
// ============================================================================

export async function updateInsuranceCard(
  userId: string,
  updates: Partial<ExtractedCardData>,
  requestId?: string,
): Promise<UserInsuranceCardResponse> {
  const existing = await prisma.userInsuranceCard.findUnique({
    where: { userId },
  });

  if (!existing) {
    throw AppError.notFound('No insurance card found for this user');
  }

  const data: Record<string, unknown> = {};

  // Map non-PII fields (only set fields that were explicitly provided)
  if (updates.insurance_company !== undefined) data.insuranceCompany = updates.insurance_company;
  if (updates.plan_name !== undefined) data.planName = updates.plan_name;
  if (updates.plan_type !== undefined) data.planType = updates.plan_type;
  if (updates.provider_network !== undefined) data.providerNetwork = updates.provider_network;
  if (updates.network_notes !== undefined) data.networkNotes = updates.network_notes;
  if (updates.subscriber_name !== undefined) data.subscriberName = updates.subscriber_name;
  if (updates.effective_date !== undefined) data.effectiveDate = updates.effective_date;
  if (updates.copay_pcp !== undefined) data.copayPcp = updates.copay_pcp;
  if (updates.copay_specialist !== undefined) data.copaySpecialist = updates.copay_specialist;
  if (updates.copay_urgent !== undefined) data.copayUrgent = updates.copay_urgent;
  if (updates.copay_er !== undefined) data.copayEr = updates.copay_er;
  if (updates.deductible_individual !== undefined) data.deductibleIndiv = updates.deductible_individual;
  if (updates.deductible_family !== undefined) data.deductibleFamily = updates.deductible_family;
  if (updates.oop_max_individual !== undefined) data.oopMaxIndiv = updates.oop_max_individual;
  if (updates.oop_max_family !== undefined) data.oopMaxFamily = updates.oop_max_family;
  if (updates.card_side !== undefined) data.cardSide = updates.card_side;
  if (updates.confidence_score !== undefined) data.confidenceScore = updates.confidence_score;

  // Re-encrypt PII fields individually if provided
  if (updates.subscriber_id !== undefined) data.subscriberIdEnc = encrypt(updates.subscriber_id);
  if (updates.group_number !== undefined) data.groupNumberEnc = encrypt(updates.group_number);
  if (updates.rxbin !== undefined) data.rxbinEnc = encrypt(updates.rxbin);
  if (updates.rxpcn !== undefined) data.rxpcnEnc = encrypt(updates.rxpcn);
  if (updates.rxgrp !== undefined) data.rxgrpEnc = encrypt(updates.rxgrp);

  // Re-run plan matching if any plan-identifying fields changed
  if (
    updates.insurance_company !== undefined ||
    updates.plan_name !== undefined ||
    updates.plan_type !== undefined
  ) {
    const company = updates.insurance_company !== undefined
      ? updates.insurance_company
      : existing.insuranceCompany;
    const name = updates.plan_name !== undefined
      ? updates.plan_name
      : existing.planName;
    const type = updates.plan_type !== undefined
      ? updates.plan_type
      : existing.planType;

    data.matchedPlanId = await matchPlan(company, name, type);
  }

  const card = await prisma.userInsuranceCard.update({
    where: { userId },
    data,
    include: MATCHED_PLAN_INCLUDE,
  });

  // Audit: log field names that were changed (never values)
  const fieldsChanged = Object.keys(updates).filter(k => (updates as Record<string, unknown>)[k] !== undefined);

  logger.info({
    event: 'insurance_card.updated',
    userId,
    requestId,
    fieldsChanged,
  }, 'Insurance card updated');

  return formatCardResponse(card, { userId, requestId });
}
