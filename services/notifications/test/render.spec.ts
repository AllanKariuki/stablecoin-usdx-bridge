import { placeholders, render } from '../src/templates/render';

/**
 * Rendering is on the path whose job is telling a customer their money moved,
 * so the property that matters most is that it cannot throw. Every case below
 * is something a producer will eventually send.
 */
describe('template rendering', () => {
  it('substitutes placeholders', () => {
    expect(render('{{direction}} of {{amount}} {{currency}} completed.', {
      direction: 'Deposit',
      amount: '250.00',
      currency: 'USD',
    })).toBe('Deposit of 250.00 USD completed.');
  });

  it('marks a missing value visibly rather than throwing or blanking', () => {
    // A blank makes "your deposit of  has completed" read as a typo. The
    // marker makes it read as a bug, which is what it is — and the customer
    // still gets told something happened.
    expect(render('Deposit of {{amount}} completed.', {})).toBe('Deposit of [missing: amount] completed.');
  });

  it('reads nested paths so a payload need not be flattened first', () => {
    expect(render('{{data.leg}} broke', { data: { leg: 'LEG_B' } })).toBe('LEG_B broke');
  });

  it('does not throw when a path runs into a non-object', () => {
    expect(render('{{a.b.c}}', { a: 'not an object' })).toBe('[missing: a.b.c]');
  });

  it('renders an object as JSON rather than [object Object]', () => {
    // An object reaching a template is a producer bug, but "[object Object]"
    // in a customer's email is worse than JSON they can at least report.
    expect(render('{{x}}', { x: { a: 1 } })).toBe('{"a":1}');
  });

  it('tolerates whitespace inside the braces', () => {
    expect(render('{{ amount }}', { amount: '1.00' })).toBe('1.00');
  });

  it('leaves text with no placeholders alone', () => {
    expect(render('No placeholders here.', {})).toBe('No placeholders here.');
  });

  it('renders a zero without treating it as missing', () => {
    // `0` is falsy and a naive implementation drops it — which for an amount
    // is precisely the wrong value to lose.
    expect(render('{{count}} breaks', { count: 0 })).toBe('0 breaks');
  });

  it('lists the placeholders a template refers to', () => {
    expect(placeholders('{{a}} and {{b}} and {{a}}').sort()).toEqual(['a', 'b']);
  });
});
