import { FAQ } from './content';

export default function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-h" className="mx-auto grid w-full max-w-[1360px] grid-cols-1 gap-10 py-16 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="reveal flex flex-col gap-3.5">
        <span className="eyebrow text-action">Questions</span>
        <h2 id="faq-h" className="m-0 text-[32px] font-extrabold leading-[1.06] tracking-[-0.035em] text-navy sm:text-[44px]">
          Straight answers.
        </h2>
        <p className="m-0 max-w-sm text-base leading-relaxed text-muted">Something we didn't cover? Ask from inside the app and a person replies.</p>
      </div>
      <div className="flex flex-col gap-2.5">
        {FAQ.map((item) => (
          <details key={item.q} className="reveal group rounded-[18px] border border-line bg-canvas px-5 py-1">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 text-base font-bold text-navy">
              {item.q}
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1463D6" strokeWidth="2.5" strokeLinecap="round" aria-hidden className="shrink-0 transition-transform group-open:rotate-45">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </summary>
            <p className="m-0 pb-4 text-[15px] leading-relaxed text-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
