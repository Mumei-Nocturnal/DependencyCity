const express = require('express');
const axios = require('axios');
const path = require('path');
const pool = require('../db');

const router = express.Router();

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DependencyCity',
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    }),
  },
});

// ---------- Settings ----------
const MAX_NODES = 15;
const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs'];
const IGNORED_DIRS = ['node_modules/', 'dist/', 'build/', 'coverage/', '.git/'];
const MAX_FILE_SIZE = 200 * 1024; // skip files bigger than 200 KB
const MAP_RANGE = 50;             // X and Y are picked between -50 and 50
const MIN_DISTANCE = 10;          // minimum gap between two nodes

// ---------- Helpers ----------
function parseGithubUrl(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname !== 'github.com' && u.hostname !== 'www.github.com') return null;
    const [owner, repoRaw] = u.pathname.split('/').filter(Boolean);
    if (!owner || !repoRaw) return null;
    return { owner, repo: repoRaw.replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

// First 15 source code files from the tree
function pickCodeFiles(fileTree) {
  return fileTree
    .filter((f) => f.type === 'file')
    .filter((f) => CODE_EXTENSIONS.includes(path.posix.extname(f.path)))
    .filter((f) => !IGNORED_DIRS.some((d) => f.path.startsWith(d) || f.path.includes('/' + d)))
    .filter((f) => f.size <= MAX_FILE_SIZE)
    .slice(0, MAX_NODES);
}

async function fetchFileContent(owner, repo, branch, filePath) {
  try {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodedPath}`;
    const { data } = await axios.get(url, {
      responseType: 'text',
      transformResponse: (d) => d, // keep it as plain text, no JSON parsing
      timeout: 10000,
    });
    return typeof data === 'string' ? data : '';
  } catch {
    return ''; // if one file fails, the node is still created
  }
}

// Simple complexity score: 1 + number of branching keywords/operators
function calcComplexity(code) {
  if (!code) return 1;
  const matches = code.match(/\b(if|for|while|case|catch)\b|&&|\|\|/g);
  return 1 + (matches ? matches.length : 0);
}

// Random X/Y positions that keep a minimum distance from each other
function generatePositions(count) {
  const points = [];
  for (let i = 0; i < count; i++) {
    let p;
    let attempts = 0;
    do {
      p = {
        x: Math.round((Math.random() * 2 - 1) * MAP_RANGE * 10) / 10,
        y: Math.round((Math.random() * 2 - 1) * MAP_RANGE * 10) / 10,
      };
      attempts++;
    } while (
      attempts < 200 &&
      points.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < MIN_DISTANCE)
    );
    points.push(p);
  }
  return points;
}

// Relative imports found in a file's code
function extractImports(code) {
  const specs = new Set();
  const patterns = [
    /import\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,   // import X from './X'
    /export\s+[^'"]*?from\s+['"]([^'"]+)['"]/g,   // export { X } from './X'
    /import\s+['"]([^'"]+)['"]/g,                 // import './styles.css'
    /require\(\s*['"]([^'"]+)['"]\s*\)/g,         // require('./X')
    /import\(\s*['"]([^'"]+)['"]\s*\)/g,          // import('./X')
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) specs.add(m[1]);
  }
  return [...specs].filter((s) => s.startsWith('.')); // only local files
}

// './components/Navbar' -> 'src/components/Navbar.jsx' (if it is one of the nodes)
function resolveImport(fromPath, spec, nodeByPath) {
  const base = path.posix.join(path.posix.dirname(fromPath), spec);
  const candidates = [base];
  for (const ext of CODE_EXTENSIONS) candidates.push(base + ext);
  for (const ext of CODE_EXTENSIONS) candidates.push(`${base}/index${ext}`);
  return candidates.find((c) => nodeByPath.has(c)) || null;
}

// Creates nodes and edges for one repository (runs inside a transaction)
async function buildCity(client, repoId, files, contents) {
  // Re-analysis: remove the old city (edges are removed by CASCADE)
  await client.query('DELETE FROM city_nodes WHERE repo_id = $1', [repoId]);

  const positions = generatePositions(files.length);
  const nodes = [];
  const nodeByPath = new Map(); // file_path -> node id

  for (let i = 0; i < files.length; i++) {
    const filePath = files[i].path;
    const { rows } = await client.query(
      `INSERT INTO city_nodes (repo_id, file_path, file_name, complexity, position_x, position_y)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, file_path, file_name, complexity, position_x, position_y`,
      [repoId, filePath, path.posix.basename(filePath), calcComplexity(contents[i]),
       positions[i].x, positions[i].y]
    );
    nodes.push(rows[0]);
    nodeByPath.set(filePath, rows[0].id);
  }

  const edges = [];
  const seen = new Set();

  for (let i = 0; i < files.length; i++) {
    const sourceId = nodeByPath.get(files[i].path);

    for (const spec of extractImports(contents[i])) {
      const targetPath = resolveImport(files[i].path, spec, nodeByPath);
      if (!targetPath) continue;

      const targetId = nodeByPath.get(targetPath);
      const key = `${sourceId}-${targetId}`;
      if (targetId === sourceId || seen.has(key)) continue;
      seen.add(key);

      const { rows } = await client.query(
        `INSERT INTO city_edges (repo_id, source_node_id, target_node_id)
         VALUES ($1, $2, $3)
         RETURNING id, source_node_id, target_node_id`,
        [repoId, sourceId, targetId]
      );
      edges.push(rows[0]);
    }
  }

  return { nodes, edges };
}

// ---------- POST /api/repo/analyze ----------
router.post('/analyze', async (req, res) => {
  const { githubUrl } = req.body;

  if (!githubUrl) {
    return res.status(400).json({ error: 'githubUrl is required' });
  }

  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) {
    return res.status(400).json({ error: 'Invalid GitHub repository URL' });
  }
  const { owner, repo } = parsed;

  let client;
  try {
    // 1. Metadata + file tree from GitHub
    const { data: meta } = await github.get(`/repos/${owner}/${repo}`);
    const { data: treeData } = await github.get(
      `/repos/${owner}/${repo}/git/trees/${meta.default_branch}`,
      { params: { recursive: 1 } }
    );

    const fileTree = treeData.tree.map((item) => ({
      path: item.path,
      type: item.type === 'tree' ? 'dir' : 'file',
      size: item.size || 0,
    }));
    const fileCount = fileTree.filter((i) => i.type === 'file').length;

    // 2. Pick the first 15 code files and download their content
    const files = pickCodeFiles(fileTree);
    const contents = await Promise.all(
      files.map((f) => fetchFileContent(owner, repo, meta.default_branch, f.path))
    );

    // 3. Save everything in one transaction (all saved, or nothing saved)
    client = await pool.connect();
    await client.query('BEGIN');

    const repoResult = await client.query(
      `INSERT INTO repositories
         (user_id, owner, repo_name, repo_url, description, language, stars,
          default_branch, file_count, file_tree, analyzed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
       ON CONFLICT (user_id, repo_url) DO UPDATE SET
         description = EXCLUDED.description,
         language = EXCLUDED.language,
         stars = EXCLUDED.stars,
         default_branch = EXCLUDED.default_branch,
         file_count = EXCLUDED.file_count,
         file_tree = EXCLUDED.file_tree,
         analyzed_at = now()
       RETURNING id, owner, repo_name, repo_url, description, language, stars,
                 default_branch, file_count, analyzed_at`,
      [
        req.user.id, owner, meta.name, meta.html_url, meta.description,
        meta.language, meta.stargazers_count, meta.default_branch,
        fileCount, JSON.stringify(fileTree),
      ]
    );
    const repository = repoResult.rows[0];

    const city = await buildCity(client, repository.id, files, contents);

    await client.query('COMMIT');

    res.status(201).json({
      repository,
      truncated: treeData.truncated,
      fileTree,
      city, // { nodes: [...], edges: [...] }
    });
  } catch (err) {
    if (client) await client.query('ROLLBACK').catch(() => {});

    if (err.response) {
      const status = err.response.status;
      if (status === 404) {
        return res.status(404).json({ error: 'Repository not found (or it is private)' });
      }
      if (status === 403 || status === 429) {
        return res.status(429).json({ error: 'GitHub rate limit reached. Add a GITHUB_TOKEN to .env' });
      }
      if (status === 409) {
        return res.status(422).json({ error: 'Repository is empty' });
      }
    }
    console.error('Analyze error:', err.message);
    res.status(500).json({ error: 'Server error' });
  } finally {
    if (client) client.release();
  }
});

// ---------- GET /api/repo ----------
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.owner, r.repo_name, r.repo_url, r.language, r.stars,
              r.file_count, r.analyzed_at,
              (SELECT COUNT(*) FROM city_nodes n WHERE n.repo_id = r.id)::int AS node_count,
              (SELECT COUNT(*) FROM city_edges e WHERE e.repo_id = r.id)::int AS edge_count
       FROM repositories r
       WHERE r.user_id = $1
       ORDER BY r.analyzed_at DESC`,
      [req.user.id]
    );
    res.json({ repositories: result.rows });
  } catch (err) {
    console.error('List repos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET /api/repo/top-files (most complex files across all repos) ----------
router.get('/top-files', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.file_name, n.file_path, n.complexity,
              r.id AS repo_id, r.owner, r.repo_name
       FROM city_nodes n
       JOIN repositories r ON r.id = n.repo_id
       WHERE r.user_id = $1
       ORDER BY n.complexity DESC, r.repo_name, n.file_path
       LIMIT 5`,
      [req.user.id]
    );
    res.json({ files: result.rows });
  } catch (err) {
    console.error('Top files error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ---------- GET /api/repo/:id/city (load a saved city) ----------
router.get('/:id/city', async (req, res) => {
  const repoId = Number(req.params.id);
  if (!Number.isInteger(repoId)) {
    return res.status(400).json({ error: 'Invalid repository id' });
  }

  try {
    const repo = await pool.query(
      `SELECT id, owner, repo_name, repo_url, description, language, stars,
              default_branch, file_count, file_tree, analyzed_at
       FROM repositories WHERE id = $1 AND user_id = $2`,
      [repoId, req.user.id]
    );
    if (repo.rows.length === 0) {
      return res.status(404).json({ error: 'Repository not found' });
    }

    const nodes = await pool.query(
      `SELECT id, file_path, file_name, complexity, position_x, position_y
       FROM city_nodes WHERE repo_id = $1`,
      [repoId]
    );
    const edges = await pool.query(
      `SELECT id, source_node_id, target_node_id
       FROM city_edges WHERE repo_id = $1`,
      [repoId]
    );

    const { file_tree, ...repository } = repo.rows[0];

    res.json({
      repository,
      fileTree: file_tree || [],
      nodes: nodes.rows,
      edges: edges.rows,
    });
  } catch (err) {
    console.error('City error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;