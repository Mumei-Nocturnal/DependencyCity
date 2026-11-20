import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Html, Edges, Sparkles, useCursor } from '@react-three/drei';
import { EffectComposer, Bloom } from '@react-three/postprocessing';

/* ---------- Fake city data (edit freely) ---------- */

const NODES = [
  { id: 1, name: 'App.jsx', x: 0, z: 0, h: 11, w: 3.4, hue: 285 },
  { id: 2, name: 'Navbar.jsx', x: -7, z: -4, h: 6, w: 3, hue: 245 },
  { id: 3, name: 'Dashboard.jsx', x: 7, z: -3, h: 14, w: 3.4, hue: 300 },
  { id: 4, name: 'api.js', x: -6, z: 5, h: 4.5, w: 2.8, hue: 225 },
  { id: 5, name: 'City3D.jsx', x: 8, z: 6, h: 18, w: 3.6, hue: 310 },
  { id: 6, name: 'Login.jsx', x: 0, z: -9, h: 7, w: 3, hue: 255 },
  { id: 7, name: 'server.js', x: -13, z: 0, h: 9, w: 3.2, hue: 270 },
  { id: 8, name: 'db.js', x: -13, z: 8, h: 5, w: 2.8, hue: 235 },
  { id: 9, name: 'utils.js', x: 0, z: 8, h: 3.5, w: 2.6, hue: 225 },
];

// [importer, imported]
const EDGES = [
  [1, 2], [1, 3], [1, 6], [3, 4], [3, 5], [5, 9], [7, 1], [7, 8],
];

const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));

const neon = (hex, power) => new THREE.Color(hex).multiplyScalar(power);
const ROAD = neon('#e9a8ff', 0.8);
const ROAD_SHELL = neon('#c084fc', 1);
const PULSE = neon('#f5d0fe', 1.1);

/* ---------- Building ---------- */

function Building({ node, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const { h, w, hue } = node;

  const c = useMemo(() => {
    if (selected) {
      return {
        body: new THREE.Color('#ffb703'),
        glow: new THREE.Color('#ffc933'),
        edge: new THREE.Color('#fff1a8').multiplyScalar(2.2),
        accent: new THREE.Color('#ffe066').multiplyScalar(2),
      };
    }
    return {
      body: new THREE.Color(`hsl(${hue}, 70%, ${hovered ? 46 : 38}%)`),
      glow: new THREE.Color(`hsl(${hue}, 90%, 60%)`),
      edge: new THREE.Color(`hsl(${hue}, 100%, 85%)`).multiplyScalar(hovered ? 1.8 : 1.25),
      accent: new THREE.Color(`hsl(${hue}, 100%, 78%)`).multiplyScalar(1.2),
    };
  }, [hue, hovered, selected]);

  const tip = useRef();
  useFrame(({ clock }) => {
    if (tip.current) {
      tip.current.scale.setScalar(1 + 0.3 * Math.sin(clock.elapsedTime * 3 + node.id * 1.7));
    }
  });

  const antennaH = Math.min(1.8 + h * 0.08, 4);

  return (
    <group position={[node.x, 0, node.z]}>
      {/* Glass body with neon outline */}
      <mesh
        position={[0, h / 2, 0]}
        onClick={(e) => {
          e.stopPropagation();
          onSelect(node.id);
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
        }}
        onPointerOut={() => setHovered(false)}
      >
        <boxGeometry args={[w, h, w]} />
        <meshPhysicalMaterial
          color={c.body}
          emissive={c.glow}
          emissiveIntensity={selected ? 1.5 : hovered ? 0.8 : 0.35}
          roughness={0.12}
          metalness={0.1}
          clearcoat={1}
          transparent
          opacity={selected ? 0.92 : hovered ? 0.7 : 0.55}
          depthWrite={false}
        />
        <Edges threshold={15} color={c.edge} />
      </mesh>

      {/* Glowing roof */}
      <mesh position={[0, h + 0.1, 0]} raycast={() => null}>
        <boxGeometry args={[w + 0.2, 0.2, w + 0.2]} />
        <meshBasicMaterial color={c.accent} toneMapped={false} />
      </mesh>

      {/* Antenna */}
      <mesh position={[0, h + 0.2 + antennaH / 2, 0]} raycast={() => null}>
        <cylinderGeometry args={[0.05, 0.09, antennaH, 8]} />
        <meshBasicMaterial color={c.accent} toneMapped={false} />
      </mesh>
      <mesh ref={tip} position={[0, h + 0.2 + antennaH, 0]} raycast={() => null}>
        <sphereGeometry args={[0.28, 16, 16]} />
        <meshBasicMaterial color={c.edge} toneMapped={false} />
      </mesh>

      {/* Name pill on hover or selection */}
      {(hovered || selected) && (
        <Html position={[0, h + antennaH + 1.6, 0]} center style={{ pointerEvents: 'none' }}>
          <div
            className={`whitespace-nowrap rounded-full border px-2 py-1 text-[10px] font-medium leading-none shadow-lg ${
              selected
                ? 'border-amber-300/70 bg-slate-950/90 text-amber-200'
                : 'border-white/10 bg-slate-950/85 text-slate-200'
            }`}
          >
            {node.name}
          </div>
        </Html>
      )}
    </group>
  );
}

/* ---------- Road with a travelling pulse ---------- */

function Road({ a, b, index }) {
  const pulse = useRef();
  const { len, mid, angle, dx, dz } = useMemo(() => {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    return {
      dx,
      dz,
      len: Math.hypot(dx, dz),
      mid: [(a.x + b.x) / 2, 0.12, (a.z + b.z) / 2],
      angle: -Math.atan2(dz, dx),
    };
  }, [a, b]);

  useFrame(({ clock }) => {
    if (!pulse.current) return;
    const t = (clock.elapsedTime * 0.25 + index * 0.21) % 1;
    pulse.current.position.set(a.x + dx * t, 0.25, a.z + dz * t);
  });

  return (
    <group>
      <mesh position={mid} rotation={[0, angle, 0]} raycast={() => null}>
        <boxGeometry args={[len, 0.06, 0.14]} />
        <meshBasicMaterial color={ROAD} toneMapped={false} />
      </mesh>
      <mesh position={mid} rotation={[0, angle, 0]} raycast={() => null}>
        <boxGeometry args={[len, 0.04, 0.7]} />
        <meshBasicMaterial color={ROAD_SHELL} transparent opacity={0.08} depthWrite={false} />
      </mesh>
      <mesh ref={pulse} raycast={() => null}>
        <sphereGeometry args={[0.18, 12, 12]} />
        <meshBasicMaterial color={PULSE} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ---------- Scene ---------- */

export default function CityPreview() {
  const [selectedId, setSelectedId] = useState(null);

  return (
    <Canvas
      camera={{ position: [34, 28, 34], fov: 36 }}
      dpr={[1, 2]}
      gl={{ antialias: false }}
      onPointerMissed={() => setSelectedId(null)}
    >
      <color attach="background" args={['#070a1f']} />

      <ambientLight intensity={0.55} color="#8b7cf6" />
      <directionalLight position={[30, 50, 20]} intensity={1.1} color="#e9d5ff" />
      <pointLight position={[0, 14, 0]} color="#a855f7" intensity={1800} distance={120} decay={2} />
      <pointLight position={[-18, 8, 18]} color="#67e8f9" intensity={700} distance={80} decay={2} />
      <pointLight position={[18, 8, -18]} color="#f472b6" intensity={700} distance={80} decay={2} />

      {/* Radar-style rings on the ground */}
      {[8, 15, 22].map((r) => (
        <mesh key={r} rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]} raycast={() => null}>
          <ringGeometry args={[r, r + 0.08, 96]} />
          <meshBasicMaterial color="#8b7cf6" transparent opacity={0.3 - r * 0.008} depthWrite={false} />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} raycast={() => null}>
        <circleGeometry args={[22, 64]} />
        <meshBasicMaterial color="#7c3aed" transparent opacity={0.07} depthWrite={false} />
      </mesh>

      <Sparkles count={50} scale={[34, 20, 34]} position={[0, 9, 0]} size={3} speed={0.25} opacity={0.5} color="#c4b5fd" />

      {NODES.map((n) => (
        <Building key={n.id} node={n} selected={selectedId === n.id} onSelect={setSelectedId} />
      ))}

      {EDGES.map(([from, to], i) => (
        <Road key={`${from}-${to}`} a={byId[from]} b={byId[to]} index={i} />
      ))}

      <OrbitControls
        target={[0, 5, 0]}
        autoRotate
        autoRotateSpeed={0.9}
        enableZoom={false}
        enablePan={false}
        minPolarAngle={Math.PI / 5}
        maxPolarAngle={Math.PI / 2.2}
      />

      <EffectComposer multisampling={4}>
        <Bloom mipmapBlur intensity={0.45} luminanceThreshold={0.75} luminanceSmoothing={0.2} radius={0.7} />
      </EffectComposer>
    </Canvas>
  );
}