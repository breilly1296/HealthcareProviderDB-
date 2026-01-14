/**
 * Verify data quality of imported records
 */
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;

async function verifyData() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
  });

  try {
    console.log('\n📋 Data Quality Verification\n');
    console.log('='.repeat(80));

    // Check name parsing for individuals
    console.log('\n1. Individual Name Parsing Samples:');
    console.log('-'.repeat(80));
    const individuals = await pool.query(`
      SELECT npi, entity_type, first_name, last_name, credential
      FROM providers
      WHERE state = 'NY' AND entity_type = 'INDIVIDUAL'
      LIMIT 10
    `);

    individuals.rows.forEach(row => {
      console.log(`NPI: ${row.npi}`);
      console.log(`  First: ${row.first_name || '(null)'}`);
      console.log(`  Last: ${row.last_name || '(null)'}`);
      console.log(`  Credential: ${row.credential || '(none)'}`);
      console.log();
    });

    // Check organization name parsing
    console.log('\n2. Organization Name Parsing Samples:');
    console.log('-'.repeat(80));
    const orgs = await pool.query(`
      SELECT npi, entity_type, organization_name
      FROM providers
      WHERE state = 'NY' AND entity_type = 'ORGANIZATION'
      LIMIT 10
    `);

    orgs.rows.forEach(row => {
      console.log(`NPI: ${row.npi}`);
      console.log(`  Organization: ${row.organization_name}`);
      console.log();
    });

    // Check date conversion
    console.log('\n3. Date Conversion Samples:');
    console.log('-'.repeat(80));
    const dates = await pool.query(`
      SELECT npi, enumeration_date, last_updated
      FROM providers
      WHERE state = 'NY'
        AND enumeration_date IS NOT NULL
        AND last_updated IS NOT NULL
      LIMIT 10
    `);

    dates.rows.forEach(row => {
      console.log(`NPI: ${row.npi}`);
      console.log(`  Enumeration Date: ${row.enumeration_date}`);
      console.log(`  Last Updated: ${row.last_updated}`);
      console.log();
    });

    // Statistics
    console.log('\n4. Overall Statistics:');
    console.log('-'.repeat(80));

    const stats = await pool.query(`
      SELECT
        COUNT(*) as total_records,
        COUNT(CASE WHEN entity_type = 'INDIVIDUAL' THEN 1 END) as individuals,
        COUNT(CASE WHEN entity_type = 'ORGANIZATION' THEN 1 END) as organizations,
        COUNT(CASE WHEN first_name IS NOT NULL THEN 1 END) as has_first_name,
        COUNT(CASE WHEN last_name IS NOT NULL THEN 1 END) as has_last_name,
        COUNT(CASE WHEN credential IS NOT NULL THEN 1 END) as has_credential,
        COUNT(CASE WHEN organization_name IS NOT NULL THEN 1 END) as has_org_name,
        COUNT(CASE WHEN enumeration_date IS NOT NULL THEN 1 END) as has_enum_date,
        COUNT(CASE WHEN last_updated IS NOT NULL THEN 1 END) as has_last_updated,
        COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as has_phone,
        COUNT(CASE WHEN specialty IS NOT NULL THEN 1 END) as has_specialty
      FROM providers
      WHERE state = 'NY'
    `);

    const s = stats.rows[0];
    console.log(`Total Records: ${parseInt(s.total_records).toLocaleString()}`);
    console.log(`  Individuals: ${parseInt(s.individuals).toLocaleString()} (${((s.individuals/s.total_records)*100).toFixed(1)}%)`);
    console.log(`  Organizations: ${parseInt(s.organizations).toLocaleString()} (${((s.organizations/s.total_records)*100).toFixed(1)}%)`);
    console.log(`\nField Population:`);
    console.log(`  First Name: ${parseInt(s.has_first_name).toLocaleString()} (${((s.has_first_name/s.total_records)*100).toFixed(1)}%)`);
    console.log(`  Last Name: ${parseInt(s.has_last_name).toLocaleString()} (${((s.has_last_name/s.total_records)*100).toFixed(1)}%)`);
    console.log(`  Credential: ${parseInt(s.has_credential).toLocaleString()} (${((s.has_credential/s.total_records)*100).toFixed(1)}%)`);
    console.log(`  Organization Name: ${parseInt(s.has_org_name).toLocaleString()} (${((s.has_org_name/s.total_records)*100).toFixed(1)}%)`);
    console.log(`  Enumeration Date: ${parseInt(s.has_enum_date).toLocaleString()} (${((s.has_enum_date/s.total_records)*100).toFixed(1)}%)`);
    console.log(`  Last Updated: ${parseInt(s.has_last_updated).toLocaleString()} (${((s.has_last_updated/s.total_records)*100).toFixed(1)}%)`);
    console.log(`  Phone: ${parseInt(s.has_phone).toLocaleString()} (${((s.has_phone/s.total_records)*100).toFixed(1)}%)`);
    console.log(`  Specialty: ${parseInt(s.has_specialty).toLocaleString()} (${((s.has_specialty/s.total_records)*100).toFixed(1)}%)`);

    console.log('\n' + '='.repeat(80) + '\n');

  } catch (error: any) {
    console.error('Error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyData();
