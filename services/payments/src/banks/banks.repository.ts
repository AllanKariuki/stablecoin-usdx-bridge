import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

export interface Bank {
  id: string;
  name: string;
  country: string;
  currency: string;
  swiftCode: string;
  rail: string;
  logoUrl: string;
}

export interface BankAccount {
  id: string;
  partyId: string;
  bankId: string;
  bankName: string;
  accountName: string;
  accountLast4: string;
  accountRef: string;
  currency: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'REMOVED';
  isDefault: boolean;
  verifiedAt: Date | null;
}

export interface Beneficiary {
  id: string;
  partyId: string;
  name: string;
  bankId: string | null;
  accountRef: string;
  currency: string;
  kind: 'BANK' | 'WALLET' | 'MOBILE';
  targetPartyId: string;
}

@Injectable()
export class BanksRepository {
  constructor(private readonly db: DbService) {}

  async availableBanks(): Promise<Bank[]> {
    const { rows } = await this.db.query<Record<string, string>>(
      'SELECT * FROM banks WHERE active ORDER BY name',
    );
    return rows.map(toBank);
  }

  async accountsFor(partyId: string): Promise<BankAccount[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT ba.*, b.name AS bank_name
         FROM bank_accounts ba JOIN banks b ON b.id = ba.bank_id
        WHERE ba.party_id = $1 AND ba.status <> 'REMOVED'
        ORDER BY ba.is_default DESC, ba.created_at`,
      [partyId],
    );
    return rows.map(toAccount);
  }

  async findAccount(id: string): Promise<BankAccount | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT ba.*, b.name AS bank_name
         FROM bank_accounts ba JOIN banks b ON b.id = ba.bank_id
        WHERE ba.id = $1`,
      [id],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  /**
   * Registers a bank account, storing only the last four digits.
   *
   * The full number reaches this method and is deliberately not persisted:
   * once the rail has its own opaque handle (`accountRef`), the number is a
   * credential for a customer's bank relationship and nothing more. A
   * payments service that keeps one is a payments service that can leak one.
   */
  async registerAccount(input: {
    partyId: string;
    bankId: string;
    accountName: string;
    accountNumber: string;
    currency: string;
  }): Promise<BankAccount> {
    const last4 = input.accountNumber.replace(/\D/g, '').slice(-4);
    // The rail's handle. A real rail returns one from a verification call;
    // the stub derives a stable one so re-registering the same account is the
    // same row rather than a duplicate.
    const accountRef = `acct_${input.bankId}_${last4}`;

    const { rows } = await this.db.query<Record<string, any>>(
      `INSERT INTO bank_accounts (id, party_id, bank_id, account_name, account_last4, account_ref, currency, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7, NOT EXISTS (
            SELECT 1 FROM bank_accounts WHERE party_id = $2 AND status <> 'REMOVED'))
       ON CONFLICT (party_id, bank_id, account_ref) DO UPDATE SET
            account_name = EXCLUDED.account_name, status = 'PENDING', updated_at = now()
       RETURNING *, (SELECT name FROM banks WHERE id = $3) AS bank_name`,
      [`ba_${randomUUID()}`, input.partyId, input.bankId, input.accountName, last4, accountRef, input.currency],
    );
    return toAccount(rows[0]);
  }

  /**
   * Verification is what a rail's micro-deposit or instant-verify call
   * answers. The stub verifies immediately; the method exists separately from
   * registration so the two states are distinguishable, because paying out to
   * an unverified account is the mistake this table exists to prevent.
   */
  async verifyAccount(id: string): Promise<BankAccount | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `UPDATE bank_accounts SET status = 'VERIFIED', verified_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'PENDING'
        RETURNING *, (SELECT name FROM banks WHERE id = bank_id) AS bank_name`,
      [id],
    );
    return rows[0] ? toAccount(rows[0]) : null;
  }

  async removeAccount(id: string, partyId: string): Promise<boolean> {
    // Soft delete. A settled payment references this row, and a hard delete
    // would break the trail from a journal entry back to where the money
    // went.
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE bank_accounts SET status = 'REMOVED', updated_at = now()
        WHERE id = $1 AND party_id = $2 AND status <> 'REMOVED' RETURNING id`,
      [id, partyId],
    );
    return rows.length > 0;
  }

  // --- Beneficiaries ------------------------------------------------------

  async beneficiariesFor(partyId: string): Promise<Beneficiary[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM beneficiaries WHERE party_id = $1 ORDER BY name',
      [partyId],
    );
    return rows.map(toBeneficiary);
  }

  async findBeneficiary(id: string): Promise<Beneficiary | null> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM beneficiaries WHERE id = $1', [id]);
    return rows[0] ? toBeneficiary(rows[0]) : null;
  }

  async addBeneficiary(input: Omit<Beneficiary, 'id'>): Promise<Beneficiary> {
    const { rows } = await this.db.query<Record<string, any>>(
      `INSERT INTO beneficiaries (id, party_id, name, bank_id, account_ref, currency, kind, target_party_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (party_id, kind, account_ref) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [
        `ben_${randomUUID()}`,
        input.partyId,
        input.name,
        input.bankId,
        input.accountRef,
        input.currency,
        input.kind,
        input.targetPartyId,
      ],
    );
    return toBeneficiary(rows[0]);
  }
}

function toBank(row: Record<string, any>): Bank {
  return {
    id: row.id,
    name: row.name,
    country: row.country,
    currency: row.currency,
    swiftCode: row.swift_code,
    rail: row.rail,
    logoUrl: row.logo_url,
  };
}

function toAccount(row: Record<string, any>): BankAccount {
  return {
    id: row.id,
    partyId: row.party_id,
    bankId: row.bank_id,
    bankName: row.bank_name ?? '',
    accountName: row.account_name,
    accountLast4: row.account_last4,
    accountRef: row.account_ref,
    currency: row.currency,
    status: row.status,
    isDefault: row.is_default,
    verifiedAt: row.verified_at,
  };
}

function toBeneficiary(row: Record<string, any>): Beneficiary {
  return {
    id: row.id,
    partyId: row.party_id,
    name: row.name,
    bankId: row.bank_id,
    accountRef: row.account_ref,
    currency: row.currency,
    kind: row.kind,
    targetPartyId: row.target_party_id,
  };
}
