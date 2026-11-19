import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';
import City3D from '../components/City3D';

function Stat({ label, value }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
      <div className="text-xs uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-100">{value}</div>
    </div>
  );
}

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingId, setLoadingId] = useState(null);
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

  // Scroll to the result card whenever a city is analyzed or loaded
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

  // Load a previously analyzed repository and show its saved city
  const handleLoadSavedCity = async (repoId) => {
    setError('');
    setLoadingId(repoId);
    try {
      const res = await api.get(`/repo/${repoId}/city`);
      setResult({
        repository: res.data.repository,
        truncated: false,
        fileTree: res.data.fileTree || [],
        city: { nodes: res.data.nodes, edges: res.data.edges },
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load this city');
    } finally {
      setLoadingId(null);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
        Loading...
      </div>
    );
  }

  const repo = result?.repository;
  const nodes = result?.city?.nodes || [];
  const edges = result?.city?.edges || [];
  const files = (result?.fileTree || []).filter((f) => f.type === 'file');

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold">
              D
            </span>
            <span className="text-lg font-semibold tracking-tight">DependencyCity</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="max-w-[140px] truncate text-sm text-slate-400 sm:max-w-xs">
              {user.email}
            </span>
            <button
              onClick={logout}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
        {/* Analyze box */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
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
              className="flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder-slate-500 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
            />
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition hover:bg-violet-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
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
          {/* Result */}
          <section ref={resultRef} className="scroll-mt-20 space-y-6 lg:order-2 lg:col-span-2">
            {result ? (
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
                    {repo.repo_url && (
                      <a
                        href={repo.repo_url}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:bg-slate-800"
                      >
                        View on GitHub
                      </a>
                    )}
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
                  <details className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-lg">
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
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-900/40 p-10 text-center text-sm text-slate-500">
                Analyze a repository, or open a saved one from the list, to see its city.
              </div>
            )}
          </section>

          {/* Previously analyzed */}
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
                          onClick={() => handleLoadSavedCity(r.id)}
                          disabled={loadingId === r.id}
                          className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                            active
                              ? 'border-violet-500 bg-violet-500/10'
                              : 'border-slate-800 bg-slate-950/40 hover:border-slate-600 hover:bg-slate-800/60'
                          }`}
                        >
                          <div className="truncate text-sm font-medium">
                            {r.owner}/{r.repo_name}
                          </div>
                          <div className="mt-0.5 text-xs text-slate-400">
                            {loadingId === r.id
                              ? 'Loading city...'
                              : `${r.file_count} files · ${r.language || 'n/a'} · ${new Date(
                                  r.analyzed_at
                                ).toLocaleDateString()}`}
                          </div>
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