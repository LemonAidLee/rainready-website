// A description that waits: shown after the pointer rests on its target for HOVER_DELAY_MS (team leader, 22 Oct 2026:
// the scenario panel was too crowded to read). Also opens on keyboard focus and on a long press (touch has no hover).
// Rendered in a portal beside the target, kept inside the window.
import { cloneElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const HOVER_DELAY_MS = 900;
const LONG_PRESS_MS = 450;
let nextId = 0;

export function HoverTip(p: { tip: ReactNode; children: ReactElement; title?: string }) {
  const [at, setAt] = useState<{ x: number; y: number; left: boolean; up: boolean } | null>(null);
  const timer = useRef<number>();
  const target = useRef<HTMLElement | null>(null);
  const id = useRef(`tip-${++nextId}`).current;

  const place = () => {
    const r = target.current?.getBoundingClientRect();
    if (!r) return;
    // beside the panel the target sits in, so the tip never covers the neighbouring buttons
    const box = (target.current?.closest(".panel") as HTMLElement | null)?.getBoundingClientRect() ?? r;
    const left = box.right + 300 > innerWidth;                // no room on the right: open on the left
    const up = r.top > innerHeight * 0.55;                   // low on the screen: grow upwards from the target's bottom
    setAt({ x: left ? box.left - 10 : box.right + 10, y: up ? innerHeight - r.bottom : Math.max(8, r.top), left, up });
  };
  const open = (ms: number) => { clearTimeout(timer.current); timer.current = window.setTimeout(place, ms); };
  const close = () => { clearTimeout(timer.current); setAt(null); };
  useEffect(() => () => clearTimeout(timer.current), []);
  useEffect(() => {                                           // a scroll moves the target: close rather than drift
    if (!at) return;
    addEventListener("scroll", close, true);
    return () => removeEventListener("scroll", close, true);
  }, [at]);

  const child = cloneElement(p.children, {
    ref: (el: HTMLElement | null) => { target.current = el; },
    "aria-describedby": at ? id : undefined,
    onPointerEnter: (e: React.PointerEvent) => { if (e.pointerType === "mouse") open(HOVER_DELAY_MS); },
    onPointerLeave: close,
    onPointerDown: (e: React.PointerEvent) => { if (e.pointerType !== "mouse") open(LONG_PRESS_MS); else close(); },
    onPointerUp: (e: React.PointerEvent) => { if (e.pointerType !== "mouse" && !at) clearTimeout(timer.current); },
    onFocus: (e: React.FocusEvent) => { if ((e.target as HTMLElement).matches(":focus-visible")) open(HOVER_DELAY_MS / 2); },
    onBlur: close,
  });

  return (
    <>
      {child}
      {at && createPortal(
        <div id={id} role="tooltip" className={`hover-tip ${at.left ? "left" : ""}`} style={at.up ? { left: at.x, bottom: at.y } : { left: at.x, top: at.y }}>
          {p.title && <b>{p.title}</b>}
          {p.tip}
        </div>, document.body)}
    </>
  );
}
