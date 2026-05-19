# AGENTS.md

## Commit messages

Always use [Conventional Commits](https://www.conventionalcommits.org/)
for commit messages
(e.g. `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
This repository's release tooling depends on the convention
to generate changelogs and version bumps.

Use `!` or a `BREAKING CHANGE:` trailer to denote breaking changes.

## Prose style

Format Markdown and other prose
using [Semantic Line Breaks](https://sembr.org)
so diffs stay readable and edits remain localized.
Rendered output is unaffected.

## Before committing

Run lint and tests locally
to match what CI runs
and avoid failing checks:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

Tests run with [Vitest](https://vitest.dev/) (`vitest run`).
Update snapshots after intentional output changes with `pnpm test:snap`.

To auto-fix lint and formatting issues, use:

```bash
pnpm fix
```
