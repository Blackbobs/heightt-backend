import { createCsv } from './csv.util';

describe('createCsv', () => {
  it('escapes commas, quotes and dates', () => {
    const csv = createCsv(['Name', 'Created'], [
      ['Ada, "Ace"', new Date('2026-09-04T10:00:00.000Z')],
    ]);

    expect(csv).toBe(
      '\uFEFF"Name","Created"\r\n"Ada, ""Ace""","2026-09-04T10:00:00.000Z"\r\n',
    );
  });

  it('neutralizes spreadsheet formulas', () => {
    const csv = createCsv(['Value'], [['=1+1'], ['+cmd'], ['-2'], ['@sum']]);

    expect(csv).toContain("\"'=1+1\"");
    expect(csv).toContain("\"'+cmd\"");
    expect(csv).toContain("\"'-2\"");
    expect(csv).toContain("\"'@sum\"");
  });
});
