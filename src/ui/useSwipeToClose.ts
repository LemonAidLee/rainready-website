// Swipe a bottom sheet down to close it (phones, team leader, 22 Oct 2026). The sheet follows the finger from its
// handle and title bar, or from anywhere once its content is scrolled to the top and the swipe is downwards; a
// sideways swipe (the preset row) or a scroll inside the sheet is left alone. Released past a quarter of the sheet's
// height, or flicked, it slides away and closes; otherwise it springs back. Desktop: does nothing.
import { useEffect, useRef, type RefObject } from "react";

const PHONE = 860;

/** `key`: re-attach when the sheet's element changes (a card that mounts only when something is picked). */
export function useSwipeToClose(ref: RefObject<HTMLElement>, onClose: () => void, key?: unknown) {
  const cb = useRef(onClose);
  cb.current = onClose;                              // the latest close, without re-binding mid-swipe
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let y0 = 0, x0 = 0, t0 = 0, dy = 0, mode: "idle" | "maybe" | "drag" | "ignore" = "idle";
    let scroller: HTMLElement = el;

    const start = (e: TouchEvent) => {
      if (innerWidth >= PHONE || e.touches.length !== 1) return;
      y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; t0 = performance.now(); dy = 0;
      const fromHead = !!(e.target as HTMLElement).closest(".panel-head") || y0 - el.getBoundingClientRect().top < 28;
      scroller = ((e.target as HTMLElement).closest(".pf-body, .card-body") as HTMLElement | null) ?? el;
      mode = fromHead || scroller.scrollTop <= 0 ? "maybe" : "ignore";
      (el as any)._fromHead = fromHead;
    };
    const move = (e: TouchEvent) => {
      if (mode === "idle" || mode === "ignore") return;
      const ddy = e.touches[0].clientY - y0, ddx = e.touches[0].clientX - x0;
      if (mode === "maybe") {
        if (Math.abs(ddx) > 8 && Math.abs(ddx) > Math.abs(ddy)) { mode = "ignore"; return; }   // sideways: the preset row
        if (Math.abs(ddy) < 6) return;
        if (ddy < 0 || (!(el as any)._fromHead && scroller.scrollTop > 0)) { mode = "ignore"; return; }   // upwards: a scroll
        mode = "drag";
        el.style.transition = "none";
      }
      e.preventDefault();
      dy = Math.max(0, ddy);
      el.style.transform = `translateY(${dy}px)`;
    };
    const end = () => {
      if (mode !== "drag") { mode = "idle"; return; }
      mode = "idle";
      const speed = dy / Math.max(1, performance.now() - t0);         // px per ms
      const h = el.getBoundingClientRect().height;
      el.style.transition = "transform 0.22s cubic-bezier(.16, 1, .3, 1)";
      if (dy > h * 0.25 || (speed > 0.6 && dy > 30)) {
        el.style.transform = `translateY(${h + 40}px)`;
        setTimeout(() => { el.style.transform = ""; el.style.transition = ""; cb.current(); }, 200);
      } else {
        el.style.transform = "";
        setTimeout(() => { el.style.transition = ""; }, 240);
      }
    };
    el.addEventListener("touchstart", start, { passive: true });
    el.addEventListener("touchmove", move, { passive: false });
    el.addEventListener("touchend", end);
    el.addEventListener("touchcancel", end);
    return () => {
      el.removeEventListener("touchstart", start);
      el.removeEventListener("touchmove", move);
      el.removeEventListener("touchend", end);
      el.removeEventListener("touchcancel", end);
    };
  }, [ref, key]);
}
