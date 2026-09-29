/**
 * CSV, written out rather than pulled in.
 *
 * Escaping CSV correctly is four rules, and a library that does them is a
 * library whose version, transitive dependencies and default settings have to
 * be tracked for the life of the platform. The four rules:
 *
 *  1. a field containing a comma, a quote or a newline is quoted;
 *  2. a quote inside a quoted field is doubled;
 *  3. rows end CRLF, per RFC 4180 — Excel is the consumer that cares;
 *  4. a field starting with `=`, `+`, `-` or `@` is prefixed, because
 *     spreadsheet software treats it as a formula.
 *
 * The fourth is the one people leave out, and it is a genuine vulnerability:
 * a customer whose account name is `=HYPERLINK("http://evil","click")` gets
 * that executed in whoever opens the export. It is not theoretical for this
 * platform — account names and invoice descriptions are customer-supplied and
 * both appear in reports.
 */

const NEEDS_QUOTING = /[",\r\n]/;
const FORMULA_START = /^[=+\-@\t\r]/;

export function escapeField(value: unknown): string {
  if (value === null || value === undefined) return '';

  let text: string;
  if (typeof value === 'object') {
    text = JSON.stringify(value);
  } else {
    text = String(value);
  }

  // Formula injection. The leading apostrophe is what spreadsheet software
  // reads as "this is text"; prefixing is preferred over stripping because a
  // name that genuinely begins with a hyphen should still be legible.
  if (FORMULA_START.test(text)) {
    text = `'${text}`;
  }

  if (NEEDS_QUOTING.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv(columns: string[], rows: Array<Record<string, unknown>>): string {
  const lines = [columns.map(escapeField).join(',')];
  for (const row of rows) {
    lines.push(columns.map((column) => escapeField(row[column])).join(','));
  }
  // CRLF and a trailing newline, per RFC 4180.
  return lines.join('\r\n') + '\r\n';
}
