import { PlatformException } from '@damp/nest-platform';
import { MpesaRail } from '../src/rails/mpesa.rail';
import { RailRequest } from '../src/rails/rail-provider';

/**
 * Daraja B2C authenticates as the API initiator configured in the portal, not
 * as the business shortcode: it needs InitiatorName and the initiator password
 * encrypted with Safaricom's public certificate. Without both, Daraja rejects
 * the request — so this rail refuses first, before any HTTP call, and keeps
 * STK deposits (which need neither) working.
 */

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;

const base = {
  MPESA_BASE_URL: 'https://sandbox.safaricom.co.ke',
  MPESA_CONSUMER_KEY: 'key',
  MPESA_CONSUMER_SECRET: 'secret',
  MPESA_SHORTCODE: '174379',
  MPESA_PASSKEY: 'passkey',
  MPESA_CALLBACK_URL: 'https://example.test/callback',
};

const request: RailRequest = {
  intentId: 'pi_1',
  amount: '250.00',
  currency: 'KES',
  accountRef: '254700000000',
  accountName: 'Recipient',
  description: 'payout',
};

const jsonResponse = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

const textResponse = (body: unknown) =>
  ({ ok: true, status: 200, text: async () => JSON.stringify(body) }) as unknown as Response;

describe('MpesaRail B2C credentials', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends the configured initiator name and security credential', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.includes('/oauth/v1/generate')) {
        return jsonResponse({ access_token: 'tok', expires_in: '3599' });
      }
      return textResponse({ ConversationID: 'conv-1' });
    });

    const rail = new MpesaRail(
      config({
        ...base,
        MPESA_INITIATOR_NAME: 'api-initiator',
        MPESA_SECURITY_CREDENTIAL: 'encrypted-blob',
      }),
    );

    const result = await rail.disburse(request);
    expect(result).toMatchObject({ railRef: 'conv-1', status: 'PROCESSING' });

    const b2c = calls.find((c) => c.url.includes('/mpesa/b2c/v1/paymentrequest'));
    expect(b2c).toBeDefined();
    const body = JSON.parse(String(b2c!.init!.body));
    expect(body.InitiatorName).toBe('api-initiator');
    expect(body.SecurityCredential).toBe('encrypted-blob');
    // One token request, one payment request — nothing else.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('refuses a payout when either credential is missing, before any HTTP call', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch');

    for (const missing of [
      { MPESA_INITIATOR_NAME: '', MPESA_SECURITY_CREDENTIAL: 'encrypted-blob' },
      { MPESA_INITIATOR_NAME: 'api-initiator', MPESA_SECURITY_CREDENTIAL: '' },
    ]) {
      const rail = new MpesaRail(config({ ...base, ...missing }));
      let caught: unknown;
      try {
        await rail.disburse(request);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeInstanceOf(PlatformException);
      expect((caught as PlatformException).getStatus()).toBe(422);
      expect((caught as PlatformException).getResponse()).toMatchObject({ code: 'RAIL_UNAVAILABLE' });
    }

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves STK deposits working without the payout credentials', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth/v1/generate')) {
        return jsonResponse({ access_token: 'tok', expires_in: '3599' });
      }
      return textResponse({ CheckoutRequestID: 'ws_CO_1' });
    });

    const rail = new MpesaRail(
      config({ ...base, MPESA_INITIATOR_NAME: '', MPESA_SECURITY_CREDENTIAL: '' }),
    );

    const result = await rail.collect(request);
    expect(result).toMatchObject({ railRef: 'ws_CO_1', status: 'REQUIRES_ACTION' });
  });
});
