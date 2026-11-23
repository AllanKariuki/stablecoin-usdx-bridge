import { FACTS } from './content';

/** Four true facts — no figures beyond what the product actually guarantees. */
export default function Facts() {
  return (
    <section
      aria-label="DAMP at a glance"
      className="reveal mx-auto grid w-full max-w-[1360px] grid-cols-2 gap-3.5 lg:grid-cols-4"
    >
      {FACTS.map((f) => (
        <div key={f.value} className="flex flex-col gap-1.5 rounded-[22px] border border-line bg-surface p-6">
          <span className="text-[26px] sm:text-[38px] font-extrabold leading-none tracking-[-0.04em] text-navy">{f.value}</span>
          <span className="text-sm leading-relaxed text-muted">{f.label}</span>
        </div>
      ))}
    </section>
  );
}
