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
import {describe, it, expect, beforeEach, vi, type MockInstance} from 'vitest';

import {
  DEFAULT_CUSTOM_VERSION_LABEL,
  DEFAULT_RELEASE_PLEASE_MANIFEST,
  Manifest,
  ManifestConfig,
} from '../src/manifest';
import {GitHub, ReleaseOptions} from '../src/github';
import {
  buildGitHubFileContent,
  buildGitHubFileRaw,
  assertHasUpdate,
  dateSafe,
  safeSnapshot,
  mockCommits,
  mockReleases,
  mockTags,
  assertNoHasUpdate,
  mockReleaseData,
} from './helpers';
import * as assert from 'node:assert';
import {Version} from '../src/version';
import {PullRequest} from '../src/pull-request';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import * as pluginFactory from '../src/factories/plugin-factory';
import {SentenceCase} from '../src/plugins/sentence-case';
import {NodeWorkspace} from '../src/plugins/node-workspace';
import {CargoWorkspace} from '../src/plugins/cargo-workspace';
import {PullRequestTitle} from '../src/util/pull-request-title';
import {PullRequestBody} from '../src/util/pull-request-body';
import {RawContent} from '../src/updaters/raw-content';
import {
  DuplicateReleaseError,
  FileNotFoundError,
  ConfigurationError,
  GitHubAPIError,
} from '../src/errors';
import {RequestError} from '@octokit/request-error';
import nock from './http-mock';
import {LinkedVersions} from '../src/plugins/linked-versions';
import {MavenWorkspace} from '../src/plugins/maven-workspace';
import {GraphqlResponseError} from '@octokit/graphql';

nock.disableNetConnect();

const fixturesPath = './test/fixtures';

function mockPullRequests(github: GitHub,
  openPullRequests: PullRequest[],
  mergedPullRequests: PullRequest[] = [],
  closedPullRequests: PullRequest[] = []
): MockInstance {
  async function* fakeGenerator() {
    for (const pullRequest of openPullRequests) {
      yield pullRequest;
    }
  }
  async function* mergedGenerator() {
    for (const pullRequest of mergedPullRequests) {
      yield pullRequest;
    }
  }
  async function* closedGenerator() {
    for (const pullRequest of closedPullRequests) {
      yield pullRequest;
    }
  }
  return vi.spyOn(github, 'pullRequestIterator').mockImplementation(
    (_targetBranch, status) => {
      if (status === 'OPEN') {
        return fakeGenerator();
      }
      if (status === 'MERGED') {
        return mergedGenerator();
      }
      if (status === 'CLOSED') {
        return closedGenerator();
      }
      return (async function* () {})();
    }
  );
}

function mockCreateRelease(
  github: GitHub,
  releases: {
    id: number;
    sha: string;
    tagName: string;
    draft?: boolean;
    prerelease?: boolean;
    duplicate?: boolean;
  }[]
): MockInstance {
  return vi.spyOn(github, 'createRelease').mockImplementation(async release => {
    const tagName = release.tag.toString();
    const config = releases.find(r => r.tagName === tagName);
    if (!config) {
      throw Object.assign(new Error(`Unexpected createRelease for ${tagName}`), {
        release,
      });
    }
    if (config.duplicate) {
      throw new DuplicateReleaseError(
        new RequestError('dup', 400, {
          response: {
            headers: {},
            status: 400,
            url: '',
            data: '',
          },
          request: {
            headers: {},
            method: 'POST',
            url: '',
          },
        }),
        tagName
      );
    }
    return {
      id: config.id,
      tagName: config.tagName,
      sha: config.sha,
      url: 'https://path/to/release',
      notes: 'some release notes',
      draft: config.draft,
    };
  });
}

function pullRequestBody(path: string): string {
  return readFileSync(resolve(fixturesPath, path), 'utf8').replace(
    /\r\n/g,
    '\n'
  );
}

describe('Manifest', () => {
  let github: GitHub;
  beforeEach(async () => {
    github = await GitHub.create({
      owner: 'fake-owner',
      repo: 'fake-repo',
      defaultBranch: 'main',
      token: 'fake-token',
    });
  });
    describe('fromManifest', () => {
    it('should parse config and manifest from repository', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .withArgs('.release-please-manifest.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch
      );
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(8).toMatchSnapshot();
      expect(Object.keys(manifest.releasedVersions)).lengthOf(8).toMatchSnapshot();
    });
    it('should fetch config and manifest from changes-branch when specified', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(8).toMatchSnapshot();
      expect(Object.keys(manifest.releasedVersions)).lengthOf(8).toMatchSnapshot();
    });
    it('should limit manifest loading to the given path', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'},
        'packages/gcf-utils'
      );
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(
        manifest.repositoryConfig['packages/gcf-utils'].releaseType
      ).to.eql('node');
      expect(Object.keys(manifest.releasedVersions)).lengthOf(8).toMatchSnapshot();
    });
    it('should override release-as with the given argument', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'},
        'packages/gcf-utils',
        '12.34.56'
      );
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(manifest.repositoryConfig['packages/gcf-utils'].releaseAs).to.eql(
        '12.34.56'
      );
      expect(Object.keys(manifest.releasedVersions)).lengthOf(8).toMatchSnapshot();
    });
    it('should read the default release-type from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/root-release-type.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].releaseType).to.eql('java-yoshi');
      expect(manifest.repositoryConfig['node-package'].releaseType).to.eql(
        'node'
      );
    });
    it('should read custom pull request title patterns from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/group-pr-title-pattern.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.groupPullRequestTitlePattern).to.eql(
        'chore${scope}: release${component} v${version}'
      );
      expect(
        manifest.repositoryConfig['packages/cron-utils'].pullRequestTitlePattern
      ).to.eql('chore${scope}: send it v${version}');
    });

    it('should read custom tag separator from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/tag-separator.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].tagSeparator).to.eql('-');
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].tagSeparator
      ).to.eql('/');
    });

    it('should read extra files from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/extra-files.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].extraFiles).to.eql([
        'default.txt',
        {
          type: 'json',
          path: 'path/default.json',
          jsonpath: '$.version',
        },
      ]);
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].extraFiles
      ).to.eql([
        'foo.txt',
        {
          type: 'json',
          path: 'path/bar.json',
          jsonpath: '$.version',
        },
      ]);
    });

    it('should read custom include component in tag from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/include-component-in-tag.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].includeComponentInTag).to.be.false;
      expect(
        manifest.repositoryConfig['packages/bot-config-utils']
          .includeComponentInTag
      ).to.be.true;
    });

    it('should read custom include v in tag from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/include-v-in-tag.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].includeVInTag).to.be.false;
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].includeVInTag
      ).to.be.true;
    });

    it('should read custom labels from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/labels.json')
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.labels).to.deep.equal(['custom: pending']);
      expect(manifest.releaseLabels).to.deep.equal(['custom: tagged']);
      expect(manifest.prereleaseLabels).to.deep.equal([
        'custom: pre-release',
      ]);
    });

    it('should read reviewers from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/reviewers.json')
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.reviewers).to.deep.equal(['sam', 'frodo']);
    });

    it('should read extra labels from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/extra-labels.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].extraLabels).to.deep.equal([
        'lang: java',
      ]);
      expect(manifest.repositoryConfig['node-lib'].extraLabels).to.deep.equal([
        'lang: nodejs',
      ]);
    });
    it('should read exclude paths from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/exclude-paths.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].excludePaths).to.deep.equal([
        'path-root-ignore',
      ]);
      expect(manifest.repositoryConfig['node-lib'].excludePaths).to.deep.equal([
        'path-ignore',
      ]);
    });
    it('should build simple plugins from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/plugins.json')
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.plugins).lengthOf(2).toMatchSnapshot();
      expect(manifest.plugins[0]).instanceOf(NodeWorkspace).toMatchSnapshot();
      expect(manifest.plugins[1]).instanceOf(CargoWorkspace).toMatchSnapshot();
    });
    it('should build complex plugins from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/complex-plugins.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.plugins).lengthOf(1).toMatchSnapshot();
      expect(manifest.plugins[0]).instanceOf(LinkedVersions).toMatchSnapshot();
      const plugin = manifest.plugins[0] as LinkedVersions;
      expect(plugin.groupName).to.eql('grouped components');
      expect(plugin.components).to.eql(new Set(['pkg2', 'pkg3']));
    });
    it('should build maven-workspace from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/maven-workspace-plugins.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.plugins).lengthOf(1).toMatchSnapshot();
      expect(manifest.plugins[0]).instanceOf(MavenWorkspace).toMatchSnapshot();
      const plugin = manifest.plugins[0] as MavenWorkspace;
      expect(plugin.considerAllArtifacts).to.be.true;
    });
    it('should configure search depth from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/search-depth.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.releaseSearchDepth).to.eql(10);
      expect(manifest.commitSearchDepth).to.eql(50);
    });

    it('should read changelog host from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/changelog-host.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].changelogHost).to.eql(
        'https://example.com'
      );
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].changelogHost
      ).to.eql('https://override.example.com');
    });

    it('should read changelog type from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/changelog-type.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].changelogType).to.eql('github');
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].changelogType
      ).to.eql('default');
    });

    it('should read changelog path from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/changelog-path.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].changelogPath).to.eql(
        'docs/foo.md'
      );
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].changelogPath
      ).to.eql('docs/bar.md');
    });

    it('should read versioning type from manifest', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/config/versioning.json'
          )
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      const manifest = await Manifest.fromManifest(
        github,
        github.repository.defaultBranch,
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      expect(manifest.repositoryConfig['.'].versioning).to.eql(
        'always-bump-patch'
      );
      expect(
        manifest.repositoryConfig['packages/bot-config-utils'].versioning
      ).to.eql('default');
    });

    it('should throw a configuration error for a missing manifest config', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockRejectedValue(new FileNotFoundError('.release-please-config.json'))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      await assert.rejects(async () => {
        await Manifest.fromManifest(
          github,
          github.repository.defaultBranch,
          undefined,
          undefined,
          {changesBranch: 'next'}
        );
      }, ConfigurationError);
    });

    it('should throw a configuration error for a missing manifest versions file', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockRejectedValue(new FileNotFoundError('.release-please-manifest.json'));
      await assert.rejects(async () => {
        await Manifest.fromManifest(
          github,
          github.repository.defaultBranch,
          undefined,
          undefined,
          {changesBranch: 'next'}
        );
      }, ConfigurationError);
    });

    it('should throw a configuration error for a malformed manifest config', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw('{"malformed json"'))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/versions/versions.json'
          )
        );
      await assert.rejects(
        async () => {
          await Manifest.fromManifest(
            github,
            github.repository.defaultBranch,
            undefined,
            undefined,
            {changesBranch: 'next'}
          );
        },
        e => {
          console.log(e);
          return e instanceof ConfigurationError && e.message.includes('parse');
        }
      );
    });

    it('should throw a configuration error for a malformed manifest config', async () => {
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(
          buildGitHubFileContent(fixturesPath, 'manifest/config/config.json')
        )
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw('{"malformed json"'));
      await assert.rejects(
        async () => {
          await Manifest.fromManifest(
            github,
            github.repository.defaultBranch,
            undefined,
            undefined,
            {changesBranch: 'next'}
          );
        },
        e => {
          console.log(e);
          return e instanceof ConfigurationError && e.message.includes('parse');
        }
      );
    });
  });

  describe('fromConfig', () => {
    it('should pass strategy options to the strategy', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(Object.keys(manifest.releasedVersions)).lengthOf(1).toMatchSnapshot();
    });
    it('should find custom release pull request title', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--components--foobar',
            baseBranchName: 'main',
            title: 'release: 1.2.3',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        pullRequestTitlePattern: 'release: ${version}',
        component: 'foobar',
        includeComponentInTag: false,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(Object.keys(manifest.releasedVersions)).lengthOf(1).toMatchSnapshot();
    });
    it('finds previous release without tag', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 1.2.3',
            headBranchName:
              'release-please--branches--main--components--foobar',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'foobar',
        includeComponentInTag: false,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(Object.keys(manifest.releasedVersions)).lengthOf(1).toMatchSnapshot();
    });
    it('finds previous release with tag', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'foobar-v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'foobar',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(Object.keys(manifest.releasedVersions)).lengthOf(1).toMatchSnapshot();
    });
    it('finds manually tagged release', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'other-v3.3.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(
        Object.keys(manifest.releasedVersions),
        'found release versions'
      ).lengthOf(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).to.eql(
        '3.3.3'
      );
    });
    it('finds legacy tags', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, []);
      mockTags(github, [
        {
          name: 'other-v3.3.3',
          sha: 'abc123',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(
        Object.keys(manifest.releasedVersions),
        'found release versions'
      ).lengthOf(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).to.eql(
        '3.3.3'
      );
    });
    it('ignores manually tagged release if commit not found', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'other-v3.3.3',
          sha: 'def234',
          url: 'http://path/to/release',
        },
      ]);
      mockTags(github, []);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(Object.keys(manifest.releasedVersions), 'found release versions')
        .to.be.empty;
    });
    it('finds largest manually tagged release', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
        {
          sha: 'def234',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'other-v3.3.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
        {
          id: 654321,
          tagName: 'other-v3.3.2',
          sha: 'def234',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(
        Object.keys(manifest.releasedVersions),
        'found release versions'
      ).lengthOf(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).to.eql(
        '3.3.3'
      );
    });
    it('finds largest found tagged', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
        {
          sha: 'def234',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/foobar',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release foobar 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, []);
      mockTags(github, [
        {
          name: 'other-v3.3.3',
          sha: 'abc123',
        },
        {
          name: 'other-v3.3.2',
          sha: 'def234',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'other',
        includeComponentInTag: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(
        Object.keys(manifest.releasedVersions),
        'found release versions'
      ).lengthOf(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).to.eql(
        '3.3.3'
      );
    });
    it('finds manually tagged release commit over earlier automated commit', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
        },
        {
          sha: 'def234',
          message: 'this commit should be found',
          files: [],
        },
        {
          sha: 'ghi345',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 3.3.1',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v3.3.2',
          sha: 'def234',
          url: 'http://path/to/release',
        },
        {
          id: 654321,
          tagName: 'v3.3.1',
          sha: 'ghi345',
          url: 'http://path/to/release',
        },
      ]);
      mockTags(github, []);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(
        Object.keys(manifest.releasedVersions),
        'found release versions'
      ).lengthOf(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).to.eql(
        '3.3.2'
      );
    });
    it('allows configuring includeVInTag', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.2.3',
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'abc123',
          url: 'http://path/to/release',
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        includeVInTag: false,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(Object.keys(manifest.releasedVersions)).lengthOf(1).toMatchSnapshot();
      expect(manifest.repositoryConfig['.'].includeVInTag).to.be.false;
    });

    it('finds latest published release', async () => {
      mockReleases(github, []);
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 1.2.4-SNAPSHOT',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 1.2.3',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'java',
        includeComponentInTag: false,
      });
      expect(Object.keys(manifest.releasedVersions)).lengthOf(1).toMatchSnapshot();
      expect(manifest.releasedVersions['.'].toString()).to.be.equal('1.2.3');
    });
    it('falls back to release without component in tag', async () => {
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
        },
        {
          sha: 'def234',
          message: 'this commit should be found',
          files: [],
        },
        {
          sha: 'ghi345',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 3.3.1',
            // fails to match legacy branch name without component
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v3.3.1',
          sha: 'ghi345',
          url: 'http://path/to/release',
        },
      ]);
      mockTags(github, []);

      const manifest = await Manifest.fromConfig(github, 'target-branch', {
        releaseType: 'simple',
        bumpMinorPreMajor: true,
        bumpPatchForMinorPreMajor: true,
        component: 'foobar',
        includeComponentInTag: false,
      });
      expect(Object.keys(manifest.repositoryConfig)).lengthOf(1).toMatchSnapshot();
      expect(
        Object.keys(manifest.releasedVersions),
        'found release versions'
      ).lengthOf(1);
      expect(Object.values(manifest.releasedVersions)[0].toString()).to.eql(
        '3.3.1'
      );
    });

    it('should fail if graphQL commits API is too slow', async () => {
      // In this scenario, graphQL fails with a 502 when pulling the list of
      // recent commits. We are unable to determine the latest release and thus
      // we should abort with the underlying API error.
      const scope = nock('https://api.github.com/')
        .post('/graphql')
        .times(6) // original + 5 retries
        .reply(502);

      const sleepStub = vi.spyOn(github, <any>'sleepInMs').mockResolvedValue(); // eslint-disable-line @typescript-eslint/no-explicit-any
      await assert.rejects(
        async () => {
          await Manifest.fromConfig(github, 'target-branch', {
            releaseType: 'simple',
            bumpMinorPreMajor: true,
            bumpPatchForMinorPreMajor: true,
            component: 'foobar',
            includeComponentInTag: false,
          });
        },
        (error: unknown) => {
          return (
            error instanceof GitHubAPIError &&
            (error as GitHubAPIError).status === 502
          );
        }
      );
      scope.done();
      expect(sleepStub).to.have.callCount(5);
    });
  });

  describe('buildPullRequests', () => {
    describe('with basic config', () => {
      beforeEach(() => {
        mockReleases(github, [
          {
            id: 123456,
            sha: 'abc123',
            tagName: 'v1.0.0',
            url: 'https://github.com/fake-owner/fake-repo/releases/tag/v1.0.0',
          },
        ]);
        mockTags(github, [
          {
            sha: 'abc123',
            name: 'v1.0.0',
          },
        ]);
        mockCommits(github, [
          {
            sha: 'def456',
            message: 'fix: some bugfix',
            files: [],
          },
          {
            sha: 'abc123',
            message: 'chore: release 1.0.0',
            files: [],
            pullRequest: {
              headBranchName: 'release-please/branches/main',
              baseBranchName: 'main',
              number: 123,
              title: 'chore: release 1.0.0',
              body: '',
              labels: [],
              files: [],
              sha: 'abc123',
            },
          },
        ]);
      });

      it('should handle single package repository', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.version?.toString()).to.eql('1.0.1');
        expect(pullRequest.previousVersion?.toString()).to.eql('1.0.0');
        expect(
          pullRequest.version!.compareBump(pullRequest.previousVersion!)
        ).to.eql('patch');
        // simple release type updates the changelog and version.txt
        assertHasUpdate(pullRequest.updates, 'CHANGELOG.md');
        assertHasUpdate(pullRequest.updates, 'version.txt');
        assertHasUpdate(pullRequest.updates, '.release-please-manifest.json');
        expect(pullRequest.headRefName).to.eql(
          'release-please--branches--main'
        );
      });

      it('should identify prerelease bumps as such', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
              versioning: 'prerelease',
            },
          },
          {
            '.': Version.parse('0.1.0-alpha.28'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.version?.toString()).to.eql('0.1.0-alpha.29');
        expect(pullRequest.previousVersion?.toString()).to.eql(
          '0.1.0-alpha.28'
        );
        expect(
          pullRequest.version!.compareBump(pullRequest.previousVersion!)
        ).to.eql('preRelease');
        // simple release type updates the changelog and version.txt
        assertHasUpdate(pullRequest.updates, 'CHANGELOG.md');
        assertHasUpdate(pullRequest.updates, 'version.txt');
        assertHasUpdate(pullRequest.updates, '.release-please-manifest.json');
        expect(pullRequest.headRefName).to.eql(
          'release-please--branches--main'
        );
      });

      it('should honour the manifestFile argument in Manifest.fromManifest', async () => {
        const getFileContentsStub = vi
          .spyOn(github, 'getFileContentsOnBranch')
          .withArgs('release-please-config.json', 'next')
          .mockResolvedValue(
            buildGitHubFileContent(fixturesPath, 'manifest/config/simple.json')
          )
          .withArgs('non/default/path/manifest.json', 'next')
          .mockResolvedValue(
            buildGitHubFileContent(
              fixturesPath,
              'manifest/versions/simple.json'
            )
          );
        const manifest = await Manifest.fromManifest(
          github,
          'main',
          undefined,
          'non/default/path/manifest.json',
          {changesBranch: 'next'}
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        assertHasUpdate(pullRequest.updates, 'non/default/path/manifest.json');

        expect(getFileContentsStub).to.have.been.calledWith(
          'non/default/path/manifest.json',
          'next'
        );
      });

      it('should create a draft pull request', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
              draftPullRequest: true,
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.draft).to.be.true;
      });

      it('should create a draft pull request manifest wide', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          },
          {
            draftPullRequest: true,
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.draft).to.be.true;
      });

      it('allows customizing pull request labels', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          },
          {
            labels: ['some-special-label'],
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.labels).to.eql(['some-special-label']);
      });

      it('allows customizing pull request title', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
              pullRequestTitlePattern: 'release: ${version}',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.title.toString()).to.eql('release: 1.0.1');
      });

      it('allows customizing pull request header', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
              pullRequestHeader: 'No beep boop for you',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.body.header.toString()).to.eql(
          'No beep boop for you'
        );
      });
    });

    it('should find the component from config', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).to.eql('1.0.1');
      expect(pullRequest.previousVersion?.toString()).to.eql('1.0.0');
      expect(
        pullRequest.version!.compareBump(pullRequest.previousVersion!)
      ).to.eql('patch');
      expect(pullRequest.headRefName).to.eql(
        'release-please--branches--main--components--pkg1'
      );
    });

    it('should handle multiple package repository', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[0].labels).to.eql(['autorelease: pending']);
      expect(dateSafe(pullRequests[0].body.toString())).toMatchSnapshot();
    });

    it('should ignore multiple package release commits', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def234',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(0).toMatchSnapshot();
    });

    it('should allow creating multiple pull requests', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(2).toMatchSnapshot();
      expect(dateSafe(pullRequests[0].body.toString())).toMatchSnapshot();
      expect(dateSafe(pullRequests[1].body.toString())).toMatchSnapshot();
    });

    it('should allow forcing release-as on a single component', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const config: ManifestConfig = {
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
            'release-as': '3.3.3',
          },
        },
      };
      const versions = {
        'path/a': '1.0.0',
        'path/b': '0.2.3',
      };
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(2).toMatchSnapshot();
      expect(pullRequests[0].version?.toString()).to.eql('1.0.1');
      expect(pullRequests[1].version?.toString()).to.eql('3.3.3');
    });

    it('should allow forcing release-as on entire manifest', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const config: ManifestConfig = {
        'release-as': '3.3.3',
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '1.0.0',
        'path/b': '0.2.3',
      };
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(2).toMatchSnapshot();
      expect(pullRequests[0].version?.toString()).to.eql('3.3.3');
      expect(pullRequests[1].version?.toString()).to.eql('3.3.3');
    });

    it('should use version from existing PR title if differs from release branch manifest', async () => {
      mockReleases(github, [
        {
          id: 11111,
          sha: 'commit1',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 22222,
          sha: 'commit2',
          tagName: 'pkg2-v2.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v2.0.0',
        },
        {
          id: 33333,
          sha: 'commit3',
          tagName: 'pkg3-v3.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg3-v3.0.0',
        },
        {
          id: 44444,
          sha: 'commit4',
          tagName: 'pkg4-v4.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg4-v4.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'commit11',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'commit22',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'commit33',
          message: 'fix: some bugfix',
          files: ['path/c/foo'],
        },
        {
          sha: 'commit44',
          message: 'fix: some bugfix',
          files: ['path/d/foo'],
        },
        {
          sha: 'commit1',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg1',
            baseBranchName: 'main',
            number: 111,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'commit1',
          },
        },
        {
          sha: 'commit2',
          message: 'chore: release 2.0.0',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg2',
            baseBranchName: 'main',
            number: 222,
            title: 'chore: release 2.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'commit2',
          },
        },
        {
          sha: 'commit3',
          message: 'chore: release 3.0.0',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg3',
            baseBranchName: 'main',
            number: 333,
            title: 'chore: release 3.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'commit3',
          },
        },
        {
          sha: 'commit4',
          message: 'chore: release 4.0.0',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg4',
            baseBranchName: 'main',
            number: 444,
            title: 'chore: release 4.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'commit4',
          },
        },
      ]);
      const config: ManifestConfig = {
        'separate-pull-requests': true,
        'release-type': 'simple',
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'node',
            component: 'pkg2',
          },
          'path/c': {
            'release-type': 'python',
            component: 'pkg3',
          },
          'path/d': {
            'release-type': 'go',
            component: 'pkg4',
          },
        },
      };

      const getFileContentsOnBranchStub = vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              'path/a': '1.0.0',
              'path/b': '2.0.0',
              'path/c': '3.0.0',
              'path/d': '4.0.0',
            })
          )
        )
        .withArgs(
          '.release-please-manifest.json',
          'release-please--branches--main--changes--next--components--pkg1'
        )
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              'path/a': '1.0.1',
            })
          )
        )
        .withArgs(
          '.release-please-manifest.json',
          'release-please--branches--main--changes--next--components--pkg2'
        )
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              'path/b': '2.0.1',
            })
          )
        )
        .withArgs('path/b/package.json', 'next')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              name: 'pkg2',
            })
          )
        )
        .withArgs(
          '.release-please-manifest.json',
          'release-please--branches--main--changes--next--components--pkg3'
        )
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              'path/c': '3.0.1',
            })
          )
        )
        .withArgs('path/c/setup.py', 'next')
        .mockResolvedValue(
          buildGitHubFileRaw(
            `
name = "pkg3"
description = "Something"
version = "3.0.0"
`
          )
        )
        .withArgs(
          '.release-please-manifest.json',
          'release-please--branches--main--changes--next--components--pkg4'
        )
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              'path/d': '4.0.1',
            })
          )
        );

      const findFilesByFilenameAndRefStub = vi
        .spyOn(github, 'findFilesByFilenameAndRef')
        .withArgs('version.py', 'next', 'path/c')
        .mockResolvedValue([]);

      // need to avoid making a request for go versioning
      vi.spyOn(github, 'findFilesByGlobAndRef').mockResolvedValue([]);

      const addIssueLabelsStub = vi
        .spyOn(github, 'addIssueLabels')
        .withArgs([DEFAULT_CUSTOM_VERSION_LABEL], 111)
        .mockResolvedValue();

      let commentCount = 0;
      vi.spyOn(github, 'commentOnIssue').mockImplementation((comment, number) => {
        expect(comment).toMatchSnapshot();
        expect(number).to.be.oneOf([111, 222, 333, 444]);
        commentCount += 1;
        return Promise.resolve('https://foo/bar');
      });

      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next'}
      );

      const pullRequests = await manifest.buildPullRequests(
        [
          {
            title: 'chore(main): release v6.7.9-alpha.1', // version from title differs from PR manifest
            body: 'some content',
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg1',
            baseBranchName: 'main',
            number: 111,
            labels: [],
            files: [],
          },
          {
            title: 'chore(main): release v7.8.9', // version from title differs from PR manifest
            body: 'some content',
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg2',
            baseBranchName: 'main',
            number: 222,
            labels: [],
            files: [],
          },
          {
            title: 'chore(main): release 8.9.0', // version from title differs from PR manifest
            body: 'some content',
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg3',
            baseBranchName: 'main',
            number: 333,
            labels: [],
            files: [],
          },
          {
            title: 'chore(main): release v9.0.1', // version from title differs from PR manifest
            body: 'some content',
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg4',
            baseBranchName: 'main',
            number: 444,
            labels: [],
            files: [],
          },
        ],
        []
      );
      expect(pullRequests).lengthOf(4).toMatchSnapshot();
      expect(pullRequests[0].version?.toString()).to.eql('6.7.9-alpha.1');
      expect(pullRequests[1].version?.toString()).to.eql('7.8.9');
      expect(pullRequests[2].version?.toString()).to.eql('8.9.0');
      expect(pullRequests[3].version?.toString()).to.eql('9.0.1');
      expect(getFileContentsOnBranchStub).to.have.been.called;
      expect(addIssueLabelsStub).to.have.been.called;
      expect(findFilesByFilenameAndRefStub).to.have.been.called;
      expect(commentCount).to.eql(4);
    });

    it('should always use PR title version when labelled as custom version', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const config: ManifestConfig = {
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };

      const getFileContentsOnBranchStub = vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              'path/a': '1.0.0',
              'path/b': '0.2.3',
            })
          )
        );

      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next'}
      );

      const pullRequests = await manifest.buildPullRequests(
        [
          {
            title: 'chore(main): release v4.5.6-beta.1',
            body: 'some content',
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg2',
            baseBranchName: 'main',
            number: 123,
            labels: [DEFAULT_CUSTOM_VERSION_LABEL], // labeled as custom version, no need to fetch manifest from release branch
            files: [],
          },
        ],
        []
      );
      expect(pullRequests).lengthOf(2).toMatchSnapshot();
      expect(pullRequests[0].version?.toString()).to.eql('1.0.1');
      expect(pullRequests[1].version?.toString()).to.eql('4.5.6-beta.1');
      expect(getFileContentsOnBranchStub).to.have.been.called;
    });

    it('should report issue via PR comment if labeled as custom version but version not found in title', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const config: ManifestConfig = {
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };

      const getFileContentsOnBranchStub = vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              'path/a': '1.0.0',
              'path/b': '0.2.3',
            })
          )
        );

      let commented = false;
      vi.spyOn(github, 'commentOnIssue').mockImplementation((comment, number) => {
        expect(comment).toMatchSnapshot();
        expect(number).to.eql(123);
        commented = true;
        return Promise.resolve('https://foo/bar');
      });

      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next'}
      );

      const pullRequests = await manifest.buildPullRequests(
        [
          {
            // title edited by end user, version not valid anymore
            title: 'chore(main): release vCHANGED_TO_SOMETHING_WITHOUT_VERSION',
            body: 'some content',
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg2',
            baseBranchName: 'main',
            number: 123,
            labels: [DEFAULT_CUSTOM_VERSION_LABEL],
            files: [],
          },
        ],
        []
      );
      expect(pullRequests).lengthOf(2).toMatchSnapshot();
      expect(pullRequests[0].version?.toString()).to.eql('1.0.1');
      expect(pullRequests[1].version?.toString()).to.eql('0.2.4'); // should not use version from title
      expect(commented).to.be.true;
      expect(getFileContentsOnBranchStub).to.have.been.called;
    });

    it('should warn end user via PR comment if version not found in title and not labeled as custom version', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const config: ManifestConfig = {
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };

      const getFileContentsOnBranchStub = vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({
              'path/a': '1.0.0',
              'path/b': '0.2.3',
            })
          )
        );

      let commented = false;
      vi.spyOn(github, 'commentOnIssue').mockImplementation((comment, number) => {
        expect(comment).toMatchSnapshot();
        expect(number).to.eql(123);
        commented = true;
        return Promise.resolve('https://foo/bar');
      });

      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next'}
      );

      const pullRequests = await manifest.buildPullRequests(
        [
          {
            // title edited by end user, version not valid anymore
            title: 'chore(main): release vCHANGED_TO_SOMETHING_WITHOUT_VERSION',
            body: 'some content',
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg2',
            baseBranchName: 'main',
            number: 123,
            labels: [], // no custom version label
            files: [],
          },
        ],
        []
      );
      expect(pullRequests).lengthOf(2).toMatchSnapshot();
      expect(pullRequests[0].version?.toString()).to.eql('1.0.1');
      expect(pullRequests[1].version?.toString()).to.eql('0.2.4'); // should not use version from title
      expect(commented).to.be.true;
      expect(getFileContentsOnBranchStub).to.have.been.called;
    });

    it('should allow specifying a bootstrap sha', async () => {
      mockReleases(github, []);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix 1',
          files: ['path/a/foo'],
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix 2',
          files: ['path/a/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'dddddd',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
      ]);
      mockTags(github, []);
      const config: ManifestConfig = {
        'bootstrap-sha': 'cccccc',
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '0.0.0',
        'path/b': '0.0.0',
      };
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[0].version?.toString()).to.eql('0.0.1');
    });

    it('should allow specifying a last release sha', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release 0.2.3',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg2',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 0.2.3',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      mockTags(github, []);
      const config: ManifestConfig = {
        'last-release-sha': 'bbbbbb',
        'separate-pull-requests': true,
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'simple',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '0.0.0',
        'path/b': '0.0.0',
      };
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)));
      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next'}
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[0].version?.toString()).to.eql('0.0.1');
    });

    it('should allow customizing pull request title with root package', async () => {
      mockReleases(github, [
        {
          id: 1,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 2,
          sha: 'abc123',
          tagName: 'root-v1.2.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/root-v1.2.0',
        },
        {
          id: 3,
          sha: 'def234',
          tagName: 'pkg1-v1.0.1',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.1',
        },
        {
          id: 4,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
        {
          id: 5,
          sha: 'def234',
          tagName: 'root-v1.2.1',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/root-v1.2.1',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release v1.2.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release v1.2.1',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release v1.2.1',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            component: 'root',
          },
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          '.': Version.parse('1.2.1'),
          'path/a': Version.parse('1.0.1'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          groupPullRequestTitlePattern:
            'chore${scope}: release${component} v${version}',
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      const pullRequest = pullRequests[0];
      expect(pullRequest.title.toString()).to.eql(
        'chore(main): release root v1.2.2'
      );
      expect(dateSafe(pullRequest.body.toString())).toMatchSnapshot();
    });

    it('should allow customizing pull request title without root package', async () => {
      mockReleases(github, [
        {
          id: 1,
          sha: 'abc123',
          tagName: 'pkg1-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
        },
        {
          id: 2,
          sha: 'def234',
          tagName: 'pkg1-v1.0.1',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.1',
        },
        {
          id: 3,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release v1.2.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release v1.2.1',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release v1.2.1',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.1'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          groupPullRequestTitlePattern:
            'chore${scope}: release${component} v${version}',
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[0].title.toString()).to.eql('chore(main): release v');
    });

    it('should read latest version from manifest if no release tag found', async () => {
      mockReleases(github, []);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'bbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'commit1',
          message: 'release: 1.2.3',
          files: ['path/a/foo'],
          pullRequest: {
            headBranchName:
              'release-please--branches--main--changes--next--components--pkg1',
            baseBranchName: 'main',
            number: 111,
            title: 'release: 1.2.3',
            body: '',
            labels: ['tagged'],
            files: ['path/a/foo'],
            sha: 'commit1',
          },
        },
        // should be included in pkg1 new release, commits created after v1.2.3
        ...Array.from({length: 100}, (_, i) => ({
          sha: `ccc${i}`,
          message: `fix: some fix ${i}`,
          files: ['path/a/foo'],
        })),
        {
          sha: 'commit2',
          message: 'release: 2.3.4',
          files: ['path/b/package.json'],
          pullRequest: {
            headBranchName:
              'release-please/branches/main/changes/next/components/pkg2',
            baseBranchName: 'main',
            number: 222,
            title: 'release: 2.3.4',
            body: '',
            labels: ['tagged'],
            files: ['path/b/foo'],
            sha: 'commit2',
          },
          // should not be included in pgk2 new release, commits created before v2.3.4
          ...Array.from({length: 100}, (_, i) => ({
            sha: `ddd${i}`,
            message: `fix: some fix ${i}`,
            files: ['path/b/foo'],
          })),
        },
      ]);
      mockTags(github, []);
      const config: ManifestConfig = {
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'node',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '1.2.3',
        'path/b': '2.3.4',
      };
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'next')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)))
        .withArgs('path/b/package.json', 'next')
        .mockResolvedValue(
          buildGitHubFileRaw(JSON.stringify({name: 'b', version: '2.3.4'}))
        );
      const manifest = await Manifest.fromManifest(
        github,
        'main',
        undefined,
        undefined,
        {changesBranch: 'next', separatePullRequests: true}
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(2).toMatchSnapshot();
      expect(pullRequests[0].body.releaseData).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[0].conventionalCommits).lengthOf(102).toMatchSnapshot();
      expect(pullRequests[0].body.releaseData[0].component).to.eql('pkg1');
      expect(pullRequests[0].body.releaseData[0].version?.toString()).to.eql(
        '1.2.4'
      );
      expect(pullRequests[1].body.releaseData).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[1].conventionalCommits).lengthOf(2).toMatchSnapshot();
      expect(pullRequests[1].body.releaseData[0].component).to.eql('pkg2');
      expect(pullRequests[1].body.releaseData[0].version?.toString()).to.eql(
        '2.3.5'
      );
    });

    it('should use latest version from tag if github releases not found but tag found', async () => {
      mockReleases(github, []);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'bbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'commit1',
          message: 'release: 1.2.3',
          files: ['path/a/foo'],
        },
        {
          sha: 'commit2',
          message: 'release: 2.3.4',
          files: ['path/b/package.json'],
        },
        {
          sha: 'ccc',
          message: 'chore: some chore',
          files: ['path/a/foo'],
        },
        {
          sha: 'ddd',
          message: 'chore: some chore',
          files: ['path/b/foo'],
        },
      ]);
      mockTags(github, [
        {name: 'pkg1-v1.2.3', sha: 'commit1'},
        {name: 'pkg2-v2.3.4', sha: 'commit2'},
      ]);
      const config = {
        packages: {
          'path/a': {
            'release-type': 'simple',
            component: 'pkg1',
          },
          'path/b': {
            'release-type': 'node',
            component: 'pkg2',
          },
        },
      };
      const versions = {
        'path/a': '1.2.3',
        'path/b': '2.3.4',
      };
      const getFileContentsOnBranchStub = vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('release-please-config.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(config)))
        .withArgs('.release-please-manifest.json', 'main')
        .mockResolvedValue(buildGitHubFileRaw(JSON.stringify(versions)))
        .withArgs('path/b/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(JSON.stringify({name: 'b', version: '2.3.4'}))
        );

      const manifest = await Manifest.fromManifest(github, 'main');
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[0].body.releaseData).lengthOf(2).toMatchSnapshot();
      expect(pullRequests[0].body.releaseData[0].component).to.eql('pkg1');
      expect(pullRequests[0].body.releaseData[0].version?.toString()).to.eql(
        '1.2.4'
      );
      expect(pullRequests[0].body.releaseData[1].component).to.eql('pkg2');
      expect(pullRequests[0].body.releaseData[1].version?.toString()).to.eql(
        '2.3.5'
      );
      expect(getFileContentsOnBranchStub).to.have.been.called;
    });

    it('should not update manifest if unpublished version is created', async () => {
      mockReleases(github, [
        {
          id: 123456,
          tagName: 'v1.2.3',
          sha: 'def234',
          url: 'http://path/to/release',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'abc123',
          message: 'some commit message',
          files: [],
          pullRequest: {
            title: 'chore: release 1.2.3',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            body: '',
            labels: [],
            files: [],
          },
        },
      ]);

      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'java',
          },
        },
        {
          '.': Version.parse('1.2.3'),
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).to.eql('1.2.4-SNAPSHOT');
      expect(pullRequest.previousVersion?.toString()).to.eql('1.2.3');
      expect(
        pullRequest.version!.compareBump(pullRequest.previousVersion!)
      ).to.eql('patch');
      // simple release type updates the changelog and version.txt
      assertNoHasUpdate(pullRequest.updates, 'CHANGELOG.md');
      assertNoHasUpdate(pullRequest.updates, '.release-please-manifest.json');
      expect(pullRequest.headRefName).to.eql('release-please--branches--main');
    });

    describe('without commits', () => {
      beforeEach(() => {
        mockReleases(github, [
          {
            id: 123456,
            sha: 'abc123',
            tagName: 'v1.0.0',
            url: 'https://github.com/fake-owner/fake-repo/releases/tag/v1.0.0',
          },
        ]);
        mockCommits(github, []);
      });
      it('should ignore by default', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'simple',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(0).toMatchSnapshot();
      });

      it('should delegate to strategies', async () => {
        const getFileContentsStub = vi.spyOn(
          github,
          'getFileContentsOnBranch'
        );
        getFileContentsStub
          .withArgs('versions.txt', 'main')
          .mockResolvedValue(
            buildGitHubFileContent(
              fixturesPath,
              'strategies/java-yoshi/versions-released.txt'
            )
          );
        vi.spyOn(github, 'findFilesByFilenameAndRef').mockResolvedValue([]);
        const manifest = new Manifest(
          github,
          'main',
          {
            '.': {
              releaseType: 'java-yoshi',
            },
          },
          {
            '.': Version.parse('1.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(1).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.version?.toString()).to.eql('1.0.1-SNAPSHOT');
        expect(pullRequest.previousVersion?.toString()).to.eql('1.0.0');
        expect(
          pullRequest.version!.compareBump(pullRequest.previousVersion!)
        ).to.eql('patch');
        expect(pullRequest.headRefName).to.eql(
          'release-please--branches--main'
        );
      });
    });

    it('should handle extra files', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'commit1',
          tagName: 'a-v1.1.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/a-v1.1.0',
        },
        {
          id: 123456,
          sha: 'commit2',
          tagName: 'b-v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/b-v1.0.0',
        },
        {
          id: 123456,
          sha: 'commit3',
          tagName: 'c-v1.0.1',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/c-v1.0.1',
        },
      ]);
      mockTags(github, [
        {
          name: 'a-v1.1.0',
          sha: 'commit1',
        },
        {
          name: 'b-v1.0.0',
          sha: 'commit2',
        },
        {
          name: 'c-v1.0.1',
          sha: 'commit3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: a bugfix',
          files: ['foo', 'pkg.properties'],
        },
        {
          sha: 'bbbbbb',
          message: 'fix: b bugfix',
          files: ['pkg/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: c bugfix',
          files: ['pkg/c/foo'],
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            component: 'a',
            extraFiles: ['root.properties'],
          },
          'pkg/b': {
            releaseType: 'simple',
            component: 'b',
            extraFiles: ['pkg.properties', 'src/version', '/bbb.properties'],
            skipGithubRelease: true,
          },
          'pkg/c': {
            releaseType: 'simple',
            component: 'c',
            extraFiles: ['/pkg/pkg-c.properties', 'ccc.properties'],
            skipGithubRelease: true,
          },
        },
        {
          '.': Version.parse('1.1.0'),
          'pkg/b': Version.parse('1.0.0'),
          'pkg/c': Version.parse('1.0.1'),
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[0].updates).to.be.an('array');
      expect(pullRequests[0].updates.map(update => update.path))
        .to.include.members([
          'root.properties',
          'bbb.properties',
          'pkg/pkg-c.properties',
          'pkg/b/pkg.properties',
          'pkg/b/src/version',
          'pkg/c/ccc.properties',
        ])
        .but.not.include.oneOf([
          'pkg/b/bbb.properties', // should be at root
          'pkg/c/pkg-c.properties', // should be up one level
        ]);
    });

    it('should allow overriding commit message', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/v1.0.0',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
          pullRequest: {
            headBranchName: 'fix-1',
            baseBranchName: 'main',
            number: 123,
            title: 'fix: some bugfix',
            body: 'BEGIN_COMMIT_OVERRIDE\nfix: real fix message\nEND_COMMIT_OVERRIDE',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        },
        {
          draftPullRequest: true,
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      const pullRequest = pullRequests[0];
      safeSnapshot(pullRequest.body.toString());
    });

    describe('with plugins', () => {
      beforeEach(() => {
        mockReleases(github, [
          {
            id: 123456,
            sha: 'abc123',
            tagName: 'pkg1-v1.0.0',
            url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg1-v1.0.0',
          },
          {
            id: 654321,
            sha: 'def234',
            tagName: 'pkg2-v0.2.3',
            url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v1.0.0',
          },
        ]);
        mockCommits(github, [
          {
            sha: 'aaaaaa',
            message: 'fix: some bugfix\nfix:another fix',
            files: ['path/a/foo'],
          },
          {
            sha: 'abc123',
            message: 'chore: release 1.0.0',
            files: [],
            pullRequest: {
              headBranchName: 'release-please/branches/main/components/pkg1',
              baseBranchName: 'main',
              number: 123,
              title: 'chore: release 1.0.0',
              body: '',
              labels: [],
              files: [],
              sha: 'abc123',
            },
          },
          {
            sha: 'bbbbbb',
            message: 'fix: some bugfix',
            files: ['path/b/foo'],
          },
          {
            sha: 'cccccc',
            message: 'fix: some bugfix',
            files: ['path/a/foo'],
          },
          {
            sha: 'def234',
            message: 'chore: release 0.2.3',
            files: [],
            pullRequest: {
              headBranchName: 'release-please/branches/main/components/pkg2',
              baseBranchName: 'main',
              number: 123,
              title: 'chore: release 0.2.3',
              body: '',
              labels: [],
              files: [],
              sha: 'def234',
            },
          },
        ]);
      });

      it('should load and run a single plugins', async () => {
        const mockPlugin = {
          run: vi.fn((arg: unknown) => Promise.resolve(arg)),
          preconfigure: vi.fn((arg: unknown) => Promise.resolve(arg)),
          processCommits: vi.fn((arg: unknown) => Promise.resolve(arg)),
        } as unknown as NodeWorkspace;

        const buildPluginStub = vi
          .spyOn(pluginFactory, 'buildPlugin')
          .withArgs(expect.objectContaining({type: 'node-workspace'}))
          .mockReturnValue(mockPlugin);
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
              packageName: 'pkg1',
            },
            'path/b': {
              releaseType: 'node',
              component: 'pkg2',
              packageName: 'pkg2',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
            'path/b': Version.parse('0.2.3'),
          },
          {
            separatePullRequests: true,
            plugins: ['node-workspace'],
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).not.empty;
        expect(mockPlugin.run).to.have.been.calledOnce;
        expect(buildPluginStub).to.have.been.calledOnce;
      });

      it('should load and run multiple plugins', async () => {
        const mockPlugin = {
          run: vi.fn((arg: unknown) => Promise.resolve(arg)),
          preconfigure: vi.fn((arg: unknown) => Promise.resolve(arg)),
          processCommits: vi.fn((arg: unknown) => Promise.resolve(arg)),
        } as unknown as NodeWorkspace;
        const mockPlugin2 = {
          run: vi.fn((arg: unknown) => Promise.resolve(arg)),
          preconfigure: vi.fn((arg: unknown) => Promise.resolve(arg)),
          processCommits: vi.fn((arg: unknown) => Promise.resolve(arg)),
        } as unknown as CargoWorkspace;
        vi
          .spyOn(pluginFactory, 'buildPlugin')
          .withArgs(expect.objectContaining({type: 'node-workspace'}))
          .mockReturnValue(mockPlugin)
          .withArgs(expect.objectContaining({type: 'cargo-workspace'}))
          .mockReturnValue(mockPlugin2);
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
              packageName: '@foo/pkg1',
            },
            'path/b': {
              releaseType: 'node',
              component: 'pkg2',
              packageName: '@foo/pkg2',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
            'path/b': Version.parse('0.2.3'),
          },
          {
            separatePullRequests: true,
            plugins: ['node-workspace', 'cargo-workspace'],
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).not.empty;
        expect(mockPlugin.run).to.have.been.calledOnce;
        expect(mockPlugin2.run).to.have.been.calledOnce;
      });

      it('should apply plugin hook "processCommits"', async () => {
        const sentenceCasePlugin = new SentenceCase(
          github,
          'main',
          DEFAULT_RELEASE_PLEASE_MANIFEST,
          {}
        );
        vi.spyOn(sentenceCasePlugin, 'processCommits');
        vi
          .spyOn(pluginFactory, 'buildPlugin')
          .withArgs(expect.objectContaining({type: 'sentence-case'}))
          .returns(sentenceCasePlugin);
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
              packageName: 'pkg1',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
          },
          {
            plugins: ['sentence-case'],
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).not.empty;
        // This assertion verifies that conventional commit parsing
        // was applied before calling the processCommits plugin hook:
        expect(sentenceCasePlugin.processCommits).to.have.been.calledWith([
          {
            sha: 'aaaaaa',
            message: 'fix: Another fix',
            files: ['path/a/foo'],
            pullRequest: undefined,
            type: 'fix',
            scope: null,
            bareMessage: 'Another fix',
            notes: [],
            references: [],
            breaking: false,
          },
          {
            sha: 'aaaaaa',
            message: 'fix: Some bugfix',
            files: ['path/a/foo'],
            pullRequest: undefined,
            type: 'fix',
            scope: null,
            bareMessage: 'Some bugfix',
            notes: [],
            references: [],
            breaking: false,
          },
        ]);
      });
    });

    it('should fallback to tagged version', async () => {
      mockReleases(github, []);
      mockTags(github, [
        {
          name: 'pkg1-v1.0.0',
          sha: 'abc123',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).to.eql('1.0.1');
      expect(pullRequest.previousVersion?.toString()).to.eql('1.0.0');
      expect(
        pullRequest.version!.compareBump(pullRequest.previousVersion!)
      ).to.eql('patch');
      expect(pullRequest.headRefName).to.eql(
        'release-please--branches--main--components--pkg1'
      );
    });

    it('should handle mixing componentless configs', async () => {
      mockReleases(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'v1.0.0',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/v1.0.0',
        },
        {
          id: 654321,
          sha: 'def234',
          tagName: 'pkg2-v0.2.3',
          url: 'https://github.com/fake-owner/fake-repo/releases/tag/pkg2-v0.2.3',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'aaaaaa',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'abc123',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
        {
          sha: 'bbbbbb',
          message: 'fix: some bugfix',
          files: ['path/b/foo'],
        },
        {
          sha: 'cccccc',
          message: 'fix: some bugfix',
          files: ['path/a/foo'],
        },
        {
          sha: 'def234',
          message: 'chore: release main',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release main',
            body: '',
            labels: [],
            files: [],
            sha: 'def234',
          },
        },
      ]);
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'simple',
            component: 'pkg1',
            includeComponentInTag: false,
          },
          'path/b': {
            releaseType: 'simple',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        }
      );
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      expect(pullRequests[0].labels).to.eql(['autorelease: pending']);
      expect(dateSafe(pullRequests[0].body.toString())).toMatchSnapshot();
    });

    it('should allow customizing release-search-depth', async () => {
      const releaseStub = mockReleases(github, []);
      mockTags(github, [
        {
          name: 'pkg1-v1.0.0',
          sha: 'abc123',
        },
      ]);
      mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        },
        {
          releaseSearchDepth: 1,
        }
      );
      expect(manifest.releaseSearchDepth).to.eql(1);
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).to.eql('1.0.1');
      expect(pullRequest.previousVersion?.toString()).to.eql('1.0.0');
      expect(
        pullRequest.version!.compareBump(pullRequest.previousVersion!)
      ).to.eql('patch');
      expect(pullRequest.headRefName).to.eql(
        'release-please--branches--main--components--pkg1'
      );
      expect(releaseStub).to.have.been.calledOnceWith(expect.objectContaining({maxResults: 1}));
    });

    it('should allow customizing commit-search-depth', async () => {
      mockReleases(github, []);
      mockTags(github, [
        {
          name: 'pkg1-v1.0.0',
          sha: 'abc123',
        },
      ]);
      const commitsStub = mockCommits(github, [
        {
          sha: 'def456',
          message: 'fix: some bugfix',
          files: [],
        },
        {
          sha: 'abc123',
          message: 'chore: release 1.0.0',
          files: [],
          pullRequest: {
            headBranchName: 'release-please/branches/main/components/pkg1',
            baseBranchName: 'main',
            number: 123,
            title: 'chore: release 1.0.0',
            body: '',
            labels: [],
            files: [],
            sha: 'abc123',
          },
        },
      ]);
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileContent(
            fixturesPath,
            'manifest/repo/node/pkg1/package.json'
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.0.0'),
        },
        {
          commitSearchDepth: 1,
        }
      );
      expect(manifest.commitSearchDepth).to.eql(1);
      const pullRequests = await manifest.buildPullRequests([], []);
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      const pullRequest = pullRequests[0];
      expect(pullRequest.version?.toString()).to.eql('1.0.1');
      expect(pullRequest.previousVersion?.toString()).to.eql('1.0.0');
      expect(
        pullRequest.version!.compareBump(pullRequest.previousVersion!)
      ).to.eql('patch');
      expect(pullRequest.headRefName).to.eql(
        'release-please--branches--main--components--pkg1'
      );
      expect(commitsStub).to.have.been.calledOnceWith('main', expect.objectContaining({maxResults: 1}));
    });

    describe('with multiple components', () => {
      beforeEach(() => {
        mockReleases(github, []);
        mockTags(github, [
          {
            name: 'b-v1.0.0',
            sha: 'abc123',
          },
          {
            name: 'c-v2.0.0',
            sha: 'abc123',
          },
          {
            name: 'd-v3.0.0',
            sha: 'abc123',
          },
          {
            name: 'v3.0.0',
            sha: 'abc123',
          },
        ]);
        mockCommits(github, [
          {
            sha: 'def456',
            message: 'fix: some bugfix',
            files: ['pkg/b/foo.txt', 'pkg/c/foo.txt', 'pkg/d/foo.txt'],
          },
          {
            sha: 'abc123',
            message: 'chore: release main',
            files: [],
            pullRequest: {
              headBranchName: 'release-please/branches/main/components/pkg1',
              baseBranchName: 'main',
              number: 123,
              title: 'chore: release main',
              body: '',
              labels: [],
              files: [],
              sha: 'abc123',
            },
          },
        ]);
        const getFileContentsStub = vi.spyOn(
          github,
          'getFileContentsOnBranch'
        );
        getFileContentsStub
          .withArgs('package.json', 'main')
          .mockResolvedValue(
            buildGitHubFileContent(
              fixturesPath,
              'manifest/repo/node/pkg1/package.json'
            )
          );
      });

      it('should allow configuring separate pull requests', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            'pkg/b': {
              releaseType: 'simple',
              component: 'b',
            },
            'pkg/c': {
              releaseType: 'simple',
              component: 'c',
            },
            'pkg/d': {
              releaseType: 'simple',
              component: 'd',
            },
          },
          {
            'pkg/b': Version.parse('1.0.0'),
            'pkg/c': Version.parse('2.0.0'),
            'pkg/d': Version.parse('3.0.0'),
          },
          {
            separatePullRequests: true,
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(3).toMatchSnapshot();
        const pullRequestB = pullRequests[0];
        expect(pullRequestB.headRefName).to.eql(
          'release-please--branches--main--components--b'
        );
        const pullRequestC = pullRequests[1];
        expect(pullRequestC.headRefName).to.eql(
          'release-please--branches--main--components--c'
        );
        const pullRequestD = pullRequests[2];
        expect(pullRequestD.headRefName).to.eql(
          'release-please--branches--main--components--d'
        );
      });

      it('should allow configuring individual separate pull requests', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            'pkg/b': {
              releaseType: 'simple',
              component: 'b',
            },
            'pkg/c': {
              releaseType: 'simple',
              component: 'c',
            },
            'pkg/d': {
              releaseType: 'simple',
              component: 'd',
              separatePullRequests: true,
            },
          },
          {
            'pkg/b': Version.parse('1.0.0'),
            'pkg/c': Version.parse('2.0.0'),
            'pkg/d': Version.parse('3.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(2).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.headRefName).to.eql(
          'release-please--branches--main'
        );
        const mainPullRequest = pullRequests[1];
        expect(mainPullRequest.headRefName).to.eql(
          'release-please--branches--main--components--d'
        );
      });

      it('should allow configuring individual separate pull requests with includeComponentInTag = false', async () => {
        const manifest = new Manifest(
          github,
          'main',
          {
            'pkg/b': {
              releaseType: 'simple',
              component: 'b',
            },
            'pkg/c': {
              releaseType: 'simple',
              component: 'c',
            },
            'pkg/d': {
              releaseType: 'simple',
              component: 'd',
              separatePullRequests: true,
              includeComponentInTag: false,
            },
          },
          {
            'pkg/b': Version.parse('1.0.0'),
            'pkg/c': Version.parse('2.0.0'),
            'pkg/d': Version.parse('3.0.0'),
          }
        );
        const pullRequests = await manifest.buildPullRequests([], []);
        expect(pullRequests).lengthOf(2).toMatchSnapshot();
        const pullRequest = pullRequests[0];
        expect(pullRequest.headRefName).to.eql(
          'release-please--branches--main'
        );
        const mainPullRequest = pullRequests[1];
        expect(mainPullRequest.headRefName).to.eql(
          'release-please--branches--main--components--d'
        );
      });
    });
  });

  describe('createPullRequests', () => {
    it('handles no pull requests', async () => {
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      mockPullRequests(github, []);
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequests = await manifest.createPullRequests();
      expect(pullRequests).to.be.empty;
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });

    it('handles a single pull request', async () => {
      vi
        .spyOn(github, 'createPullRequest')
        .withArgs(
          expect.objectContaining({headBranchName: 'release-please/branches/main'}),
          'main',
          'main',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(github, []);
      vi.spyOn(github, 'getPullRequest').withArgs(22).mockResolvedValue({
        number: 22,
        title: 'pr title1',
        body: 'pr body1',
        headBranchName: 'release-please/branches/main',
        baseBranchName: 'main',
        labels: [],
        files: [],
      });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequests = await manifest.createPullRequests();
      expect(pullRequests).lengthOf(1).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });

    it('handles a multiple pull requests', async () => {
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'))
        .withArgs('pkg2/README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content-2'));
      mockPullRequests(github, []);
      vi
        .spyOn(github, 'getPullRequest')
        .withArgs(123)
        .mockResolvedValue({
          number: 123,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        })
        .withArgs(124)
        .mockResolvedValue({
          number: 124,
          title: 'pr title2',
          body: 'pr body2',
          headBranchName: 'release-please/branches/main2',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      vi
        .spyOn(github, 'createPullRequest')
        .withArgs(
          expect.objectContaining({headBranchName: 'release-please/branches/main'}),
          'main',
          'main',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 123,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        })
        .withArgs(
          expect.objectContaining({headBranchName: 'release-please/branches/main2'}),
          'main',
          'main',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 124,
          title: 'pr title2',
          body: 'pr body2',
          headBranchName: 'release-please/branches/main2',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes 2',
            },
          ]),
          updates: [
            {
              path: 'pkg2/README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content 2'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main2',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequests = await manifest.createPullRequests();
      expect(pullRequests.map(pullRequest => pullRequest!.number)).to.eql([
        123, 124,
      ]);
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });

    it('handles signoff users', async () => {
      vi
        .spyOn(github, 'createPullRequest')
        .withArgs(
          expect.objectContaining({headBranchName: 'release-please/branches/main'}),
          'main',
          'main',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(github, []);
      vi.spyOn(github, 'getPullRequest').withArgs(22).mockResolvedValue({
        number: 22,
        title: 'pr title1',
        body: 'pr body1',
        headBranchName: 'release-please/branches/main',
        baseBranchName: 'main',
        labels: [],
        files: [],
      });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
          signoff: 'Alice <alice@example.com>',
        }
      );
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).lengthOf(1).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });

    it('handles fork = true', async () => {
      vi
        .spyOn(github, 'createPullRequest')
        .withArgs(
          expect.objectContaining({headBranchName: 'release-please/branches/main'}),
          'main',
          'main',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({fork: true, draft: false})
        )
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(github, []);
      vi.spyOn(github, 'getPullRequest').withArgs(22).mockResolvedValue({
        number: 22,
        title: 'pr title1',
        body: 'pr body1',
        headBranchName: 'release-please/branches/main',
        baseBranchName: 'main',
        labels: [],
        files: [],
      });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
          fork: true,
        }
      );
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).lengthOf(1).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });

    it('enables auto-merge when filters are provided (filters: version bump, commit type, commit scope, match-all)', async () => {
      const createPullRequestStub = vi
        .spyOn(github, 'createPullRequest')
        .mockResolvedValue({
          number: 22,
          title: 'pr title',
          body: 'pr body',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const enablePullRequestAutoMergeStub = vi
        .spyOn(github, 'enablePullRequestAutoMerge')
        .mockResolvedValue('direct-merged');
      const addPullRequestReviewersStub = vi
        .spyOn(github, 'addPullRequestReviewers')
        .mockResolvedValue();
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(github, []);
      vi.spyOn(github, 'getPullRequest').withArgs(22).mockResolvedValue({
        number: 22,
        title: 'pr title1',
        body: 'pr body1',
        headBranchName: 'release-please/branches/main',
        baseBranchName: 'main',
        labels: [],
        files: [],
      });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
          'path/c': {
            releaseType: 'node',
            component: 'pkg3',
          },
          'path/d': {
            releaseType: 'node',
            component: 'pkg4',
          },
          'path/e': {
            releaseType: 'node',
            component: 'pkg5',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('1.0.0'),
          'path/c': Version.parse('1.0.0'),
          'path/d': Version.parse('1.0.0'),
          'path/e': Version.parse('1.0.0'),
        },
        {
          separatePullRequests: true,
          autoMerge: {
            mergeMethod: 'rebase',
            versionBumpFilter: ['minor'],
            conventionalCommitFilter: {
              commits: [{type: 'fix', scope: 'api'}],
              matchBehaviour: 'match-all',
            },
          },
        }
      );
      vi
        .spyOn(manifest, 'buildPullRequests')
        .withArgs(expect.anything(), expect.anything())
        .mockResolvedValue([
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/a',
            draft: false,
            version: Version.parse('1.0.1'), // patch bump, does not match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type match filter
                scope: 'api', // scope match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(api): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/b',
            draft: false,
            version: Version.parse('1.1.0'), // minor bump, match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type match filter
                scope: 'api', // scope match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(api): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/b',
            draft: false,
            version: Version.parse('1.1.0'), // minor bump, match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type match filter
                scope: 'api', // scope match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(api): something',
                bareMessage: 'something',
                breaking: false,
              },
              {
                type: 'feat(client)', // type does not match filter
                scope: 'api', // scope match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(api): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/c',
            draft: false,
            version: Version.parse('1.1.0'), // minor bump, match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'feat', // type does not match filter
                scope: 'api', // scope match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'feat(api): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/d',
            draft: false,
            version: Version.parse('1.1.0'), // minor bump, match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type does match filter
                scope: null, // no scope, does not match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix: something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/e',
            draft: false,
            version: Version.parse('1.1.0'), // minor bump, match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type does match filter
                scope: 'other', // other scope, does not match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(other): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
        ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();

      const pullRequestNumbers = await manifest.createPullRequests();

      expect(pullRequestNumbers).lengthOf(6).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnce;

      expect(createPullRequestStub).to.have.callCount(6);
      expect(createPullRequestStub).to.have.been.calledWith(expect.objectContaining({headBranchName: expect.any(String)}), 'main', 'main', expect.any(String), expect.any(Array), expect.any(Object));

      expect(enablePullRequestAutoMergeStub).to.have.callCount(1);

      // only called when not auto-merged
      expect(addPullRequestReviewersStub).to.have.callCount(5);
    });

    it('enables auto-merge when filters are provided (filters: only commit type, match-all)', async () => {
      const createPullRequestStub = vi
        .spyOn(github, 'createPullRequest')
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const enablePullRequestAutoMergeStub = vi
        .spyOn(github, 'enablePullRequestAutoMerge')
        .mockResolvedValue('direct-merged');
      const addPullRequestReviewersStub = vi
        .spyOn(github, 'addPullRequestReviewers')
        .mockResolvedValue();
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(github, []);
      vi.spyOn(github, 'getPullRequest').withArgs(22).mockResolvedValue({
        number: 22,
        title: 'pr title1',
        body: 'pr body1',
        headBranchName: 'release-please/branches/main',
        baseBranchName: 'main',
        labels: [],
        files: [],
      });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
          'path/c': {
            releaseType: 'node',
            component: 'pkg3',
          },
          'path/d': {
            releaseType: 'node',
            component: 'pkg4',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('1.0.0'),
          'path/c': Version.parse('1.0.0'),
          'path/d': Version.parse('1.0.0'),
        },
        {
          separatePullRequests: true,
          autoMerge: {
            mergeMethod: 'rebase',
            conventionalCommitFilter: {
              commits: [{type: 'fix'}],
              matchBehaviour: 'match-all',
            }, // only filter on type
          },
        }
      );
      vi
        .spyOn(manifest, 'buildPullRequests')
        .withArgs(expect.anything(), expect.anything())
        .mockResolvedValue([
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/a',
            draft: false,
            version: Version.parse('1.1.0'),
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type match filter
                scope: 'api', // some scope
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(api): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/b',
            draft: false,
            version: Version.parse('1.1.0'),
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type match filter
                scope: 'other', // another scope
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(other): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/c',
            draft: false,
            version: Version.parse('1.1.0'),
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type does match filter
                scope: null, // no scope
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'feat(api): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/d',
            draft: false,
            version: Version.parse('1.1.0'),
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'feat', // type does not match filter
                scope: 'api',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'feat(api): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
        ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();

      const pullRequestNumbers = await manifest.createPullRequests();

      expect(pullRequestNumbers).lengthOf(4).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnce;

      expect(createPullRequestStub).to.have.callCount(4);
      expect(createPullRequestStub).to.have.been.calledWith(expect.objectContaining({headBranchName: expect.any(String)}), 'main', 'main', expect.any(String), expect.any(Array), expect.any(Object));

      expect(enablePullRequestAutoMergeStub).to.have.callCount(3);
      // only called when not auto-merged
      expect(addPullRequestReviewersStub).to.have.callCount(1);
    });

    it('enables auto-merge when filters are provided (filters: build-patch-minor version bump, commit filters, match-at-least-one)', async () => {
      const createPullRequestStub = vi
        .spyOn(github, 'createPullRequest')
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const enablePullRequestAutoMergeStub = vi
        .spyOn(github, 'enablePullRequestAutoMerge')
        .mockResolvedValue('direct-merged');
      const addPullRequestReviewersStub = vi
        .spyOn(github, 'addPullRequestReviewers')
        .mockResolvedValue();
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(github, []);
      vi.spyOn(github, 'getPullRequest').withArgs(22).mockResolvedValue({
        number: 22,
        title: 'pr title1',
        body: 'pr body1',
        headBranchName: 'release-please/branches/main',
        baseBranchName: 'main',
        labels: [],
        files: [],
      });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
          'path/c': {
            releaseType: 'node',
            component: 'pkg3',
          },
          'path/d': {
            releaseType: 'node',
            component: 'pkg4',
          },
          'path/e': {
            releaseType: 'node',
            component: 'pkg5',
          },
          'path/f': {
            releaseType: 'node',
            component: 'pkg6',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('1.0.0'),
          'path/c': Version.parse('1.0.0'),
          'path/d': Version.parse('1.0.0'),
          'path/e': Version.parse('1.0.0'),
          'path/f': Version.parse('1.0.0'),
        },
        {
          separatePullRequests: true,
          autoMerge: {
            mergeMethod: 'rebase',
            versionBumpFilter: ['minor', 'build', 'patch'],
            conventionalCommitFilter: {
              matchBehaviour: 'match-at-least-one',
              commits: [{type: 'fix'}, {type: 'feat', scope: 'api'}],
            },
          },
        }
      );
      vi
        .spyOn(manifest, 'buildPullRequests')
        .withArgs(expect.anything(), expect.anything())
        .mockResolvedValue([
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/a',
            draft: false,
            version: Version.parse('1.0.1'), // version bump match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type match filter
                scope: 'something',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(something): something',
                bareMessage: 'something',
                breaking: false,
              },
              {
                type: 'ci', // type does not match filter
                scope: 'something',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'ci(something): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/a',
            draft: false,
            version: Version.parse('1.0.1'), // version bump match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'ci', // first type does not match filter
                scope: 'something',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'ci(something): something',
                bareMessage: 'something',
                breaking: false,
              },
              {
                type: 'fix', // type match filter
                scope: 'something',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix(something): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/b',
            draft: false,
            version: Version.parse('1.1.0'), // version bump match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'feat', // type match filter
                scope: 'api', // scope match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'feat(api): something',
                bareMessage: 'something',
                breaking: false,
              },
              {
                type: 'ci', // type does not match filter
                scope: 'something',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'ci(something): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/c',
            draft: false,
            version: Version.parse('1.1.0'), // version bump match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'feat', // type does match filter
                scope: null, // no scope, does not match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'feat: something',
                bareMessage: 'something',
                breaking: false,
              },
              {
                type: 'ci', // type does not match filter
                scope: 'something',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'ci(something): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/d',
            draft: false,
            version: Version.parse('1.0.1'), // version bump match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'fix', // type does match filter
                scope: null, // no scope, does match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'fix: something',
                bareMessage: 'something',
                breaking: false,
              },
              {
                type: 'ci', // type does not match filter
                scope: 'something',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'ci(something): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/e',
            draft: false,
            version: Version.parse('2.0.0'), // version bump does not match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'feat', // type match filter
                scope: 'api',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'feat(api): something',
                bareMessage: 'something',
                breaking: false,
              },
              {
                type: 'feat', // type does match filter
                scope: 'something', // scope does not match filter
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'feat(something): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body: new PullRequestBody([]),
            updates: [],
            labels: [],
            headRefName: 'release-please/branches/main/components/f',
            draft: false,
            version: Version.parse('1.1.0'), // version bump match filter
            previousVersion: Version.parse('1.0.0'),
            conventionalCommits: [
              {
                type: 'chore', // type does not match filter
                scope: 'api',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'chore(api): something',
                bareMessage: 'something',
                breaking: false,
              },
              {
                type: 'ci', // type does not match filter
                scope: 'something',
                notes: [],
                references: [],
                sha: 'commit123',
                message: 'feat(something): something',
                bareMessage: 'something',
                breaking: false,
              },
            ],
          },
        ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();

      const pullRequestNumbers = await manifest.createPullRequests();

      expect(pullRequestNumbers).lengthOf(7).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnce;

      expect(createPullRequestStub).to.have.callCount(7);
      expect(createPullRequestStub).to.have.been.calledWith(expect.objectContaining({headBranchName: expect.any(String)}), 'main', 'main', expect.any(String), expect.any(Array), expect.any(Object));

      expect(enablePullRequestAutoMergeStub).to.have.callCount(4);
      // only called when not auto-merged
      expect(addPullRequestReviewersStub).to.have.callCount(3);
    });

    it('updates an existing pull request', async () => {
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      vi
        .spyOn(github, 'createPullRequest')
        .withArgs(
          expect.objectContaining({headBranchName: 'release-please/branches/main'}),
          'main',
          'main',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      mockPullRequests(github,
        [
          {
            number: 22,
            title: 'pr title1',
            body: new PullRequestBody([]).toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: pending'],
            files: [],
          },
        ],
        []
      );
      vi
        .spyOn(github, 'updatePullRequest')
        .withArgs(22, expect.anything(), expect.anything(), expect.anything())
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).lengthOf(1).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });

    describe('with an overflowing body', () => {
      const body = new PullRequestBody(mockReleaseData(1000), {
        useComponents: true,
      });

      it('updates an existing pull request', async () => {
        mockPullRequests(github,
          [
            {
              number: 22,
              title: 'pr title1',
              body: pullRequestBody('release-notes/single.txt'),
              headBranchName: 'release-please/branches/main',
              baseBranchName: 'main',
              labels: ['autorelease: pending'],
              files: [],
            },
          ],
          []
        );
        const updatePullRequestStub = vi
          .spyOn(github, 'updatePullRequest')
          .withArgs(
            22,
            expect.anything(),
            'main',
            'main',
            expect.objectContaining({pullRequestOverflowHandler: expect.anything()})
          )
          .mockResolvedValue({
            number: 22,
            title: 'pr title1',
            body: 'pr body1',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: [],
            files: [],
          });
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
            },
            'path/b': {
              releaseType: 'node',
              component: 'pkg2',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
            'path/b': Version.parse('0.2.3'),
          },
          {
            separatePullRequests: true,
            plugins: ['node-workspace'],
          }
        );
        const buildPullRequestsStub = vi
          .spyOn(manifest, 'buildPullRequests')
          .mockResolvedValue([
            {
              title: PullRequestTitle.ofTargetBranch('main', 'main'),
              body,
              updates: [
                {
                  path: 'README.md',
                  createIfMissing: false,
                  updater: new RawContent('some raw content'),
                },
              ],
              labels: [],
              headRefName: 'release-please/branches/main',
              draft: false,
              conventionalCommits: [],
            },
          ]);
        const getLabelsStub = vi
          .spyOn(github, 'getLabels')
          .mockResolvedValue(['label-a', 'label-b']);
        const createLabelsStub = vi
          .spyOn(github, 'createLabels')
          .mockResolvedValue();
        const pullRequestNumbers = await manifest.createPullRequests();
        expect(updatePullRequestStub).to.have.been.calledOnce;
        expect(buildPullRequestsStub).to.have.been.calledOnce;
        expect(getLabelsStub).to.have.been.calledOnce;
        expect(createLabelsStub).to.have.been.calledOnceWith([
          'autorelease: pending',
          'autorelease: tagged',
          'autorelease: pre-release',
        ]);
        expect(pullRequestNumbers).lengthOf(1).toMatchSnapshot();
      });

      it('ignores an existing pull request if there are no changes', async () => {
        const getFileContentsOnBranchStub = vi
          .spyOn(github, 'getFileContentsOnBranch')
          .withArgs('README.md', 'main')
          .mockResolvedValue(buildGitHubFileRaw('some-content'))
          .withArgs('release-notes.md', 'my-head-branch--release-notes')
          .mockResolvedValue(buildGitHubFileRaw(body.toString()));
        const createPullRequestStub = vi
          .spyOn(github, 'createPullRequest')
          // .withArgs(
          //   expect.objectContaining({headBranchName: 'release-please/branches/main'}),
          //   expect.any(String),
          //   expect.any(String),
          //   expect.any(String),
          //   expect.any(Array),
          //   expect.objectContaining({fork: false, draft: false})
          // )
          .mockResolvedValue({
            number: 22,
            title: 'pr title1',
            body: 'pr body1',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: [],
            files: [],
          });
        mockPullRequests(github,
          [
            {
              number: 22,
              title: 'pr title1',
              body: pullRequestBody('release-notes/overflow.txt'),
              headBranchName: 'release-please/branches/main',
              baseBranchName: 'main',
              labels: ['autorelease: pending'],
              files: [],
            },
          ],
          []
        );
        const updatePullRequestStub = vi
          .spyOn(github, 'updatePullRequest')
          // .withArgs(
          //   22,
          //   expect.anything(),
          //   expect.any(String),
          //   expect.any(String),
          //   expect.objectContaining({pullRequestOverflowHandler: expect.anything()})
          // )
          .mockResolvedValue({
            number: 22,
            title: 'pr title1',
            body: 'pr body1',
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: [],
            files: [],
          });
        const manifest = new Manifest(
          github,
          'main',
          {
            'path/a': {
              releaseType: 'node',
              component: 'pkg1',
            },
            'path/b': {
              releaseType: 'node',
              component: 'pkg2',
            },
          },
          {
            'path/a': Version.parse('1.0.0'),
            'path/b': Version.parse('0.2.3'),
          },
          {
            separatePullRequests: true,
            plugins: ['node-workspace'],
          }
        );
        const getLabelsStub = vi
          .spyOn(github, 'getLabels')
          .mockResolvedValue(['label-a', 'label-b', 'autorelease: pending']);
        const createLabelsStub = vi
          .spyOn(github, 'createLabels')
          .mockResolvedValue();
        vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
          {
            title: PullRequestTitle.ofTargetBranch('main', 'main'),
            body,
            updates: [
              {
                path: 'README.md',
                createIfMissing: false,
                updater: new RawContent('some raw content'),
              },
            ],
            labels: [],
            headRefName: 'release-please/branches/main',
            draft: false,
            conventionalCommits: [],
          },
        ]);
        const pullRequestNumbers = await manifest.createPullRequests();
        expect(pullRequestNumbers).lengthOf(1).toMatchSnapshot();
        expect(getLabelsStub).to.have.been.calledOnce;
        expect(createLabelsStub).to.have.been.calledOnceWith([
          'autorelease: tagged',
          'autorelease: pre-release',
        ]);
        expect(getFileContentsOnBranchStub).to.have.been.calledOnce;
        expect(createPullRequestStub).not.to.have.been.called;
        expect(updatePullRequestStub).to.have.been.calledOnce;
      });
    });

    it('updates an existing snapshot pull request', async () => {
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      vi
        .spyOn(github, 'createPullRequest')
        .withArgs(
          expect.objectContaining({headBranchName: 'release-please/branches/main'}),
          'main',
          'main',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      mockPullRequests(github,
        [
          {
            number: 22,
            title: 'pr title1',
            body: new PullRequestBody([]).toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: snapshot'],
            files: [],
          },
        ],
        []
      );
      vi
        .spyOn(github, 'updatePullRequest')
        .withArgs(22, expect.anything(), expect.anything(), expect.anything())
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: ['autorelease: snapshot'],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'java',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'java',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
        }
      );
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b', 'autorelease: pending']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'SNAPSHOT bump',
            },
          ]),
          updates: [
            {
              path: 'pom.xml',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).lengthOf(1).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });

    it('skips pull requests if there are pending, merged pull requests', async () => {
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(github,
        [],
        [
          {
            number: 22,
            title: 'pr title1',
            body: new PullRequestBody([]).toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: pending'],
            files: [],
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).lengthOf(0).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });

    it('reopens snoozed, closed pull request if there are changes', async () => {
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      vi
        .spyOn(github, 'createPullRequest')
        .withArgs(
          expect.objectContaining({headBranchName: 'release-please/branches/main'}),
          'main',
          'main',
          expect.any(String),
          expect.any(Array),
          expect.objectContaining({fork: false, draft: false})
        )
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      mockPullRequests(github,
        [],
        [],
        [
          {
            number: 22,
            title: 'pr title1',
            body: new PullRequestBody([]).toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: pending', 'autorelease: snooze'],
            files: [],
          },
        ]
      );
      vi
        .spyOn(github, 'updatePullRequest')
        .withArgs(22, expect.anything(), expect.anything(), expect.anything())
        .mockResolvedValue({
          number: 22,
          title: 'pr title1',
          body: 'pr body1',
          headBranchName: 'release-please/branches/main',
          baseBranchName: 'main',
          labels: [],
          files: [],
        });
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body: new PullRequestBody([
            {
              notes: 'Some release notes',
            },
          ]),
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).lengthOf(1).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
      expect(removeLabelsStub).to.have.been.calledOnce;
    });

    it('ignores snoozed, closed pull request if there are no changes', async () => {
      const body = new PullRequestBody([
        {
          notes: '## 1.1.0\n\nSome release notes',
        },
      ]);
      vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('README.md', 'main')
        .mockResolvedValue(buildGitHubFileRaw('some-content'));
      mockPullRequests(github,
        [],
        [],
        [
          {
            number: 22,
            title: 'pr title1',
            body: body.toString(),
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            labels: ['autorelease: closed', 'autorelease: snooze'],
            files: [],
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          'path/a': {
            releaseType: 'node',
            component: 'pkg1',
          },
          'path/b': {
            releaseType: 'node',
            component: 'pkg2',
          },
        },
        {
          'path/a': Version.parse('1.0.0'),
          'path/b': Version.parse('0.2.3'),
        },
        {
          separatePullRequests: true,
          plugins: ['node-workspace'],
        }
      );
      vi.spyOn(manifest, 'buildPullRequests').mockResolvedValue([
        {
          title: PullRequestTitle.ofTargetBranch('main', 'main'),
          body,
          updates: [
            {
              path: 'README.md',
              createIfMissing: false,
              updater: new RawContent('some raw content'),
            },
          ],
          labels: [],
          headRefName: 'release-please/branches/main',
          draft: false,
          conventionalCommits: [],
        },
      ]);
      const getLabelsStub = vi
        .spyOn(github, 'getLabels')
        .mockResolvedValue(['label-a', 'label-b']);
      const createLabelsStub = vi.spyOn(github, 'createLabels').mockResolvedValue();
      const pullRequestNumbers = await manifest.createPullRequests();
      expect(pullRequestNumbers).lengthOf(0).toMatchSnapshot();
      expect(getLabelsStub).to.have.been.calledOnce;
      expect(createLabelsStub).to.have.been.calledOnceWith([
        'autorelease: pending',
        'autorelease: tagged',
        'autorelease: pre-release',
      ]);
    });
  });

  describe('buildReleases', () => {
    it('should handle a single manifest release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );

      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );

      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('release-brancher-v1.3.1');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Bug Fixes'));
      expect(releases[0].path).to.eql('.');
      expect(releases[0].name).to.eql('release-brancher: v1.3.1');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.undefined;

      expect(getFileContentsStub).to.have.been.calledOnce;
    });

    it('should handle a multiple manifest release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .withArgs('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .withArgs('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .withArgs('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(4).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('bot-config-utils-v3.2.0');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[0].path).to.eql('packages/bot-config-utils');
      expect(releases[0].name).to.eql('bot-config-utils: v3.2.0');
      expect(releases[1].tag.toString()).to.eql('label-utils-v1.1.0');
      expect(releases[1].sha).to.eql('abc123');
      expect(releases[1].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[1].path).to.eql('packages/label-utils');
      expect(releases[1].name).to.eql('label-utils: v1.1.0');
      expect(releases[2].tag.toString()).to.eql('object-selector-v1.1.0');
      expect(releases[2].sha).to.eql('abc123');
      expect(releases[2].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[2].path).to.eql('packages/object-selector');
      expect(releases[2].name).to.eql('object-selector: v1.1.0');
      expect(releases[3].tag.toString()).to.eql('datastore-lock-v2.1.0');
      expect(releases[3].sha).to.eql('abc123');
      expect(releases[3].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[3].path).to.eql('packages/datastore-lock');
      expect(releases[3].name).to.eql('datastore-lock: v2.1.0');
    });

    it('should handle a mixed manifest release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/mixed-componentless-manifest.txt'
            ),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .withArgs('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
            includeComponentInTag: false,
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(2).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('v3.2.0');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[0].path).to.eql('packages/bot-config-utils');
      expect(releases[0].name).to.eql('v3.2.0');
      expect(releases[1].tag.toString()).to.eql('label-utils-v1.1.0');
      expect(releases[1].sha).to.eql('abc123');
      expect(releases[1].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[1].path).to.eql('packages/label-utils');
      expect(releases[1].name).to.eql('label-utils: v1.1.0');
    });

    it('should handle a single standalone release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please--branches--main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('v3.2.7');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### [3.2.7]'));
      expect(releases[0].path).to.eql('.');
      expect(releases[0].name).to.eql('v3.2.7');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.undefined;
    });

    it('should handle a single component release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please--branches--main--components--foo',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            component: 'foo',
            includeComponentInTag: false,
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('v3.2.7');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### [3.2.7]'));
      expect(releases[0].path).to.eql('.');
      expect(releases[0].name).to.eql('v3.2.7');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.undefined;
    });

    it('should allow skipping releases', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .withArgs('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .withArgs('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .withArgs('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
            skipGithubRelease: true,
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(3).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('bot-config-utils-v3.2.0');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[1].tag.toString()).to.eql('label-utils-v1.1.0');
      expect(releases[1].sha).to.eql('abc123');
      expect(releases[1].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[2].tag.toString()).to.eql('datastore-lock-v2.1.0');
      expect(releases[2].sha).to.eql('abc123');
      expect(releases[2].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
    });

    it('should build draft releases', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            draft: true,
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].name).to.eql('release-brancher: v1.3.1');
      expect(releases[0].draft).to.be.true;
      expect(releases[0].prerelease).to.be.undefined;
    });

    it('should build draft releases manifest wide', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        },
        {
          draft: true,
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].name).to.eql('release-brancher: v1.3.1');
      expect(releases[0].draft).to.be.true;
      expect(releases[0].prerelease).to.be.undefined;
    });

    it('should build prerelease releases from beta', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-prerelease.txt'
            ),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].name).to.eql('release-brancher: v1.3.1-beta1');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.true;
      expect(releases[0].tag.toString()).to.eql(
        'release-brancher-v1.3.1-beta1'
      );
    });

    it('should build prerelease releases manifest wide', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-prerelease.txt'
            ),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.0'),
        },
        {
          prerelease: true,
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1);
      expect(releases[0].prerelease).to.be.true;
    });

    it('should let path config override manifest-wide prerelease', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-prerelease.txt'
            ),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: false,
          },
        },
        {
          '.': Version.parse('1.3.0'),
        },
        {
          prerelease: true,
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1);
      expect(releases[0].prerelease).to.be.false;
    });

    it('should not build prerelease releases from pre-major', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-pre-major.txt'
            ),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('0.1.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].name).to.eql('release-brancher: v0.2.0');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.false;
      expect(releases[0].tag.toString()).to.eql('release-brancher-v0.2.0');
    });

    it('should build prerelease releases from pre-major if the pre-release label is applied', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-pre-major.txt'
            ),
            labels: ['autorelease: pending', 'autorelease: pre-release'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('0.1.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].name).to.eql('release-brancher: v0.2.0');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.true;
      expect(releases[0].tag.toString()).to.eql('release-brancher-v0.2.0');
    });

    it('should not build prerelease releases from non-prerelease', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].name).to.eql('release-brancher: v1.3.1');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.false;
      expect(releases[0].tag.toString()).to.eql('release-brancher-v1.3.1');
    });

    it('should build prerelease releases when forcePrerelease is true', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-pre-major.txt'
            ),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
            forcePrerelease: true,
          },
        },
        {
          '.': Version.parse('0.1.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].name).to.eql('release-brancher: v0.2.0');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.true;
      expect(releases[0].tag.toString()).to.eql('release-brancher-v0.2.0');
    });

    it('should build prerelease releases from non-prerelease when forcePrerelease is true', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [''],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
            forcePrerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].name).to.eql('release-brancher: v1.3.1');
      expect(releases[0].draft).to.be.undefined;
      expect(releases[0].prerelease).to.be.true;
      expect(releases[0].tag.toString()).to.eql('release-brancher-v1.3.1');
    });

    it('should skip component in tag', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName:
              'release-please--branches--main--components--release-brancher',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release v1.3.1',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            includeComponentInTag: false,
          },
        },
        {
          '.': Version.parse('1.3.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('v1.3.1');
    });

    it('should handle customized pull request title', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'release: 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            pullRequestTitlePattern: 'release: ${version}',
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('v3.2.7');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### [3.2.7]'));
      expect(releases[0].path).to.eql('.');
    });

    it('should skip component releases for non-component configs', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName:
              'release-please--branches--main--components--storage',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release storage 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            includeComponentInTag: false,
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(0).toMatchSnapshot();
    });

    it('should handle complex title and base branch', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName:
              'release-please--branches--hotfix/v3.1.0-bug--components--my-package-name',
            baseBranchName: 'hotfix/v3.1.0-bug',
            number: 1234,
            title: '[HOTFIX] - chore(hotfix/v3.1.0-bug): release 3.1.0-hotfix1',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'hotfix/v3.1.0-bug',
        {
          '.': {
            releaseType: 'simple',
            pullRequestTitlePattern:
              '[HOTFIX] - chore${scope}: release${component} ${version}',
            packageName: 'my-package-name',
            includeComponentInTag: false,
          },
        },
        {
          '.': Version.parse('3.1.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('v3.1.0-hotfix1');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes).to.be.a('string');
      expect(releases[0].path).to.eql('.');
    });

    it('should find the correct number of releases with a componentless tag', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please--branches--main',
            baseBranchName: 'main',
            number: 2,
            title: 'chore: release v1.0.1',
            body: pullRequestBody('release-notes/grouped.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
            pullRequestTitlePattern: 'chore: release v${version}',
            component: 'base',
            includeComponentInTag: false,
          },
          api: {
            releaseType: 'simple',
            component: 'api',
          },
          chat: {
            releaseType: 'simple',
            component: 'chat',
          },
          cmds: {
            releaseType: 'simple',
            component: 'cmds',
          },
          presence: {
            releaseType: 'simple',
            component: 'presence',
          },
        },
        {
          '.': Version.parse('1.0.0'),
          api: Version.parse('1.0.0'),
          chat: Version.parse('1.0.0'),
          cmds: Version.parse('1.0.0'),
          presence: Version.parse('1.0.0'),
        },
        {
          groupPullRequestTitlePattern: 'chore: release v${version}',
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(2).toMatchSnapshot();
    });

    it('should handle overflowing release notes', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/overflow.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .withArgs('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .withArgs('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .withArgs('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        )
        // This branch is parsed from the overflow PR body
        .withArgs('release-notes.md', 'my-head-branch--release-notes')
        .mockResolvedValue(
          buildGitHubFileRaw(pullRequestBody('release-notes/multiple.txt'))
        );
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.buildReleases();
      expect(releases).lengthOf(4).toMatchSnapshot();
      expect(releases[0].tag.toString()).to.eql('bot-config-utils-v3.2.0');
      expect(releases[0].sha).to.eql('abc123');
      expect(releases[0].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[0].path).to.eql('packages/bot-config-utils');
      expect(releases[0].name).to.eql('bot-config-utils: v3.2.0');
      expect(releases[1].tag.toString()).to.eql('label-utils-v1.1.0');
      expect(releases[1].sha).to.eql('abc123');
      expect(releases[1].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[1].path).to.eql('packages/label-utils');
      expect(releases[1].name).to.eql('label-utils: v1.1.0');
      expect(releases[2].tag.toString()).to.eql('object-selector-v1.1.0');
      expect(releases[2].sha).to.eql('abc123');
      expect(releases[2].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[2].path).to.eql('packages/object-selector');
      expect(releases[2].name).to.eql('object-selector: v1.1.0');
      expect(releases[3].tag.toString()).to.eql('datastore-lock-v2.1.0');
      expect(releases[3].sha).to.eql('abc123');
      expect(releases[3].notes)
        .to.be.a('string')
        .and.satisfy((msg: string) => msg.startsWith('### Features'));
      expect(releases[3].path).to.eql('packages/datastore-lock');
      expect(releases[3].name).to.eql('datastore-lock: v2.1.0');
    });
  });

  describe('createReleases', () => {
    it('should handle a single manifest release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      mockCreateRelease(github, [
        {id: 123456, sha: 'abc123', tagName: 'release-brancher-v1.3.1'},
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();

      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('release-brancher-v1.3.1');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.eql('some release notes');
      expect(releases[0]!.path).to.eql('.');
      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledOnceWith(expect.objectContaining({tagName: 'release-brancher-v1.3.1'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should handle a multiple manifest release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi
        .spyOn(github, 'getFileContentsOnBranch')
        .withArgs('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .withArgs('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .withArgs('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .withArgs('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );

      mockCreateRelease(github, [
        {id: 1, sha: 'abc123', tagName: 'bot-config-utils-v3.2.0'},
        {id: 2, sha: 'abc123', tagName: 'label-utils-v1.1.0'},
        {id: 3, sha: 'abc123', tagName: 'object-selector-v1.1.0'},
        {id: 4, sha: 'abc123', tagName: 'datastore-lock-v2.1.0'},
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(4).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('bot-config-utils-v3.2.0');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.be.string;
      expect(releases[0]!.path).to.eql('packages/bot-config-utils');
      expect(releases[1]!.tagName).to.eql('label-utils-v1.1.0');
      expect(releases[1]!.sha).to.eql('abc123');
      expect(releases[1]!.notes).to.be.string;
      expect(releases[1]!.path).to.eql('packages/label-utils');
      expect(releases[2]!.tagName).to.eql('object-selector-v1.1.0');
      expect(releases[2]!.sha).to.eql('abc123');
      expect(releases[2]!.notes).to.be.string;
      expect(releases[2]!.path).to.eql('packages/object-selector');
      expect(releases[3]!.tagName).to.eql('datastore-lock-v2.1.0');
      expect(releases[3]!.sha).to.eql('abc123');
      expect(releases[3]!.notes).to.be.string;
      expect(releases[3]!.path).to.eql('packages/datastore-lock');
      expect(commentStub).to.have.callCount(4);
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'bot-config-utils-v3.2.0'}));
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'label-utils-v1.1.0'}));
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'object-selector-v1.1.0'}));
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'datastore-lock-v2.1.0'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
      expect(getFileContentsStub).to.have.been.called;
    });

    it('should handle a single standalone release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore(main): release 3.2.7',
            body: pullRequestBody('release-notes/single.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'simple',
          },
        },
        {
          '.': Version.parse('3.2.6'),
        }
      );
      mockCreateRelease(github, [
        {id: 123456, sha: 'abc123', tagName: 'v3.2.7'},
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('v3.2.7');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.be.string;
      expect(releases[0]!.path).to.eql('.');
      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'v3.2.7'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should allow customizing pull request labels', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['some-pull-request-label'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      mockCreateRelease(github, [
        {id: 123456, sha: 'abc123', tagName: 'release-brancher-v1.3.1'},
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        },
        {
          labels: ['some-pull-request-label'],
          releaseLabels: ['some-tagged-label'],
          prereleaseLabels: ['some-prerelease-label'],
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('release-brancher-v1.3.1');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.eql('some release notes');
      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['some-tagged-label'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['some-pull-request-label'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'release-brancher-v1.3.1'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should create a draft release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const githubReleaseStub = mockCreateRelease(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'release-brancher-v1.3.1',
          draft: true,
        },
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            draft: true,
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('release-brancher-v1.3.1');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.eql('some release notes');
      expect(releases[0]!.draft).to.be.true;
      expect(githubReleaseStub).to.have.been.calledOnceWith(expect.anything(), {
        draft: true,
        prerelease: undefined,
      } as ReleaseOptions);
      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'release-brancher-v1.3.1'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should create a prerelease release from beta', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody(
              'release-notes/single-manifest-prerelease.txt'
            ),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const githubReleaseStub = mockCreateRelease(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'release-brancher-v1.3.1-beta1',
          prerelease: true,
        },
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('release-brancher-v1.3.1-beta1');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.eql('some release notes');
      expect(releases[0]!.draft).to.be.undefined;
      expect(githubReleaseStub).to.have.been.calledOnceWith(expect.anything(), {
        draft: undefined,
        prerelease: true,
      } as ReleaseOptions);
      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged', 'autorelease: pre-release'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'release-brancher-v1.3.1-beta1'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should not create a prerelease release from non-prerelease', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const githubReleaseStub = mockCreateRelease(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'release-brancher-v1.3.1',
          prerelease: false,
        },
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
            prerelease: true,
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('release-brancher-v1.3.1');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.eql('some release notes');
      expect(releases[0]!.draft).to.be.undefined;
      expect(githubReleaseStub).to.have.been.calledOnceWith(expect.anything(), {
        draft: undefined,
        prerelease: false,
      } as ReleaseOptions);
      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'release-brancher-v1.3.1'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should create a prerelease when pull request labelled as pre-release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending', 'autorelease: pre-release'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      const githubReleaseStub = mockCreateRelease(github, [
        {
          id: 123456,
          sha: 'abc123',
          tagName: 'release-brancher-v1.3.1',
          prerelease: true,
        },
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('release-brancher-v1.3.1');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.eql('some release notes');
      expect(releases[0]!.draft).to.be.undefined;
      expect(githubReleaseStub).to.have.been.calledOnceWith(expect.anything(), {
        draft: undefined,
        prerelease: true,
      } as ReleaseOptions);
      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged', 'autorelease: pre-release'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'release-brancher-v1.3.1'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should handle partially failed manifest release', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .withArgs('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .withArgs('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .withArgs('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );

      mockCreateRelease(github, [
        {
          id: 1,
          sha: 'abc123',
          tagName: 'bot-config-utils-v3.2.0',
          duplicate: true,
        },
        {id: 2, sha: 'abc123', tagName: 'label-utils-v1.1.0'},
        {id: 3, sha: 'abc123', tagName: 'object-selector-v1.1.0'},
        {id: 4, sha: 'abc123', tagName: 'datastore-lock-v2.1.0'},
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      const releases = await manifest.createReleases();
      expect(releases).lengthOf(3).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('label-utils-v1.1.0');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.be.string;
      expect(releases[0]!.path).to.eql('packages/label-utils');
      expect(releases[1]!.tagName).to.eql('object-selector-v1.1.0');
      expect(releases[1]!.sha).to.eql('abc123');
      expect(releases[1]!.notes).to.be.string;
      expect(releases[1]!.path).to.eql('packages/object-selector');
      expect(releases[2]!.tagName).to.eql('datastore-lock-v2.1.0');
      expect(releases[2]!.sha).to.eql('abc123');
      expect(releases[2]!.notes).to.be.string;
      expect(releases[2]!.path).to.eql('packages/datastore-lock');
      expect(commentStub).to.have.callCount(3);
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'label-utils-v1.1.0'}));
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'object-selector-v1.1.0'}));
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'datastore-lock-v2.1.0'}));
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should throw DuplicateReleaseError if all releases already tagged', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/multiple.txt'),
            labels: ['autorelease: pending'],
            files: [
              'packages/bot-config-utils/package.json',
              'packages/label-utils/package.json',
              'packages/object-selector/package.json',
              'packages/datastore-lock/package.json',
            ],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('packages/bot-config-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/bot-config-utils'})
          )
        )
        .withArgs('packages/label-utils/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/label-utils'})
          )
        )
        .withArgs('packages/object-selector/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/object-selector'})
          )
        )
        .withArgs('packages/datastore-lock/package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-automations/datastore-lock'})
          )
        );

      mockCreateRelease(github, [
        {
          id: 1,
          sha: 'abc123',
          tagName: 'bot-config-utils-v3.2.0',
          duplicate: true,
        },
        {id: 2, sha: 'abc123', tagName: 'label-utils-v1.1.0', duplicate: true},
        {
          id: 3,
          sha: 'abc123',
          tagName: 'object-selector-v1.1.0',
          duplicate: true,
        },
        {
          id: 4,
          sha: 'abc123',
          tagName: 'datastore-lock-v2.1.0',
          duplicate: true,
        },
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const lockBranchStub = vi.spyOn(github, 'lockBranch').mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();
      const manifest = new Manifest(
        github,
        'main',
        {
          'packages/bot-config-utils': {
            releaseType: 'node',
          },
          'packages/label-utils': {
            releaseType: 'node',
          },
          'packages/object-selector': {
            releaseType: 'node',
          },
          'packages/datastore-lock': {
            releaseType: 'node',
          },
        },
        {
          'packages/bot-config-utils': Version.parse('3.1.4'),
          'packages/label-utils': Version.parse('1.0.1'),
          'packages/object-selector': Version.parse('1.0.2'),
          'packages/datastore-lock': Version.parse('2.0.0'),
        }
      );
      try {
        await manifest.createReleases();
        expect(false).to.be.true;
      } catch (err) {
        expect(err).instanceof(DuplicateReleaseError).toMatchSnapshot();
      }
      expect(commentStub).not.to.have.been.called;
      expect(addLabelsStub).to.have.been.calledOnce;
      expect(removeLabelsStub).to.have.been.calledOnce;
      expect(lockBranchStub).to.have.been.calledOnce;
      expect(unlockBranchStub).to.have.been.calledOnce;
    });

    it('should use fallback when branch lock fails due to missing token permissions (REST error)', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      mockCreateRelease(github, [
        {id: 123456, sha: 'abc123', tagName: 'release-brancher-v1.3.1'},
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();

      // make the lock branch fail with the relevant permission error
      vi.spyOn(github, 'lockBranch').mockImplementation(async () => {
        throw new RequestError('Resource not accessible by integration', 403, {
          request: {
            method: 'POST',
            url: 'https://api.github.com/foo',
            body: {
              bar: 'baz',
            },
            headers: {
              authorization: 'token secret123',
            },
          },
          response: {
            status: 403,
            url: 'https://api.github.com/foo',
            headers: {
              'x-github-request-id': '1:2:3:4',
            },
            data: {
              foo: 'bar',
            },
          },
        });
      });

      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );

      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('release-brancher-v1.3.1');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.eql('some release notes');
      expect(releases[0]!.path).to.eql('.');

      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'release-brancher-v1.3.1'}));

      // ensure we don't try to update permissions rules again given the lock failed
      expect(unlockBranchStub).not.to.have.been.called;
    });

    it('should use fallback when branch lock fails due to missing token permissions (GraphQL error)', async () => {
      mockPullRequests(github,
        [],
        [
          {
            headBranchName: 'release-please/branches/main',
            baseBranchName: 'main',
            number: 1234,
            title: 'chore: release main',
            body: pullRequestBody('release-notes/single-manifest.txt'),
            labels: ['autorelease: pending'],
            files: [],
            sha: 'abc123',
          },
        ]
      );
      const getFileContentsStub = vi.spyOn(
        github,
        'getFileContentsOnBranch'
      );
      getFileContentsStub
        .withArgs('package.json', 'main')
        .mockResolvedValue(
          buildGitHubFileRaw(
            JSON.stringify({name: '@google-cloud/release-brancher'})
          )
        );
      mockCreateRelease(github, [
        {id: 123456, sha: 'abc123', tagName: 'release-brancher-v1.3.1'},
      ]);
      const commentStub = vi.spyOn(github, 'commentOnIssue').mockResolvedValue();
      const addLabelsStub = vi.spyOn(github, 'addIssueLabels').mockResolvedValue();
      const removeLabelsStub = vi
        .spyOn(github, 'removeIssueLabels')
        .mockResolvedValue();
      const waitForReleaseToBeListedStub = vi
        .spyOn(github, 'waitForReleaseToBeListed')
        .mockResolvedValue();
      const unlockBranchStub = vi.spyOn(github, 'unlockBranch').mockResolvedValue();

      // make the lock branch fail with the relevant permission error
      vi.spyOn(github, 'lockBranch').mockImplementation(async () => {
        throw new GraphqlResponseError(
          {
            method: 'GET',
            url: '/foo/bar',
          },
          {},
          {
            data: {},
            errors: [
              {
                type: 'FORBIDDEN',
                message: 'Resource not accessible by integration',
                path: ['foo'],
                extensions: {},
                locations: [
                  {
                    line: 123,
                    column: 456,
                  },
                ],
              },
            ],
          }
        );
      });

      const manifest = new Manifest(
        github,
        'main',
        {
          '.': {
            releaseType: 'node',
          },
        },
        {
          '.': Version.parse('1.3.1'),
        }
      );

      const releases = await manifest.createReleases();
      expect(releases).lengthOf(1).toMatchSnapshot();
      expect(releases[0]!.tagName).to.eql('release-brancher-v1.3.1');
      expect(releases[0]!.sha).to.eql('abc123');
      expect(releases[0]!.notes).to.eql('some release notes');
      expect(releases[0]!.path).to.eql('.');

      expect(commentStub).to.have.been.calledOnce;
      expect(addLabelsStub).to.have.been.calledOnceWith(['autorelease: tagged'], 1234);
      expect(removeLabelsStub).to.have.been.calledOnceWith(['autorelease: pending'], 1234);
      expect(waitForReleaseToBeListedStub).to.have.been.calledWith(expect.objectContaining({tagName: 'release-brancher-v1.3.1'}));

      // ensure we don't try to update permissions rules again given the lock failed
      expect(unlockBranchStub).not.to.have.been.called;
    });
  });
});
