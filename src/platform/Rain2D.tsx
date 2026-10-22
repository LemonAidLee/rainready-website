// Rain over the 2D map (the 3D planner's Rain, drawn flat): slanted streaks on a canvas above the map, their number
// following the storm's intensity. strength 0 = clear day. Pointer events pass through to the map.
import { useEffect, useRef } from "react";

export function Rain2D({ strength }: { strength: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const k = useRef(strength);
  k.current = strength;
  useEffect(() => {
    const cv = ref.current!, ctx = cv.getContext("2d")!;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0, w = 0, h = 0, last = performance.now();
    const drops: { x: number; y: number; v: number; l: number }[] = [];
    const size = () => {
      const r = devicePixelRatio || 1;
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * r; cv.height = h * r; ctx.setTransform(r, 0, 0, r, 0, 0);
    };
    size();
    addEventListener("resize", size);
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const want = Math.round(Math.max(0, k.current) * (w * h) / 2600);
      while (drops.length < want) drops.push({ x: Math.random() * (w + 200) - 100, y: Math.random() * h, v: 700 + Math.random() * 500, l: 10 + Math.random() * 14 });
      if (drops.length > want) drops.length = want;
      ctx.clearRect(0, 0, w, h);
      if (drops.length) {
        ctx.strokeStyle = "rgba(170, 205, 240, 0.32)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of drops) {
          if (!reduce) { d.y += d.v * dt; d.x -= d.v * dt * 0.18; }
          if (d.y > h + 20) { d.y = -20; d.x = Math.random() * (w + 200) - 50; }
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.l * 0.18, d.y - d.l);
        }
        ctx.stroke();
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); removeEventListener("resize", size); };
  }, []);
  return <canvas ref={ref} className={`pf-rain ${strength > 0 ? "on" : ""}`} aria-hidden />;
}
