import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html, Edges, Sparkles, useCursor } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

/* ---------- Settings ---------- */

const SPREAD = 1.25;              // spacing between towers (lower = tighter city)
const BASE_CELL = 8;
const CELL = BASE_CELL * SPREAD;  // distance between building centers
const SHOW_ALL_LABELS = true;     // false = file name only on hover or selection
const FOV = 38;
const GOLD = '#ffc933';
const BG = '#01030f';

/* ---------- Helpers ---------- */

// Height settings (the maximum is the same 48 as before)
const MAX_HEIGHT = 48;
const MIN_HEIGHT = 4;  // complexity 1
const STEP = 4;        // extra height per complexity point, up to the knee
const KNEE = 10;       // complexity where the straight line ends

const getHeight = (complexity) => {
  const c = Math.max(Number(complexity) || 1, 1);

  // Straight line: complexity 1 = 4, 5 = 20, 10 = 40
  const linear = MIN_HEIGHT + (Math.min(c, KNEE) - 1) * STEP;
  if (c <= KNEE) return linear;

  // Above the knee the growth slows down and eases toward the cap,
  // so very complex files still differ from each other but never exceed 48
  const room = MAX_HEIGHT - linear;
  return linear + room * (1 - Math.exp(-(c - KNEE) / 30));
};

// Complexity -> hue: simple = teal, complex = deep blue
const getHue = (c) => 172 + Math.min(Number(c) / 30, 1) * 58;
const hsl = (hue, s = 86, l = 44) => `hsl(${hue}, ${s}%, ${l}%)`;

// Stable pseudo-random number (0 to 1)
const hash = (n) => {
  const x = Math.sin((Number(n) || 0) * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const getFootprint = (id) => ({ w: 5.2 + hash(id * 3.1) * 2.4, d: 4.8 + hash(id * 5.3) * 2.2 });

const shortName = (s = '') => (s.length > 20 ? `${s.slice(0, 19)}…` : s);

// Multiplying a color above 1.0 makes it extra bright, so Bloom makes it glow
const neon = (hex, power) => new THREE.Color(hex).multiplyScalar(power);

// Road colors: bright magenta. For cyan, use '#22e5ff', '#0a8ea6' and '#d6fbff' instead.
const ROAD_POWER = 2.2; // brightness (above 1 makes Bloom glow). Lower it if it is too glaring.
const ROAD_CORE = neon('#ff3df0', ROAD_POWER);
const ROAD_SHELL = neon('#c4189f', 1.2);
const ROAD_PULSE = neon('#ffe3fb', ROAD_POWER);
const ROAD_CORE_ACTIVE = neon('#ffd23f', ROAD_POWER);
const ROAD_SHELL_ACTIVE = neon('#e69b00', 1.2);
const ROAD_PULSE_ACTIVE = neon('#fff6c9', ROAD_POWER);

// One clock shared by every animated shader
const timeUniform = { value: 0 };

function TimeTicker() {
  useFrame(({ clock }) => {
    timeUniform.value = clock.elapsedTime;
  });
  return null;
}

// Creates something once and disposes it when it is replaced or removed
function useDisposable(factory, deps) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const obj = useMemo(factory, deps);
  useEffect(() => () => obj?.dispose?.(), [obj]);
  return obj;
}

// Measures the container, so the camera can fit the city to its shape
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

/* ---------- Layout: snap buildings onto a compact grid ---------- */

function buildLayout(nodes) {
  const pos = new Map();
  const cols = Math.max(3, Math.ceil(Math.sqrt(Math.max(nodes.length, 1) * 1.5)));
  const rows = cols;
  const extent = cols * CELL + 12;

  if (nodes.length === 0) return { pos, cols, extent, hMax: 20 };

  const xs = nodes.map((n) => Number(n.position_x));
  const zs = nodes.map((n) => Number(n.position_y));
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const spanX = Math.max(...xs) - minX || 1;
  const spanZ = Math.max(...zs) - minZ || 1;

  const taken = new Set();
  let hMax = 0;

  nodes.forEach((node, i) => {
    const gx = ((xs[i] - minX) / spanX) * (cols - 1);
    const gz = ((zs[i] - minZ) / spanZ) * (rows - 1);

    let best = null;
    let bestD = Infinity;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (taken.has(r * cols + c)) continue;
        const d = (c - gx) ** 2 + (r - gz) ** 2;
        if (d < bestD) {
          bestD = d;
          best = { c, r };
        }
      }
    }
    taken.add(best.r * cols + best.c);

    const fp = getFootprint(node.id);
    pos.set(node.id, {
      x: (best.c - (cols - 1) / 2) * CELL,
      z: (best.r - (rows - 1) / 2) * CELL,
      c: best.c,
      r: best.r,
      w: fp.w,
      d: fp.d,
    });
    hMax = Math.max(hMax, getHeight(node.complexity) * 1.15 + 4);
  });

  return { pos, cols, extent, hMax };
}

/* ---------- Roads follow the gaps between blocks ---------- */

function routePath(A, B, cols) {
  const line = (i) => (i - cols / 2) * CELL;

  if (A.c === B.c && Math.abs(A.r - B.r) === 1) {
    const dir = Math.sign(B.z - A.z);
    return [
      [A.x, A.z + dir * (A.d / 2)],
      [B.x, B.z - dir * (B.d / 2)],
    ];
  }

  const rowA = B.r > A.r ? A.r + 1 : B.r < A.r ? A.r : A.r + 1;
  const rowB = A.r > B.r ? B.r + 1 : A.r < B.r ? B.r : B.r + 1;
  const colS = B.c > A.c ? A.c + 1 : B.c < A.c ? B.c : A.c + 1;
  const zsA = line(rowA);
  const zsB = line(rowB);
  const xs = line(colS);

  const pts = [
    [A.x, A.z + Math.sign(zsA - A.z) * (A.d / 2)],
    [A.x, zsA],
    [xs, zsA],
    [xs, zsB],
    [B.x, zsB],
    [B.x, B.z + Math.sign(zsB - B.z) * (B.d / 2)],
  ];
  return pts.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4
  );
}

/* ---------- Camera: 3/4 view from above that fits the whole city ---------- */

function computeCamera(extent, hMax, aspect) {
  const vf = THREE.MathUtils.degToRad(FOV);
  const hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  const radiusB = Math.hypot(extent * 0.7071, hMax * 0.7);
  const dist = (radiusB / Math.sin(Math.min(vf, hf) / 2)) * 0.82;
  const el = THREE.MathUtils.degToRad(30);
  const az = THREE.MathUtils.degToRad(35);
  const target = [0, hMax * 0.3, 0];

  return {
    dist,
    target,
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

/* ---------- Dark tiled floor with glowing seams ---------- */

const floorVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const floorFragment = /* glsl */ `
  uniform vec3 uBase;
  uniform vec3 uLine;
  uniform vec3 uGlow;
  uniform vec3 uFar;
  uniform float uTile;
  uniform float uRadius;
  uniform float uGlowR;
  varying vec3 vWorld;

  float h21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

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

    vec3 col = uBase * (0.8 + tileRand * 0.7);
    col += uLine * (seam + bevel * 0.22) * detail * fade;
    col += uLine * 0.05 * (1.0 - detail) * fade;
    col += uGlow * exp(-(d * d) / (uGlowR * uGlowR));
    col = mix(uFar, col, fade * 0.9 + 0.1);

    gl_FragColor = vec4(col, 1.0);
  }
`;

function FloorGrid({ radius, glowR }) {
  const uniforms = useMemo(
    () => ({
      uBase: { value: new THREE.Color('#071233') },
      uLine: { value: neon('#2ec4ff', 0.85) },
      uGlow: { value: neon('#0b5fff', 0.2) },
      uFar: { value: new THREE.Color(BG) },
      uTile: { value: 5 },
      uRadius: { value: radius },
      uGlowR: { value: glowR },
    }),
    [radius, glowR]
  );

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.01, 0]}
      renderOrder={-3}
      raycast={() => null}
    >
      <planeGeometry args={[3000, 3000]} />
      <shaderMaterial
        transparent
        depthWrite={false}
        uniforms={uniforms}
        vertexShader={floorVertex}
        fragmentShader={floorFragment}
      />
    </mesh>
  );
}

/* ---------- Solid-toned facade with neon window & trim accents ---------- */

const holoVertex = /* glsl */ `
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

const holoFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uBoost;
  uniform float uTime;
  uniform float uSeed;
  uniform float uReflect;
  varying vec3 vPos;
  varying vec3 vNormalW;
  varying vec3 vNormalV;
  varying vec3 vViewPos;

  const vec2 CELL = vec2(0.75, 1.0); // window width, floor height

  float h21(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

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

    // Directional shading so faces keep a solid 3D body
    float faceShade = alongX ? (n.x > 0.0 ? 0.94 : 0.74) : (n.z > 0.0 ? 1.0 : 0.8);
    if (roof > 0.5) faceShade = 0.86;

    // Window grid + neon accent windows
    vec2 q = uv / CELL;
    vec2 id = floor(q);
    vec2 f = fract(q);
    float rnd = h21(id + face * 17.0 + uSeed * 53.0);
    float pane = step(0.14, f.x) * step(f.x, 0.86) * step(0.2, f.y) * step(f.y, 0.8);
    float lit = smoothstep(0.3, 0.9, rnd);
    float tw = 0.86 + 0.14 * sin(uTime * 2.2 + rnd * 40.0);
    float windows = pane * (0.12 + lit * 0.85) * tw;

    // Far away the cells are too small to draw: use their average brightness
    float aa = smoothstep(0.3, 0.7, max(fwidth(q.x), fwidth(q.y)));
    windows = mix(windows, 0.28, aa);

    // Neon mullions and horizontal bands
    float mull = gridLine(uv.x, CELL.x * 4.0) * 0.52;
    float band = gridLine(uv.y, CELL.y * 6.0) * 0.45;

    float fres = pow(1.0 - abs(dot(normalize(vNormalV), normalize(vViewPos))), 2.3);
    float scan = smoothstep(0.94, 1.0, sin(vPos.y * 0.45 - uTime * 1.35) * 0.5 + 0.5);

    // Solid base wall + neon cyan/accent highlights
    float neonSpark = step(0.93, rnd) * pane;
    vec3 solidWall = uColor * (0.44 * faceShade);
    vec3 neonTint = mix(uColor * 1.45, vec3(0.45, 0.95, 1.0), neonSpark * 0.75);
    float facade = windows * (1.0 - roof) + roof * 0.12;

    vec3 col =
      solidWall +
      neonTint * (facade * 0.82 + (mull + band) * (1.0 - roof) + fres * 0.42 + scan * 0.16);
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

/* ---------- Skyscraper shapes ---------- */

function pickType(H, r) {
  if (H < 14) return r < 0.65 ? 'lowrise' : 'cluster';
  return ['slab', 'setback', 'pyramid', 'deco', 'cluster', 'slab'][Math.floor(r * 6) % 6];
}

function finish(parts, masts) {
  let top = 0;
  parts.forEach((p) => {
    top = Math.max(top, p.k === 'pyr' ? p.y + p.h : p.y + p.sy / 2);
  });
  masts.forEach((m) => {
    top = Math.max(top, m.y + m.h);
  });
  return { parts, masts, top };
}

function buildShape(type, H, bw, bd) {
  const parts = [];
  const masts = [];
  const box = (sx, sy, sz, y0, x = 0, z = 0) =>
    parts.push({ k: 'box', sx, sy, sz, x, y: y0 + sy / 2, z });
  const pyr = (sx, sz, h, y0) => parts.push({ k: 'pyr', sx, sz, h, x: 0, y: y0, z: 0 });

  switch (type) {
    case 'slab': {
      // Tall glass tower with a rooftop unit and an antenna
      box(bw, H, bd, 0);
      box(bw * 0.4, 1.1, bd * 0.4, H);
      masts.push({ x: bw * 0.18, z: -bd * 0.12, y: H + 1.1, h: Math.max(2.5, H * 0.12) });
      break;
    }
    case 'setback': {
      // Three tiers that step in
      const h1 = H * 0.55;
      const h2 = H * 0.28;
      const h3 = H - h1 - h2;
      box(bw, h1, bd, 0);
      box(bw * 0.78, h2, bd * 0.78, h1);
      box(bw * 0.54, h3, bd * 0.54, h1 + h2);
      masts.push({ x: 0, z: 0, y: H, h: H * 0.14 });
      break;
    }
    case 'pyramid': {
      // Pointed crown with a spire, like the tower on the right of the reference
      const hb = H * 0.78;
      box(bw, hb, bd, 0);
      pyr(bw, bd, H - hb, hb);
      masts.push({ x: 0, z: 0, y: H, h: Math.max(3, H * 0.16) });
      break;
    }
    case 'deco': {
      // Stepped art-deco tower
      const a = H * 0.46;
      const b = H * 0.26;
      const c = H * 0.16;
      const d = H - a - b - c;
      box(bw, a, bd, 0);
      box(bw * 0.82, b, bd * 0.82, a);
      box(bw * 0.62, c, bd * 0.62, a + b);
      box(bw * 0.4, d, bd * 0.4, a + b + c);
      masts.push({ x: 0, z: 0, y: H, h: H * 0.12 });
      break;
    }
    case 'cluster': {
      // A main tower with a lower building attached to it
      box(bw * 0.62, H, bd * 0.7, 0, -bw * 0.16, 0);
      box(bw * 0.4, H * 0.58, bd * 0.62, 0, bw * 0.3, bd * 0.04);
      box(bw * 0.36, 1, bd * 0.4, H, -bw * 0.16, 0);
      masts.push({ x: -bw * 0.16, z: 0, y: H + 1, h: Math.max(2, H * 0.1) });
      break;
    }
    default: {
      // 'lowrise': wide low block with rooftop units
      const h = Math.max(4, H * 0.8);
      box(bw * 1.1, h, bd * 1.05, 0);
      box(bw * 0.35, 0.9, bd * 0.35, h, -bw * 0.2, 0);
      box(bw * 0.25, 0.7, bd * 0.3, h, bw * 0.25, bd * 0.1);
      break;
    }
  }
  return finish(parts, masts);
}

// A pyramid with a rectangular base (base on y = 0, tip at y = h)
function RectPyramid({ sx, sz, h }) {
  const geo = useDisposable(() => {
    const hx = sx / 2;
    const hz = sz / 2;
    const A = [-hx, 0, -hz];
    const B = [hx, 0, -hz];
    const C = [hx, 0, hz];
    const D = [-hx, 0, hz];
    const T = [0, h, 0];
    const g = new THREE.BufferGeometry();
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([...A, ...B, ...T, ...B, ...C, ...T, ...C, ...D, ...T, ...D, ...A, ...T], 3)
    );
    g.computeVertexNormals();
    return g;
  }, [sx, sz, h]);

  return <primitive object={geo} attach="geometry" />;
}

function PartMesh({ part, material, handlers, edgeColor }) {
  const rayProps = handlers || { raycast: () => null };
  return (
    <mesh position={[part.x, part.y, part.z]} material={material} {...rayProps}>
      {part.k === 'box' ? (
        <boxGeometry args={[part.sx, part.sy, part.sz]} />
      ) : (
        <RectPyramid sx={part.sx} sz={part.sz} h={part.h} />
      )}
      {edgeColor && <Edges threshold={15} color={edgeColor} />}
    </mesh>
  );
}

// Antenna with a blinking tip
function Mast({ m, color }) {
  const tip = useRef();
  useFrame(({ clock }) => {
    if (tip.current) {
      tip.current.scale.setScalar(1 + 0.35 * Math.sin(clock.elapsedTime * 3 + m.x * 3 + m.h));
    }
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

// Corner brackets around the base, plus a neon-tinted pad
function Footprint({ w, d, color }) {
  const geo = useDisposable(() => {
    const hx = w / 2 + 0.8;
    const hz = d / 2 + 0.8;
    const L = Math.min(hx, hz) * 0.7;
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
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.12}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

function Building({ node, x, z, w, d, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const H = getHeight(node.complexity);
  const hue = getHue(node.complexity);
  const seed = hash(node.id * 1.9);

  const shape = useMemo(
    () => buildShape(pickType(H, hash(node.id * 7.7)), H, w, d),
    [H, w, d, node.id]
  );

  // One material for the tower, a dimmer one for its reflection on the floor
  const mat = useMemo(() => makeHoloMaterial(x, z, seed, 0), [x, z, seed]);
  const refl = useMemo(() => makeHoloMaterial(x, z, seed, 1), [x, z, seed]);
  useEffect(
    () => () => {
      mat.dispose();
      refl.dispose();
    },
    [mat, refl]
  );

  const palette = useMemo(() => {
    const base = new THREE.Color(selected ? GOLD : hsl(hue));
    return {
      base,
      edge: base.clone().multiplyScalar(selected ? 2.2 : hovered ? 1.8 : 1.45),
      line: base.clone().multiplyScalar(selected ? 1.85 : hovered ? 1.55 : 1.25),
      mast: base.clone().multiplyScalar(1.65),
    };
  }, [hue, selected, hovered]);

  // Selected = gold, hover = brighter neon, default = solid body with neon trim
  useEffect(() => {
    const boost = selected ? 1.45 : hovered ? 1.25 : 1.02;
    mat.uniforms.uColor.value.copy(palette.base);
    mat.uniforms.uBoost.value = boost;
    refl.uniforms.uColor.value.copy(palette.base);
    refl.uniforms.uBoost.value = boost * 0.3;
  }, [mat, refl, palette, selected, hovered]);

  const handlers = {
    onClick: (e) => {
      e.stopPropagation();
      onSelect(node.id);
    },
    onPointerOver: (e) => {
      e.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
  };

  return (
    <group position={[x, 0, z]}>
      {/* The tower */}
      {shape.parts.map((p, i) => (
        <PartMesh key={i} part={p} material={mat} handlers={handlers} edgeColor={palette.edge} />
      ))}
      {shape.masts.map((m, i) => (
        <Mast key={i} m={m} color={palette.mast} />
      ))}
      <Footprint w={w} d={d} color={palette.line} />

      {/* Reflection on the glossy floor */}
      <group scale={[1, -1, 1]} renderOrder={-2}>
        {shape.parts.map((p, i) => (
          <PartMesh key={i} part={p} material={refl} />
        ))}
      </group>

      {/* File name: small label with a dark pill background */}
      {(SHOW_ALL_LABELS || hovered || selected) && (
        <Html
          position={[0, shape.top + 1.8, 0]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className={`whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-medium leading-none shadow-lg ${
              selected
                ? 'border-amber-300/70 bg-slate-950/90 text-amber-200'
                : 'border-cyan-400/30 bg-slate-950/80 text-cyan-100'
            }`}
          >
            {shortName(node.file_name)}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ---------- Thin energy road ---------- */

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

  // A bright pulse travels from the importing file to the imported file
  useFrame(({ clock }) => {
    const m = pulse.current;
    if (!m || info.total === 0) return;
    const dist = (clock.elapsedTime * 9 + index * 4.7) % (info.total + 10);
    if (dist > info.total) {
      m.visible = false;
      return;
    }
    m.visible = true;
    let s = info.segs[info.segs.length - 1];
    for (const seg of info.segs) {
      if (dist <= seg.start + seg.len) {
        s = seg;
        break;
      }
    }
    const t = (dist - s.start) / s.len;
    m.position.set(s.x1 + (s.x2 - s.x1) * t, 0.36, s.z1 + (s.z2 - s.z1) * t);
  });

  const k = active ? 1.4 : 1;
  const coreW = 0.55 * k;   // bright center line
  const shellW = 1.5 * k;   // solid colored band under it
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
            {/* Solid band */}
            <mesh position={[cx, 0.14, cz]} raycast={() => null}>
              <boxGeometry args={horizontal ? [s.len, 0.1, shellW] : [shellW, 0.1, s.len]} />
              <meshBasicMaterial color={shell} toneMapped={false} />
            </mesh>
            {/* Bright core line */}
            <mesh position={[cx, 0.22, cz]} raycast={() => null}>
              <boxGeometry args={horizontal ? [s.len, 0.14, coreW] : [coreW, 0.14, s.len]} />
              <meshBasicMaterial color={core} toneMapped={false} />
            </mesh>
          </group>
        );
      })}

      {/* Corner and end joints, so turns have no gaps */}
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

      {/* Moving pulse */}
      <mesh ref={pulse} raycast={() => null}>
        <sphereGeometry args={[0.45 * k, 16, 16]} />
        <meshBasicMaterial color={active ? ROAD_PULSE_ACTIVE : ROAD_PULSE} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------- The city ---------- */

export default function City3D({ nodes = [], edges = [], height = 500 }) {
  const wrapRef = useRef(null);
  const size = useSize(wrapRef);
  const [selectedId, setSelectedId] = useState(null);

  const nodeById = useMemo(() => {
    const map = new Map();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  const selected = selectedId != null ? nodeById.get(selectedId) || null : null;

  const layout = useMemo(() => buildLayout(nodes), [nodes]);

  const aspect =
    size.width > 0 && size.height > 0 ? Math.round((size.width / size.height) * 100) / 100 : 1.6;
  const cam = useMemo(
    () => computeCamera(layout.extent, layout.hMax, aspect),
    [layout.extent, layout.hMax, aspect]
  );

  const roads = useMemo(
    () =>
      edges
        .map((e) => {
          const A = layout.pos.get(e.source_node_id);
          const B = layout.pos.get(e.target_node_id);
          if (!A || !B) return null;
          return {
            id: e.id ?? `${e.source_node_id}-${e.target_node_id}`,
            source: e.source_node_id,
            target: e.target_node_id,
            points: routePath(A, B, layout.cols),
          };
        })
        .filter(Boolean),
    [edges, layout]
  );

  const { imports, importedBy } = useMemo(() => {
    if (!selected) return { imports: [], importedBy: [] };
    return {
      imports: edges
        .filter((e) => e.source_node_id === selected.id)
        .map((e) => nodeById.get(e.target_node_id))
        .filter(Boolean),
      importedBy: edges
        .filter((e) => e.target_node_id === selected.id)
        .map((e) => nodeById.get(e.source_node_id))
        .filter(Boolean),
    };
  }, [selected, edges, nodeById]);

  const E = layout.extent;

  return (
    <div>
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

          <FloorGrid radius={E * 1.8} glowR={E * 0.6} />

          <Sparkles
            count={70}
            scale={[E, layout.hMax, E]}
            position={[0, layout.hMax * 0.5, 0]}
            size={2.5}
            speed={0.25}
            opacity={0.6}
            color="#7dd3fc"
          />

          {/* Towers */}
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
                selected={selected?.id === node.id}
                onSelect={setSelectedId}
              />
            );
          })}

          {/* Roads */}
          {roads.map((road, i) => (
            <Road
              key={road.id}
              points={road.points}
              index={i}
              active={Boolean(
                selected && (road.source === selected.id || road.target === selected.id)
              )}
            />
          ))}

          <OrbitControls
            makeDefault
            minDistance={30}
            maxDistance={cam.dist * 1.8}
            maxPolarAngle={Math.PI / 2.08}
          />
          <CameraFit cam={cam} />

          {/* Glow + dark vignette */}
          <EffectComposer multisampling={4}>
            <Bloom
              mipmapBlur
              intensity={0.62}
              luminanceThreshold={0.62}
              luminanceSmoothing={0.35}
              radius={0.8}
            />
            <Vignette eskil={false} offset={0.3} darkness={0.9} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Details panel (outside the canvas) */}
      <div className="mt-3 min-h-[60px] rounded-lg border border-cyan-500/20 bg-slate-950/70 p-3 text-sm text-slate-300">
        {selected ? (
          <>
            <strong className="text-amber-300">{selected.file_name}</strong>
            <div className="break-all">Path: {selected.file_path}</div>
            <div>Complexity: {selected.complexity}</div>
            <div>
              Imports ({imports.length}): {imports.map((n) => n.file_name).join(', ') || 'none'}
            </div>
            <div>
              Imported by ({importedBy.length}):{' '}
              {importedBy.map((n) => n.file_name).join(', ') || 'none'}
            </div>
          </>
        ) : (
          <span>Click a building to see its details.</span>
        )}
      </div>
    </div>
  );
}