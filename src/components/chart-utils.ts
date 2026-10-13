export interface Scale {
  (value: number): number;
  domain: [number, number];
}

export function linearScale(domain: [number, number], range: [number, number]): Scale {
  const [d0, d1] = domain;
  const [r0, r1] = range;
  const span = d1 - d0 || 1;
  const scale = ((value: number) => r0 + ((value - d0) / span) * (r1 - r0)) as Scale;
  scale.domain = domain;
  return scale;
}

/** Round tick values covering the domain, about `count` of them. */
export function niceTicks(min: number, max: number, count = 5): number[] {
  const span = max - min || 1;
  const rough = span / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? magnitude * 10;
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];
  for (let value = first; value <= max + step * 1e-6; value += step) ticks.push(Number(value.toFixed(10)));
  return ticks;
}

/** Pads a value range so marks never sit on the plot edge, and always includes zero. */
export function paddedDomain(values: number[], padRatio = 0.12): [number, number] {
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const pad = (max - min || 1) * padRatio;
  return [min - pad, max + pad];
}

export const linePath = (points: Array<[number, number]>): string =>
  points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

/** A line that holds its value until the next point: right for balances that change only when a trade closes. */
export function stepPath(points: Array<[number, number]>): string {
  return points
    .map(([x, y], i) => (i === 0 ? `M${x.toFixed(1)},${y.toFixed(1)}` : `H${x.toFixed(1)} V${y.toFixed(1)}`))
    .join(" ");
}
