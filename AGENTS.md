# AGENTS.md — Autonomous Agent Operating Directives

## 1. Autonomous Execution Mandate
Agents working in this codebase are granted full autonomy to execute routine actions without interrupting the user for intermediate permissions or approvals.

### Autonomous Actions (Do NOT Prompt Before Executing):
- **File System Operations**: Reading, viewing, modifying, refactoring, and creating project files.
- **Terminal Commands**: Running builds, installing dependencies, checking git status, running tests, checking ports, and launching local servers.
- **Git Synchronization**: Staging (`git add`), committing (`git commit`), and pushing (`git push origin main`) verified changes to maintain deployment sync with Render.
- **Verification & Diagnostics**: Compiling scripts (`py_compile`, `node -c`), sending HTTP test requests (`curl`, `Invoke-RestMethod`), and verifying API responses.
- **Database Migrations & Schema Fixes**: Applying PostgreSQL schema updates, adding missing indexes, and ensuring table parity.

### When to Request User Guidance:
- Only ask when there is a true architectural fork or business ambiguity with fundamentally conflicting paths (e.g., changing pricing business logic, removing major user-facing feature sets).
- Never ask for permission to run standard bash/PowerShell commands or write code.

---

## 2. Project Architecture & Cloud Persistence Rules

### Primary Technology Stack:
- **Backend**: Python Flask (`server.py`) and Node.js Express (`server.js`) dual-engine.
  - *Note*: Render production is configured for Python (`gunicorn server:app` / `python server.py`) with PostgreSQL via `DATABASE_URL`.
- **Database**: Persistent PostgreSQL (Render Cloud DB `radarmarket-db`).
  - Strict rule: **Never rely on the local filesystem or SQLite for persistent production data.** The container filesystem on Render is ephemeral and wiped on every deploy/restart.
  - Cloud PostgreSQL is the **single source of truth** for:
    1. `beacons` (active listings, categories, GPS coordinates, seller info, DSP-VI scores)
    2. `users` (profiles, Google auth, student verification, trust scores, phone verification)
    3. `messages` (private real-time chat scoped to `chat_{item_id}_{buyer_id}`)
    4. `offers` & `transactions` (UPI payment references, handshake codes, trade status)
- **Frontend**: Vanilla HTML5, Tailwind CSS, Lucide Icons, Leaflet.js, and PWA Mobile App Shell.

### PostgreSQL Specifics:
- **JSONB Handling**: In `server.py` with `psycopg2`, always wrap JSON fields (`tags`, `item_attributes`) with `psycopg2.extras.Json()` to prevent `column is of type jsonb but expression is of type character varying` errors.
- **SSL Configuration**:
  - Python: `psycopg2.connect(db_url, sslmode='require')`
  - Node.js: `new Pool({ connectionString: db_url, ssl: { rejectUnauthorized: false } })`
- **Reads Priority**: All read routes (`GET /api/items`, `GET /api/my-items`, `GET /api/chat/<id>`) must query cloud PostgreSQL directly when `DATABASE_URL` is available, using SQLite only as a local offline cache.

---

## 3. UX & Mobile-First Standards
- **Mobile Navigation**: Keep the `#mobile-dock-nav` floating glassmorphism dock functional, sticky, and synchronized with view changes (`Radar`, `Feed`, `Post`, `Chats`, `Profile`).
- **Tactile Haptics**: Leverage `window.triggerHaptic()` for taps, target locks, and actions on mobile touch screens.
- **Spacing Safeguard**: Maintain adequate bottom padding (`pb-28 sm:pb-12`) on the body so content is never obscured by the floating dock.
- **Privacy & Scoping**: Chat messages must remain strictly scoped to participants. Never broadcast chat events globally.

---

## 4. Verification Workflow
Before marking any task as complete:
1. Verify syntax:
   - Python: `python -m py_compile server.py`
   - Node: `node -c server.js`
2. Check git cleanliness: `git status`.
3. Commit and push verified code so Render auto-deploys the latest working state.
