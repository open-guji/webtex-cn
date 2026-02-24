/**
 * User .cfg Configuration Loader
 *
 * Parses user-defined .cfg files (placed in same directory as .tex)
 * and extracts setup command parameters.
 *
 * Flow:
 * 1. parseCfg() separates preamble (setup commands) from macro definitions
 * 2. extractSetupConfigs() parses setup commands from preamble
 * 3. If template inheritance is found (\gujiSetup{template=X}), merge with system template
 * 4. Return merged config + macros
 */

import { parseCfg, readBalancedBraces } from '../parser/macros.js';
import { parseKeyValue } from '../model/nodes.js';
import { getSystemTemplate } from './template-configs.js';
import { convertParam } from './param-converter.js';

/**
 * Extract setup commands from .cfg preamble.
 *
 * Parses commands like:
 *   \contentSetup{font-size=28pt, border=true}
 *   \banxinSetup{banxin-upper-ratio=0.32, chapter={align=right}}
 *
 * @param {string} preamble - Preamble string from parseCfg()
 * @returns {object} Structured config object (partial)
 */
export function extractSetupConfigs(preamble) {
  const config = {
    page: {},
    content: {},
    banxin: {},
    jiazhu: {},
    sidenote: {},
    pizhu: {},
    meipi: {},
  };

  let inheritedTemplate = null;

  // Regex to match setup commands: \xxxSetup{...}
  const setupRegex = /\\(\w+)Setup\s*\{/g;
  let match;

  while ((match = setupRegex.exec(preamble)) !== null) {
    const setupName = match[1].toLowerCase(); // contentSetup → content
    const startPos = match.index + match[0].length - 1; // Position of opening '{'

    // Read balanced braces
    const braces = readBalancedBraces(preamble, startPos);
    if (!braces) continue;

    const params = parseKeyValue(braces.content);

    // Special case: \gujiSetup{template=X} → inheritance
    if (setupName === 'guji' && params.template) {
      inheritedTemplate = params.template;
      continue;
    }

    // Map setup type to config section
    const sectionMap = {
      content: 'content',
      page: 'page',
      banxin: 'banxin',
      jiazhu: 'jiazhu',
      sidenote: 'sidenote',
      pizhu: 'pizhu',
      meipi: 'meipi',
    };

    const section = sectionMap[setupName];
    if (!section) continue;

    // Parse and convert parameters
    for (const [key, value] of Object.entries(params)) {
      // Handle nested key-value (e.g., chapter = { font-size = 15pt })
      if (typeof value === 'object' && !Array.isArray(value)) {
        if (!config[section][key]) config[section][key] = {};
        for (const [subKey, subValue] of Object.entries(value)) {
          config[section][key][subKey] = convertParam(subKey, subValue);
        }
      } else {
        config[section][key] = convertParam(key, value);
      }
    }
  }

  return { config, inheritedTemplate };
}

/**
 * Load user .cfg file and resolve full configuration.
 *
 * @param {string} cfgSource - Raw .cfg file content
 * @returns {{ config: object, macros: Map, environments: Map, preamble: string }}
 */
export function loadUserCfg(cfgSource) {
  // 1. Parse .cfg file
  const { preamble, macros, environments } = parseCfg(cfgSource);

  // 2. Extract setup commands
  const { config: userConfig, inheritedTemplate } = extractSetupConfigs(preamble);

  // 3. Resolve inheritance (merge with system template if specified)
  let baseConfig = {};
  if (inheritedTemplate) {
    const templateId = resolveTemplateAlias(inheritedTemplate);
    baseConfig = getSystemTemplate(templateId);
  }

  // 4. Deep merge: base → user overrides
  const mergedConfig = deepMerge(baseConfig, userConfig);

  return {
    config: mergedConfig,
    macros,
    environments,
    preamble,
  };
}

/**
 * Resolve template alias (e.g., 'SiKuQuanShu-colored' → 'guji-colored')
 */
function resolveTemplateAlias(name) {
  const aliasMap = {
    'default': 'guji-default',
    'SiKuQuanShu': 'guji-default',
    'SiKuQuanShu-colored': 'guji-colored',
    'HongLouMengJiaXuBen': 'guji-honglou',
  };
  return aliasMap[name] || name;
}

/**
 * Deep merge two objects (for config inheritance).
 * Later values override earlier values.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}
