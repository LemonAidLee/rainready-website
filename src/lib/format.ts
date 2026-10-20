export const m3 = (x: number | null | undefined) =>
  x === null || x === undefined ? "—" : `${(Math.round(x / 100) * 100).toLocaleString("en-GB")} m³`;
export const num = (x: number, d = 1) => x.toLocaleString("en-GB", { maximumFractionDigits: d, minimumFractionDigits: d });
export const change = (r: number | null | undefined) => {
  if (r === null || r === undefined) return "—";
  const p = Math.round((r - 1) * 100);
  return p === 0 ? "no change" : `${p > 0 ? "+" : "−"}${Math.abs(p)} %`;
};
export const drainsTo = (t: string) =>
  ({ pond_A: "Pond A", pond_B: "Pond B", trunk_drain: "the shared trunk drain", TBD: "not known (outlet TBD)" } as Record<string, string>)[t] ?? t;
