/** Pretty-printed JSON for evidence fields (provider results, audit before/after states). */
export function JsonBlock({ value, label }: { value: unknown; label?: string }) {
  const empty = value === null || value === undefined || (typeof value === 'object' && Object.keys(value as object).length === 0);
  return (
    <figure className="m-0">
      {label && <figcaption className="eyebrow mb-1.5 text-[11px]">{label}</figcaption>}
      {empty ? (
        <p className="text-sm text-subtle">None recorded.</p>
      ) : (
        <pre className="m-0 max-h-80 overflow-auto rounded-[12px] border border-line bg-canvas p-3 font-mono text-[12px] leading-relaxed text-navy">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </figure>
  );
}
