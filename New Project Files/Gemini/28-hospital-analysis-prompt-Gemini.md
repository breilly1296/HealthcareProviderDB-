# Prompt Analysis: 28-hospital-analysis-prompt.md

**Type:** Task Execution / Manual
**Quality Rating:** 4/5

## Intent/Goal
To guide a manual or semi-automated research task: finding hospital affiliations for NYC providers.

## Components
- **Specific Target:** NYC providers in csv files.
- **Process:** Step-by-step search instructions (Google -> Hospital Website).
- **Target List:** Priority list of hospital systems (NYU, Mount Sinai, etc.).
- **Confidence Levels:** Definitions for High/Medium/Low confidence.
- **Output Format:** Specific Excel columns required.

## Gaps/Improvements
- **Input File:** References `C:\Users\breil\OneDrive\Desktop\NPI\nyc-providers only\...` which is outside the main project root. Ensure this path exists or is accessible.
- **Automation:** This prompt describes a manual process ("Search Google"). It could be upgraded to an automated script using `puppeteer` or Search APIs if scale is needed.

## Analysis
A clear, precise instruction set for a data enrichment task.

