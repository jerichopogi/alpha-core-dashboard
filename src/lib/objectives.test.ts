import { describe, expect, test } from "vitest";
import { drawdownObjective, lossCapObjective, monthStart, monthlyTargetObjective } from "./objectives";

// 2026-10-16 04:00 UTC = 12:00 noon in the Philippines; the Philippine month started 2026-09-30 16:00 UTC.
const NOW = 1_792_123_200;
const OCT_START_PH = 1790784000;

describe("monthStart", () => {
  test("is midnight on the 1st in Philippine time", () => {
    expect(monthStart(NOW)).toBe(OCT_START_PH);
  });
});

describe("monthlyTargetObjective", () => {
  const points = [
    { time: OCT_START_PH - 100, balance: 1000, result: 0 },
    { time: OCT_START_PH + 100, balance: 1500, result: 0 }, // deposit of 500 this month
    { time: OCT_START_PH + 200, balance: 1560, result: 60 },
  ];

  test("measures this month's trading result against 10% of the capital at work", () => {
    const o = monthlyTargetObjective(points, NOW);
    expect(o.progress).toBeCloseTo(60 / 150);
    expect(o.state).toBe("on-track");
    expect(o.value).toBe("+$60.00");
    expect(o.target).toBe("+$150.00");
  });

  test("passes once the target is reached, and shows 0% progress when the month is negative", () => {
    expect(monthlyTargetObjective([...points, { time: OCT_START_PH + 300, balance: 1660, result: 160 }], NOW).state).toBe("passed");
    const down = monthlyTargetObjective([...points, { time: OCT_START_PH + 300, balance: 1450, result: -50 }], NOW);
    expect(down.progress).toBe(0);
    expect(down.state).toBe("behind");
  });
});

describe("drawdownObjective", () => {
  test("warns from three quarters of the limit and breaches at it", () => {
    expect(drawdownObjective(0.05, 0.08).state).toBe("ok");
    expect(drawdownObjective(0.16, 0.16).state).toBe("warning");
    expect(drawdownObjective(0.2, 0.2).state).toBe("breached");
    expect(drawdownObjective(0.05, 0.08).progress).toBeCloseTo(0.25);
  });
});

describe("lossCapObjective", () => {
  test("counts today's losses against the EA's cap", () => {
    expect(lossCapObjective(0)).toMatchObject({ state: "ok", value: "0 of 2" });
    expect(lossCapObjective(1)).toMatchObject({ state: "warning", progress: 0.5 });
    expect(lossCapObjective(2)).toMatchObject({ state: "paused", detail: "Cap reached: no more EA trades today" });
  });
});
