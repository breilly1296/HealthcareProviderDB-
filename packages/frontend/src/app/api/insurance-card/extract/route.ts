import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { InsuranceCardData } from '@/types/insurance';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

const EXTRACTION_PROMPT = `Extract insurance card data as JSON. Return ONLY valid JSON:

{
  "insurance_company": "string or null",
  "plan_name": "string or null",
  "plan_type": "PPO/HMO/EPO/POS or null",
  "provider_network": "network name - critical for provider matching",
  "subscriber_name": "string or null",
  "subscriber_id": "string or null",
  "group_number": "string or null",
  "effective_date": "string or null",
  "rxbin": "string or null",
  "rxpcn": "string or null",
  "rxgrp": "string or null",
  "copay_pcp": "string or null",
  "copay_specialist": "string or null",
  "copay_urgent": "string or null",
  "copay_er": "string or null",
  "deductible_individual": "in-network individual deductible",
  "deductible_family": "in-network family deductible",
  "oop_max_individual": "in-network individual out-of-pocket max",
  "oop_max_family": "in-network family out-of-pocket max",
  "customer_care_phone": "string or null",
  "website": "string or null",
  "network_notes": "any network affiliations like BlueCard, national networks, etc"
}`;

type ImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';

/**
 * Detect image media type from base64 data using magic bytes
 */
function detectMediaType(base64Data: string): ImageMediaType {
  // Remove data URL prefix if present
  const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '');

  // Decode first few bytes to check magic numbers
  const binaryStr = atob(cleanBase64.slice(0, 16));
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  // Check magic bytes
  // PNG: 89 50 4E 47
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: FF D8 FF
  if (bytes[0] === 0xFF && bytes[1] === 0xD8 && bytes[2] === 0xFF) {
    return 'image/jpeg';
  }

  // WebP: 52 49 46 46 ... 57 45 42 50
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) {
    return 'image/webp';
  }

  // GIF: 47 49 46 38
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x38) {
    return 'image/gif';
  }

  // Default to JPEG if unknown
  return 'image/jpeg';
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { image } = body;

    if (!image) {
      return NextResponse.json(
        { success: false, error: 'No image provided' },
        { status: 400 }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { success: false, error: 'Anthropic API key not configured' },
        { status: 500 }
      );
    }

    // Remove data URL prefix if present and detect media type
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const mediaType = detectMediaType(image);

    // Call Claude Haiku for extraction
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType,
                data: base64Data,
              },
            },
            {
              type: 'text',
              text: EXTRACTION_PROMPT,
            },
          ],
        },
      ],
    });

    // Extract text content from response
    const textContent = response.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      return NextResponse.json(
        { success: false, error: 'No text response from Claude' },
        { status: 500 }
      );
    }

    // Parse JSON from response
    const responseText = textContent.text.trim();

    // Try to extract JSON from the response (in case there's extra text)
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json(
        { success: false, error: 'Could not parse JSON from response' },
        { status: 500 }
      );
    }

    const extractedData: InsuranceCardData = JSON.parse(jsonMatch[0]);

    return NextResponse.json({
      success: true,
      data: extractedData,
    });
  } catch (error) {
    console.error('Insurance card extraction error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
