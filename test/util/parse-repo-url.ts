import {describe, it, expect} from 'vitest';

import {parseRepoUrl} from '../../src/util/parse-repo-url';

describe('parseRepoUrl', () => {
  it.each([
    ['owner/repo', ['owner', 'repo']],
    ['github.com/owner/repo', ['owner', 'repo']],
    ['https://github.com/owner/repo', ['owner', 'repo']],
    ['https://github.com/owner/repo.git', ['owner', 'repo']],
    ['https://github.com/owner/repo/', ['owner', 'repo']],
    ['http://github.com/owner/repo', ['owner', 'repo']],
    ['git@github.com:owner/repo.git', ['owner', 'repo']],
    ['git+ssh://git@github.com/owner/repo.git', ['owner', 'repo']],
    ['https://github.enterprise.example/owner/repo', ['owner', 'repo']],
    ['  owner/repo  ', ['owner', 'repo']],
  ])('parses %s', (input, expected) => {
    expect(parseRepoUrl(input)).toEqual(expected);
  });

  it.each(['', 'no-slash', 'https://github.com/'])(
    'returns null for invalid input %s',
    input => {
      expect(parseRepoUrl(input)).toBeNull();
    }
  );
});
