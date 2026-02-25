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
import { parseToPtValue } from '../utils/text.js';

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
 * Auto-calculate grid-width and banxin-width from page dimensions.
 * Mirrors luatex-cn's guji_auto_layout() calculation.
 *
 * Formula: grid_width = available_width / (2 * n_column + banxin_ratio)
 * Where available_width = paper_width - margin_left - margin_right - border_overhead
 */
function gujiAutoLayout(cssOverrides, nCols, systemTemplate, userSetVars = new Set()) {
  const paperWidth = parseToPtValue(cssOverrides['--wtc-paper-width']);
  if (!paperWidth) return; // No paper dimensions → skip auto-calc

  const marginLeft = parseToPtValue(cssOverrides['--wtc-margin-left']);
  const marginRight = parseToPtValue(cssOverrides['--wtc-margin-right']);

  // Border overhead (width direction)
  const borderShow = cssOverrides['--wtc-border-show'];
  const outerBorderShow = cssOverrides['--wtc-outer-border-show'];
  const borderThickness = parseToPtValue(cssOverrides['--wtc-border-thickness']);
  const outerBorderThickness = parseToPtValue(cssOverrides['--wtc-outer-border-thickness']);
  const outerBorderSep = parseToPtValue(cssOverrides['--wtc-outer-border-sep']);

  let borderOverhead = 0;
  if (outerBorderShow) {
    borderOverhead += 2 * (outerBorderThickness + outerBorderSep);
  }
  if (borderShow) {
    borderOverhead += borderThickness;
  }

  const banxinRatio = systemTemplate.banxin?.banxinRatio ??
    (typeof cssOverrides['--wtc-banxin-ratio'] === 'number'
      ? cssOverrides['--wtc-banxin-ratio'] : 0.7);

  // available_width is for one spread (both half-pages + banxin)
  const availableWidth = paperWidth - marginLeft - marginRight - borderOverhead;
  if (availableWidth <= 0) return;

  // grid_width = available_width / (2 * n_column + banxin_ratio)
  const gridWidth = Math.floor(availableWidth / (2 * nCols + banxinRatio));
  const banxinWidth = Math.floor(gridWidth * banxinRatio);

  cssOverrides['--wtc-grid-width'] = `${gridWidth.toFixed(2)}pt`;
  cssOverrides['--wtc-banxin-width'] = `${banxinWidth.toFixed(2)}pt`;

  // In vertical-rl mode, line-height controls column width.
  // When we auto-calculate grid-width from paper dimensions, we must also
  // update line-height to match, otherwise CSS will use mismatched values.
  // BUT: only do this if user didn't explicitly set line-height via setup commands.
  if (!userSetVars.has('--wtc-line-height')) {
    cssOverrides['--wtc-line-height'] = `${gridWidth.toFixed(2)}pt`;
  }

  // Calculate grid-height from page height
  const paperHeight = parseToPtValue(cssOverrides['--wtc-paper-height']);
  const marginTop = parseToPtValue(cssOverrides['--wtc-margin-top']);
  const marginBottom = parseToPtValue(cssOverrides['--wtc-margin-bottom']);
  const borderPaddingTop = parseToPtValue(cssOverrides['--wtc-border-padding-top']);
  const borderPaddingBottom = parseToPtValue(cssOverrides['--wtc-border-padding-bottom']);

  let heightOverhead = 0;
  if (outerBorderShow) {
    heightOverhead += 2 * (outerBorderThickness + outerBorderSep);
  }
  if (borderShow) {
    heightOverhead += borderPaddingTop + borderPaddingBottom + borderThickness;
  }

  const nCharPerCol = cssOverrides['--wtc-n-rows'] || 21;
  const nRows = typeof nCharPerCol === 'number' ? nCharPerCol : parseInt(nCharPerCol, 10);

  if (paperHeight > 0 && nRows > 0) {
    const availableHeight = paperHeight - marginTop - marginBottom - heightOverhead;
    if (availableHeight > 0) {
      const gridHeight = Math.floor(availableHeight / nRows);
      cssOverrides['--wtc-grid-height'] = `${gridHeight.toFixed(2)}pt`;
    }
  }

  // Calculate .wtc-page width based on actual content + banxin + margin
  // Each .wtc-page contains: margin (one side) + content (n-cols) + banxin
  // Content width includes borders (each half-page has its own border in webtex-cn)
  const contentWidth = nCols * gridWidth;
  let contentBorderOverhead = 0;
  if (outerBorderShow) {
    contentBorderOverhead += 2 * (outerBorderThickness + outerBorderSep);
  }
  if (borderShow) {
    contentBorderOverhead += 2 * borderThickness; // Each half-page has full border
  }
  const halfContentWidth = contentWidth + contentBorderOverhead;

  // Page width = margin (one side) + half-content + banxin
  // Use the larger of margin-left and margin-right to ensure consistent page width
  const pageMargin = Math.max(marginLeft, marginRight);
  const pageWidth = pageMargin + halfContentWidth + banxinWidth;

  cssOverrides['--wtc-page-width'] = `${pageWidth.toFixed(2)}pt`;
  if (paperHeight > 0) {
    cssOverrides['--wtc-page-height'] = `${paperHeight.toFixed(2)}pt`;
  }
}

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

  // Track which CSS vars were explicitly set by user (to avoid overwriting them in gujiAutoLayout)
  const userSetVars = new Set();

  // 2. Override with user setup commands from AST
  for (const cmd of setupCommands) {
    // Handle setmainfont (font setup)
    if (cmd.setupType === 'font' && cmd.params?.fontFamily) {
      cssOverrides['--wtc-font-family'] = cmd.params.fontFamily;
      userSetVars.add('--wtc-font-family');
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
          userSetVars.add(nestedCssVar);
        }
      } else {
        const cssVar = mapping[param];
        if (cssVar) {
          // Convert parameter value to CSS-compatible format
          const convertedValue = convertParam(param, value);
          cssOverrides[cssVar] = convertedValue;
          userSetVars.add(cssVar);
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

  // 4. Auto-calculate grid-width and banxin-width from page dimensions
  //    Matches luatex-cn guji_auto_layout formula:
  //    grid_width = floor(available_width / (2 * n_column + banxin_ratio))
  gujiAutoLayout(cssOverrides, grid.nCols, systemTemplate, userSetVars);

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
