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

// Minimal replacement for unist-util-visit/unist-util-visit-parents (both
// MIT, unifiedjs/unist-util-visit*), which as of unist-util-visit@3 /
// unist-util-visit-parents@4 are published as ESM-only and can no longer be
// `require()`d from this CommonJS codebase. We only ever call these with a
// node-type test (string or array of strings, or omitted to match every
// node) and a visitor that doesn't use the SKIP/EXIT control signals, so a
// full port of the upstream packages isn't needed.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type UnistNode = {type: string; children?: any[]};

function matchesTest(
  node: UnistNode,
  test: string | string[] | undefined
): boolean {
  if (test === undefined) {
    return true;
  }
  return Array.isArray(test) ? test.includes(node.type) : node.type === test;
}

// Loosely typed (like the `require()`-based code this replaces) since
// call sites annotate the visited node as whichever specific AST subtype
// they expect at that point in the tree, not the type of the tree root.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function visit(
  tree: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  testOrVisitor: string | string[] | ((node: any) => void), // eslint-disable-line @typescript-eslint/no-explicit-any
  maybeVisitor?: (node: any) => void // eslint-disable-line @typescript-eslint/no-explicit-any
): void {
  const test =
    typeof testOrVisitor === 'function' ? undefined : testOrVisitor;
  const visitor =
    typeof testOrVisitor === 'function' ? testOrVisitor : maybeVisitor;
  if (!tree || !visitor) {
    return;
  }

  const walk = (node: UnistNode) => {
    if (matchesTest(node, test)) {
      visitor(node);
    }
    for (const child of node.children ?? []) {
      walk(child);
    }
  };
  walk(tree);
}

export function visitWithAncestors(
  tree: any, // eslint-disable-line @typescript-eslint/no-explicit-any
  test: string | string[] | undefined,
  visitor: (node: any, ancestors: any[]) => void // eslint-disable-line @typescript-eslint/no-explicit-any
): void {
  if (!tree) {
    return;
  }

  const walk = (node: UnistNode, ancestors: UnistNode[]) => {
    if (matchesTest(node, test)) {
      visitor(node, ancestors);
    }
    for (const child of node.children ?? []) {
      walk(child, [...ancestors, node]);
    }
  };
  walk(tree, []);
}
