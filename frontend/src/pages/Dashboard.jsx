import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import City3D from '../components/City3D';

/* ---------- Small UI pieces ---------- */

function Spinner({ className = 'h-4 w-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

function CityIcon() {
  return (
    <svg
      viewBox="0 0 64 64"
      className="h-14 w-14"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 56h48" />
      <rect x="10" y="26" width="12" height="30" rx="1.5" />
      <rect x="26" y="10" width="14" height="46" rx="1.5" />
      <rect x="44" y="32" width="10" height="24" rx="1.5" />
      <path d="M30 18h6M30 26h6M30 34h6M14 34h4M14 42h4M47 40h4M47 48h4" />
    </svg>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 transition-colors duration-200 hover:border-slate-700">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

function EmptyState() {
  const steps = [
    { n: '1', title: 'Paste a URL', text: 'Any public GitHub repository.' },
    { n: '2', title: 'We parse it', text: 'Files, complexity and imports.' },
    { n: '3', title: 'Explore in 3D', text: 'Rotate, zoom and click buildings.' },
  ];

  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-700/70 bg-slate-900/40 px-6 py-14 text-center">
      <div className="relative mb-6">
        <div className="absolute inset-0 animate-pulse rounded-full bg-violet-600/30 blur-2xl" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-3xl border border-white/10 bg-slate-900 text-violet-400 shadow-xl">
          <CityIcon />
        </div>
      </div>

      <h3 className="text-2xl font-semibold tracking-tight">Ready to build your city?</h3>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-400">
        Paste a GitHub repository URL above and watch its files rise as buildings, with roads
        showing which files depend on each other.
      </p>

      <div className="mt-8 grid w-full max-w-xl gap-3 sm:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.n}
            className="rounded-xl border border-slate-800 bg-slate-950/50 p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-500/40"
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-violet-600/20 text-xs font-semibold text-violet-300">
              {s.n}
            </span>
            <div className="mt-2 text-sm font-medium">{s.title}</div>
            <div className="mt-0.5 text-xs text-slate-400">{s.text}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function AnalyzingState() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-center shadow-lg">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-violet-600/15 text-violet-400">
        <Spinner className="h-8 w-8" />
      </div>
      <h3 className="mt-5 text-lg font-semibold">Building your city...</h3>
      <p className="mt-1 text-sm text-slate-400">
        Reading files, calculating complexity and mapping imports.
      </p>
      <div className="mt-6 w-full max-w-sm space-y-2">
        <div className="h-2 animate-pulse rounded-full bg-slate-800" />
        <div className="h-2 w-5/6 animate-pulse rounded-full bg-slate-800" />
        <div className="h-2 w-2/3 animate-pulse rounded-full bg-slate-800" />
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [repos, setRepos] = useState([]);
  const resultRef = useRef(null);
  const navigate = useNavigate();

  const loadRepos = () =>
    api.get('/repo').then((res) => setRepos(res.data.repositories));

  useEffect(() => {
    api.get('/auth/me')
      .then((res) => {
        setUser(res.data.user);
        return loadRepos();
      })
      .catch(() => {
        localStorage.removeItem('token');
        navigate('/login');
      });
  }, [navigate]);

  // Scroll to the result whenever a city is analyzed or loaded
  useEffect(() => {
    if (result) {
      resultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [result]);

  const handleAnalyze = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    setLoading(true);
    try {
      const res = await api.post('/repo/analyze', { githubUrl });
      setResult(res.data);
      setGithubUrl('');
      loadRepos();
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center gap-3 bg-slate-950 text-slate-400">
        <Spinner className="h-5 w-5" /> Loading...
      </div>
    );
  }

  const repo = result?.repository;
  const nodes = result?.city?.nodes || [];
  const edges = result?.city?.edges || [];
  const files = (result?.fileTree || []).filter((f) => f.type === 'file');

  return (
    <div className="relative isolate min-h-screen bg-slate-950 text-slate-100">
      {/* Soft background glow (makes the glass header visible) */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -top-16 right-1/4 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
      </div>

      {/* Glassmorphism header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/50 shadow-[0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold shadow-lg shadow-violet-900/40 ring-1 ring-white/20">
              D
            </span>
            <span className="text-lg font-semibold tracking-tight">DependencyCity</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="flex max-w-[170px] items-center gap-2 truncate rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 sm:max-w-xs">
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              <span className="truncate">{user.email}</span>
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 hover:border-white/25 hover:bg-white/10 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {/* Analyze box */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-lg backdrop-blur">
          <h2 className="text-lg font-semibold">Analyze a GitHub repository</h2>
          <p className="mt-1 text-sm text-slate-400">
            Paste a public repository URL to turn its files into a 3D city.
          </p>

          <form onSubmit={handleAnalyze} className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="url"
              placeholder="https://github.com/owner/repo"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              required
              disabled={loading}
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 hover:border-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading}
              className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-all duration-200 hover:scale-[1.03] hover:bg-violet-500 hover:shadow-violet-700/40 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
            >
              {loading && <Spinner />}
              {loading ? 'Analyzing...' : 'Analyze'}
            </button>
          </form>

          {error && (
            <div className="mt-4 rounded-lg border border-red-900 bg-red-950/50 px-4 py-2 text-sm text-red-300">
              {error}
            </div>
          )}
        </section>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Right column: loading, result or empty state */}
          <section ref={resultRef} className="scroll-mt-24 space-y-6 lg:order-2 lg:col-span-2">
            {loading ? (
              <AnalyzingState />
            ) : result ? (
              <>
                {/* Repository details card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-xl font-semibold">
                        {repo.owner}/{repo.repo_name}
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        {repo.description || 'No description'}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => navigate(`/repo/${repo.id}`)}
                        className="rounded-lg bg-violet-600 px-3 py-1.5 text-sm font-medium text-white transition-all duration-200 hover:scale-105 hover:bg-violet-500 active:scale-95"
                      >
                        Open full analysis
                      </button>
                      {repo.repo_url && (
                        <a
                          href={repo.repo_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 hover:scale-105 hover:border-violet-500/60 hover:bg-slate-800 active:scale-95"
                        >
                          View on GitHub
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    <Stat label="Language" value={repo.language || 'n/a'} />
                    <Stat label="Stars" value={Number(repo.stars || 0).toLocaleString()} />
                    <Stat label="Files" value={repo.file_count} />
                    <Stat label="Branch" value={repo.default_branch} />
                    <Stat label="Buildings" value={nodes.length} />
                    <Stat label="Roads" value={edges.length} />
                  </div>

                  {result.truncated && (
                    <p className="mt-4 text-sm text-amber-400">
                      Note: the file tree was too large and was truncated by GitHub.
                    </p>
                  )}
                </div>

                {/* 3D city card */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                      City
                    </h3>
                    <span className="text-xs text-slate-500">
                      Drag to rotate · scroll to zoom · click a building
                    </span>
                  </div>
                  {nodes.length === 0 ? (
                    <p className="px-2 pb-2 text-sm text-slate-400">
                      No code files were found to build a city.
                    </p>
                  ) : (
                    <City3D nodes={nodes} edges={edges} height={520} />
                  )}
                </div>

                {/* File tree */}
                {files.length > 0 && (
                  <details className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg transition-colors duration-200 hover:border-slate-700">
                    <summary className="cursor-pointer text-sm font-medium text-slate-300">
                      File tree (first 50 files)
                    </summary>
                    <ul className="mt-3 max-h-64 space-y-1 overflow-auto font-mono text-xs text-slate-400">
                      {files.slice(0, 50).map((f) => (
                        <li key={f.path}>{f.path}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </>
            ) : (
              <EmptyState />
            )}
          </section>

                    {/* Left column: previously analyzed */}
          <aside className="lg:order-1">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
                Previously analyzed
              </h3>

              {repos.length === 0 ? (
                <p className="text-sm text-slate-500">No repositories yet.</p>
              ) : (
                <ul className="space-y-2">
                  {repos.map((r) => {
                    const active = result?.repository?.id === r.id;
                    return (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => navigate(`/repo/${r.id}`)}
                          className={`group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/60 ${
                            active
                              ? 'border-violet-500 bg-violet-500/10'
                              : 'border-slate-800 bg-slate-950/40 hover:border-violet-500/50 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium">
                              {r.owner}/{r.repo_name}
                            </div>
                            <div className="mt-0.5 text-xs text-slate-400">
                              {`${r.file_count} files · ${r.language || 'n/a'} · ${new Date(
                                r.analyzed_at
                              ).toLocaleDateString()}`}
                            </div>
                          </div>
                          <svg
                            className="h-4 w-4 shrink-0 text-slate-600 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-violet-400"
                            viewBox="0 0 20 20"
                            fill="currentColor"
                            aria-hidden="true"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                              clipRule="evenodd"
                            />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}