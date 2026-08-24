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

import {
  ChangelogSection,
  ChangelogNotes,
  BuildNotesOptions,
} from '../changelog-notes';
import {ConventionalCommit} from '../commit';
import {logger} from '../util/logger';
import Handlebars from 'handlebars';
import type {
  Options as WriterOptions,
  TransformedCommit,
  CommitKnownProps,
} from 'conventional-changelog-writer';
import type {
  CommitType,
  PresetConfig,
} from 'conventional-changelog-conventionalcommits';

const DEFAULT_HOST = 'https://github.com';

interface DefaultChangelogNotesOptions {
  commitPartial?: string;
  headerPartial?: string;
  mainTemplate?: string;
}

interface Note {
  title: string;
  text: string;
}

// The template functions the conventionalcommits preset produces (and that the
// writer expects). Prior to conventional-changelog-writer v9 these were
// Handlebars template *strings*; they are now plain functions.
type HeaderPartialFn = NonNullable<WriterOptions['headerPartial']>;
type CommitPartialFn = NonNullable<WriterOptions['commitPartial']>;
type TemplateFn = NonNullable<WriterOptions['template']>;

// The subset of the preset's writer options we rely on.
type PresetWriterOptions = WriterOptions & {
  headerPartial: HeaderPartialFn;
  commitPartial: CommitPartialFn;
  footerPartial: HeaderPartialFn;
  preamblePartial: HeaderPartialFn;
};

export class DefaultChangelogNotes implements ChangelogNotes {
  // allow for customized commit template.
  private commitPartial?: string;
  private headerPartial?: string;
  private mainTemplate?: string;

  constructor(options: DefaultChangelogNotesOptions = {}) {
    this.commitPartial = options.commitPartial;
    this.headerPartial = options.headerPartial;
    this.mainTemplate = options.mainTemplate;
  }

  async buildNotes(
    commits: ConventionalCommit[],
    options: BuildNotesOptions
  ): Promise<string> {
    // conventional-changelog-writer (v9+) and the conventionalcommits preset
    // (v10+) are ESM-only. This module is compiled to CommonJS and bundled by
    // ncc, so they must be pulled in with a dynamic import rather than a static
    // one (which would be emitted as a `require` and fail at runtime).
    const {writeChangelogString} = await import(
      'conventional-changelog-writer'
    );
    const {default: createPreset} = await import(
      'conventional-changelog-conventionalcommits'
    );

    const context = {
      host: options.host || DEFAULT_HOST,
      owner: options.owner,
      repository: options.repository,
      version: options.version,
      previousTag: options.previousTag,
      currentTag: options.currentTag,
      linkCompare: !!options.previousTag,
      // The writer defaults this URL path segment to 'commits'; GitHub commit
      // links (and every changelog release-please has generated) use 'commit'.
      commit: 'commit',
    };

    const presetConfig: PresetConfig = {
      // The writer's default compare-URL builder percent-encodes the tag names,
      // turning the '/' in monorepo component tags (e.g. "pkg/v1.2.3") into
      // '%2F', which GitHub does not resolve in compare links. Keep emitting the
      // unescaped URL release-please has always produced.
      formatCompareUrl: () =>
        `${context.host}/${context.owner}/${context.repository}/compare/${context.previousTag}...${context.currentTag}`,
    };
    if (options.changelogSections) {
      // The preset used to take a `hidden` boolean per commit type; it now uses
      // an `effect` enum to decide whether a type is rendered in the changelog.
      presetConfig.types = options.changelogSections.map(sectionToCommitType);
    }
    // createPreset (v10) is synchronous and returns the writer options on
    // `.writer`; the pre-v9 factory was async and exposed `.writerOpts`.
    const preset = createPreset(presetConfig) as {writer: PresetWriterOptions};
    const writerOpts = preset.writer;

    const changelogCommits = commits
      // Filter out commits that are just release commits for multiple packages, they shouldn't be part of the changelog
      .filter(commit => {
        if (commit.message.trim().startsWith('chore: release ')) {
          logger.debug(
            `changelog: ignoring commit '${commit.message}' (${commit.sha}). It is a release commit for multi-packages PR.`
          );
          return false;
        }
        return true;
      })
      .map(commit => {
        const notes = commit.notes
          .filter(
            note =>
              note.title === 'BREAKING CHANGE' || note.title === 'Migration'
          )
          .map(note =>
            replaceIssueLink(
              // A 'Migration' note is the `# Migration` section lifted out of a
              // breaking change's body, so it belongs under the same heading.
              // The preset used to force every note title to 'BREAKING CHANGES';
              // since conventionalcommits v10.3 it groups notes by their own
              // title, which would render a stray '### MIGRATION' section.
              {...note, title: 'BREAKING CHANGE'},
              context.host,
              context.owner,
              context.repository
            )
          );
        return {
          body: '', // commit.body,
          subject: htmlEscape(commit.bareMessage),
          type: commit.type,
          scope: commit.scope,
          notes,
          references: commit.references,
          mentions: [],
          merge: null,
          revert: null,
          header: commit.message,
          footer: commit.notes
            .filter(note => note.title === 'RELEASE AS')
            .map(note => `Release-As: ${note.text}`)
            .join('\n'),
          hash: commit.sha,
        };
      });

    const writerOptions: WriterOptions = {
      ...writerOpts,
      ...this.customTemplateOptions(writerOpts),
    };

    const result = (
      await writeChangelogString(
        changelogCommits as unknown as CommitKnownProps[],
        context,
        writerOptions
      )
    ).trim();
    return result;
  }

  /**
   * Builds the writer template overrides for any customized templates. When no
   * custom templates are configured this is empty and the preset's own
   * (function-based) templates are used verbatim.
   *
   * The `commitPartial`, `headerPartial` and `mainTemplate` options remain
   * Handlebars strings for backwards compatibility; they are compiled into the
   * template functions the writer now expects.
   */
  private customTemplateOptions(
    writerOpts: PresetWriterOptions
  ): Partial<WriterOptions> {
    if (!this.headerPartial && !this.commitPartial && !this.mainTemplate) {
      return {};
    }

    const headerPartial = this.headerPartial
      ? compileHeaderPartial(this.headerPartial)
      : writerOpts.headerPartial;
    const commitPartial = this.commitPartial
      ? compileCommitPartial(this.commitPartial)
      : writerOpts.commitPartial;

    const overrides: Partial<WriterOptions> = {};
    if (this.headerPartial) {
      overrides.headerPartial = headerPartial;
    }
    if (this.commitPartial) {
      overrides.commitPartial = commitPartial;
    }
    if (this.mainTemplate) {
      overrides.template = compileMainTemplate(this.mainTemplate, {
        headerPartial,
        commitPartial,
        footerPartial: writerOpts.footerPartial,
        preamblePartial: writerOpts.preamblePartial,
      });
    }
    return overrides;
  }
}

function sectionToCommitType(section: ChangelogSection): CommitType {
  return {
    type: section.type,
    section: section.section,
    effect: section.hidden ? 'hidden' : 'changelog',
  };
}

/**
 * Compiles a Handlebars header/footer/preamble template string into the
 * function form the writer expects. The template is rendered with the full
 * changelog context as both the current scope and `@root`, matching how these
 * partials were rendered by the Handlebars engine in earlier versions.
 */
function compileHeaderPartial(template: string): HeaderPartialFn {
  const compiled = Handlebars.compile(template, {noEscape: true});
  return context => compiled(context, {data: {root: context}});
}

/**
 * Compiles a Handlebars commit template string. Commit partials were rendered
 * with the commit as the current scope and the changelog context as `@root`.
 */
function compileCommitPartial(template: string): CommitPartialFn {
  const compiled = Handlebars.compile(template, {noEscape: true});
  return (context, commit) => compiled(commit, {data: {root: context}});
}

/**
 * Compiles a Handlebars main template string. Historically the main template
 * pulled in the header/commit/footer partials via `{{> header}}` and friends,
 * so those are registered as partials that delegate to the (possibly
 * customized) partial functions.
 */
function compileMainTemplate(
  template: string,
  partials: {
    headerPartial: HeaderPartialFn;
    commitPartial: CommitPartialFn;
    footerPartial: HeaderPartialFn;
    preamblePartial: HeaderPartialFn;
  }
): TemplateFn {
  return context => {
    // Use an isolated Handlebars environment per render so registered partials
    // can close over the current context without leaking into global state.
    const engine = Handlebars.create();
    engine.registerPartial('header', () => partials.headerPartial(context));
    engine.registerPartial('preamble', () =>
      partials.preamblePartial(context)
    );
    engine.registerPartial('commit', commit =>
      partials.commitPartial(
        context,
        commit as TransformedCommit<CommitKnownProps>
      )
    );
    engine.registerPartial('footer', () => partials.footerPartial(context));
    const compiled = engine.compile(template, {noEscape: true});
    return compiled(context, {data: {root: context}});
  };
}

function replaceIssueLink(
  note: Note,
  host: string,
  owner: string,
  repo: string
): Note {
  note.text = note.text.replace(
    /\(#(\d+)\)/,
    `([#$1](${host}/${owner}/${repo}/issues/$1))`
  );
  return note;
}

function htmlEscape(message: string): string {
  return message.replace('<', '&lt;').replace('>', '&gt;');
}
