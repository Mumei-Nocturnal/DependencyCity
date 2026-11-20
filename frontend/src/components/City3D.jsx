import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Html, Sparkles, useCursor } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';

/* ---------- Settings ---------- */

const SPREAD = 1.5;                  // spacing multiplier (1.5 = 50% more space between buildings)
const BASE_CELL = 8;
const CELL = BASE_CELL * SPREAD;     // distance between building centers
const SHOW_ALL_LABELS = true;        // false = file name only on hover or selection

/* ---------- Helpers ---------- */

const getHeight = (complexity) => Math.min(5 + Math.sqrt(complexity) * 3.2, 44);

// Complexity -> hue: low = blue-violet, high = magenta-pink
const getHue = (complexity) => 235 + Math.min(complexity / 30, 1) * 65;

// Stable pseudo-random number (0 to 1) from a node id, so shapes never change
const hash = (n) => {
  const x = Math.sin((Number(n) || 0) * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
const getWidth = (id) => 3.4 + hash(id * 3.1) * 1.6;

const shortName = (s = '') => (s.length > 20 ? `${s.slice(0, 19)}…` : s);

// Multiplying a color above 1.0 makes it extra bright, so Bloom makes it glow
const neon = (hex, power) => new THREE.Color(hex).multiplyScalar(power);

// Thin, soft roads (dimmer than the buildings). Roads of the selected building turn gold.
const ROAD_CORE = neon('#e9a8ff', 0.75);
const ROAD_SHELL = neon('#c084fc', 1);
const ROAD_PULSE = neon('#f5d0fe', 1);
const ROAD_CORE_ACTIVE = neon('#ffd75e', 1);
const ROAD_SHELL_ACTIVE = neon('#ffc933', 1);
const ROAD_PULSE_ACTIVE = neon('#fff1b8', 1.2);

/* ---------- Layout: snap buildings onto a spaced-out grid ---------- */

function buildLayout(nodes) {
  const pos = new Map();
  if (nodes.length === 0) {
    return { pos, cols: 3, extent: 2 * CELL + 9, hMax: 20 };
  }

  const cols = Math.max(3, Math.ceil(Math.sqrt(nodes.length * 1.5)));
  const rows = cols;

  const xs = nodes.map((n) => Number(n.position_x));
  const zs = nodes.map((n) => Number(n.position_y));
  const minX = Math.min(...xs);
  const minZ = Math.min(...zs);
  const spanX = Math.max(...xs) - minX || 1;
  const spanZ = Math.max(...zs) - minZ || 1;

  const taken = new Set();
  let hMax = 0;

  nodes.forEach((node, i) => {
    // Where this node wants to be on the grid (from its saved position)
    const gx = ((xs[i] - minX) / spanX) * (cols - 1);
    const gz = ((zs[i] - minZ) / spanZ) * (rows - 1);

    // Nearest free cell
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

    pos.set(node.id, {
      x: (best.c - (cols - 1) / 2) * CELL,
      z: (best.r - (rows - 1) / 2) * CELL,
      c: best.c,
      r: best.r,
      w: getWidth(node.id),
    });
    hMax = Math.max(hMax, getHeight(node.complexity) + 8);
  });

  return { pos, cols, extent: (cols - 1) * CELL + 9, hMax };
}

/* ---------- Roads follow the gaps between blocks ---------- */

function routePath(A, B, cols) {
  const line = (i) => (i - cols / 2) * CELL;

  // Neighbours in the same column: connect the facing walls directly
  if (A.c === B.c && Math.abs(A.r - B.r) === 1) {
    const dir = Math.sign(B.z - A.z);
    return [
      [A.x, A.z + dir * (A.w / 2)],
      [B.x, B.z - dir * (B.w / 2)],
    ];
  }

  const rowA = B.r > A.r ? A.r + 1 : B.r < A.r ? A.r : A.r + 1;
  const rowB = A.r > B.r ? B.r + 1 : A.r < B.r ? B.r : B.r + 1;
  const colS = B.c > A.c ? A.c + 1 : B.c < A.c ? A.c : A.c + 1;
  const zsA = line(rowA);
  const zsB = line(rowB);
  const xs = line(colS);

  const pts = [
    [A.x, A.z + Math.sign(zsA - A.z) * (A.w / 2)],
    [A.x, zsA],
    [xs, zsA],
    [xs, zsB],
    [B.x, zsB],
    [B.x, B.z + Math.sign(zsB - B.z) * (B.w / 2)],
  ];
  return pts.filter(
    (p, i) => i === 0 || Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) > 1e-4
  );
}

/* ---------- Building shapes ---------- */

function pickType(H, r) {
  if (H < 12) return r < 0.5 ? 'block' : 'stack';
  return ['tiered', 'pyramid', 'cylinder', 'stack', 'tiered'][Math.floor(r * 5) % 5];
}

function evenBands(mainH, mainW, kind) {
  const count = Math.min(4, Math.floor(mainH / 6));
  return Array.from({ length: count }, (_, i) => ({
    y: (mainH * (i + 1)) / (count + 1),
    w: mainW,
    kind,
  }));
}

function buildParts(type, H, w) {
  switch (type) {
    case 'tiered': {
      const h1 = H * 0.55;
      const h2 = H * 0.27;
      const h3 = H - h1 - h2;
      return {
        parts: [
          { kind: 'box', w, h: h1, y: h1 / 2 },
          { kind: 'box', w: w * 0.72, h: h2, y: h1 + h2 / 2 },
          { kind: 'box', w: w * 0.46, h: h3, y: h1 + h2 + h3 / 2 },
        ],
        bands: evenBands(h1, w, 'box'),
        topW: w * 0.46,
        topKind: 'box',
        topY: H,
      };
    }
    case 'pyramid': {
      const hb = H * 0.82;
      const hc = H - hb;
      return {
        parts: [
          { kind: 'box', w, h: hb, y: hb / 2 },
          { kind: 'cone', w, h: hc, y: hb + hc / 2 },
        ],
        bands: evenBands(hb, w, 'box'),
        topW: 0,
        topKind: 'box',
        topY: H,
      };
    }
    case 'cylinder': {
      const h1 = H * 0.74;
      const h2 = H - h1;
      return {
        parts: [
          { kind: 'cyl', w, h: h1, y: h1 / 2 },
          { kind: 'cyl', w: w * 0.6, h: h2, y: h1 + h2 / 2 },
        ],
        bands: evenBands(h1, w, 'cyl'),
        topW: w * 0.6,
        topKind: 'cyl',
        topY: H,
      };
    }
    case 'stack': {
      const h = H / 3;
      return {
        parts: [
          { kind: 'box', w, h, y: h / 2 },
          { kind: 'box', w: w * 0.86, h, y: h * 1.5 },
          { kind: 'box', w: w * 0.72, h, y: h * 2.5 },
        ],
        bands: [
          { y: h, w, kind: 'box' },
          { y: h * 2, w: w * 0.86, kind: 'box' },
        ],
        topW: w * 0.72,
        topKind: 'box',
        topY: H,
      };
    }
    default: {
      // 'block': wide building with a small rooftop box
      const roofH = Math.max(0.8, H * 0.1);
      return {
        parts: [
          { kind: 'box', w: w * 1.15, h: H, y: H / 2 },
          { kind: 'box', w: w * 0.45, h: roofH, y: H + roofH / 2 },
        ],
        bands: evenBands(H, w * 1.15, 'box'),
        topW: w * 0.45,
        topKind: 'box',
        topY: H + roofH,
      };
    }
  }
}

/* ---------- Smooth building parts ---------- */

// One dark-glass piece of a building: rounded corners + a holographic outline
function Part({ part, body, glow, emissiveIntensity, opacity, edge, handlers }) {
  const { kind, w, h, y } = part;
  const bevel = Math.min(0.28, h / 3, w / 4);

  // Thin outline made from the sharp shape, so the frame stays crisp
  const outline = useMemo(() => {
    let g;
    if (kind === 'cyl') g = new THREE.CylinderGeometry(w / 2, w / 2, h, 32);
    else if (kind === 'cone') g = new THREE.ConeGeometry(w * 0.7071, h, 4);
    else g = new THREE.BoxGeometry(w, h, w);
    const e = new THREE.EdgesGeometry(g, kind === 'cyl' ? 40 : 15);
    g.dispose();
    return e;
  }, [kind, w, h]);
  useEffect(() => () => outline.dispose(), [outline]);

  const material = (
    <meshPhysicalMaterial
      color={body}
      emissive={glow}
      emissiveIntensity={emissiveIntensity}
      metalness={0.1}
      roughness={0.12}
      clearcoat={1}
      clearcoatRoughness={0.05}
      transparent
      opacity={opacity}
      depthWrite={false}
    />
  );

  const outlineLines = (
    <lineSegments geometry={outline} raycast={() => null}>
      <lineBasicMaterial color={edge} transparent opacity={0.9} toneMapped={false} />
    </lineSegments>
  );

  if (kind === 'box') {
    return (
      <RoundedBox
        args={[w, h, w]}
        radius={bevel}
        smoothness={4}
        position={[0, y, 0]}
        {...handlers}
      >
        {material}
        {outlineLines}
      </RoundedBox>
    );
  }

  return (
    <mesh
      position={[0, y, 0]}
      rotation={kind === 'cone' ? [0, Math.PI / 4, 0] : [0, 0, 0]}
      {...handlers}
    >
      {kind === 'cyl' ? (
        <cylinderGeometry args={[w / 2, w / 2, h, 32]} />
      ) : (
        <coneGeometry args={[w * 0.7071, h, 4]} />
      )}
      {material}
      {outlineLines}
    </mesh>
  );
}

// A flat square with rounded corners (used for glowing strips and roof slabs)
function roundedSquareShape(w, r) {
  const h = w / 2;
  const s = new THREE.Shape();
  s.moveTo(-h + r, -h);
  s.lineTo(h - r, -h);
  s.quadraticCurveTo(h, -h, h, -h + r);
  s.lineTo(h, h - r);
  s.quadraticCurveTo(h, h, h - r, h);
  s.lineTo(-h + r, h);
  s.quadraticCurveTo(-h, h, -h, h - r);
  s.lineTo(-h, -h + r);
  s.quadraticCurveTo(-h, -h, -h + r, -h);
  return s;
}

function Band({ kind, w, h, y, bevel, color, opacity = 1 }) {
  const geo = useMemo(() => {
    if (kind === 'cyl') return new THREE.CylinderGeometry(w / 2, w / 2, h, 32);
    const g = new THREE.ExtrudeGeometry(
      roundedSquareShape(w, Math.min(bevel, w / 2 - 0.01)),
      { depth: h, bevelEnabled: false, curveSegments: 6 }
    );
    g.translate(0, 0, -h / 2);
    g.rotateX(-Math.PI / 2);
    return g;
  }, [kind, w, h, bevel]);
  useEffect(() => () => geo.dispose(), [geo]);

  return (
    <mesh geometry={geo} position={[0, y, 0]} raycast={() => null}>
      <meshBasicMaterial
        color={color}
        transparent={opacity < 1}
        opacity={opacity}
        toneMapped={false}
      />
    </mesh>
  );
}

// Blinking light on top of an antenna
function AntennaTip({ y, color, phase }) {
  const ref = useRef();
  useFrame(({ clock }) => {
    if (ref.current) {
      ref.current.scale.setScalar(1 + 0.3 * Math.sin(clock.elapsedTime * 3 + phase));
    }
  });
  return (
    <mesh ref={ref} position={[0, y, 0]} raycast={() => null}>
      <sphereGeometry args={[0.3, 16, 16]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

function Building({ node, x, z, w, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const H = getHeight(node.complexity);
  const hue = getHue(node.complexity);

  const shape = useMemo(
    () => buildParts(pickType(H, hash(node.id * 7.7)), H, w),
    [H, w, node.id]
  );

  const hasSlab = shape.topW > 0;
  const slabH = 0.2;
  const antennaH = Math.min(2 + H * 0.08, 5.5);
  const antennaBase = shape.topY + (hasSlab ? slabH : 0);

  const colors = useMemo(() => {
    // Selected building: bright glowing gold
    if (selected) {
      return {
        body: new THREE.Color('#ffb703'),
        glow: new THREE.Color('#ffc933'),
        edge: new THREE.Color('#fff1a8').multiplyScalar(2.4),
        accent: new THREE.Color('#ffe066').multiplyScalar(2.2),
        tip: new THREE.Color('#fff6c8').multiplyScalar(2.4),
      };
    }
    const edgePower = hovered ? 1.8 : 1.25;
    return {
      body: new THREE.Color(`hsl(${hue}, 70%, ${hovered ? 46 : 38}%)`),
      glow: new THREE.Color(`hsl(${hue}, 90%, 60%)`),
      edge: new THREE.Color(`hsl(${hue}, 100%, 85%)`).multiplyScalar(edgePower),
      accent: new THREE.Color(`hsl(${hue}, 100%, 78%)`).multiplyScalar(1.2),
      tip: new THREE.Color(`hsl(${hue}, 100%, 85%)`).multiplyScalar(1.8),
    };
  }, [hue, hovered, selected]);

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

  const partProps = {
    body: colors.body,
    glow: colors.glow,
    emissiveIntensity: selected ? 1.6 : hovered ? 0.8 : 0.35,
    opacity: selected ? 0.92 : hovered ? 0.7 : 0.55,
    edge: colors.edge,
    handlers,
  };

  return (
    <group position={[x, 0, z]}>
      {shape.parts.map((part, i) => (
        <Part key={i} part={part} {...partProps} />
      ))}

      {/* Glowing window strips */}
      {shape.bands.map((b, i) => (
        <Band
          key={i}
          kind={b.kind}
          w={b.w + 0.05}
          h={0.14}
          y={b.y}
          bevel={0.3}
          color={colors.accent}
          opacity={0.8}
        />
      ))}

      {/* Glowing roof slab */}
      {hasSlab && (
        <Band
          kind={shape.topKind}
          w={shape.topW + 0.2}
          h={slabH}
          y={shape.topY + slabH / 2}
          bevel={0.3}
          color={colors.accent}
        />
      )}

      {/* Antenna with a blinking tip */}
      <mesh position={[0, antennaBase + antennaH / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.05, 0.1, antennaH, 8]} />
        <meshBasicMaterial color={colors.accent} toneMapped={false} />
      </mesh>
      <AntennaTip y={antennaBase + antennaH} color={colors.tip} phase={Number(node.id) * 1.7 || 0} />

      {/* File name: small label with a dark pill background, fixed size on screen */}
      {(SHOW_ALL_LABELS || hovered || selected) && (
        <Html
          position={[0, antennaBase + antennaH + 1.5, 0]}
          center
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div
            className={`whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-medium leading-none shadow-lg ${
              selected
                ? 'border-amber-300/70 bg-slate-950/90 text-amber-200'
                : 'border-white/10 bg-slate-950/80 text-slate-200'
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

  // A small pulse travels from the importing file to the imported file
  useFrame(({ clock }) => {
    const m = pulse.current;
    if (!m || info.total === 0) return;
    const d = (clock.elapsedTime * 9 + index * 4.7) % (info.total + 10);
    if (d > info.total) {
      m.visible = false;
      return;
    }
    m.visible = true;
    let s = info.segs[info.segs.length - 1];
    for (const seg of info.segs) {
      if (d <= seg.start + seg.len) {
        s = seg;
        break;
      }
    }
    const t = (d - s.start) / s.len;
    m.position.set(s.x1 + (s.x2 - s.x1) * t, 0.3, s.z1 + (s.z2 - s.z1) * t);
  });

  const k = active ? 1.5 : 1;
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
            <mesh position={[cx, 0.08, cz]} raycast={() => null}>
              <boxGeometry args={horizontal ? [s.len, 0.05, 0.8 * k] : [0.8 * k, 0.05, s.len]} />
              <meshBasicMaterial color={shell} transparent opacity={active ? 0.12 : 0.07} depthWrite={false} />
            </mesh>
            <mesh position={[cx, 0.15, cz]} raycast={() => null}>
              <boxGeometry args={horizontal ? [s.len, 0.08, 0.16 * k] : [0.16 * k, 0.08, s.len]} />
              <meshBasicMaterial color={core} toneMapped={false} />
            </mesh>
          </group>
        );
      })}

      {/* Corner joints */}
      {points.map(([x, z], i) => (
        <mesh key={i} position={[x, 0.15, z]} raycast={() => null}>
          <boxGeometry args={[0.16 * k, 0.08, 0.16 * k]} />
          <meshBasicMaterial color={core} toneMapped={false} />
        </mesh>
      ))}

      <mesh ref={pulse} raycast={() => null}>
        <sphereGeometry args={[0.17 * k, 12, 12]} />
        <meshBasicMaterial color={active ? ROAD_PULSE_ACTIVE : ROAD_PULSE} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------- Faint circular grid (the city floats in space) ---------- */

const gridVertex = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const gridFragment = /* glsl */ `
  uniform vec3 uColor;
  uniform float uCell;
  uniform float uRadius;
  uniform float uOpacity;
  varying vec3 vWorld;

  float lines(vec2 p, float size) {
    vec2 q = p / size;
    vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
    return 1.0 - min(min(g.x, g.y), 1.0);
  }

  void main() {
    float d = length(vWorld.xz);
    float fade = 1.0 - smoothstep(uRadius * 0.3, uRadius, d);
    float minor = lines(vWorld.xz, uCell);
    float major = lines(vWorld.xz, uCell * 6.0);
    float a = max(minor * 0.3, major * 0.65) * fade * uOpacity;
    gl_FragColor = vec4(uColor, a);
  }
`;

function FloatingGrid({ radius }) {
  const uniforms = useMemo(
    () => ({
      uColor: { value: new THREE.Color('#8b7cf6') },
      uCell: { value: 6 },
      uRadius: { value: radius },
      uOpacity: { value: 0.5 },
    }),
    [radius]
  );

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} raycast={() => null}>
        <planeGeometry args={[radius * 2.2, radius * 2.2]} />
        <shaderMaterial
          transparent
          depthWrite={false}
          side={THREE.DoubleSide}
          uniforms={uniforms}
          vertexShader={gridVertex}
          fragmentShader={gridFragment}
        />
      </mesh>

      {/* Very soft glow under the city */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} raycast={() => null}>
        <circleGeometry args={[radius * 0.7, 64]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.07} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ---------- Isometric camera that fits the city ---------- */

function CameraFit({ extent, hMax }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls);
  const viewport = useThree((s) => s.size);

  useEffect(() => {
    const d = extent * 1.2 + 60;
    camera.position.set(d, d, d); // true isometric angle

    const zoom = Math.min(
      viewport.width / (extent * 1.45),
      viewport.height / (extent * 0.82 + hMax * 0.82 + 12)
    );
    camera.zoom = zoom;
    camera.updateProjectionMatrix();

    const target = new THREE.Vector3(0, hMax * 0.3, 0);
    if (controls) {
      controls.target.copy(target);
      controls.minZoom = zoom * 0.5;
      controls.maxZoom = zoom * 6;
      controls.update();
    } else {
      camera.lookAt(target);
    }
  }, [extent, hMax, viewport.width, viewport.height, camera, controls]);

  return null;
}

/* ---------- The city ---------- */

export default function City3D({ nodes = [], edges = [], height = 500 }) {
  const [selectedId, setSelectedId] = useState(null);

  const nodeById = useMemo(() => {
    const map = new Map();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  const selected = selectedId != null ? nodeById.get(selectedId) || null : null;

  const layout = useMemo(() => buildLayout(nodes), [nodes]);

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
        style={{ width: '100%', height }}
        className="overflow-hidden rounded-xl border border-violet-500/20 shadow-[0_0_40px_-12px_rgba(168,85,247,0.6)]"
      >
        <Canvas
          orthographic
          camera={{ position: [100, 100, 100], zoom: 8, near: 0.1, far: 5000 }}
          dpr={[1, 2]}
          gl={{ antialias: false }}
          onPointerMissed={() => setSelectedId(null)}
        >
          <color attach="background" args={['#080b22']} />

          {/* Lighting */}
          <ambientLight intensity={0.55} color="#8b7cf6" />
          <directionalLight position={[60, 90, 40]} intensity={1.1} color="#e9d5ff" />
          <pointLight position={[0, layout.hMax * 0.7, 0]} color="#a855f7" intensity={3500} distance={250} decay={2} />
          <pointLight position={[-E / 2, 10, E / 2]} color="#67e8f9" intensity={1200} distance={140} decay={2} />
          <pointLight position={[E / 2, 10, -E / 2]} color="#f472b6" intensity={1200} distance={140} decay={2} />

          {/* Faint circular grid, no base board */}
          <FloatingGrid radius={E * 0.85} />

          {/* Floating light particles */}
          <Sparkles
            count={60}
            scale={[E * 1.3, 30, E * 1.3]}
            position={[0, 12, 0]}
            size={3}
            speed={0.25}
            opacity={0.5}
            color="#c4b5fd"
          />

          {/* Buildings */}
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

          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
          <CameraFit extent={E} hMax={layout.hMax} />

          {/* Subtle glow + vignette */}
          <EffectComposer multisampling={4}>
            <Bloom
              mipmapBlur
              intensity={0.45}
              luminanceThreshold={0.75}
              luminanceSmoothing={0.2}
              radius={0.7}
            />
            <Vignette eskil={false} offset={0.25} darkness={0.85} />
          </EffectComposer>
        </Canvas>
      </div>

      {/* Details panel (outside the canvas) */}
      <div className="mt-3 min-h-[60px] rounded-lg border border-violet-500/20 bg-slate-950/70 p-3 text-sm text-slate-300">
        {selected ? (
          <>
            <strong className="text-amber-300">{selected.file_name}</strong>
            <div>Path: {selected.file_path}</div>
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