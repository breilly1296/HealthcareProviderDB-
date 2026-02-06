import {
  toTitleCase,
  formatProviderName,
  toDisplayCase,
  toAddressCase,
  formatAddress,
} from '../formatName';

describe('toTitleCase', () => {
  it('converts ALL-CAPS to title case', () => {
    expect(toTitleCase('JOHN SMITH')).toBe('John Smith');
  });

  it('handles hyphenated names', () => {
    expect(toTitleCase('TOPE AADE-GBAMI')).toBe('Tope Aade-Gbami');
  });

  it('handles McDonald prefix', () => {
    expect(toTitleCase('MCDONALD')).toBe('McDonald');
  });

  it("handles O'Brien prefix", () => {
    expect(toTitleCase("O'BRIEN")).toBe("O'Brien");
  });

  it('returns empty string for null', () => {
    expect(toTitleCase(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(toTitleCase(undefined)).toBe('');
  });

  it('returns empty string for empty string', () => {
    expect(toTitleCase('')).toBe('');
  });

  it('passes through already mixed-case strings unchanged', () => {
    expect(toTitleCase('John Smith')).toBe('John Smith');
  });

  it('handles single word', () => {
    expect(toTitleCase('BROOKLYN')).toBe('Brooklyn');
  });

  it('handles suffixes', () => {
    expect(toTitleCase('JAMES SMITH JR')).toBe('James Smith Jr');
    expect(toTitleCase('JAMES SMITH III')).toBe('James Smith III');
  });
});

describe('formatProviderName', () => {
  it('formats basic first/last name', () => {
    expect(formatProviderName('JOHN', null, 'SMITH')).toBe('John Smith');
  });

  it('formats name with middle initial', () => {
    expect(formatProviderName('JOHN', 'A', 'SMITH')).toBe('John A. Smith');
  });

  it('formats name with credential', () => {
    expect(formatProviderName('JOHN', null, 'SMITH', 'MD')).toBe('John Smith, MD');
  });

  it('formats name with full middle name and credential', () => {
    expect(formatProviderName('JOHN', 'ANDREW', 'SMITH', 'MD')).toBe('John Andrew Smith, MD');
  });

  it('handles null first name', () => {
    expect(formatProviderName(null, null, 'SMITH')).toBe('Smith');
  });

  it('handles all null', () => {
    expect(formatProviderName(null, null, null)).toBe('');
  });
});

describe('toDisplayCase', () => {
  it('title-cases a display name with credentials', () => {
    expect(toDisplayCase('DEBORAH AANONSEN, DO')).toBe('Deborah Aanonsen, DO');
  });

  it('title-cases a plain all-caps name', () => {
    expect(toDisplayCase('JOHN SMITH')).toBe('John Smith');
  });

  it('title-cases an organization name', () => {
    expect(toDisplayCase('MONTEFIORE MEDICAL CENTER')).toBe('Montefiore Medical Center');
  });

  it('passes through already mixed-case', () => {
    expect(toDisplayCase('John Smith, MD')).toBe('John Smith, MD');
  });

  it('returns empty for null', () => {
    expect(toDisplayCase(null)).toBe('');
  });
});

describe('toAddressCase', () => {
  it('title-cases a street address', () => {
    expect(toAddressCase('50 E 18TH ST APT E12')).toBe('50 E 18th St Apt E12');
  });

  it('keeps directionals uppercase', () => {
    expect(toAddressCase('100 NW MAIN ST')).toBe('100 NW Main St');
  });

  it('handles ordinals', () => {
    expect(toAddressCase('1ST AVE')).toBe('1st Ave');
    expect(toAddressCase('33RD ST')).toBe('33rd St');
    expect(toAddressCase('2ND FL')).toBe('2nd Fl');
  });

  it('returns empty for null', () => {
    expect(toAddressCase(null)).toBe('');
  });

  it('passes through already mixed-case', () => {
    expect(toAddressCase('50 E 18th St')).toBe('50 E 18th St');
  });
});

describe('formatAddress', () => {
  it('formats a full address', () => {
    expect(formatAddress('111 E 210TH ST', 'BRONX', 'NY', '10467'))
      .toBe('111 E 210th St, Bronx, NY 10467');
  });

  it('keeps state uppercase', () => {
    expect(formatAddress('123 MAIN ST', 'BROOKLYN', 'NY', '11201'))
      .toBe('123 Main St, Brooklyn, NY 11201');
  });

  it('handles null address line', () => {
    expect(formatAddress(null, 'BROOKLYN', 'NY', '11201'))
      .toBe('Brooklyn, NY 11201');
  });

  it('handles all nulls', () => {
    expect(formatAddress(null, null, null, null)).toBe('');
  });
});
