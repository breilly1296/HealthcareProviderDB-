import { parseInsuranceCardResponse, PRIMARY_EXTRACTION_PROMPT, ALTERNATIVE_EXTRACTION_PROMPT } from '../insuranceCardSchema';

describe('insuranceCardSchema', () => {
  describe('parseInsuranceCardResponse', () => {
    it('should parse a valid JSON response with all fields', () => {
      const response = `{
        "insurance_company": "Blue Cross Blue Shield",
        "plan_name": "PPO Gold",
        "plan_type": "PPO",
        "provider_network": "BlueCard PPO",
        "subscriber_name": "John Doe",
        "subscriber_id": "ABC123456",
        "group_number": "GRP789",
        "effective_date": "01/01/2024",
        "rxbin": "610014",
        "rxpcn": "BCBSA",
        "rxgrp": "RX123",
        "copay_pcp": "$25",
        "copay_specialist": "$50",
        "copay_urgent": "$75",
        "copay_er": "$150",
        "deductible_individual": "$500",
        "deductible_family": "$1500",
        "oop_max_individual": "$3000",
        "oop_max_family": "$6000",
        "customer_care_phone": "1-800-555-1234",
        "website": "www.bcbs.com",
        "network_notes": "BlueCard, PPO National Network",
        "extraction_confidence": "high",
        "card_side": "front"
      }`;

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.insurance_company).toBe('Blue Cross Blue Shield');
        expect(result.data.plan_type).toBe('PPO');
        expect(result.data.subscriber_id).toBe('ABC123456');
        expect(result.metadata.confidence).toBe('high');
        expect(result.metadata.fieldsExtracted).toBeGreaterThan(15);
      }
    });

    it('should handle partial extraction with only critical fields', () => {
      const response = `{
        "insurance_company": "Aetna",
        "plan_name": "Open Access",
        "subscriber_id": "W123456789",
        "group_number": null,
        "extraction_confidence": "medium",
        "card_side": "front"
      }`;

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.insurance_company).toBe('Aetna');
        // Confidence is adjusted based on AI confidence and extracted fields
        expect(['low', 'medium']).toContain(result.metadata.confidence);
        expect(result.metadata.fieldsExtracted).toBe(3);
      }
    });

    it('should handle JSON embedded in text', () => {
      const response = `Here is the extracted information:

{
  "insurance_company": "UnitedHealthcare",
  "plan_name": "Choice Plus",
  "subscriber_id": "U987654321"
}

Please verify this information is correct.`;

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.insurance_company).toBe('UnitedHealthcare');
      }
    });

    it('should return failure when no JSON is found', () => {
      const response = 'I cannot identify any insurance card in this image.';

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.suggestions.length).toBeGreaterThan(0);
      }
    });

    it('should detect when image is not an insurance card', () => {
      const response = "This doesn't appear to be an insurance card. The image shows a credit card.";

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.issues.some(i => i.type === 'not_insurance_card')).toBe(true);
      }
    });

    it('should handle invalid JSON gracefully', () => {
      // Invalid JSON that still matches the regex pattern
      const response = '{ "insurance_company": "Test", "plan_name": }';

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Failed to parse JSON');
      }
    });

    it('should calculate confidence score correctly for high confidence', () => {
      const response = `{
        "insurance_company": "Cigna",
        "plan_name": "Open Access Plus",
        "provider_network": "OAP National",
        "subscriber_id": "C123456",
        "group_number": "12345",
        "plan_type": "PPO",
        "extraction_confidence": "high"
      }`;

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.confidenceScore).toBeGreaterThanOrEqual(0.7);
        expect(result.metadata.confidence).toBe('high');
      }
    });

    it('should calculate lower confidence when critical fields are missing', () => {
      const response = `{
        "customer_care_phone": "1-800-555-1234",
        "website": "www.example.com",
        "rxbin": "123456",
        "extraction_confidence": "low"
      }`;

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.confidenceScore).toBeLessThan(0.4);
        expect(result.metadata.confidence).toBe('low');
      }
    });

    it('should generate suggestions for missing fields', () => {
      const response = `{
        "plan_name": "Gold Plan",
        "copay_pcp": "$30"
      }`;

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.suggestions.length).toBeGreaterThan(0);
        expect(result.metadata.suggestions.some(s => s.includes('insurance company'))).toBe(true);
      }
    });

    it('should suggest uploading other side of card', () => {
      const response = `{
        "insurance_company": "BCBS",
        "subscriber_id": "123456",
        "card_side": "front"
      }`;

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        const hasBackSuggestion = result.metadata.suggestions.some(
          s => s.toLowerCase().includes('back of your card')
        );
        expect(hasBackSuggestion).toBe(true);
      }
    });

    it('should handle all valid plan types', () => {
      const planTypes = ['PPO', 'HMO', 'EPO', 'POS'];

      for (const planType of planTypes) {
        const response = `{"plan_type": "${planType}"}`;
        const result = parseInsuranceCardResponse(response);

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.plan_type).toBe(planType);
        }
      }
    });

    it('should accept non-standard plan types as strings', () => {
      const response = `{"plan_type": "Indemnity"}`;
      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.plan_type).toBe('Indemnity');
      }
    });

    it('should handle image quality issues from AI', () => {
      const response = `{
        "insurance_company": "Aetna",
        "subscriber_id": "A123",
        "extraction_confidence": "low",
        "image_quality_issues": ["blurry text", "partial card visible"]
      }`;

      const result = parseInsuranceCardResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.suggestions.some(
          s => s.toLowerCase().includes('blurry') || s.toLowerCase().includes('focus')
        )).toBe(true);
      }
    });
  });

  describe('extraction prompts', () => {
    it('should have primary extraction prompt defined', () => {
      expect(PRIMARY_EXTRACTION_PROMPT).toBeDefined();
      expect(PRIMARY_EXTRACTION_PROMPT.length).toBeGreaterThan(100);
      expect(PRIMARY_EXTRACTION_PROMPT).toContain('insurance_company');
      expect(PRIMARY_EXTRACTION_PROMPT).toContain('provider_network');
    });

    it('should have alternative extraction prompt defined', () => {
      expect(ALTERNATIVE_EXTRACTION_PROMPT).toBeDefined();
      expect(ALTERNATIVE_EXTRACTION_PROMPT.length).toBeGreaterThan(50);
      expect(ALTERNATIVE_EXTRACTION_PROMPT).toContain('insurance_company');
    });

    it('primary prompt should be more detailed than alternative', () => {
      expect(PRIMARY_EXTRACTION_PROMPT.length).toBeGreaterThan(ALTERNATIVE_EXTRACTION_PROMPT.length);
    });

    it('primary prompt should include carrier-specific guidance', () => {
      expect(PRIMARY_EXTRACTION_PROMPT).toContain('Blue Cross Blue Shield');
      expect(PRIMARY_EXTRACTION_PROMPT).toContain('United Healthcare');
      expect(PRIMARY_EXTRACTION_PROMPT).toContain('Aetna');
      expect(PRIMARY_EXTRACTION_PROMPT).toContain('Cigna');
    });
  });
});
