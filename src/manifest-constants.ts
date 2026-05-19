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

type ExtraJsonFile = {
  type: 'json';
  path: string;
  jsonpath: string;
  glob?: boolean;
};
type ExtraYamlFile = {
  type: 'yaml';
  path: string;
  jsonpath: string;
  glob?: boolean;
};
type ExtraXmlFile = {
  type: 'xml';
  path: string;
  xpath: string;
  glob?: boolean;
};
type ExtraPomFile = {
  type: 'pom';
  path: string;
  glob?: boolean;
};
type ExtraTomlFile = {
  type: 'toml';
  path: string;
  jsonpath: string;
  glob?: boolean;
};
type ExtraRubyReadMeFile = {
  type: 'ruby-readme';
  path: string;
  jsonpath: string;
  glob?: boolean;
};
export type ExtraFile =
  | string
  | ExtraJsonFile
  | ExtraYamlFile
  | ExtraXmlFile
  | ExtraPomFile
  | ExtraTomlFile
  | ExtraRubyReadMeFile;

export const DEFAULT_RELEASE_PLEASE_CONFIG = 'release-please-config.json';
export const DEFAULT_RELEASE_PLEASE_MANIFEST = '.release-please-manifest.json';
export const ROOT_PROJECT_PATH = '.';
export const DEFAULT_COMPONENT_NAME = '';
export const DEFAULT_LABELS = ['autorelease: pending'];
export const DEFAULT_RELEASE_LABELS = ['autorelease: tagged'];
export const DEFAULT_SNAPSHOT_LABELS = ['autorelease: snapshot'];
export const SNOOZE_LABEL = 'autorelease: snooze';
export const DEFAULT_PRERELEASE_LABELS = ['autorelease: pre-release'];
export const DEFAULT_CUSTOM_VERSION_LABEL = 'autorelease: custom version';

export const MANIFEST_PULL_REQUEST_TITLE_PATTERN = 'chore: release ${branch}';
