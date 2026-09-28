import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface LedgerTransaction {
  id: string;
  type: string;
  status: string;
  created_at: string;
}

export interface LedgerWallet {
  id: string;
  user_id: string;
  currency: string;
  chain: string;
  balance?: string;
}

/**
 * payments' only write to core-ledger.
 *
 * The three endpoints below are the *whole* interface, and that is the point:
 * payments owns workflow state and core-ledger owns value, so settling an
 * intent is one call that either posts a journal transaction or doesn't.
 * There is no path here that leaves a payment half-settled, because there is
 * no second write to fail.
 *
 * `reference` carries the intent id. core-ledger's Deposit and Withdraw stamp
 * `entity_type = BANK_PAYMENT` with `entity_id = reference`, so
 * Repository.TransactionsForEntity walks straight from an intent to its
 * journal legs — the back-reference comes free, with no foreign key between
 * two services' databases.
 */
@Injectable()
export class CoreLedgerClient {
  private readonly baseUrl: string;
  private readonly serviceToken: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('CORE_LEDGER_URL', { infer: true })!;
    this.serviceToken = config.get<string>('CORE_LEDGER_SERVICE_TOKEN', { infer: true }) ?? '';
  }

  async deposit(input: {
    walletId: string;
    amount: string;
    reference: string;
    idempotencyKey: string;
    actor: string;
  }): Promise<LedgerTransaction> {
    return this.post('/deposits', input.idempotencyKey, input.actor, {
      wallet_id: input.walletId,
      amount: input.amount,
      reference: input.reference,
    });
  }

  async withdraw(input: {
    walletId: string;
    amount: string;
    reference: string;
    idempotencyKey: string;
    actor: string;
  }): Promise<LedgerTransaction> {
    return this.post('/withdrawals', input.idempotencyKey, input.actor, {
      wallet_id: input.walletId,
      amount: input.amount,
      reference: input.reference,
      entity_type: 'BANK_PAYMENT',
      entity_id: input.reference,
    });
  }

  async transfer(input: {
    fromWalletId: string;
    toWalletId: string;
    amount: string;
    reference: string;
    idempotencyKey: string;
    actor: string;
  }): Promise<LedgerTransaction> {
    return this.post('/transfers', input.idempotencyKey, input.actor, {
      from_wallet_id: input.fromWalletId,
      to_wallet_id: input.toWalletId,
      amount: input.amount,
      reference: input.reference,
      // Transfer stamps no entity of its own, which is why an invoice
      // settlement, a treasury rebalance and a payroll run used to be
      // indistinguishable in the journal. P2 added the pass-through; this is
      // the first caller to use it.
      entity_type: 'BANK_PAYMENT',
      entity_id: input.reference,
    });
  }

  /** Finds a party's wallet in a currency, creating it if it doesn't exist. */
  async ensureWallet(partyId: string, currency: string): Promise<LedgerWallet> {
    const res = await fetch(new URL('/wallets', this.baseUrl), {
      method: 'POST',
      headers: { ...this.headers(partyId), 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: partyId, currency, label: 'Main' }),
    });
    if (!res.ok) {
      throw new Error(`core-ledger POST /wallets returned ${res.status}`);
    }
    return (await res.json()) as LedgerWallet;
  }

  private async post(
    path: string,
    idempotencyKey: string,
    actor: string,
    body: Record<string, unknown>,
  ): Promise<LedgerTransaction> {
    const res = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: {
        ...this.headers(actor),
        'Content-Type': 'application/json',
        // Derived from the intent, never generated: a retried settlement must
        // replay the first call's bytes rather than post a second journal
        // transaction. This is the guarantee that makes a duplicate rail
        // callback harmless.
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
    });

    const text = await res.text();
    if (!res.ok) {
      throw new LedgerError(`core-ledger ${path} returned ${res.status}: ${text.slice(0, 500)}`, res.status, text);
    }
    return JSON.parse(text) as LedgerTransaction;
  }

  private headers(actor: string): Record<string, string> {
    const headers: Record<string, string> = { 'X-User-Id': actor };
    if (this.serviceToken) headers['X-Service-Token'] = this.serviceToken;
    return headers;
  }
}

/**
 * A rejection from the ledger, with its status preserved.
 *
 * The distinction matters at settlement: a 4xx is the ledger saying this
 * movement is not allowed (overdrawn, frozen, closed period) and will say so
 * identically forever, so the intent fails. A 5xx or a network error is "we
 * don't know", and an intent must not be marked FAILED on a don't-know — the
 * rail has already moved the money.
 */
export class LedgerError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = 'LedgerError';
  }

  get terminal(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}
