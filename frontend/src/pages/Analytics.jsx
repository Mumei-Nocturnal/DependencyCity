import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api';
import AppHeader from '../components/AppHeader';
import useAuthUser from '../hooks/useAuthUser';

/* ---------- Small UI pieces ---------- */

function Icon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
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

const FolderIcon = () => (
  <Icon>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </Icon>
);
const CubeIcon = () => (
  <Icon>
    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </Icon>
);
const NetworkIcon = () => (
  <Icon>
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </Icon>
);
const BarsIcon = () => (
  <Icon>
    <line x1="18" y1="20" x2="18" y2="10" />
    <line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" />
  </Icon>
);
const ArrowLeft = () => (
  <Icon>
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
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

function PageSkeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-2xl bg-slate-900" />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="h-80 rounded-2xl bg-slate-900 lg:col-span-3" />
        <div className="h-80 rounded-2xl bg-slate-900 lg:col-span-2" />
      </div>
    </div>
  );
}

// "src/lib/index.js" -> "lib/index.js"
const shortPath = (p = '') => p.split('/').slice(-2).join('/');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/* ---------- Page ---------- */

export default function Analytics() {
  const { user, logout } = useAuthUser();
  const navigate = useNavigate();

  const [repos, setRepos] = useState([]);
  const [topFiles, setTopFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [grown, setGrown] = useState(false); // lets the bars animate in

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.get('/repo'), api.get('/repo/top-files')])
      .then(([listRes, topRes]) => {
        if (cancelled) return;
        setRepos(listRes.data.repositories);
        setTopFiles(topRes.data.files);
      })
      .catch((err) => {
        if (!cancelled) setError(err.response?.data?.error || 'Could not load analytics');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) return undefined;
    const t = setTimeout(() => setGrown(true), 60);
    return () => clearTimeout(t);
  }, [loading]);

  const totals = useMemo(() => {
    const buildings = repos.reduce((sum, r) => sum + (r.node_count || 0), 0);
    const roads = repos.reduce((sum, r) => sum + (r.edge_count || 0), 0);
    return {
      repos: repos.length,
      buildings,
      roads,
      avg: repos.length ? buildings / repos.length : 0,
    };
  }, [repos]);

  const maxComplexity = Math.max(1, ...topFiles.map((f) => Number(f.complexity)));

  return (
    <div className="relative isolate min-h-screen bg-slate-950 text-slate-100">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -top-16 right-1/4 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
      </div>

      <AppHeader email={user?.email} onLogout={logout} />

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {/* Title row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Analytics</h1>
            <p className="mt-1 text-sm text-slate-400">
              Totals across every repository you have analyzed.
            </p>
          </div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 hover:border-white/25 hover:bg-white/10 active:scale-95"
          >
            <ArrowLeft />
            Back to Dashboard
          </Link>
        </div>

        {loading && <PageSkeleton />}

        {!loading && error && (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 p-6 text-sm text-red-300">
            {error}
          </div>
        )}

        {!loading && !error && repos.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/40 px-6 py-14 text-center">
            <h2 className="text-lg font-semibold">No repositories analyzed yet</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">
              Analyze your first GitHub repository on the Dashboard and its numbers will show up
              here.
            </p>
            <Link
              to="/dashboard"
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-semibold text-white transition-all duration-200 hover:scale-[1.03] hover:bg-violet-500 active:scale-[0.97]"
            >
              Go to Dashboard
            </Link>
          </div>
        )}

        {!loading && !error && repos.length > 0 && (
          <>
            {/* Aggregate stats */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard
                icon={<FolderIcon />}
                label="Repositories"
                value={totals.repos}
                sub="analyzed in total"
              />
              <StatCard
                icon={<CubeIcon />}
                label="Total buildings"
                value={totals.buildings.toLocaleString()}
                sub="files turned into 3D buildings"
              />
              <StatCard
                icon={<NetworkIcon />}
                label="Dependency roads"
                value={totals.roads.toLocaleString()}
                sub="imports between files"
              />
              <StatCard
                icon={<BarsIcon />}
                label="Avg per repository"
                value={totals.avg.toFixed(1)}
                sub="buildings per repo"
              />
            </section>

            <div className="grid gap-6 lg:grid-cols-5">
              {/* Top 5 most complex files */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg lg:col-span-3">
                <h2 className="text-lg font-semibold">Top 5 most complex files</h2>
                <p className="mt-1 text-xs text-slate-500">Across all analyzed repositories. Click a row to open its repository.</p>

                {topFiles.length === 0 ? (
                  <p className="mt-6 text-sm text-slate-400">No analyzed files yet.</p>
                ) : (
                  <ul className="mt-4 space-y-1">
                    {topFiles.map((f, i) => (
                      <li key={f.id}>
                        <button
                          onClick={() => navigate(`/repo/${f.repo_id}`)}
                          title={`${f.file_path} (${f.owner}/${f.repo_name})`}
                          className="group w-full rounded-xl p-2.5 text-left transition-colors duration-200 hover:bg-slate-800/50"
                        >
                          <div className="flex items-baseline justify-between gap-3 text-sm">
                            <span className="flex min-w-0 items-center gap-2">
                              <span className="w-4 text-xs text-slate-500">{i + 1}</span>
                              <span className="truncate text-slate-100">{shortPath(f.file_path)}</span>
                            </span>
                            <span className="shrink-0 font-semibold text-slate-200">{f.complexity}</span>
                          </div>
                          <div className="truncate pl-6 text-xs text-slate-500">
                            {f.owner}/{f.repo_name}
                          </div>
                          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-800">
                            <div
                              className="h-full rounded-full transition-all duration-700 ease-out"
                              style={{
                                width: grown
                                  ? `${Math.max(4, (Number(f.complexity) / maxComplexity) * 100)}%`
                                  : '0%',
                                backgroundImage: 'linear-gradient(90deg, #7c3aed, #38bdf8)',
                              }}
                            />
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Repository list */}
              <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg lg:col-span-2">
                <h2 className="text-lg font-semibold">Analyzed repositories</h2>
                <ul className="mt-4 space-y-2">
                  {repos.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => navigate(`/repo/${r.id}`)}
                        className="group flex w-full items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/40 px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500/50 hover:bg-slate-800/60"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">
                            {r.owner}/{r.repo_name}
                          </div>
                          <div className="mt-0.5 truncate text-xs text-slate-400">
                            {r.language || 'n/a'} · {new Date(r.analyzed_at).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="shrink-0 text-right text-xs text-slate-400">
                          <div>{plural(r.node_count || 0, 'building')}</div>
                          <div>{plural(r.edge_count || 0, 'road')}</div>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}