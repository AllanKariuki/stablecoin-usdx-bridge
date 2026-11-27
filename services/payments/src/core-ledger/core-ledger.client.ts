import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';

export interface LedgerEntry {
  line_no: number;
  account_id: string;
  direction: string;
  currency: string;
  amount: string;
  running_balance: string;
  description: string;
}

export interface LedgerTransaction {
  id: string;
  type: string;
  status: string;
  created_at: string;
  /**
   * The transaction's own record of the numbers behind its postings. An FX
   * payment carries gross/fee/net there, in the target currency's smallest
   * units as integer strings — the net is the figure the payee's wallet was
   * credited, and the only place payments can read it back.
   */
  metadata?: Record<string, unknown>;
  /** The journal legs, rendered with decimal amounts at each currency's
   * scale. Read for display; settlement's checks go through `metadata`. */
  entries?: LedgerEntry[];
}

export interface LedgerWallet {
  id: string;
  user_id: string;
  currency: string;
  chain: string;
  status: string;
  balance?: string;
}

/** The subset of POST /redemptions' 202 response payments reads. */
export interface LedgerRedemption {
  id: string;
  type: string;
  status: string;
  /** The saga's stable id — polled via GET /transfers/:correlationId. */
  correlation_id?: string;
  saga_status?: string;
}

/** The subset of GET /transfers/:correlationId payments reads. */
export interface LedgerTransfer {
  correlation_id: string;
  kind: string;
  status: string;
  amount: string;
  source_chain: string;
  last_error: string;
}

/**
 * payments' only write to core-ledger.
 *
 * The endpoints below are the *whole* interface, and that is the point:
 * payments owns workflow state and core-ledger owns value, so settling an
 * intent is one call that either posts a journal transaction or doesn't.
 * There is no path here that leaves a payment half-settled, because there is
 * no second write to fail.
 *
 * `reference` carries the intent id. core-ledger's Deposit, Withdraw and
 * PayConverted stamp `entity_type = BANK_PAYMENT` with `entity_id =
 * reference`, so Repository.TransactionsForEntity walks straight from an
 * intent to its journal legs — the back-reference comes free, with no foreign
 * key between two services' databases.
 */
@Injectable()
export class CoreLedgerClient {
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    private readonly serviceTokens: ServiceTokenClient,
  ) {
    this.baseUrl = config.get<string>('CORE_LEDGER_URL', { infer: true })!;
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

  /**
   * Settles a payment across a quote: the payer's wallet debits `amount` in
   * its own currency, the payee's wallet credits the conversion's net in
   * another. The quote is pinned to exactly `amount` and the payer (the
   * source wallet's owner) — the ledger refuses any other consumption, which
   * is the whole of the guard this side needs.
   */
  async payConverted(input: {
    fromWalletId: string;
    toWalletId: string;
    amount: string;
    quoteId: string;
    reference: string;
    idempotencyKey: string;
    actor: string;
  }): Promise<LedgerTransaction> {
    return this.post('/fx/payments', input.idempotencyKey, input.actor, {
      from_wallet_id: input.fromWalletId,
      to_wallet_id: input.toWalletId,
      amount: input.amount,
      quote_id: input.quoteId,
      entity_type: 'BANK_PAYMENT',
      entity_id: input.reference,
    });
  }

  /**
   * Starts a USD-X redemption: the USD-X wallet debits into suspense now,
   * and the USD lands in the payer's USD wallet only once the burn saga
   * confirms on chain. The response's correlation_id is polled with
   * getTransfer until the saga reaches a terminal state.
   */
  async redeem(input: {
    usdxWalletId: string;
    fiatWalletId: string;
    amount: string;
    idempotencyKey: string;
    actor: string;
  }): Promise<LedgerRedemption> {
    return this.post('/redemptions', input.idempotencyKey, input.actor, {
      usdx_wallet_id: input.usdxWalletId,
      fiat_wallet_id: input.fiatWalletId,
      amount: input.amount,
    });
  }

  /** Reads one wallet by id; null when the ledger has never seen it. */
  async getWallet(walletId: string, actor: string): Promise<LedgerWallet | null> {
    return this.get(`/wallets/${encodeURIComponent(walletId)}`, actor, (json) => json as LedgerWallet);
  }

  /** Reads a bridge saga by correlation id; null when there is no such saga. */
  async getTransfer(correlationId: string, actor: string): Promise<LedgerTransfer | null> {
    return this.get(`/transfers/${encodeURIComponent(correlationId)}`, actor, (json) => json as LedgerTransfer);
  }

  /** Finds a party's wallet in a currency, creating it if it doesn't exist. */
  async ensureWallet(partyId: string, currency: string): Promise<LedgerWallet> {
    const res = await fetch(new URL('/wallets', this.baseUrl), {
      method: 'POST',
      headers: { ...(await this.headers(partyId)), 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: partyId, currency, label: 'Main' }),
    });
    if (!res.ok) {
      throw new Error(`core-ledger POST /wallets returned ${res.status}`);
    }
    return (await res.json()) as LedgerWallet;
  }

  private async post<T>(
    path: string,
    idempotencyKey: string,
    actor: string,
    body: Record<string, unknown>,
  ): Promise<T> {
    const res = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: {
        ...(await this.headers(actor)),
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
    return JSON.parse(text) as T;
  }

  private async get<T>(path: string, actor: string, parse: (json: unknown) => T): Promise<T | null> {
    const res = await fetch(new URL(path, this.baseUrl), { headers: await this.headers(actor) });
    if (res.status === 404) return null;
    const text = await res.text();
    if (!res.ok) {
      throw new LedgerError(`core-ledger ${path} returned ${res.status}: ${text.slice(0, 500)}`, res.status, text);
    }
    return parse(JSON.parse(text));
  }

  // The party a settlement acts for (X-User-Id, so the journal names the
  // customer) plus payments' own service-account bearer: core-ledger
  // authenticates every call (H2) and payments holds ledger.settlement.
  private async headers(actor: string): Promise<Record<string, string>> {
    return {
      'X-User-Id': actor,
      Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
    };
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

  /**
   * The refusal's error code, read from the platform error envelope. Best
   * effort: a proxy's HTML error page is not a ledger refusal and carries
   * none.
   */
  get code(): string {
    try {
      const parsed = JSON.parse(this.body) as { code?: unknown };
      if (typeof parsed.code === 'string') return parsed.code;
    } catch {
      // not the error envelope
    }
    return '';
  }
}
