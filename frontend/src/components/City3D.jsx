import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Edges, Sparkles, useCursor } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

/* ---------- Settings ---------- */

const SPREAD = 1.25;
const BASE_CELL = 8;
const G = 1;
const CELL = Math.round((BASE_CELL * SPREAD) / G) * G;
const DISTRICT_PAD = 5;
const DISTRICT_GAP = 14;
const FOV = 38;
const BG = '#01030f';

const GOLD = '#ffc933';       
const IMPORTS_COLOR = '#ec4899'; 
const IMPORTED_BY_COLOR = '#38bdf8'; 

const FULL_PATH_LABELS = true;
const LABEL_NEAR_RATIO = 0.55; 
const LABEL_HYSTERESIS = 1.12;

const MIN_H = 4;
const MAX_H = 56;
const SCALE_FLOOR = 10;

const FLOOR_BASE = '#02040c';
const FLOOR_LINE_POWER = 0.45;
const FLOOR_GLOW_POWER = 0.07;

/* ---------- Helpers ---------- */

function makeHeightFn(nodes) {
  const top = Math.max(SCALE_FLOOR, ...nodes.map((n) => Number(n.complexity) || 1));
  return (c) => MIN_H + (Math.max(Number(c) || 1, 1) / top) * (MAX_H - MIN_H);
}

const getHue = (c) => 172 + Math.min(Number(c) / 30, 1) * 58;
const hsl = (hue, s = 86, l = 44) => `hsl(${hue}, ${s}%, ${l}%)`;

const hash = (n) => {
  const x = Math.sin((Number(n) || 0) * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const getFootprint = (id) => ({ w: 5.2 + hash(id * 3.1) * 2.4, d: 4.8 + hash(id * 5.3) * 2.2 });

const shortName = (s = '') => (s.length > 20 ? `${s.slice(0, 19)}…` : s);
const neon = (hex, power) => new THREE.Color(hex).multiplyScalar(power);

const ROAD_POWER = 2.2;
const ROAD_CORE = neon('#ff3df0', ROAD_POWER);
const ROAD_SHELL = neon('#c4189f', 1.2);
const ROAD_PULSE = neon('#ffe3fb', ROAD_POWER);
const ROAD_CORE_ACTIVE = neon('#ffd23f', ROAD_POWER);
const ROAD_SHELL_ACTIVE = neon('#e69b00', 1.2);
const ROAD_PULSE_ACTIVE = neon('#fff6c9', ROAD_POWER);

const DISTRICT_LINE = neon('#5ac8fa', 1.15);
const DISTRICT_FILL = neon('#38bdf8', 1);

const timeUniform = { value: 0 };

function TimeTicker() {
  useFrame(({ clock }) => {
    timeUniform.value = clock.elapsedTime;
  });
  return null;
}

function useDisposable(factory, deps) {
  const obj = useMemo(factory, deps);
  useEffect(() => () => obj?.dispose?.(), [obj]);
  return obj;
}

function useSize(ref) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize({ width: Math.floor(width), height: Math.floor(height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

/* ---------- Layout ---------- */

const snap = (v) => Math.round(v / G) * G;

const folderOf = (p = '') => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
};

function districtLabels(keys) {
  const labels = new Map();
  keys.forEach((k) => {
    if (k === '') labels.set(k, 'root');
    else labels.set(k, k.split('/').pop());
  });
  return labels;
}

function buildLayout(nodes) {
  const pos = new Map();
  const heights = new Map();
  if (nodes.length === 0) {
    return { pos, heights, districts: [], W: 3 * CELL, D: 3 * CELL, hMax: 20 };
  }

  const heightOf = makeHeightFn(nodes);
  const groups = new Map();
  nodes.forEach((n) => {
    const key = folderOf(n.file_path);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  });
  const labels = districtLabels([...groups.keys()]);

  const zones = [...groups.entries()]
    .map(([key, list]) => {
      const cols = Math.ceil(Math.sqrt(list.length));
      const rows = Math.ceil(list.length / cols);
      return {
        key,
        label: labels.get(key),
        list,
        cols,
        rows,
        w: cols * CELL + DISTRICT_PAD * 2,
        d: rows * CELL + DISTRICT_PAD * 2,
      };
    })
    .sort((a, b) => b.list.length - a.list.length || a.key.localeCompare(b.key));

  const totalArea = zones.reduce((s, z) => s + (z.w + DISTRICT_GAP) * (z.d + DISTRICT_GAP), 0);
  const maxRowW = Math.max(Math.sqrt(totalArea) * 1.2, ...zones.map((z) => z.w));

  const rows = [];
  let cur = { zones: [], w: 0, d: 0 };
  zones.forEach((z) => {
    const add = (cur.zones.length ? DISTRICT_GAP : 0) + z.w;
    if (cur.zones.length && cur.w + add > maxRowW) {
      rows.push(cur);
      cur = { zones: [], w: 0, d: 0 };
    }
    cur.w += (cur.zones.length ? DISTRICT_GAP : 0) + z.w;
    cur.d = Math.max(cur.d, z.d);
    cur.zones.push(z);
  });
  rows.push(cur);

  const W = Math.max(...rows.map((r) => r.w));
  const D = rows.reduce((s, r) => s + r.d, 0) + DISTRICT_GAP * (rows.length - 1);

  const districts = [];
  let hMax = 0;
  let zCursor = -D / 2;

  rows.forEach((row) => {
    let xCursor = -row.w / 2;
    row.zones.forEach((z) => {
      const cx = xCursor + z.w / 2;
      const cz = zCursor + row.d / 2;

      const cells = [];
      for (let r = 0; r < z.rows; r++) {
        for (let c = 0; c < z.cols; c++) {
          cells.push({ x: (c - (z.cols - 1) / 2) * CELL, z: (r - (z.rows - 1) / 2) * CELL });
        }
      }
      cells.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));

      const sorted = [...z.list].sort(
        (a, b) =>
          Number(b.complexity) - Number(a.complexity) ||
          String(a.file_path).localeCompare(String(b.file_path))
      );

      sorted.forEach((node, i) => {
        const fp = getFootprint(node.id);
        const H = heightOf(node.complexity);
        pos.set(node.id, {
          x: snap(cx + cells[i].x),
          z: snap(cz + cells[i].z),
          w: fp.w,
          d: fp.d,
        });
        heights.set(node.id, H);
        hMax = Math.max(hMax, H * 1.15 + 4);
      });

      districts.push({ key: z.key, label: z.label, count: z.list.length, cx, cz, w: z.w, d: z.d });
      xCursor += z.w + DISTRICT_GAP;
    });
    zCursor += row.d + DISTRICT_GAP;
  });

  return { pos, heights, districts, W, D, hMax };
}

/* ---------- Roads ---------- */

const DIRS = [ [1, 0], [-1, 0], [0, 1], [0, -1] ];

function makeHeap() {
  const items = [];
  return {
    push(p, v) {
      items.push([p, v]);
      let i = items.length - 1;
      while (i > 0) {
        const par = (i - 1) >> 1;
        if (items[par][0] <= items[i][0]) break;
        [items[par], items[i]] = [items[i], items[par]];
        i = par;
      }
    },
    pop() {
      const top = items[0];
      const last = items.pop();
      if (items.length) {
        items[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < items.length && items[l][0] < items[m][0]) m = l;
          if (r < items.length && items[r][0] < items[m][0]) m = r;
          if (m === i) break;
          [items[m], items[i]] = [items[i], items[m]];
          i = m;
        }
      }
      return top;
    },
    get size() { return items.length; },
  };
}

function routeOnGrid(nx, nz, blocked, s, t) {
  const total = nx * nz;
  const dist = new Float32Array(total * 4).fill(Infinity);
  const prev = new Int32Array(total * 4).fill(-1);
  const heap = makeHeap();
  const h = (ix, iz) => Math.abs(ix - t.ix) + Math.abs(iz - t.iz);

  for (let d = 0; d < 4; d++) {
    const st = (s.iz * nx + s.ix) * 4 + d;
    dist[st] = 0;
    heap.push(h(s.ix, s.iz), st);
  }

  let end = -1;
  while (heap.size) {
    const [, st] = heap.pop();
    const cell = st >> 2;
    const d = st & 3;
    const ix = cell % nx;
    const iz = (cell / nx) | 0;
    if (ix === t.ix && iz === t.iz) { end = st; break; }
    const base = dist[st];
    for (let nd = 0; nd < 4; nd++) {
      const jx = ix + DIRS[nd][0];
      const jz = iz + DIRS[nd][1];
      if (jx < 0 || jz < 0 || jx >= nx || jz >= nz) continue;
      const nc = jz * nx + jx;
      if (blocked[nc]) continue;
      const cost = base + 1 + (nd === d ? 0 : 1.2);
      const ns = nc * 4 + nd;
      if (cost < dist[ns]) {
        dist[ns] = cost;
        prev[ns] = st;
        heap.push(cost + h(jx, jz), ns);
      }
    }
  }
  if (end < 0) return null;

  const cells = [];
  for (let st = end; st >= 0; st = prev[st]) cells.push(st >> 2);
  cells.reverse();
  return cells.map((c) => [c % nx, (c / nx) | 0]);
}

function simplify(pts) {
  if (pts.length < 3) return pts;
  const out = [pts[0]];
  for (let i = 1; i < pts.length - 1; i++) {
    const [px, pz] = out[out.length - 1];
    const [cx, cz] = pts[i];
    const [qx, qz] = pts[i + 1];
    const sameX = px === cx && cx === qx;
    const sameZ = pz === cz && cz === qz;
    if (!sameX && !sameZ) out.push(pts[i]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}

const rectOf = (p) => ({ x: p.x, z: p.z, hx: p.w / 2 + 1.8, hz: p.d / 2 + 1.8 });

function clipStart(pts, rect) {
  const inside = (p) => Math.abs(p[0] - rect.x) < rect.hx && Math.abs(p[1] - rect.z) < rect.hz;
  let k = 0;
  while (k < pts.length && inside(pts[k])) k += 1;
  if (k === 0 || k >= pts.length) return pts;

  const a = pts[k - 1];
  const b = pts[k];
  const exit = a[0] !== b[0]
      ? [rect.x + Math.sign(b[0] - a[0]) * rect.hx, a[1]]
      : [a[0], rect.z + Math.sign(b[1] - a[1]) * rect.hz];
  return [exit, ...pts.slice(k)];
}

function createRouter(layout) {
  const { pos, W, D } = layout;
  const margin = 10;
  const ox = -Math.ceil((W / 2 + margin) / G) * G;
  const oz = -Math.ceil((D / 2 + margin) / G) * G;
  const nx = Math.ceil((-2 * ox) / G) + 1;
  const nz = Math.ceil((-2 * oz) / G) + 1;
  const blocked = new Uint8Array(nx * nz);
  const toIx = (x) => Math.round((x - ox) / G);
  const toIz = (z) => Math.round((z - oz) / G);

  const footprints = new Map();
  pos.forEach((p, id) => {
    const r = rectOf(p);
    const cells = [];
    for (let iz = Math.max(0, toIz(p.z - r.hz)); iz <= Math.min(nz - 1, toIz(p.z + r.hz)); iz++) {
      for (let ix = Math.max(0, toIx(p.x - r.hx)); ix <= Math.min(nx - 1, toIx(p.x + r.hx)); ix++) {
        const wx = ox + ix * G;
        const wz = oz + iz * G;
        if (Math.abs(wx - p.x) <= r.hx && Math.abs(wz - p.z) <= r.hz) cells.push(iz * nx + ix);
      }
    }
    cells.forEach((c) => { blocked[c] += 1; });
    footprints.set(id, cells);
  });

  return function route(idA, idB) {
    const A = pos.get(idA);
    const B = pos.get(idB);
    if (!A || !B) return null;

    const ca = footprints.get(idA);
    const cb = footprints.get(idB);
    ca.forEach((c) => { blocked[c] -= 1; });
    cb.forEach((c) => { blocked[c] -= 1; });
    const cells = routeOnGrid(nx, nz, blocked, { ix: toIx(A.x), iz: toIz(A.z) }, { ix: toIx(B.x), iz: toIz(B.z) });
    ca.forEach((c) => { blocked[c] += 1; });
    cb.forEach((c) => { blocked[c] += 1; });

    let pts = cells ? simplify(cells.map(([ix, iz]) => [ox + ix * G, oz + iz * G])) : [[A.x, A.z], [B.x, A.z], [B.x, B.z]];
    pts = clipStart(pts, rectOf(A));
    pts = clipStart([...pts].reverse(), rectOf(B)).reverse();
    return pts.length >= 2 ? pts : [[A.x, A.z], [B.x, B.z]];
  };
}

/* ---------- Camera ---------- */

function computeCamera(W, D, hMax, aspect) {
  const vf = THREE.MathUtils.degToRad(FOV);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  const radiusB = Math.hypot(Math.hypot(W, D) / 2, hMax * 0.7);
  const dist = (radiusB / Math.sin(Math.min(vf, hf) / 2)) * 0.82;
  const el = THREE.MathUtils.degToRad(30);
  const az = THREE.MathUtils.degToRad(35);
  const target = [0, hMax * 0.3, 0];

  return {
    dist, target,
    position: [
      target[0] + dist * Math.cos(el) * Math.sin(az),
      target[1] + dist * Math.sin(el),
      target[2] + dist * Math.cos(el) * Math.cos(az),
    ],
  };
}

function CameraFit({ cam }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);

  useEffect(() => {
    camera.position.set(cam.position[0], cam.position[1], cam.position[2]);
    camera.updateProjectionMatrix();
    if (controls) {
      controls.target.set(cam.target[0], cam.target[1], cam.target[2]);
      controls.update();
    } else {
      camera.lookAt(cam.target[0], cam.target[1], cam.target[2]);
    }
  }, [cam, camera, controls]);

  return null;
}

/* ---------- Floor ---------- */

const floorVertex = `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const floorFragment = `
  uniform vec3 uBase; uniform vec3 uLine; uniform vec3 uGlow; uniform vec3 uFar;
  uniform float uTile; uniform float uRadius; uniform float uGlowR;
  varying vec3 vWorld;

  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 p = vWorld.xz / uTile;
    vec2 f = fract(p);
    vec2 e = min(f, 1.0 - f);
    float edge = min(e.x, e.y);
    float w = max(fwidth(p.x), fwidth(p.y));
    float seam = 1.0 - smoothstep(0.0, 0.02 + w, edge);
    float bevel = 1.0 - smoothstep(0.02, 0.16, edge);
    float detail = 1.0 - smoothstep(0.25, 0.5, w);
    float d = length(vWorld.xz);
    float fade = 1.0 - smoothstep(uRadius * 0.25, uRadius * 1.2, d);
    float tileRand = h21(floor(p));
    vec3 col = uBase * (0.85 + tileRand * 0.4);
    col += uLine * (seam * 0.8 + bevel * 0.12) * detail * fade;
    col += uLine * 0.03 * (1.0 - detail) * fade;
    col += uGlow * exp(-(d * d) / (uGlowR * uGlowR));
    col = mix(uFar, col, fade * 0.9 + 0.1);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function FloorGrid({ radius, glowR }) {
  const uniforms = useMemo(
    () => ({
      uBase: { value: new THREE.Color(FLOOR_BASE) },
      uLine: { value: neon('#2a8fc4', FLOOR_LINE_POWER) },
      uGlow: { value: neon('#0b3a9c', FLOOR_GLOW_POWER) },
      uFar: { value: new THREE.Color(BG) },
      uTile: { value: 5 },
      uRadius: { value: radius },
      uGlowR: { value: glowR },
    }),
    [radius, glowR]
  );

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} renderOrder={-3} raycast={() => null}>
      <planeGeometry args={[3000, 3000]} />
      <shaderMaterial transparent depthWrite={false} uniforms={uniforms} vertexShader={floorVertex} fragmentShader={floorFragment} />
    </mesh>
  );
}

/* ---------- Districts ---------- */

function roundedRectPath(p, w, h, r) {
  const x = -w / 2;
  const y = -h / 2;
  p.moveTo(x + r, y); p.lineTo(x + w - r, y);
  p.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  p.lineTo(x + w, y + h - r);
  p.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  p.lineTo(x + r, y + h);
  p.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  p.lineTo(x, y + r);
  p.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
}

function ringGeometry(w, d, r, thick, depth) {
  const s = new THREE.Shape(); roundedRectPath(s, w, d, r);
  const hole = new THREE.Path(); roundedRectPath(hole, w - thick * 2, d - thick * 2, Math.max(r - thick, 0.2));
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: false, curveSegments: 12 });
  g.rotateX(-Math.PI / 2);
  return g;
}

function District({ zone, labelDist, showAll }) {
  const ring = useDisposable(() => ringGeometry(zone.w, zone.d, 3, 0.35, 0.05), [zone.w, zone.d]);
  const fill = useDisposable(() => {
    const s = new THREE.Shape(); roundedRectPath(s, zone.w, zone.d, 3);
    const g = new THREE.ShapeGeometry(s, 12); g.rotateX(-Math.PI / 2); return g;
  }, [zone.w, zone.d]);

  const [near, setNear] = useState(false);
  const nearRef = useRef(false);
  const center = useMemo(() => new THREE.Vector3(zone.cx, 0, zone.cz), [zone.cx, zone.cz]);
  
  useFrame(({ camera }) => {
    const dist = camera.position.distanceTo(center);
    const limit = nearRef.current ? labelDist * 1.5 * LABEL_HYSTERESIS : labelDist * 1.5;
    const isNear = dist < limit;
    if (isNear !== nearRef.current) {
      nearRef.current = isNear;
      setNear(isNear);
    }
  });

  // Show label if Show All is ON, or if user is near
  const showLabel = showAll || near;

  return (
    <group position={[zone.cx, 0.02, zone.cz]}>
      <mesh geometry={fill} raycast={() => null}>
        <meshBasicMaterial color={DISTRICT_FILL} transparent opacity={0.06} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh geometry={ring} raycast={() => null}>
        <meshBasicMaterial color={DISTRICT_LINE} toneMapped={false} />
      </mesh>
      
      {showLabel && (
        <Html position={[0, 0.3, zone.d / 2 + 1.8]} center zIndexRange={[8, 0]} style={{ pointerEvents: 'none' }}>
          <div className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-sky-400/40 bg-slate-950/85 px-2 py-1 text-[10px] font-semibold leading-none tracking-wide text-sky-200 shadow-lg">
            <span>{zone.label}</span>
            <span className="rounded bg-sky-400/15 px-1 py-0.5 text-[9px] text-sky-300">{zone.count}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

/* ---------- Buildings ---------- */

const holoVertex = `
  uniform vec3 uOrigin;
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vNormalV;
  varying vec3 vViewPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPos = wp.xyz - uOrigin;
    vNormalW = mat3(modelMatrix) * normal;
    vNormalV = normalMatrix * normal;
    vec4 mv = viewMatrix * wp;
    vViewPos = -mv.xyz;
    gl_Position = projectionMatrix * mv;
  }
`;

const holoFragment = `
  uniform vec3 uColor; uniform float uBoost; uniform float uTime; uniform float uSeed; uniform float uReflect;
  varying vec3 vPos; varying vec3 vNormalW; varying vec3 vNormalV; varying vec3 vViewPos;

  const vec2 CELL = vec2(0.75, 1.0); 
  float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float gridLine(float v, float cell) {
    float q = v / cell;
    float w = max(fwidth(q), 1e-4);
    float d = abs(fract(q - 0.5) - 0.5) / w;
    float l = 1.0 - clamp(d / 1.2, 0.0, 1.0);
    return l * (1.0 - smoothstep(0.3, 0.5, w));
  }

  void main() {
    vec3 n = normalize(vNormalW);
    float roof = smoothstep(0.3, 0.6, abs(n.y));
    bool alongX = abs(n.x) > abs(n.z);
    vec2 uv = alongX ? vec2(vPos.z, vPos.y) : vec2(vPos.x, vPos.y);
    float face = alongX ? (n.x > 0.0 ? 1.0 : 2.0) : (n.z > 0.0 ? 3.0 : 4.0);

    float faceShade = alongX ? (n.x > 0.0 ? 0.94 : 0.74) : (n.z > 0.0 ? 1.0 : 0.8);
    if (roof > 0.5) faceShade = 0.86;

    vec2 q = uv / CELL;
    vec2 id = floor(q);
    vec2 f = fract(q);
    float rnd = h21(id + face * 17.0 + uSeed * 53.0);
    float pane = step(0.14, f.x) * step(f.x, 0.86) * step(0.2, f.y) * step(f.y, 0.8);
    float lit = smoothstep(0.3, 0.9, rnd);
    float tw = 0.86 + 0.14 * sin(uTime * 2.2 + rnd * 40.0);
    float windows = pane * (0.12 + lit * 0.85) * tw;

    float aa = smoothstep(0.3, 0.7, max(fwidth(q.x), fwidth(q.y)));
    windows = mix(windows, 0.28, aa);

    float mull = gridLine(uv.x, CELL.x * 4.0) * 0.52;
    float band = gridLine(uv.y, CELL.y * 6.0) * 0.45;

    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewPos))), 2.3);
    float scan = smoothstep(0.94, 1.0, sin(vPos.y * 0.45 - uTime * 1.35) * 0.5 + 0.5);

    float neonSpark = step(0.93, rnd) * pane;
    vec3 solidWall = uColor * (0.44 * faceShade);
    vec3 neonTint = mix(uColor * 1.45, vec3(0.45, 0.95, 1.0), neonSpark * 0.75);
    float facade = windows * (1.0 - roof) + roof * 0.12;

    vec3 col = solidWall + neonTint * (facade * 0.82 + (mull + band) * (1.0 - roof) + fres * 0.42 + scan * 0.16);
    col *= uBoost;

    if (uReflect > 0.5) {
      float rf = exp(-abs(vPos.y) * 0.08);
      gl_FragColor = vec4(col * rf, rf * 0.6);
    } else {
      gl_FragColor = vec4(col, 0.96);
    }
  }
`;

function makeHoloMaterial(x, z, seed, reflect) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color('#22d3ee') },
      uBoost: { value: 1.05 },
      uTime: timeUniform,
      uSeed: { value: seed },
      uReflect: { value: reflect },
      uOrigin: { value: new THREE.Vector3(x, 0, z) },
    },
    vertexShader: holoVertex,
    fragmentShader: holoFragment,
    transparent: true,
    depthWrite: reflect < 0.5,
    side: THREE.FrontSide,
    blending: reflect > 0.5 ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

function pickType(H, r) {
  if (H < 14) return r < 0.65 ? 'lowrise' : 'cluster';
  return ['slab', 'setback', 'pyramid', 'deco', 'cluster', 'slab'][Math.floor(r * 6) % 6];
}

function finish(parts, masts) {
  let top = 0;
  parts.forEach((p) => { top = Math.max(top, p.k === 'pyr' ? p.y + p.h : p.y + p.sy / 2); });
  masts.forEach((m) => { top = Math.max(top, m.y + m.h); });
  return { parts, masts, top };
}

function buildShape(type, H, bw, bd) {
  const parts = [];
  const masts = [];
  const box = (sx, sy, sz, y0, x = 0, z = 0) => parts.push({ k: 'box', sx, sy, sz, x, y: y0 + sy / 2, z });
  const pyr = (sx, sz, h, y0) => parts.push({ k: 'pyr', sx, sz, h, x: 0, y: y0, z: 0 });

  switch (type) {
    case 'slab': {
      box(bw, H, bd, 0); box(bw * 0.4, 1.1, bd * 0.4, H);
      masts.push({ x: bw * 0.18, z: -bd * 0.12, y: H + 1.1, h: Math.max(2.5, H * 0.12) }); break;
    }
    case 'setback': {
      const h1 = H * 0.55, h2 = H * 0.28, h3 = H - h1 - h2;
      box(bw, h1, bd, 0); box(bw * 0.78, h2, bd * 0.78, h1); box(bw * 0.54, h3, bd * 0.54, h1 + h2);
      masts.push({ x: 0, z: 0, y: H, h: H * 0.14 }); break;
    }
    case 'pyramid': {
      const hb = H * 0.78; box(bw, hb, bd, 0); pyr(bw, bd, H - hb, hb);
      masts.push({ x: 0, z: 0, y: H, h: Math.max(3, H * 0.16) }); break;
    }
    case 'deco': {
      const a = H * 0.46, b = H * 0.26, c = H * 0.16, d = H - a - b - c;
      box(bw, a, bd, 0); box(bw * 0.82, b, bd * 0.82, a); box(bw * 0.62, c, bd * 0.62, a + b); box(bw * 0.4, d, bd * 0.4, a + b + c);
      masts.push({ x: 0, z: 0, y: H, h: H * 0.12 }); break;
    }
    case 'cluster': {
      box(bw * 0.62, H, bd * 0.7, 0, -bw * 0.16, 0); box(bw * 0.4, H * 0.58, bd * 0.62, 0, bw * 0.3, bd * 0.04); box(bw * 0.36, 1, bd * 0.4, H, -bw * 0.16, 0);
      masts.push({ x: -bw * 0.16, z: 0, y: H + 1, h: Math.max(2, H * 0.1) }); break;
    }
    default: {
      const h = Math.max(4, H * 0.8);
      box(bw * 1.1, h, bd * 1.05, 0); box(bw * 0.35, 0.9, bd * 0.35, h, -bw * 0.2, 0); box(bw * 0.25, 0.7, bd * 0.3, h, bw * 0.25, bd * 0.1); break;
    }
  }
  return finish(parts, masts);
}

function RectPyramid({ sx, sz, h }) {
  const geo = useDisposable(() => {
    const hx = sx / 2; const hz = sz / 2;
    const A = [-hx, 0, -hz]; const B = [hx, 0, -hz]; const C = [hx, 0, hz]; const D = [-hx, 0, hz]; const T = [0, h, 0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([...A, ...B, ...T, ...B, ...C, ...T, ...C, ...D, ...T, ...D, ...A, ...T], 3));
    g.computeVertexNormals(); return g;
  }, [sx, sz, h]);
  return <primitive object={geo} attach="geometry" />;
}

function PartMesh({ part, material, handlers, edgeColor }) {
  const rayProps = handlers || { raycast: () => null };
  return (
    <mesh position={[part.x, part.y, part.z]} material={material} {...rayProps}>
      {part.k === 'box' ? <boxGeometry args={[part.sx, part.sy, part.sz]} /> : <RectPyramid sx={part.sx} sz={part.sz} h={part.h} />}
      {edgeColor && <Edges threshold={15} color={edgeColor} />}
    </mesh>
  );
}

function Mast({ m, color }) {
  const tip = useRef();
  useFrame(({ clock }) => {
    if (tip.current) tip.current.scale.setScalar(1 + 0.35 * Math.sin(clock.elapsedTime * 3 + m.x * 3 + m.h));
  });
  return (
    <group position={[m.x, m.y, m.z]}>
      <mesh position={[0, m.h / 2, 0]} raycast={() => null}>
        <boxGeometry args={[0.14, m.h, 0.14]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      <mesh ref={tip} position={[0, m.h, 0]} raycast={() => null}>
        <sphereGeometry args={[0.3, 12, 12]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Footprint({ w, d, color }) {
  const geo = useDisposable(() => {
    const hx = w / 2 + 0.8; const hz = d / 2 + 0.8; const L = Math.min(hx, hz) * 0.7;
    const pts = [];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        pts.push(sx * hx, 0.06, sz * hz, sx * (hx - L), 0.06, sz * hz);
        pts.push(sx * hx, 0.06, sz * hz, sx * hx, 0.06, sz * (hz - L));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [w, d]);

  return (
    <group>
      <lineSegments geometry={geo} raycast={() => null}>
        <lineBasicMaterial color={color} toneMapped={false} />
      </lineSegments>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.04, 0]} raycast={() => null}>
        <planeGeometry args={[w + 1.6, d + 1.6]} />
        <meshBasicMaterial color={color} transparent opacity={0.12} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

function Building({ node, x, z, w, d, H, labelDist, selected, onSelect, highlightState, showAll }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const hue = getHue(node.complexity);
  const seed = hash(node.id * 1.9);

  const shape = useMemo(
    () => buildShape(pickType(H, hash(node.id * 7.7)), H, w, d),
    [H, w, d, node.id]
  );

  const [near, setNear] = useState(false);
  const nearRef = useRef(false);
  const center = useMemo(() => new THREE.Vector3(x, H / 2, z), [x, H, z]);
  useFrame(({ camera }) => {
    const dist = camera.position.distanceTo(center);
    const limit = nearRef.current ? labelDist * LABEL_HYSTERESIS : labelDist;
    const isNear = dist < limit;
    if (isNear !== nearRef.current) {
      nearRef.current = isNear;
      setNear(isNear);
    }
  });

  const mat = useMemo(() => makeHoloMaterial(x, z, seed, 0), [x, z, seed]);
  const refl = useMemo(() => makeHoloMaterial(x, z, seed, 1), [x, z, seed]);
  useEffect(
    () => () => {
      mat.dispose(); refl.dispose();
    },
    [mat, refl]
  );

  const palette = useMemo(() => {
    let baseColor;
    if (selected) baseColor = new THREE.Color(GOLD);
    else if (highlightState === 'imports') baseColor = new THREE.Color(IMPORTS_COLOR);
    else if (highlightState === 'importedBy') baseColor = new THREE.Color(IMPORTED_BY_COLOR);
    else baseColor = new THREE.Color(hsl(hue));

    return {
      base: baseColor,
      edge: baseColor.clone().multiplyScalar(selected || highlightState ? 2.2 : hovered ? 1.8 : 1.45),
      line: baseColor.clone().multiplyScalar(selected || highlightState ? 1.85 : hovered ? 1.55 : 1.25),
      mast: baseColor.clone().multiplyScalar(selected || highlightState ? 1.85 : 1.65),
    };
  }, [hue, selected, hovered, highlightState]);

  useEffect(() => {
    const boost = selected ? 1.6 : (highlightState ? 1.5 : hovered ? 1.25 : 1.02);
    mat.uniforms.uColor.value.copy(palette.base);
    mat.uniforms.uBoost.value = boost;
    refl.uniforms.uColor.value.copy(palette.base);
    refl.uniforms.uBoost.value = boost * 0.3;
  }, [mat, refl, palette, selected, hovered, highlightState]);

  const handlers = {
    onClick: (e) => { e.stopPropagation(); onSelect(node.id); },
    onPointerOver: (e) => { e.stopPropagation(); setHovered(true); },
    onPointerOut: () => setHovered(false),
  };

  const showLabel = hovered || selected || near || highlightState || showAll;

  return (
    <group position={[x, 0, z]}>
      {shape.parts.map((p, i) => (
        <PartMesh key={i} part={p} material={mat} handlers={handlers} edgeColor={palette.edge} />
      ))}
      {shape.masts.map((m, i) => (
        <Mast key={i} m={m} color={palette.mast} />
      ))}
      <Footprint w={w} d={d} color={palette.line} />

      <group scale={[1, -1, 1]} renderOrder={-2}>
        {shape.parts.map((p, i) => (
          <PartMesh key={i} part={p} material={refl} />
        ))}
      </group>

      {showLabel && (
        <Html position={[0, shape.top + 1.8, 0]} center zIndexRange={[10, 0]} style={{ pointerEvents: 'none' }}>
          <div className={`whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-medium leading-none shadow-lg ${
              selected ? 'border-amber-300 bg-slate-950/90 text-amber-200' 
              : highlightState === 'imports' ? 'border-pink-400 bg-slate-950/90 text-pink-200'
              : highlightState === 'importedBy' ? 'border-sky-400 bg-slate-950/90 text-sky-200'
              : 'border-cyan-400/30 bg-slate-950/80 text-cyan-100'
            }`}>
            {shortName(node.file_name)}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ---------- Roads ---------- */

function Road({ points, active, index }) {
  const pulse = useRef();

  const info = useMemo(() => {
    const segs = [];
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const [x1, z1] = points[i];
      const [x2, z2] = points[i + 1];
      const len = Math.hypot(x2 - x1, z2 - z1);
      if (len < 1e-4) continue;
      segs.push({ x1, z1, x2, z2, len, start: total });
      total += len;
    }
    return { segs, total };
  }, [points]);

  useFrame(({ clock }) => {
    const m = pulse.current;
    if (!m || info.total === 0) return;
    const dist = (clock.elapsedTime * 9 + index * 4.7) % (info.total + 10);
    if (dist > info.total) { m.visible = false; return; }
    m.visible = true;
    let s = info.segs[info.segs.length - 1];
    for (const seg of info.segs) {
      if (dist <= seg.start + seg.len) { s = seg; break; }
    }
    const t = (dist - s.start) / s.len;
    m.position.set(s.x1 + (s.x2 - s.x1) * t, 0.36, s.z1 + (s.z2 - s.z1) * t);
  });

  const k = active ? 1.4 : 1;
  const coreW = 0.45 * k; 
  const shellW = 1.2 * k; 
  const core = active ? ROAD_CORE_ACTIVE : ROAD_CORE;
  const shell = active ? ROAD_SHELL_ACTIVE : ROAD_SHELL;

  return (
    <group>
      {info.segs.map((s, i) => {
        const horizontal = Math.abs(s.x2 - s.x1) > Math.abs(s.z2 - s.z1);
        const cx = (s.x1 + s.x2) / 2;
        const cz = (s.z1 + s.z2) / 2;
        return (
          <group key={i}>
            <mesh position={[cx, 0.14, cz]} raycast={() => null}>
              <boxGeometry args={horizontal ? [s.len, 0.1, shellW] : [shellW, 0.1, s.len]} />
              <meshBasicMaterial color={shell} toneMapped={false} />
            </mesh>
            <mesh position={[cx, 0.22, cz]} raycast={() => null}>
              <boxGeometry args={horizontal ? [s.len, 0.14, coreW] : [coreW, 0.14, s.len]} />
              <meshBasicMaterial color={core} toneMapped={false} />
            </mesh>
          </group>
        );
      })}

      {points.map(([x, z], i) => (
        <group key={i}>
          <mesh position={[x, 0.14, z]} raycast={() => null}>
            <boxGeometry args={[shellW, 0.1, shellW]} />
            <meshBasicMaterial color={shell} toneMapped={false} />
          </mesh>
          <mesh position={[x, 0.22, z]} raycast={() => null}>
            <boxGeometry args={[coreW, 0.14, coreW]} />
            <meshBasicMaterial color={core} toneMapped={false} />
          </mesh>
        </group>
      ))}

      <mesh ref={pulse} raycast={() => null}>
        <sphereGeometry args={[0.45 * k, 16, 16]} />
        <meshBasicMaterial color={active ? ROAD_PULSE_ACTIVE : ROAD_PULSE} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------- City Component ---------- */

export default function City3D({ nodes = [], edges = [], height = 500 }) {
  const wrapRef = useRef(null);
  const size = useSize(wrapRef);
  const [selectedId, setSelectedId] = useState(null);
  
  // NEW: State for the toggle button
  const [showAllLabels, setShowAllLabels] = useState(false);

  const nodeById = useMemo(() => {
    const map = new Map();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  const selected = selectedId != null ? nodeById.get(selectedId) || null : null;

  const layout = useMemo(() => buildLayout(nodes), [nodes]);

  const aspect = size.width > 0 && size.height > 0 ? Math.round((size.width / size.height) * 100) / 100 : 1.6;
  const cam = useMemo(() => computeCamera(layout.W, layout.D, layout.hMax, aspect), [layout.W, layout.D, layout.hMax, aspect]);

  const labelDist = cam.dist * LABEL_NEAR_RATIO;

  const roads = useMemo(() => {
    const route = createRouter(layout);
    return edges.map((e) => {
        const points = route(e.source_node_id, e.target_node_id);
        if (!points) return null;
        return { id: e.id ?? `${e.source_node_id}-${e.target_node_id}`, source: e.source_node_id, target: e.target_node_id, points };
      }).filter(Boolean);
  }, [edges, layout]);

  const highlightMap = useMemo(() => {
    const map = new Map();
    if (!selected) return map;

    edges.forEach((e) => {
      if (e.source_node_id === selected.id) map.set(e.target_node_id, 'imports');
      if (e.target_node_id === selected.id) map.set(e.source_node_id, 'importedBy');
    });
    
    return map;
  }, [selected, edges]);

  const { imports, importedBy } = useMemo(() => {
    if (!selected) return { imports: [], importedBy: [] };
    return {
      imports: edges.filter((e) => e.source_node_id === selected.id).map((e) => nodeById.get(e.target_node_id)).filter(Boolean),
      importedBy: edges.filter((e) => e.target_node_id === selected.id).map((e) => nodeById.get(e.source_node_id)).filter(Boolean),
    };
  }, [selected, edges, nodeById]);

  const span = Math.max(layout.W, layout.D);

  return (
    <div className="relative">
      {/* Toggle Button for Labels */}
      <div className="absolute top-4 right-4 z-10">
        <button
          onClick={() => setShowAllLabels(!showAllLabels)}
          className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium shadow-lg backdrop-blur-md transition-all duration-200 ${
            showAllLabels 
              ? 'border-violet-500/50 bg-violet-600/20 text-violet-200' 
              : 'border-slate-700 bg-slate-900/80 text-slate-400 hover:text-slate-200'
          }`}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {showAllLabels ? (
              <><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>
            ) : (
              <><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" /><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" /><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" /><line x1="2" x2="22" y1="2" y2="22" /></>
            )}
          </svg>
          {showAllLabels ? 'Hide Labels' : 'Show Labels'}
        </button>
      </div>

      <div
        ref={wrapRef}
        style={{ width: '100%', height }}
        className="overflow-hidden rounded-xl border border-cyan-500/20 shadow-[0_0_40px_-12px_rgba(34,211,238,0.5)]"
      >
        <Canvas
          camera={{ fov: FOV, near: 1, far: 3000, position: cam.position }}
          dpr={[1, 2]}
          gl={{ antialias: false }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <color attach="background" args={[BG]} />
          <TimeTicker />

          <FloorGrid radius={span * 1.8} glowR={span * 0.6} />

          <Sparkles
            count={70}
            scale={[layout.W, layout.hMax, layout.D]}
            position={[0, layout.hMax * 0.5, 0]}
            size={2.5}
            speed={0.25}
            opacity={0.6}
            color="#7dd3fc"
          />

          {layout.districts.map((zone) => (
            <District key={zone.key || '(root)'} zone={zone} labelDist={labelDist} showAll={showAllLabels} />
          ))}

          {nodes.map((node) => {
            const p = layout.pos.get(node.id);
            if (!p) return null;
            return (
              <Building
                key={node.id}
                node={node}
                x={p.x}
                z={p.z}
                w={p.w}
                d={p.d}
                H={layout.heights.get(node.id)}
                labelDist={labelDist}
                selected={selected?.id === node.id}
                highlightState={highlightMap.get(node.id)}
                onSelect={setSelectedId}
                showAll={showAllLabels}
              />
            );
          })}

          {roads.map((road, i) => (
            <Road
              key={road.id}
              points={road.points}
              index={i}
              active={Boolean(selected && (road.source === selected.id || road.target === selected.id))}
            />
          ))}

          <OrbitControls
            makeDefault
            minDistance={30}
            maxDistance={cam.dist * 1.8}
            maxPolarAngle={Math.PI / 2.08}
          />
          <CameraFit cam={cam} />

          <EffectComposer multisampling={4}>
            <Bloom mipmapBlur intensity={0.62} luminanceThreshold={0.62} luminanceSmoothing={0.35} radius={0.8} />
            <Vignette eskil={false} offset={0.3} darkness={0.9} />
          </EffectComposer>
        </Canvas>
      </div>

      <div className="mt-3 min-h-[60px] rounded-lg border border-cyan-500/20 bg-slate-950/70 p-3 text-sm text-slate-300">
        {selected ? (
          <>
            <strong className="text-amber-300">{selected.file_name}</strong>
            <div className="break-all">Path: {selected.file_path}</div>
            <div>Complexity: {selected.complexity}</div>
            <div>
              <span className="text-pink-400">Imports ({imports.length}):</span> {imports.map((n) => n.file_name).join(', ') || 'none'}
            </div>
            <div>
              <span className="text-sky-400">Imported by ({importedBy.length}):</span> {importedBy.map((n) => n.file_name).join(', ') || 'none'}
            </div>
          </>
        ) : (
          <span>Click a building to see its details.</span>
        )}
      </div>
    </div>
  );
}