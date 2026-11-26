import { PlatformException } from '@damp/nest-platform';
import { IntentsService } from '../src/intents/intents.service';
import { MpesaRail } from '../src/rails/mpesa.rail';
import { RailRegistry } from '../src/rails/rail.registry';
import { StubRail } from '../src/rails/stub.rail';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;

function registry(values: Record<string, unknown> = {}): RailRegistry {
  const cfg = config({ MPESA_BASE_URL: 'https://sandbox.safaricom.co.ke', ...values });
  return new RailRegistry(cfg, new StubRail(), new MpesaRail(cfg));
}

function railUnavailable(fn: () => unknown): PlatformException {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(PlatformException);
    return err as PlatformException;
  }
  throw new Error('expected RAIL_UNAVAILABLE, but the call succeeded');
}

describe('RailRegistry', () => {
  it('refuses an M-Pesa rail that is not configured instead of falling back to the stub', () => {
    const err = railUnavailable(() => registry({ STUB_RAIL_ENABLED: false }).get('mpesa'));
    expect(err.getStatus()).toBe(422);
    expect(err.getResponse()).toMatchObject({ code: 'RAIL_UNAVAILABLE' });
  });

  it('does not register the stub when STUB_RAIL_ENABLED is false', () => {
    const err = railUnavailable(() => registry({ STUB_RAIL_ENABLED: false }).get('stub'));
    expect(err.getStatus()).toBe(422);
    expect(err.getResponse()).toMatchObject({ code: 'RAIL_UNAVAILABLE' });
  });

  it('refuses an unknown rail name rather than falling back to anything', () => {
    const err = railUnavailable(() => registry({ STUB_RAIL_ENABLED: true }).get('paypal'));
    expect(err.getStatus()).toBe(422);
    expect(err.getResponse()).toMatchObject({ code: 'RAIL_UNAVAILABLE' });
  });

  it('returns the stub when a deployment explicitly enables it', () => {
    expect(registry({ STUB_RAIL_ENABLED: true }).get('stub').name).toBe('stub');
  });

  it('registers M-Pesa when it is configured, independently of the stub', () => {
    const rails = registry({
      STUB_RAIL_ENABLED: false,
      MPESA_CONSUMER_KEY: 'key',
      MPESA_CONSUMER_SECRET: 'secret',
      MPESA_SHORTCODE: '174379',
    });
    expect(rails.get('mpesa').name).toBe('mpesa');
    expect(rails.all().map((r) => r.name)).toEqual(['mpesa']);
  });
});

describe('IntentsService rail availability', () => {
  function harness() {
    const intents = { create: jest.fn() };
    const db = { transaction: jest.fn() };
    const ledger = {
      ensureWallet: jest.fn(async () => {
        throw new Error('reached-ledger');
      }),
    };
    const banks = {
      findAccount: jest.fn(async () => ({
        id: 'acct-1',
        partyId: 'party-1',
        status: 'VERIFIED',
        bankId: 'bank-mpesa',
        accountRef: '254700000000',
        accountName: 'Main',
      })),
      availableBanks: jest.fn(async () => [{ id: 'bank-mpesa', rail: 'mpesa' }]),
      findBeneficiary: jest.fn(async () => ({
        id: 'ben-1',
        partyId: 'party-1',
        kind: 'WALLET',
        accountRef: '',
        name: 'Recipient',
      })),
    };
    return { intents, db, ledger, banks };
  }

  function serviceFor(parts: ReturnType<typeof harness>, rails: RailRegistry): IntentsService {
    return new IntentsService(parts.intents as never, parts.banks as never, parts.ledger as never, rails, parts.db as never);
  }

  it('refuses a bank_mpesa intent before calling the ledger or persisting anything, when M-Pesa is unavailable', async () => {
    const parts = harness();
    const service = serviceFor(parts, registry({ STUB_RAIL_ENABLED: false }));

    let caught: unknown;
    try {
      await service.create({
        partyId: 'party-1',
        direction: 'DEPOSIT',
        amount: '100.00',
        currency: 'KES',
        bankAccountId: 'acct-1',
        idempotencyKey: 'key-1',
      });
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PlatformException);
    expect((caught as PlatformException).getResponse()).toMatchObject({ code: 'RAIL_UNAVAILABLE' });
    expect(parts.ledger.ensureWallet).not.toHaveBeenCalled();
    expect(parts.intents.create).not.toHaveBeenCalled();
    expect(parts.db.transaction).not.toHaveBeenCalled();
  });

  it('does not treat the internal (wallet-to-wallet) path as a rail, so it still reaches the ledger', async () => {
    const parts = harness();
    const service = serviceFor(parts, registry({ STUB_RAIL_ENABLED: false }));

    // With no rails registered, an internal transfer must still get past rail
    // resolution and fail only at the (mocked) ledger call.
    await expect(
      service.create({
        partyId: 'party-1',
        direction: 'TRANSFER',
        amount: '100.00',
        currency: 'USD',
        beneficiaryId: 'ben-1',
        idempotencyKey: 'key-2',
      }),
    ).rejects.toThrow('reached-ledger');
  });
});
