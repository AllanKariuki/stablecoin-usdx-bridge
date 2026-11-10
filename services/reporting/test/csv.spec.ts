import { escapeField, toCsv } from '../src/exports/csv';

/**
 * Account names and invoice descriptions are customer-supplied and both end
 * up in exports, so these are tests of what a hostile or merely awkward value
 * does to a spreadsheet.
 */
describe('CSV escaping', () => {
  it('leaves an ordinary value alone', () => {
    expect(escapeField('Acme Ltd')).toBe('Acme Ltd');
    expect(escapeField('250.00')).toBe('250.00');
  });

  it('quotes a field containing a comma', () => {
    expect(escapeField('Acme, Ltd')).toBe('"Acme, Ltd"');
  });

  it('doubles an embedded quote', () => {
    expect(escapeField('He said "hi"')).toBe('"He said ""hi"""');
  });

  it('quotes a field containing a newline', () => {
    expect(escapeField('line one\nline two')).toBe('"line one\nline two"');
  });

  /**
   * The rule people leave out, and a genuine vulnerability rather than a
   * nicety: a customer whose account name is a formula gets it executed in
   * whoever opens the export.
   */
  it.each(['=HYPERLINK("http://evil","click")', '+1+1', '-1+1', '@SUM(A1:A9)'])(
    'neutralises the formula %s',
    (payload) => {
      expect(escapeField(payload).replace(/^"/, '')).toMatch(/^'/);
    },
  );

  it('keeps a neutralised formula legible', () => {
    // Prefixing rather than stripping: a name that genuinely begins with a
    // hyphen should still be readable.
    expect(escapeField('-Ltd')).toBe("'-Ltd");
  });

  it('renders null and undefined as empty, not as the words', () => {
    expect(escapeField(null)).toBe('');
    expect(escapeField(undefined)).toBe('');
  });

  it('renders an object as JSON rather than [object Object]', () => {
    expect(escapeField({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('keeps a zero, which a falsy check would drop', () => {
    expect(escapeField(0)).toBe('0');
  });
});

describe('CSV documents', () => {
  it('writes a header and rows in column order', () => {
    const csv = toCsv(
      ['id', 'amount'],
      [
        { id: 'tx_1', amount: '10.00' },
        { id: 'tx_2', amount: '20.00' },
      ],
    );
    expect(csv).toBe('id,amount\r\ntx_1,10.00\r\ntx_2,20.00\r\n');
  });

  it('emits an empty cell for a missing key rather than shifting the row', () => {
    // A misaligned row is worse than a blank one: every column after the gap
    // holds somebody else's data.
    const csv = toCsv(['id', 'note', 'amount'], [{ id: 'tx_1', amount: '10.00' }]);
    expect(csv).toBe('id,note,amount\r\ntx_1,,10.00\r\n');
  });

  it('writes a header-only document for no rows', () => {
    expect(toCsv(['id'], [])).toBe('id\r\n');
  });

  it('uses CRLF, which is what RFC 4180 and Excel expect', () => {
    expect(toCsv(['a'], [{ a: '1' }])).toContain('\r\n');
  });
});
