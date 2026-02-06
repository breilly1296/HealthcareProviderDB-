/**
 * Import Insurance Plans from Hospital Website Scrapes
 *
 * Reads CSV files containing provider-plan data extracted via Gemini
 * and imports them into the database.
 *
 * Usage:
 *   npx ts-node src/scripts/importInsurancePlans.ts <csv-file-path> [--health-system <name>]
 *
 * Example:
 *   npx ts-node src/scripts/importInsurancePlans.ts ./data/mount-sinai-insurance.csv --health-system "Mount Sinai"
 */

import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import { parsePlanList, generatePlanId, ParsedInsurancePlan } from '../utils/insurancePlanParser';

const prisma = new PrismaClient();

// Confidence score for hospital website scrapes (reliable source)
const HOSPITAL_SCRAPE_CONFIDENCE = 70;

interface CsvRow {
  NPI?: string;
  npi?: string;
  Provider_Name?: string;
  provider_name?: string;
  Insurance_Plans?: string;
  insurance_plans?: string;
  Accepted_Insurance?: string;
  accepted_insurance?: string;
}

interface ImportStats {
  totalRows: number;
  processedRows: number;
  newPlans: number;
  updatedPlans: number;
  newAcceptances: number;
  updatedAcceptances: number;
  errors: number;
  skippedNoNpi: number;
  skippedNoPlans: number;
}

/**
 * Parse a CSV line respecting quoted fields
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i++;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

/**
 * Parse a CSV file into rows
 * Handles quoted fields with commas inside
 */
function parseCsv(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/).filter(line => line.trim());

  if (lines.length === 0) {
    return [];
  }

  // Parse header
  const headers = parseCsvLine(lines[0]);

  // Parse rows
  const rows: CsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row: CsvRow = {};

    headers.forEach((header, idx) => {
      if (values[idx] !== undefined) {
        (row as Record<string, string>)[header] = values[idx];
      }
    });

    rows.push(row);
  }

  return rows;
}

/**
 * Extract plan type from variant (HMO, PPO, etc.)
 */
function extractPlanType(variant: string | null): string | null {
  if (!variant) return null;

  const normalized = variant.toUpperCase();
  if (normalized === 'HMO' || normalized.includes('HMO')) return 'HMO';
  if (normalized === 'PPO' || normalized.includes('PPO')) return 'PPO';
  if (normalized === 'EPO' || normalized.includes('EPO')) return 'EPO';
  if (normalized === 'POS' || normalized.includes('POS')) return 'POS';
  if (normalized.includes('MEDICARE')) return 'MEDICARE';
  if (normalized.includes('MEDICAID')) return 'MEDICAID';

  return null;
}

/**
 * Upsert an insurance plan
 * Returns the planId (which is the primary key)
 */
async function upsertPlan(parsed: ParsedInsurancePlan, healthSystem: string): Promise<{ planId: string; isNew: boolean }> {
  const planId = generatePlanId(parsed);

  const existing = await prisma.insurancePlan.findUnique({
    where: { planId },
  });

  if (existing) {
    // Update providerCount will happen separately
    return { planId: existing.planId, isNew: false };
  }

  // Truncate fields to fit in their VarChar limits
  const planName = parsed.rawName.substring(0, 200);

  const plan = await prisma.insurancePlan.create({
    data: {
      planId,
      planName,
      issuerName: parsed.carrier.substring(0, 200),
      planType: extractPlanType(parsed.planVariant)?.substring(0, 20) || null,
      state: 'NY', // Default to NY for health system data
      // New Gemini-scraped fields
      carrier: parsed.carrier.substring(0, 100),
      planVariant: parsed.planVariant?.substring(0, 50) || null,
      rawName: parsed.rawName.substring(0, 500),
      sourceHealthSystem: healthSystem.substring(0, 200),
      providerCount: 0,
    },
  });

  return { planId: plan.planId, isNew: true };
}

/**
 * Increment provider count for a plan
 */
async function incrementProviderCount(planId: string): Promise<void> {
  await prisma.insurancePlan.update({
    where: { planId },
    data: {
      providerCount: { increment: 1 },
    },
  });
}

/**
 * Create or update provider-plan acceptance
 */
async function upsertAcceptance(
  providerNpi: string,
  planId: string
): Promise<boolean> {
  const existing = await prisma.providerPlanAcceptance.findFirst({
    where: {
      providerNpi,
      planId,
      locationId: null,
    },
  });

  if (existing) {
    // Update confidence if new source is better
    if ((existing.confidenceScore || 0) < HOSPITAL_SCRAPE_CONFIDENCE) {
      await prisma.providerPlanAcceptance.update({
        where: { id: existing.id },
        data: {
          confidenceScore: HOSPITAL_SCRAPE_CONFIDENCE,
          acceptanceStatus: 'ACCEPTED',
          lastVerified: new Date(),
        },
      });
    }
    return false; // Not a new record
  }

  await prisma.providerPlanAcceptance.create({
    data: {
      providerNpi,
      planId,
      acceptanceStatus: 'ACCEPTED',
      confidenceScore: HOSPITAL_SCRAPE_CONFIDENCE,
      lastVerified: new Date(),
      verificationCount: 1,
    },
  });

  return true; // New record
}

/**
 * Main import function
 */
async function importInsurancePlans(
  csvPath: string,
  healthSystem: string
): Promise<ImportStats> {
  const stats: ImportStats = {
    totalRows: 0,
    processedRows: 0,
    newPlans: 0,
    updatedPlans: 0,
    newAcceptances: 0,
    updatedAcceptances: 0,
    errors: 0,
    skippedNoNpi: 0,
    skippedNoPlans: 0,
  };

  console.log(`\nImporting insurance plans from: ${csvPath}`);
  console.log(`Health System: ${healthSystem}`);
  console.log('-------------------------------------------\n');

  // Parse CSV
  const rows = parseCsv(csvPath);
  stats.totalRows = rows.length;
  console.log(`Found ${rows.length} rows in CSV\n`);

  // Track unique plans for counting
  const planCounts = new Map<string, { planId: string; isNew: boolean }>();

  for (const row of rows) {
    const npi = row.NPI || row.npi;
    const plansString = row.Insurance_Plans || row.insurance_plans ||
                        row.Accepted_Insurance || row.accepted_insurance;

    // Skip rows without NPI
    if (!npi || npi.length !== 10) {
      stats.skippedNoNpi++;
      continue;
    }

    // Skip rows without plans
    if (!plansString || !plansString.trim() || plansString === 'NOT_FOUND') {
      stats.skippedNoPlans++;
      continue;
    }

    // Check if provider exists
    const provider = await prisma.provider.findUnique({
      where: { npi },
      select: { npi: true },
    });

    if (!provider) {
      // Provider not in database, skip
      stats.errors++;
      continue;
    }

    try {
      // Parse plans
      const parsedPlans = parsePlanList(plansString);

      for (const parsed of parsedPlans) {
        const planIdKey = generatePlanId(parsed);

        // Check if we've already processed this plan in this import session
        let planInfo = planCounts.get(planIdKey);

        if (!planInfo) {
          // Upsert the plan with health system info
          const result = await upsertPlan(parsed, healthSystem);
          planInfo = { planId: result.planId, isNew: result.isNew };
          planCounts.set(planIdKey, planInfo);

          if (result.isNew) {
            stats.newPlans++;
          } else {
            stats.updatedPlans++;
          }
        }

        // Create acceptance record
        const isNewAcceptance = await upsertAcceptance(npi, planInfo.planId);
        if (isNewAcceptance) {
          stats.newAcceptances++;
          // Increment provider count on the plan
          await incrementProviderCount(planInfo.planId);
        } else {
          stats.updatedAcceptances++;
        }
      }

      stats.processedRows++;

      // Progress logging
      if (stats.processedRows % 100 === 0) {
        console.log(`Processed ${stats.processedRows}/${stats.totalRows} rows...`);
      }
    } catch (error) {
      console.error(`Error processing NPI ${npi}:`, error);
      stats.errors++;
    }
  }

  return stats;
}

/**
 * CLI entry point
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length < 1) {
    console.log('Usage: npx ts-node src/scripts/importInsurancePlans.ts <csv-file> [--health-system <name>]');
    console.log('');
    console.log('Example:');
    console.log('  npx ts-node src/scripts/importInsurancePlans.ts ./data/mount-sinai.csv --health-system "Mount Sinai"');
    process.exit(1);
  }

  const csvPath = args[0];
  let healthSystem = 'Unknown';

  // Parse --health-system flag
  const hsIndex = args.indexOf('--health-system');
  if (hsIndex !== -1 && args[hsIndex + 1]) {
    healthSystem = args[hsIndex + 1];
  }

  // Validate file exists
  const absolutePath = path.isAbsolute(csvPath) ? csvPath : path.join(process.cwd(), csvPath);
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: File not found: ${absolutePath}`);
    process.exit(1);
  }

  try {
    const stats = await importInsurancePlans(absolutePath, healthSystem);

    console.log('\n===========================================');
    console.log('Import Complete!');
    console.log('===========================================');
    console.log(`Total rows in CSV:      ${stats.totalRows}`);
    console.log(`Processed rows:         ${stats.processedRows}`);
    console.log(`Skipped (no NPI):       ${stats.skippedNoNpi}`);
    console.log(`Skipped (no plans):     ${stats.skippedNoPlans}`);
    console.log(`Errors:                 ${stats.errors}`);
    console.log('-------------------------------------------');
    console.log(`New plans created:      ${stats.newPlans}`);
    console.log(`Plans updated:          ${stats.updatedPlans}`);
    console.log(`New acceptances:        ${stats.newAcceptances}`);
    console.log(`Acceptances updated:    ${stats.updatedAcceptances}`);
    console.log('===========================================\n');
  } catch (error) {
    console.error('Import failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run if executed directly
if (require.main === module) {
  main();
}

export { importInsurancePlans, parseCsv };
