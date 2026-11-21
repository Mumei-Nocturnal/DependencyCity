import { Link, useNavigate } from 'react-router-dom';

export default function AppHeader({ email, onLogout }) {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');

  const handleLogout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userEmail');
  navigate('/', { replace: true }); 
};

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/50 shadow-[0_1px_0_0_rgba(255,255,255,0.04)] backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link to="/dashboard" className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-sm font-bold shadow-lg shadow-violet-900/40 ring-1 ring-white/20">
            D
          </span>
          <span className="text-lg font-semibold tracking-tight">DependencyCity</span>
        </Link>

        <nav className="flex items-center gap-6">
          <Link to="/dashboard" className="text-sm text-slate-300 hover:text-white transition">
            Dashboard
          </Link>
          <Link to="/analytics" className="text-sm text-slate-300 hover:text-white transition">
            Analytics
          </Link>
          <Link to="/settings" className="text-sm text-slate-300 hover:text-white transition">
            Settings
          </Link>
          
          <div className="flex items-center gap-3 border-l border-slate-700 pl-4">
            <span className="max-w-[140px] truncate text-sm text-slate-400">
              {email || 'User'}
            </span>
            <button
              onClick={handleLogout}
              className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-200 transition-all duration-200 hover:border-white/25 hover:bg-white/10 active:scale-95"
            >
              Logout
            </button>
          </div>
        </nav>
      </div>
    </header>
  );
}