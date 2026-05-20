// Matches the shapes release-please historically accepted via parse-github-repo-url:
//   owner/repo
//   github.com/owner/repo
//   https://github.com/owner/repo(.git)
//   git@github.com:owner/repo(.git)
//   git+ssh://git@github.com/owner/repo(.git)
const REPO_URL_RE =
  /^(?:(?:https?:\/\/|git\+ssh:\/\/git@|git@)?[^/:]*[/:])?([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

export function parseRepoUrl(
  input: string | undefined
): [owner: string, repo: string] | null {
  if (!input) return null;
  const match = REPO_URL_RE.exec(input.trim());
  if (!match) return null;
  const [, owner, repo] = match;
  if (!owner || !repo) return null;
  return [owner, repo];
}
