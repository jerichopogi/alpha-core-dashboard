import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "ac_session";
export const SESSION_SECONDS = 60 * 60 * 24 * 14;
const MIN_SECRET_LENGTH = 32;
const MIN_PASSWORD_LENGTH = 12;

function requireEnv(name: string, minLength = 1): string {
  const value = process.env[name];
  if (!value || value.length < minLength) {
    throw new Error(`${name} is not configured${minLength > 1 ? ` (needs at least ${minLength} characters)` : ""}.`);
  }
  return value;
}

/** Constant-time comparison that does not leak the length of either value. */
export function safeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(a), digest(b));
}

const sign = (payload: string, secret: string) => createHmac("sha256", secret).update(payload).digest("base64url");

export function createSessionToken(nowSeconds: number, secret = requireEnv("SESSION_SECRET", MIN_SECRET_LENGTH)): string {
  const expires = String(nowSeconds + SESSION_SECONDS);
  return `${expires}.${sign(expires, secret)}`;
}

export function isValidSessionToken(
  token: string | undefined,
  nowSeconds: number,
  secret = requireEnv("SESSION_SECRET", MIN_SECRET_LENGTH),
): boolean {
  if (!token) return false;
  const [expires, signature, ...rest] = token.split(".");
  if (!expires || !signature || rest.length > 0 || !/^\d+$/.test(expires)) return false;
  return safeEqual(signature, sign(expires, secret)) && Number(expires) > nowSeconds;
}

export const isCorrectPassword = (attempt: string): boolean => safeEqual(attempt, requireEnv("DASHBOARD_PASSWORD", MIN_PASSWORD_LENGTH));

export const isCorrectIngestToken = (attempt: string | null): boolean =>
  attempt !== null && safeEqual(attempt, requireEnv("INGEST_TOKEN", MIN_SECRET_LENGTH));
