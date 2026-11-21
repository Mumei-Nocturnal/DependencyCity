import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppHeader from '../components/AppHeader';

const looksLikeToken = (t) => /^(ghp_|github_pat_|gho_|ghu_|ghs_)/.test(t.trim());

export default function Settings() {
  const navigate = useNavigate();
  
  // Getting email from localStorage (Assuming you saved it during login)
  const userEmail = localStorage.getItem('userEmail') || 'User';

  const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userEmail');
  navigate('/', { replace: true }); 
};

  const [token, setToken] = useState('');
  const [show, setShow] = useState(false);
  const [notice, setNotice] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    // UI only for now: nothing is sent or stored yet.
    setNotice('Preview only: the token form is not connected to the backend yet, so nothing was saved.');
    setToken('');
    setShow(false);
  };

  const showWarning = token.trim().length > 0 && !looksLikeToken(token);

  return (
    <div className="relative isolate min-h-screen bg-slate-950 text-slate-100">
      {/* Soft background glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[420px] overflow-hidden">
        <div className="absolute -top-24 left-1/4 h-72 w-72 rounded-full bg-violet-600/20 blur-3xl" />
        <div className="absolute -top-16 right-1/4 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
      </div>

      <AppHeader email={userEmail} onLogout={logout} />

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-slate-400">Manage your account and integrations.</p>
        </div>

        {/* Account */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <h2 className="text-lg font-semibold">Account</h2>
          <label htmlFor="email" className="mt-4 block text-sm font-medium text-slate-300">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={userEmail}
            readOnly
            className="mt-2 w-full cursor-not-allowed rounded-xl border border-slate-800 bg-slate-950/60 px-4 py-3 text-sm text-slate-300 opacity-80 outline-none"
          />
          <p className="mt-2 text-xs text-slate-500">Your email is used to sign in and cannot be changed here.</p>
        </section>

        {/* GitHub token */}
        <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">
          <h2 className="text-lg font-semibold">GitHub token</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-400">
            A personal access token raises GitHub's API limit from 60 to 5,000 requests per hour, so
            you can analyze more repositories. For public repositories it needs no scopes.
          </p>

          <form onSubmit={handleSubmit} className="mt-5">
            <label htmlFor="token" className="block text-sm font-medium text-slate-300">
              Personal access token
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="token"
                type={show ? 'text' : 'password'}
                value={token}
                onChange={(e) => {
                  setToken(e.target.value);
                  setNotice('');
                }}
                placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-100 placeholder-slate-600 outline-none transition-all duration-200 hover:border-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30"
              />
              <button
                type="button"
                onClick={() => setShow((v) => !v)}
                className="rounded-xl border border-slate-700 px-4 text-sm text-slate-300 transition-all duration-200 hover:border-slate-500 hover:bg-slate-800 active:scale-95"
              >
                {show ? 'Hide' : 'Show'}
              </button>
            </div>

            {showWarning && (
              <p className="mt-2 text-xs text-amber-400">
                This does not look like a GitHub token. They usually start with ghp_ or github_pat_.
              </p>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={!token.trim()}
                className="rounded-xl bg-violet-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-violet-900/30 transition-all duration-200 hover:scale-[1.03] hover:bg-violet-500 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
              >
                Save token
              </button>
              <button
                type="button"
                onClick={() => {
                  setToken('');
                  setNotice('');
                }}
                disabled={!token}
                className="rounded-xl border border-slate-700 px-5 py-2.5 text-sm text-slate-300 transition-all duration-200 hover:border-slate-500 hover:bg-slate-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Clear
              </button>
            </div>

            {notice && (
              <div className="mt-4 rounded-lg border border-sky-900/60 bg-sky-950/40 px-4 py-2 text-sm text-sky-300">
                {notice}
              </div>
            )}
          </form>

          <p className="mt-5 border-t border-slate-800 pt-4 text-xs text-slate-500">
            Treat your token like a password and never share it.
          </p>
        </section>
      </main>
    </div>
  );
}