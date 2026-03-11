# Contributing to Storm Scout

Thank you for your interest in contributing to Storm Scout! This guide covers everything you need to get started.

## Table of Contents
- [Local Development Setup](#local-development-setup)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Commit Conventions](#commit-conventions)
- [Pull Request Process](#pull-request-process)
- [Reporting Issues](#reporting-issues)
- [Project Context](#project-context)

---

## Local Development Setup

### Prerequisites
- Node.js 20+
- MariaDB 10.6+ or MySQL 8+ (or Docker)
- Git

### Steps

1. **Clone and install dependencies**
   ```bash
   git clone <repo-url>
   cd storm-scout-usps/backend
   npm ci
   ```

2. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env — set DB_USER, DB_PASSWORD, DB_NAME, NOAA_API_USER_AGENT, API_KEY
   ```

3. **Start database (Docker)**
   ```bash
   docker run -d --name storm-scout-db \
     -e MYSQL_ROOT_PASSWORD=root \
     -e MYSQL_DATABASE=storm_scout \
     -e MYSQL_USER=storm_scout \
     -e MYSQL_PASSWORD=localdev \
     -p 3306:3306 mariadb:10.6
   ```

4. **Initialize database and load offices**
   ```bash
   npm run init-db
   # Then import your office data:
   node src/scripts/import-offices.js /path/to/offices.csv
   npm run seed-db
   ```

5. **Start the development server**
   ```bash
   npm run dev   # nodemon with auto-restart
   # OR
   npm start     # plain node
   ```

6. **Open the frontend**
   The frontend is served statically from `frontend/`. With the server running, navigate to `http://localhost:3000`.

---

## Running Tests

```bash
cd backend

# Run all tests
npm test

# Run with coverage report
npm test -- --coverage

# Watch mode during development
npm run test:watch
```

Tests are in `backend/tests/`. Unit tests are in `tests/unit/`, integration tests in `tests/integration/`.

The CI pipeline (`npm audit --audit-level=high` + `npm test`) runs on every push and PR via GitHub Actions.

---

## Code Style

### General
- **JavaScript (ES2020+)**: No TypeScript; keep it readable
- **No build step**: Frontend is plain HTML + vanilla JS + Bootstrap 5.3
- **JSDoc required** on all exported functions and non-trivial internal functions
- **Comments explain "why"**, not just "what"

### Backend
- Use `async`/`await`; avoid raw callbacks
- Use parameterized queries — never string-interpolate user input into SQL
- All dynamic HTML in frontend must use the `html` tagged template from `js/utils.js` — never raw `innerHTML` with untrusted data

### Frontend
- One JS file per page (`page-*.js` pattern)
- All state stored in module-level variables at the top of the script block
- API calls go through `js/api.js` — do not call `fetch()` directly from page files
- Use `escapeHtml()` / `html` template for all dynamic content

---

## Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>: <short description> (closes #N)

[optional body]
```

**Types:**
- `feat:` — new feature
- `fix:` — bug fix
- `docs:` — documentation only
- `chore:` — build, deps, config
- `test:` — adding or fixing tests
- `refactor:` — code change that neither fixes a bug nor adds a feature

**Examples:**
```
feat: add CSV export for impacted offices report (closes #88)
fix: correct dedup comment labels in advisory.js (closes #121)
docs: add JSDoc to page-advisories.js (closes #128)
```

---

## Pull Request Process

1. Branch from `main`: `git checkout -b feat/my-feature`
2. Write or update tests for any new backend logic
3. Add a `CHANGELOG.md` entry under `[Unreleased]`
4. Ensure `npm test` and `npm audit --audit-level=high` pass locally
5. Open a PR against `main` — describe the change and reference any related issues
6. Address review feedback; squash fixup commits before merge

---

## Reporting Issues

- **Security vulnerabilities**: See [`SECURITY.md`](SECURITY.md) — do **not** open a public issue
- **Bugs**: Open a [GitHub Issue](../../issues) with steps to reproduce
- **Feature requests**: Open a GitHub Issue with the `enhancement` label

---

## Project Context

Storm Scout is a weather advisory dashboard monitoring 1610 office locations across all 50 US states. It ingests NOAA weather advisories every 15 minutes, matches them to offices by UGC zone codes, and surfaces operational impact through a browser-based dashboard.

The project is designed as a reference implementation demonstrating:
- Production-quality Node.js + Express API patterns
- NOAA Weather API integration with circuit breaker resilience
- Multi-tier deduplication strategy for advisory data
- Bootstrap 5.3 frontend with no build step
- Secure API key authentication and XSS prevention

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for scale ceilings and design decisions, and [`docs/FRONTEND-GUIDE.md`](docs/FRONTEND-GUIDE.md) for frontend architecture.
