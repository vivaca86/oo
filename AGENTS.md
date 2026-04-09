# Agent Instructions

This repository is worked on by multiple coding agents across desktop Codex, web Codex, and GitHub-connected tools.

## First Read

Before making changes, always read these files in order:

1. [README.md](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/README.md)
2. [CODEX_CONTEXT.md](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/CODEX_CONTEXT.md)
3. [SESSION_LOG.md](/C:/Users/vivac/OneDrive/문서/aa/stock-lab/SESSION_LOG.md)

## Project Boundary

- This project is completely separate from the older `isarich` project.
- Never move stock-lab code back into `C:\Users\vivac\OneDrive\문서\aa\isarich`.
- The active project root is `C:\Users\vivac\OneDrive\문서\aa\stock-lab`.

## Architecture Rules

- Frontend is static and deployed from GitHub Pages.
- Historical/monthly data and catalog search go through the Apps Script gateway.
- Live intraday updates must prefer the realtime relay.
- If realtime relay is unavailable, the frontend may fall back to REST polling.
- Do not put KIS secrets into frontend files or GitHub.

## Continuation Routine

For every meaningful session:

1. Read `CODEX_CONTEXT.md` and `SESSION_LOG.md`.
2. Continue from the latest open task before starting unrelated work.
3. After changes, update `CODEX_CONTEXT.md` if architecture, deploy state, URLs, or next steps changed.
4. Append a short dated entry to `SESSION_LOG.md` with:
   - what changed
   - what was verified
   - blockers
   - exact next step

## Handoff Standard

When finishing a session, make it easy for the next agent to continue without extra user explanation.

- Keep `Current State`, `Open Issues`, and `Next Actions` in `CODEX_CONTEXT.md` current.
- Keep `SESSION_LOG.md` chronological and concise.
- If deployment status changes, include the exact URL and date.

## Validation

- Prefer lightweight validation that can run locally.
- For frontend changes, at minimum run syntax checks on changed JS files when possible.
- For relay changes, verify `/health` locally when possible.

## Deployment Notes

- GitHub Pages hosts the frontend.
- Apps Script hosts the REST gateway.
- Realtime relay is intended for a free host such as Render free tier unless the user chooses a different platform.
- If you deploy the relay, update `config.js` `realtimeUrl` and document the final URL in `CODEX_CONTEXT.md`.
