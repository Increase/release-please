// Copyright 2025 Increase
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0

// Entry point for the JavaScript GitHub Action wrapping release-please.
//
// This file is bundled by `@vercel/ncc` into `dist/index.js`, which is what
// `action.yml`'s `runs.main` points at. It is intentionally separate from
// `src/index.ts` (the library's public API) so the bundler has a small,
// action-focused root to follow.
//
// We import `Manifest` and `GitHub` from the local library and call them
// directly (style B in the task spec): no subprocess spawn, no CLI parsing.
// The composite predecessor had to shell out because composite actions cannot
// access library return values; here we capture the structured results and
// surface them via `core.setOutput`.

import * as core from '@actions/core';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const parseGithubRepoUrl = require('parse-github-repo-url');

import {GitHub} from './github';
import {
  DEFAULT_RELEASE_PLEASE_CONFIG,
  DEFAULT_RELEASE_PLEASE_MANIFEST,
  Manifest,
  ManifestOptions,
  CreatedRelease,
} from './manifest';
import {PullRequest} from './pull-request';

type Command = 'release-pr' | 'github-release' | 'both';

interface ActionInputs {
  token: string;
  configFile: string;
  manifestFile: string;
  targetBranch: string;
  changesBranch: string;
  command: Command;
  repoUrl: string;
}

function parseCommand(value: string): Command {
  if (
    value === 'release-pr' ||
    value === 'github-release' ||
    value === 'both'
  ) {
    return value;
  }
  throw new Error(
    `Unknown command: ${value} (expected release-pr, github-release, or both)`
  );
}

function readInputs(): ActionInputs {
  const token = core.getInput('token', {required: true});
  const command = parseCommand(core.getInput('command') || 'both');

  // Default repo-url to the calling repository, exactly as the composite did
  // via $GITHUB_SERVER_URL / $GITHUB_REPOSITORY.
  const serverUrl = process.env.GITHUB_SERVER_URL || 'https://github.com';
  const repository = process.env.GITHUB_REPOSITORY || '';
  const defaultRepoUrl = repository ? `${serverUrl}/${repository}` : '';

  return {
    token,
    configFile: core.getInput('config-file') || DEFAULT_RELEASE_PLEASE_CONFIG,
    manifestFile:
      core.getInput('manifest-file') || DEFAULT_RELEASE_PLEASE_MANIFEST,
    targetBranch: core.getInput('target-branch'),
    changesBranch: core.getInput('changes-branch'),
    command,
    repoUrl: core.getInput('repo-url') || defaultRepoUrl,
  };
}

async function buildGitHub(inputs: ActionInputs): Promise<GitHub> {
  const parsed = parseGithubRepoUrl(inputs.repoUrl);
  if (!parsed) {
    throw new Error(`Could not parse repo-url: ${inputs.repoUrl}`);
  }
  const [owner, repo] = parsed;
  return GitHub.create({
    owner,
    repo,
    token: inputs.token,
    retries: 3,
    throttlingRetries: 3,
  });
}

async function buildManifest(
  github: GitHub,
  inputs: ActionInputs,
  manifestOptions: ManifestOptions
): Promise<Manifest> {
  const targetBranch = inputs.targetBranch || github.repository.defaultBranch;
  return Manifest.fromManifest(
    github,
    targetBranch,
    inputs.configFile,
    inputs.manifestFile,
    manifestOptions
  );
}

// Mirror googleapis/release-please-action's setPathOutput helper so a single
// release in a single-package repo (our day-one target) still surfaces its
// tag/version/upload_url, and monorepo callers can pivot on `paths_released`.
function setPathOutput(path: string, release: CreatedRelease): void {
  const prefix = path === '.' ? '' : `${path}--`;
  core.setOutput(`${prefix}release_created`, true);
  core.setOutput(`${prefix}id`, release.id);
  core.setOutput(`${prefix}name`, release.name);
  core.setOutput(`${prefix}tag_name`, release.tagName);
  core.setOutput(`${prefix}sha`, release.sha);
  core.setOutput(`${prefix}url`, release.url);
  core.setOutput(`${prefix}draft`, release.draft);
  core.setOutput(`${prefix}upload_url`, release.uploadUrl);
  core.setOutput(`${prefix}path`, release.path);
  core.setOutput(`${prefix}version`, release.version);
  core.setOutput(`${prefix}major`, release.major);
  core.setOutput(`${prefix}minor`, release.minor);
  core.setOutput(`${prefix}patch`, release.patch);
}

async function runReleasePr(
  github: GitHub,
  inputs: ActionInputs
): Promise<(PullRequest | undefined)[]> {
  core.startGroup('release-please release-pr');
  try {
    // changes-branch only applies to release-pr (the Stainless fork's
    // commit-source override). The composite enforced this by branching in
    // shell; we enforce it by only setting the option here.
    const manifestOptions: ManifestOptions = {};
    if (inputs.changesBranch) {
      manifestOptions.changesBranch = inputs.changesBranch;
    }
    const manifest = await buildManifest(github, inputs, manifestOptions);
    const pulls = await manifest.createPullRequests();
    core.info(
      `release-pr finished: ${
        pulls.filter(Boolean).length
      } pull request(s) created or updated`
    );
    return pulls;
  } finally {
    core.endGroup();
  }
}

async function runGithubRelease(
  github: GitHub,
  inputs: ActionInputs
): Promise<(CreatedRelease | undefined)[]> {
  core.startGroup('release-please github-release');
  try {
    const manifest = await buildManifest(github, inputs, {});
    const releases = await manifest.createReleases();
    core.info(
      `github-release finished: ${
        releases.filter(Boolean).length
      } release(s) created`
    );
    return releases;
  } finally {
    core.endGroup();
  }
}

async function main(): Promise<void> {
  const inputs = readInputs();
  const github = await buildGitHub(inputs);

  let pulls: (PullRequest | undefined)[] = [];
  let releases: (CreatedRelease | undefined)[] = [];

  if (inputs.command === 'release-pr' || inputs.command === 'both') {
    pulls = await runReleasePr(github, inputs);
  }
  if (inputs.command === 'github-release' || inputs.command === 'both') {
    releases = await runGithubRelease(github, inputs);
  }

  // Outputs. Modelled on googleapis/release-please-action so existing workflow
  // patterns ("if releases_created, publish") transfer over.
  const createdReleases = releases.filter(
    (r): r is CreatedRelease => r !== undefined
  );
  const releasesCreated = createdReleases.length > 0;
  core.setOutput('releases_created', releasesCreated);
  core.setOutput(
    'paths_released',
    JSON.stringify(createdReleases.map(r => r.path))
  );
  for (const release of createdReleases) {
    setPathOutput(release.path, release);
  }

  // Surface the first non-empty release PR. We only support single-package
  // repos today; this matches the composite's day-one usage and keeps the
  // output shape stable for the smoketest assertion.
  const firstPr = pulls.find((p): p is PullRequest => p !== undefined);
  core.setOutput('release_pr', firstPr ? JSON.stringify(firstPr) : '');
  core.setOutput('pr', firstPr ? JSON.stringify(firstPr) : '');
}

main().catch(err => {
  // We deliberately avoid printing the request object (which can contain the
  // token) the way the CLI's handleError does; @actions/core.setFailed already
  // surfaces a clean error to the workflow summary.
  const message = err instanceof Error ? err.message : String(err);
  if (err instanceof Error && err.stack) {
    core.debug(err.stack);
  }
  core.setFailed(`release-please action failed: ${message}`);
});
