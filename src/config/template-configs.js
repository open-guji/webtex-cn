/**
 * System Template Configurations
 *
 * Static JS translation of luatex-cn .cfg files.
 * All parameter values are pre-converted to CSS-compatible format.
 *
 * Source: luatex-cn/tex/configs/
 *   - luatex-cn-guji-default.cfg → guji-default
 *   - luatex-cn-guji-SiKuQuanShu-colored.cfg → guji-colored
 *   - luatex-cn-guji-HongLouMengJiaXuBen.cfg → guji-honglou
 */

/**
 * Deep merge two objects (for template inheritance).
 * Later values override earlier values, arrays are replaced (not merged).
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

// ============================================================================
// guji-default (四库全书黑白)
// Source: luatex-cn-guji-default.cfg
// ============================================================================
const gujiDefault = {
  // === core/luatex-cn-core-page.sty ===
  page: {
    paperWidth: '1136pt',       // 40cm
    paperHeight: '894.6pt',     // 31.5cm
    marginTop: '190.5pt',       // 6.72cm
    marginBottom: '91.6pt',     // 3.23cm
    marginLeft: '133.2pt',      // 4.7cm
    marginRight: '133.2pt',     // 4.7cm
  },

  // === core/luatex-cn-core-content.sty ===
  content: {
    nColumn: 8,
    nCharPerCol: 21,
    fontSize: '28pt',
    lineSpacing: '28.5pt',
    verticalAlign: 'center',
    fontColor: 'rgb(0, 0, 0)',
    border: true,
    borderThickness: '0.4pt',
    borderColor: 'rgb(0, 0, 0)',
    borderPaddingTop: '5pt',
    borderPaddingBottom: '5pt',
    outerBorder: true,
    outerBorderThickness: '4pt',
    outerBorderSep: '3pt',
  },

  // === banxin/luatex-cn-banxin.sty ===
  banxin: {
    enabled: true,
    upperRatio: 0.282,      // 65.8 / 233.2
    middleRatio: 0.563,     // 131.2 / 233.2
    upperYuwei: true,
    lowerYuwei: false,
    divider: true,
    bookName: {
      fontSize: '28pt',
    },
    chapter: {
      fontSize: '15pt',
      gridHeight: '17pt',
      topMargin: '50pt',
    },
    pageNumber: {
      fontSize: '12pt',
      gridHeight: '15pt',
      bottomPadding: '5pt',
    },
    publisher: {
      fontSize: '15pt',
      gridHeight: '17pt',
    },
  },

  // === core/luatex-cn-core-sidenote.sty ===
  sidenote: {
    color: 'red',
    fontSize: '19pt',
    gridHeight: '20pt',
    yshift: '0em',
    borderPaddingTop: '0.5em',
    borderPaddingBottom: '0.5em',
  },

  // === guji/luatex-cn-guji-pizhu.sty ===
  pizhu: {
    color: 'rgb(255, 0, 0)',    // 1 0 0 → rgb(255, 0, 0)
    fontSize: '18pt',
    gridWidth: '20pt',
    gridHeight: '19pt',
  },

  // === guji/luatex-cn-guji-jiazhu.sty ===
  jiazhu: {
    align: 'outward',
    fontColor: 'rgb(0, 0, 0)',
  },

  // === guji/luatex-cn-guji-meipi.sty (同 pizhu 结构) ===
  meipi: {
    fontSize: '14pt',
    color: 'rgb(255, 0, 0)',
  },
};

// ============================================================================
// guji-colored (四库全书彩色)
// Source: luatex-cn-guji-SiKuQuanShu-colored.cfg
// Inherits from guji-default and overrides colors
// ============================================================================
const gujiColored = deepMerge(gujiDefault, {
  content: {
    fontColor: 'rgb(35, 25, 20)',
    borderColor: 'rgb(180, 95, 75)',
  },
  page: {
    backgroundColor: 'rgb(244, 241, 225)',
  },
  // Note: \definecolor{印章红}{RGB}{160, 65, 50} is handled separately
  // as a named color definition, not a template parameter
});

// ============================================================================
// guji-honglou (红楼梦甲戌本)
// Source: luatex-cn-guji-HongLouMengJiaXuBen.cfg
// Independent configuration (does not inherit from default)
// ============================================================================
const gujiHonglou = {
  // === Page geometry (spread: 38cm × 19cm × 2) ===
  page: {
    paperWidth: '1077.2pt',     // 38cm (19cm × 2)
    paperHeight: '1077.2pt',    // 38cm
    marginTop: '226.8pt',       // ~8cm
    marginBottom: '113.4pt',    // ~4cm
    marginLeft: '25.5pt',       // ~0.9cm
    marginRight: '25.5pt',      // ~0.9cm
  },

  // === Content (25 cols × 18 chars) ===
  content: {
    nColumn: 12,                // 12 columns per half page (→ 25 total with banxin)
    nCharPerCol: 18,
    fontSize: '30pt',
    lineSpacing: '45pt',
    verticalAlign: 'center',
    border: false,
    outerBorder: false,
    borderPaddingTop: '3pt',
    borderPaddingBottom: '3pt',
  },

  // === Banxin (narrower proportions) ===
  banxin: {
    enabled: true,
    upperRatio: 0.18,
    middleRatio: 0.38,
    upperYuwei: false,
    lowerYuwei: false,
    divider: false,
    bookName: {
      align: 'top',
      gridHeight: '38pt',
      topPadding: '0pt',
    },
    chapter: {
      fontSize: '24pt',
      gridHeight: '55pt',
      topMargin: '40pt',
      cols: 1,
    },
    pageNumber: {
      fontSize: '17pt',
    },
  },

  // === Sidenote ===
  sidenote: {
    color: 'red',
    fontSize: '19pt',
    gridHeight: '20pt',
    yshift: '0em',
    borderPaddingTop: '0.5em',
    borderPaddingBottom: '0.5em',
  },

  // === Pizhu ===
  pizhu: {
    color: 'rgb(255, 0, 0)',
    fontSize: '18pt',
    gridWidth: '20pt',
    gridHeight: '19pt',
  },

  // === Jiazhu ===
  jiazhu: {
    align: 'outward',
  },

  // === Meipi ===
  meipi: {
    fontSize: '14pt',
    color: 'rgb(255, 0, 0)',
  },
};

// ============================================================================
// Exports
// ============================================================================

/**
 * System templates registry.
 * All templates are pre-computed with inheritance resolved.
 */
export const systemTemplates = {
  'guji-default': gujiDefault,
  'guji-colored': gujiColored,
  'guji-honglou': gujiHonglou,
};

/**
 * Get system template configuration by ID.
 * Returns guji-default if template not found.
 *
 * @param {string} templateId
 * @returns {object} Template configuration object
 */
export function getSystemTemplate(templateId) {
  return systemTemplates[templateId] || gujiDefault;
}

/**
 * Convert template configuration to CSS variable mapping.
 *
 * Maps structured config to flat CSS custom properties:
 *   { page: { marginTop: '50px' } } → { '--wtc-margin-top': '50px' }
 *
 * @param {object} config - Template configuration object
 * @returns {Object<string, string>} CSS variable name → value mapping
 */
export function templateToCSS(config) {
  const cssVars = {};

  // === page ===
  if (config.page) {
    const p = config.page;
    if (p.paperWidth) cssVars['--wtc-paper-width'] = p.paperWidth;
    if (p.paperHeight) cssVars['--wtc-paper-height'] = p.paperHeight;
    if (p.marginTop) cssVars['--wtc-margin-top'] = p.marginTop;
    if (p.marginBottom) cssVars['--wtc-margin-bottom'] = p.marginBottom;
    if (p.marginLeft) cssVars['--wtc-margin-left'] = p.marginLeft;
    if (p.marginRight) cssVars['--wtc-margin-right'] = p.marginRight;
    if (p.backgroundColor) cssVars['--wtc-page-background'] = p.backgroundColor;
  }

  // === content ===
  if (config.content) {
    const c = config.content;
    if (c.nColumn !== undefined) cssVars['--wtc-n-cols'] = c.nColumn;
    if (c.nCharPerCol !== undefined) cssVars['--wtc-n-rows'] = c.nCharPerCol;
    if (c.fontSize) cssVars['--wtc-font-size'] = c.fontSize;
    if (c.lineSpacing) cssVars['--wtc-line-height'] = c.lineSpacing;
    if (c.verticalAlign) cssVars['--wtc-vertical-align'] = c.verticalAlign;
    if (c.fontColor) cssVars['--wtc-font-color'] = c.fontColor;
    if (c.border !== undefined) cssVars['--wtc-border-show'] = c.border ? 1 : 0;
    if (c.borderThickness) cssVars['--wtc-border-thickness'] = c.borderThickness;
    if (c.borderColor) cssVars['--wtc-border-color'] = c.borderColor;
    if (c.borderPaddingTop) cssVars['--wtc-border-padding-top'] = c.borderPaddingTop;
    if (c.borderPaddingBottom) cssVars['--wtc-border-padding-bottom'] = c.borderPaddingBottom;
    if (c.outerBorder !== undefined) cssVars['--wtc-outer-border-show'] = c.outerBorder ? 1 : 0;
    if (c.outerBorderThickness) cssVars['--wtc-outer-border-thickness'] = c.outerBorderThickness;
    if (c.outerBorderSep) cssVars['--wtc-outer-border-sep'] = c.outerBorderSep;
  }

  // === banxin ===
  if (config.banxin) {
    const b = config.banxin;
    if (b.enabled !== undefined) cssVars['--wtc-banxin-enabled'] = b.enabled ? 1 : 0;
    if (b.upperRatio !== undefined) cssVars['--wtc-banxin-upper-ratio'] = b.upperRatio;
    if (b.middleRatio !== undefined) cssVars['--wtc-banxin-middle-ratio'] = b.middleRatio;
    if (b.upperYuwei !== undefined) cssVars['--wtc-banxin-upper-yuwei'] = b.upperYuwei ? 1 : 0;
    if (b.lowerYuwei !== undefined) cssVars['--wtc-banxin-lower-yuwei'] = b.lowerYuwei ? 1 : 0;
    if (b.divider !== undefined) cssVars['--wtc-banxin-divider'] = b.divider ? 1 : 0;

    if (b.bookName?.fontSize) cssVars['--wtc-banxin-book-name-font-size'] = b.bookName.fontSize;
    if (b.chapter?.fontSize) cssVars['--wtc-banxin-chapter-font-size'] = b.chapter.fontSize;
    if (b.chapter?.gridHeight) cssVars['--wtc-banxin-chapter-grid-height'] = b.chapter.gridHeight;
    if (b.pageNumber?.fontSize) cssVars['--wtc-banxin-page-font-size'] = b.pageNumber.fontSize;
  }

  // === sidenote ===
  if (config.sidenote) {
    const s = config.sidenote;
    if (s.fontSize) cssVars['--wtc-sidenote-font-size'] = s.fontSize;
    if (s.color) cssVars['--wtc-sidenote-color'] = s.color;
    if (s.gridHeight) cssVars['--wtc-sidenote-grid-height'] = s.gridHeight;
  }

  // === jiazhu ===
  if (config.jiazhu) {
    const j = config.jiazhu;
    if (j.fontColor) cssVars['--wtc-jiazhu-color'] = j.fontColor;
    if (j.align) cssVars['--wtc-jiazhu-align'] = j.align;
  }

  // === pizhu ===
  if (config.pizhu) {
    const p = config.pizhu;
    if (p.fontSize) cssVars['--wtc-pizhu-font-size'] = p.fontSize;
    if (p.color) cssVars['--wtc-pizhu-color'] = p.color;
    if (p.gridWidth) cssVars['--wtc-pizhu-grid-width'] = p.gridWidth;
    if (p.gridHeight) cssVars['--wtc-pizhu-grid-height'] = p.gridHeight;
  }

  // === meipi ===
  if (config.meipi) {
    const m = config.meipi;
    if (m.fontSize) cssVars['--wtc-meipi-font-size'] = m.fontSize;
    if (m.color) cssVars['--wtc-meipi-color'] = m.color;
  }

  return cssVars;
}
