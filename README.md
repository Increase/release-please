# Release Please

This is Increase's fork of [release-please](https://github.com/stainless-api/release-please),
consumed as a GitHub Action from this repository.
It is not published to npm and is not intended for external use.

Release Please automates CHANGELOG generation,
GitHub release creation,
and version bumps
by parsing [Conventional Commits](https://www.conventionalcommits.org/)
in your git history and opening a Release PR.
It does not publish to package managers or manage release branches.

## How Release PRs work

Rather than releasing every merge to the default branch,
release-please maintains a single Release PR
that stays up-to-date as new commits land.
Merge it when you're ready to cut a release.

When the Release PR merges, release-please:

1. Updates `CHANGELOG.md` and language-specific files
   (for example `package.json`).
2. Tags the merge commit with the new version.
3. Creates a GitHub Release for that tag.

Status labels on the PR show where it is in its lifecycle:

- `autorelease: pending` — initial state, before merge.
- `autorelease: tagged` — merged and tagged in GitHub.
- `autorelease: snapshot` — snapshot version bump.
- `autorelease: published` — a GitHub release has been published
  (release-please does not set this label;
  it's a convention for downstream publication tooling).

## Commit conventions

Release Please reads [Conventional Commits](https://www.conventionalcommits.org/).
The prefixes that drive version bumps:

- `fix:` — bug fix, SemVer patch.
- `feat:` — new feature, SemVer minor.
- `feat!:`, `fix!:`, `refactor!:`, etc. — breaking change, SemVer major.
  A `BREAKING CHANGE:` footer works too.

Use squash-merges so each PR becomes a single, releasable commit.

To override the message used for release notes after merge,
edit the merged PR description and add:

```text
BEGIN_COMMIT_OVERRIDE
feat: add ability to override merged commit message

fix: another message
END_COMMIT_OVERRIDE
```

To force a specific version,
include `Release-As: x.y.z` in a commit body on the default branch.

## Using the action

The fork exposes a JavaScript action at the repository root.
Consumers pin to the floating major-version tag,
which moves with each patch/minor release.

The action must be authenticated with a token minted by the
Increase Releases GitHub App,
not `GITHUB_TOKEN`.
PRs and commits opened by `GITHUB_TOKEN`
do not trigger downstream workflows
(a GitHub safety feature),
which breaks CI on the release PR.
The App's installation token does trigger them,
and its commits are attributed to `increase-releases[bot]`.

Install the Increase Releases App on your repository,
then add a workflow like:

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    branches: [main]

concurrency:
  group: release
  cancel-in-progress: false

jobs:
  release-please:
    runs-on: ubuntu-latest
    permissions:
      contents: read
    steps:
      - uses: actions/create-github-app-token@v3
        id: app-token
        with:
          client-id: ${{ vars.INCREASE_RELEASES_CLIENT_ID }}
          private-key: ${{ secrets.INCREASE_RELEASES_PRIVATE_KEY }}

      - uses: increase/release-please@v1
        with:
          token: ${{ steps.app-token.outputs.token }}
```

`INCREASE_RELEASES_CLIENT_ID` (org variable)
and `INCREASE_RELEASES_PRIVATE_KEY` (org secret)
are available org-wide on `Increase/*` repositories.
The job's own `permissions:` only needs `contents: read`
because the App token carries the write scopes
release-please needs
(`contents`, `pull-requests`, `issues`).

The complete list of action inputs and outputs
is in [`action.yml`](action.yml).

## Configuration

Each consuming repository keeps two files at the root:

- `release-please-config.json` — release configuration
  (release type, changelog sections, PR header, etc.).
  See this repo's [`release-please-config.json`](release-please-config.json) for an example.
- `.release-please-manifest.json` — last-released version per package,
  maintained automatically by release-please.
  Seed it with the current version (e.g. `{".": "0.1.0"}`)
  before the first run.

The complete set of supported options
is documented in [`schemas/config.json`](schemas/config.json).

## Local CLI

The CLI is also available locally
once you've compiled `src/` to `build/`:

```bash
pnpm install
pnpm build
pnpm start -- --help
```

`pnpm test` and `pnpm lint` do not need the build step.

## Development

Install, lint, and test as CI does:

```bash
pnpm install --frozen-lockfile
pnpm lint
pnpm test
```

To auto-fix lint and formatting:

```bash
pnpm fix
```

## License

Apache 2.0 — see [`LICENSE`](LICENSE).
