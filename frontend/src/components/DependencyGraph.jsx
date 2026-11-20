import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { buildLabels } from '../utils/fileLabels';

/* ---------- Layout tuning (change these to taste) ---------- */

const CHARGE = -55;        // repulsion between nodes (closer to 0 = tighter)
const CHARGE_RANGE = 150;  // repulsion only acts within this distance
const LINK_EXTRA = 20;     // link length = this + the two node radii
const GRAVITY = 0.1;       // pull toward the center (keeps loose nodes close)
const COLLIDE_PAD = 6;     // minimum gap between two circles
const WARMUP_TICKS = 100;  // layout steps computed before the first frame
const COOLDOWN_TICKS = 100; // extra steps while it settles, then it stops
const FIT_PADDING = 50;    // empty space around the graph when fitting
const MAX_FIT_ZOOM = 2.2;  // stops tiny graphs from being zoomed in too far

/* ---------- Helpers ---------- */

const GOLD = '#ffc933';

// Same colors as the 3D city: low complexity = blue-violet, high = magenta
const getHue = (c) => 235 + Math.min(Number(c) / 30, 1) * 65;
const getRadius = (c) => Math.min(4 + Math.sqrt(Number(c)) * 1.6, 22);

// The graph library replaces link.source / link.target with node objects
const idOf = (v) => (typeof v === 'object' && v !== null ? v.id : v);
const radiusOfEnd = (end) => getRadius(typeof end === 'object' && end ? end.complexity : 0);

// Custom physics forces (plain d3 forces, so no extra imports are needed)
function gravityForce(k) {
  let nodes = [];
  const force = (alpha) => {
    for (const n of nodes) {
      if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      n.vx -= n.x * k * alpha;
      n.vy -= n.y * k * alpha;
    }
  };
  force.initialize = (n) => {
    nodes = n;
  };
  return force;
}

function collideForce(padding) {
  let nodes = [];
  const force = () => {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        if (!Number.isFinite(a.x) || !Number.isFinite(b.x)) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        const min = getRadius(a.complexity) + getRadius(b.complexity) + padding;
        if (dist < min) {
          const k = ((min - dist) / dist) * 0.35;
          dx *= k;
          dy *= k;
          b.vx += dx;
          b.vy += dy;
          a.vx -= dx;
          a.vy -= dy;
        }
      }
    }
  };
  force.initialize = (n) => {
    nodes = n;
  };
  return force;
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Measures the container, so the graph always fills it (also when expanded)
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

/* ---------- Component ---------- */

export default function DependencyGraph({ nodes = [], edges = [], height = 500 }) {
  const wrapRef = useRef(null);
  const fgRef = useRef(null);
  const fitted = useRef(false);
  const size = useSize(wrapRef);

  const [hoverId, setHoverId] = useState(null);
  const [selectedId, setSelectedId] = useState(null);

  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const labels = useMemo(() => buildLabels(nodes), [nodes]);
  const labelOf = (n) => labels.get(n.id) || n.file_name;

  // The graph library mutates the objects it receives, so give it copies
  const graphData = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        file_name: n.file_name,
        file_path: n.file_path,
        complexity: Number(n.complexity),
      })),
      links: edges
        .filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id))
        .map((e) => ({ source: e.source_node_id, target: e.target_node_id })),
    };
  }, [nodes, edges]);

  // id -> ids of connected nodes (for highlighting)
  const neighbors = useMemo(() => {
    const map = new Map(graphData.nodes.map((n) => [n.id, new Set()]));
    graphData.links.forEach((l) => {
      const s = idOf(l.source);
      const t = idOf(l.target);
      map.get(s)?.add(t);
      map.get(t)?.add(s);
    });
    return map;
  }, [graphData]);

  // Hover wins over selection while the mouse is on a node
  const activeId = hoverId ?? selectedId;
  const activeIsSelected = activeId != null && activeId === selectedId;

  const isConnected = useCallback(
    (link) => activeId != null && (idOf(link.source) === activeId || idOf(link.target) === activeId),
    [activeId]
  );

  const linkColor = useCallback(
    (link) => {
      if (activeId == null) return 'rgba(216,150,255,0.35)';
      if (isConnected(link)) return activeIsSelected ? GOLD : 'rgba(125,252,255,0.95)';
      return 'rgba(216,150,255,0.08)';
    },
    [activeId, activeIsSelected, isConnected]
  );

  const paintNode = useCallback(
    (node, ctx, scale) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

      const r = getRadius(node.complexity);
      const hue = getHue(node.complexity);
      const isSelected = node.id === selectedId;
      const isHover = node.id === hoverId;
      const isActive = node.id === activeId;
      const related = activeId != null && neighbors.get(activeId)?.has(node.id);
      const dimmed = activeId != null && !isActive && !related;

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.2 : 1;

      // Soft glow
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + (isActive ? 7 : 3.5), 0, 2 * Math.PI);
      ctx.fillStyle = isSelected
        ? 'rgba(255,201,51,0.25)'
        : `hsla(${hue}, 100%, 65%, ${isActive ? 0.3 : 0.14})`;
      ctx.fill();

      // Circle
      ctx.beginPath();
      ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
      ctx.fillStyle = isSelected ? GOLD : `hsl(${hue}, 85%, ${isHover ? 70 : 58}%)`;
      ctx.fill();
      ctx.lineWidth = (isActive ? 2 : 1) / scale;
      ctx.strokeStyle = isActive ? '#ffffff' : `hsl(${hue}, 100%, 85%)`;
      ctx.stroke();

      // File name: on hover, on selection, or for every node when zoomed in
      if (!dimmed && (isActive || isSelected || scale > 2.4)) {
        const text = `${labelOf(node)}  ·  ${node.complexity}`;
        const fontSize = 11 / scale;
        ctx.font = `500 ${fontSize}px system-ui, sans-serif`;
        const textW = ctx.measureText(text).width;
        const padX = 6 / scale;
        const padY = 4 / scale;
        const boxW = textW + padX * 2;
        const boxH = fontSize + padY * 2;
        const bx = node.x - boxW / 2;
        const by = node.y + r + 5 / scale;

        roundRectPath(ctx, bx, by, boxW, boxH, boxH / 2);
        ctx.fillStyle = 'rgba(8,11,34,0.92)';
        ctx.fill();
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = isSelected ? 'rgba(255,201,51,0.7)' : 'rgba(255,255,255,0.18)';
        ctx.stroke();

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = isSelected ? '#fde68a' : '#e2e8f0';
        ctx.fillText(text, node.x, by + boxH / 2 + 0.3 / scale);
      }

      ctx.restore();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeId, hoverId, selectedId, neighbors, labels]
  );

  // Fit the whole graph in the container (centered, with a zoom cap)
  const fitView = useCallback(
    (ms = 500) => {
      const fg = fgRef.current;
      if (!fg || size.width === 0) return;

      const box = fg.getGraphBbox?.();
      if (!box || !Number.isFinite(box.x?.[0]) || !Number.isFinite(box.y?.[0])) {
        fg.zoomToFit(ms, FIT_PADDING);
        return;
      }

      const bw = Math.max(box.x[1] - box.x[0], 1);
      const bh = Math.max(box.y[1] - box.y[0], 1);
      const k = Math.min(
        (size.width - FIT_PADDING * 2) / bw,
        (size.height - FIT_PADDING * 2) / bh,
        MAX_FIT_ZOOM
      );

      fg.centerAt((box.x[0] + box.x[1]) / 2, (box.y[0] + box.y[1]) / 2, ms);
      fg.zoom(Math.max(k, 0.3), ms);
    },
    [size.width, size.height]
  );

  // Physics: tight layout, no overlapping circles, loose nodes stay near the center
  const ready = size.width > 0;
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;

    fg.d3Force('charge')?.strength(CHARGE).distanceMax(CHARGE_RANGE);
    fg.d3Force('link')?.distance(
      (l) => LINK_EXTRA + radiusOfEnd(l.source) + radiusOfEnd(l.target)
    );
    fg.d3Force('gravity', gravityForce(GRAVITY));
    fg.d3Force('collide', collideForce(COLLIDE_PAD));

    fitted.current = false; // fit again once this layout settles
    fg.d3ReheatSimulation?.();
  }, [ready, graphData]);

  // Re-fit when the container size changes (for example Expand / Close)
  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => fitView(300), 150);
    return () => clearTimeout(t);
  }, [ready, fitView]);

  // Details for the selected node
  const selected = selectedId != null ? nodeById.get(selectedId) || null : null;
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
      <div
        ref={wrapRef}
        style={{ width: '100%', height }}
        className="relative overflow-hidden rounded-xl border border-violet-500/20 bg-[#080b22] shadow-[0_0_40px_-12px_rgba(168,85,247,0.6)]"
      >
        {ready && (
          <ForceGraph2D
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor="#080b22"
            nodeId="id"
            nodeRelSize={1}
            nodeVal={(n) => getRadius(n.complexity) ** 2}
            nodeLabel={() => ''}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={paintNode}
            linkColor={linkColor}
            linkWidth={(l) => (isConnected(l) ? 2 : 0.8)}
            linkCurvature={0.1}
            linkDirectionalArrowLength={4}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={linkColor}
            linkDirectionalParticles={1}
            linkDirectionalParticleWidth={2}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalParticleColor={linkColor}
            onNodeHover={(n) => setHoverId(n ? n.id : null)}
            onNodeClick={(n) => setSelectedId((prev) => (prev === n.id ? null : n.id))}
            onBackgroundClick={() => setSelectedId(null)}
            onEngineStop={() => {
              if (!fitted.current) {
                fitted.current = true;
                fitView(500);
              }
            }}
            warmupTicks={WARMUP_TICKS}
            cooldownTicks={COOLDOWN_TICKS}
            cooldownTime={3000}
            d3AlphaDecay={0.05}
            d3VelocityDecay={0.4}
            autoPauseRedraw={false}
            minZoom={0.3}
            maxZoom={8}
          />
        )}

        {/* Overlays */}
        <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-300 backdrop-blur">
          Circle size = complexity · Arrow = imports
        </div>
        <button
          onClick={() => fitView(500)}
          className="absolute right-3 top-3 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-200 backdrop-blur transition-all duration-200 hover:border-violet-400/50 hover:bg-slate-900 active:scale-95"
        >
          Zoom to fit
        </button>
      </div>

      {/* Details panel */}
      <div className="mt-3 min-h-[60px] rounded-lg border border-violet-500/20 bg-slate-950/70 p-3 text-sm text-slate-300">
        {selected ? (
          <>
            <strong className="text-amber-300">{selected.file_name}</strong>
            <div className="break-all">Path: {selected.file_path}</div>
            <div>Complexity: {selected.complexity}</div>
            <div>
              Imports ({imports.length}):{' '}
              {imports.map((n) => labelOf(n)).join(', ') || 'none'}
            </div>
            <div>
              Imported by ({importedBy.length}):{' '}
              {importedBy.map((n) => labelOf(n)).join(', ') || 'none'}
            </div>
          </>
        ) : (
          <span>Hover a node to see its name, or click one to see its details.</span>
        )}
      </div>
    </div>
  );
}