/**
 * NPI Import Script (Direct PostgreSQL version - no Prisma)
 * For Windows ARM64 compatibility
 */

import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import { parse } from 'csv-parse';
import { createHash } from 'crypto';
import path from 'path';
import pg from 'pg';

const { Pool, Client } = pg;

// Prefix-based taxonomy to specialty mappings (ordered by specificity - longest first)
const PREFIX_MAPPINGS: [string, string][] = [
  // Specific mappings first (longer prefixes)
  ['207RH0003', 'ONCOLOGY'],
  ['207RG0100', 'GASTROENTEROLOGY'],
  ['207RI0200', 'INFECTIOUS_DISEASE'],
  ['207RI0011', 'ENDOCRINOLOGY'],
  ['261QE0700', 'ENDOCRINOLOGY'],
  ['261QR0401', 'RHEUMATOLOGY'],
  ['207RG0300', 'GERIATRICS'],
  ['207RC', 'CARDIOLOGY'],
  ['2084N', 'NEUROLOGY'],
  ['207RX', 'ONCOLOGY'],
  ['207RP', 'PULMONOLOGY'],
  ['207RN', 'NEPHROLOGY'],
  ['207RE', 'ENDOCRINOLOGY'],
  ['207RR', 'RHEUMATOLOGY'],
  ['207QG', 'GERIATRICS'],
  ['247100', 'RADIOLOGY'],

  // Mental Health & Behavioral
  ['101Y', 'MENTAL_HEALTH'],
  ['103', 'PSYCHOLOGY'],
  ['104', 'SOCIAL_WORK'],
  ['106', 'MENTAL_HEALTH'],
  ['2084', 'PSYCHIATRY'],
  ['373', 'MENTAL_HEALTH'],

  // Nursing
  ['163W', 'NURSING'],
  ['164', 'NURSING'],
  ['363L', 'NURSE_PRACTITIONER'],
  ['363A', 'PHYSICIAN_ASSISTANT'],

  // Dental & Vision
  ['122', 'DENTISTRY'],
  ['124', 'DENTISTRY'],
  ['125', 'DENTISTRY'],
  ['126', 'DENTISTRY'],
  ['152W', 'OPTOMETRY'],
  ['156', 'OPTOMETRY'],

  // Pharmacy
  ['183', 'PHARMACY'],
  ['331', 'PHARMACY'],
  ['332', 'PHARMACY'],
  ['333', 'PHARMACY'],

  // Therapy
  ['2251', 'PHYSICAL_THERAPY'],
  ['2252', 'PHYSICAL_THERAPY'],
  ['225X', 'OCCUPATIONAL_THERAPY'],
  ['224Z', 'OCCUPATIONAL_THERAPY'],
  ['2257', 'SPEECH_THERAPY'],
  ['235', 'SPEECH_THERAPY'],
  ['237', 'SPEECH_THERAPY'],
  ['367', 'RESPIRATORY_THERAPY'],
  ['111N', 'CHIROPRACTIC'],
  ['1711', 'ACUPUNCTURE'],

  // Medical Specialties
  ['207P', 'EMERGENCY_MEDICINE'],
  ['2080', 'PEDIATRICS'],
  ['207L', 'ANESTHESIOLOGY'],
  ['2086', 'SURGERY'],
  ['208G', 'SURGERY'],
  ['207V', 'OB_GYN'],
  ['2085', 'RADIOLOGY'],
  ['207N', 'DERMATOLOGY'],
  ['2088', 'UROLOGY'],
  ['207K', 'ALLERGY_IMMUNOLOGY'],
  ['207Z', 'PATHOLOGY'],
  ['207X', 'ORTHOPEDICS'],
  ['207Q', 'FAMILY_MEDICINE'],
  ['207R', 'INTERNAL_MEDICINE'],

  // Support Services
  ['133', 'DIETETICS'],
  ['136', 'DIETETICS'],
  ['374', 'LAB_PATHOLOGY'],
  ['246', 'LAB_PATHOLOGY'],
  ['247', 'LAB_PATHOLOGY'],
  ['291', 'LAB_PATHOLOGY'],
  ['292', 'LAB_PATHOLOGY'],
  ['293', 'LAB_PATHOLOGY'],
  ['310', 'DME_PROSTHETICS'],
  ['332B', 'DME_PROSTHETICS'],
  ['335', 'DME_PROSTHETICS'],
  ['172V', 'COMMUNITY_HEALTH'],
  ['251', 'COMMUNITY_HEALTH'],
  ['171M', 'MIDWIFERY'],
  ['176B', 'MIDWIFERY'],
  ['315', 'HOSPICE_PALLIATIVE'],

  // Facilities
  ['261Q', 'CLINIC_FACILITY'],
  ['193', 'CLINIC_FACILITY'],
  ['390', 'CLINIC_FACILITY'],
  ['27', 'HOSPITAL'],
  ['28', 'HOSPITAL'],
  ['31', 'HOME_HEALTH'],
];

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
  [key: string]: string;
}

interface ImportStats {
  totalRecords: number;
  processedRecords: number;
  insertedRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  errorRecords: number;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) return isoDate;
  return null;
}

function cleanPhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned : null;
}

function getSpecialtyCategory(taxonomyCode: string | null | undefined): string {
  if (!taxonomyCode) return 'OTHER';

  // Sort by prefix length (longest first) for correct matching
  const sortedMappings = [...PREFIX_MAPPINGS].sort((a, b) => b[0].length - a[0].length);

  for (const [prefix, category] of sortedMappings) {
    if (taxonomyCode.startsWith(prefix)) {
      return category;
    }
  }
  return 'OTHER';
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

async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

async function importNPIData(filePath: string, databaseUrl: string): Promise<ImportStats> {
  if (!existsSync(filePath)) {
    throw new Error(`NPI data file not found: ${filePath}`);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
  });
  const fileStats = await stat(filePath);
  const fileHash = await calculateFileHash(filePath);
  const startTime = Date.now();

  // Create sync log entry
  const syncLogResult = await pool.query(`
    INSERT INTO sync_logs ("id", "syncType", "dataSource", "sourceFileName", "sourceFileHash",
      "sourceFileSize", "sourceFileDate", "status", "filterCriteria", "startedAt")
    VALUES (gen_random_uuid(), 'NPI_FULL', 'CMS_NPPES', $1, $2, $3, $4, 'IN_PROGRESS', $5, NOW())
    RETURNING id
  `, [
    path.basename(filePath),
    fileHash,
    fileStats.size,
    fileStats.mtime,
    JSON.stringify({ filterSpecialties: false, importAll: true })
  ]);
  const syncLogId = syncLogResult.rows[0].id;

  const stats: ImportStats = {
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    updatedRecords: 0,
    skippedRecords: 0,
    errorRecords: 0,
  };

  console.log(`\nStarting NPI import from: ${filePath}`);
  console.log(`File size: ${(fileStats.size / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Importing ALL providers (no specialty filter)\n`);

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })
  );

  const batchSize = 100;
  let batch: any[] = [];

  async function processBatch(retryCount = 0): Promise<void> {
    if (batch.length === 0) return;

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      for (const record of batch) {
        try {
          await client.query(`
            INSERT INTO providers (
              id, npi, "entityType", "firstName", "lastName", "middleName", credential,
              "organizationName", "addressLine1", "addressLine2", city, state, zip, country,
              phone, fax, "taxonomyCode", "taxonomyDescription", "specialtyCategory",
              "secondaryTaxonomies", "enumerationDate", "lastUpdateDate", "deactivationDate",
              "reactivationDate", "npiStatus", "createdAt", "updatedAt"
            ) VALUES (
              gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
              $16, $17, $18, $19, $20, $21, $22, $23, $24, NOW(), NOW()
            )
            ON CONFLICT (npi) DO UPDATE SET
              "entityType" = EXCLUDED."entityType",
              "firstName" = EXCLUDED."firstName",
              "lastName" = EXCLUDED."lastName",
              "middleName" = EXCLUDED."middleName",
              credential = EXCLUDED.credential,
              "organizationName" = EXCLUDED."organizationName",
              "addressLine1" = EXCLUDED."addressLine1",
              "addressLine2" = EXCLUDED."addressLine2",
              city = EXCLUDED.city,
              state = EXCLUDED.state,
              zip = EXCLUDED.zip,
              country = EXCLUDED.country,
              phone = EXCLUDED.phone,
              fax = EXCLUDED.fax,
              "taxonomyCode" = EXCLUDED."taxonomyCode",
              "taxonomyDescription" = EXCLUDED."taxonomyDescription",
              "specialtyCategory" = EXCLUDED."specialtyCategory",
              "secondaryTaxonomies" = EXCLUDED."secondaryTaxonomies",
              "enumerationDate" = EXCLUDED."enumerationDate",
              "lastUpdateDate" = EXCLUDED."lastUpdateDate",
              "deactivationDate" = EXCLUDED."deactivationDate",
              "reactivationDate" = EXCLUDED."reactivationDate",
              "npiStatus" = EXCLUDED."npiStatus",
              "updatedAt" = NOW()
          `, [
            record.npi,
            record.entityType,
            record.firstName,
            record.lastName,
            record.middleName,
            record.credential,
            record.organizationName,
            record.addressLine1,
            record.addressLine2,
            record.city,
            record.state,
            record.zip,
            record.country,
            record.phone,
            record.fax,
            record.taxonomyCode,
            record.taxonomyDescription,
            record.specialtyCategory,
            JSON.stringify(record.secondaryTaxonomies),
            record.enumerationDate,
            record.lastUpdateDate,
            record.deactivationDate,
            record.reactivationDate,
            record.npiStatus
          ]);
          stats.insertedRecords++;
        } catch (err) {
          stats.errorRecords++;
        }
      }

      await client.query('COMMIT');
      batch = [];
    } catch (err: any) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch {}
      }
      // Retry on connection errors
      if (retryCount < 3 && (err.message?.includes('Connection') || err.message?.includes('timeout'))) {
        console.log(`\nConnection error, retrying batch (attempt ${retryCount + 1})...`);
        await new Promise(r => setTimeout(r, 2000));
        return processBatch(retryCount + 1);
      }
      stats.errorRecords += batch.length;
      batch = [];
    } finally {
      if (client) client.release();
    }
  }

  for await (const record of parser as AsyncIterable<NPIRecord>) {
    stats.totalRecords++;

    if (stats.totalRecords % 10000 === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      process.stdout.write(`\rProcessed: ${stats.totalRecords.toLocaleString()} | Imported: ${stats.insertedRecords.toLocaleString()} | Time: ${elapsed}s`);
    }

    stats.processedRecords++;

    const npi = record['NPI'];
    const entityTypeCode = record['Entity Type Code'];
    const primaryTaxonomy = record['Healthcare Provider Taxonomy Code_1'];

    const providerData = {
      npi,
      entityType: entityTypeCode === '1' ? 'INDIVIDUAL' : 'ORGANIZATION',
      firstName: record['Provider First Name'] || null,
      lastName: record['Provider Last Name (Legal Name)'] || null,
      middleName: record['Provider Middle Name'] || null,
      credential: record['Provider Credential Text'] || null,
      organizationName: record['Provider Organization Name (Legal Business Name)'] || null,
      addressLine1: record['Provider First Line Business Practice Location Address'] || '',
      addressLine2: record['Provider Second Line Business Practice Location Address'] || null,
      city: record['Provider Business Practice Location Address City Name'] || '',
      state: record['Provider Business Practice Location Address State Name'] || '',
      zip: (record['Provider Business Practice Location Address Postal Code'] || '').substring(0, 10),
      country: record['Provider Business Practice Location Address Country Code (If outside U.S.)'] || 'US',
      phone: cleanPhone(record['Provider Business Practice Location Address Telephone Number']),
      fax: cleanPhone(record['Provider Business Practice Location Address Fax Number']),
      taxonomyCode: primaryTaxonomy || null,
      taxonomyDescription: getTaxonomyDescription(primaryTaxonomy),
      specialtyCategory: getSpecialtyCategory(primaryTaxonomy),
      secondaryTaxonomies: extractSecondaryTaxonomies(record),
      enumerationDate: parseDate(record['Provider Enumeration Date']),
      lastUpdateDate: parseDate(record['Last Update Date']),
      deactivationDate: parseDate(record['NPI Deactivation Date']),
      reactivationDate: parseDate(record['NPI Reactivation Date']),
      npiStatus: record['NPI Deactivation Date'] && !record['NPI Reactivation Date'] ? 'DEACTIVATED' : 'ACTIVE',
    };

    batch.push(providerData);

    if (batch.length >= batchSize) {
      await processBatch();
    }
  }

  // Process remaining batch
  await processBatch();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write(`\rProcessed: ${stats.totalRecords.toLocaleString()} | Imported: ${stats.insertedRecords.toLocaleString()} | Time: ${elapsed}s\n`);

  // Update sync log
  await pool.query(`
    UPDATE sync_logs SET
      status = $1,
      "completedAt" = NOW(),
      "totalRecords" = $2,
      "processedRecords" = $3,
      "insertedRecords" = $4,
      "skippedRecords" = $5,
      "errorRecords" = $6
    WHERE id = $7
  `, [
    stats.errorRecords > 0 && stats.insertedRecords === 0 ? 'FAILED' : 'COMPLETED',
    stats.totalRecords,
    stats.processedRecords,
    stats.insertedRecords,
    stats.skippedRecords,
    stats.errorRecords,
    syncLogId
  ]);

  await pool.end();
  return stats;
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  let filePath: string | undefined;
  let databaseUrl: string | undefined = process.env.DATABASE_URL;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--file':
      case '-f':
        filePath = args[++i];
        break;
      case '--database':
      case '-d':
        databaseUrl = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
NPI Import Script (Direct PostgreSQL)

Usage: npx tsx scripts/import-npi-direct.ts -- [options]

Options:
  --file, -f <path>       Path to NPI CSV file (required)
  --database, -d <url>    Database URL (or set DATABASE_URL env)
  --help, -h              Show this help message
        `);
        process.exit(0);
    }
  }

  if (!filePath) {
    console.error('Error: --file option is required');
    process.exit(1);
  }

  if (!databaseUrl) {
    console.error('Error: DATABASE_URL environment variable or --database option is required');
    process.exit(1);
  }

  try {
    console.log('Healthcare Provider NPI Import (Direct PostgreSQL)');
    console.log('===================================================\n');

    const stats = await importNPIData(filePath, databaseUrl);

    console.log('\n\n┌─────────────────────────────────────┐');
    console.log('│         IMPORT COMPLETE             │');
    console.log('├─────────────────────────────────────┤');
    console.log(`│ Total records in file:  ${stats.totalRecords.toLocaleString().padStart(10)} │`);
    console.log(`│ Records matched filter: ${stats.processedRecords.toLocaleString().padStart(10)} │`);
    console.log(`│ Records imported:       ${stats.insertedRecords.toLocaleString().padStart(10)} │`);
    console.log(`│ Records skipped:        ${stats.skippedRecords.toLocaleString().padStart(10)} │`);
    console.log(`│ Records with errors:    ${stats.errorRecords.toLocaleString().padStart(10)} │`);
    console.log('└─────────────────────────────────────┘');

  } catch (error) {
    console.error('\nImport failed:', error);
    process.exit(1);
  }
}

main();
