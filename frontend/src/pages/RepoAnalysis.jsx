import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../api';
import City3D from '../components/City3D';

const EMPTY = [];

/* ---------- Small UI pieces ---------- */

function Icon({ children, className = 'h-4 w-4' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ArrowLeft = () => (
  <Icon>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </Icon>
);
const ExternalLink = () => (
  <Icon>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </Icon>
);
const Maximize = () => (
  <Icon>
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </Icon>
);
const Close = () => (
  <Icon>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </Icon>
);
const FileIcon = () => (
  <Icon>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="16" y1="13" x2="8" y2="13" />
    <line x1="16" y1="17" x2="8" y2="17" />
  </Icon>
);
const ActivityIcon = () => (
  <Icon>
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
  </Icon>
);
const CodeIcon = () => (
  <Icon>
    <polyline points="16 18 22 12 16 6" />
    <polyline points="8 6 2 12 8 18" />
  </Icon>
);
const StarIcon = () => (
  <Icon>
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </Icon>
);

function StatCard({ icon, label, value, sub }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-lg backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500/40">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-500/10 text-violet-300">
          {icon}
        </span>
      </div>
      <div className="mt-3 truncate text-3xl font-semibold tracking-tight">{value}</div>
      <div className="mt-1 truncate text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function Insight({ label, title, sub, tooltip }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 transition-colors duration-200 hover:border-slate-700">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold text-slate-100" title={tooltip}>
        {title}
      </div>
      <div className="mt-0.5 truncate text-xs text-slate-500">{sub}</div>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-1/3 rounded-lg bg-slate-800" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-slate-900" />
        ))}
      </div>
      <div className="h-56 rounded-2xl bg-slate-900" />
      <div className="h-[420px] rounded-2xl bg-slate-900" />
    </div>
  );
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

const LEVELS = {
  Low: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  Moderate: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  High: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
};

/* ---------- Unique file labels ---------- */

// Starts with the last two path parts ("lib/index.js") and adds more parts
// only when two files would otherwise get the same label.
function buildLabels(nodes) {
  const labels = new Map();
  const parts = nodes.map((n) => (n.file_path || n.file_name || '').split('/'));

  nodes.forEach((n, i) => {
    const make = (d, idx = i) => parts[idx].slice(-d).join('/');
    let depth = Math.min(2, parts[i].length);
    while (
      depth < parts[i].length &&
      nodes.some((_, j) => j !== i && make(depth, j) === make(depth))
    ) {
      depth += 1;
    }
    labels.set(n.id, make(depth));
  });

  return labels;
}

/* ---------- Page ---------- */

export default function RepoAnalysis() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  // Load the saved city
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setData(null);

    api.get(`/repo/${id}/city`)
      .then((res) => {
        if (!cancelled) setData(res.data);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err.response?.status === 401) {
          localStorage.removeItem('token');
          navigate('/login');
          return;
        }
        setError(err.response?.data?.error || 'Could not load this repository');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  // Expanded 3D view: Escape closes it, and the page behind does not scroll
  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = (e) => e.key === 'Escape' && setExpanded(false);
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [expanded]);

  const repo = data?.repository;
  const nodes = data?.nodes ?? EMPTY;
  const edges = data?.edges ?? EMPTY;

  const labels = useMemo(() => buildLabels(nodes), [nodes]);
  const labelOf = (n) => labels.get(n.id) || n.file_name;

  // Numbers for the stats and the architecture overview
  const analysis = useMemo(() => {
    if (nodes.length === 0) return null;

    const inDeg = new Map();
    const outDeg = new Map();
    edges.forEach((e) => {
      outDeg.set(e.source_node_id, (outDeg.get(e.source_node_id) || 0) + 1);
      inDeg.set(e.target_node_id, (inDeg.get(e.target_node_id) || 0) + 1);
    });

    const topBy = (map) => {
      let best = null;
      let count = 0;
      nodes.forEach((n) => {
        const v = map.get(n.id) || 0;
        if (v > count) {
          count = v;
          best = n;
        }
      });
      return best ? { node: best, count } : null;
    };

    // Highest complexity first; same score -> alphabetical by full path
    const sorted = [...nodes].sort(
      (a, b) =>
        Number(b.complexity) - Number(a.complexity) ||
        String(a.file_path).localeCompare(String(b.file_path))
    );
    const avg = nodes.reduce((sum, n) => sum + Number(n.complexity), 0) / nodes.length;
    const level = avg < 6 ? 'Low' : avg < 14 ? 'Moderate' : 'High';

    return {
      avg,
      level,
      mostComplex: sorted[0],
      top: sorted.slice(0, 5),
      maxComplexity: Number(sorted[0].complexity) || 1,
      hub: topBy(inDeg),
      heavy: topBy(outDeg),
      isolated: nodes
        .filter((n) => !inDeg.has(n.id) && !outDeg.has(n.id))
        .sort((a, b) => String(a.file_path).localeCompare(String(b.file_path))),
    };
  }, [nodes, edges]);

  const summary = analysis
    ? `${repo.repo_name} maps to a city of ${plural(nodes.length, 'building')} connected by ${plural(
        edges.length,
        'dependency road'
      )}. ` +
      (analysis.hub
        ? `${labelOf(analysis.hub.node)} is the most central file, imported by ${plural(
            analysis.hub.count,
            'other file'
          )}. `
        : 'No local imports were detected between the analyzed files. ') +
      `${labelOf(analysis.mostComplex)} is the most complex file, with a score of ${analysis.mostComplex.complexity}.`
    : '';

  return (
    <div className="relative isolate min-h-screen bg-slate-950 text-slate-100">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -top-16 right-1/4 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/50 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 hover:border-white/25 hover:bg-white/10 active:scale-95"
            >
              <ArrowLeft />
              <span className="hidden sm:inline">Back to Dashboard</span>
              <span className="sm:hidden">Back</span>
            </Link>
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold sm:text-lg">
                {repo ? `${repo.owner}/${repo.repo_name}` : 'Repository analysis'}
              </h1>
              {repo && (
                <p className="truncate text-xs text-slate-400">
                  Analyzed {new Date(repo.analyzed_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>

          {repo?.repo_url && (
            <a
              href={repo.repo_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 hover:border-violet-400/50 hover:bg-white/10 active:scale-95"
            >
              <span className="hidden sm:inline">View on GitHub</span>
              <span className="sm:hidden">GitHub</span>
              <ExternalLink />
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {loading && <PageSkeleton />}

        {!loading && error && (
          <div className="mx-auto max-w-md rounded-2xl border border-red-900/60 bg-red-950/30 p-8 text-center">
            <h2 className="text-lg font-semibold text-red-200">Something went wrong</h2>
            <p className="mt-2 text-sm text-red-300/80">{error}</p>
            <Link
              to="/dashboard"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition-all duration-200 hover:bg-violet-500 active:scale-95"
            >
              <ArrowLeft /> Back to Dashboard
            </Link>
          </div>
        )}

        {!loading && !error && repo && (
          <>
            {/* Intro */}
            <section>
              <p className="max-w-3xl text-slate-400">{repo.description || 'No description provided.'}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
                  Branch: {repo.default_branch}
                </span>
                <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300">
                  {plural(nodes.length, 'building')} · {plural(edges.length, 'road')}
                </span>
              </div>
            </section>

            {/* Stats grid */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={<FileIcon />}
                label="Total files"
                value={Number(repo.file_count || 0).toLocaleString()}
                sub={`${nodes.length} source files visualized`}
              />
              <StatCard
                icon={<ActivityIcon />}
                label="Complexity score"
                value={analysis ? analysis.avg.toFixed(1) : 'n/a'}
                sub={
                  analysis ? (
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${LEVELS[analysis.level]}`}
                      >
                        {analysis.level}
                      </span>
                      average per file
                    </span>
                  ) : (
                    'no code files analyzed'
                  )
                }
              />
              <StatCard
                icon={<CodeIcon />}
                label="Primary language"
                value={repo.language || 'n/a'}
                sub="as detected by GitHub"
              />
              <StatCard
                icon={<StarIcon />}
                label="Stars"
                value={Number(repo.stars || 0).toLocaleString()}
                sub="on GitHub"
              />
            </section>

            {/* Architecture overview */}
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
              <h2 className="text-lg font-semibold">Architecture Overview</h2>

              {!analysis ? (
                <p className="mt-3 text-sm text-slate-400">
                  No JavaScript or TypeScript source files were found in this repository, so there
                  is nothing to map yet.
                </p>
              ) : (
                <div className="mt-4 grid gap-8 lg:grid-cols-5">
                  <div className="lg:col-span-3">
                    <p className="text-sm leading-relaxed text-slate-300">{summary}</p>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <Insight
                        label="Most complex"
                        title={labelOf(analysis.mostComplex)}
                        tooltip={analysis.mostComplex.file_path}
                        sub={`complexity ${analysis.mostComplex.complexity}`}
                      />
                      <Insight
                        label="Most imported"
                        title={analysis.hub ? labelOf(analysis.hub.node) : 'None'}
                        tooltip={analysis.hub?.node.file_path}
                        sub={
                          analysis.hub
                            ? `used by ${plural(analysis.hub.count, 'file')}`
                            : 'no shared dependencies'
                        }
                      />
                      <Insight
                        label="Imports the most"
                        title={analysis.heavy ? labelOf(analysis.heavy.node) : 'None'}
                        tooltip={analysis.heavy?.node.file_path}
                        sub={
                          analysis.heavy
                            ? `depends on ${plural(analysis.heavy.count, 'file')}`
                            : 'no dependencies found'
                        }
                      />
                      <Insight
                        label="Standalone files"
                        title={String(analysis.isolated.length)}
                        sub={
                          analysis.isolated.length
                            ? 'no imports and not imported'
                            : 'every file is connected'
                        }
                      />
                    </div>

                    {/* Full paths of every standalone file */}
                    {analysis.isolated.length > 0 && (
                      <details
                        open
                        className="mt-3 rounded-xl border border-slate-800 bg-slate-950/50 p-4"
                      >
                        <summary className="cursor-pointer text-sm font-medium text-slate-300">
                          Standalone files ({analysis.isolated.length})
                        </summary>
                        <ul className="mt-3 max-h-56 space-y-1 overflow-auto font-mono text-xs text-slate-400">
                          {analysis.isolated.map((n) => (
                            <li key={n.id} className="break-all">
                              {n.file_path}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </div>

                  <div className="lg:col-span-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Most complex files
                    </h3>
                    <ul className="mt-3 space-y-3">
                      {analysis.top.map((n) => (
                        <li key={n.id}>
                          <div className="flex items-center justify-between text-sm">
                            <span className="truncate pr-3 text-slate-200" title={n.file_path}>
                              {labelOf(n)}
                            </span>
                            <span className="text-slate-400">{n.complexity}</span>
                          </div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${Math.max(6, (Number(n.complexity) / analysis.maxComplexity) * 100)}%`,
                                backgroundImage: 'linear-gradient(90deg, #7c3aed, #38bdf8)',
                              }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {analysis && (
                <p className="mt-6 border-t border-slate-800 pt-4 text-xs text-slate-500">
                  Based on the first {plural(nodes.length, 'source file')} analyzed from this
                  repository. Complexity counts branching statements and operators, and only
                  relative imports are mapped.
                </p>
              )}
            </section>

            {/* 3D city (becomes a full-screen overlay when expanded) */}
            <section className={expanded ? 'fixed inset-0 z-50 overflow-auto bg-slate-950 p-4 sm:p-6' : ''}>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2">
                  <div>
                    <h2 className="text-lg font-semibold">3D City</h2>
                    <p className="text-xs text-slate-500">
                      Drag to rotate · scroll to zoom · click a building
                      {expanded ? ' · Esc to close' : ''}
                    </p>
                  </div>
                  <button
                    onClick={() => setExpanded((v) => !v)}
                    className="inline-flex items-center gap-2 rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 hover:scale-105 hover:border-violet-500/60 hover:bg-slate-800 active:scale-95"
                  >
                    {expanded ? <Close /> : <Maximize />}
                    {expanded ? 'Close' : 'Expand 3D View'}
                  </button>
                </div>

                {nodes.length === 0 ? (
                  <p className="px-2 pb-2 text-sm text-slate-400">
                    No code files were found to build a city.
                  </p>
                ) : (
                  <City3D
                    nodes={nodes}
                    edges={edges}
                    height={expanded ? 'calc(100vh - 270px)' : 560}
                  />
                )}
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}