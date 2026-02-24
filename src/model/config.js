/**
 * ConfigResolver: centralized configuration resolution.
 *
 * Runs after parsing to produce a single ResolvedConfig object
 * consumed by both layout and renderer. This eliminates scattered
 * config handling and duplicated template resolution.
 */

import { resolveTemplateId, getGridConfig } from '../config/templates.js';
import { getSystemTemplate, templateToCSS } from '../config/template-configs.js';
import { convertParam } from '../config/param-converter.js';

// Setup parameter → CSS variable mapping (expanded)
const setupParamMap = {
  content: {
    // Typography
    'font-size': '--wtc-font-size',
    'line-height': '--wtc-line-height',
    'line-spacing': '--wtc-line-height',  // alias
    'letter-spacing': '--wtc-letter-spacing',
    'font-color': '--wtc-font-color',
    'vertical-align': '--wtc-vertical-align',
    // Grid
    'n-column': '--wtc-n-cols',
    'n-char-per-col': '--wtc-n-rows',
    // Border
    'border': '--wtc-border-show',
    'border-thickness': '--wtc-border-thickness',
    'border-color': '--wtc-border-color',
    'border-padding-top': '--wtc-border-padding-top',
    'border-padding-bottom': '--wtc-border-padding-bottom',
    // Outer border
    'outer-border': '--wtc-outer-border-show',
    'outer-border-thickness': '--wtc-outer-border-thickness',
    'outer-border-sep': '--wtc-outer-border-sep',
  },
  page: {
    'page-width': '--wtc-page-width',
    'page-height': '--wtc-page-height',
    'paper-width': '--wtc-paper-width',
    'paper-height': '--wtc-paper-height',
    'margin-top': '--wtc-margin-top',
    'margin-bottom': '--wtc-margin-bottom',
    'margin-left': '--wtc-margin-left',
    'margin-right': '--wtc-margin-right',
    'background': '--wtc-page-background',
    'background-color': '--wtc-page-background',
  },
  banxin: {
    'width': '--wtc-banxin-width',
    'font-size': '--wtc-banxin-font-size',
    'banxin': '--wtc-banxin-enabled',
    'banxin-upper-ratio': '--wtc-banxin-upper-ratio',
    'banxin-middle-ratio': '--wtc-banxin-middle-ratio',
    'upper-yuwei': '--wtc-banxin-upper-yuwei',
    'lower-yuwei': '--wtc-banxin-lower-yuwei',
    'banxin-divider': '--wtc-banxin-divider',
  },
  jiazhu: {
    'font-size': '--wtc-jiazhu-font-size',
    'color': '--wtc-jiazhu-color',
    'font-color': '--wtc-jiazhu-color',
    'line-height': '--wtc-jiazhu-line-height',
    'gap': '--wtc-jiazhu-gap',
    'align': '--wtc-jiazhu-align',
  },
  sidenote: {
    'font-size': '--wtc-sidenote-font-size',
    'color': '--wtc-sidenote-color',
    'grid-height': '--wtc-sidenote-grid-height',
  },
  meipi: {
    'font-size': '--wtc-meipi-font-size',
    'color': '--wtc-meipi-color',
  },
  pizhu: {
    'font-size': '--wtc-pizhu-font-size',
    'color': '--wtc-pizhu-color',
    'grid-width': '--wtc-pizhu-grid-width',
    'grid-height': '--wtc-pizhu-grid-height',
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
  const setupCommands = ast.setupCommands || [];

  // Detect digital mode from documentclass (stored at AST root level)
  const documentClass = ast.documentClass || 'ltc-guji';
  const isDigitalMode = documentClass.includes('digital');

  // Determine punctuation mode from setup commands
  let punctMode = 'normal';
  for (const cmd of setupCommands) {
    if (cmd.setupType === 'judou-on') punctMode = 'judou';
    else if (cmd.setupType === 'judou-off') punctMode = 'normal';
    else if (cmd.setupType === 'judou-none') punctMode = 'none';
  }

  // 1. Start with system template CSS variables as base
  const systemTemplate = getSystemTemplate(templateId);
  const cssOverrides = templateToCSS(systemTemplate);

  // 2. Override with user setup commands from AST
  for (const cmd of setupCommands) {
    // Handle setmainfont (font setup)
    if (cmd.setupType === 'font' && cmd.params?.fontFamily) {
      cssOverrides['--wtc-font-family'] = cmd.params.fontFamily;
      continue;
    }

    const mapping = setupParamMap[cmd.setupType];
    if (!mapping || !cmd.params) continue;

    for (const [param, value] of Object.entries(cmd.params)) {
      // Handle nested parameters (e.g., chapter = { align = right })
      if (typeof value === 'object' && !Array.isArray(value)) {
        // For nested structures like banxin{chapter={align=right}},
        // we need to map each sub-parameter to its corresponding CSS variable
        for (const [subKey, subValue] of Object.entries(value)) {
          // Construct nested CSS variable name: --wtc-banxin-chapter-align
          const nestedCssVar = `--wtc-${cmd.setupType}-${param}-${subKey}`;
          const convertedValue = convertParam(subKey, subValue);
          cssOverrides[nestedCssVar] = convertedValue;
        }
      } else {
        const cssVar = mapping[param];
        if (cssVar) {
          // Convert parameter value to CSS-compatible format
          const convertedValue = convertParam(param, value);
          cssOverrides[cssVar] = convertedValue;
        }
      }
    }
  }

  // 3. Derive grid config (may be overridden by setup commands)
  const nRows = cssOverrides['--wtc-n-rows'] || systemTemplate.content?.nCharPerCol || 21;
  const nCols = cssOverrides['--wtc-n-cols'] || systemTemplate.content?.nColumn || 8;
  const grid = {
    nRows: typeof nRows === 'number' ? nRows : parseInt(nRows, 10),
    nCols: typeof nCols === 'number' ? nCols : parseInt(nCols, 10),
  };

  return {
    templateId,
    grid,
    punctMode,
    isDigitalMode,
    documentClass,
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
