import { lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';

// Loaded on demand, so the hero text appears instantly while the 3D code downloads
const CityPreview = lazy(() => import('../components/CityPreview'));

const gradientText = {
  backgroundImage: 'linear-gradient(90deg, #a78bfa 0%, #818cf8 45%, #38bdf8 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

function Icon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-6 w-6"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const FEATURES = [
  {
    title: 'GitHub Integration',
    text: 'Paste any public repository URL. We read its file tree and metadata straight from the GitHub API, with no cloning and no setup.',
    icon: (
      <Icon>
        <line x1="6" y1="3" x2="6" y2="15" />
        <circle cx="18" cy="6" r="3" />
        <circle cx="6" cy="18" r="3" />
        <path d="M18 9a9 9 0 0 1-9 9" />
      </Icon>
    ),
  },
  {
    title: 'Real-time 3D View',
    text: 'Explore an interactive city right in your browser. Rotate, zoom and click any building to inspect a file. Taller towers mean more complex code.',
    icon: (
      <Icon>
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
        <line x1="12" y1="22.08" x2="12" y2="12" />
      </Icon>
    ),
  },
  {
    title: 'Dependency Mapping',
    text: 'Every import and require becomes a glowing road, so you can see at a glance which files depend on each other.',
    icon: (
      <Icon>
        <circle cx="18" cy="5" r="3" />
        <circle cx="6" cy="12" r="3" />
        <circle cx="18" cy="19" r="3" />
        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
      </Icon>
    ),
  },
];

const CHIPS = ['Public GitHub repos', 'JavaScript & TypeScript', 'Interactive 3D'];

export default function Landing() {
  const scrollToFeatures = () =>
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="relative isolate min-h-screen overflow-x-hidden bg-[#050816] text-slate-100">
      {/* Background: soft glows + faint grid */}
      <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[480px] w-[480px] rounded-full bg-violet-600/25 blur-3xl" />
        <div className="absolute -right-24 top-24 h-[420px] w-[420px] rounded-full bg-sky-500/15 blur-3xl" />
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 55% at 50% 25%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(ellipse 70% 55% at 50% 25%, black, transparent)',
          }}
        />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-[#050816]/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold shadow-lg shadow-violet-900/40 ring-1 ring-white/20">
              D
            </span>
            <span className="text-lg font-semibold tracking-tight">DependencyCity</span>
          </Link>

          <nav className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={scrollToFeatures}
              className="hidden rounded-lg px-3 py-1.5 text-sm text-slate-300 transition hover:text-white sm:block"
            >
              Features
            </button>
            <Link
              to="/login"
              className="rounded-lg px-3 py-1.5 text-sm text-slate-300 transition hover:text-white"
            >
              Login
            </Link>
            <Link
              to="/register"
              className="rounded-lg border border-white/10 bg-white/5 px-3.5 py-1.5 text-sm text-slate-100 transition-all duration-200 hover:border-violet-400/50 hover:bg-white/10 active:scale-95"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-14 lg:grid-cols-2 lg:pt-24">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-medium text-violet-200">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
              </span>
              Code architecture, made visible
            </div>

            <h1 className="mt-6 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
              Visualize Software Dependencies as a <span style={gradientText}>3D City</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-400">
              Paste a GitHub repository and watch its files rise as glowing towers. Roads show
              which files import each other, and building height shows complexity, so you can
              understand a whole codebase at a glance.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                to="/login"
                className="group inline-flex items-center gap-2 rounded-xl bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-900/40 transition-all duration-200 hover:scale-[1.03] hover:bg-violet-500 hover:shadow-violet-600/40 active:scale-[0.97]"
              >
                Get Started
                <svg
                  className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 10a.75.75 0 01.75-.75h10.69l-3.22-3.22a.75.75 0 111.06-1.06l4.5 4.5a.75.75 0 010 1.06l-4.5 4.5a.75.75 0 11-1.06-1.06l3.22-3.22H3.75A.75.75 0 013 10z"
                    clipRule="evenodd"
                  />
                </svg>
              </Link>
              <button
                onClick={scrollToFeatures}
                className="rounded-xl border border-white/10 bg-white/5 px-6 py-3 text-sm font-semibold text-slate-200 transition-all duration-200 hover:border-white/25 hover:bg-white/10 active:scale-[0.97]"
              >
                Explore features
              </button>
            </div>

            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-400">
              {CHIPS.map((chip) => (
                <li key={chip} className="flex items-center gap-2">
                  <svg className="h-4 w-4 text-sky-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path
                      fillRule="evenodd"
                      d="M16.7 5.3a1 1 0 010 1.4l-7.5 7.5a1 1 0 01-1.4 0L3.3 9.7a1 1 0 011.4-1.4l3.8 3.8 6.8-6.8a1 1 0 011.4 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {chip}
                </li>
              ))}
            </ul>
          </div>

          {/* Live 3D preview */}
          <div className="relative">
            <div
              className="absolute -inset-2 rounded-[28px] opacity-60 blur-2xl"
              style={{ backgroundImage: 'linear-gradient(135deg, rgba(124,58,237,0.5), rgba(56,189,248,0.35))' }}
            />
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-2xl">
              <div className="h-[380px] sm:h-[460px] lg:h-[520px]">
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center text-sm text-slate-500">
                      Loading 3D preview...
                    </div>
                  }
                >
                  <CityPreview />
                </Suspense>
              </div>

              {/* Overlays (do not block dragging) */}
              <div className="pointer-events-none absolute left-4 top-4 flex items-center gap-2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-300 backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Live preview
              </div>
              <div className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full border border-white/10 bg-slate-950/70 px-3 py-1 text-xs text-slate-400 backdrop-blur">
                Drag to rotate · hover or click a building
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 pb-24">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Understand a codebase <span style={gradientText}>at a glance</span>
            </h2>
            <p className="mt-4 text-slate-400">
              Stop scrolling through folders. See the shape of your project instead.
            </p>
          </div>

          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-violet-500/40 hover:bg-white/[0.06] hover:shadow-[0_10px_40px_-15px_rgba(139,92,246,0.6)]"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-500/30 bg-violet-500/10 text-violet-300 transition-colors duration-300 group-hover:text-sky-300">
                  {f.icon}
                </div>
                <h3 className="mt-5 text-lg font-semibold">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{f.text}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} DependencyCity
      </footer>
    </div>
  );
}