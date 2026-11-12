import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { AuditContext, AuditRequest, AuditEvent, enqueueAuditEvent } from '@damp/nest-platform';
import { AUDIT, SERVICE } from '../audit/audit-actions';
import { CurrentUser } from '../auth/current-user.decorator';
import { DbService, Queryable } from '../db/db.service';
import { BanksRepository } from './banks.repository';

/**
 * The `/banks/*` surface.
 *
 * These five routes are not new API design — they are the endpoints
 * `frontend/src/redux/slices/bankAccountsSlice.ts` has been written against
 * since before this service existed, falling back to mock data on every one
 * of them because nothing served them. The shapes below match what those
 * thunks already expect, which is why they are camelCase here rather than the
 * ledger's snake_case: the frontend is the contract, and changing it to suit a
 * new backend would be the tail wagging the dog.
 */
@Controller('banks')
export class BanksController {
  constructor(
    private readonly repo: BanksRepository,
    private readonly db: DbService,
  ) {}

  /**
   * Where money may be sent is the thing a payout fraud changes first, so
   * every change to it is audited in the same transaction as the change.
   * Only the last four digits are ever in an event, as in the table.
   */
  private audited<T>(
    audit: AuditRequest,
    fn: (q: Queryable) => Promise<{ result: T; event?: Omit<AuditEvent, 'service'> }>,
  ): Promise<T> {
    return this.db.transaction(async (q) => {
      const { result, event } = await fn(q);
      if (event) await enqueueAuditEvent(q, { ...event, service: SERVICE }, audit);
      return result;
    });
  }

  @Get('available')
  async available() {
    return this.repo.availableBanks();
  }

  @Get('user-accounts')
  async userAccounts(@CurrentUser() partyId: string) {
    const accounts = await this.repo.accountsFor(partyId);
    return accounts.map(render);
  }

  /**
   * "Linked" accounts are the verified subset — the ones a withdrawal may
   * actually target. The frontend shows the two lists separately because the
   * difference is meaningful to a customer: registering an account and being
   * able to withdraw to it are not the same event.
   */
  @Get('linked-accounts')
  async linkedAccounts(@CurrentUser() partyId: string) {
    const accounts = await this.repo.accountsFor(partyId);
    return accounts.filter((a) => a.status === 'VERIFIED').map(render);
  }

  @Post('register')
  async register(
    @CurrentUser() partyId: string,
    @Body() body: { bankId: string; accountName: string; accountNumber: string; currency?: string },
    @AuditContext() audit: AuditRequest = {},
  ) {
    if (!body?.bankId || !body?.accountNumber) {
      throw new NotFoundException('bankId and accountNumber are required');
    }
    const banks = await this.repo.availableBanks();
    const bank = banks.find((b) => b.id === body.bankId);
    if (!bank) throw new NotFoundException(`no bank ${body.bankId}`);

    const account = await this.audited(audit, async (q) => {
      const a = await this.repo.registerAccount(
        {
          partyId,
          bankId: body.bankId,
          accountName: body.accountName ?? '',
          accountNumber: body.accountNumber,
          currency: body.currency ?? bank.currency,
        },
        q,
      );
      return {
        result: a,
        event: {
          actor: partyId,
          action: AUDIT.bankAccountRegistered,
          subjectType: 'BANK_ACCOUNT',
          subjectId: a.id,
          afterState: { bankId: a.bankId, accountName: a.accountName, accountLast4: a.accountLast4, currency: a.currency, status: a.status },
          // Re-registering an existing account resets it to PENDING — a
          // verified destination becoming unverified is worth telling apart.
          metadata: { reRegistered: !a.created },
        },
      };
    });
    return render(account);
  }

  /**
   * Verification. With the stub rail this is instant; with a real rail it is
   * where a micro-deposit challenge or an instant-verify callback lands.
   *
   * It stays a separate call from registration even though the stub could
   * verify inline, for the same reason StubRail fires its own callback: a
   * path that only exists in production is a path nobody has run.
   */
  @Post('link')
  @HttpCode(200)
  async link(
    @CurrentUser() partyId: string,
    @Body() body: { accountId: string },
    @AuditContext() audit: AuditRequest = {},
  ) {
    const existing = await this.repo.findAccount(body?.accountId ?? '');
    if (!existing || existing.partyId !== partyId) {
      throw new NotFoundException('no such bank account');
    }
    const verified = await this.audited(audit, async (q) => {
      const v = await this.repo.verifyAccount(existing.id, q);
      return {
        result: v,
        // Verification is what makes an account a payout destination.
        event: v
          ? {
              actor: partyId,
              action: AUDIT.bankAccountVerified,
              subjectType: 'BANK_ACCOUNT',
              subjectId: v.id,
              beforeState: { status: existing.status },
              afterState: { status: v.status, accountLast4: v.accountLast4, bankId: v.bankId },
            }
          : undefined,
      };
    });
    return render(verified ?? existing);
  }

  @Delete('user-accounts/:accountId')
  async remove(
    @CurrentUser() partyId: string,
    @Param('accountId') accountId: string,
    @AuditContext() audit: AuditRequest = {},
  ) {
    const removed = await this.audited(audit, async (q) => {
      const r = await this.repo.removeAccount(accountId, partyId, q);
      return {
        result: r,
        event: r
          ? {
              actor: partyId,
              action: AUDIT.bankAccountRemoved,
              subjectType: 'BANK_ACCOUNT',
              subjectId: accountId,
              afterState: { status: 'REMOVED' },
            }
          : undefined,
      };
    });
    if (!removed) throw new NotFoundException('no such bank account');
    return { id: accountId, status: 'REMOVED' };
  }

  // --- Beneficiaries ------------------------------------------------------

  @Get('beneficiaries')
  async beneficiaries(@CurrentUser() partyId: string) {
    return this.repo.beneficiariesFor(partyId);
  }

  @Post('beneficiaries')
  async addBeneficiary(
    @CurrentUser() partyId: string,
    @Body()
    body: {
      name: string;
      kind?: 'BANK' | 'WALLET' | 'MOBILE';
      bankId?: string;
      accountRef: string;
      currency: string;
      targetPartyId?: string;
    },
    @AuditContext() audit: AuditRequest = {},
  ) {
    if (!body?.name || !body?.accountRef) {
      throw new NotFoundException('name and accountRef are required');
    }
    return this.audited(audit, async (q) => {
      const { created, ...b } = await this.repo.addBeneficiary(
        {
          partyId,
          name: body.name,
          kind: body.kind ?? 'BANK',
          bankId: body.bankId ?? null,
          accountRef: body.accountRef,
          currency: body.currency ?? 'USD',
          targetPartyId: body.targetPartyId ?? '',
        },
        q,
      );
      return {
        result: b,
        event: {
          actor: partyId,
          action: AUDIT.beneficiaryAdded,
          subjectType: 'BENEFICIARY',
          subjectId: b.id,
          afterState: {
            name: b.name,
            kind: b.kind,
            bankId: b.bankId,
            accountRef: b.accountRef,
            currency: b.currency,
            targetPartyId: b.targetPartyId,
          },
          // An existing beneficiary re-added under a new name is a rename,
          // not a new destination.
          metadata: { renamed: !created },
        },
      };
    });
  }
}

/**
 * The account number never leaves this service, and never entered its
 * database in the first place — only `accountLast4` is stored, so the masked
 * display below is not a redaction of something we hold, it is everything
 * there is.
 */
function render(account: {
  id: string;
  bankId: string;
  bankName: string;
  accountName: string;
  accountLast4: string;
  currency: string;
  status: string;
  isDefault: boolean;
  verifiedAt: Date | null;
}) {
  return {
    id: account.id,
    bankId: account.bankId,
    bankName: account.bankName,
    accountName: account.accountName,
    accountNumberMasked: `••••${account.accountLast4}`,
    currency: account.currency,
    status: account.status,
    isDefault: account.isDefault,
    verifiedAt: account.verifiedAt?.toISOString() ?? null,
  };
}
