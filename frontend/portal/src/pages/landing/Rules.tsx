import { RULES } from './content';

export default function Rules() {
  return (
    <section aria-labelledby="rules-h" className="mx-auto flex w-full max-w-[1360px] flex-col gap-8 py-16">
      <div className="reveal flex max-w-2xl flex-col gap-3">
        <span className="eyebrow text-action">How we keep it honest</span>
        <h2 id="rules-h" className="m-0 text-[32px] font-extrabold leading-[1.06] tracking-[-0.035em] text-navy sm:text-[44px]">
          Four rules the system can't break.
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {RULES.map((r) => (
          <article key={r.n} className="reveal flex flex-col gap-3.5 rounded-[24px] border border-line bg-surface p-6">
            <span className="font-mono text-[40px] font-semibold leading-none text-line-strong">{r.n}</span>
            <h3 className="m-0 text-lg font-extrabold text-navy">{r.title}</h3>
            <p className="m-0 text-sm leading-relaxed text-muted">{r.body}</p>
            <code className="mt-auto w-fit rounded-lg bg-action-tint px-2.5 py-1.5 font-mono text-[11.5px] text-action-ink">{r.code}</code>
          </article>
        ))}
      </div>
    </section>
  );
}
