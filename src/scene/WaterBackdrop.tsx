// Moving black-water backdrop behind the 3D township (team leader, 21 Oct 2026; reference: kvs.services).
// A full-screen fragment shader on its own canvas: a perspective water plane of slow swells and fine ripples, lit
// by a faint cool sheen, so the diorama reads as standing on dark water. Look only. Rendered at reduced resolution
// and about 30 fps; a still frame when the viewer prefers reduced motion.
import { useEffect, useRef } from "react";

export const WATER_FRAG = `precision highp float;
uniform vec2 uRes; uniform float uTime;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y); }
float height(vec2 p, float t){
  float h = sin(p.x * 0.55 + t * 0.32 + sin(p.y * 0.30 + t * 0.12) * 1.6) * 0.55;
  h += sin(p.y * 0.85 - t * 0.27 + p.x * 0.35) * 0.40;
  h += sin((p.x * 0.7 + p.y) * 1.9 + t * 0.55) * 0.10;
  h += (noise(p * 1.3 + vec2(t * 0.11, -t * 0.08)) - 0.5) * 0.55;
  h += (noise(p * 3.7 - vec2(t * 0.20, t * 0.16)) - 0.5) * 0.16;
  return h;
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  float d = 1.0 / (1.22 - uv.y);                       // distance into the scene grows toward the top
  // a tall phone screen is a narrow slice of the water: each swell then spans the screen and reads as a smear, so
  // portrait screens see a wider stretch of water and finer swells (wide screens are unchanged)
  float zoom = aspect < 1.0 ? 1.8 : 1.0;
  vec2 p = vec2((uv.x - 0.5) * max(aspect, 0.9) * d * 2.6, d * 3.2) * zoom;
  float e = 0.03 * d;
  float h = height(p, uTime);
  float hx = height(p + vec2(e, 0.0), uTime) - h, hy = height(p + vec2(0.0, e), uTime) - h;
  vec3 n = normalize(vec3(-hx / e * 0.42, 1.0, -hy / e * 0.42));
  vec3 v = normalize(vec3((uv.x - 0.5) * 0.4, 0.42, 1.0));
  vec3 l = normalize(vec3(-0.35, 0.55, -0.9));          // a soft light low behind the scene
  float spec = pow(max(dot(reflect(-l, n), v), 0.0), 26.0);
  float swell = 0.5 + 0.5 * sin(p.y * 0.18 - uTime * 0.22 + sin(p.x * 0.12) * 1.5);   // slow broad light bands
  spec *= 0.55 + 0.75 * swell;
  float sheen = pow(1.0 - max(dot(n, v), 0.0), 3.0);
  float far = smoothstep(0.15, 0.95, uv.y);
  vec3 base = mix(vec3(0.012, 0.022, 0.034), vec3(0.030, 0.050, 0.072), far);
  vec3 col = base + vec3(0.42, 0.58, 0.72) * spec * (0.30 + 0.36 * far) + vec3(0.08, 0.12, 0.16) * sheen * 0.55;
  col = mix(col, vec3(0.035, 0.055, 0.078), smoothstep(0.82, 1.0, uv.y) * 0.7);   // haze at the horizon
  vec2 q = uv - 0.5; col *= 1.0 - dot(q, q) * 0.9;                               // vignette
  gl_FragColor = vec4(col, 1.0);
}`;

/** Starts the water shader on a canvas; returns a stop function. Used by the site and by the presentation deck. */
export function startWater(canvas: HTMLCanvasElement, scale = 0.5): () => void {
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" });
  if (!gl) return () => {};
  const sh = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, "attribute vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }"));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, WATER_FRAG));
  gl.linkProgram(prog); gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "p");
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uRes = gl.getUniformLocation(prog, "uRes"), uTime = gl.getUniformLocation(prog, "uTime");
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let raf = 0, last = 0;
  const t0 = performance.now();
  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    if (now - last < 33) return;                        // ~30 fps is plenty for slow water
    last = now;
    const w = Math.max(1, Math.round(canvas.clientWidth * scale)), h = Math.max(1, Math.round(canvas.clientHeight * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; gl.viewport(0, 0, w, h); }
    gl.uniform2f(uRes, w, h);
    gl.uniform1f(uTime, still ? 12 : (now - t0) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (still) cancelAnimationFrame(raf);
  };
  raf = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(raf);
}

export function WaterBackdrop() {
  const ref = useRef<HTMLCanvasElement>(null);
  // phones pack 2-3 device pixels into each CSS pixel: at the desktop's half resolution each water pixel became about
  // six device pixels and the fine ripples broke into smeared bands, so phones render near their real resolution
  useEffect(() => (ref.current ? startWater(ref.current, innerWidth < 860 ? Math.min(1, 0.6 * (devicePixelRatio || 1)) : 0.5) : undefined), []);
  return <canvas ref={ref} className="water" aria-hidden />;
}
