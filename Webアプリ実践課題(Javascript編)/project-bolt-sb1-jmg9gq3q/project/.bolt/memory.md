# Project memory

## Product intent & audience

- Task management app ("タスクの保存" / task saving feature) built on Vite + React.
- Intended to move from Bolt.new → GitHub/ZIP export → local Cursor + Claude Code development.
- Backend powered by Supabase (cloud-hosted DB); local dev connects to the same remote DB via env vars.
- Target developer workflow: Claude Code with Supabase MCP for continued feature expansion.

## Brand personality & voice

- Explanatory tone in assistant responses: concise step-by-step Japanese instructions.
- User communicates in Japanese; keep code/UI labels and explanations Japanese-first.

## Visual design & UX direction

- Stack: JSX + Tailwind CSS utility classes; React hooks; Lucide React for icons.
- No external UI theme/icon packages unless explicitly requested.
- Import project modules via `@/` alias (maps to `src/`); avoid deep relative paths.
- Design goal: production-quality, non-cookie-cutter webpages (user-level expectation from `.bolt/prompt`).

## Decisions, constraints & rationale

- Environment variables required for local Supabase connectivity: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
  - Must be copied from Bolt's `.env` (visible in code view) into local `.env` at project root; without them, task saving fails locally.
- Local dev server started via `npm run dev`.
- GitHub export is preferred for bidirectional sync: local changes can be pushed to GitHub and re-imported into Bolt.
- ZIP download is available as fallback (desktop only; mobile unsupported).
- Supabase DB stays cloud-hosted — no local DB setup needed; Claude Code Supabase MCP connects to the same cloud instance.

## Open questions & assumptions

- Assumes Supabase project is already provisioned and connected in the Bolt environment.
- App scope beyond task management is not yet defined; future feature expansion via Claude Code is planned but unspecified.
- Supabase MCP configuration steps for Claude Code not yet documented in this project.