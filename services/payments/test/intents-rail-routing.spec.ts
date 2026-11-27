import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { IntentsService } from '../src/intents/intents.service';

/**
 * Which rail an intent moves on. A bank account or a BANK/MOBILE beneficiary
 * moves on its institution's rail; a bare mobile number is M-Pesa; a WALLET
 * beneficiary is internal. Before this, a phone number and a MOBILE
 * beneficiary both fell through to the stub rail — wherever the stub is
 * enabled, that books a deposit for fiat that never arrived.
 */

const BANKS = [
  { id: 'bank_equity', name: 'Equity', rail: 'stub' },
  { id: 'bank_mpesa', name: 'M-Pesa', rail: 'mpesa' },
];

function harness(beneficiary: Record<string, unknown> | null = null) {
  const config = { get: () => undefined } as unknown as ConfigService;
  const railNames: string[] = [];
  const createInputs: Array<{ rail: string }> = [];
  const intents = {
    create: jest.fn(async (input: { rail: string }) => {
      createInputs.push(input);
      return { intent: { id: 'pi_1', status: 'REQUIRES_ACTION', ...input }, created: true };
    }),
    recordRailAccepted: jest.fn(async () => undefined),
    find: jest.fn(async () => ({ id: 'pi_1', status: 'REQUIRES_ACTION', ...createInputs[createInputs.length - 1] })),
    markFailed: jest.fn(async () => true),
  };
  const rails = {
    get: jest.fn((name: string) => {
      railNames.push(name);
      return {
        collect: jest.fn(async () => ({ status: 'REQUIRES_ACTION', railRef: 'r1', customerAction: '' })),
        disburse: jest.fn(async () => ({ status: 'REQUIRES_ACTION', railRef: 'r1', customerAction: '' })),
      };
    }),
  };
  const service = new IntentsService(
    intents as never,
    {
      findAccount: jest.fn(async () => null),
      findBeneficiary: jest.fn(async () => beneficiary),
      availableBanks: jest.fn(async () => BANKS),
    } as never,
    {
      ensureWallet: jest.fn(async (party: string, currency: string) => ({ id: 'wal_1', user_id: party, currency, chain: '', status: 'ACTIVE' })),
    } as never,
    rails as never,
    { transaction: jest.fn(async (fn: (q: unknown) => Promise<unknown>) => fn({ query: jest.fn(async () => ({ rows: [] })) })) } as never,
    { require: jest.fn(async () => undefined) } as never,
    config,
  );
  return { service, railNames, createInputs };
}

const base = { partyId: 'party_1', amount: '500.00', idempotencyKey: 'k1' };

describe('intent rail routing', () => {
  it('routes a bare phone-number deposit to M-Pesa', async () => {
    const h = harness();
    await h.service.create({ ...base, direction: 'DEPOSIT', currency: 'KES', phoneNumber: '254712345678' });
    expect(h.railNames[0]).toBe('mpesa');
    expect(h.createInputs[0].rail).toBe('mpesa');
  });

  it('routes a phone-number withdrawal to M-Pesa', async () => {
    const h = harness();
    await h.service.create({ ...base, direction: 'WITHDRAWAL', currency: 'KES', phoneNumber: '254712345678' });
    expect(h.createInputs[0].rail).toBe('mpesa');
  });

  it('refuses M-Pesa for a non-KES amount with MPESA_KES_ONLY', async () => {
    const h = harness();
    const err = await h.service
      .create({ ...base, direction: 'DEPOSIT', currency: 'USD', phoneNumber: '254712345678' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(HttpException);
    expect(((err as HttpException).getResponse() as { code?: string }).code).toBe('MPESA_KES_ONLY');
    expect(h.createInputs).toHaveLength(0);
  });

  it('routes a MOBILE beneficiary on its institution rail', async () => {
    const h = harness({
      id: 'ben_m', partyId: 'party_1', name: 'Mum', bankId: 'bank_mpesa', accountRef: '254700000000',
      currency: 'KES', kind: 'MOBILE', targetPartyId: '',
    });
    await h.service.create({ ...base, direction: 'WITHDRAWAL', currency: 'KES', beneficiaryId: 'ben_m' });
    expect(h.createInputs[0].rail).toBe('mpesa');
  });

  it('keeps a WALLET beneficiary internal', async () => {
    const h = harness({
      id: 'ben_w', partyId: 'party_1', name: 'Friend', bankId: null, accountRef: '',
      currency: 'KES', kind: 'WALLET', targetPartyId: 'party_2',
    });
    await h.service.create({ ...base, direction: 'TRANSFER', currency: 'KES', beneficiaryId: 'ben_w' }).catch(() => undefined);
    expect(h.createInputs[0]?.rail ?? 'internal').toBe('internal');
    expect(h.railNames).not.toContain('stub');
  });
});
