/**
 * Copy and data for the public landing. The hero product preview and the
 * bento mini-visuals are illustrative: they render inside `aria-hidden`
 * containers and their sample values are static strings — never counted and
 * never read as live figures (PLAN.md money rules).
 */

// TODO: confirm this address before launch.
export const BUSINESS_CONTACT = 'mailto:business@damp.example';

// Mirrors the OPS_CONSOLE entry in portal/src/App.tsx (the console dev server).
export const OPS_CONSOLE_URL = 'http://localhost:5174';

export const NAV_LINKS = [
  { href: '#how', label: 'How it works' },
  { href: '#proof', label: 'Reserves' },
  { href: '#business', label: 'For business' },
  { href: '#faq', label: 'Questions' },
];

export const PROMISES = [
  'Every balance is a line in a double-entry ledger you can inspect.',
  'USD-X is minted only against dollars already held in reserve.',
  'Nothing moves without your confirmation, and nothing moves twice.',
];

/** Sample journal lines for the hero ledger tape — illustrative, aria-hidden. */
export interface TapeLine {
  side: 'DR' | 'CR' | 'MINT' | 'BURN';
  acct: string;
  amt: string;
  ref: string;
}

export const TAPE: TapeLine[] = [
  { side: 'DR', acct: 'wallet:usd/7f2c', amt: '1,000.00', ref: 'dep_01JD8M' },
  { side: 'CR', acct: 'rail:bank/in', amt: '1,000.00', ref: 'dep_01JD8M' },
  { side: 'DR', acct: 'wallet:usd/7f2c', amt: '500.00', ref: 'iss_01JD8Q' },
  { side: 'CR', acct: 'reserve:usdx', amt: '500.00', ref: 'iss_01JD8Q' },
  { side: 'MINT', acct: 'eth:0x9f3a…c21e', amt: '500.000000', ref: 'final' },
  { side: 'DR', acct: 'wallet:kes/31aa', amt: '12,900.00', ref: 'pay_01JD8V' },
  { side: 'CR', acct: 'wallet:kes/b04e', amt: '12,900.00', ref: 'pay_01JD8V' },
  { side: 'BURN', acct: 'sol:4Ny…kPq', amt: '250.000000', ref: 'final' },
  { side: 'DR', acct: 'reserve:usdx', amt: '250.00', ref: 'red_01JD91' },
  { side: 'CR', acct: 'wallet:usd/e81d', amt: '250.00', ref: 'red_01JD91' },
];

/** Static strings selected by the hero's issuing step — no counting, no arithmetic. */
export const HERO_TOTAL = ['$3,080.00', '$3,080.00', '$3,080.00', '$3,580.00'];
export const HERO_USDX = ['600.00', '600.00', '600.00', '1,100.00'];
export const HERO_STEP_LABELS = [
  'Funds reserved on the ledger',
  'Signer approved the mint',
  'Broadcast · waiting for blocks',
  'Final · tokens in your wallet',
];

export const FACTS = [
  { value: '1 : 1', label: 'Every USD-X redeemable for one US dollar' },
  { value: '2 chains', label: 'Ethereum and Solana, same balance, same rules' },
  { value: '3 currencies', label: 'USD, EUR and KES wallets, plus USD-X' },
  { value: 'Every move', label: 'has a ledger entry and a notification' },
];

export interface FlowStep {
  title: string;
  body: string;
  status: string;
  /** Stroke-based SVG path, drawn at 24×24. */
  icon: string;
}

export const ISSUE_STEPS: FlowStep[] = [
  {
    title: 'Fund your wallet',
    body: 'Deposit dollars from a linked bank or mobile money. They land in your USD wallet.',
    status: 'deposit · settled',
    icon: 'M12 5v14M5 12l7 7 7-7',
  },
  {
    title: 'Ledger reserves it',
    body: 'The amount moves to reserve in one balanced entry, so it can never be spent twice.',
    status: 'DR wallet · CR reserve',
    icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  },
  {
    title: 'Signer mints USD-X',
    body: 'A guarded signer mints exactly that amount on Ethereum or Solana, to the address you chose.',
    status: 'mint · settled',
    icon: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  },
  {
    title: 'Final on chain',
    body: 'We wait for finality, then mark it done and send you the transaction hash.',
    status: 'final · on chain',
    icon: 'M20 6L9 17l-5-5',
  },
];

export const REDEEM_STEPS: FlowStep[] = [
  {
    title: 'Send USD-X back',
    body: 'Choose an amount to redeem. The tokens go to the burn address on the chain they live on.',
    status: 'transfer · pending',
    icon: 'M22 2L11 13M22 2l-7 20-4-9-9-4z',
  },
  {
    title: 'Burn confirmed',
    body: 'Once the burn is final, supply drops by exactly that amount. Nothing is paid out before this.',
    status: 'burn · final',
    icon: 'M12 2v20M5 12h14',
  },
  {
    title: 'Ledger releases it',
    body: 'Reserve releases the dollars to your USD wallet in one balanced entry.',
    status: 'DR reserve · CR wallet',
    icon: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z',
  },
  {
    title: 'Withdraw to your bank',
    body: 'Keep it in the wallet or pay it out to your linked bank or mobile money.',
    status: 'payout · sent',
    icon: 'M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M2 10l10-6 10 6',
  },
];

/** Proof-of-reserves checks — mechanism only, no figures (PLAN.md rule 1). */
export const RESERVE_CHECKS = [
  'On-chain supply matches the ledger',
  'Ledger reserve matches the custodian',
  'Independent attestation published',
];

export const RULES = [
  {
    n: '01',
    title: 'Double-entry, always',
    body: 'Every movement is two equal lines. If they do not balance, the write is refused.',
    code: 'sum(debits) = sum(credits)',
  },
  {
    n: '02',
    title: 'Mint only against reserve',
    body: 'USD-X is created only after the same dollars are locked in reserve on the ledger.',
    code: 'supply ≤ reserve',
  },
  {
    n: '03',
    title: 'Nothing moves twice',
    body: 'Each request carries a unique key. A retry returns the first result instead of paying again.',
    code: 'Idempotency-Key: 7c1e…',
  },
  {
    n: '04',
    title: 'Every action leaves a trail',
    body: 'Staff actions go into an append-only log where each entry is chained to the last.',
    code: 'hash(n) = H(entry, hash(n-1))',
  },
];

export const PERSONAL = [
  'A USD wallet and USD-X, held side by side.',
  'Top up and cash out with your bank or mobile money.',
  'Send to anyone, or share a payment link.',
  'See your tier and limits at a glance.',
];

export const BUSINESS_POINTS = [
  'Set who can propose and who can approve, per amount.',
  'Invoices with payment links your customers can open without an account.',
  'A full, exportable history for your accountant.',
];

export const FAQ = [
  {
    q: 'What is USD-X?',
    a: 'A digital dollar on Ethereum and Solana. Each one is created only when a dollar is placed in reserve, and destroyed when you redeem it back.',
  },
  {
    q: 'How long does issuing take?',
    a: 'The ledger side is instant. On chain it depends on finality: usually a couple of minutes on Ethereum and seconds on Solana.',
  },
  {
    q: 'Do I need my own crypto wallet?',
    a: 'No. We hold the token account for you, and every movement shows up in your history.',
  },
  {
    q: 'Can I get my dollars back?',
    a: 'Redeeming burns the USD-X and pays dollars to your USD wallet. From there, withdraw to your linked bank or mobile money.',
  },
];

/* Illustrative bento visual data — rendered aria-hidden. */
export const FIAT = [
  { code: 'USD', name: 'US dollar', amt: '$2,480.00' },
  { code: 'EUR', name: 'Euro', amt: '€310.50' },
  { code: 'KES', name: 'Kenyan shilling', amt: 'KSh 18,900' },
];

export const TIERS = [
  { n: '1', name: 'Basic', desc: 'Everyday personal use' },
  { n: '2', name: 'Verified', desc: 'ID checked' },
  { n: '3', name: 'Enhanced', desc: 'Raise it with proof of address' },
];

export const NOTES = [
  { text: 'Money landed · +$1,000.00', when: 'now', dot: '#1463D6' },
  { text: '500 USD-X final on Ethereum', when: '2 min', dot: '#1FD3E6' },
  { text: 'Invoice INV-0042 was paid', when: '1 h', dot: '#B4530A' },
];
