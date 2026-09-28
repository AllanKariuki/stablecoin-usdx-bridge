/**
 * `{{placeholder}}` substitution. That is the whole template language, and
 * keeping it that way is deliberate.
 *
 * A template language in a notification service is a template language
 * somebody eventually puts a loop or a conditional in, and then rendering a
 * message can fail at runtime in a way nobody tested — on the path whose job
 * is telling a customer their money moved. Substitution cannot fail: a
 * missing key renders as a visible marker rather than throwing, because a
 * notification that says "[missing: amount]" is recoverable and one that
 * throws is a notification nobody gets.
 */

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function render(template: string, values: Record<string, unknown>): string {
  return template.replace(PLACEHOLDER, (_match, key: string) => {
    const value = lookup(values, key);
    if (value === undefined || value === null) {
      // Visible rather than blank. A blank makes "your deposit of  has
      // completed" read as a typo; the marker makes it read as a bug, which
      // is what it is.
      return `[missing: ${key}]`;
    }
    return stringify(value);
  });
}

/** Supports `a.b.c`, so a payload can be nested without flattening it first. */
function lookup(values: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc === null || acc === undefined || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[part];
  }, values);
}

function stringify(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  // An object that reached a template is a bug in the producer, but rendering
  // "[object Object]" into a customer's email is worse than rendering JSON.
  return JSON.stringify(value);
}

/**
 * The placeholders a template refers to. Used to validate a template at write
 * time rather than discovering at send time that it names a field the event
 * has never carried.
 */
export function placeholders(template: string): string[] {
  return [...new Set([...template.matchAll(PLACEHOLDER)].map((m) => m[1]))];
}
