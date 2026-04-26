/**
 * NPI Import Script
 *
 * Downloads and imports healthcare provider data from CMS NPPES (National Plan and Provider Enumeration System)
 * Focuses on osteoporosis-relevant specialties: endocrinology, rheumatology, orthopedics
 *
 * Usage:
 *   npm run import:npi -- --file ./data/npidata.csv
 *   npm run import:npi -- --states FL,CA --download
 */

import { createReadStream, existsSync, createWriteStream } from 'fs';
import { mkdir, stat } from 'fs/promises';
import { parse } from 'csv-parse';
import { pipeline } from 'stream/promises';
import { PrismaClient, EntityType, SpecialtyCategory, NpiStatus, SyncStatus, DataSource, SyncType } from '@prisma/client';
import { createHash } from 'crypto';
import path from 'path';
import https from 'https';
import http from 'http';
import { preImportCheck } from './pre-import-check';

// Load environment variables
import 'dotenv/config';

const prisma = new PrismaClient();

// Taxonomy codes for osteoporosis-relevant specialties
const TAXONOMY_MAPPINGS: Record<string, SpecialtyCategory> = {
  // Endocrinology
  '207RE0101X': SpecialtyCategory.ENDOCRINOLOGY, // Endocrinology, Diabetes & Metabolism
  '207RI0011X': SpecialtyCategory.ENDOCRINOLOGY, // Internal Medicine - Endocrinology
  '261QE0700X': SpecialtyCategory.ENDOCRINOLOGY, // Clinic/Center - Endocrinology

  // Rheumatology
  '207RR0500X': SpecialtyCategory.RHEUMATOLOGY, // Internal Medicine - Rheumatology
  '261QR0401X': SpecialtyCategory.RHEUMATOLOGY, // Clinic/Center - Rheumatology

  // Orthopedics
  '207X00000X': SpecialtyCategory.ORTHOPEDICS, // Orthopaedic Surgery
  '207XS0114X': SpecialtyCategory.ORTHOPEDICS, // Adult Reconstructive Orthopaedic Surgery
  '207XS0106X': SpecialtyCategory.ORTHOPEDICS, // Hand Surgery (Orthopaedic)
  '207XS0117X': SpecialtyCategory.ORTHOPEDICS, // Orthopaedic Surgery of the Spine
  '207XX0004X': SpecialtyCategory.ORTHOPEDICS, // Orthopaedic Foot and Ankle Surgery
  '207XX0005X': SpecialtyCategory.ORTHOPEDICS, // Sports Medicine (Orthopaedic)
  '207XX0801X': SpecialtyCategory.ORTHOPEDICS, // Orthopaedic Trauma
  '261QM1200X': SpecialtyCategory.ORTHOPEDICS, // Clinic/Center - Magnetic Resonance Imaging (MRI)

  // Internal Medicine (relevant for osteoporosis management)
  '207R00000X': SpecialtyCategory.INTERNAL_MEDICINE, // Internal Medicine
  '207RI0200X': SpecialtyCategory.INTERNAL_MEDICINE, // Infectious Disease

  // Family Medicine
  '207Q00000X': SpecialtyCategory.FAMILY_MEDICINE, // Family Medicine
  '207QA0505X': SpecialtyCategory.FAMILY_MEDICINE, // Adult Medicine

  // Geriatrics
  '207QG0300X': SpecialtyCategory.GERIATRICS, // Geriatric Medicine (Family Medicine)
  '207RG0300X': SpecialtyCategory.GERIATRICS, // Geriatric Medicine (Internal Medicine)
};

// Get all relevant taxonomy codes
const RELEVANT_TAXONOMY_CODES = new Set(Object.keys(TAXONOMY_MAPPINGS));

// NPI CSV column mappings (based on NPPES Data Dissemination file layout)
interface NPIRecord {
  NPI: string;
  'Entity Type Code': string;
  'Provider Organization Name (Legal Business Name)': string;
  'Provider Last Name (Legal Name)': string;
  'Provider First Name': string;
  'Provider Middle Name': string;
  'Provider Credential Text': string;
  'Provider First Line Business Practice Location Address': string;
  'Provider Second Line Business Practice Location Address': string;
  'Provider Business Practice Location Address City Name': string;
  'Provider Business Practice Location Address State Name': string;
  'Provider Business Practice Location Address Postal Code': string;
  'Provider Business Practice Location Address Country Code (If outside U.S.)': string;
  'Provider Business Practice Location Address Telephone Number': string;
  'Provider Business Practice Location Address Fax Number': string;
  'Provider Enumeration Date': string;
  'Last Update Date': string;
  'NPI Deactivation Date': string;
  'NPI Reactivation Date': string;
  'Healthcare Provider Taxonomy Code_1': string;
  'Healthcare Provider Taxonomy Code_2': string;
  'Healthcare Provider Taxonomy Code_3': string;
  'Healthcare Provider Taxonomy Code_4': string;
  'Healthcare Provider Taxonomy Code_5': string;
  'Provider License Number_1': string;
  'Provider License Number State Code_1': string;
  [key: string]: string;
}

interface ImportOptions {
  filePath?: string;
  states?: string[];
  batchSize?: number;
  downloadUrl?: string;
  filterSpecialties?: boolean;
}

interface ImportStats {
  totalRecords: number;
  processedRecords: number;
  insertedRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  errorRecords: number;
  errors: Array<{ npi: string; error: string }>;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  // NPI dates are in MM/DD/YYYY format
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // Try ISO format
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
}

function cleanPhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned : null;
}

function getSpecialtyCategory(taxonomyCode: string): SpecialtyCategory | null {
  return TAXONOMY_MAPPINGS[taxonomyCode] || null;
}

function isRelevantProvider(record: NPIRecord, filterSpecialties: boolean): boolean {
  if (!filterSpecialties) return true;

  // Check all taxonomy code columns (1-15)
  for (let i = 1; i <= 15; i++) {
    const taxonomyCode = record[`Healthcare Provider Taxonomy Code_${i}`];
    if (taxonomyCode && RELEVANT_TAXONOMY_CODES.has(taxonomyCode)) {
      return true;
    }
  }
  return false;
}

function extractSecondaryTaxonomies(record: NPIRecord): string[] {
  const taxonomies: string[] = [];
  for (let i = 2; i <= 15; i++) {
    const code = record[`Healthcare Provider Taxonomy Code_${i}`];
    if (code && code.trim()) {
      taxonomies.push(code.trim());
    }
  }
  return taxonomies;
}

function getTaxonomyDescription(code: string): string | null {
  // Basic taxonomy descriptions for our relevant specialties
  const descriptions: Record<string, string> = {
    '207RE0101X': 'Endocrinology, Diabetes & Metabolism',
    '207RI0011X': 'Internal Medicine - Endocrinology',
    '261QE0700X': 'Clinic/Center - Endocrinology',
    '207RR0500X': 'Internal Medicine - Rheumatology',
    '261QR0401X': 'Clinic/Center - Rheumatology',
    '207X00000X': 'Orthopaedic Surgery',
    '207XS0114X': 'Adult Reconstructive Orthopaedic Surgery',
    '207XS0106X': 'Hand Surgery (Orthopaedic)',
    '207XS0117X': 'Orthopaedic Surgery of the Spine',
    '207XX0004X': 'Orthopaedic Foot and Ankle Surgery',
    '207XX0005X': 'Sports Medicine (Orthopaedic)',
    '207XX0801X': 'Orthopaedic Trauma',
    '207R00000X': 'Internal Medicine',
    '207Q00000X': 'Family Medicine',
    '207QG0300X': 'Geriatric Medicine (Family Medicine)',
    '207RG0300X': 'Geriatric Medicine (Internal Medicine)',
  };
  return descriptions[code] || null;
}

async function downloadNPIFile(url: string, destPath: string): Promise<void> {
  console.log(`Downloading NPI data from ${url}...`);

  await mkdir(path.dirname(destPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const file = createWriteStream(destPath);
    const protocol = url.startsWith('https') ? https : http;

    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirect
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          file.close();
          downloadNPIFile(redirectUrl, destPath).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          const progress = ((downloadedSize / totalSize) * 100).toFixed(1);
          process.stdout.write(`\rDownloading: ${progress}%`);
        }
      });

      pipeline(response, file)
        .then(() => {
          console.log('\nDownload complete.');
          resolve();
        })
        .catch(reject);
    }).on('error', reject);
  });
}

async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);

    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function importNPIData(options: ImportOptions): Promise<ImportStats> {
  const {
    filePath,
    states,
    batchSize = 1000,
    filterSpecialties = true,
  } = options;

  if (!filePath || !existsSync(filePath)) {
    throw new Error(`NPI data file not found: ${filePath}`);
  }

  const fileStats = await stat(filePath);
  const fileHash = await calculateFileHash(filePath);

  // Create sync log entry
  const syncLog = await prisma.syncLog.create({
    data: {
      syncType: SyncType.NPI_FULL,
      dataSource: DataSource.CMS_NPPES,
      sourceFileName: path.basename(filePath),
      sourceFileHash: fileHash,
      sourceFileSize: BigInt(fileStats.size),
      sourceFileDate: fileStats.mtime,
      status: SyncStatus.IN_PROGRESS,
      filterCriteria: {
        states: states || [],
        filterSpecialties,
        relevantTaxonomyCodes: Array.from(RELEVANT_TAXONOMY_CODES),
      },
    },
  });

  const stats: ImportStats = {
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    updatedRecords: 0,
    skippedRecords: 0,
    errorRecords: 0,
    errors: [],
  };

  const batch: Array<{
    npi: string;
    data: Parameters<typeof prisma.provider.upsert>[0]['create'];
  }> = [];

  console.log(`\nStarting NPI import from: ${filePath}`);
  console.log(`Filtering for states: ${states?.join(', ') || 'ALL'}`);
  console.log(`Filtering for specialties: ${filterSpecialties ? 'Yes' : 'No'}`);
  console.log(`Batch size: ${batchSize}`);
  console.log(`\n⚠️  Import running with enrichment protection — only NPI-sourced fields will be updated on existing records\n`);

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })
  );

  async function processBatch() {
    if (batch.length === 0) return;

    const operations = batch.map(({ npi, data }) =>
      prisma.provider.upsert({
        where: { npi },
        create: data,
        update: {
          // Only update NPI-sourced fields — never overwrite enrichment data
          // Address and phone fields only set on CREATE — enrichment may have better data
          entityType: data.entityType,
          firstName: data.firstName,
          lastName: data.lastName,
          middleName: data.middleName,
          credential: data.credential,
          organizationName: data.organizationName,
          taxonomyCode: data.taxonomyCode,
          taxonomyDescription: data.taxonomyDescription,
          specialtyCategory: data.specialtyCategory,
          secondaryTaxonomies: data.secondaryTaxonomies,
          enumerationDate: data.enumerationDate,
          lastUpdateDate: data.lastUpdateDate,
          deactivationDate: data.deactivationDate,
          reactivationDate: data.reactivationDate,
          npiStatus: data.npiStatus,
          nppesLastSynced: new Date(),
        },
      })
    );

    try {
      const results = await prisma.$transaction(operations);

      // Count inserts vs updates (simplified - assumes upsert creates if not exists)
      stats.insertedRecords += results.length;
    } catch (error) {
      // If batch fails, try individual records
      for (const { npi, data } of batch) {
        try {
          await prisma.provider.upsert({
            where: { npi },
            create: data,
            update: {
              // Only update NPI-sourced fields — never overwrite enrichment data
              // Address and phone fields only set on CREATE — enrichment may have better data
              entityType: data.entityType,
              firstName: data.firstName,
              lastName: data.lastName,
              middleName: data.middleName,
              credential: data.credential,
              organizationName: data.organizationName,
              taxonomyCode: data.taxonomyCode,
              taxonomyDescription: data.taxonomyDescription,
              specialtyCategory: data.specialtyCategory,
              secondaryTaxonomies: data.secondaryTaxonomies,
              enumerationDate: data.enumerationDate,
              lastUpdateDate: data.lastUpdateDate,
              deactivationDate: data.deactivationDate,
              reactivationDate: data.reactivationDate,
              npiStatus: data.npiStatus,
              nppesLastSynced: new Date(),
            },
          });
          stats.insertedRecords++;
        } catch (recordError) {
          stats.errorRecords++;
          stats.errors.push({
            npi,
            error: recordError instanceof Error ? recordError.message : 'Unknown error',
          });
        }
      }
    }

    batch.length = 0;
  }

  for await (const record of parser as AsyncIterable<NPIRecord>) {
    stats.totalRecords++;

    // Progress logging
    if (stats.totalRecords % 100000 === 0) {
      console.log(`Processed ${stats.totalRecords.toLocaleString()} records...`);
    }

    // Filter by state if specified
    const providerState = record['Provider Business Practice Location Address State Name'];
    if (states && states.length > 0 && !states.includes(providerState)) {
      stats.skippedRecords++;
      continue;
    }

    // Filter by specialty if enabled
    if (!isRelevantProvider(record, filterSpecialties)) {
      stats.skippedRecords++;
      continue;
    }

    stats.processedRecords++;

    const npi = record['NPI'];
    const entityTypeCode = record['Entity Type Code'];
    const primaryTaxonomy = record['Healthcare Provider Taxonomy Code_1'];

    try {
      const providerData = {
        npi,
        entityType: entityTypeCode === '1' ? EntityType.INDIVIDUAL : EntityType.ORGANIZATION,

        // Names
        firstName: record['Provider First Name'] || null,
        lastName: record['Provider Last Name (Legal Name)'] || null,
        middleName: record['Provider Middle Name'] || null,
        credential: record['Provider Credential Text'] || null,
        organizationName: record['Provider Organization Name (Legal Business Name)'] || null,

        // Address
        addressLine1: record['Provider First Line Business Practice Location Address'] || '',
        addressLine2: record['Provider Second Line Business Practice Location Address'] || null,
        city: record['Provider Business Practice Location Address City Name'] || '',
        state: providerState || '',
        zip: (record['Provider Business Practice Location Address Postal Code'] || '').substring(0, 10),
        country: record['Provider Business Practice Location Address Country Code (If outside U.S.)'] || 'US',

        // Contact
        phone: cleanPhone(record['Provider Business Practice Location Address Telephone Number']),
        fax: cleanPhone(record['Provider Business Practice Location Address Fax Number']),

        // Taxonomy
        taxonomyCode: primaryTaxonomy || null,
        taxonomyDescription: getTaxonomyDescription(primaryTaxonomy),
        specialtyCategory: getSpecialtyCategory(primaryTaxonomy),
        secondaryTaxonomies: extractSecondaryTaxonomies(record),

        // Dates
        enumerationDate: parseDate(record['Provider Enumeration Date']),
        lastUpdateDate: parseDate(record['Last Update Date']),
        deactivationDate: parseDate(record['NPI Deactivation Date']),
        reactivationDate: parseDate(record['NPI Reactivation Date']),
        npiStatus: record['NPI Deactivation Date'] && !record['NPI Reactivation Date']
          ? NpiStatus.DEACTIVATED
          : NpiStatus.ACTIVE,
      };

      batch.push({ npi, data: providerData });

      if (batch.length >= batchSize) {
        await processBatch();
        process.stdout.write(`\rInserted: ${stats.insertedRecords.toLocaleString()} | Errors: ${stats.errorRecords}`);
      }
    } catch (error) {
      stats.errorRecords++;
      if (stats.errors.length < 100) {
        stats.errors.push({
          npi,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  // Process remaining batch
  await processBatch();

  // Update sync log
  await prisma.syncLog.update({
    where: { id: syncLog.id },
    data: {
      status: stats.errorRecords > 0 && stats.insertedRecords === 0
        ? SyncStatus.FAILED
        : SyncStatus.COMPLETED,
      completedAt: new Date(),
      totalRecords: stats.totalRecords,
      processedRecords: stats.processedRecords,
      insertedRecords: stats.insertedRecords,
      updatedRecords: stats.updatedRecords,
      skippedRecords: stats.skippedRecords,
      errorRecords: stats.errorRecords,
      errorLog: stats.errors.length > 0 ? stats.errors : undefined,
    },
  });

  return stats;
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);

  const options: ImportOptions = {
    batchSize: 1000,
    filterSpecialties: true,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
      case '-f':
        options.filePath = args[++i];
        break;
      case '--states':
      case '-s':
        options.states = args[++i]?.split(',').map(s => s.trim().toUpperCase());
        break;
      case '--batch-size':
      case '-b':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--all-specialties':
        options.filterSpecialties = false;
        break;
      case '--download':
      case '-d':
        options.downloadUrl = args[++i] || 'https://download.cms.gov/nppes/NPPES_Data_Dissemination_December_2024.zip';
        break;
      case '--help':
      case '-h':
        console.log(`
NPI Import Script

Usage: npm run import:npi -- [options]

Options:
  --file, -f <path>       Path to NPI CSV file (required)
  --states, -s <states>   Comma-separated state codes to filter (e.g., FL,CA,NY)
  --batch-size, -b <n>    Batch size for bulk inserts (default: 1000)
  --all-specialties       Import all specialties (default: osteoporosis-relevant only)
  --help, -h              Show this help message

Examples:
  npm run import:npi -- --file ./data/npidata.csv
  npm run import:npi -- --file ./data/npidata.csv --states FL,CA
  npm run import:npi -- --file ./data/npidata.csv --states FL --all-specialties

Relevant Specialties (default filter):
  - Endocrinology
  - Rheumatology
  - Orthopedics
  - Internal Medicine
  - Family Medicine
  - Geriatrics
        `);
        process.exit(0);
    }
  }

  if (!options.filePath) {
    console.error('Error: --file option is required');
    console.error('Run with --help for usage information');
    process.exit(1);
  }

  try {
    console.log('Healthcare Provider NPI Import');
    console.log('==============================\n');

    // Run pre-import safety check
    await preImportCheck(process.env.DATABASE_URL!);

    const stats = await importNPIData(options);

    console.log('\n\nImport Complete!');
    console.log('================');
    console.log(`Total records in file:  ${stats.totalRecords.toLocaleString()}`);
    console.log(`Records processed:      ${stats.processedRecords.toLocaleString()}`);
    console.log(`Records inserted:       ${stats.insertedRecords.toLocaleString()}`);
    console.log(`Records skipped:        ${stats.skippedRecords.toLocaleString()}`);
    console.log(`Records with errors:    ${stats.errorRecords.toLocaleString()}`);

    if (stats.errors.length > 0) {
      console.log('\nFirst 10 errors:');
      stats.errors.slice(0, 10).forEach(err => {
        console.log(`  NPI ${err.npi}: ${err.error}`);
      });
    }
  } catch (error) {
    console.error('\nImport failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
