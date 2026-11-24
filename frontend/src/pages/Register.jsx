import { useMemo, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';

const REGISTER_URL = 'http://localhost:5000/api/auth/register';

/* ---------- Icons ---------- */

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
const CheckIcon = ({ className = 'h-3.5 w-3.5' }) => (
  <Icon className={className}>
    <polyline points="20 6 9 17 4 12" />
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

/* ---------- Form pieces ---------- */

function Field({ id, label, type = 'text', icon, ...props }) {
  const [show, setShow] = useState(false);
  const isPassword = type === 'password';

  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">
        {label}
      </label>
      <div className="group relative">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 transition-colors duration-200 group-focus-within:text-violet-400">
          {icon}
        </span>
        <input
          id={id}
          type={isPassword && show ? 'text' : type}
          className={`w-full rounded-xl border border-slate-700 bg-slate-950/60 py-3 pl-11 text-sm text-slate-100 placeholder-slate-500 outline-none transition-all duration-200 hover:border-slate-600 focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30 disabled:opacity-60 ${
            isPassword ? 'pr-16' : 'pr-4'
          }`}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md px-1.5 py-1 text-xs font-medium text-slate-400 transition-colors duration-200 hover:text-violet-300"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ---------- Password strength ---------- */

function getStrength(pw) {
  if (!pw) return { level: 0, label: '' };
  if (pw.length < 8) return { level: 1, label: 'Too short' };

  const classes =
    Number(/[a-z]/.test(pw)) +
    Number(/[A-Z]/.test(pw)) +
    Number(/\d/.test(pw)) +
    Number(/[^A-Za-z0-9]/.test(pw)) +
    Number(pw.length >= 12);

  if (classes <= 1) return { level: 1, label: 'Weak' };
  if (classes === 2) return { level: 2, label: 'Fair' };
  if (classes === 3) return { level: 3, label: 'Good' };
  return { level: 4, label: 'Strong' };
}

const BAR_COLORS = ['', 'bg-red-500', 'bg-amber-400', 'bg-sky-400', 'bg-emerald-400'];
const TEXT_COLORS = ['', 'text-red-400', 'text-amber-300', 'text-sky-300', 'text-emerald-300'];

function StrengthMeter({ password }) {
  const { level, label } = useMemo(() => getStrength(password), [password]);

  const checks = [
    { ok: password.length >= 8, text: 'At least 8 characters', required: true },
    { ok: /[a-z]/.test(password) && /[A-Z]/.test(password), text: 'Upper and lowercase' },
    { ok: /\d/.test(password), text: 'A number' },
    { ok: /[^A-Za-z0-9]/.test(password), text: 'A symbol' },
  ];

  return (
    <div className="mt-3">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                i <= level ? BAR_COLORS[level] : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
        <span className={`w-16 text-right text-xs font-medium ${TEXT_COLORS[level] || 'text-slate-500'}`}>
          {label || 'Strength'}
        </span>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5">
        {checks.map((c) => (
          <li
            key={c.text}
            className={`flex items-center gap-1.5 text-xs transition-colors duration-200 ${
              c.ok ? 'text-emerald-300' : 'text-slate-500'
            }`}
          >
            <span
              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors duration-200 ${
                c.ok ? 'border-emerald-400/60 bg-emerald-400/15' : 'border-slate-700'
              }`}
            >
              {c.ok && <CheckIcon className="h-2.5 w-2.5" />}
            </span>
            {c.text}
            {c.required && <span className="text-slate-600">(required)</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Register() {
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(false);

  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const passwordOk = password.length >= 8;
  const matches = confirm.length > 0 && password === confirm;
  const canSubmit = emailOk && passwordOk && matches && !loading;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;

    setError('');
    setExists(false);
    setLoading(true);

    try {
      await axios.post(REGISTER_URL, { email: email.trim(), password });
      navigate('/login', { replace: true, state: { registered: true } });
    } catch (err) {
      if (err.response) {
        setExists(err.response.status === 409);
        setError(err.response.data?.error || 'Could not create your account. Please try again.');
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
        <div className="absolute left-1/2 top-1/2 h-[560px] w-[560px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet-600/30 blur-[130px]" />
        <div className="absolute -left-24 top-10 h-80 w-80 rounded-full bg-sky-500/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-indigo-600/25 blur-3xl" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 65% 65% at 50% 50%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 65% 65% at 50% 50%, black, transparent)',
          }}
        />
      </div>

      {/* Ab yeh poori screen ke center mein ek hi column (card) hai */}
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
            <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
            <p className="mt-1.5 text-sm text-slate-400">
              Start turning codebases into cities. It only takes a moment.
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <Field
                id="email"
                label="Email"
                type="email"
                icon={<MailIcon />}
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
                disabled={loading}
              />

              <div>
                <Field
                  id="password"
                  label="Password"
                  type="password"
                  icon={<LockIcon />}
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={loading}
                />
                <StrengthMeter password={password} />
              </div>

              <div>
                <Field
                  id="confirm"
                  label="Confirm password"
                  type="password"
                  icon={<LockIcon />}
                  placeholder="Repeat your password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  required
                  disabled={loading}
                />
                {confirm.length > 0 && (
                  <p
                    className={`mt-1.5 flex items-center gap-1.5 text-xs ${
                      matches ? 'text-emerald-300' : 'text-red-400'
                    }`}
                  >
                    {matches ? (
                      <>
                        <CheckIcon /> Passwords match
                      </>
                    ) : (
                      'Passwords do not match yet'
                    )}
                  </p>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-2.5 text-sm text-red-300"
                >
                  {error}
                  {exists && (
                    <>
                      {' '}
                      <Link to="/login" className="font-medium text-violet-300 underline underline-offset-2">
                        Sign in instead
                      </Link>
                    </>
                  )}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit}
                className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-200 hover:scale-[1.02] hover:bg-violet-500 hover:shadow-violet-600/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100 disabled:hover:bg-violet-600"
              >
                {loading && <Spinner />}
                {loading ? 'Creating account...' : 'Create account'}
              </button>
            </form>
          </div>
        </div>

        {/* Links under the card */}
        <div className="mt-6 space-y-3 text-center text-sm text-slate-400">
          <p>
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-violet-400 transition-colors duration-200 hover:text-violet-300"
            >
              Sign in
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