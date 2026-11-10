import { Injectable } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { DbService } from '../db/db.service';

export interface Invoice {
  id: string;
  number: string;
  issuerPartyId: string;
  payerPartyId: string;
  payerEmail: string;
  payerName: string;
  amount: string;
  currency: string;
  status: 'DRAFT' | 'OPEN' | 'PAID' | 'VOID' | 'OVERDUE';
  dueDate: Date | null;
  description: string;
  lineItems: unknown[];
  payToken: string | null;
  paidIntentId: string | null;
  paidAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class InvoicesRepository {
  constructor(private readonly db: DbService) {}

  async create(input: {
    issuerPartyId: string;
    payerPartyId?: string;
    payerEmail?: string;
    payerName?: string;
    amount: string;
    currency: string;
    dueDate?: string | null;
    description?: string;
    lineItems?: unknown[];
  }): Promise<Invoice> {
    const { rows } = await this.db.query<Record<string, any>>(
      `INSERT INTO invoices
         (id, number, issuer_party_id, payer_party_id, payer_email, payer_name,
          amount, currency, status, due_date, description, line_items, pay_token)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'OPEN',$9,$10,$11,$12)
       RETURNING *`,
      [
        `inv_${randomUUID()}`,
        await this.nextNumber(),
        input.issuerPartyId,
        input.payerPartyId ?? '',
        input.payerEmail ?? '',
        input.payerName ?? '',
        input.amount,
        input.currency,
        input.dueDate ?? null,
        input.description ?? '',
        JSON.stringify(input.lineItems ?? []),
        // 32 bytes of entropy. This token is a bearer credential for paying
        // exactly this invoice — it authorizes nothing else and is revoked by
        // voiding the invoice — but a guessable one would let anybody enumerate
        // who owes whom what.
        randomBytes(24).toString('base64url'),
      ],
    );
    return toInvoice(rows[0]);
  }

  async find(id: string): Promise<Invoice | null> {
    const { rows } = await this.db.query<Record<string, any>>('SELECT * FROM invoices WHERE id = $1', [id]);
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  /**
   * Resolves a payment link.
   *
   * Only OPEN invoices resolve: a token for a paid or voided invoice returns
   * nothing, which is what makes voiding an effective revocation rather than
   * a label.
   */
  async findByToken(token: string): Promise<Invoice | null> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM invoices WHERE pay_token = $1 AND status = 'OPEN'`,
      [token],
    );
    return rows[0] ? toInvoice(rows[0]) : null;
  }

  async listIssued(partyId: string, limit = 50): Promise<Invoice[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      'SELECT * FROM invoices WHERE issuer_party_id = $1 ORDER BY created_at DESC LIMIT $2',
      [partyId, limit],
    );
    return rows.map(toInvoice);
  }

  async listPayable(partyId: string, limit = 50): Promise<Invoice[]> {
    const { rows } = await this.db.query<Record<string, any>>(
      `SELECT * FROM invoices WHERE payer_party_id = $1 AND status = 'OPEN'
        ORDER BY due_date NULLS LAST, created_at DESC LIMIT $2`,
      [partyId, limit],
    );
    return rows.map(toInvoice);
  }

  /**
   * Marks an invoice paid. Guarded on OPEN so a duplicate settlement callback
   * does not overwrite the intent that actually paid it with a later one.
   */
  async markPaid(invoiceId: string, intentId: string): Promise<void> {
    await this.db.query(
      `UPDATE invoices SET status = 'PAID', paid_intent_id = $2, paid_at = now(), updated_at = now()
        WHERE id = $1 AND status = 'OPEN'`,
      [invoiceId, intentId],
    );
  }

  async void(id: string, issuerPartyId: string): Promise<boolean> {
    const { rows } = await this.db.query<{ id: string }>(
      `UPDATE invoices SET status = 'VOID', pay_token = NULL, updated_at = now()
        WHERE id = $1 AND issuer_party_id = $2 AND status IN ('DRAFT', 'OPEN')
        RETURNING id`,
      [id, issuerPartyId],
    );
    return rows.length > 0;
  }

  /**
   * Invoice numbers are sequential per year and human-facing — "INV-2026-0042"
   * is what somebody quotes on a phone call. A UUID would be correct and
   * useless for that.
   */
  private async nextNumber(): Promise<string> {
    const year = new Date().getUTCFullYear();
    const { rows } = await this.db.query<{ count: string }>(
      `SELECT count(*) FROM invoices WHERE number LIKE $1`,
      [`INV-${year}-%`],
    );
    return `INV-${year}-${String(Number(rows[0].count) + 1).padStart(4, '0')}`;
  }
}

function toInvoice(row: Record<string, any>): Invoice {
  return {
    id: row.id,
    number: row.number,
    issuerPartyId: row.issuer_party_id,
    payerPartyId: row.payer_party_id,
    payerEmail: row.payer_email,
    payerName: row.payer_name,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    dueDate: row.due_date,
    description: row.description,
    lineItems: row.line_items ?? [],
    payToken: row.pay_token,
    paidIntentId: row.paid_intent_id,
    paidAt: row.paid_at,
    createdAt: row.created_at,
  };
}
