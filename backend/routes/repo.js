const express = require('express');
const axios = require('axios');
const pool = require('../db');

const router = express.Router();

const github = axios.create({
  baseURL: 'https://api.github.com',
  headers: {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'DependencyCity',
    // Optional: raises the rate limit from 60 to 5000 requests/hour
    ...(process.env.GITHUB_TOKEN && {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    }),
  },
});

// Extract owner and repo from URLs like:
// https://github.com/owner/repo, https://github.com/owner/repo.git, .../tree/main/src
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

// POST /api/repo/analyze
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

  try {
    // 1. Metadata
    const { data: meta } = await github.get(`/repos/${owner}/${repo}`);

    // 2. Full file tree (recursive)
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

    // 3. Save (insert, or update if this user already analyzed this repo)
    const result = await pool.query(
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
        req.user.id,
        owner,
        meta.name,
        meta.html_url,
        meta.description,
        meta.language,
        meta.stargazers_count,
        meta.default_branch,
        fileCount,
        JSON.stringify(fileTree),
      ]
    );

    res.status(201).json({
      repository: result.rows[0],
      truncated: treeData.truncated, // true if GitHub cut off a very large tree
      fileTree,
    });
  } catch (err) {
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
  }
});

// GET /api/repo  (the logged-in user's analyzed repositories)
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, owner, repo_name, repo_url, language, stars, file_count, analyzed_at
       FROM repositories WHERE user_id = $1 ORDER BY analyzed_at DESC`,
      [req.user.id]
    );
    res.json({ repositories: result.rows });
  } catch (err) {
    console.error('List repos error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;