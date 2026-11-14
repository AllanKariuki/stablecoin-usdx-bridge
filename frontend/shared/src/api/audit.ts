import { get, http } from './client';

/** services/audit-trail, via bff (read-only). snake_case, as the Go service renders it. */
export interface AuditEvent {
  id: string;
  seq: number;
  actor: string;
  actor_roles: string[] | null;
  on_behalf_of: string | null;
  action: string;
  subject_type: string;
  subject_id: string;
  service: string;
  outcome: string;
  before_state: unknown;
  after_state: unknown;
  metadata: unknown;
  request_id: string;
  occurred_at: string;
  hash: string;
  prev_hash: string;
  anchor_id: string | null;
}

export interface AuditAnchor {
  id: string;
  from_seq: number;
  to_seq: number;
  event_count: number;
  merkle_root: string;
  chain_tip: string;
  status: string;
  chain: string;
  tx_hash: string;
  published_at: string | null;
  created_at: string;
}

export type AuditProof =
  | { anchored: false; event_id: string; note: string }
  | {
      anchored?: true;
      event: AuditEvent;
      leaf: string;
      proof: Array<{ hash: string; is_left: boolean }>;
      merkle_root: string;
      anchor: { id: string; status: string; chain: string; tx_hash: string; event_count: number; published_at: string | null };
      verification: Record<string, string>;
    };

export interface ChainVerification {
  intact: boolean;
  events: number;
  first_broken: number | string | null;
}

export interface AuditEventFilter {
  actor?: string;
  action?: string;
  subject_type?: string;
  subject_id?: string;
  request_id?: string;
  limit?: number;
}

const ok = (s: number) => (s >= 200 && s < 300) || s === 409;

export const auditApi = {
  events: async (filter: AuditEventFilter = {}) => (await get<{ events: AuditEvent[] }>('/audit/events', { ...filter })).events,
  /** 202 with anchored:false while the event's window is not yet anchored. */
  proof: async (eventId: string) => (await http.get<AuditProof>(`/audit/events/${encodeURIComponent(eventId)}/proof`)).data,
  anchors: async (limit = 50) => (await get<{ anchors: AuditAnchor[] }>('/audit/anchors', { limit })).anchors,
  /** 409 means the hash chain is broken — a result to show, not a request failure. */
  verify: async () => (await http.get<ChainVerification>('/audit/verify', { validateStatus: ok })).data,
};
