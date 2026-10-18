import { z } from "zod";

// Limits on one report from the EA. They bound the request, not the stored history.
export const MAX_POSITIONS = 50;
export const MAX_DEALS = 500;
export const MAX_SIGNALS = 200;

const num = z.number().finite();
/** Year 2100. Anything later is not a real timestamp and would break date formatting. */
const MAX_EPOCH = 4_102_444_800;
const epoch = z.number().int().nonnegative().max(MAX_EPOCH);
const text = (max: number) => z.string().max(max);

export const positionSchema = z.object({
  ticket: num,
  symbol: text(32),
  type: z.enum(["buy", "sell"]),
  volume: num,
  price_open: num,
  price_current: num,
  sl: num,
  tp: num,
  profit: num,
  swap: num,
  magic: num,
  comment: text(64),
  time: epoch,
});

export const dealSchema = z.object({
  ticket: num,
  position_id: num,
  time: epoch,
  type: z.enum(["buy", "sell", "balance", "other"]),
  entry: z.enum(["in", "out", "inout", "none"]),
  symbol: text(32),
  volume: num,
  price: num,
  profit: num,
  swap: num,
  commission: num,
  fee: num,
  magic: num,
  comment: text(64),
  // Stop, target and money at risk of the opening order; 0 when it had no stop.
  sl: num,
  tp: num,
  risk: num,
});

export const signalSchema = z.object({
  time: epoch,
  dir: z.enum(["buy", "sell"]),
  close: num,
  atr: num,
  ratio: num,
  action: z.enum(["traded", "skipped"]),
  reason: text(120),
  lots: num,
  stop: num,
  target: num,
  // Which setup saw the signal. The EA leaves it out; the server fills it in from the report.
  magic: num.optional(),
});

export const DEFAULT_SETUP_NAME = "AlphaCore";

export const reportSchema = z.object({
  v: z.literal(1),
  // "ea": sent by the EA itself, so its status is the truth. "backfill": history loaded from another
  // MT5 terminal, which knows the account but not whether the EA is running.
  source: z.enum(["ea", "backfill"]).default("ea"),
  // Server clock and UTC at the moment of the report; their difference is the server offset.
  time: z.object({ server: epoch, gmt: epoch }),
  account: z.object({
    login: num,
    server: text(64),
    currency: text(8),
    balance: num,
    equity: num,
    margin_free: num,
    leverage: num,
  }),
  ea: z.object({
    // Several setups can run on one account, each with its own magic number and name.
    name: text(32).default(DEFAULT_SETUP_NAME),
    symbol: text(32),
    timeframe: text(16),
    risk_pct: num,
    use_vol: z.boolean(),
    vol_min: num,
    magic: num,
    ratio: num,
    losses_today: num,
    algo_enabled: z.boolean(),
  }),
  positions: z.array(positionSchema).max(MAX_POSITIONS),
  deals: z.array(dealSchema).max(MAX_DEALS),
  signals: z.array(signalSchema).max(MAX_SIGNALS),
});

export type Position = z.infer<typeof positionSchema>;
export type Deal = z.infer<typeof dealSchema>;
export type Signal = z.infer<typeof signalSchema> & { magic: number };
export type Report = z.infer<typeof reportSchema>;

/** What the dashboard keeps from the latest report. All times are UTC epoch seconds. */
export type Snapshot = Pick<Report, "account" | "ea" | "positions" | "source"> & { receivedAt: number };

/** The latest state one setup reported about itself. */
export type EaState = Report["ea"] & { receivedAt: number; source: Report["source"] };

/** Balance and equity as reported, one point per quarter hour. */
export type EquityPoint = { time: number; balance: number; equity: number };

export type DashboardData = {
  snapshot: Snapshot | null;
  /** One entry per setup that has ever reported, keyed by magic number. */
  eas: EaState[];
  deals: Deal[];
  signals: Signal[];
  /** Oldest first; starts when equity recording began, not with the account. */
  equity: EquityPoint[];
};
