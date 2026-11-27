import { useMemo, useState } from 'react';

/** Page sizes offered on full list pages. */
export const PAGE_SIZES = [10, 25, 50];

/**
 * Client-side text filter over the rows a page already loaded. `fields`
 * returns the strings a row should match on (ids, names, rules).
 */
export function useSearch<T>(rows: T[] | undefined, fields: (row: T) => Array<string | null | undefined>) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () => (rows && q ? rows.filter((r) => fields(r).some((f) => f?.toLowerCase().includes(q))) : rows),
    // fields is an inline lambda; the rows and the query are what change the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, q],
  );
  return { query, setQuery, filtered };
}
