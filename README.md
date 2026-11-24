# DependencyCity

**DependencyCity turns a GitHub repository into an interactive 3D city.** Every source file becomes a building, its height shows how complex the code is, folders become districts, and glowing roads show which files import each other. A 2D force-directed graph gives you a second view of the same data.

<!-- Add screenshots here, for example:
![3D city](docs/city.png)
![2D graph](docs/graph.png)
-->

## Features

### Accounts and security
- Register and log in with email and password. Passwords are hashed with bcrypt and sessions use JWT.
- Protected routes on both sides: the backend checks the token on every repository request, and the frontend redirects to the login page when there is no token.
- Logout clears the session and replaces the history entry, so the Back button cannot return to a protected page.

### Analysis
- Paste a **public GitHub repository URL**. The backend reads its metadata (description, language, stars, default branch) and file tree from the GitHub API.
- A parsing engine picks the first 15 source files (`.js`, `.jsx`, `.ts`, `.tsx`, `.mjs`, `.cjs`), downloads them and:
  - calculates a **complexity score** (1 plus the number of branching statements and operators),
  - finds **dependencies** by reading `import`, `export ... from`, `require()` and dynamic `import()` statements that point to other analyzed files.
- Everything is stored in PostgreSQL, so you can reopen a repository later without calling GitHub again.

### 3D city
- **Districts:** files are grouped by folder. Each folder gets its own zone with a glowing boundary and a label such as `src/components`, with empty space between zones.
- **Buildings:** each file is a glass skyscraper with a window grid and neon trim. Height is proportional to complexity, and the tallest files stand in the middle of their district. Shapes vary (slabs, setbacks, pyramid tops, stepped towers, clusters, low-rise blocks).
- **Roads:** every import is a bright road routed around the buildings, with a pulse that travels from the importing file to the imported file.
- **Interaction:** drag to rotate, scroll to zoom, right-drag to pan. Hover brightens a building and click turns it gold and shows its path, complexity, imports and importers. File names appear on hover, on selection, or when you zoom in close, and district labels are always visible.
- Dark tiled floor with reflections, soft bloom and floating particles.

### 2D dependency graph
- A force-directed graph of the same data, with circles sized by complexity and files tinted by folder.
- **Click a node** to highlight it in gold, the files it imports in pink, and the files that import it in sky blue. Everything else fades out. A file that does both is violet.
- Glowing magenta edges with directional pulses, truncated file names, and a color key and district legend.
- The imports and imported-by lists in the details panel are clickable, so you can walk the dependency chain.

### Pages
| Route | Page |
|---|---|
| `/` | Landing page with a full-screen hero and feature cards |
| `/login`, `/register` | Dark glass sign-in and sign-up forms (the sign-up form has a password strength meter) |
| `/dashboard` | Analyze a repository and open previously analyzed ones |
| `/repo/:id` | Repository analysis: stats, architecture overview, and the 3D city / 2D graph switcher with an expand mode |
| `/analytics` | Totals across all repositories and the top 5 most complex files |
| `/settings` | Account email (read-only) and a GitHub token form (interface only for now) |

## Tech Stack

| Layer | Technologies |
|---|---|
| Frontend | React (Vite), React Router, Axios, Tailwind CSS v4 |
| 3D | Three.js, React Three Fiber, `@react-three/drei`, `@react-three/postprocessing` |
| 2D graph | `react-force-graph-2d` |
| Backend | Node.js, Express, CORS, dotenv |
| Database | PostgreSQL (hosted on Supabase), `pg` |
| Auth | `jsonwebtoken`, `bcrypt` |
| Data source | GitHub REST API |

## Project Structure

```
DependencyCity/
├── backend/
│   ├── middleware/
│   │   └── auth.js              # JWT verification
│   ├── routes/
│   │   ├── auth.js              # register, login, me
│   │   └── repo.js              # analyze, list, top files, load saved city
│   ├── db.js                    # PostgreSQL connection pool
│   ├── server.js
│   └── .env                     # not committed
└── frontend/
    ├── public/
    │   └── city-bg.jpg          # optional landing page background image
    └── src/
        ├── components/
        │   ├── AppHeader.jsx        # shared navigation header
        │   ├── City3D.jsx           # 3D city
        │   ├── DependencyGraph.jsx  # 2D graph
        │   └── ProtectedRoute.jsx
        ├── hooks/
        │   └── useAuthUser.js
        ├── pages/
        │   ├── Landing.jsx
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Dashboard.jsx
        │   ├── RepoAnalysis.jsx
        │   ├── Analytics.jsx
        │   └── Settings.jsx
        ├── utils/
        │   └── fileLabels.js        # unique file labels like lib/index.js
        ├── api.js                   # Axios instance that adds the JWT header
        ├── App.jsx                  # routes
        └── index.css                # @import "tailwindcss";
```

## Getting Started

### Prerequisites

- Node.js 20.19+ or 22+ (the current LTS is recommended)
- A PostgreSQL database. This project uses [Supabase](https://supabase.com), but any PostgreSQL database works.
- Optional: a GitHub personal access token. It raises the API limit from 60 to 5,000 requests per hour, and no scopes are needed for public repositories.

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/DependencyCity.git
cd DependencyCity
```

### 2. Create the database tables

Run this SQL in your database (in Supabase, use the SQL Editor):

```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE repositories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  repo_url TEXT NOT NULL,
  description TEXT,
  language TEXT,
  stars INTEGER DEFAULT 0,
  default_branch TEXT,
  file_count INTEGER DEFAULT 0,
  file_tree JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, repo_url)
);

CREATE TABLE city_nodes (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  complexity INTEGER NOT NULL DEFAULT 1,
  position_x REAL NOT NULL,
  position_y REAL NOT NULL,
  UNIQUE (repo_id, file_path)
);

CREATE TABLE city_edges (
  id SERIAL PRIMARY KEY,
  repo_id INTEGER NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
  source_node_id INTEGER NOT NULL REFERENCES city_nodes(id) ON DELETE CASCADE,
  target_node_id INTEGER NOT NULL REFERENCES city_nodes(id) ON DELETE CASCADE,
  UNIQUE (source_node_id, target_node_id)
);
```

### 3. Run the backend

```bash
cd backend
npm install
```

Create `backend/.env`:

```env
PORT=5000
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/postgres
JWT_SECRET=replace_with_a_long_random_string
GITHUB_TOKEN=optional_github_token
```

Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Start the server:

```bash
npm run dev     # development (restarts automatically with nodemon)
# or
npm start       # production
```

The API runs at `http://localhost:5000`. Check it at `http://localhost:5000/api/health`.

### 4. Run the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the address shown in the terminal, usually `http://localhost:5173`. Register an account, log in, paste a public GitHub repository URL on the Dashboard and click **Analyze**.

> The frontend calls the backend at `http://localhost:5000`. If your backend runs somewhere else, change it in `frontend/src/api.js`, and in `Login.jsx` and `Register.jsx`, which contain the same address.

## API Reference

All `/api/repo` routes require the header `Authorization: Bearer <token>`.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| GET | `/api/health` | No | Health check |
| POST | `/api/auth/register` | No | Create an account |
| POST | `/api/auth/login` | No | Log in and receive a JWT |
| GET | `/api/auth/me` | Yes | The current user |
| POST | `/api/repo/analyze` | Yes | Analyze a repository from `{ "githubUrl": "..." }` and save its city |
| GET | `/api/repo` | Yes | List your analyzed repositories, with building and road counts |
| GET | `/api/repo/top-files` | Yes | The 5 most complex files across all your repositories |
| GET | `/api/repo/:id/city` | Yes | One saved repository with its buildings, roads and file tree |

## How It Works

1. The backend reads the repository metadata and the full file tree from the GitHub API.
2. It selects the first 15 source files, skipping `node_modules`, `dist`, `build`, `coverage`, `.git` and files over 200 KB.
3. It downloads those files and computes a complexity score for each: 1, plus one for every `if`, `for`, `while`, `case`, `catch`, `&&` and `||`.
4. Relative imports are resolved to other analyzed files and saved as edges (importer to imported).
5. Nodes and edges are stored in PostgreSQL.
6. The frontend groups the files into districts by folder, places the buildings, routes the roads around them and renders everything with React Three Fiber. The 2D graph uses the same data.

## Customizing

- **Number of files analyzed:** `MAX_NODES` in `backend/routes/repo.js` (default 15). Raise it for a bigger city, then analyze the repository again.
- **City layout and look:** the constants at the top of `City3D.jsx`: `SPREAD`, `DISTRICT_GAP`, `DISTRICT_PAD`, `MAX_H` (tallest building), `LABEL_NEAR_RATIO` (how close you must zoom for file names), and the floor and road brightness settings.
- **2D graph layout and colors:** the constants at the top of `DependencyGraph.jsx` (`CHARGE`, `LINK_EXTRA`, `MIN_R`, `MAX_R` and the color palette).
- **Landing background:** put your own image at `frontend/public/city-bg.jpg`.

## Known Limitations

- Only public repositories are supported.
- Only JavaScript and TypeScript files are analyzed, and only the first 15 of them.
- Only relative imports (`./` and `../`) create roads. Aliased imports such as `@/components/Navbar` are skipped.
- The complexity score is a simple heuristic, not a full cyclomatic analysis.
- The GitHub token form on the Settings page is an interface only. The token is not sent or stored yet, so the backend uses the optional `GITHUB_TOKEN` from `.env`.

## Troubleshooting

- **`ECONNREFUSED` or `ENOTFOUND` when connecting to Supabase:** use the **Session pooler** connection string instead of the direct connection, and URL-encode any special characters in the password.
- **`secretOrPrivateKey must have a value`:** `JWT_SECRET` is missing from `backend/.env`. Restart the server after adding it, because nodemon does not watch `.env`.
- **GitHub rate limit error:** add a `GITHUB_TOKEN` to `backend/.env` and restart the backend.
- **`bcrypt` fails to install on Windows:** run `npm uninstall bcrypt && npm install bcryptjs` and change `require('bcrypt')` to `require('bcryptjs')` in `routes/auth.js`.
- **`Cannot find native binding` when starting Vite:** the install was interrupted. Delete `node_modules` and `package-lock.json` in `frontend`, then run `npm install` again without pressing `Ctrl+C`.
- **Pages look unstyled:** check that `frontend/src/index.css` contains only `@import "tailwindcss";`, that the Tailwind plugin is in `vite.config.js`, and restart `npm run dev`.
- **The 3D scene is black or slow:** open the browser console (`F12`) and read the error. On weaker machines, lower `dpr` and `multisampling` in `City3D.jsx`.
- **PowerShell and JSON:** to test the API from PowerShell, use `Invoke-RestMethod` with a single-quoted JSON body, because `curl.exe` mangles the quotes.

## Security Notes

- Never commit `.env`. Make sure both `backend/.gitignore` and `frontend/.gitignore` contain `.env` and `node_modules`.
- Use a long random `JWT_SECRET` and a database password you do not use anywhere else.
- When the GitHub token form is connected to the backend, store the token encrypted on the server and never return it to the browser.
