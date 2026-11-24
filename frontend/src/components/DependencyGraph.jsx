import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import { buildLabels } from '../utils/fileLabels';

/* ---------- Colors ---------- */

const BG = '#01030f';
const GOLD = '#ffc933';           // the node you clicked
const PINK = '#ff6ec7';           // files it imports (outgoing)
const SKY = '#38bdf8';            // files that import it (incoming)
const BOTH = '#a78bfa';           // imports it AND is imported by it (two-way)
const EDGE_MAGENTA = '#ff3df0';   // default edges

// One tint per folder (district). Gold, pink and sky blue are kept free for selection.
const DISTRICT_PALETTE = [
  '#22d3ee',
  '#a78bfa',
  '#34d399',
  '#818cf8',
  '#2dd4bf',
  '#a3e635',
  '#c084fc',
  '#60a5fa',
];

/* ---------- Node size ---------- */

const MIN_R = 5;                  // radius of the simplest file
const MAX_R = 22;                 // radius of the most complex file
const RADIUS_SCALE_FLOOR = 10;    // small repos are not stretched to MAX_R

/* ---------- Layout tuning ---------- */

const CHARGE = -55;               // repulsion between nodes (closer to 0 = tighter)
const CHARGE_RANGE = 150;         // repulsion only acts within this distance
const LINK_EXTRA = 22;            // link length = this + the two node radii
const GRAVITY = 0.1;              // pull toward the center
const COLLIDE_PAD = 6;            // minimum gap between two circles
const WARMUP_TICKS = 100;
const COOLDOWN_TICKS = 100;
const FIT_PADDING = 50;
const LABEL_ROOM = 70;            // extra room on the right of the graph for file names
const MAX_FIT_ZOOM = 2.2;

/* ---------- Helpers ---------- */

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const rgba = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};
const lighten = (hex, t) => {
  const [r, g, b] = hexToRgb(hex);
  const m = (c) => Math.round(c + (255 - c) * t);
  return `rgb(${m(r)},${m(g)},${m(b)})`;
};

const truncate = (s = '', n = 20) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// "src/components/Navbar.jsx" -> "src/components", root files -> ""
const folderOf = (p = '') => {
  const i = p.lastIndexOf('/');
  return i === -1 ? '' : p.slice(0, i);
};

// The graph library replaces link.source / link.target with node objects
const idOf = (v) => (typeof v === 'object' && v !== null ? v.id : v);
const complexityOfEnd = (end) => (typeof end === 'object' && end ? end.complexity : 0);

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

function collideForce(padding, radiusOf) {
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
        const min = radiusOf(a.complexity) + radiusOf(b.complexity) + padding;
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

/* ---------- Small UI pieces ---------- */

const CHIP_STYLES = {
  pink: 'border-pink-400/40 bg-pink-500/10 text-pink-200 hover:border-pink-300/70 hover:bg-pink-500/20',
  sky: 'border-sky-400/40 bg-sky-500/10 text-sky-200 hover:border-sky-300/70 hover:bg-sky-500/20',
};

function ChipList({ title, tone, items, labelOf, onPick }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
        {title} ({items.length})
      </div>
      {items.length === 0 ? (
        <span className="text-xs text-slate-500">none</span>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {items.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => onPick(n.id)}
              title={n.file_path}
              className={`rounded-full border px-2.5 py-1 text-xs transition-all duration-200 active:scale-95 ${CHIP_STYLES[tone]}`}
            >
              {labelOf(n)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function KeyDot({ color, text }) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        className="h-2 w-2 rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 8px ${color}` }}
      />
      {text}
    </span>
  );
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
  const labelOf = useCallback((n) => labels.get(n.id) || n.file_name, [labels]);

  // Node radius: grows with complexity, relative to the most complex file
  const radiusOf = useMemo(() => {
    const top = Math.max(RADIUS_SCALE_FLOOR, ...nodes.map((n) => Number(n.complexity) || 1));
    return (c) => MIN_R + (Math.max(Number(c) || 1, 1) / top) * (MAX_R - MIN_R);
  }, [nodes]);

  // Districts: one color per folder
  const districts = useMemo(() => {
    const counts = new Map();
    nodes.forEach((n) => {
      const key = folderOf(n.file_path);
      counts.set(key, (counts.get(key) || 0) + 1);
    });
    return [...counts.keys()]
      .sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
      .map((key, i) => ({
        key,
        label: key === '' ? 'root' : key,
        count: counts.get(key),
        color: DISTRICT_PALETTE[i % DISTRICT_PALETTE.length],
      }));
  }, [nodes]);
  const districtByKey = useMemo(() => new Map(districts.map((d) => [d.key, d])), [districts]);

  // The graph library mutates the objects it receives, so give it copies
  const graphData = useMemo(() => {
    const ids = new Set(nodes.map((n) => n.id));
    return {
      nodes: nodes.map((n) => ({
        id: n.id,
        file_name: n.file_name,
        file_path: n.file_path,
        folder: folderOf(n.file_path),
        complexity: Number(n.complexity),
      })),
      links: edges
        .filter((e) => ids.has(e.source_node_id) && ids.has(e.target_node_id))
        .map((e) => ({ source: e.source_node_id, target: e.target_node_id })),
    };
  }, [nodes, edges]);

  // id -> ids it imports, and id -> ids that import it
  const { outMap, inMap } = useMemo(() => {
    const out = new Map();
    const inn = new Map();
    graphData.nodes.forEach((n) => {
      out.set(n.id, new Set());
      inn.set(n.id, new Set());
    });
    graphData.links.forEach((l) => {
      const s = idOf(l.source);
      const t = idOf(l.target);
      out.get(s)?.add(t);
      inn.get(t)?.add(s);
    });
    return { outMap: out, inMap: inn };
  }, [graphData]);

  // Highlighting is driven by the clicked node
  const selected = selectedId != null ? nodeById.get(selectedId) || null : null;
  const focusId = selected ? selected.id : null;
  const focusOut = focusId != null ? outMap.get(focusId) : null;
  const focusIn = focusId != null ? inMap.get(focusId) : null;

  const roleOf = useCallback(
    (id) => {
      if (focusId == null) return 'idle';
      if (id === focusId) return 'focus';
      const o = focusOut?.has(id);
      const i = focusIn?.has(id);
      if (o && i) return 'both';
      if (o) return 'out';
      if (i) return 'in';
      return 'dim';
    },
    [focusId, focusOut, focusIn]
  );

  // 'out' = selected imports target, 'in' = source imports selected
  const linkKind = useCallback(
    (link) => {
      if (focusId == null) return 'idle';
      if (idOf(link.source) === focusId) return 'out';
      if (idOf(link.target) === focusId) return 'in';
      return 'dim';
    },
    [focusId]
  );

  const linkColor = useCallback(
    (link) => {
      switch (linkKind(link)) {
        case 'out':
          return rgba(PINK, 0.95);
        case 'in':
          return rgba(SKY, 0.95);
        case 'dim':
          return 'rgba(110,120,150,0.07)';
        default:
          return rgba(EDGE_MAGENTA, 0.8);
      }
    },
    [linkKind]
  );

  const particleColor = useCallback(
    (link) => {
      switch (linkKind(link)) {
        case 'out':
          return lighten(PINK, 0.5);
        case 'in':
          return lighten(SKY, 0.5);
        default:
          return '#ffd1fb';
      }
    },
    [linkKind]
  );

  // Soft glow behind every edge (the library draws the bright core line on top)
  const paintLinkGlow = useCallback(
    (link, ctx) => {
      const s = link.source;
      const t = link.target;
      if (typeof s !== 'object' || typeof t !== 'object') return;
      if (![s.x, s.y, t.x, t.y].every(Number.isFinite)) return;

      const kind = linkKind(link);
      if (kind === 'dim') return;

      const color = kind === 'out' ? PINK : kind === 'in' ? SKY : EDGE_MAGENTA;
      const active = kind !== 'idle';

      ctx.save();
      ctx.lineCap = 'round';
      ctx.strokeStyle = color;

      ctx.globalAlpha = active ? 0.2 : 0.12;
      ctx.lineWidth = active ? 9 : 6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();

      ctx.globalAlpha = active ? 0.4 : 0.25;
      ctx.lineWidth = active ? 4 : 2.6;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();

      ctx.restore();
    },
    [linkKind]
  );

  const paintNode = useCallback(
    (node, ctx, scale) => {
      if (!Number.isFinite(node.x) || !Number.isFinite(node.y)) return;

      const r = radiusOf(node.complexity);
      const role = roleOf(node.id);
      const dimmed = role === 'dim';
      const isHover = node.id === hoverId;
      const base = districtByKey.get(node.folder)?.color || DISTRICT_PALETTE[0];
      const color =
        role === 'focus' ? GOLD : role === 'out' ? PINK : role === 'in' ? SKY : role === 'both' ? BOTH : base;

      ctx.save();
      ctx.globalAlpha = dimmed ? 0.3 : 1;

      if (dimmed) {
        // Everything not related to the selected file fades to dark grey
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        ctx.fillStyle = '#161c2c';
        ctx.fill();
        ctx.lineWidth = 1 / scale;
        ctx.strokeStyle = '#3b4358';
        ctx.stroke();
      } else {
        // Glowing circle
        ctx.shadowColor = color;
        ctx.shadowBlur = role === 'focus' ? 30 : isHover ? 26 : role === 'idle' ? 14 : 22;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
        const grad = ctx.createRadialGradient(
          node.x - r * 0.35,
          node.y - r * 0.35,
          r * 0.1,
          node.x,
          node.y,
          r
        );
        grad.addColorStop(0, lighten(color, 0.55));
        grad.addColorStop(1, color);
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.shadowBlur = 0;

        ctx.lineWidth = (role === 'focus' || isHover ? 2 : 1) / scale;
        ctx.strokeStyle = role === 'focus' ? '#fff7d6' : isHover ? '#ffffff' : lighten(color, 0.6);
        ctx.stroke();
      }

      // File name next to the node (shortened). Hover and selection get a pill with the complexity.
      const emphasized = role === 'focus' || isHover;
      if (emphasized || scale > 0.55) {
        const name = truncate(labelOf(node), emphasized ? 32 : 20);
        const fs = (emphasized ? 11 : 10) / scale;
        ctx.font = `${emphasized ? 600 : 500} ${fs}px system-ui, sans-serif`;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'left';

        if (emphasized) {
          const text = `${name}  ·  ${node.complexity}`;
          const padX = 6 / scale;
          const padY = 4 / scale;
          const boxW = ctx.measureText(text).width + padX * 2;
          const boxH = fs + padY * 2;
          const bx = node.x + r + 4 / scale;
          const by = node.y - boxH / 2;

          roundRectPath(ctx, bx, by, boxW, boxH, boxH / 2);
          ctx.fillStyle = 'rgba(1,3,15,0.92)';
          ctx.fill();
          ctx.lineWidth = 1 / scale;
          ctx.strokeStyle = rgba(color, 0.7);
          ctx.stroke();

          ctx.fillStyle = role === 'focus' ? '#fde68a' : '#f1f5f9';
          ctx.fillText(text, bx + padX, node.y + 0.3 / scale);
        } else {
          const tx = node.x + r + 6 / scale;
          ctx.lineJoin = 'round';
          ctx.lineWidth = 3 / scale;
          ctx.strokeStyle = 'rgba(1,3,15,0.9)';
          ctx.strokeText(name, tx, node.y);
          ctx.fillStyle =
            role === 'out'
              ? '#fbcfe8'
              : role === 'in'
                ? '#bae6fd'
                : role === 'both'
                  ? '#ddd6fe'
                  : dimmed
                    ? '#64748b'
                    : '#cbd5e1';
          ctx.fillText(name, tx, node.y);
        }
      }

      ctx.restore();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [radiusOf, roleOf, hoverId, districtByKey, labels]
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

      const bw = Math.max(box.x[1] - box.x[0], 1) + LABEL_ROOM;
      const bh = Math.max(box.y[1] - box.y[0], 1);
      const k = Math.min(
        (size.width - FIT_PADDING * 2) / bw,
        (size.height - FIT_PADDING * 2) / bh,
        MAX_FIT_ZOOM
      );

      fg.centerAt((box.x[0] + box.x[1] + LABEL_ROOM) / 2, (box.y[0] + box.y[1]) / 2, ms);
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
      (l) => LINK_EXTRA + radiusOf(complexityOfEnd(l.source)) + radiusOf(complexityOfEnd(l.target))
    );
    fg.d3Force('gravity', gravityForce(GRAVITY));
    fg.d3Force('collide', collideForce(COLLIDE_PAD, radiusOf));

    fitted.current = false; // fit again once this layout settles
    fg.d3ReheatSimulation?.();
  }, [ready, graphData, radiusOf]);

  // Re-fit when the container size changes (for example Expand / Close)
  useEffect(() => {
    if (!ready) return undefined;
    const t = setTimeout(() => fitView(300), 150);
    return () => clearTimeout(t);
  }, [ready, fitView]);

  // Details for the selected node
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

  const selectedDistrict = selected ? districtByKey.get(folderOf(selected.file_path)) : null;

  return (
    <div>
      <div
        ref={wrapRef}
        style={{ width: '100%', height, backgroundColor: BG }}
        className="relative overflow-hidden rounded-xl border border-cyan-500/20 shadow-[0_0_40px_-12px_rgba(34,211,238,0.5)]"
      >
        {ready && (
          <ForceGraph2D
            ref={fgRef}
            width={size.width}
            height={size.height}
            graphData={graphData}
            backgroundColor={BG}
            nodeId="id"
            nodeRelSize={1}
            nodeVal={(n) => radiusOf(n.complexity) ** 2}
            nodeLabel={() => ''}
            nodeCanvasObjectMode={() => 'replace'}
            nodeCanvasObject={paintNode}
            linkCurvature={0}
            linkCanvasObjectMode={() => 'before'}
            linkCanvasObject={paintLinkGlow}
            linkColor={linkColor}
            linkWidth={(l) => {
              const k = linkKind(l);
              return k === 'dim' ? 0.6 : k === 'idle' ? 1.2 : 2.4;
            }}
            linkDirectionalArrowLength={5}
            linkDirectionalArrowRelPos={1}
            linkDirectionalArrowColor={linkColor}
            linkDirectionalParticles={(l) => (linkKind(l) === 'dim' ? 0 : 1)}
            linkDirectionalParticleWidth={2.4}
            linkDirectionalParticleSpeed={0.005}
            linkDirectionalParticleColor={particleColor}
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

        {/* Color key */}
        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[calc(100%-7rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-1.5 text-[11px] text-slate-300 backdrop-blur">
          <KeyDot color={GOLD} text="Selected" />
          <KeyDot color={PINK} text="Imports" />
          <KeyDot color={SKY} text="Imported by" />
          <span className="text-slate-500">Size = complexity</span>
        </div>

        <button
          onClick={() => fitView(500)}
          className="absolute right-3 top-3 rounded-lg border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-200 backdrop-blur transition-all duration-200 hover:border-violet-400/50 hover:bg-slate-900 active:scale-95"
        >
          Zoom to fit
        </button>

        {/* Districts legend */}
        {districts.length > 0 && (
          <div className="absolute bottom-3 left-3 max-h-32 max-w-[55%] overflow-auto rounded-lg border border-white/10 bg-slate-950/70 p-2 text-[11px] backdrop-blur">
            <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">Districts</div>
            <ul className="space-y-1">
              {districts.map((d) => (
                <li key={d.key || '(root)'} className="flex items-center gap-2 text-slate-300">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: d.color, boxShadow: `0 0 6px ${d.color}` }}
                  />
                  <span className="truncate">{d.label}</span>
                  <span className="text-slate-500">{d.count}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Details panel */}
      <div className="mt-3 min-h-[60px] rounded-lg border border-cyan-500/20 bg-slate-950/70 p-3 text-sm text-slate-300">
        {selected ? (
          <div className="space-y-3">
            <div>
              <strong className="text-amber-300">{selected.file_name}</strong>
              <span className="ml-2 text-xs text-slate-500">
                complexity {selected.complexity}
                {selectedDistrict ? ` · ${selectedDistrict.label}` : ''}
              </span>
              <div className="break-all text-xs text-slate-400">{selected.file_path}</div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <ChipList title="Imports" tone="pink" items={imports} labelOf={labelOf} onPick={setSelectedId} />
              <ChipList title="Imported by" tone="sky" items={importedBy} labelOf={labelOf} onPick={setSelectedId} />
            </div>
          </div>
        ) : (
          <span>Click a node to highlight what it imports and what imports it.</span>
        )}
      </div>
    </div>
  );
}