import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RailCallback, RailInitiation, RailProvider, RailRequest } from './rail-provider';
import { toScaled } from '../money/money';

/**
 * M-Pesa, through Safaricom's Daraja sandbox.
 *
 * Chosen over every other real rail for one reason the plan states outright:
 * it is free and self-service. No contract, no sales call, no minimum volume
 * — which is the test for whether a real integration belongs in a phase at
 * all. KES is already a seeded currency in core-ledger, so nothing else has
 * to change to accommodate it.
 *
 * Two Daraja APIs are used:
 *   - **STK Push** (`/mpesa/stkpush/v1/processrequest`) to collect. The
 *     customer gets a PIN prompt on their handset; the result arrives at our
 *     callback minutes later, or never if they ignore it.
 *   - **B2C** (`/mpesa/b2c/v1/paymentrequest`) to disburse.
 *
 * Both are genuinely asynchronous, which is why RailProvider's shape is
 * asynchronous even for the stub.
 */
@Injectable()
export class MpesaRail implements RailProvider {
  readonly name = 'mpesa';
  private readonly logger = new Logger(MpesaRail.name);

  private readonly baseUrl: string;
  private readonly consumerKey: string;
  private readonly consumerSecret: string;
  private readonly shortcode: string;
  private readonly passkey: string;
  private readonly callbackUrl: string;

  private token: { value: string; expiresAt: number } | null = null;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('MPESA_BASE_URL', { infer: true })!;
    this.consumerKey = config.get<string>('MPESA_CONSUMER_KEY', { infer: true }) ?? '';
    this.consumerSecret = config.get<string>('MPESA_CONSUMER_SECRET', { infer: true }) ?? '';
    this.shortcode = config.get<string>('MPESA_SHORTCODE', { infer: true }) ?? '';
    this.passkey = config.get<string>('MPESA_PASSKEY', { infer: true }) ?? '';
    this.callbackUrl = config.get<string>('MPESA_CALLBACK_URL', { infer: true }) ?? '';
  }

  /** Whether this rail is usable at all. Unconfigured is a normal state. */
  get configured(): boolean {
    return Boolean(this.consumerKey && this.consumerSecret && this.shortcode);
  }

  async collect(req: RailRequest): Promise<RailInitiation> {
    this.assertConfigured();

    // Daraja takes whole shillings only. Sending "100.50" is silently
    // truncated by the API, which would settle a different amount than the
    // intent records — so it is refused here instead.
    const whole = this.wholeShillings(req.amount);

    const timestamp = this.timestamp();
    const body = {
      BusinessShortCode: this.shortcode,
      Password: Buffer.from(`${this.shortcode}${this.passkey}${timestamp}`).toString('base64'),
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: whole,
      PartyA: this.msisdn(req.accountRef),
      PartyB: this.shortcode,
      PhoneNumber: this.msisdn(req.accountRef),
      CallBackURL: this.callbackUrl,
      // Both appear on the customer's SMS receipt. The intent id in
      // AccountReference is what makes a statement line traceable back here
      // by a human reading the receipt, independent of the callback.
      AccountReference: req.intentId.slice(0, 12),
      TransactionDesc: req.description.slice(0, 13) || 'DAMP deposit',
    };

    this.logger.log(`STK push ${whole} KES to ${this.maskMsisdn(req.accountRef)} for intent ${req.intentId}`);
    const res = await this.post('/mpesa/stkpush/v1/processrequest', body);
    const checkoutId = typeof res.CheckoutRequestID === 'string' ? res.CheckoutRequestID : '';
    if (!checkoutId) {
      return {
        railRef: '',
        status: 'FAILED',
        customerAction: null,
        failureReason: `Daraja returned no CheckoutRequestID: ${JSON.stringify(res).slice(0, 300)}`,
      };
    }

    return {
      railRef: checkoutId,
      status: 'REQUIRES_ACTION',
      customerAction: `Enter your M-Pesa PIN on ${this.maskMsisdn(req.accountRef)} to approve KES ${whole}.`,
    };
  }

  async disburse(req: RailRequest): Promise<RailInitiation> {
    this.assertConfigured();
    const whole = this.wholeShillings(req.amount);

    const res = await this.post('/mpesa/b2c/v1/paymentrequest', {
      OriginatorConversationID: req.intentId,
      InitiatorName: this.shortcode,
      CommandID: 'BusinessPayment',
      Amount: whole,
      PartyA: this.shortcode,
      PartyB: this.msisdn(req.accountRef),
      Remarks: req.description.slice(0, 100) || 'DAMP payout',
      QueueTimeOutURL: this.callbackUrl,
      ResultURL: this.callbackUrl,
    });

    this.logger.log(`B2C ${whole} KES to ${this.maskMsisdn(req.accountRef)} for intent ${req.intentId}`);
    const conversationId = typeof res.ConversationID === 'string' ? res.ConversationID : '';
    if (!conversationId) {
      return {
        railRef: '',
        status: 'FAILED',
        customerAction: null,
        failureReason: `Daraja returned no ConversationID: ${JSON.stringify(res).slice(0, 300)}`,
      };
    }
    return { railRef: conversationId, status: 'PROCESSING', customerAction: null };
  }

  /**
   * Daraja's callback shapes, both of them.
   *
   * This method is where the mess is allowed to live. STK Push nests its
   * result under `Body.stkCallback` with a `ResultCode` where 0 is success
   * and everything else is a failure whose meaning is in a free-text
   * `ResultDesc`; B2C nests a different shape under `Result`. Neither is
   * documented accurately. Keeping both behind one parse is what stops any
   * of it reaching the settlement path.
   */
  parseCallback(body: unknown): RailCallback | null {
    if (typeof body !== 'object' || body === null) return null;
    const b = body as Record<string, any>;

    // --- STK Push ---
    const stk = b.Body?.stkCallback;
    if (stk && typeof stk.CheckoutRequestID === 'string') {
      const ok = Number(stk.ResultCode) === 0;
      return {
        railRef: stk.CheckoutRequestID,
        status: ok ? 'SETTLED' : 'FAILED',
        failureReason: ok ? undefined : String(stk.ResultDesc ?? `ResultCode ${stk.ResultCode}`),
        amount: ok ? this.amountFromStkMetadata(stk) : undefined,
        raw: b,
      };
    }

    // --- B2C ---
    const result = b.Result;
    if (result && typeof result.ConversationID === 'string') {
      const ok = Number(result.ResultCode) === 0;
      return {
        railRef: result.ConversationID,
        status: ok ? 'SETTLED' : 'FAILED',
        failureReason: ok ? undefined : String(result.ResultDesc ?? `ResultCode ${result.ResultCode}`),
        raw: b,
      };
    }

    return null;
  }

  /**
   * The amount M-Pesa says actually moved.
   *
   * It is read from the callback rather than assumed equal to the request,
   * because it isn't always: a customer can be charged a different amount by
   * the operator, and settling the requested figure when the rail moved
   * another is how a ledger stops matching a bank statement.
   */
  private amountFromStkMetadata(stk: Record<string, any>): string | undefined {
    const items: Array<{ Name?: string; Value?: unknown }> = stk.CallbackMetadata?.Item ?? [];
    const amount = items.find((i) => i.Name === 'Amount')?.Value;
    if (amount === undefined || amount === null) return undefined;
    // Daraja sends it as a JSON number of whole shillings. Rendering it back
    // as a 2dp decimal string is the boundary where it re-enters this
    // platform's "amounts are strings" discipline.
    return `${Math.trunc(Number(amount))}.00`;
  }

  private wholeShillings(amount: string): number {
    const scaled = toScaled(amount, 2);
    if (scaled % 100n !== 0n) {
      throw new Error(
        `M-Pesa moves whole shillings only; ${amount} has cents. Daraja truncates silently, which would settle a different amount than the intent records.`,
      );
    }
    return Number(scaled / 100n);
  }

  /** Daraja wants 2547XXXXXXXX: no plus, no leading zero. */
  private msisdn(raw: string): string {
    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('254')) return digits;
    if (digits.startsWith('0')) return `254${digits.slice(1)}`;
    if (digits.length === 9) return `254${digits}`;
    return digits;
  }

  private maskMsisdn(raw: string): string {
    const m = this.msisdn(raw);
    return m.length > 4 ? `${'•'.repeat(m.length - 4)}${m.slice(-4)}` : m;
  }

  private timestamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new Error(
        'the M-Pesa rail is not configured (MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET / MPESA_SHORTCODE); ' +
          'use the stub rail, or get sandbox credentials from developer.safaricom.co.ke',
      );
    }
  }

  /**
   * Daraja's OAuth token lives an hour. Cached with a minute of headroom
   * rather than refreshed per request — a token fetch per STK push doubles
   * the latency of a call the customer is waiting on.
   */
  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.token.expiresAt) return this.token.value;

    const basic = Buffer.from(`${this.consumerKey}:${this.consumerSecret}`).toString('base64');
    const res = await fetch(new URL('/oauth/v1/generate?grant_type=client_credentials', this.baseUrl), {
      headers: { Authorization: `Basic ${basic}` },
    });
    if (!res.ok) {
      throw new Error(`Daraja token request returned ${res.status}`);
    }
    const body = (await res.json()) as { access_token?: string; expires_in?: string };
    if (!body.access_token) throw new Error('Daraja returned no access_token');

    const ttl = Number(body.expires_in ?? 3599);
    this.token = { value: body.access_token, expiresAt: Date.now() + (ttl - 60) * 1000 };
    return this.token.value;
  }

  private async post(path: string, body: unknown): Promise<Record<string, any>> {
    const token = await this.accessToken();
    const res = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: Record<string, any> = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error(`Daraja ${path} returned ${res.status} with a non-JSON body: ${text.slice(0, 300)}`);
    }
    if (!res.ok) {
      throw new Error(`Daraja ${path} returned ${res.status}: ${text.slice(0, 300)}`);
    }
    return parsed;
  }
}
