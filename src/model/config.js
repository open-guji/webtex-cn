/**
 * ConfigResolver: centralized configuration resolution.
 *
 * Runs after parsing to produce a single ResolvedConfig object
 * consumed by both layout and renderer. This eliminates scattered
 * config handling and duplicated template resolution.
 */

import { resolveTemplateId, getGridConfig } from '../config/templates.js';

// Setup parameter → CSS variable mapping
const setupParamMap = {
  content: {
    'font-size': '--wtc-font-size',
    'line-height': '--wtc-line-height',
    'letter-spacing': '--wtc-letter-spacing',
    'font-color': '--wtc-font-color',
    'border-color': '--wtc-border-color',
    'border-thickness': '--wtc-border-thickness',
  },
  page: {
    'page-width': '--wtc-page-width',
    'page-height': '--wtc-page-height',
    'margin-top': '--wtc-margin-top',
    'margin-bottom': '--wtc-margin-bottom',
    'margin-left': '--wtc-margin-left',
    'margin-right': '--wtc-margin-right',
    'background': '--wtc-page-background',
  },
  banxin: {
    'width': '--wtc-banxin-width',
    'font-size': '--wtc-banxin-font-size',
  },
  jiazhu: {
    'font-size': '--wtc-jiazhu-font-size',
    'color': '--wtc-jiazhu-color',
    'line-height': '--wtc-jiazhu-line-height',
    'gap': '--wtc-jiazhu-gap',
  },
  sidenode: {
    'font-size': '--wtc-sidenote-font-size',
    'color': '--wtc-sidenote-color',
  },
  meipi: {
    'font-size': '--wtc-meipi-font-size',
    'color': '--wtc-meipi-color',
  },
  pizhu: {
    'font-size': '--wtc-pizhu-font-size',
    'color': '--wtc-pizhu-color',
  },
};

/**
 * Resolve all configuration from an AST into a single config object.
 *
 * @param {object} ast - Parsed document AST
 * @returns {ResolvedConfig}
 */
export function resolveConfig(ast) {
  const templateId = resolveTemplateId(ast);
  const grid = getGridConfig(templateId);
  const setupCommands = ast.setupCommands || [];

  // Determine punctuation mode from setup commands
  let punctMode = 'normal';
  for (const cmd of setupCommands) {
    if (cmd.setupType === 'judou-on') punctMode = 'judou';
    else if (cmd.setupType === 'judou-off') punctMode = 'normal';
    else if (cmd.setupType === 'judou-none') punctMode = 'none';
  }

  // Collect CSS variable overrides
  const cssOverrides = {};
  for (const cmd of setupCommands) {
    const mapping = setupParamMap[cmd.setupType];
    if (!mapping || !cmd.params) continue;
    for (const [param, value] of Object.entries(cmd.params)) {
      const cssVar = mapping[param];
      if (cssVar) {
        cssOverrides[cssVar] = value;
      }
    }
  }

  return {
    templateId,
    grid,
    punctMode,
    meta: {
      title: ast.title || '',
      chapter: ast.chapter || '',
    },
    cssOverrides,
    setupCommands,
  };
}

/**
 * Convert CSS overrides to an inline style attribute string.
 *
 * @param {object} cssOverrides - Map of CSS variable → value
 * @returns {string} e.g. ' style="--wtc-font-size: 22px"' or ''
 */
export function cssOverridesToStyleAttr(cssOverrides) {
  const entries = Object.entries(cssOverrides || {});
  if (entries.length === 0) return '';
  const style = entries.map(([k, v]) => `${k}: ${v}`).join('; ');
  return ` style="${style}"`;
}
