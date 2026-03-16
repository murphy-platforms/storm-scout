# Development Process

How Storm Scout was built using AI-assisted development, from initial concept to public release.

## Overview

Storm Scout was developed by a technical operations leader using AI coding assistants over approximately one month. The project spans 275 GitHub Issues and 60+ commits, producing a production-grade weather advisory dashboard with 35 backend test suites (474 tests), security hardening, and comprehensive documentation.

This document describes the methodology — not to promote AI tools, but to provide an honest account of what worked, what didn't, and how human expertise shaped every decision.

## AI Tooling

Four AI tools were used throughout development, each chosen for different strengths:

| Tool | Primary Role | Strengths |
|------|-------------|-----------|
| **Copilot Prompt Coach** | Prompt Building  | AI-powered teaching assistant that helps you write better prompts|
| **Google Gemini** | Research, architecture exploration | Strong at summarizing documentation, comparing architectural approaches, answering "how does X work" questions |
| **Warp.dev** | Terminal-based coding assistance | AI-integrated terminal with command suggestions, inline explanations, and workflow acceleration |
| **Claude (Anthropic)** | Primary coding, implementation | Extended context window for multi-file changes, consistent code style across sessions, strong at following project conventions |

No single tool was best at everything. Research tasks often started with Copilot or Gemini for broad exploration, then moved to Claude for implementation once the approach was decided. Warp.dev bridged the gap between planning and execution in the terminal.

## Development Workflow

### Issue-Driven Development

Every feature, bug fix, and documentation change started as a GitHub Issue. Issues followed a consistent template:

1. **Problem statement** — What needs to change and why
2. **Acceptance criteria** — Concrete, verifiable conditions for completion
3. **Files affected** — Specific files to modify, identified before coding begins
4. **Priority and severity** — Triaged against the project roadmap

This discipline was essential for AI-assisted development. Clear, scoped issues with explicit acceptance criteria gave AI tools the context they needed to generate accurate code on the first pass. Vague requirements produced vague code.

### Human-AI Collaboration Model

The workflow followed a consistent pattern:

1. **Human defines the requirement** — Architecture decisions, data model choices, API design, and UX flow were always human-directed. The developer's operations management background shaped what the application needed to do; AI tools helped figure out how.

2. **AI generates the implementation** — Given a well-scoped issue, AI tools produced initial implementations including code, tests, and documentation. Multi-file changes were handled in single sessions to maintain consistency.

3. **Human reviews and iterates** — Every generated artifact was reviewed for correctness, security implications, and alignment with project conventions. Review often triggered follow-up prompts to refine edge cases, error handling, or naming consistency.

4. **Commit with attribution** — Every commit carries a `Co-Authored-By` trailer identifying the AI tool used. This is intentional transparency about the methodology.

### What the Human Decided

- Database schema design (MariaDB table structure, indexes, foreign keys)
- API authentication strategy (API key via header, not session-based)
- NOAA integration approach (polling interval, circuit breaker thresholds, alert type classification)
- Security posture (CSP headers, SRI hashes, XSS prevention via tagged templates)
- UX decisions (which pages exist, what each page shows, filter preset definitions)
- Deduplication strategy (VTEC-based matching with multi-tier fallback)
- Project structure and coding conventions

### What AI Tools Generated

- Route handlers, middleware, database queries
- Jest test suites with edge case coverage
- Frontend page implementations following established patterns
- Documentation (JSDoc, markdown guides, API reference)
- Build scripts, CI/CD configuration, deployment guides
- Security assessment reports and dependency audit analysis

### Technology Decisions

**Vanilla JavaScript (no TypeScript)** — Storm Scout uses vanilla ES2020+ JavaScript with no TypeScript and no build step. This is a deliberate trade-off for the proof of concept: vanilla JS eliminates build tooling complexity, keeps the frontend servable as static files, and enables faster iteration cycles with AI assistants. TypeScript would be a natural evolution for team-based development or production scaling — see [`ARCHITECTURE.md`](ARCHITECTURE.md) for future considerations.

## Quality Assurance

### Automated Testing

The backend has 474 tests across 35 suites covering API routes, ingestion logic, advisory deduplication, database queries, middleware, error handling, and frontend utilities. Tests were generated alongside features — not added retroactively — which caught integration issues early.

The frontend has no automated tests. This was a deliberate trade-off: vanilla JavaScript with no build step means standard test runners don't integrate without adding complexity that would undermine the project's simplicity goals. See [`CONTRIBUTING.md`](../CONTRIBUTING.md#test-coverage-notes) for the full rationale.

### Code Review Process

AI-generated code was reviewed for:

- **Security** — No string interpolation in SQL, no raw `innerHTML` with user data, proper input validation
- **Consistency** — Naming conventions, file organization, error handling patterns
- **Correctness** — Edge cases, null handling, timezone awareness in date comparisons
- **Performance** — Query efficiency, appropriate indexing, avoiding N+1 patterns

### CI/CD Pipeline

GitHub Actions runs `npm audit --audit-level=high` and `npm test` on every push and pull request. This caught dependency vulnerabilities and regression failures that manual review would have missed.

## Cross-Functional Review

Before public release, the codebase underwent a structured cross-functional review simulating perspectives from multiple roles:

- **IC Engineer** — Code quality, test coverage, architecture patterns
- **Technical Leader** — Scalability, security posture, documentation completeness
- **Business Leader** — ROI narrative, deployment cost, use case clarity
- **Commercial Ops** — Multi-tenant potential, monetization framing, geographic limitations
- **Thought Leader** — LinkedIn readiness, personal brand narrative, development story

This review produced 18 issues across 4 priority tiers (P0 release blockers through P3 polish items), all tracked in a GitHub Project board with milestone targeting. Every issue followed the same template as development issues — problem, acceptance criteria, affected files.

## Lessons Learned

### What Worked Well

- **Issue-driven development with AI** — Tight, well-scoped issues with explicit acceptance criteria consistently produced accurate first-pass implementations. The discipline of writing clear requirements paid dividends in AI output quality.
- **Multi-tool approach** — Different AI tools excelled at different tasks. Using the right tool for each phase (research vs. implementation vs. terminal workflow) was more effective than relying on a single tool for everything.
- **Commit attribution** — Tagging every commit with the AI co-author created a transparent development record and forced honest accounting of what was human-directed vs. AI-generated.
- **Security-first conventions** — Establishing security patterns early (tagged templates for XSS prevention, parameterized queries, SRI hashes) meant AI tools followed these patterns consistently in later features.

### What Required Extra Attention

- **AI tools don't question requirements** — If an issue had a subtle design flaw, AI tools would implement it faithfully. The human review step caught several cases where the specification was technically correct but operationally wrong.
- **Consistency across sessions** — AI tools don't inherently remember project conventions from previous sessions. Providing context (existing code patterns, naming conventions, file structure) at the start of each session was essential.
- **Test quality vs. quantity** — AI tools readily generate tests, but early tests sometimes tested implementation details rather than behavior. Shifting to behavior-focused test descriptions improved test suite resilience.
- **Documentation drift** — As the codebase evolved, documentation generated in earlier sessions could fall behind. The cross-functional review caught several instances of stale documentation.

## Related Documentation

- [README — Development Story](../README.md#development-story) — High-level overview
- [CONTRIBUTING.md](../CONTRIBUTING.md) — Development setup and coding conventions
- [ARCHITECTURE.md](ARCHITECTURE.md) — System design and scale ceilings
- [FRONTEND-GUIDE.md](FRONTEND-GUIDE.md) — Frontend patterns and page structure
