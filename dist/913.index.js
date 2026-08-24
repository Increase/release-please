"use strict";
exports.id = 913;
exports.ids = [913];
exports.modules = {

/***/ 42899:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Cr: () => (/* binding */ bold),
/* harmony export */   EX: () => (/* binding */ small),
/* harmony export */   JF: () => (/* binding */ segments),
/* harmony export */   NN: () => (/* binding */ newline),
/* harmony export */   OZ: () => (/* binding */ url),
/* harmony export */   P$: () => (/* binding */ strings),
/* harmony export */   R_: () => (/* binding */ heading),
/* harmony export */   __: () => (/* binding */ each),
/* harmony export */   aL: () => (/* binding */ words),
/* harmony export */   nf: () => (/* binding */ link),
/* harmony export */   p_: () => (/* binding */ list)
/* harmony export */ });
/* unused harmony export italic */
/**
 * Converts a renderable value to a string.
 * @param value - Value to render.
 * @returns String value, or an empty string for empty values.
 */
function toString(value) {
    return typeof value === 'number' || value ? String(value) : '';
}
/**
 * Renders an array into newline-separated non-empty strings.
 * @param array - Items to render.
 * @param callback - Item renderer.
 * @param separator - Separator inserted between rendered items.
 * @returns Rendered string.
 */
function each(array, callback, separator = newline()) {
    return array
        ? array.reduce((acc, item) => {
            const rendered = toString(callback(item)).trim();
            return `${acc}${acc && rendered ? separator : ''}${rendered}`;
        }, '')
        : '';
}
/**
 * Renders a Markdown heading.
 * @param level - Markdown heading level.
 * @param text - Heading text.
 * @returns Markdown heading.
 */
function heading(level, text) {
    return `${'#'.repeat(level)} ${text}`;
}
/**
 * Renders a Markdown link.
 * @param text - Link text.
 * @param url - Link URL.
 * @returns Markdown link.
 */
function link(text, url) {
    return `[${text}](${url})`;
}
/**
 * Renders an array into a Markdown unordered list.
 * @param array - Items to render.
 * @param callback - Item renderer.
 * @returns Markdown unordered list.
 */
function list(array, callback) {
    return each(array, (item) => {
        const rendered = toString(callback(item)).trim();
        const itemText = rendered
            .split(/\r?\n/)
            .map((line, index) => (index > 0 && line
            ? `  ${line}`
            : line))
            .join('\n');
        return rendered ? `* ${itemText}` : '';
    });
}
/**
 * Renders bold Markdown text.
 * @param text - Text to render.
 * @returns Bold Markdown text.
 */
function bold(text) {
    return `**${text}**`;
}
/**
 * Renders italic Markdown text.
 * @param text - Text to render.
 * @returns Italic Markdown text.
 */
function italic(text) {
    return `_${text}_`;
}
/**
 * Renders text inside an HTML small element.
 * @param text - Text to render.
 * @returns HTML small element.
 */
function small(text) {
    return `<small>${text}</small>`;
}
/**
 * Creates one or more newline characters.
 * @param times - Number of newline characters to render.
 * @returns Newline characters.
 */
function newline(times = 1) {
    return '\n'.repeat(times);
}
/**
 * Renders values without separators.
 * @param values - Values to render.
 * @returns Concatenated non-empty values.
 */
function strings(...values) {
    return each(values, value => value, '');
}
/**
 * Renders values as Markdown blocks separated by blank lines.
 * @param values - Values to render.
 * @returns Rendered non-empty block segments.
 */
function segments(...values) {
    return each(values, value => value, newline(2));
}
/**
 * Renders values as space-separated words.
 * @param values - Values to render.
 * @returns Rendered non-empty words.
 */
function words(...values) {
    return each(values, value => value, ' ');
}
/**
 * Joins URL path segments and trims extra slashes around each segment.
 * @param parts - URL path segments.
 * @returns Joined URL.
 */
function url(...parts) {
    return parts.reduce((acc, part) => {
        if (typeof part !== 'number' && !part) {
            return acc;
        }
        const segment = String(part).replace(/^\/+|\/+$/g, '');
        return acc
            ? `${acc}/${segment}`
            : segment;
    }, '');
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWxlbWVudHMuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyIuLi9zcmMvZWxlbWVudHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7Ozs7R0FJRztBQUNILFNBQVMsUUFBUSxDQUFDLEtBQWlEO0lBQ2pFLE9BQU8sT0FBTyxLQUFLLEtBQUssUUFBUSxJQUFJLEtBQUssQ0FBQyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUE7QUFDaEUsQ0FBQztBQUVEOzs7Ozs7R0FNRztBQUNILE1BQU0sVUFBVSxJQUFJLENBQ2xCLEtBQXFDLEVBQ3JDLFFBQWlFLEVBQ2pFLFNBQVMsR0FBRyxPQUFPLEVBQUU7SUFFckIsT0FBTyxLQUFLO1FBQ1YsQ0FBQyxDQUFDLEtBQUssQ0FBQyxNQUFNLENBQUMsQ0FBQyxHQUFHLEVBQUUsSUFBSSxFQUFFLEVBQUU7WUFDM0IsTUFBTSxRQUFRLEdBQUcsUUFBUSxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLElBQUksRUFBRSxDQUFBO1lBRWhELE9BQU8sR0FBRyxHQUFHLEdBQUcsR0FBRyxJQUFJLFFBQVEsQ0FBQyxDQUFDLENBQUMsU0FBUyxDQUFDLENBQUMsQ0FBQyxFQUFFLEdBQUcsUUFBUSxFQUFFLENBQUE7UUFDL0QsQ0FBQyxFQUFFLEVBQUUsQ0FBQztRQUNOLENBQUMsQ0FBQyxFQUFFLENBQUE7QUFDUixDQUFDO0FBRUQ7Ozs7O0dBS0c7QUFDSCxNQUFNLFVBQVUsT0FBTyxDQUFDLEtBQWEsRUFBRSxJQUFZO0lBQ2pELE9BQU8sR0FBRyxHQUFHLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxJQUFJLElBQUksRUFBRSxDQUFBO0FBQ3ZDLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSxJQUFJLENBQUMsSUFBWSxFQUFFLEdBQVc7SUFDNUMsT0FBTyxJQUFJLElBQUksS0FBSyxHQUFHLEdBQUcsQ0FBQTtBQUM1QixDQUFDO0FB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

/***/ }),

/***/ 81207:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

/* harmony export */ __webpack_require__.d(__webpack_exports__, {
/* harmony export */   Ek: () => (/* binding */ repositoryUrl),
/* harmony export */   HX: () => (/* binding */ commitPartial),
/* harmony export */   Nr: () => (/* binding */ BREAKING_CHANGES_TITLE),
/* harmony export */   Pq: () => (/* binding */ footerPartial),
/* harmony export */   XH: () => (/* binding */ compareUrl),
/* harmony export */   ir: () => (/* binding */ reference),
/* harmony export */   l8: () => (/* binding */ noteTitle),
/* harmony export */   mK: () => (/* binding */ isBreakingNote),
/* harmony export */   nA: () => (/* binding */ referenceRepositoryUrl),
/* harmony export */   pA: () => (/* binding */ headerPartial),
/* harmony export */   vs: () => (/* binding */ template),
/* harmony export */   we: () => (/* binding */ BREAKING_CHANGE_KEYWORDS),
/* harmony export */   ws: () => (/* binding */ preamblePartial)
/* harmony export */ });
/* harmony import */ var _elements_js__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(42899);

/**
 * Builds a repository URL from template context fields.
 * @param context - Template context.
 * @returns Repository URL.
 */
function repositoryUrl(context) {
    if (context.repository) {
        return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .url */ .OZ)(context.host, context.owner, context.repository);
    }
    return context.repoUrl || '';
}
/**
 * Builds a repository URL for a commit reference.
 * @param context - Template context.
 * @param reference - Commit reference.
 * @returns Reference repository URL.
 */
function referenceRepositoryUrl(context, reference) {
    if (!context.repository) {
        return context.repoUrl || '';
    }
    if (reference.repository) {
        return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .url */ .OZ)(context.host, reference.owner, reference.repository);
    }
    return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .url */ .OZ)(context.host, context.owner, context.repository);
}
/**
 * Builds a release comparison URL and encodes tag names as URL path segments.
 * @param context - Template context.
 * @returns Release comparison URL.
 */
function compareUrl(context) {
    const previousTag = encodeURIComponent(context.previousTag || '');
    const currentTag = encodeURIComponent(context.currentTag || '');
    return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .url */ .OZ)(repositoryUrl(context), context.compare || 'compare', `${previousTag}...${currentTag}`);
}
const BREAKING_CHANGE_KEYWORDS = ['BREAKING CHANGE', 'BREAKING-CHANGE'];
const BREAKING_CHANGES_TITLE = 'BREAKING CHANGES';
/**
 * Renders a note group title.
 * Breaking change keywords are merged into a single title,
 * every other keyword is uppercased to group its spellings together.
 * @param title - Note title as it was written in a commit.
 * @returns Note group title.
 */
function noteTitle(title) {
    const upperCaseTitle = title.toUpperCase();
    return BREAKING_CHANGE_KEYWORDS.includes(upperCaseTitle)
        ? BREAKING_CHANGES_TITLE
        : upperCaseTitle;
}
/**
 * Checks if a note is a breaking change note.
 * @param note - Commit note.
 * @returns Is it a breaking change note.
 */
function isBreakingNote(note) {
    return noteTitle(note.title) === BREAKING_CHANGES_TITLE;
}
/**
 * Renders a commit reference label.
 * @param reference - Commit reference.
 * @returns Commit reference label.
 */
function reference(reference) {
    return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .strings */ .P$)(reference.owner && `${reference.owner}/`, reference.repository, reference.issue && `${reference.prefix || '#'}${reference.issue}`);
}
/**
 * Renders the default changelog header.
 * @param context - Template context.
 * @returns Changelog header.
 */
function headerPartial({ isPatch, title, version, date }) {
    const versionText = (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .words */ .aL)(version, title && `"${title}"`, date && `(${date})`);
    return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .heading */ .R_)(2, isPatch ? (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .small */ .EX)(versionText) : versionText);
}
/**
 * Renders the default changelog preamble.
 * @param context - Template context.
 * @returns Changelog preamble.
 */
function preamblePartial({ preamble }) {
    return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .strings */ .P$)(preamble);
}
/**
 * Renders the default changelog footer.
 * @param context - Template context.
 * @returns Changelog footer.
 */
function footerPartial({ noteGroups }) {
    return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .each */ .__)(noteGroups, group => (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .segments */ .JF)((0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .heading */ .R_)(3, group.title), (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .list */ .p_)(group.notes, note => note.text)), (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .newline */ .NN)(2));
}
/**
 * Renders the default changelog commit line.
 * @param context - Template context.
 * @param commit - Transformed commit.
 * @returns Changelog commit line.
 */
function commitPartial(context, commit) {
    const { linkReferences, issue, commit: commitUrlPath } = context;
    const { hash, references, header } = commit;
    const commitLink = hash
        ? linkReferences
            ? `(${(0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .link */ .nf)(hash, (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .url */ .OZ)(repositoryUrl(context), commitUrlPath, hash))})`
            : hash
        : '';
    const renderedReferences = (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .each */ .__)(references, (linkReference) => {
        if (linkReferences) {
            return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .link */ .nf)(reference(linkReference), (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .url */ .OZ)(referenceRepositoryUrl(context, linkReference), issue, linkReference.issue));
        }
        return reference(linkReference);
    }, ' ');
    return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .strings */ .P$)((0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .words */ .aL)(header, commitLink), renderedReferences && `, closes ${renderedReferences}`);
}
/**
 * Renders the default changelog template.
 * @param context - Template context.
 * @returns Changelog text.
 */
function template(context) {
    const { headerPartial, preamblePartial, commitPartial, footerPartial, commitGroups } = context;
    return (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .segments */ .JF)(headerPartial(context), preamblePartial(context), (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .each */ .__)(commitGroups, group => (0,_elements_js__WEBPACK_IMPORTED_MODULE_0__/* .list */ .p_)(group.commits, commit => commitPartial(context, commit))), footerPartial(context));
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVtcGxhdGVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3RlbXBsYXRlcy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFPQSxPQUFPLEVBQ0wsSUFBSSxFQUNKLElBQUksRUFDSixJQUFJLEVBQ0osS0FBSyxFQUNMLE9BQU8sRUFDUCxRQUFRLEVBQ1IsT0FBTyxFQUNQLEtBQUssRUFDTCxPQUFPLEVBQ1AsR0FBRyxFQUNKLE1BQU0sZUFBZSxDQUFBO0FBRXRCOzs7O0dBSUc7QUFDSCxNQUFNLFVBQVUsYUFBYSxDQUMzQixPQUFxQztJQUVyQyxJQUFJLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN2QixPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFBO0lBQzdELENBQUM7SUFFRCxPQUFPLE9BQU8sQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFBO0FBQzlCLENBQUM7QUFFRDs7Ozs7R0FLRztBQUNILE1BQU0sVUFBVSxzQkFBc0IsQ0FDcEMsT0FBcUMsRUFDckMsU0FBMEI7SUFFMUIsSUFBSSxDQUFDLE9BQU8sQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN4QixPQUFPLE9BQU8sQ0FBQyxPQUFPLElBQUksRUFBRSxDQUFBO0lBQzlCLENBQUM7SUFFRCxJQUFJLFNBQVMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUN6QixPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLFNBQVMsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDLFVBQVUsQ0FBQyxDQUFBO0lBQ2pFLENBQUM7SUFFRCxPQUFPLEdBQUcsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLE9BQU8sQ0FBQyxLQUFLLEVBQUUsT0FBTyxDQUFDLFVBQVUsQ0FBQyxDQUFBO0FBQzdELENBQUM7QUFFRDs7OztHQUlHO0FBQ0gsTUFBTSxVQUFVLFVBQVUsQ0FDeEIsT0FBcUM7SUFFckMs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

/***/ }),

/***/ 14913:
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {


// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  "default": () => (/* binding */ createPreset)
});

// UNUSED EXPORTS: DEFAULT_COMMIT_TYPES, formatCommitUrl, formatCompareUrl, formatIssueUrl, formatNoteIcon, formatNoteTitle, formatUserUrl

// NAMESPACE OBJECT: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/format.js
var format_namespaceObject = {};
__webpack_require__.r(format_namespaceObject);
__webpack_require__.d(format_namespaceObject, {
  formatCommitUrl: () => (formatCommitUrl),
  formatCompareUrl: () => (formatCompareUrl),
  formatIssueUrl: () => (formatIssueUrl),
  formatNoteIcon: () => (formatNoteIcon),
  formatNoteTitle: () => (formatNoteTitle),
  formatUserUrl: () => (formatUserUrl)
});

// EXTERNAL MODULE: ./node_modules/.pnpm/@conventional-changelog+template@1.4.0/node_modules/@conventional-changelog/template/dist/templates.js
var templates = __webpack_require__(81207);
;// CONCATENATED MODULE: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/constants.js
const BREAKING_HEADER_PATTERN = /^(\w*)(?:\((.*)\))?!: (.*)$/

const DEFAULT_COMMIT_TYPES = Object.freeze([
  {
    type: 'feat',
    section: 'Features',
    effect: 'bump'
  },
  {
    type: 'feature',
    section: 'Features',
    effect: 'bump'
  },
  {
    type: 'fix',
    section: 'Bug Fixes',
    effect: 'bump'
  },
  {
    type: 'perf',
    section: 'Performance Improvements',
    effect: 'bump'
  },
  {
    type: 'revert',
    section: 'Reverts',
    effect: 'bump'
  },
  {
    type: 'docs',
    section: 'Documentation',
    effect: 'hidden'
  },
  {
    type: 'style',
    section: 'Styles',
    effect: 'hidden'
  },
  {
    type: 'chore',
    section: 'Miscellaneous Chores',
    effect: 'hidden'
  },
  {
    type: 'refactor',
    section: 'Code Refactoring',
    effect: 'hidden'
  },
  {
    type: 'test',
    section: 'Tests',
    effect: 'hidden'
  },
  {
    type: 'build',
    section: 'Build System',
    effect: 'hidden'
  },
  {
    type: 'ci',
    section: 'Continuous Integration',
    effect: 'hidden'
  }
].map(Object.freeze))

;// CONCATENATED MODULE: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/parser.js



function createParserOpts(config) {
  return {
    headerPattern: /^(\w*)(?:\((.*)\))?!?: (.*)$/,
    breakingHeaderPattern: BREAKING_HEADER_PATTERN,
    headerCorrespondence: [
      'type',
      'scope',
      'subject'
    ],
    noteKeywords: templates/* BREAKING_CHANGE_KEYWORDS */.we,
    revertPattern: /^(?:Revert|revert:)\s"?([\s\S]+?)"?\s*This reverts commit (\w*)\./i,
    revertCorrespondence: ['header', 'hash'],
    issuePrefixes: config?.issuePrefixes || ['#']
  }
}

// EXTERNAL MODULE: ./node_modules/.pnpm/@conventional-changelog+template@1.4.0/node_modules/@conventional-changelog/template/dist/elements.js
var dist_elements = __webpack_require__(42899);
;// CONCATENATED MODULE: ./node_modules/.pnpm/@conventional-changelog+template@1.4.0/node_modules/@conventional-changelog/template/dist/references.js

/**
 * Markdown segments to keep as is: replacing references inside them
 * would break already formatted links, code samples and urls.
 */
const protectedSegments = [
    /\[(?:[^[\]]|\[[^[\]]*])*]\((?:[^()\n]|\([^()\n]*\))*\)/, // [text](url)
    /\[[^\]]*]\[[^\]]*]/, // [text][ref]
    // the lookahead makes the delimiter length atomic, without it a long run
    // of backticks makes the regex engine retry every possible delimiter length
    /^[ \t]*(?=(?<fence>`{3,}|~{3,}))\k<fence>[\s\S]*?^[ \t]*\k<fence>[ \t]*\r?$/, // ```code block```
    /(?=(?<code>`+))\k<code>[^\n]*?\k<code>/, // `code span`
    /https?:\/\/(?:[^\s()]|\([^\s()]*\))+/ // https://url
];
const userMention = /\B@(?<user>[a-z0-9](?:-?[a-z0-9/]){0,38})/;
const defaultIssuePattern = /[a-z0-9]+/;
/**
 * Escapes a string to use it as a part of a regex.
 * @param string
 * @returns Escaped string.
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/**
 * Builds a regex which matches issue and user references
 * outside of the protected Markdown segments.
 * @param issuePrefixes
 * @param issuePattern
 * @returns Regex with `prefix`, `issue` and `user` groups.
 */
function referencesRegex(issuePrefixes = [], issuePattern = defaultIssuePattern) {
    const prefixes = issuePrefixes
        .map(prefix => (typeof prefix === 'string' ? escapeRegExp(prefix) : prefix.source))
        .join('|');
    const patterns = [
        ...protectedSegments.map(segment => segment.source),
        // without prefixes every word would be matched as an issue reference
        prefixes && `(?<prefix>${prefixes})(?<issue>${issuePattern.source})`,
        userMention.source
    ];
    return new RegExp(patterns.filter(Boolean).join('|'), 'gm');
}
/**
 * Creates a text formatter for the given options.
 *
 * Regexes from the options are inlined into a single multiline regex,
 * so their flags are ignored, `^` and `$` match line boundaries,
 * and they should not contain capturing groups, backreferences or named groups.
 * @param options - Formatter options.
 * @returns Formatter which replaces issue and user references in a text with links.
 */
function createReferencesFormatter(options) {
    const regex = referencesRegex(options.issuePrefixes, options.issuePattern);
    return (text, context, references) => text.replace(regex, (match, ...args) => {
        const { prefix, issue, user } = args.at(-1);
        if (issue) {
            const issueUrl = options.formatIssueUrl(context, {
                prefix: prefix,
                issue
            });
            if (!issueUrl) {
                return match;
            }
            references?.push(match);
            return (0,dist_elements/* link */.nf)(match, issueUrl);
        }
        if (user) {
            // TODO: investigate why this code exists.
            if (user.includes('/')) {
                return match;
            }
            const userUrl = options.formatUserUrl(context, user);
            if (!userUrl) {
                return match;
            }
            return (0,dist_elements/* link */.nf)(match, userUrl);
        }
        return match;
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmVmZXJlbmNlcy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy9yZWZlcmVuY2VzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUlBLE9BQU8sRUFBRSxJQUFJLEVBQUUsTUFBTSxlQUFlLENBQUE7QUFFcEM7OztHQUdHO0FBQ0gsTUFBTSxpQkFBaUIsR0FBRztJQUN4Qix3REFBd0QsRUFBRSxjQUFjO0lBQ3hFLG9CQUFvQixFQUFFLGNBQWM7SUFDcEMseUVBQXlFO0lBQ3pFLDRFQUE0RTtJQUM1RSw2RUFBNkUsRUFBRSxtQkFBbUI7SUFDbEcsd0NBQXdDLEVBQUUsY0FBYztJQUN4RCxzQ0FBc0MsQ0FBQyxjQUFjO0NBQ3RELENBQUE7QUFDRCxNQUFNLFdBQVcsR0FBRywyQ0FBMkMsQ0FBQTtBQUMvRCxNQUFNLG1CQUFtQixHQUFHLFdBQVcsQ0FBQTtBQXdDdkM7Ozs7R0FJRztBQUNILFNBQVMsWUFBWSxDQUFDLE1BQWM7SUFDbEMsT0FBTyxNQUFNLENBQUMsT0FBTyxDQUFDLHFCQUFxQixFQUFFLE1BQU0sQ0FBQyxDQUFBO0FBQ3RELENBQUM7QUFFRDs7Ozs7O0dBTUc7QUFDSCxTQUFTLGVBQWUsQ0FDdEIsYUFBYSxHQUF3QixFQUFFLEVBQ3ZDLFlBQVksR0FBVyxtQkFBbUI7SUFFMUMsTUFBTSxRQUFRLEdBQUcsYUFBYTtTQUMzQixHQUFHLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQyxDQUFDLE9BQU8sTUFBTSxLQUFLLFFBQVEsQ0FBQyxDQUFDLENBQUMsWUFBWSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsQ0FBQyxNQUFNLENBQUMsTUFBTSxDQUFDLENBQUM7U0FDbEYsSUFBSSxDQUFDLEdBQUcsQ0FBQyxDQUFBO0lBQ1osTUFBTSxRQUFRLEdBQUc7UUFDZixHQUFHLGlCQUFpQixDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDLE9BQU8sQ0FBQyxNQUFNLENBQUM7UUFDbkQscUVBQXFFO1FBQ3JFLFFBQVEsSUFBSSxhQUFhLFFBQVEsYUFBYSxZQUFZLENBQUMsTUFBTSxHQUFHO1FBQ3BFLFdBQVcsQ0FBQyxNQUFNO0tBQ25CLENBQUE7SUFFRCxPQUFPLElBQUksTUFBTSxDQUFDLFFBQVEsQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLENBQUMsSUFBSSxDQUFDLEdBQUcsQ0FBQyxFQUFFLElBQUksQ0FBQyxDQUFBO0FBQzdELENBQUM7QUFFRDs7Ozs7Ozs7R0FRRztBQUNILE1BQU0sVUFBVSx5QkFBeUIsQ0FDdkMsT0FBMkM7SUFFM0MsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFDLE9BQU8sQ0FBQyxhQUFhLEVBQUUsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFBO0lBRTFFLE9BQU8sQ0FBQyxJQUFJLEVBQUUsT0FBTyxFQUFFLFVBQVUsRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxLQUFLLEVBQUUsQ0FBQyxLQUFLLEVBQUUsR0FBRyxJQUFJLEVBQUUsRUFBRTtRQUMzRSxNQUFNLEVBQ0osTUFBTSxFQUNOLEtBQUssRUFDTCxJQUFJLEVBQ0wsR0FBRyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxDQUErQyxDQUFBO1FBRTdELElBQUksS0FBSyxFQUFFLENBQUM7WUFDVixNQUFNLFFBQVEsR0FBRyxPQUFPLENBQUMsY0FBYyxDQUFDLE9BQU8sRUFBRTtnQkFDL0MsTUFBTSxFQUFFLE1BQWdCO2dCQUN4QixLQUFLO2FBQ04sQ0FBQyxDQUFBO1lBRUYsSUFBSSxDQUFDLFFBQVEsRUFBRSxDQUFDO2dCQUNkLE9BQU8sS0FBSyxDQUFBO1lBQ2QsQ0FBQztZQUVELFVBQVUsRUFBRSxJQUFJLENBQUMsS0FBSyxDQUFDLENBQUE7WUFFdkIsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLFFBQVEsQ0FBQyxDQUFBO1FBQzlCLENBQUM7UUFFRCxJQUFJLElBQUksRUFBRSxDQUFDO1lBQ1QsMENBQTBDO1lBQzFDLElBQUksSUFBSSxDQUFDLFFBQVEsQ0FBQyxHQUFHLENBQUMsRUFBRSxDQUFDO2dCQUN2QixPQUFPLEtBQUssQ0FBQTtZQUNkLENBQUM7WUFFRCxNQUFNLE9BQU8sR0FBRyxPQUFPLENBQUMsYUFBYSxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQTtZQUVwRCxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7Z0JBQ2IsT0FBTyxLQUFLLENBQUE7WUFDZCxDQUFDO1lBRUQsT0FBTyxJQUFJLENBQUMsS0FBSyxFQUFFLE9BQU8sQ0FBQyxDQUFBO1FBQzdCLENBQUM7UUFFRCxPQUFPLEtBQUssQ0FBQTtJQUNkLENBQUMsQ0FBQyxDQUFBO0FBQ0osQ0FBQyJ9
;// CONCATENATED MODULE: ./node_modules/.pnpm/@conventional-changelog+template@1.4.0/node_modules/@conventional-changelog/template/dist/legacy.js
/**
 * Creates writer options which make legacy handlebars-based writers
 * (`conventional-changelog-writer@8` and older) fail loudly instead of
 * silently rendering an empty changelog when a mixed-versions install
 * resolves a modern preset against them.
 * Legacy writers compile the `mainTemplate` option with handlebars,
 * where rendering the planted template triggers the `helperMissing` hook,
 * which throws an error with the message from the template.
 * Modern writers have no `mainTemplate` option and ignore the value,
 * and a string survives the option merges of downstream tooling,
 * so the guard reaches legacy writers even through cloned options.
 * The message must not contain `]` characters to stay a valid
 * handlebars segment literal.
 * @param preset - Preset package name to mention in the error message.
 * @returns Writer options to spread into preset writer options.
 */
function createLegacyWriterGuard(preset) {
    return {
        mainTemplate: `{{[${preset} requires conventional-changelog-writer@9 or newer (conventional-changelog@8 or newer). Your changelog tooling loaded an older writer which cannot render this preset. Update the tooling or use an older major version of the preset.] true}}`
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibGVnYWN5LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL2xlZ2FjeS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7Ozs7Ozs7Ozs7Ozs7O0dBZUc7QUFDSCxNQUFNLFVBQVUsdUJBQXVCLENBQUMsTUFBYztJQUNwRCxPQUFPO1FBQ0wsWUFBWSxFQUFFLE1BQU0sTUFBTSxnUEFBZ1A7S0FDM1EsQ0FBQTtBQUNILENBQUMifQ==
;// CONCATENATED MODULE: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/utils.js



/**
 * Get commit notes with the breaking change declared by `!` in the header.
 * The parser adds that note only if the commit has no notes at all,
 * so a footer of any other keyword hides the breaking change.
 * @param commit
 * @returns Commit notes.
 */
function getNotes(commit) {
  if (commit.notes.some(templates/* isBreakingNote */.mK) || !BREAKING_HEADER_PATTERN.test(commit.header || '')) {
    return commit.notes
  }

  return [
    {
      title: templates/* BREAKING_CHANGE_KEYWORDS */.we[0],
      text: commit.subject || ''
    },
    ...commit.notes
  ]
}

function hasIntersection(a, b) {
  if (!a || !b) {
    return false
  }

  let listA = a
  let listB = b

  if (!Array.isArray(listA)) {
    listA = [listA]
  }

  if (!Array.isArray(listB)) {
    listB = [listB]
  }

  return listA.some(item => listB.includes(item))
}

function matchScope(config = {}, commit) {
  const {
    scope: targetScope,
    scopeOnly = false
  } = config
  const includesScope = hasIntersection(
    commit.scope?.split(','),
    targetScope
  )

  return !targetScope
    || (scopeOnly && includesScope)
    || (!scopeOnly && (!commit.scope || includesScope))
}

function findTypeEntry(types, commit) {
  const typeKey = (commit.revert ? 'revert' : commit.type || '').toLowerCase()

  return types.find((entry) => {
    if (entry.type !== typeKey) {
      return false
    }

    if (entry.scope && entry.scope !== commit.scope) {
      return false
    }

    return true
  })
}

function isTypeEffect(type, effect) {
  return (type.effect || 'bump') === effect
}

;// CONCATENATED MODULE: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/templates.js


function headerPartial(context) {
  const {
    linkCompare,
    version,
    title,
    date
  } = context
  const versionText = linkCompare
    ? (0,dist_elements/* link */.nf)(version, this.formatCompareUrl(context))
    : version

  return (0,dist_elements/* heading */.R_)(
    2,
    (0,dist_elements/* words */.aL)(
      versionText,
      title && `"${title}"`,
      date && `(${date})`
    )
  )
}

function preamblePartial(context) {
  return (0,dist_elements/* strings */.P$)(context.preamble)
}

function renderReferences(context, references, filter) {
  return (0,dist_elements/* each */.__)(
    references?.filter(filter),
    (commitReference) => {
      if (context.linkReferences) {
        return (0,dist_elements/* link */.nf)(
          (0,templates/* reference */.ir)(commitReference),
          this.formatIssueUrl(context, commitReference)
        )
      }

      return (0,templates/* reference */.ir)(commitReference)
    },
    ' '
  )
}

function commitPartial(context, commit) {
  const { linkReferences } = context
  const {
    scope,
    subject,
    header,
    shortHash,
    hash,
    references
  } = commit
  const commitLink = hash
    ? linkReferences
      ? `(${(0,dist_elements/* link */.nf)(shortHash, this.formatCommitUrl(context, commit))})`
      : shortHash
    : ''
  const closingReferences = renderReferences.call(
    this,
    context,
    references,
    commitReference => commitReference.action
  )
  const otherReferences = renderReferences.call(
    this,
    context,
    references,
    commitReference => !commitReference.action
  )

  return (0,dist_elements/* strings */.P$)(
    (0,dist_elements/* words */.aL)(
      scope && (0,dist_elements/* bold */.Cr)(`${scope}:`),
      subject || header || '',
      commitLink
    ),
    closingReferences && `, closes ${closingReferences}`,
    otherReferences && `, references ${otherReferences}`
  )
}

function footerPartial() {
  return ''
}

function template(context) {
  const {
    headerPartial,
    preamblePartial,
    commitPartial,
    footerPartial,
    noteGroups,
    commitGroups
  } = context

  return (0,dist_elements/* segments */.JF)(
    headerPartial(context),
    preamblePartial(context),
    (0,dist_elements/* each */.__)(
      noteGroups,
      group => (0,dist_elements/* segments */.JF)(
        (0,dist_elements/* heading */.R_)(3, (0,dist_elements/* words */.aL)(this.formatNoteIcon(context, group.title), group.title)),
        (0,dist_elements/* list */.p_)(
          group.notes,
          note => (0,dist_elements/* words */.aL)(
            note.commit.scope && (0,dist_elements/* bold */.Cr)(`${note.commit.scope}:`),
            note.text
          )
        )
      ),
      (0,dist_elements/* newline */.NN)(2)
    ),
    (0,dist_elements/* each */.__)(
      commitGroups,
      group => (0,dist_elements/* segments */.JF)(
        group.title && (0,dist_elements/* heading */.R_)(3, group.title),
        (0,dist_elements/* list */.p_)(
          group.commits,
          commit => commitPartial(context, commit)
        )
      ),
      (0,dist_elements/* newline */.NN)(2)
    ),
    footerPartial(context)
  )
}

;// CONCATENATED MODULE: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/format.js


function formatNoteTitle(context, title) {
  return (0,templates/* noteTitle */.l8)(title)
}

function formatNoteIcon(context, title) {
  return title === templates/* BREAKING_CHANGES_TITLE */.Nr ? '⚠' : ''
}

function formatIssueUrl(context, reference) {
  return (0,dist_elements/* url */.OZ)(
    (0,templates/* referenceRepositoryUrl */.nA)(context, reference),
    context.issue || 'issues',
    reference.issue
  )
}

function formatCommitUrl(context, commit) {
  return (0,dist_elements/* url */.OZ)((0,templates/* repositoryUrl */.Ek)(context), context.commit || 'commit', commit.hash)
}

function formatCompareUrl(context) {
  return (0,templates/* compareUrl */.XH)(context)
}

function formatUserUrl(context, user) {
  return (0,dist_elements/* url */.OZ)(context.host, user)
}

;// CONCATENATED MODULE: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/writer.js






const COMMIT_HASH_LENGTH = 7
const releaseAsRegex = /release-as:\s*\w*@?([0-9]+\.[0-9]+\.[0-9a-z]+(-[0-9a-z.]+)?)\s*/i

function compareNotes(a, b) {
  return (a.title || '').localeCompare(b.title || '')
    || (a.text || '').localeCompare(b.text || '')
}

function createWriterOpts(config) {
  const finalConfig = {
    types: DEFAULT_COMMIT_TYPES,
    issuePrefixes: ['#'],
    ...format_namespaceObject,
    ...config
  }
  const commitGroupOrder = finalConfig.types.map(t => t.section).filter(Boolean)
  const formatReferences = createReferencesFormatter(finalConfig)

  return {
    ...createLegacyWriterGuard('conventional-changelog-conventionalcommits'),
    template: template.bind(finalConfig),
    headerPartial: headerPartial.bind(finalConfig),
    preamblePartial: preamblePartial.bind(finalConfig),
    commitPartial: commitPartial.bind(finalConfig),
    footerPartial: footerPartial.bind(finalConfig),
    transform: (commit, context) => {
      let discard = true
      const issues = []
      const entry = findTypeEntry(finalConfig.types, commit)

      // Add an entry in the CHANGELOG if special Release-As footer
      // is used:
      if ((commit.footer && releaseAsRegex.test(commit.footer))
        || (commit.body && releaseAsRegex.test(commit.body))) {
        discard = false
      }

      const notes = getNotes(commit).map((note) => {
        discard = false

        return {
          ...note,
          title: finalConfig.formatNoteTitle(context, note.title),
          text: formatReferences(note.text, context)
        }
      })

      if (
        // notes attached to any type are still displayed.
        discard && (entry === undefined || isTypeEffect(entry, 'hidden'))
        || !matchScope(finalConfig, commit)
      ) {
        return undefined
      }

      const type = entry
        ? entry.section
        : commit.type
      const scope = commit.scope === '*' || finalConfig.scope
        ? ''
        : commit.scope
      const shortHash = typeof commit.hash === 'string'
        ? commit.hash.substring(0, COMMIT_HASH_LENGTH)
        : commit.shortHash
      let { subject } = commit

      if (typeof subject === 'string') {
        // Issue and user URLs.
        subject = formatReferences(subject, context, issues)
      }

      // remove references that already appear in the subject
      const references = commit.references.filter(reference => !issues.includes(reference.prefix + reference.issue))

      return {
        notes,
        type,
        scope,
        shortHash,
        subject,
        references
      }
    },
    groupBy: 'type',
    // the groupings of commit messages, e.g., Features vs., Bug Fixes, are
    // sorted based on their probable importance:
    commitGroupsSort: (a, b) => {
      const gRankA = commitGroupOrder.indexOf(a.title)
      const gRankB = commitGroupOrder.indexOf(b.title)

      return gRankA - gRankB
    },
    commitsSort: ['scope', 'subject'],
    noteGroupsSort: 'title',
    notesSort: compareNotes
  }
}

;// CONCATENATED MODULE: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/whatBump.js




function createWhatBump(config = {}) {
  const { types = DEFAULT_COMMIT_TYPES } = config

  return function whatBump(commits) {
    let level = null
    let breakings = 0
    let features = 0

    commits.forEach((commit) => {
      if (!matchScope(config, commit)) {
        return
      }

      const entry = findTypeEntry(types, commit)
      // only breaking change notes affect the version,
      // any other note keyword is just a changelog section
      const breakingNotes = getNotes(commit).filter(templates/* isBreakingNote */.mK)

      if (breakingNotes.length > 0) {
        breakings += breakingNotes.length
        level = 0
      } else
        if (entry && isTypeEffect(entry, 'bump')) {
          if (level === null) {
            level = 2
          }

          if (commit.type === 'feat' || commit.type === 'feature') {
            features += 1

            if (level > 1) {
              level = 1
            }
          }
        }
    })

    if (level === null) {
      return null
    }

    if (config?.preMajor && level < 2) {
      level++
    }

    return {
      level,
      reason: breakings === 1
        ? `There is ${breakings} BREAKING CHANGE and ${features} features`
        : `There are ${breakings} BREAKING CHANGES and ${features} features`
    }
  }
}

;// CONCATENATED MODULE: ./node_modules/.pnpm/conventional-changelog-conventionalcommits@10.4.0/node_modules/conventional-changelog-conventionalcommits/src/index.js







function createPreset(config) {
  return {
    commits: {
      ignore: config?.ignoreCommits,
      merges: false
    },
    parser: createParserOpts(config),
    writer: createWriterOpts(config),
    whatBump: createWhatBump(config)
  }
}


/***/ })

};
;
//# sourceMappingURL=913.index.js.map