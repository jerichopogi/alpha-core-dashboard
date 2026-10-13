import { promises as fs } from "node:fs";
import path from "node:path";
import { Redis } from "@upstash/redis";
import { signalKey } from "./normalize";
import type { DashboardData, Deal, EaState, Signal, Snapshot } from "./types";

const KEY_SNAPSHOT = "ac:snapshot";
const KEY_DEALS = "ac:deals";
const KEY_SIGNALS = "ac:signals";
const KEY_EAS = "ac:eas";
/** Signals stored before setups carried their own magic number belong to the first setup. */
const LEGACY_MAGIC = 20261013;

// Oldest rows are dropped past these, so history cannot grow without bound.
const MAX_STORED_DEALS = 5000;
const MAX_STORED_SIGNALS = 2000;

export interface Store {
  /** Stores deals and signals; replaces the account snapshot and the setup's state unless they are null. */
  save(snapshot: Snapshot | null, ea: EaState | null, deals: Deal[], signals: Signal[]): Promise<void>;
  load(): Promise<DashboardData>;
  loadSnapshot(): Promise<Snapshot | null>;
  loadEa(magic: number): Promise<EaState | null>;
  /** Counts a hit against `key` and returns the count inside the current window. */
  hit(key: string, windowSeconds: number): Promise<number>;
}

const byTime = <T extends { time: number }>(rows: T[]) => [...rows].sort((a, b) => a.time - b.time);
const withMagic = (signals: Signal[]): Signal[] => signals.map((s) => ({ ...s, magic: s.magic ?? LEGACY_MAGIC }));
const byMagic = (eas: EaState[]) => [...eas].sort((a, b) => a.magic - b.magic);

/** Keys of the oldest rows beyond `limit`. */
function overflowKeys<T extends { time: number }>(rows: Record<string, T>, limit: number): string[] {
  const keys = Object.keys(rows);
  if (keys.length <= limit) return [];
  return keys.sort((a, b) => rows[a].time - rows[b].time).slice(0, keys.length - limit);
}

async function trimHash<T extends { time: number }>(redis: Redis, key: string, limit: number): Promise<void> {
  if ((await redis.hlen(key)) <= limit) return;
  const stale = overflowKeys((await redis.hgetall<Record<string, T>>(key)) ?? {}, limit);
  if (stale.length) await redis.hdel(key, ...stale);
}

function redisStore(redis: Redis): Store {
  return {
    async save(snapshot, ea, deals, signals) {
      const tx = redis.multi();
      if (snapshot) tx.set(KEY_SNAPSHOT, snapshot);
      else tx.exists(KEY_SNAPSHOT); // keeps the transaction non-empty
      if (ea) tx.hset(KEY_EAS, { [String(ea.magic)]: ea });
      if (deals.length) tx.hset(KEY_DEALS, Object.fromEntries(deals.map((d) => [String(d.ticket), d])));
      if (signals.length) tx.hset(KEY_SIGNALS, Object.fromEntries(signals.map((s) => [signalKey(s), s])));
      await tx.exec();
      await Promise.all([
        trimHash<Deal>(redis, KEY_DEALS, MAX_STORED_DEALS),
        trimHash<Signal>(redis, KEY_SIGNALS, MAX_STORED_SIGNALS),
      ]);
    },
    async load() {
      const [snapshot, eas, deals, signals] = await Promise.all([
        redis.get<Snapshot>(KEY_SNAPSHOT),
        redis.hgetall<Record<string, EaState>>(KEY_EAS),
        redis.hgetall<Record<string, Deal>>(KEY_DEALS),
        redis.hgetall<Record<string, Signal>>(KEY_SIGNALS),
      ]);
      return {
        snapshot: snapshot ?? null,
        eas: byMagic(Object.values(eas ?? {})),
        deals: byTime(Object.values(deals ?? {})),
        signals: withMagic(byTime(Object.values(signals ?? {}))),
      };
    },
    async loadSnapshot() {
      return (await redis.get<Snapshot>(KEY_SNAPSHOT)) ?? null;
    },
    async loadEa(magic) {
      return (await redis.hget<EaState>(KEY_EAS, String(magic))) ?? null;
    },
    async hit(key, windowSeconds) {
      // Create the key with its expiry first, so a counter can never be left without one.
      await redis.set(key, 0, { ex: windowSeconds, nx: true });
      return redis.incr(key);
    },
  };
}

type FileState = { snapshot: Snapshot | null; eas?: Record<string, EaState>; deals: Record<string, Deal>; signals: Record<string, Signal> };

/** Local development only: one JSON file, so the app runs without a database. */
function fileStore(file: string): Store {
  const hits = new Map<string, { count: number; resetAt: number }>();
  const read = async (): Promise<FileState> => {
    try {
      return JSON.parse(await fs.readFile(file, "utf8")) as FileState;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return { snapshot: null, deals: {}, signals: {} };
      throw error;
    }
  };
  return {
    async save(snapshot, ea, deals, signals) {
      const state = await read();
      const merged: FileState = {
        snapshot: snapshot ?? state.snapshot,
        eas: ea ? { ...state.eas, [String(ea.magic)]: ea } : state.eas,
        deals: { ...state.deals, ...Object.fromEntries(deals.map((d) => [String(d.ticket), d])) },
        signals: { ...state.signals, ...Object.fromEntries(signals.map((s) => [signalKey(s), s])) },
      };
      const without = <T,>(rows: Record<string, T>, keys: string[]) => Object.fromEntries(Object.entries(rows).filter(([k]) => !keys.includes(k)));
      const next: FileState = {
        snapshot: merged.snapshot,
        eas: merged.eas,
        deals: without(merged.deals, overflowKeys(merged.deals, MAX_STORED_DEALS)),
        signals: without(merged.signals, overflowKeys(merged.signals, MAX_STORED_SIGNALS)),
      };
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, JSON.stringify(next));
    },
    async load() {
      const state = await read();
      return {
        snapshot: state.snapshot,
        eas: byMagic(Object.values(state.eas ?? {})),
        deals: byTime(Object.values(state.deals)),
        signals: withMagic(byTime(Object.values(state.signals))),
      };
    },
    async loadEa(magic) {
      return (await read()).eas?.[String(magic)] ?? null;
    },
    async loadSnapshot() {
      return (await read()).snapshot;
    },
    async hit(key, windowSeconds) {
      const now = Date.now();
      const entry = hits.get(key);
      const next = entry && entry.resetAt > now ? { ...entry, count: entry.count + 1 } : { count: 1, resetAt: now + windowSeconds * 1000 };
      hits.set(key, next);
      return next.count;
    },
  };
}

let cached: Store | undefined;

export function getStore(): Store {
  if (cached) return cached;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    cached = redisStore(new Redis({ url, token }));
  } else if (process.env.NODE_ENV === "production") {
    throw new Error("No database configured: set KV_REST_API_URL and KV_REST_API_TOKEN (Upstash Redis).");
  } else {
    cached = fileStore(path.join(process.cwd(), ".data", "store.json"));
  }
  return cached;
}
