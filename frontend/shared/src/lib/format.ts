const dateTime = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const dateOnly = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });
const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const toDate = (value: string | number | Date) => (value instanceof Date ? value : new Date(value));
const valid = (d: Date) => !Number.isNaN(d.getTime());

export const formatDateTime = (value?: string | number | Date | null) => {
  if (!value) return '—';
  const d = toDate(value);
  return valid(d) ? dateTime.format(d) : String(value);
};

export const formatDate = (value?: string | number | Date | null) => {
  if (!value) return '—';
  const d = toDate(value);
  return valid(d) ? dateOnly.format(d) : String(value);
};

export const timeAgo = (value?: string | number | Date | null) => {
  if (!value) return '—';
  const d = toDate(value);
  if (!valid(d)) return String(value);
  const seconds = Math.round((d.getTime() - Date.now()) / 1000);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
  ];
  for (const [unit, size] of units) {
    if (Math.abs(seconds) >= size) return relative.format(Math.round(seconds / size), unit);
  }
  return 'just now';
};

/** 0x1234…cdef — for hashes, addresses and long ids in dense views. */
export const truncateMiddle = (value: string, head = 6, tail = 4) =>
  value && value.length > head + tail + 1 ? `${value.slice(0, head)}…${value.slice(-tail)}` : value;

/** SNAKE_CASE / kebab → "Sentence case" for enum values from the API. */
export const humanize = (value?: string | null) =>
  value ? value.toLowerCase().replace(/[_-]+/g, ' ').replace(/^\w/, (c) => c.toUpperCase()) : '—';
