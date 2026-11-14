import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { getConfig } from '../config';
import { getAccessToken, refreshSession } from '../auth/session';

/**
 * The one HTTP client every app uses. Everything goes to the gateway
 * (Traefik → auth-proxy → bff), never to a service directly.
 */
export const http = axios.create({
  baseURL: getConfig().VITE_API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use(async (config) => {
  const token = getAccessToken() ?? (await refreshSession());
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

// One retry after a 401: the token may have expired between the check above
// and the gateway's verify.
http.interceptors.response.use(undefined, async (error: AxiosError) => {
  const original = error.config as (InternalAxiosRequestConfig & { _retried?: boolean }) | undefined;
  if (error.response?.status === 401 && original && !original._retried) {
    original._retried = true;
    const token = await refreshSession();
    if (token) {
      original.headers.set('Authorization', `Bearer ${token}`);
      return http.request(original);
    }
  }
  throw error;
});

/**
 * Every money-moving write carries an Idempotency-Key (core-ledger replays
 * the first response for a repeated key). Generate it once per *user
 * intent* — when the confirm step opens — and reuse it for retries of the
 * same submit, so a double click or a network retry can't move money twice.
 */
export const newIdempotencyKey = () => crypto.randomUUID();

export const withIdempotency = (key: string, config: AxiosRequestConfig = {}): AxiosRequestConfig => ({
  ...config,
  headers: { ...config.headers, 'Idempotency-Key': key },
});

export async function get<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const clean = params && Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
  return (await http.get<T>(url, { params: clean })).data;
}

export async function post<T>(url: string, body?: unknown, config?: AxiosRequestConfig): Promise<T> {
  return (await http.post<T>(url, body, config)).data;
}

export async function put<T>(url: string, body?: unknown): Promise<T> {
  return (await http.put<T>(url, body)).data;
}

export async function del<T>(url: string): Promise<T> {
  return (await http.delete<T>(url)).data;
}

export const qs = (params: Record<string, string | number | undefined>) => {
  const s = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => [k, String(v)]),
  ).toString();
  return s ? `?${s}` : '';
};

/** nest-platform's error envelope (shared/node/nest-platform/src/errors). */
export interface ApiErrorBody {
  error: string;
  code: string;
  request_id?: string;
}

const FRIENDLY: Record<string, string> = {
  INSUFFICIENT_FUNDS: "There isn't enough in that wallet for this amount.",
  ACCOUNT_FROZEN: 'This wallet is frozen. Contact support to find out why.',
  INSUFFICIENT_PERMISSIONS: "Your account isn't allowed to do this.",
  QUOTE_EXPIRED: 'That quote expired. Get a fresh one.',
  KYC_REQUIRED: 'Verify your identity before doing this.',
  LIMIT_EXCEEDED: "This is over your account's limit for your verification tier.",
};

/**
 * A message fit for a person — never a stack trace or a bare code. The
 * request id is appended so support can find the request in the logs.
 */
export function apiErrorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return 'We couldn’t reach DAMP. Check your connection and try again.';
    const body = err.response.data as Partial<ApiErrorBody> | undefined;
    const base =
      (body?.code && FRIENDLY[body.code]) ||
      (err.response.status === 403 && FRIENDLY.INSUFFICIENT_PERMISSIONS) ||
      (err.response.status === 404 && 'We couldn’t find that.') ||
      (err.response.status >= 500 && 'DAMP had a problem handling that. It’s been logged.') ||
      body?.error ||
      fallback;
    return body?.request_id ? `${base} (ref ${body.request_id})` : base;
  }
  return err instanceof Error ? err.message : fallback;
}

export const apiErrorCode = (err: unknown): string | undefined =>
  axios.isAxiosError(err) ? (err.response?.data as Partial<ApiErrorBody> | undefined)?.code : undefined;

export const apiStatus = (err: unknown): number | undefined => (axios.isAxiosError(err) ? err.response?.status : undefined);
