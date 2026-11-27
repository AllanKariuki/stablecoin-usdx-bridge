import { useMemo, useState } from 'react';
import { ArrowLeftRight, CircleHelp, Coins, Landmark, Search, Send, ShieldCheck, Wallet } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, EmptyState, Input, LinkButton, PageHeader } from '@damp/web-shared/ui';

interface Topic {
  id: string;
  title: string;
  icon: LucideIcon;
  link?: { to: string; label: string };
  faqs: Array<{ q: string; a: string }>;
}

/**
 * Answers describe how the platform actually behaves — every claim here is
 * one the backend enforces (quotes, single-use keys, verified payouts, the
 * USD-X peg), so the help never promises something the money path doesn't.
 */
const TOPICS: Topic[] = [
  {
    id: 'wallets',
    title: 'Wallets',
    icon: Wallet,
    link: { to: '/wallets', label: 'Go to wallets' },
    faqs: [
      { q: 'Can I hold more than one wallet?', a: 'Yes. You can open one wallet per currency — US dollars, euros, pounds, Kenyan shillings, Bitcoin, Ether and Solana — plus USD-X on Ethereum and on Solana. Add one from Wallets → Add wallet.' },
      { q: 'Who holds my crypto?', a: 'Your Bitcoin, Ether and Solana are held for you by the platform with a regulated custodian. Your balance is a claim on that pooled holding, recorded on our ledger — you don’t need to manage keys or addresses.' },
      { q: 'What is a default wallet?', a: 'Where you hold more than one wallet in the same currency (USD-X on two chains), the default is the one payments land in when nobody names a specific wallet.' },
    ],
  },
  {
    id: 'convert',
    title: 'Converting',
    icon: ArrowLeftRight,
    link: { to: '/convert', label: 'Convert now' },
    faqs: [
      { q: 'How is the rate set?', a: 'We price every conversion from several market sources at once and take the middle price. If the sources disagree too much or go stale, we pause quoting that currency rather than give you a bad rate.' },
      { q: 'Why does the quote expire?', a: 'Crypto prices move quickly, so a crypto quote is valid for about 30 seconds (fiat for a few minutes). The screen fetches a fresh one automatically when it runs out — you always confirm against a live price.' },
      { q: 'What does it cost?', a: 'The spread shown on the quote is the only fee. What you see as “You receive” is exactly what lands in your wallet.' },
      { q: 'Why can’t I convert Bitcoin straight to USD-X?', a: 'USD-X is issued 1:1 against US dollars. Convert to USD first, then turn USD into USD-X — that keeps every USD-X backed by a real dollar.' },
    ],
  },
  {
    id: 'pay',
    title: 'Sending & paying',
    icon: Send,
    link: { to: '/send', label: 'Send money' },
    faqs: [
      { q: 'Can I pay from any wallet?', a: 'Yes. Pick the wallet to pay from — fiat, crypto or USD-X. If it’s a different currency from what the recipient gets, we quote the conversion and the recipient receives the exact amount in their currency.' },
      { q: 'Why does paying with USD-X take a few minutes?', a: 'Paying from USD-X first redeems it to dollars, which needs the tokens burned on-chain. Your payment completes as soon as the burn confirms; you can watch it on the receipt.' },
      { q: 'Can I pay a bank or M-Pesa from a crypto wallet?', a: 'Not in one step. Bank and M-Pesa payouts move a single currency, so convert to that currency first, then send.' },
    ],
  },
  {
    id: 'move',
    title: 'Deposits & withdrawals',
    icon: Landmark,
    link: { to: '/move/deposit', label: 'Add money' },
    faqs: [
      { q: 'How do I deposit with M-Pesa?', a: 'Choose M-Pesa, pick your shilling wallet, enter your number and confirm. Approve the prompt on your phone — your wallet is credited once M-Pesa confirms.' },
      { q: 'Why must a bank account be verified before I withdraw?', a: 'Withdrawals leave the platform for good, so we only pay out to accounts you’ve proved you control. Deposits can come from an unverified account.' },
      { q: 'I pressed confirm twice — will I be charged twice?', a: 'No. Every confirmation carries a one-time key, so a repeat returns the original result instead of moving money again.' },
    ],
  },
  {
    id: 'usdx',
    title: 'USD-X',
    icon: Coins,
    link: { to: '/usdx', label: 'Open USD-X' },
    faqs: [
      { q: 'What backs USD-X?', a: 'Every USD-X is issued against a US dollar held in reserve, and the reserves are reconciled against the token supply on both chains.' },
      { q: 'Can I move USD-X between Ethereum and Solana?', a: 'Yes — use “Move between chains” on the USD-X page. The tokens are burned on one chain and minted on the other; the timeline shows each step.' },
    ],
  },
  {
    id: 'security',
    title: 'Security & verification',
    icon: ShieldCheck,
    link: { to: '/verification', label: 'Verification' },
    faqs: [
      { q: 'Why do I need to verify my identity?', a: 'Regulations require it before you can move money in or out. Until you’re verified, deposits, withdrawals and payments are paused for your account.' },
      { q: 'How do I report something suspicious?', a: 'Contact support straight away from your registered email. We can freeze a wallet while we look into it.' },
    ],
  },
];

export default function HelpPage() {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();
  const topics = useMemo(
    () =>
      TOPICS.map((t) => ({ ...t, faqs: t.faqs.filter((f) => !q || `${f.q} ${f.a} ${t.title}`.toLowerCase().includes(q)) })).filter((t) => t.faqs.length > 0),
    [q],
  );

  return (
    <>
      <PageHeader eyebrow="Account" title="Help" description="How wallets, conversions and payments work here." />
      <div className="relative mb-5 max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
        <Input aria-label="Search help" placeholder="Search, e.g. “M-Pesa” or “fees”" className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      {topics.length === 0 ? (
        <EmptyState icon={<CircleHelp className="size-6" aria-hidden />} title="Nothing matches that">
          Try a shorter word, like “wallet” or “convert”.
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {topics.map((t) => (
            <Card key={t.id} className="reveal">
              <div className="mb-3 flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-[10px] bg-action-tint text-action">
                  <t.icon className="size-5" aria-hidden />
                </span>
                <h2 className="text-base font-extrabold tracking-tight text-navy">{t.title}</h2>
              </div>
              <div className="flex flex-col divide-y divide-line">
                {t.faqs.map((f) => (
                  <details key={f.q} className="group py-2.5" open={Boolean(q)}>
                    <summary className="cursor-pointer list-none text-sm font-semibold text-ink marker:hidden">{f.q}</summary>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted">{f.a}</p>
                  </details>
                ))}
              </div>
              {t.link && (
                <LinkButton to={t.link.to} variant="ghost" size="sm" className="mt-2">
                  {t.link.label}
                </LinkButton>
              )}
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
