# AGENTS.md

## Cursor Cloud specific instructions

This is a single **Next.js 16 (App Router, Turbopack) + React 19 + TypeScript + Tailwind CSS v4** web app. Package manager is **pnpm** (see `pnpm-lock.yaml`). There is no database or backend service to run — the Next.js dev server is the only service.

### Running / building
- Dev server: `pnpm dev` → serves on `http://localhost:3000` (Next.js default port). This is the command to use for development.
- Production build: `pnpm build`; serve the build with `pnpm start`.
- Scripts are defined in `package.json`.

### Non-obvious caveats
- Next.js requires an `app/` (or `pages/`) directory with at least a page to boot; without one, `pnpm dev`/`pnpm build` fail with "Couldn't find any `pages` or `app` directory". A minimal `app/layout.tsx`, `app/page.tsx`, and `app/globals.css` are present.
- `next.config.mjs` sets `typescript.ignoreBuildErrors: true`, so `pnpm build` will NOT fail on TypeScript type errors — do not rely on the build to catch type issues.
- Tailwind v4 is configured via `@tailwindcss/postcss` (`postcss.config.mjs`); global styles live in `app/globals.css` (referenced by `components.json` for shadcn/ui).
- `pnpm install` prints "Ignored build scripts: msw, sharp" — these are optional native/build steps and are safe to leave un-approved for local dev.
- The `lint` script (`eslint .`) is defined but ESLint is not in `devDependencies` and no ESLint config is committed, so `pnpm lint` fails out of the box. Add ESLint + a config before relying on linting.
- AI features would use the Vercel AI SDK (`@ai-sdk/openai`) and require an `OPENAI_API_KEY` env var, but no AI code exists in the repo yet.
