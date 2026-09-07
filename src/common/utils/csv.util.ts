export type CsvValue = string | number | boolean | Date | null | undefined;

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

function escapeCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';

  let text = value instanceof Date ? value.toISOString() : String(value);

  // Prevent spreadsheet applications from evaluating exported values as formulas.
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;

  return `"${text.replace(/"/g, '""')}"`;
}

export function createCsv(
  headers: readonly string[],
  rows: ReadonlyArray<ReadonlyArray<CsvValue>>,
): string {
  const lines = [
    headers.map(escapeCsvValue).join(','),
    ...rows.map((row) => row.map(escapeCsvValue).join(',')),
  ];

  // UTF-8 BOM improves Excel compatibility, especially for the naira symbol.
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
