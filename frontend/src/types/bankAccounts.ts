/**
 * The shapes services/payments actually returns.
 *
 * What this file used to hold was a guess — `UserBankAccount` with a full
 * `accountNumber` and a `balance?: number`, plus ~110 lines of `MOCK_*`
 * fixtures that the Redux slice wrote into state whenever a request failed.
 * Two of those fields could never be served by a real backend:
 *
 *  - **The account number.** services/payments stores only the last four
 *    digits (see `bank_accounts.account_last4`): once the rail has its own
 *    opaque handle, the number is a credential for the customer's bank
 *    relationship and nothing more. There is no endpoint that can reveal it,
 *    which is why the UI's old "reveal account number" eye toggle went with
 *    it — it was revealing mock data.
 *  - **The balance.** A bank account's balance is the bank's to know. What
 *    this platform knows is a *wallet* balance, which lives in core-ledger and
 *    is rendered as a `Money` object, never a float.
 */

export interface Bank {
  id: string;
  name: string;
  country: string;
  currency: string;
  swiftCode: string;
  /** Which RailProvider moves money to and from this institution. */
  rail: string;
  logoUrl: string;
}

export type BankAccountStatus = 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REMOVED';

export interface BankAccount {
  id: string;
  bankId: string;
  bankName: string;
  accountName: string;
  /**
   * `••••1234`. Everything the platform holds, not a redaction of something it
   * could show if asked.
   */
  accountNumberMasked: string;
  currency: string;
  /**
   * PENDING until a rail confirms the customer controls the account.
   * A withdrawal may only target a VERIFIED account — paying out to one
   * nobody has proved they control is the mistake this distinction exists to
   * prevent.
   */
  status: BankAccountStatus;
  isDefault: boolean;
  verifiedAt: string | null;
}

export interface Beneficiary {
  id: string;
  name: string;
  /** WALLET pays another DAMP party; BANK and MOBILE leave the platform. */
  kind: 'BANK' | 'WALLET' | 'MOBILE';
  bankId: string | null;
  accountRef: string;
  currency: string;
  targetPartyId: string;
}

export interface SavedBank {
  id: string;
  name: string;
  type: string;
  accountNumber: string;
  accountHolder: string;
  lastTransfer?: {
    amount: number;
    date: string;
  };
  isDefault?: boolean;
}
