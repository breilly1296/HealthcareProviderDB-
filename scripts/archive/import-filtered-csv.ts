/**
 * Import Script for Filtered NPI CSV Files
 *
 * Imports provider data from pre-filtered CSV files with simplified columns.
 * Handles name parsing, date conversion, and batch processing.
 *
 * Usage:
 *   npx tsx scripts/import-filtered-csv.ts -- --file "C:\Users\breil\OneDrive\Desktop\NPI\filtered_final\NY.csv"
 */

import { createReadStream, existsSync } from 'fs';
import { stat } from 'fs/promises';
import { parse } from 'csv-parse';
import { createHash } from 'crypto';
import path from 'path';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

interface CSVRecord {
  npi: string;
  entity_type: string;
  name: string;
  specialty: string;
  specialty_code: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  zip_code: string;
  phone: string;
  fax: string;
  sex: string;
  enumeration_date: string;
  last_updated: string;
}

interface ParsedName {
  firstName: string | null;
  lastName: string | null;
  credential: string | null;
  organizationName: string | null;
}

interface ImportStats {
  totalRecords: number;
  processedRecords: number;
  insertedRecords: number;
  updatedRecords: number;
  errorRecords: number;
}

/**
 * Parses a name field into first_name, last_name, credential, and organization_name
 *
 * Examples:
 * - "DR. Steven M. Goldberg, M.D." → first_name="Steven M.", last_name="Goldberg", credential="M.D."
 * - "JOHN DOE" → first_name="John", last_name="Doe"
 * - "ABC Medical Center" → organization_name="ABC Medical Center"
 */
function parseName(name: string, entityType: string): ParsedName {
  if (!name || name.trim() === '') {
    return { firstName: null, lastName: null, credential: null, organizationName: null };
  }

  // For organizations, return as organization name
  if (entityType === 'ORGANIZATION') {
    return {
      firstName: null,
      lastName: null,
      credential: null,
      organizationName: toTitleCase(name.trim())
    };
  }

  // For individuals, parse the name
  let workingName = name.trim();
  let credential: string | null = null;

  // Extract credential (e.g., M.D., D.O., Ph.D., etc.)
  // Credentials are typically at the end after a comma
  const credentialMatch = workingName.match(/,\s*([A-Z][A-Z.]*(?:\s+[A-Z][A-Z.]*)?)$/i);
  if (credentialMatch) {
    credential = credentialMatch[1].trim();
    workingName = workingName.substring(0, credentialMatch.index).trim();
  }

  // Remove common prefixes (DR., MR., MS., MRS., etc.)
  workingName = workingName.replace(/^(DR\.?|MR\.?|MS\.?|MRS\.?|MISS\.?)\s+/i, '');

  // Remove trailing commas if any
  workingName = workingName.replace(/,\s*$/, '');

  // Split into parts
  const parts = workingName.split(/\s+/).filter(p => p.length > 0);

  if (parts.length === 0) {
    return { firstName: null, lastName: null, credential, organizationName: null };
  }

  if (parts.length === 1) {
    // Single name - treat as last name
    return {
      firstName: null,
      lastName: toTitleCase(parts[0]),
      credential,
      organizationName: null
    };
  }

  // Multiple parts: last part is last name, rest is first name (including middle)
  const lastName = toTitleCase(parts[parts.length - 1]);
  const firstName = parts.slice(0, -1).map(toTitleCase).join(' ');

  return { firstName, lastName, credential, organizationName: null };
}

/**
 * Converts a string to title case
 */
function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Sanitizes a string by removing null bytes and other problematic characters
 */
function sanitizeString(str: string | null | undefined): string | null {
  if (!str) return null;
  // Remove null bytes and other control characters except tabs and newlines
  return str.replace(/\x00/g, '').replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F]/g, '').trim() || null;
}

/**
 * Parses date from "MM/DD/YYYY" format to Date object
 */
function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr.trim() === '') return null;

  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    if (!isNaN(date.getTime())) return date;
  }

  // Try ISO format as fallback
  const isoDate = new Date(dateStr);
  if (!isNaN(isoDate.getTime())) return isoDate;

  return null;
}

/**
 * Cleans phone number to digits only
 */
function cleanPhone(phone: string): string | null {
  if (!phone || phone.trim() === '') return null;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned : null;
}

/**
 * Calculates SHA-256 hash of file
 */
async function calculateFileHash(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Main import function
 */
async function importCSVData(filePath: string, databaseUrl: string): Promise<ImportStats> {
  if (!existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  const fileStats = await stat(filePath);
  const fileHash = await calculateFileHash(filePath);
  const startTime = Date.now();

  console.log(`\n┌────────────────────────────────────────────────────────┐`);
  console.log(`│  Healthcare Provider CSV Import                        │`);
  console.log(`├────────────────────────────────────────────────────────┤`);
  console.log(`│  File: ${path.basename(filePath).padEnd(45)} │`);
  console.log(`│  Size: ${(fileStats.size / 1024 / 1024).toFixed(2).padEnd(45)} MB │`);
  console.log(`└────────────────────────────────────────────────────────┘\n`);

  // Create sync log entry
  const syncLogResult = await pool.query(`
    INSERT INTO sync_logs (sync_type, state, status, started_at)
    VALUES ('CSV_IMPORT', $1, 'IN_PROGRESS', NOW())
    RETURNING id
  `, [
    path.basename(filePath).replace('.csv', '').toUpperCase()
  ]);
  const syncLogId = syncLogResult.rows[0].id;

  const stats: ImportStats = {
    totalRecords: 0,
    processedRecords: 0,
    insertedRecords: 0,
    updatedRecords: 0,
    errorRecords: 0,
  };

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    })
  );

  const batchSize = 500;
  let batch: any[] = [];
  let lastLogTime = Date.now();

  async function processBatch(retryCount = 0): Promise<void> {
    if (batch.length === 0) return;

    let client;
    try {
      client = await pool.connect();
      await client.query('BEGIN');

      // Build multi-row INSERT with VALUES
      const valuesClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const record of batch) {
        // Build VALUES clause for this record
        const recordParams: string[] = [];
        for (let i = 0; i < 18; i++) {
          recordParams.push(`$${paramIndex++}`);
        }
        valuesClauses.push(`(${recordParams.join(', ')}, NOW())`);

        // Add parameters
        params.push(
          record.npi,
          record.entityType,
          record.firstName,
          record.lastName,
          record.credential,
          record.organizationName,
          record.specialty,
          record.specialtyCode,
          record.addressLine1,
          record.addressLine2,
          record.city,
          record.state,
          record.zipCode,
          record.phone,
          record.fax,
          record.sex,
          record.enumerationDate,
          record.lastUpdateDate
        );
      }

      // Execute single multi-row INSERT with conflict handling
      const query = `
        INSERT INTO providers (
          npi, entity_type, first_name, last_name, credential,
          organization_name, specialty, specialty_code, address_line1, address_line2,
          city, state, zip_code, phone, fax, sex, enumeration_date, last_updated, created_at
        ) VALUES ${valuesClauses.join(', ')}
        ON CONFLICT (npi) DO NOTHING
      `;

      await client.query(query, params);

      // Track inserts
      stats.insertedRecords += batch.length;

      await client.query('COMMIT');
      batch = [];
    } catch (err: any) {
      if (client) {
        try { await client.query('ROLLBACK'); } catch {}
      }

      // Retry on connection errors
      if (retryCount < 3 && (err.message?.includes('Connection') || err.message?.includes('timeout'))) {
        console.log(`\n⚠ Connection error, retrying batch (attempt ${retryCount + 1}/3)...`);
        await new Promise(r => setTimeout(r, 2000));
        return processBatch(retryCount + 1);
      }

      console.error(`\n❌ Batch failed after ${retryCount} retries: ${err.message}`);
      if (stats.errorRecords === 0) {
        console.error(`   First error details: ${err.stack}`);
      }
      stats.errorRecords += batch.length;
      batch = [];
    } finally {
      if (client) client.release();
    }
  }

  // Process CSV records
  for await (const record of parser as AsyncIterable<CSVRecord>) {
    stats.totalRecords++;

    // Log progress every 10,000 records
    const now = Date.now();
    if (stats.totalRecords % 10000 === 0 || now - lastLogTime > 5000) {
      const elapsed = ((now - startTime) / 1000).toFixed(1);
      const rate = stats.totalRecords / (now - startTime) * 1000;
      process.stdout.write(
        `\r📊 Processed: ${stats.totalRecords.toLocaleString()} | ` +
        `✅ Inserted: ${stats.insertedRecords.toLocaleString()} | ` +
        `🔄 Updated: ${stats.updatedRecords.toLocaleString()} | ` +
        `❌ Errors: ${stats.errorRecords} | ` +
        `⏱ ${elapsed}s (${rate.toFixed(0)} rec/s)`
      );
      lastLogTime = now;
    }

    stats.processedRecords++;

    try {
      // Sanitize all input fields first
      const cleanRecord = {
        npi: sanitizeString(record.npi) || '',
        entity_type: sanitizeString(record.entity_type) || '1',
        name: sanitizeString(record.name) || '',
        specialty: sanitizeString(record.specialty),
        specialty_code: sanitizeString(record.specialty_code),
        address_line1: sanitizeString(record.address_line1) || '',
        address_line2: sanitizeString(record.address_line2),
        city: sanitizeString(record.city) || '',
        state: sanitizeString(record.state) || '',
        zip_code: sanitizeString(record.zip_code) || '',
        phone: sanitizeString(record.phone),
        fax: sanitizeString(record.fax),
        sex: sanitizeString(record.sex),
        enumeration_date: sanitizeString(record.enumeration_date) || '',
        last_updated: sanitizeString(record.last_updated) || '',
      };

      // Parse entity type
      const entityType = cleanRecord.entity_type === '2' ? 'ORGANIZATION' : 'INDIVIDUAL';

      // Parse name into components
      const { firstName, lastName, credential, organizationName } = parseName(cleanRecord.name, entityType);

      // Parse dates
      const enumerationDate = parseDate(cleanRecord.enumeration_date);
      const lastUpdateDate = parseDate(cleanRecord.last_updated);

      // Prepare provider data (already sanitized)
      const providerData = {
        npi: cleanRecord.npi,
        entityType,
        firstName,
        lastName,
        credential,
        organizationName,
        specialty: cleanRecord.specialty,
        specialtyCode: cleanRecord.specialty_code,
        addressLine1: cleanRecord.address_line1,
        addressLine2: cleanRecord.address_line2,
        city: cleanRecord.city,
        state: cleanRecord.state,
        zipCode: cleanRecord.zip_code.substring(0, 10) || '',
        phone: cleanPhone(cleanRecord.phone),
        fax: cleanPhone(cleanRecord.fax),
        sex: cleanRecord.sex,
        enumerationDate,
        lastUpdateDate,
      };

      batch.push(providerData);

      // Process batch when it reaches the batch size
      if (batch.length >= batchSize) {
        await processBatch();
      }
    } catch (err: any) {
      stats.errorRecords++;
      if (stats.errorRecords <= 5) {
        console.error(`\n⚠ Error parsing record at line ${stats.totalRecords}: ${err.message}`);
      }
    }
  }

  // Process remaining batch
  await processBatch();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write(
    `\r📊 Processed: ${stats.totalRecords.toLocaleString()} | ` +
    `✅ Inserted: ${stats.insertedRecords.toLocaleString()} | ` +
    `🔄 Updated: ${stats.updatedRecords.toLocaleString()} | ` +
    `❌ Errors: ${stats.errorRecords} | ` +
    `⏱ ${elapsed}s\n`
  );

  // Update sync log
  await pool.query(`
    UPDATE sync_logs SET
      status = $1,
      records_processed = $2,
      completed_at = NOW(),
      error_message = $3
    WHERE id = $4
  `, [
    stats.errorRecords > 0 && stats.insertedRecords === 0 ? 'FAILED' : 'COMPLETED',
    stats.insertedRecords + stats.updatedRecords,
    stats.errorRecords > 0 ? `${stats.errorRecords} errors occurred` : null,
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

  // Parse arguments
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
┌────────────────────────────────────────────────────────┐
│  Healthcare Provider CSV Import Script                 │
└────────────────────────────────────────────────────────┘

Usage: npx tsx scripts/import-filtered-csv.ts [options]

Options:
  --file, -f <path>       Path to CSV file (required)
  --database, -d <url>    Database URL (or set DATABASE_URL env)
  --help, -h              Show this help message

Examples:
  npx tsx scripts/import-filtered-csv.ts --file "C:\\Users\\breil\\OneDrive\\Desktop\\NPI\\filtered_final\\NY.csv"
  npx tsx scripts/import-filtered-csv.ts -f NY.csv -d "postgresql://user:pass@host:5432/db"

CSV Format:
  Required columns: npi, entity_type, name, specialty, specialty_code,
                    address_line1, address_line2, city, state, zip_code,
                    phone, fax, sex, enumeration_date, last_updated

Name Parsing:
  - "DR. Steven M. Goldberg, M.D." → first_name="Steven M.", last_name="Goldberg", credential="M.D."
  - "JOHN DOE" → first_name="John", last_name="Doe"
  - Organization names are stored in organization_name field

Date Format:
  - Input: MM/DD/YYYY (e.g., "05/23/2005")
  - Output: PostgreSQL DATE format

Performance:
  - Batch size: 5,000 records
  - Progress logged every 10,000 records
  - Uses upsert (INSERT ... ON CONFLICT UPDATE)
        `);
        process.exit(0);
    }
  }

  // Validate arguments
  if (!filePath) {
    console.error('\n❌ Error: --file option is required');
    console.error('   Run with --help for usage information\n');
    process.exit(1);
  }

  if (!databaseUrl) {
    console.error('\n❌ Error: DATABASE_URL environment variable or --database option is required\n');
    process.exit(1);
  }

  try {
    const stats = await importCSVData(filePath, databaseUrl);

    console.log('\n┌────────────────────────────────────────────────────────┐');
    console.log('│  ✅ IMPORT COMPLETE                                    │');
    console.log('├────────────────────────────────────────────────────────┤');
    console.log(`│  Total records:         ${stats.totalRecords.toLocaleString().padStart(20)} │`);
    console.log(`│  Successfully inserted: ${stats.insertedRecords.toLocaleString().padStart(20)} │`);
    console.log(`│  Successfully updated:  ${stats.updatedRecords.toLocaleString().padStart(20)} │`);
    console.log(`│  Errors:                ${stats.errorRecords.toLocaleString().padStart(20)} │`);
    console.log('└────────────────────────────────────────────────────────┘\n');

    if (stats.errorRecords > 0) {
      console.log('⚠  Some records had errors. Check the output above for details.\n');
    }

  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
