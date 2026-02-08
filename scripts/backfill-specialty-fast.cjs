/**
 * Fast Backfill Specialty Categories Script
 * Uses bulk UPDATE with CASE statement for speed
 *
 * Usage:
 *   DATABASE_URL=postgresql://user:pass@host:5432/db node scripts/backfill-specialty-fast.cjs
 *
 * Or if DATABASE_URL is already set in environment:
 *   node scripts/backfill-specialty-fast.cjs
 */

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('ERROR: DATABASE_URL environment variable is required');
  console.error('Usage: DATABASE_URL=postgresql://user:pass@host:5432/db node scripts/backfill-specialty-fast.cjs');
  process.exit(1);
}

// Prefix-based mappings (most common patterns)
const PREFIX_RULES = [
  // Mental Health & Behavioral
  { prefix: '101Y', category: 'MENTAL_HEALTH' },
  { prefix: '103', category: 'PSYCHOLOGY' },
  { prefix: '104', category: 'SOCIAL_WORK' },
  { prefix: '106', category: 'MENTAL_HEALTH' },
  { prefix: '2084', category: 'PSYCHIATRY' },
  { prefix: '373', category: 'MENTAL_HEALTH' },

  // Nursing
  { prefix: '163W', category: 'NURSING' },
  { prefix: '164', category: 'NURSING' },
  { prefix: '363L', category: 'NURSE_PRACTITIONER' },
  { prefix: '363A', category: 'PHYSICIAN_ASSISTANT' },

  // Dental & Vision
  { prefix: '122', category: 'DENTISTRY' },
  { prefix: '124', category: 'DENTISTRY' },
  { prefix: '125', category: 'DENTISTRY' },
  { prefix: '126', category: 'DENTISTRY' },
  { prefix: '152W', category: 'OPTOMETRY' },
  { prefix: '156', category: 'OPTOMETRY' },

  // Pharmacy
  { prefix: '183', category: 'PHARMACY' },
  { prefix: '331', category: 'PHARMACY' },
  { prefix: '332', category: 'PHARMACY' },
  { prefix: '333', category: 'PHARMACY' },

  // Therapy
  { prefix: '2251', category: 'PHYSICAL_THERAPY' },
  { prefix: '2252', category: 'PHYSICAL_THERAPY' },
  { prefix: '225X', category: 'OCCUPATIONAL_THERAPY' },
  { prefix: '224Z', category: 'OCCUPATIONAL_THERAPY' },
  { prefix: '2257', category: 'SPEECH_THERAPY' },
  { prefix: '235', category: 'SPEECH_THERAPY' },
  { prefix: '237', category: 'SPEECH_THERAPY' },
  { prefix: '367', category: 'RESPIRATORY_THERAPY' },
  { prefix: '111N', category: 'CHIROPRACTIC' },
  { prefix: '1711', category: 'ACUPUNCTURE' },

  // Medical Specialties
  { prefix: '207P', category: 'EMERGENCY_MEDICINE' },
  { prefix: '2080', category: 'PEDIATRICS' },
  { prefix: '207L', category: 'ANESTHESIOLOGY' },
  { prefix: '2086', category: 'SURGERY' },
  { prefix: '208G', category: 'SURGERY' },
  { prefix: '207V', category: 'OB_GYN' },
  { prefix: '207RC', category: 'CARDIOLOGY' },
  { prefix: '2085', category: 'RADIOLOGY' },
  { prefix: '247100', category: 'RADIOLOGY' },
  { prefix: '207N', category: 'DERMATOLOGY' },
  { prefix: '2084N', category: 'NEUROLOGY' },
  { prefix: '207RX', category: 'ONCOLOGY' },
  { prefix: '207RH0003', category: 'ONCOLOGY' },
  { prefix: '2088', category: 'UROLOGY' },
  { prefix: '207RG0100', category: 'GASTROENTEROLOGY' },
  { prefix: '207RP', category: 'PULMONOLOGY' },
  { prefix: '207RN', category: 'NEPHROLOGY' },
  { prefix: '207RI0200', category: 'INFECTIOUS_DISEASE' },
  { prefix: '207K', category: 'ALLERGY_IMMUNOLOGY' },
  { prefix: '207Z', category: 'PATHOLOGY' },

  // Original categories
  { prefix: '207RE', category: 'ENDOCRINOLOGY' },
  { prefix: '207RI0011', category: 'ENDOCRINOLOGY' },
  { prefix: '261QE0700', category: 'ENDOCRINOLOGY' },
  { prefix: '207RR', category: 'RHEUMATOLOGY' },
  { prefix: '261QR0401', category: 'RHEUMATOLOGY' },
  { prefix: '207X', category: 'ORTHOPEDICS' },
  { prefix: '207Q', category: 'FAMILY_MEDICINE' },
  { prefix: '207QG', category: 'GERIATRICS' },
  { prefix: '207RG0300', category: 'GERIATRICS' },
  { prefix: '207R', category: 'INTERNAL_MEDICINE' },

  // Support Services
  { prefix: '133', category: 'DIETETICS' },
  { prefix: '136', category: 'DIETETICS' },
  { prefix: '374', category: 'LAB_PATHOLOGY' },
  { prefix: '246', category: 'LAB_PATHOLOGY' },
  { prefix: '247', category: 'LAB_PATHOLOGY' },
  { prefix: '291', category: 'LAB_PATHOLOGY' },
  { prefix: '292', category: 'LAB_PATHOLOGY' },
  { prefix: '293', category: 'LAB_PATHOLOGY' },
  { prefix: '310', category: 'DME_PROSTHETICS' },
  { prefix: '332B', category: 'DME_PROSTHETICS' },
  { prefix: '335', category: 'DME_PROSTHETICS' },
  { prefix: '172V', category: 'COMMUNITY_HEALTH' },
  { prefix: '251', category: 'COMMUNITY_HEALTH' },
  { prefix: '171M', category: 'MIDWIFERY' },
  { prefix: '176B', category: 'MIDWIFERY' },
  { prefix: '315', category: 'HOSPICE_PALLIATIVE' },

  // Facilities
  { prefix: '261Q', category: 'CLINIC_FACILITY' },
  { prefix: '193', category: 'CLINIC_FACILITY' },
  { prefix: '390', category: 'CLINIC_FACILITY' },
  { prefix: '27', category: 'HOSPITAL' },
  { prefix: '28', category: 'HOSPITAL' },
  { prefix: '31', category: 'HOME_HEALTH' },
];

async function main() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    max: 3,
  });

  console.log('Fast Backfill Specialty Categories');
  console.log('===================================\n');

  try {
    // Build a massive CASE statement for the UPDATE
    // Process by prefix rules in order of specificity (longer prefixes first)
    const sortedRules = [...PREFIX_RULES].sort((a, b) => b.prefix.length - a.prefix.length);

    console.log('Processing specialty categories by prefix...\n');

    let totalUpdated = 0;

    for (const rule of sortedRules) {
      const { prefix, category } = rule;

      const result = await pool.query(`
        UPDATE providers
        SET specialty_category = $1
        WHERE primary_taxonomy_code LIKE $2
        AND (specialty_category IS NULL OR specialty_category != $1)
      `, [category, `${prefix}%`]);

      if (result.rowCount > 0) {
        totalUpdated += result.rowCount;
        console.log(`  ${prefix}* -> ${category}: ${result.rowCount.toLocaleString()} records`);
      }
    }

    // Set remaining to OTHER
    const otherResult = await pool.query(`
      UPDATE providers
      SET specialty_category = 'OTHER'
      WHERE specialty_category IS NULL
    `);

    if (otherResult.rowCount > 0) {
      totalUpdated += otherResult.rowCount;
      console.log(`  (remaining) -> OTHER: ${otherResult.rowCount.toLocaleString()} records`);
    }

    console.log(`\n✓ Backfill complete! Total updated: ${totalUpdated.toLocaleString()}\n`);

    // Show summary
    const summaryResult = await pool.query(`
      SELECT specialty_category, COUNT(*) as count
      FROM providers
      GROUP BY specialty_category
      ORDER BY count DESC
    `);

    console.log('--- Specialty Distribution ---');
    console.log('Specialty Category       | Count');
    console.log('-------------------------|----------');
    for (const row of summaryResult.rows) {
      const cat = (row.specialty_category || 'NULL').padEnd(24);
      console.log(`${cat} | ${parseInt(row.count).toLocaleString()}`);
    }

  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
