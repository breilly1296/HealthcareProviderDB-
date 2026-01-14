/**
 * Simple CSV Import - Fast parsing + reliable batched INSERTs
 *
 * Parses CSV fast in memory, then uses small batch INSERTs for reliability.
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

interface ParsedProvider {
  npi: string;
  entityType: string;
  firstName: string | null;
  lastName: string | null;
  credential: string | null;
  organizationName: string | null;
  specialty: string | null;
  specialtyCode: string | null;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  zipCode: string;
  phone: string | null;
  fax: string | null;
  sex: string | null;
  enumerationDate: string | null;
  lastUpdateDate: string | null;
}

interface ImportStats {
  totalRecords: number;
  importedRecords: number;
  errorRecords: number;
}

function sanitizeString(str: string | null | undefined): string | null {
  if (!str) return null;
  return str.replace(/\x00/g, '').replace(/[\x01-\x08\x0B-\x0C\x0E-\x1F]/g, '').trim() || null;
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function parseName(name: string, entityType: string) {
  if (!name || name.trim() === '') {
    return { firstName: null, lastName: null, credential: null, organizationName: null };
  }

  if (entityType === 'ORGANIZATION') {
    return { firstName: null, lastName: null, credential: null, organizationName: toTitleCase(name.trim()) };
  }

  let workingName = name.trim();
  let credential: string | null = null;

  const credentialMatch = workingName.match(/,\s*([A-Z][A-Z.]*(?:\s+[A-Z][A-Z.]*)?)$/i);
  if (credentialMatch) {
    credential = credentialMatch[1].trim();
    workingName = workingName.substring(0, credentialMatch.index).trim();
  }

  workingName = workingName.replace(/^(DR\.?|MR\.?|MS\.?|MRS\.?|MISS\.?)\s+/i, '').replace(/,\s*$/, '');

  const parts = workingName.split(/\s+/).filter(p => p.length > 0);

  if (parts.length === 0) return { firstName: null, lastName: null, credential, organizationName: null };
  if (parts.length === 1) return { firstName: null, lastName: toTitleCase(parts[0]), credential, organizationName: null };

  const lastName = toTitleCase(parts[parts.length - 1]);
  const firstName = parts.slice(0, -1).map(toTitleCase).join(' ');

  return { firstName, lastName, credential, organizationName: null };
}

function parseDate(dateStr: string): string | null {
  if (!dateStr || dateStr.trim() === '') return null;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [month, day, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return null;
}

function cleanPhone(phone: string): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/\D/g, '');
  return cleaned.length >= 10 ? cleaned : null;
}

async function importCSV(filePath: string, databaseUrl: string): Promise<ImportStats> {
  if (!existsSync(filePath)) {
    throw new Error(`CSV file not found: ${filePath}`);
  }

  const pool = new Pool({ connectionString: databaseUrl, max: 5 });
  const fileStats = await stat(filePath);
  const startTime = Date.now();

  console.log(`\n┌────────────────────────────────────────────────────────┐`);
  console.log(`│  Healthcare Provider CSV Import                        │`);
  console.log(`├────────────────────────────────────────────────────────┤`);
  console.log(`│  File: ${path.basename(filePath).padEnd(45)} │`);
  console.log(`│  Size: ${(fileStats.size / 1024 / 1024).toFixed(2).padEnd(45)} MB │`);
  console.log(`└────────────────────────────────────────────────────────┘\n`);

  // Parse all CSV data into memory first (fast)
  console.log('📖 Reading and parsing CSV...\n');

  const providers: ParsedProvider[] = [];
  const csvStream = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: false, relax_column_count: true })
  );

  let parseCount = 0;
  let lastLogTime = Date.now();

  for await (const record of csvStream as AsyncIterable<CSVRecord>) {
    parseCount++;

    if (parseCount % 10000 === 0 || Date.now() - lastLogTime > 5000) {
      process.stdout.write(`\r📊 Parsed: ${parseCount.toLocaleString()} records`);
      lastLogTime = Date.now();
    }

    try {
      const clean = {
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

      const entityType = clean.entity_type === '2' ? 'ORGANIZATION' : 'INDIVIDUAL';
      const { firstName, lastName, credential, organizationName } = parseName(clean.name, entityType);

      providers.push({
        npi: clean.npi,
        entityType,
        firstName,
        lastName,
        credential,
        organizationName,
        specialty: clean.specialty,
        specialtyCode: clean.specialty_code,
        addressLine1: clean.address_line1,
        addressLine2: clean.address_line2,
        city: clean.city,
        state: clean.state,
        zipCode: clean.zip_code.substring(0, 10),
        phone: cleanPhone(clean.phone),
        fax: cleanPhone(clean.fax),
        sex: clean.sex,
        enumerationDate: parseDate(clean.enumeration_date),
        lastUpdateDate: parseDate(clean.last_updated),
      });
    } catch (err) {
      // Skip problematic records
    }
  }

  const parseElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n✅ Parsed ${providers.length.toLocaleString()} records in ${parseElapsed}s\n`);

  // Now insert in small batches with multi-row INSERT
  console.log('💾 Inserting into database...\n');

  const stats: ImportStats = { totalRecords: providers.length, importedRecords: 0, errorRecords: 0 };
  const batchSize = 200;  // Small batch size for reliability

  for (let i = 0; i < providers.length; i += batchSize) {
    const batch = providers.slice(i, i + batchSize);

    if (i % 10000 === 0 || i === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = stats.importedRecords / (Date.now() - startTime) * 1000;
      process.stdout.write(
        `\r📊 Imported: ${stats.importedRecords.toLocaleString()} / ${stats.totalRecords.toLocaleString()} | ` +
        `⏱ ${elapsed}s (${rate.toFixed(0)} rec/s)`
      );
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Build multi-row INSERT
      const valuesClauses: string[] = [];
      const params: any[] = [];
      let paramIndex = 1;

      for (const p of batch) {
        const recordParams: string[] = [];
        for (let j = 0; j < 18; j++) {
          recordParams.push(`$${paramIndex++}`);
        }
        valuesClauses.push(`(${recordParams.join(', ')}, NOW())`);

        params.push(
          p.npi, p.entityType, p.firstName, p.lastName, p.credential, p.organizationName,
          p.specialty, p.specialtyCode, p.addressLine1, p.addressLine2, p.city, p.state, p.zipCode,
          p.phone, p.fax, p.sex, p.enumerationDate, p.lastUpdateDate
        );
      }

      const query = `
        INSERT INTO providers (
          npi, entity_type, first_name, last_name, credential, organization_name,
          specialty, specialty_code, address_line1, address_line2, city, state, zip_code,
          phone, fax, sex, enumeration_date, last_updated, created_at
        ) VALUES ${valuesClauses.join(', ')}
        ON CONFLICT (npi) DO NOTHING
      `;

      await client.query(query, params);
      await client.query('COMMIT');
      stats.importedRecords += batch.length;
    } catch (err: any) {
      await client.query('ROLLBACK');
      stats.errorRecords += batch.length;
      if (stats.errorRecords === batch.length) {
        console.error(`\n❌ First batch error: ${err.message}`);
      }
    } finally {
      client.release();
    }
  }

  const totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const rate = stats.importedRecords / (Date.now() - startTime) * 1000;
  console.log(`\n\n✅ Import complete in ${totalElapsed}s (${rate.toFixed(0)} rec/s)\n`);

  await pool.end();
  return stats;
}

async function main() {
  const args = process.argv.slice(2);
  let filePath: string | undefined;
  let databaseUrl: string | undefined = process.env.DATABASE_URL;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--file' || args[i] === '-f') filePath = args[++i];
    if (args[i] === '--database' || args[i] === '-d') databaseUrl = args[++i];
  }

  if (!filePath) {
    console.error('\n❌ Error: --file required\n');
    process.exit(1);
  }

  if (!databaseUrl) {
    console.error('\n❌ Error: DATABASE_URL required\n');
    process.exit(1);
  }

  try {
    const stats = await importCSV(filePath, databaseUrl);
    console.log('┌────────────────────────────────────────────────────────┐');
    console.log('│  ✅ IMPORT COMPLETE                                    │');
    console.log('├────────────────────────────────────────────────────────┤');
    console.log(`│  Total records:         ${stats.totalRecords.toLocaleString().padStart(20)} │`);
    console.log(`│  Successfully imported: ${stats.importedRecords.toLocaleString().padStart(20)} │`);
    console.log(`│  Errors:                ${stats.errorRecords.toLocaleString().padStart(20)} │`);
    console.log('└────────────────────────────────────────────────────────┘\n');
  } catch (error: any) {
    console.error('\n❌ Import failed:', error.message);
    process.exit(1);
  }
}

main();
