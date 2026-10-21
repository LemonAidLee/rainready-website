// Small chart pieces shared by the Findings and Recovery pages: reveal-on-scroll, a hover tooltip, plain-word term
// hints, the room-for-water status label, and owner colours. Colours: red / amber / green only ever mean room for water
// (status, always with a word and an icon); owners use a categorical set checked for colour-blind separation on the
// dark surface (dataviz validator, 21 Oct 2026: blue, orange, aqua pass all-pairs), always with a direct label.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, CheckCircle2, CircleAlert } from "lucide-react";

/** Adds class "in" once the element scrolls into view; bars and fills grow from it (CSS, off under reduced motion). */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { el.classList.add("in"); return; }
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (e.isIntersecting) { el.classList.add("in"); io.disconnect(); }
    }), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

export function Reveal(p: { className?: string; children: ReactNode; spot?: string; id?: string }) {
  const ref = useReveal<HTMLDivElement>();
  return <div ref={ref} id={p.id} className={`reveal ${p.className ?? ""}`} data-spot={p.spot}>{p.children}</div>;
}

/** A hover / tap tooltip for chart marks. Wrap the chart in <Tips> and give marks tip("text"). */
export function useTips() {
  const [t, setT] = useState<{ x: number; y: number; text: ReactNode } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const tip = (text: ReactNode) => ({
    onMouseMove: (e: React.MouseEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (r) setT({ x: e.clientX - r.left, y: e.clientY - r.top, text });
    },
    onMouseLeave: () => setT(null),
    onClick: (e: React.MouseEvent) => {
      const r = box.current?.getBoundingClientRect();
      if (r) setT({ x: e.clientX - r.left, y: e.clientY - r.top, text });
    },
  });
  const layer = t && <div className="viz-tip" style={{ left: t.x, top: t.y }}>{t.text}</div>;
  return { box, tip, layer };
}

/** A term with a plain-words hint on hover, focus or tap. */
export function Term(p: { t: ReactNode; d: string }) {
  return <span className="term" tabIndex={0} data-d={p.d}>{p.t}</span>;
}

export type Room = "low" | "medium" | "high";
export const roomOfRatio = (r: number): Room => (r >= 1 ? "high" : r >= 0.8 ? "medium" : "low");
export const ROOM_WORD: Record<Room, string> = { low: "Room to spare", medium: "Nearly full", high: "Not enough room" };

/** Status label: icon + word + colour, never colour alone. */
export function RoomLabel({ r }: { r: number }) {
  const k = roomOfRatio(r);
  const Icon = k === "high" ? AlertTriangle : k === "medium" ? CircleAlert : CheckCircle2;
  return <span className={`room room-${k}`}><Icon size={13} /> {ROOM_WORD[k]}</span>;
}

/** Who holds a duty: categorical owner colours (always shown with the name). */
export type Holder = "MBDK" | "MBSA" | "JPS" | "unsettled" | "agencies";
export const HOLDER_NAME: Record<Holder, string> = {
  MBDK: "MBDK (Klang council)", MBSA: "MBSA (Shah Alam council)", JPS: "JPS Selangor (drainage and irrigation)",
  unsettled: "Not settled on public record", agencies: "Federal and state agencies",
};
export function HolderChip({ h, label }: { h: Holder; label?: string }) {
  return <span className={`holder h-${h}`}><i />{label ?? HOLDER_NAME[h]}</span>;
}

/** One volume in Olympic pools (50 × 25 × 2 m = 2,500 m³), to make a number of cubic metres easy to picture. */
export const POOL_M3 = 2500;
export const pools = (m3: number) => Math.round(m3 / POOL_M3);
