# Insurance Plans

## Overview

Insurance plans are a core data dimension connecting providers to insurance networks. The feature enables users to search for plans, view which providers accept a given plan, and submit verifications for provider-plan acceptance. An AI-powered insurance card uploader allows users to identify their plan from a photo of their insurance card.

## Schema

### InsurancePlan

| Field | Type | Description |
|-------|------|-------------|
| `plan_id` | TEXT (PK) | Unique plan identifier |
| `planName` | TEXT | Display name of the plan |
| `issuerName` | TEXT | Insurance company name |
| `planType` | TEXT | Plan type (HMO, PPO, EPO, POS, etc.) |
| `state` | TEXT | State where the plan is offered |
| `carrier` | TEXT | Parent carrier/company |
| `planVariant` | TEXT | Variant identifier (Gold, Silver, etc.) |
| `rawName` | TEXT | Original unprocessed plan name from source data |
| `sourceHealthSystem` | TEXT | Health system that provided the plan data |
| `providerCount` | INTEGER | Number of providers accepting this plan |
| `carrierId` | TEXT | Foreign key to carrier reference |
| `healthSystemId` | TEXT | Foreign key to health system reference |

### ProviderPlanAcceptance

Links providers to insurance plans with verification metadata.

| Field | Type | Description |
|-------|------|-------------|
| `npi` + `planId` | UNIQUE | Composite unique constraint |
| `acceptanceStatus` | ENUM | Current acceptance status |
| `confidenceScore` | INTEGER | Confidence level 0-100 |
| `lastVerified` | TIMESTAMP | When acceptance was last verified |
| `verificationCount` | INTEGER | Number of verifications received |
| `expiresAt` | TIMESTAMP | TTL for the acceptance record |

## API Endpoints

### Plan Search and Discovery

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/plans/search` | Search plans with filters |
| `GET` | `/plans/grouped` | Get plans grouped by carrier |
| `GET` | `/plans/meta/issuers` | List all unique issuer names |
| `GET` | `/plans/meta/types` | List all unique plan types |
| `GET` | `/plans/:planId` | Get a single plan by ID |
| `GET` | `/plans/:planId/providers` | Get providers accepting a plan |

### GET /plans/search Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `issuerName` | string | Filter by insurance issuer |
| `planType` | string | Filter by plan type (HMO, PPO, etc.) |
| `search` | string | Free-text search across plan name and issuer |
| `state` | string | Filter by state |

## Data Import

### importInsurancePlans.ts

Script to import insurance plan data from CSV or structured data sources into the database.

### insurancePlanParser.ts

Parsing and normalization logic applied during import:

- **Name normalization** - Standardizes plan name formatting, removes extra whitespace, normalizes capitalization
- **Carrier identification** - Maps issuer names to parent carrier organizations (e.g., "Empire BlueCross BlueShield" maps to carrier "Anthem")
- **Variant extraction** - Parses metal tier or variant information from plan names (Gold, Silver, Bronze, Platinum, Catastrophic)

## Frontend

### Pages

| Route | Component | Description |
|-------|-----------|-------------|
| `/insurance` | InsurancePage | Main insurance plan search and browse page |

### Components

| Component | Description |
|-----------|-------------|
| `ProviderPlansSection` | Displays accepted plans on a provider's detail page |
| `InsuranceList` | Paginated list of insurance plans with filtering |
| `InsuranceCardUploader` | AI-powered insurance card photo upload and plan identification |

### InsuranceCardUploader

Uses the Anthropic Claude API (via the backend) to analyze a photo of a user's insurance card and identify the plan.

- User uploads or photographs their insurance card
- Image is sent to the backend, which forwards it to Claude for analysis
- Claude extracts the plan name, issuer, plan type, and member information
- The extracted plan is matched against the database to find the corresponding `InsurancePlan` record

### Client Utilities

| Module | Description |
|--------|-------------|
| `planApi` | API client functions for all plan-related endpoints |
| `useInsurancePlans` | React hook for fetching and managing plan data with loading/error states |
