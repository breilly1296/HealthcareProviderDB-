# 29 - Insurance Card Upload

## Status: IMPLEMENTED

## Overview

An optional feature that allows users to upload a photo of their insurance card and automatically extract structured data using Anthropic Claude for OCR and field extraction. This helps users quickly find and verify providers in their insurance network.

## Flow

1. User uploads an image of their insurance card via the frontend
2. The image is preprocessed server-side using `sharp`:
   - Resized to max 1024px on the longest edge
   - Compressed to 80% quality JPEG
   - Auto-rotated based on EXIF data
3. The Next.js API route sends the processed image to the Anthropic Claude API
4. Claude extracts structured JSON from the card image
5. Confidence scoring is applied to the extracted fields
6. If confidence is low, a retry is attempted using an alternative extraction prompt
7. Results are displayed to the user with confidence indicators

## Extracted Fields

| Field              | Description                          |
|--------------------|--------------------------------------|
| `insurance_company`| Name of the insurance carrier        |
| `plan_name`        | Name of the specific plan            |
| `provider_network` | Network name (e.g., PPO, HMO, EPO)  |
| `subscriber_id`    | Member/subscriber ID number          |
| `group_number`     | Group number                         |
| `plan_type`        | Type of plan (HMO, PPO, POS, etc.)  |
| `effective_date`   | Coverage effective date              |
| `rxbin`            | Pharmacy BIN number                  |
| `rxpcn`            | Pharmacy PCN                         |
| `rxgrp`            | Pharmacy group                       |
| `copays`           | Copay amounts (PCP, specialist, ER)  |
| `deductibles`      | Deductible amounts                   |
| `oop_max`          | Out-of-pocket maximum                |
| `phone`            | Customer service phone number        |
| `website`          | Insurance company website            |

## Confidence Scoring

| Level  | Threshold | Indicator |
|--------|-----------|-----------|
| High   | >= 70%    | Green     |
| Medium | 40 - 69%  | Yellow    |
| Low    | < 40%     | Red       |

Confidence is calculated based on:
- Number of fields successfully extracted
- Consistency between related fields (e.g., plan type matches network)
- Presence of key identifiers (subscriber ID, group number)

## Extraction Prompts

Two prompts are used in sequence if needed:

1. **`PRIMARY_EXTRACTION_PROMPT`** - Detailed prompt optimized for standard US insurance cards with structured field extraction instructions
2. **`ALTERNATIVE_EXTRACTION_PROMPT`** - Simplified prompt with different formatting instructions, used as a retry when the primary prompt returns low-confidence results

## Security

- Images are processed **server-side only** via the Next.js API route; they are never sent directly from the browser to Claude
- Images are **not stored permanently**; they exist only in memory during processing
- Rate limited to **10 uploads per hour** per IP address
- Maximum file size: **10 MB**
- MIME type validation: only `image/*` types are accepted
- No insurance data is persisted to the database; extracted results are returned to the client only

## Error Handling

User-friendly error messages are returned for common issues:

| Issue             | Message                                                        |
|-------------------|----------------------------------------------------------------|
| Blurry image      | "The image appears blurry. Try taking a clearer photo."        |
| Glare/reflection  | "There may be glare on the card. Try adjusting the lighting."  |
| Partial card      | "Part of the card may be cut off. Ensure the full card is visible." |
| Unsupported format| "This file type is not supported. Please upload a JPEG or PNG." |
| File too large    | "The file is too large. Maximum size is 10 MB."               |
| Rate limited      | "Too many uploads. Please try again later."                    |
| Processing error  | "We couldn't read the card. Try uploading a different photo."  |
