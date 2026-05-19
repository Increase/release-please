// Copyright 2021 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
import {describe, it, expect, beforeEach, vi} from 'vitest';

import {GitHub} from '../../src/github';
import {GoYoshi} from '../../src/strategies/go-yoshi';
import {assertHasUpdate, buildGitHubFileContent, dateSafe} from '../helpers';
import {buildMockConventionalCommit} from '../helpers';
import {TagName} from '../../src/util/tag-name';
import {Version} from '../../src/version';
import {Changelog} from '../../src/updaters/changelog';
import {VersionGo} from '../../src/updaters/go/version-go';
import {GithubImportsGo} from '../../src/updaters/go/github-imports-go';
import {GoModUpdater} from '../../src/updaters/go/go-mod';

const COMMITS = [
  ...buildMockConventionalCommit(
    'fix(iam): update dependency com.google.cloud:google-cloud-storage to v1.120.0',
    ['iam/foo.go']
  ),
  ...buildMockConventionalCommit('chore: update common templates'),
];

describe('GoYoshi', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'google-cloud-go',
      defaultBranch: 'main',
    });

    vi
      .spyOn(github, 'findFilesByGlobAndRef')
      .withArgs('**/*.go', 'main')
      .mockResolvedValue(['file-with-imports-v2.go'])
      .withArgs('**/*.md', 'main')
      .mockResolvedValue([]);
  });
    describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '0.0.1';
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        component: 'iam',
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits: COMMITS,
        latestRelease,
      });
      expect(release?.version?.toString()).to.eql(expectedVersion);
    });
    it('returns release PR changes with semver patch bump', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        component: 'iam',
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'iam'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const release = await strategy.buildReleasePullRequest({
        commits: COMMITS,
        latestRelease,
      });
      expect(release?.version?.toString()).to.eql(expectedVersion);
    });
  });
  describe('buildUpdates', () => {
    it('builds common files', async () => {
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        component: 'iam',
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits: COMMITS,
        latestRelease,
      });
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGES.md', Changelog);
      assertHasUpdate(updates, 'internal/version.go', VersionGo);
    });

    it('finds and updates a go file with an import', async () => {
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        component: 'iam',
      });
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .mockResolvedValue(
          buildGitHubFileContent(
            './test/updaters/fixtures/go',
            'file-with-imports-v2.go'
          )
        );
      vi.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits: COMMITS,
        latestRelease,
      });
      const updates = release!.updates;
      assertHasUpdate(updates, 'file-with-imports-v2.go', GithubImportsGo);
    });

    it('finds and updates a go.mod file', async () => {
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        component: 'iam',
      });
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .mockResolvedValue(
          buildGitHubFileContent(
            './test/updaters/fixtures/go',
            'file-with-imports-v2.go'
          )
        );
      vi.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits: COMMITS,
        latestRelease,
      });
      const updates = release!.updates;
      assertHasUpdate(updates, 'go.mod', GoModUpdater);
    });
  });
  describe('buildReleasePullRequest', () => {
    it('filters out submodule commits', async () => {
      vi
        .spyOn(github, 'findFilesByFilenameAndRef')
        .withArgs('go.mod', 'main')
        .mockResolvedValue(['go.mod', 'internal/go.mod', 'logging/go.mod']);
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        includeComponentInTag: false,
      });
      const commits = [
        ...buildMockConventionalCommit('fix: some generic fix'),
        ...buildMockConventionalCommit('fix(translate): some translate fix'),
        ...buildMockConventionalCommit('fix(logging): some logging fix'),
        ...buildMockConventionalCommit('feat: some generic feature'),
      ];
      const pullRequest = await strategy.buildReleasePullRequest({commits});
      const pullRequestBody = pullRequest!.body.toString();
      expect(pullRequestBody).to.not.include('logging');
      expect(dateSafe(pullRequestBody)).toMatchSnapshot();
    });
    it('filters out touched files not matching submodule commits', async () => {
      vi
        .spyOn(github, 'findFilesByFilenameAndRef')
        .withArgs('go.mod', 'main')
        .mockResolvedValue(['go.mod', 'internal/go.mod', 'logging/go.mod']);
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        includeComponentInTag: false,
      });
      const commits = [
        ...buildMockConventionalCommit('fix: some generic fix'),
        ...buildMockConventionalCommit('fix(iam/apiv1): some firestore fix', [
          'accessapproval/apiv1/access_approval_client.go',
          'iam/apiv1/admin/firestore_admin_client.go',
        ]),
        ...buildMockConventionalCommit('feat: some generic feature'),
      ];
      const pullRequest = await strategy.buildReleasePullRequest({commits});
      const pullRequestBody = pullRequest!.body.toString();
      expect(pullRequestBody).to.not.include('access');
      expect(pullRequestBody).to.include('iam');
      expect(dateSafe(pullRequestBody)).toMatchSnapshot();
    });

    it('combines google-api-go-client autogenerated PR', async () => {
      github = await GitHub.create({
        owner: 'googleapis',
        repo: 'google-api-go-client',
        defaultBranch: 'main',
      });
      vi
        .spyOn(github, 'findFilesByGlobAndRef')
        .mockResolvedValue(['file-with-imports-v2.go']);

      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
      });
      const commits = [
        ...buildMockConventionalCommit(
          'feat(all): auto-regenerate discovery clients (#1281)'
        ),
        ...buildMockConventionalCommit(
          'feat(all): auto-regenerate discovery clients (#1280)'
        ),
        ...buildMockConventionalCommit(
          'feat(all): auto-regenerate discovery clients (#1279)'
        ),
        ...buildMockConventionalCommit(
          'feat(all): auto-regenerate discovery clients (#1278)'
        ),
      ];
      const pullRequest = await strategy.buildReleasePullRequest({commits});
      const pullRequestBody = pullRequest!.body.toString();
      expect(dateSafe(pullRequestBody)).toMatchSnapshot();
    });
  });
  describe('getIgnoredSubModules', () => {
    it('ignores non-google-cloud-go repos', async () => {
      github = await GitHub.create({
        owner: 'googleapis',
        repo: 'google-cloud-foo',
        defaultBranch: 'main',
      });
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        includeComponentInTag: false,
      });
      const ignoredSubModules = await strategy.getIgnoredSubModules();
      expect(ignoredSubModules.size).to.eql(0);
    });
    it('ignores submodule configurations', async () => {
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        component: 'storage',
        includeComponentInTag: true,
      });
      const ignoredSubModules = await strategy.getIgnoredSubModules();
      expect(ignoredSubModules.size).to.eql(0);
    });
    it('fetches the list of submodules', async () => {
      vi
        .spyOn(github, 'findFilesByFilenameAndRef')
        .withArgs('go.mod', 'main')
        .mockResolvedValue([
          'storage/go.mod',
          'go.mod',
          'internal/foo/go.mod',
          'internal/go.mod',
          'pubsub/go.mod',
        ]);
      const strategy = new GoYoshi({
        targetBranch: 'main',
        github,
        component: 'main',
        includeComponentInTag: false,
      });
      const ignoredSubModules = await strategy.getIgnoredSubModules();
      expect(ignoredSubModules.size).to.eql(2);
      expect(ignoredSubModules.has('storage')).to.be.true;
      expect(ignoredSubModules.has('pubsub')).to.be.true;
    });
  });
});
