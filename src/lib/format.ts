const TIME_ZONE = "Asia/Manila";
const DASH = "–";

const dateTime = new Intl.DateTimeFormat("en-PH", {
  timeZone: TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});
const dateOnly = new Intl.DateTimeFormat("en-PH", { timeZone: TIME_ZONE, month: "short", day: "numeric", year: "numeric" });
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export const formatDateTime = (epochSeconds: number): string => dateTime.format(new Date(epochSeconds * 1000));
export const formatDate = (epochSeconds: number): string => dateOnly.format(new Date(epochSeconds * 1000));
export const formatMoney = (value: number): string => money.format(value);

/** Whole-dollar axis label with a true minus sign. */
export const formatWholeMoney = (value: number): string => `${value < 0 ? "−" : ""}$${Math.abs(value).toLocaleString("en-US")}`;

export function formatSignedMoney(value: number): string {
  if (value === 0) return money.format(0);
  return `${value > 0 ? "+" : "−"}${money.format(Math.abs(value))}`;
}

export function formatR(value: number | null, digits = 2): string {
  if (value === null) return DASH;
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(digits)}R`;
}

export const formatPercent = (value: number | null, digits = 1): string =>
  value === null ? DASH : `${(value * 100).toFixed(digits)}%`;

export const formatNumber = (value: number | null, digits = 2): string => (value === null ? DASH : value.toFixed(digits));

export const formatPrice = (value: number): string => (value ? value.toFixed(2) : DASH);

export function formatAge(seconds: number): string {
  if (seconds < 90) return "just now";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h ago`;
  return `${Math.round(seconds / 86400)} d ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min`;
  if (seconds < 86400) return `${(seconds / 3600).toFixed(1)} h`;
  return `${(seconds / 86400).toFixed(1)} d`;
}
