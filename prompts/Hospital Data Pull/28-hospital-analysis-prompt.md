# NYC Provider Hospital Affiliation Lookup

**File:** C:\Users\breil\OneDrive\Desktop\NPI\nyc-providers only\[SPECIALTY-FILE].csv

**Important:** NPI data contains practice addresses, NOT hospital affiliations. Most providers list private offices. You must search the web to find actual affiliations.

**Task:** Find hospital affiliations for the first 20 INDIVIDUAL providers (skip organization entries).

**Process for EACH provider:**
1. Search Google: "[Provider Name] [Specialty] NYC"
2. Look for their profile on a major hospital website
3. Record the hospital affiliation and profile URL

**Target Hospital Systems (in priority order):**
1. NYU Langone Health (nyulangone.org)
2. Mount Sinai Health System (mountsinai.org)
3. NewYork-Presbyterian / Columbia / Cornell (nyp.org)
4. Northwell Health (northwell.edu)
5. Montefiore / Einstein (montefiore.org)
6. NYC Health + Hospitals (nychealthandhospitals.org)
7. Memorial Sloan Kettering (mskcc.org)
8. Maimonides (maimonidesmed.org)

**Skip these entries:**
- Organizations (names containing "Medical Center", "Hospital", "University", "PLLC", "PC", "Associates" without MD/DO)
- Duplicate NPIs

**Output columns:**
| Provider Name | NPI | Credential | Hospital System | Profile URL | Confidence |

**Confidence levels:**
- HIGH = Found on hospital's official "Find a Doctor" page
- MEDIUM = Found on Healthgrades/Zocdoc showing affiliation
- LOW = Inferred from address only
- NOT_FOUND = No hospital affiliation found

**Output as:** Excel file saved to same folder as input

**After completing 20 providers:** Stop and provide summary statistics.
