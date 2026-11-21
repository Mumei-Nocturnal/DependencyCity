import { useState } from 'react';
import { Link } from 'react-router-dom';

// Put your background image in frontend/public/ (served from the site root)
const BG_IMAGE = '/city-bg.jpg';

const gradientText = {
  backgroundImage: 'linear-gradient(90deg, #a78bfa 0%, #818cf8 45%, #38bdf8 100%)',
  WebkitBackgroundClip: 'text',
  backgroundClip: 'text',
  color: 'transparent',
};

/* ---------- Icons ---------- */

function Icon({ children, className = 'h-6 w-6' }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
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

const CONCEPTS = [
  { from: 'Files', to: 'Buildings' },
  { from: 'Complexity', to: 'Height' },
  { from: 'Imports', to: 'Roads' },
];

/* ---------- Built-in neon skyline (shown until your image loads) ---------- */

const rand = (n) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function makeLayer(seed, minH, maxH) {
  const bars = [];
  let left = -1;
  let i = 0;
  while (left < 100) {
    const width = 2.2 + rand(seed + i * 3.1) * 3.2;
    bars.push({
      key: `${seed}-${i}`,
      left,
      width,
      height: minH + rand(seed + i * 7.7) * (maxH - minH),
      glow: rand(seed + i * 5.3) > 0.82,
    });
    left += width + rand(seed + i * 1.9) * 0.6;
    i += 1;
  }
  return bars;
}

const BACK_LAYER = makeLayer(11, 25, 62);
const FRONT_LAYER = makeLayer(47, 14, 46);

function Layer({ bars, dim }) {
  return (
    <div className="absolute inset-0">
      {bars.map((b) => (
        <div
          key={b.key}
          className="absolute bottom-0"
          style={{
            left: `${b.left}%`,
            width: `${b.width}%`,
            height: `${b.height}%`,
            opacity: dim ? 0.45 : 1,
          }}
        >
          <div
            className="absolute inset-0 rounded-t-sm"
            style={{
              backgroundImage:
                'repeating-linear-gradient(90deg, rgba(4,7,24,0.8) 0 4px, transparent 4px 8px), repeating-linear-gradient(0deg, rgba(125,211,252,0.3) 0 2px, transparent 2px 9px), linear-gradient(180deg, rgba(99,102,241,0.55), rgba(8,12,40,0.95))',
              border: '1px solid rgba(125,211,252,0.25)',
              borderBottom: 'none',
              boxShadow: dim ? 'none' : '0 0 24px rgba(56,189,248,0.18)',
            }}
          />
          {b.glow && (
            <div className="absolute -top-px left-1/4 right-1/4 h-0.5 animate-pulse rounded-full bg-fuchsia-400" />
          )}
        </div>
      ))}
    </div>
  );
}

function FallbackCity() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
      {/* Night sky */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 80% 60% at 70% 100%, rgba(124,58,237,0.45), transparent 60%), linear-gradient(180deg, #02030c 0%, #070b24 55%, #0d1240 100%)',
        }}
      />
      {/* Skyline */}
      <div className="absolute inset-x-0 bottom-[20%] h-[62%]">
        <Layer bars={BACK_LAYER} dim />
        <Layer bars={FRONT_LAYER} />
      </div>
      {/* Horizon line */}
      <div
        className="absolute inset-x-0 bottom-[20%] h-px"
        style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(56,189,248,0.8), transparent)' }}
      />
      {/* Neon floor grid */}
      <div className="absolute inset-x-0 bottom-0 h-[20%] overflow-hidden" style={{ perspective: '420px' }}>
        <div
          className="absolute inset-x-[-50%] top-0 h-[300%] origin-top"
          style={{
            transform: 'rotateX(62deg)',
            backgroundImage:
              'linear-gradient(rgba(56,189,248,0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(56,189,248,0.35) 1px, transparent 1px)',
            backgroundSize: '56px 56px',
            maskImage: 'linear-gradient(180deg, black, transparent 85%)',
            WebkitMaskImage: 'linear-gradient(180deg, black, transparent 85%)',
          }}
        />
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function Landing() {
  const [imgOk, setImgOk] = useState(true);

  const scrollToFeatures = () =>
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#050816] text-slate-100">
      {/* Header: glass bar floating over the hero */}
      <header className="fixed inset-x-0 top-0 z-30 border-b border-white/10 bg-slate-950/40 backdrop-blur-xl">
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
              className="rounded-lg border border-white/15 bg-white/10 px-3.5 py-1.5 text-sm text-slate-100 transition-all duration-200 hover:border-violet-400/60 hover:bg-white/15 active:scale-95"
            >
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- Full-screen hero ---------- */}
      <section className="relative isolate flex min-h-screen items-center overflow-hidden">
        {/* Background: image (or built-in skyline) + dark overlay + slight blur */}
        <div className="absolute inset-0 -z-10">
          <FallbackCity />

          {imgOk && (
            <img
              src={BG_IMAGE}
              alt=""
              aria-hidden="true"
              fetchPriority="high"
              decoding="async"
              onError={() => setImgOk(false)}
              className="absolute inset-0 h-full w-full scale-105 object-cover blur-[3px]"
            />
          )}

          {/* Dark overlay: strongest behind the text on the left */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(90deg, rgba(5,8,22,0.93) 0%, rgba(5,8,22,0.78) 45%, rgba(5,8,22,0.5) 100%)',
            }}
          />
          {/* Fade at the top and bottom edges */}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                'linear-gradient(180deg, rgba(5,8,22,0.55) 0%, transparent 30%, transparent 70%, #050816 100%)',
            }}
          />
          {/* Violet glow */}
          <div className="absolute -left-32 top-1/4 h-96 w-96 rounded-full bg-violet-600/25 blur-3xl" />
        </div>

        {/* Content */}
        <div className="mx-auto w-full max-w-6xl px-4 pb-24 pt-28 sm:pb-40">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/10 px-3.5 py-1.5 text-xs font-medium text-violet-200 backdrop-blur">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-400" />
              </span>
              Code architecture, made visible
            </div>

            <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl">
              Visualize Software Dependencies as a <span style={gradientText}>3D City</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300 sm:text-xl">
              Paste a GitHub repository and watch its files rise as glowing towers. Roads show
              which files import each other, and height shows complexity, so you can understand a
              whole codebase at a glance.
            </p>

            <div className="mt-10 flex flex-wrap items-center gap-4">
              <Link
                to="/login"
                className="group inline-flex items-center gap-2.5 rounded-xl bg-violet-600 px-8 py-4 text-base font-semibold text-white shadow-[0_0_40px_-6px_rgba(139,92,246,0.8)] ring-1 ring-white/20 transition-all duration-200 hover:scale-105 hover:bg-violet-500 hover:shadow-[0_0_56px_-4px_rgba(139,92,246,1)] active:scale-95"
              >
                Get Started
                <svg
                  className="h-5 w-5 transition-transform duration-200 group-hover:translate-x-1"
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
                className="rounded-xl border border-white/15 bg-white/5 px-7 py-4 text-base font-semibold text-slate-100 backdrop-blur transition-all duration-200 hover:border-white/30 hover:bg-white/10 active:scale-95"
              >
                See how it works
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
        </div>

        {/* Bottom strip: how the city works (large screens) */}
        <div className="absolute inset-x-0 bottom-0 hidden pb-8 sm:block">
          <div className="mx-auto grid max-w-6xl grid-cols-3 gap-4 px-4">
            {CONCEPTS.map((c) => (
              <div
                key={c.from}
                className="flex items-center justify-center gap-3 rounded-2xl border border-white/10 bg-slate-950/40 px-4 py-3 text-sm backdrop-blur-md"
              >
                <span className="text-slate-300">{c.from}</span>
                <span className="text-violet-400">→</span>
                <span className="font-semibold text-slate-100">{c.to}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-24">
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

      <footer className="border-t border-white/10 py-6 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} DependencyCity
      </footer>
    </div>
  );
}