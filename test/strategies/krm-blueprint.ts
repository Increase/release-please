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

import {KRMBlueprint} from '../../src/strategies/krm-blueprint';
import {
  buildMockConventionalCommit,
  stubFilesFromFixtures,
  assertHasUpdate,
  assertNoHasUpdate,
} from '../helpers';
import nock from '../http-mock';
import {GitHub} from '../../src/github';
import {Version} from '../../src/version';
import {TagName} from '../../src/util/tag-name';
import {KRMBlueprintVersion} from '../../src/updaters/krm/krm-blueprint-version';
import {Changelog} from '../../src/updaters/changelog';

nock.disableNetConnect();
const fixturesPath = './test/fixtures/strategies/krm-blueprint';

describe('KRMBlueprint', () => {
  let github: GitHub;
  const commits = [
    ...buildMockConventionalCommit(
      'fix(deps): update dependency com.google.cloud:google-cloud-storage to v1.120.0'
    ),
  ];
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'googleapis',
      repo: 'krm-blueprint-test-repo',
      defaultBranch: 'main',
    });
  });
    describe('buildReleasePullRequest', () => {
    it('returns release PR changes with defaultInitialVersion', async () => {
      const expectedVersion = '0.0.1';
      const strategy = new KRMBlueprint({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      vi.spyOn(github, 'findFilesByExtensionAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      expect(release!.version?.toString()).to.eql(expectedVersion);
    });
    it('builds a release pull request', async () => {
      const expectedVersion = '0.123.5';
      const strategy = new KRMBlueprint({
        targetBranch: 'main',
        github,
        component: 'some-krm-blueprint-package',
      });
      vi.spyOn(github, 'findFilesByExtensionAndRef').mockResolvedValue([]);
      const latestRelease = {
        tag: new TagName(
          Version.parse('0.123.4'),
          'some-krm-blueprint-package'
        ),
        sha: 'abc123',
        notes: 'some notes',
      };
      const pullRequest = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      expect(pullRequest!.version?.toString()).to.eql(expectedVersion);
    });
  });
  describe('buildUpdates', () => {
    it('builds common files', async () => {
      const strategy = new KRMBlueprint({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      vi.spyOn(github, 'findFilesByExtensionAndRef').mockResolvedValue([]);
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      const updates = release!.updates;
      assertHasUpdate(updates, 'CHANGELOG.md', Changelog);
    });

    it('finds and updates a yaml files', async () => {
      const strategy = new KRMBlueprint({
        targetBranch: 'main',
        github,
        component: 'google-cloud-automl',
      });
      vi
        .spyOn(github, 'findFilesByExtensionAndRef')
        .withArgs('yaml', 'main', '.')
        .mockResolvedValue(['project.yaml', 'no-attrib-bucket.yaml']);
      stubFilesFromFixtures({
        github,fixturePath: `${fixturesPath}/nested-pkg`,
        files: ['project.yaml', 'no-attrib-bucket.yaml'],
        targetBranch: 'main',
      });
      const latestRelease = undefined;
      const release = await strategy.buildReleasePullRequest({
        commits,
        latestRelease,
      });
      const updates = release!.updates;
      assertHasUpdate(updates, 'project.yaml', KRMBlueprintVersion);
      assertNoHasUpdate(updates, 'no-attrib-bucket.yaml');
    });
  });
});
