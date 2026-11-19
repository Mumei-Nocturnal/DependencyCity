import City3D from '../components/City3D';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api';

export default function Dashboard() {
  const [user, setUser] = useState(null);
  const [githubUrl, setGithubUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [repos, setRepos] = useState([]);
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

  if (!user) return <p>Loading...</p>;

  const nodes = result?.city?.nodes || [];
  const edges = result?.city?.edges || [];

  return (
    <div style={{ maxWidth: 640, margin: '40px auto', padding: '0 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <h2>Dashboard</h2>
        <button onClick={logout}>Logout</button>
      </div>
      <p>Logged in as: {user.email}</p>

      <h3>Analyze a GitHub repository</h3>
      <form onSubmit={handleAnalyze} style={{ display: 'flex', gap: 8 }}>
        <input
          type="url"
          placeholder="https://github.com/owner/repo"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          required
          style={{ flex: 1 }}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Analyzing...' : 'Analyze'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}

      {result && (
        <div style={{ marginTop: 20, padding: 12, border: '1px solid #ccc' }}>
          <h4>{result.repository.owner}/{result.repository.repo_name}</h4>
          <p>{result.repository.description || 'No description'}</p>
          <p>
            Language: {result.repository.language || 'n/a'} | Stars: {result.repository.stars} |
            Files: {result.repository.file_count} | Branch: {result.repository.default_branch}
          </p>
          {result.truncated && <p>Note: the file tree was too large and was truncated by GitHub.</p>}

          {/* ---------- City section (new) ---------- */}
          <h4>City</h4>
          <p>
            <strong>Buildings:</strong> {nodes.length} | <strong>Roads:</strong> {edges.length}
          </p>
          {nodes.length === 0 ? (
            <p>No code files were found to build a city.</p>
          ) : (
            <ul>
              {nodes.map((node) => (
                <li key={node.id}>
                  {node.file_name} (complexity: {node.complexity})
                </li>
              ))}
            </ul>
          )}

          {nodes.length > 0 && <City3D nodes={nodes} edges={edges} />}
          {/* ---------- end of City section ---------- */}
          <details>
            <summary>File tree (first 50 files)</summary>
            <ul style={{ maxHeight: 250, overflow: 'auto' }}>
              {result.fileTree
                .filter((f) => f.type === 'file')
                .slice(0, 50)
                .map((f) => <li key={f.path}>{f.path}</li>)}
            </ul>
          </details>
        </div>
      )}

      <h3>Previously analyzed</h3>
      {repos.length === 0 ? (
        <p>No repositories yet.</p>
      ) : (
        <ul>
          {repos.map((r) => (
            <li key={r.id}>
              {r.owner}/{r.repo_name} ({r.file_count} files), analyzed{' '}
              {new Date(r.analyzed_at).toLocaleString()}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}