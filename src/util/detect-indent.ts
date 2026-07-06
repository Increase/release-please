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

// Vendored from detect-indent (MIT, sindresorhus/detect-indent), which as of
// v7 is published as ESM-only and can no longer be `require()`d from this
// CommonJS codebase.

const INDENT_REGEX = /^(?:( )+|\t+)/;

type IndentType = 'space' | 'tab';

function shouldIgnoreSingleSpace(
  ignoreSingleSpaces: boolean,
  indentType: IndentType,
  value: number
): boolean {
  return ignoreSingleSpaces && indentType === 'space' && value === 1;
}

function encodeIndentsKey(indentType: IndentType, indentAmount: number) {
  return (indentType === 'space' ? 's' : 't') + String(indentAmount);
}

function decodeIndentsKey(indentsKey: string) {
  const type: IndentType = indentsKey[0] === 's' ? 'space' : 'tab';
  const amount = Number(indentsKey.slice(1));
  return {type, amount};
}

function makeIndentsMap(string: string, ignoreSingleSpaces: boolean) {
  const indents = new Map<string, [number, number]>();

  let previousSize = 0;
  let previousIndentType = '';
  let key: string | undefined;

  for (const line of string.split(/\n/g)) {
    if (!line) {
      continue;
    }

    const matches = line.match(INDENT_REGEX);

    if (matches === null) {
      previousSize = 0;
      previousIndentType = '';
      continue;
    }

    const indent = matches[0].length;
    const indentType: IndentType = matches[1] ? 'space' : 'tab';

    if (shouldIgnoreSingleSpace(ignoreSingleSpaces, indentType, indent)) {
      continue;
    }

    if (indentType !== previousIndentType) {
      previousSize = 0;
    }

    previousIndentType = indentType;

    let use = 1;
    let weight = 0;

    const indentDifference = indent - previousSize;
    previousSize = indent;

    if (indentDifference === 0) {
      use = 0;
      weight = 1;
    } else {
      const absoluteIndentDifference = Math.abs(indentDifference);

      if (
        shouldIgnoreSingleSpace(
          ignoreSingleSpaces,
          indentType,
          absoluteIndentDifference
        )
      ) {
        continue;
      }

      key = encodeIndentsKey(indentType, absoluteIndentDifference);
    }

    if (key !== undefined) {
      const entry = indents.get(key);
      indents.set(
        key,
        entry === undefined ? [1, 0] : [entry[0] + use, entry[1] + weight]
      );
    }
  }

  return indents;
}

function getMostUsedKey(indents: Map<string, [number, number]>) {
  let result: string | undefined;
  let maxUsed = 0;
  let maxWeight = 0;

  for (const [key, [usedCount, weight]] of indents) {
    if (usedCount > maxUsed || (usedCount === maxUsed && weight > maxWeight)) {
      maxUsed = usedCount;
      maxWeight = weight;
      result = key;
    }
  }

  return result;
}

function makeIndentString(type: IndentType, amount: number) {
  return (type === 'space' ? ' ' : '\t').repeat(amount);
}

export function detectIndent(string: string): {
  amount: number;
  type?: IndentType;
  indent: string;
} {
  let indents = makeIndentsMap(string, true);
  if (indents.size === 0) {
    indents = makeIndentsMap(string, false);
  }

  const keyOfMostUsedIndent = getMostUsedKey(indents);

  let type: IndentType | undefined;
  let amount = 0;
  let indent = '';

  if (keyOfMostUsedIndent !== undefined) {
    ({type, amount} = decodeIndentsKey(keyOfMostUsedIndent));
    indent = makeIndentString(type, amount);
  }

  return {amount, type, indent};
}
