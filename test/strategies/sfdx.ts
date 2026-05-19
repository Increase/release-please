// Copyright 2023 Google LLC
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

import {Sfdx} from '../../src/strategies/sfdx';
import {
  buildMockConventionalCommit,
  buildGitHubFileContent,
  assertHasUpdate,
} from '../helpers';
import nock from '../http-mock';
import {GitHub} from '../../src/github';
import {Version} from '../../src/version';
import {TagName} from '../../src/util/tag-name';
import {Changelog} from '../../src/updaters/changelog';
import {SfdxProjectJson} from '../../src/updaters/sfdx/sfdx-project-json';
import * as assert from 'node:assert';
import {MissingRequiredFileError, FileNotFoundError} from '../../src/errors';

nock.disableNetConnect();
const fixturesPath = './test/fixtures/strategies/sfdx';

describe('Sfdx', () => {
  let github: GitHub;
  const commits = [
    ...buildMockConventionalCommit(
      'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
    ),
  ];
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'sfdx-test-repo',
      defaultBranch: 'main',
    });
  });
    describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '0.0.1';
      const strategy = new Sfdx({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
        packageName: 'google-cloud-automl',
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      expect(release!.version?.toString()).to.eql(expectedVersion);
    });
    it('builds a release pull request', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new Sfdx({
        targetBranch: 'main',
        github,
        component: 'some-sfdx-package',
        packageName: 'some-sfdx-package',
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'some-sfdx-package'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const pullRequest = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      expect(pullRequest!.version?.toString()).to.eql(expectedVersion);
    });
    it('detects a default component', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new Sfdx({
        targetBranch: 'main',
        github,
      });
      const commits = [
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
        ),
      ];
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'sfdx-test-repo'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('sfdx-project.json', 'main')
        .mockResolvedValue(buildGitHubFileContent(fixturesPath, 'sfdx-project.json'));
      const pullRequest = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      expect(pullRequest!.version?.toString()).to.eql(expectedVersion);
    });
    it('detects a default packageName', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new Sfdx({
        targetBranch: 'main',
        github,
        component: 'abc-123',
      });
      const commits = [
        ...buildMockConventionalCommit(
          'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
        ),
      ];
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'sfdx-test-repo'),
        sha: 'abc123',
        notes: 'some notes',
      };
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('sfdx-project.json', 'main')
        .mockResolvedValue(buildGitHubFileContent(fixturesPath, 'sfdx-project.json'));
      const pullRequest = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      expect(pullRequest!.version?.toString()).to.eql(expectedVersion);
    });
    it('handles missing sfdx-project.json', async () => {
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .mockRejectedValue(new FileNotFoundError('stub/path'));
      const strategy = new Sfdx({
        targetBranch: 'main',
        github,
      });
      const latestRelease = {
        tag: new TagName(Version.parse('0.123.4'), 'some-sfdx-package'),
        sha: 'abc123',
        notes: 'some notes',
      };
      assert.rejects(async () => {
        await strategy.buildReleasePullRequest({commits, latestRelease});
      }, MissingRequiredFileError);
    });
  });
  describe('buildUpdates', () => {
    it('builds common files', async () => {
      const strategy = new Sfdx({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
        packageName: 'google-cloud-automl-pkg',
      });
      vi.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
      assertHasUpdate(updates, 'sfdx-project.json', SfdxProjectJson);
    });
  });
});
