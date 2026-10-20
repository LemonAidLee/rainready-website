// Stylised rain: falling streaks over the model, animated in the vertex shader (one draw call). Look only.
import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const N = 9000, TOP = 320, LEN = 16;

export function Rain({ strength }: { strength: number }) {
  const { geo, mat } = useMemo(() => {
    const pos = new Float32Array(N * 6), seed = new Float32Array(N * 2), end = new Float32Array(N * 2);
    for (let i = 0; i < N; i++) {
      const x = -1222 + Math.random() * 2922, z = -608 + Math.random() * 1438, s = Math.random();
      pos.set([x, 0, z, x, 0, z], i * 6); seed.set([s, s], i * 2); end.set([0, 1], i * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    geo.setAttribute("seed", new THREE.BufferAttribute(seed, 1));
    geo.setAttribute("tip", new THREE.BufferAttribute(end, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(240, 150, 110), 2500);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 } },
      vertexShader: `attribute float seed; attribute float tip; uniform float uTime; varying float vTip;
        void main(){ vec3 p = position; float y = mod(seed * ${TOP}.0 - uTime * 90.0, ${TOP}.0);
          p.y = y + tip * ${LEN}.0; vTip = tip; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: `uniform float uOpacity; varying float vTip;
        void main(){ gl_FragColor = vec4(0.70, 0.82, 0.95, uOpacity * (0.25 + 0.75 * vTip)); }`,
    });
    return { geo, mat };
  }, []);
  useFrame((state, dt) => {
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uOpacity.value = THREE.MathUtils.lerp(mat.uniforms.uOpacity.value, strength * 0.3, Math.min(1, dt * 2));
  });
  return <lineSegments geometry={geo} material={mat} renderOrder={4} />;
}
