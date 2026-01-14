/**
 * Inspect problematic CSV rows
 */
import { createReadStream } from 'fs';
import { parse } from 'csv-parse';

async function inspectRows() {
  const filePath = process.argv[2];
  const startRow = parseInt(process.argv[3]) || 0;
  const endRow = parseInt(process.argv[4]) || 10;

  console.log(`\nInspecting rows ${startRow} to ${endRow} in ${filePath}\n`);

  const parser = createReadStream(filePath).pipe(
    parse({
      columns: true,
      skip_empty_lines: true,
      trim: false,  // Don't trim to see actual whitespace
      relax_column_count: true,
    })
  );

  let rowNum = 0;
  for await (const record of parser) {
    rowNum++;

    if (rowNum >= startRow && rowNum <= endRow) {
      console.log(`\n${'='.repeat(80)}`);
      console.log(`ROW ${rowNum}`);
      console.log('='.repeat(80));

      for (const [key, value] of Object.entries(record)) {
        const val = value as string;

        // Show raw value with escaped characters
        const escaped = val
          .replace(/\x00/g, '\\x00')  // Null bytes
          .replace(/\x01/g, '\\x01')
          .replace(/\x02/g, '\\x02')
          .replace(/\x03/g, '\\x03')
          .replace(/\x04/g, '\\x04')
          .replace(/\x05/g, '\\x05')
          .replace(/\x06/g, '\\x06')
          .replace(/\x07/g, '\\x07')
          .replace(/\x08/g, '\\x08')
          .replace(/\x0B/g, '\\x0B')
          .replace(/\x0C/g, '\\x0C')
          .replace(/\x0E/g, '\\x0E')
          .replace(/\x0F/g, '\\x0F')
          .replace(/\x10/g, '\\x10')
          .replace(/\x11/g, '\\x11')
          .replace(/\x12/g, '\\x12')
          .replace(/\x13/g, '\\x13')
          .replace(/\x14/g, '\\x14')
          .replace(/\x15/g, '\\x15')
          .replace(/\x16/g, '\\x16')
          .replace(/\x17/g, '\\x17')
          .replace(/\x18/g, '\\x18')
          .replace(/\x19/g, '\\x19')
          .replace(/\x1A/g, '\\x1A')
          .replace(/\x1B/g, '\\x1B')
          .replace(/\x1C/g, '\\x1C')
          .replace(/\x1D/g, '\\x1D')
          .replace(/\x1E/g, '\\x1E')
          .replace(/\x1F/g, '\\x1F')
          .replace(/\t/g, '\\t')
          .replace(/\n/g, '\\n')
          .replace(/\r/g, '\\r');

        // Check for problematic characters
        const hasNullByte = /\x00/.test(val);
        const hasControlChars = /[\x01-\x08\x0B-\x0C\x0E-\x1F]/.test(val);
        const hasHighAscii = /[\x80-\xFF]/.test(val);

        let warning = '';
        if (hasNullByte) warning += ' [NULL BYTE]';
        if (hasControlChars) warning += ' [CONTROL CHARS]';
        if (hasHighAscii) warning += ' [HIGH ASCII]';

        console.log(`  ${key}: "${escaped}"${warning}`);

        // Show byte representation for problematic fields
        if (hasNullByte || hasControlChars) {
          const bytes = Buffer.from(val).toString('hex');
          console.log(`    BYTES: ${bytes.match(/.{1,2}/g)?.join(' ')}`);
        }
      }
    }

    if (rowNum > endRow) break;
  }

  console.log(`\n${'='.repeat(80)}\n`);
}

inspectRows();
