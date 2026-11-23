import { Bell, Coins, Landmark, ScrollText, Send, ShieldCheck } from 'lucide-react';
import { FeatureCard } from '@damp/web-shared/ui';
import { FIAT, NOTES, TIERS } from './content';

function FiatVisual() {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {FIAT.map((w) => (
        <div key={w.code} className="flex items-center gap-3 rounded-[14px] bg-canvas px-3 py-2.5">
          <span className="grid size-8 place-items-center rounded-[10px] bg-navy text-[11px] font-extrabold text-white">{w.code}</span>
          <span className="flex-1 text-[13px] font-semibold">{w.name}</span>
          <span className="text-sm font-extrabold tabular-nums text-navy">{w.amt}</span>
        </div>
      ))}
    </div>
  );
}

function IssueVisual() {
  return (
    <div aria-hidden className="flex flex-col gap-3 rounded-[18px] bg-canvas p-3.5">
      <span className="flex items-baseline justify-between">
        <span className="text-xs font-semibold text-muted">You get</span>
        <span className="text-2xl font-extrabold tracking-tight text-navy">
          500.000000 <span className="text-[13px] font-semibold text-muted">USD-X</span>
        </span>
      </span>
      <span className="grid grid-cols-2 gap-2">
        <span className="flex items-center gap-2 rounded-xl border-2 border-action bg-white px-2.5 py-2 text-[13px] font-bold">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M12 2l6 10-6 3.5L6 12z" fill="#627EEA" />
            <path d="M12 16.5l6-3.5-6 9-6-9z" fill="#3C5BD6" />
          </svg>
          Ethereum
        </span>
        <span className="flex items-center gap-2 rounded-xl border border-line bg-white px-2.5 py-2 text-[13px] font-bold">
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M6 7h13l-2 2.5H4zM4 13h13l2 2.5H6zM6 17.5h13L17 20H4z" fill="#9945FF" />
          </svg>
          Solana
        </span>
      </span>
      <span className="font-mono text-[11px] text-subtle">1 USD = 1 USD-X · final in minutes</span>
    </div>
  );
}

function PayVisual() {
  return (
    <div aria-hidden className="relative flex flex-col gap-1.5 rounded-[18px] border border-dashed border-line-strong p-4">
      <span className="absolute right-3.5 top-3.5 -rotate-6 rounded-lg border-2 border-action px-2 py-0.5 text-xs font-extrabold tracking-[0.08em] text-action">PAID</span>
      <span className="font-mono text-[11px] text-subtle">INV-0042</span>
      <span className="text-[15px] font-extrabold text-navy">Design retainer, November</span>
      <span className="text-[22px] font-extrabold text-navy">$1,200.00</span>
      <span className="font-mono text-[11.5px] text-action-ink">damp.app/pay/7Hq2…</span>
    </div>
  );
}

function TierVisual() {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {TIERS.map((t) => (
        <div
          key={t.n}
          className={`flex items-center gap-3 rounded-[14px] border px-3 py-2.5 ${t.n === '2' ? 'border-action bg-action-tint' : 'border-line bg-canvas'}`}
        >
          <span className={`grid size-[26px] place-items-center rounded-full text-[11px] font-extrabold text-white ${t.n === '2' ? 'bg-action' : 'bg-line-strong'}`}>{t.n}</span>
          <span className="flex-1 text-[13px] font-bold text-navy">
            {t.name}
            {t.n === '2' && <span className="ml-1.5 text-[11px] font-semibold text-action-ink">· you are here</span>}
          </span>
          <span className="text-xs text-muted">{t.desc}</span>
        </div>
      ))}
    </div>
  );
}

function NotesVisual() {
  return (
    <div aria-hidden className="flex flex-col gap-2">
      {NOTES.map((n) => (
        <div key={n.text} className="flex items-center gap-3 rounded-[14px] bg-canvas px-3 py-2.5">
          <span className="size-2 shrink-0 rounded-full" style={{ background: n.dot }} />
          <span className="flex-1 text-[13px] font-semibold">{n.text}</span>
          <span className="text-[11.5px] text-subtle">{n.when}</span>
        </div>
      ))}
    </div>
  );
}

function LedgerVisual() {
  return (
    <div aria-hidden className="flex flex-col gap-1.5 rounded-2xl bg-black/20 p-3.5 font-mono text-xs">
      <span className="flex justify-between">
        <span className="text-cyan">DR</span>
        <span className="flex-1 pl-3">wallet:usd/you</span>
        <span>500.00</span>
      </span>
      <span className="flex justify-between">
        <span className="text-warn">CR</span>
        <span className="flex-1 pl-3">reserve:usdx</span>
        <span>500.00</span>
      </span>
      <span className="my-1 h-px bg-white/14" />
      <span className="flex justify-between text-on-navy-subtle">
        <span>txn_01JD8Q…</span>
        <span>balanced</span>
      </span>
    </div>
  );
}

export default function Bento() {
  return (
    <section aria-labelledby="bento-h" className="mx-auto flex w-full max-w-[1360px] flex-col gap-8 py-16">
      <div className="reveal flex flex-wrap items-end justify-between gap-6">
        <div className="flex max-w-2xl flex-col gap-3">
          <span className="eyebrow text-action">One account</span>
          <h2 id="bento-h" className="m-0 text-[32px] font-extrabold leading-[1.06] tracking-[-0.035em] text-navy sm:text-[44px]">
            Everything your money does, in one place.
          </h2>
        </div>
        <p className="m-0 max-w-md text-base leading-relaxed text-muted">
          Fiat and on-chain dollars side by side, with the same history, the same limits and the same receipts.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <FeatureCard icon={<Landmark className="size-[21px]" aria-hidden />} iconTone="action" title="Fiat wallets in three currencies" visual={<FiatVisual />}>
          Hold USD, EUR and KES. Top up from a linked bank or mobile money and withdraw back the same way.
        </FeatureCard>

        <FeatureCard icon={<Coins className="size-[21px]" aria-hidden />} iconTone="cyan" title="Issue and redeem USD-X" visual={<IssueVisual />}>
          Pick a chain, confirm once, and follow the mint until it's final. Redeeming burns the tokens and pays dollars back to your wallet.
        </FeatureCard>

        <FeatureCard icon={<Send className="size-[21px]" aria-hidden />} iconTone="action" title="Pay and get paid" visual={<PayVisual />}>
          Send to saved payees, or raise an invoice with a payment link anyone can open. You hear about it the moment money lands.
        </FeatureCard>

        <FeatureCard icon={<ShieldCheck className="size-[21px]" aria-hidden />} iconTone="cyan" title="Verified, with clear limits" visual={<TierVisual />}>
          See your tier, what it lets you do, and exactly which document raises it. No mystery holds.
        </FeatureCard>

        <FeatureCard icon={<Bell className="size-[21px]" aria-hidden />} iconTone="warn" title="Told the moment it happens" visual={<NotesVisual />}>
          Deposits, mints, payments and anything that needs you, in the app and by email. Nothing settles in silence.
        </FeatureCard>

        <FeatureCard icon={<ScrollText className="size-[21px]" aria-hidden />} dark title="A receipt for every cent" visual={<LedgerVisual />}>
          Each movement is a balanced pair of ledger lines with its own reference. Open any transaction and see both sides.
        </FeatureCard>
      </div>
    </section>
  );
}
