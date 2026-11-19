import { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Line, Text, Billboard, useCursor } from '@react-three/drei';

// Complexity -> building height
const getHeight = (complexity) => Math.min(2 + Math.sqrt(complexity) * 2, 40);

// Complexity -> color (low = blue, high = purple). Higher lightness = brighter.
const getColor = (complexity, lightness = 58) => {
  const t = Math.min(complexity / 30, 1);
  return `hsl(${230 + t * 55}, 85%, ${lightness}%)`;
};

function Building({ node, selected, onSelect }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered); // pointer cursor while hovering a building

  const height = getHeight(node.complexity);
  const lightness = selected ? 80 : hovered ? 72 : 58;
  const color = getColor(node.complexity, lightness);

  return (
    <group position={[Number(node.position_x), 0, Number(node.position_y)]}>
      <mesh
        position={[0, height / 2, 0]}
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
        <boxGeometry args={[4, height, 4]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={selected ? 0.9 : hovered ? 0.7 : 0.35}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>

      {/* File name label above the building, always facing the camera */}
      <Billboard position={[0, height + 2, 0]}>
        <Text
          fontSize={1.6}
          maxWidth={16}
          textAlign="center"
          anchorX="center"
          anchorY="bottom"
          color="#ffffff"
          outlineWidth={0.08}
          outlineColor="#000000"
          raycast={() => null} // labels should not block mouse events
        >
          {node.file_name}
        </Text>
      </Billboard>
    </group>
  );
}

export default function City3D({ nodes = [], edges = [], height = 500 }) {
  const [selectedId, setSelectedId] = useState(null);

  const nodeById = useMemo(() => {
    const map = new Map();
    nodes.forEach((n) => map.set(n.id, n));
    return map;
  }, [nodes]);

  // If a new repo is analyzed, the old selection is no longer found -> null
  const selected = selectedId != null ? nodeById.get(selectedId) || null : null;

  // Files the selected file imports, and files that import it
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

  return (
    <div>
      {/* (Canvas Div) */}
      <div style={{ width: '100%', height }} className="overflow-hidden rounded-xl">
        <Canvas
          camera={{ position: [70, 55, 70], fov: 50 }}
          onPointerMissed={() => setSelectedId(null)} // click empty space = deselect
        >
          <color attach="background" args={['#0b0b1a']} />

          <ambientLight intensity={0.5} />
          <directionalLight position={[40, 70, 30]} intensity={1.2} />

          <gridHelper args={[120, 24, '#3b3b6b', '#22224a']} />

          {nodes.map((node) => (
            <Building
              key={node.id}
              node={node}
              selected={selected?.id === node.id}
              onSelect={setSelectedId}
            />
          ))}

          {edges.map((edge) => {
            const from = nodeById.get(edge.source_node_id);
            const to = nodeById.get(edge.target_node_id);
            if (!from || !to) return null;

            // Roads connected to the selected building turn white and thicker
            const connected =
              selected &&
              (edge.source_node_id === selected.id || edge.target_node_id === selected.id);

            return (
              <Line
                key={edge.id ?? `${edge.source_node_id}-${edge.target_node_id}`}
                points={[
                  [Number(from.position_x), 0.1, Number(from.position_y)],
                  [Number(to.position_x), 0.1, Number(to.position_y)],
                ]}
                color={connected ? '#ffffff' : '#f0abfc'}
                lineWidth={connected ? 4 : 2}
              />
            );
          })}

          <OrbitControls makeDefault maxPolarAngle={Math.PI / 2.05} />
        </Canvas>
      </div>

      {/* (Details Panel Div) */}
      <div className="mt-3 min-h-[60px] rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
        {selected ? (
          <>
            <strong>{selected.file_name}</strong>
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