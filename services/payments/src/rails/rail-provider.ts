/**
 * A rail is a way money physically moves between a bank and this platform.
 *
 * The interface is deliberately narrow, and deliberately *asynchronous in
 * shape even when a rail is synchronous*: `initiate` returns "I have handed
 * this to the rail", never "this has settled". A stub that settles instantly
 * still reports SETTLED through the same callback path a real rail uses, so
 * the settlement code is exercised identically in a demo and in production.
 * A StubRail that returned a settled result inline would let the whole
 * callback path go untested until the day a real rail was plugged in.
 */

export type RailStatus = 'REQUIRES_ACTION' | 'PROCESSING' | 'SETTLED' | 'FAILED';

export interface RailInitiation {
  /** The rail's own transaction id. What an inbound callback is matched on. */
  railRef: string;
  status: RailStatus;
  /**
   * Something the customer must do — an M-Pesa STK prompt on their phone, a
   * redirect, a bank reference to quote on a manual transfer. Null when the
   * rail needs nothing from them.
   */
  customerAction: string | null;
  failureReason?: string;
}

export interface RailRequest {
  intentId: string;
  amount: string;
  currency: string;
  /** Account reference at the far end: a bank account handle or a phone number. */
  accountRef: string;
  accountName: string;
  description: string;
}

export interface RailCallback {
  railRef: string;
  status: RailStatus;
  failureReason?: string;
  /** The amount the rail says actually moved, which is not always the amount asked for. */
  amount?: string;
  raw: Record<string, unknown>;
}

export interface RailProvider {
  readonly name: string;

  /** Pull money in from the customer's bank/wallet. */
  collect(req: RailRequest): Promise<RailInitiation>;

  /** Push money out to a bank account or beneficiary. */
  disburse(req: RailRequest): Promise<RailInitiation>;

  /**
   * Parses an inbound callback body into the shape the settlement code
   * understands, or returns null if it isn't one.
   *
   * Parsing lives in the rail rather than in a controller because every
   * provider's callback shape is different and none of them are documented
   * accurately. Keeping the mess behind this method is what stops it leaking
   * into the settlement path, which must stay simple enough to reason about
   * — it is the code that decides money moved.
   */
  parseCallback(body: unknown): RailCallback | null;
}
