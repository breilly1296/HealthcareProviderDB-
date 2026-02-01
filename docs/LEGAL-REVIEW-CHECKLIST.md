# Legal Review Checklist

## Status: Pending Review

This document tracks legal review items for VerifyMyProvider to ensure compliance with applicable laws and regulations.

---

## HIPAA Position Review

### Status: Pending Confirmation

VerifyMyProvider's position is that we are **NOT** a HIPAA-covered entity.

- [ ] Have lawyer confirm VerifyMyProvider is NOT a HIPAA-covered entity
- [ ] Document reasoning:
  - Only use public NPI registry data (NPPES)
  - No Protected Health Information (PHI) collected
  - No patient-provider relationships
  - No medical records or treatment information
  - Anonymous crowdsourced verifications only
- [ ] Get written legal opinion for records
- [ ] Review if any future features would change HIPAA status

### Supporting Documentation

| Item | Description |
|------|-------------|
| Data Sources | CMS NPPES (public), anonymous user submissions |
| PHI Collected | None - no patient health information |
| PII Collected | Optional email only (not required), IP for rate limiting |
| Medical Records | None |
| Treatment Data | None |

---

## CMS Terms of Use for NPI Data

### Status: Pending Review

The NPI Registry (NPPES) is a public database, but usage terms should be reviewed.

- [ ] Review CMS NPPES Terms of Use
- [ ] Confirm commercial use is permitted
- [ ] Document any attribution requirements
- [ ] Check if redistribution limitations apply
- [ ] Verify data update frequency requirements
- [ ] Review accuracy disclaimer requirements

### Resources

- **NPPES Download**: https://download.cms.gov/nppes/NPI_Files.html
- **CMS Terms**: https://www.cms.gov/about-cms/website-policies
- **NPPES FAQ**: https://nppes.cms.hhs.gov/

### Notes

The NPPES data is generally considered public domain, but CMS may have specific requirements for:
- How data is presented
- Attribution or source disclosure
- Disclaimers about accuracy

---

## User-Generated Content

### Status: Pending ToS Update

Terms of Service should clearly address user submissions.

- [ ] Terms of Service covers user submissions
- [ ] Users grant license for verification data
- [ ] License scope defined (perpetual, worldwide, royalty-free)
- [ ] Indemnification clause for false submissions
- [ ] Right to remove inaccurate content
- [ ] Prohibited uses clearly defined
- [ ] Spam/abuse policy documented
- [ ] User representations and warranties

### Key Terms Needed

```
By submitting a verification, you:
1. Represent the information is accurate to your knowledge
2. Grant VerifyMyProvider a perpetual license to use the data
3. Agree you are not submitting false or misleading information
4. Indemnify VerifyMyProvider against claims from false submissions
```

---

## Liability Limitations

### Status: Pending Review

Critical protections for data accuracy issues.

- [ ] Disclaimer of warranty for data accuracy
- [ ] "As is" and "as available" language
- [ ] Limitation of liability clause
- [ ] Cap on damages (if applicable)
- [ ] No medical advice disclaimer
- [ ] No insurance advice disclaimer
- [ ] Users assume responsibility for verification
- [ ] No guarantee of provider availability
- [ ] Not responsible for surprise medical bills

### Sample Language

```
DATA ACCURACY: Information on VerifyMyProvider is crowdsourced and may be
inaccurate, incomplete, or outdated. We do not guarantee the accuracy of
any information. Always verify insurance acceptance directly with the
provider before scheduling an appointment.

LIMITATION OF LIABILITY: VerifyMyProvider shall not be liable for any
direct, indirect, incidental, consequential, or punitive damages arising
from your use of our service, including but not limited to surprise
medical bills or out-of-network costs.
```

---

## Privacy Policy Requirements

### Status: Partially Complete

Current privacy policy exists but should be reviewed.

- [x] What data is collected documented
- [x] IP address usage explained (rate limiting)
- [x] Cookie policy included
- [x] Third-party services disclosed (PostHog)
- [ ] Insurance card OCR handling explained
- [ ] Insurance card images not stored (add explicit statement)
- [ ] Google reCAPTCHA disclosure
- [ ] Anthropic (Claude) disclosure for OCR
- [ ] Data retention periods specified
- [ ] User rights documented (CCPA, GDPR if applicable)
- [ ] Children's privacy (COPPA)
- [ ] International data transfers

### Third-Party Services to Disclose

| Service | Purpose | Data Shared |
|---------|---------|-------------|
| PostHog | Analytics | Anonymized usage data |
| Google reCAPTCHA | Bot protection | Risk analysis data |
| Anthropic Claude | Insurance card OCR | Card images (not stored) |
| Google Cloud | Hosting | Server logs |

---

## Accessibility

### Status: Pending Audit

WCAG 2.1 AA compliance should be verified.

- [ ] WCAG 2.1 AA compliance review
- [ ] Screen reader compatibility testing
- [ ] Keyboard navigation verification
- [ ] Color contrast verification
- [ ] Form accessibility review
- [ ] Mobile accessibility testing
- [ ] Accessibility statement page

---

## Insurance Regulations

### Status: Pending Review

Confirm we are not acting as a regulated insurance entity.

- [ ] Confirm not acting as insurance broker
- [ ] Confirm not acting as insurance agent
- [ ] No insurance advice provided
- [ ] Directory information only
- [ ] No plan recommendations
- [ ] No enrollment assistance
- [ ] State-specific insurance regulations reviewed

### Key Points

VerifyMyProvider is a **directory service only**. We:
- Provide public information about providers
- Display crowdsourced insurance acceptance data
- Do NOT recommend providers or insurance plans
- Do NOT assist with enrollment
- Do NOT provide insurance advice

---

## Action Items

| Item | Priority | Assignee | Due Date | Status |
|------|----------|----------|----------|--------|
| HIPAA lawyer review | High | TBD | TBD | Pending |
| CMS NPPES terms review | High | TBD | TBD | Pending |
| Terms of Service update | High | TBD | TBD | Pending |
| Privacy policy update | Medium | TBD | TBD | In Progress |
| Accessibility audit | Medium | TBD | TBD | Pending |
| Insurance regulations review | Medium | TBD | TBD | Pending |

---

## Resources

### Legal & Compliance

- **CMS NPPES**: https://download.cms.gov/nppes/NPI_Files.html
- **HIPAA Guidance**: https://www.hhs.gov/hipaa/
- **FTC Privacy Guidelines**: https://www.ftc.gov/business-guidance/privacy-security
- **CCPA Info**: https://oag.ca.gov/privacy/ccpa
- **WCAG 2.1**: https://www.w3.org/WAI/WCAG21/quickref/

### Industry References

- **Healthcare Directory Services**: Review how similar services handle disclaimers
- **Insurance Finder Tools**: Review Zocdoc, Healthgrades, etc. for comparison

---

## Review History

| Date | Reviewer | Notes |
|------|----------|-------|
| 2025-01 | Initial | Document created, awaiting legal review |

---

## Notes

### Questions for Legal Counsel

1. Is our HIPAA-exempt position correct given we only use public NPI data and crowdsourced verifications?

2. Do we need specific disclaimers for the insurance card OCR feature since we process card images?

3. Are there state-specific requirements for healthcare directory services?

4. Should we require users to agree to terms before submitting verifications?

5. Do we need a separate arbitration clause?

6. Are there special requirements for crowdsourced healthcare data?

### Pending Decisions

- Whether to add user accounts (changes privacy implications)
- Whether to add provider claim feature (may change HIPAA status)
- International expansion considerations (GDPR)
