import { useState } from 'react';
import axios from 'axios';
import { Link, useLocation, useNavigate } from 'react-router-dom';

const LOGIN_URL = 'http://localhost:5000/api/auth/login';

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

const MailIcon = () => (
  <Icon>
    <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
    <polyline points="22,6 12,13 2,6" />
  </Icon>
);

const LockIcon = () => (
  <Icon>
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </Icon>
);

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const inputClass =
  'w-full rounded-xl border border-slate-700 bg-slate-950/60 py-3 pl-11 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 hover:border-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 disabled:opacity-60';

/* ---------- Page ---------- */

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const justRegistered = Boolean(location.state?.registered);

  // 1. State
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // 2. Submit handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading) return;

    setError('');
    setLoading(true);

    try {
      const res = await axios.post(LOGIN_URL, {
        email: email.trim(),
        password,
      });

      const { token, user } = res.data;
      if (!token) {
        setError('Login worked, but the server did not send a token.');
        return;
      }

      // 3. Save the session and go to the dashboard
      localStorage.setItem('token', token);
      localStorage.setItem('userEmail', user?.email || email.trim());
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // 4. Show the error
      if (err.response) {
        setError(err.response.data?.error || 'Login failed. Please try again.');
      } else {
        setError('Cannot reach the server. Is the backend running on port 5000?');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative isolate flex min-h-screen items-center justify-center overflow-hidden bg-[#050816] px-4 py-10 text-slate-100">
      {/* Background: blurred gradient glows + faint grid */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/30 blur-[120px]" />
        <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 60% 60% at 50% 50%, black, transparent)',
          }}
        />
      </div>

      <div className="w-full max-w-md">
        {/* Logo */}
        <Link to="/" className="mb-6 flex items-center justify-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-base font-bold shadow-lg shadow-violet-900/40 ring-1 ring-white/20">
            D
          </span>
          <span className="text-xl font-semibold tracking-tight">DependencyCity</span>
        </Link>

        {/* Glass card with a thin gradient border */}
        <div
          className="rounded-2xl p-px shadow-[0_20px_80px_-20px_rgba(139,92,246,0.5)]"
          style={{
            backgroundImage:
              'linear-gradient(135deg, rgba(139,92,246,0.55), rgba(56,189,248,0.25) 50%, rgba(255,255,255,0.06))',
          }}
        >
          <div className="rounded-2xl bg-slate-950/70 p-8 backdrop-blur-xl">
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Sign in to explore your repositories as a 3D city.
            </p>

            {/* The form: the submit button below triggers handleSubmit */}
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {justRegistered && !error && (
                <div className="rounded-lg border border-emerald-900/60 bg-emerald-950/40 px-4 py-2.5 text-sm text-emerald-300">
                  Account created. Please sign in.
                </div>
              )}

              {/* Email (connected to state) */}
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Email
                </label>
                <div className="group relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors duration-200 group-focus-within:text-violet-400">
                    <MailIcon />
                  </span>
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    required
                    disabled={loading}
                    className={`${inputClass} pr-4`}
                  />
                </div>
              </div>

              {/* Password (connected to state) */}
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-300">
                  Password
                </label>
                <div className="group relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors duration-200 group-focus-within:text-violet-400">
                    <LockIcon />
                  </span>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Your password"
                    autoComplete="current-password"
                    required
                    disabled={loading}
                    className={`${inputClass} pr-16`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs font-medium text-slate-400 transition-colors duration-200 hover:text-violet-300"
                  >
                    {showPassword ? 'Hide' : 'Show'}
                  </button>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2.5 text-sm text-red-300"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-200 hover:scale-[1.02] hover:bg-violet-500 hover:shadow-violet-600/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:scale-100"
              >
                {loading && <Spinner />}
                {loading ? 'Signing in...' : 'Sign in'}
              </button>
            </form>
          </div>
        </div>

        {/* Links under the card */}
        <div className="mt-6 space-y-3 text-center text-sm text-slate-400">
          <p>
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-medium text-violet-400 transition-colors duration-200 hover:text-violet-300"
            >
              Create one
            </Link>
          </p>
          <p>
            <Link to="/" className="text-slate-500 transition-colors duration-200 hover:text-slate-300">
              ← Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}