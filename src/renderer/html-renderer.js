/**
 * HTML Renderer: converts Document AST to HTML string.
 */

import { NodeType } from '../model/nodes.js';

// Template name → CSS file mapping
const templateCSSMap = {
  '四库全书': 'siku-quanshu',
  '四庫全書': 'siku-quanshu',
  '四库全书彩色': 'siku-quanshu-colored',
  '四庫全書彩色': 'siku-quanshu-colored',
  '红楼梦甲戌本': 'honglou',
  '紅樓夢甲戌本': 'honglou',
  '极简': 'minimal',
  '極簡': 'minimal',
  'default': 'siku-quanshu',
};

/**
 * Escape HTML special characters.
 */
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Split jiazhu text into two balanced columns.
 */
function splitJiazhu(text, align = 'outward') {
  const chars = [...text]; // Proper Unicode splitting
  if (chars.length === 0) return { col1: '', col2: '' };
  if (chars.length === 1) return { col1: chars[0], col2: '' };

  const mid = align === 'inward'
    ? Math.floor(chars.length / 2)   // inward: first column shorter
    : Math.ceil(chars.length / 2);   // outward: first column longer or equal

  return {
    col1: chars.slice(0, mid).join(''),
    col2: chars.slice(mid).join(''),
  };
}

/**
 * Split long jiazhu text into multiple dual-column segments.
 */
function splitJiazhuMulti(text, maxCharsPerCol = 20, align = 'outward') {
  const chars = [...text];
  const chunkSize = maxCharsPerCol * 2;
  if (chars.length <= chunkSize) {
    return [splitJiazhu(text, align)];
  }
  const segments = [];
  for (let i = 0; i < chars.length; i += chunkSize) {
    const chunk = chars.slice(i, i + chunkSize).join('');
    segments.push(splitJiazhu(chunk, align));
  }
  return segments;
}

/**
 * Get plain text content from a list of child nodes.
 */
function getPlainText(children) {
  let text = '';
  for (const child of children) {
    if (child.type === NodeType.TEXT) {
      text += child.value;
    } else if (child.children && child.children.length > 0) {
      text += getPlainText(child.children);
    }
  }
  return text;
}

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

export class HTMLRenderer {
  constructor(ast) {
    this.ast = ast;
    this.templateId = templateCSSMap[ast.template] || 'siku-quanshu';
    this.meipiCount = 0;

    // Process gujiSetup template override
    for (const cmd of (ast.setupCommands || [])) {
      if (cmd.setupType === 'guji' && cmd.params?.template) {
        const override = templateCSSMap[cmd.params.template];
        if (override) this.templateId = override;
      }
    }
  }

  /**
   * Collect CSS variable overrides from setup commands.
   */
  getSetupStyles() {
    const overrides = [];
    for (const cmd of (this.ast.setupCommands || [])) {
      const mapping = setupParamMap[cmd.setupType];
      if (!mapping || !cmd.params) continue;
      for (const [param, value] of Object.entries(cmd.params)) {
        const cssVar = mapping[param];
        if (cssVar) {
          overrides.push(`${cssVar}: ${value}`);
        }
      }
    }
    return overrides.length > 0 ? ` style="${overrides.join('; ')}"` : '';
  }

  render() {
    let html = '';

    for (const child of this.ast.children) {
      html += this.renderNode(child);
    }

    return html;
  }

  /**
   * Render full HTML page (standalone).
   */
  renderPage() {
    const content = this.render();

    return `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHTML(this.ast.title || 'WebTeX-CN')}</title>
<link rel="stylesheet" href="base.css">
</head>
<body>
<div class="wtc-page" data-template="${this.templateId}">
${content}
</div>
</body>
</html>`;
  }

  renderNode(node) {
    if (!node) return '';

    switch (node.type) {
      case 'body':
        return this.renderChildren(node.children);

      case NodeType.CONTENT_BLOCK:
        return this.renderContentBlock(node);

      case NodeType.PARAGRAPH:
        return this.renderParagraph(node);

      case NodeType.TEXT:
        return escapeHTML(node.value || '');

      case NodeType.NEWLINE:
        return '<br class="wtc-newline">';

      case NodeType.MATH:
        return `<span class="wtc-math">${escapeHTML(node.value || '')}</span>`;

      case NodeType.PARAGRAPH_BREAK:
        return '<br class="wtc-paragraph-break">';

      case NodeType.JIAZHU:
        return this.renderJiazhu(node);

      case NodeType.SIDENOTE:
        return this.renderSidenote(node);

      case NodeType.MEIPI:
        return this.renderMeipi(node);

      case NodeType.PIZHU:
        return this.renderPizhu(node);

      case NodeType.TEXTBOX:
        return this.renderTextbox(node);

      case NodeType.FILL_TEXTBOX:
        return this.renderFillTextbox(node);

      case NodeType.SPACE:
        return this.renderSpace(node);

      case NodeType.COLUMN_BREAK:
        return '<br class="wtc-column-break">';

      case NodeType.TAITOU:
        return this.renderTaitou(node);

      case NodeType.NUOTAI:
        return this.renderNuotai(node);

      case NodeType.SET_INDENT:
        // Emit inline style for indent change
        return `<span class="wtc-set-indent" data-indent="${node.value || 0}"></span>`;

      case NodeType.EMPHASIS:
        return `<span class="wtc-emphasis">${this.renderChildren(node.children)}</span>`;

      case NodeType.PROPER_NAME:
        return `<span class="wtc-proper-name">${this.renderChildren(node.children)}</span>`;

      case NodeType.BOOK_TITLE:
        return `<span class="wtc-book-title-mark">${this.renderChildren(node.children)}</span>`;

      case NodeType.INVERTED:
        return `<span class="wtc-inverted">${this.renderChildren(node.children)}</span>`;

      case NodeType.OCTAGON:
        return `<span class="wtc-octagon">${this.renderChildren(node.children)}</span>`;

      case NodeType.CIRCLED:
        return `<span class="wtc-circled">${this.renderChildren(node.children)}</span>`;

      case NodeType.INVERTED_OCTAGON:
        return `<span class="wtc-inverted wtc-octagon">${this.renderChildren(node.children)}</span>`;

      case NodeType.FIX:
        return `<span class="wtc-fix">${this.renderChildren(node.children)}</span>`;

      case NodeType.DECORATE:
        return `<span class="wtc-decorate">${this.renderChildren(node.children)}</span>`;

      case NodeType.LIST:
        return this.renderList(node);

      case NodeType.LIST_ITEM:
        return `<div class="wtc-list-item">${this.renderChildren(node.children)}</div>`;

      case NodeType.STAMP:
        return this.renderStamp(node);

      default:
        // Unknown node: render children if any
        if (node.children && node.children.length > 0) {
          return this.renderChildren(node.children);
        }
        return '';
    }
  }

  renderChildren(children) {
    return children.map(c => this.renderNode(c)).join('');
  }

  renderContentBlock(node) {
    // Separate floating elements (meipi, pizhu) from inline content
    const floatingHTML = [];
    const inlineChildren = [];

    for (const child of node.children) {
      if (child.type === NodeType.MEIPI || child.type === NodeType.PIZHU || child.type === NodeType.STAMP) {
        floatingHTML.push(this.renderNode(child));
      } else {
        inlineChildren.push(child);
      }
    }

    const inner = inlineChildren.map(c => this.renderNode(c)).join('');
    const floating = floatingHTML.join('\n');
    const banxin = this.renderBanxin();
    const setupStyles = this.getSetupStyles();

    return `<div class="wtc-spread"${setupStyles}>
${floating}<div class="wtc-half-page wtc-half-right"><div class="wtc-content-border"><div class="wtc-content">${inner}</div></div></div>${banxin}<div class="wtc-half-page wtc-half-left"><div class="wtc-content-border"><div class="wtc-content"></div></div></div>
</div>`;
  }

  renderBanxin() {
    if (!this.ast.title && !this.ast.chapter) return '';

    const title = escapeHTML(this.ast.title || '');
    const chapter = escapeHTML(this.ast.chapter || '').replace(/\n/g, '<br>');

    return `<div class="wtc-banxin">
  <div class="wtc-banxin-section wtc-banxin-upper"><div class="wtc-yuwei wtc-yuwei-upper"></div></div>
  <div class="wtc-banxin-section wtc-banxin-middle">
    <span class="wtc-banxin-book-name">${title}</span>
    <span class="wtc-banxin-chapter">${chapter}</span>
  </div>
  <div class="wtc-banxin-section wtc-banxin-lower"><div class="wtc-yuwei wtc-yuwei-lower"></div></div>
</div>`;
  }

  renderParagraph(node) {
    const indent = parseInt(node.options?.indent || '0', 10);
    const styleAttr = indent > 0 ? ` style="--wtc-indent: ${indent}"` : '';
    return `<span class="wtc-paragraph"${styleAttr}>${this.renderChildren(node.children)}</span>`;
  }

  renderJiazhu(node) {
    // If children contain only text nodes, use optimized split
    const hasComplexChildren = node.children.some(c => c.type !== NodeType.TEXT);

    if (hasComplexChildren) {
      // Complex children: split child nodes at midpoint by character count
      const text = getPlainText(node.children);
      const mid = Math.ceil([...text].length / 2);
      let charCount = 0;
      let splitIdx = node.children.length;
      for (let i = 0; i < node.children.length; i++) {
        const childText = getPlainText([node.children[i]]);
        charCount += [...childText].length;
        if (charCount >= mid) {
          splitIdx = i + 1;
          break;
        }
      }
      const col1HTML = node.children.slice(0, splitIdx).map(c => this.renderNode(c)).join('');
      const col2HTML = node.children.slice(splitIdx).map(c => this.renderNode(c)).join('');
      return `<span class="wtc-jiazhu"><span class="wtc-jiazhu-col">${col1HTML}</span><span class="wtc-jiazhu-col">${col2HTML}</span></span>`;
    }

    const text = getPlainText(node.children);
    const align = node.options?.align || 'outward';
    const segments = splitJiazhuMulti(text, 40, align);

    return segments.map(({ col1, col2 }) =>
      `<span class="wtc-jiazhu"><span class="wtc-jiazhu-col">${escapeHTML(col1)}</span><span class="wtc-jiazhu-col">${escapeHTML(col2)}</span></span>`
    ).join('');
  }

  renderSidenote(node) {
    const opts = node.options || {};
    let style = this.buildStyleFromOptions(opts, {
      color: '--wtc-sidenote-color',
      'font-size': '--wtc-sidenote-font-size',
    });
    if (opts.yoffset) {
      style += `margin-block-start: ${opts.yoffset};`;
    }
    return `<span class="wtc-sidenote"${style ? ` style="${style}"` : ''}>${this.renderChildren(node.children)}</span>`;
  }

  renderMeipi(node) {
    const opts = node.options || {};
    let style = '';
    if (opts.x) {
      style += `right: ${opts.x};`;
    } else {
      // Auto-position: offset each meipi to avoid overlap
      const autoX = this.meipiCount * 2;
      style += `right: ${autoX}em;`;
      this.meipiCount++;
    }
    if (opts.y) style += `top: ${opts.y};`;
    if (opts.height) style += `height: ${opts.height};`;
    if (opts.color) style += `color: ${this.parseColor(opts.color)};`;
    if (opts['font-size']) style += `font-size: ${opts['font-size']};`;
    return `<div class="wtc-meipi"${style ? ` style="${style}"` : ''}>${this.renderChildren(node.children)}</div>`;
  }

  renderPizhu(node) {
    const opts = node.options || {};
    let style = '';
    if (opts.x) style += `right: ${opts.x};`;
    if (opts.y) style += `top: ${opts.y};`;
    if (opts.color) style += `color: ${this.parseColor(opts.color)};`;
    if (opts['font-size']) style += `font-size: ${opts['font-size']};`;
    return `<div class="wtc-pizhu"${style ? ` style="${style}"` : ''}>${this.renderChildren(node.children)}</div>`;
  }

  renderTextbox(node) {
    const opts = node.options || {};
    let style = '';
    if (opts.height) {
      const h = opts.height;
      if (/^\d+$/.test(h)) {
        style += `--wtc-textbox-height: ${h};`;
      } else {
        style += `inline-size: ${h};`;
      }
    }
    if (opts.border === 'true') style += 'border: 1px solid var(--wtc-border-color);';
    if (opts['background-color']) style += `background-color: ${this.parseColor(opts['background-color'])};`;
    if (opts['font-color']) style += `color: ${this.parseColor(opts['font-color'])};`;
    if (opts['font-size']) style += `font-size: ${opts['font-size']};`;
    return `<span class="wtc-textbox"${style ? ` style="${style}"` : ''}>${this.renderChildren(node.children)}</span>`;
  }

  renderFillTextbox(node) {
    const opts = node.options || {};
    let style = '';
    if (opts.height) {
      style += `--wtc-textbox-height: ${opts.height};`;
    }
    // Old syntax: \填充文本框[12]{...} where 12 is just a number
    if (opts.value && /^\d+$/.test(opts.value)) {
      style += `--wtc-textbox-height: ${opts.value};`;
    }
    return `<span class="wtc-textbox wtc-textbox-fill"${style ? ` style="${style}"` : ''}>${this.renderChildren(node.children)}</span>`;
  }

  renderSpace(node) {
    const count = parseInt(node.value, 10) || 1;
    return '\u3000'.repeat(count);
  }

  renderTaitou(node) {
    const level = node.value || '0';
    return `<br class="wtc-newline"><span class="wtc-taitou" data-level="${level}"></span>`;
  }

  renderNuotai(node) {
    const count = parseInt(node.value, 10) || 1;
    return '\u3000'.repeat(count);
  }

  renderList(node) {
    return `<div class="wtc-list">${this.renderChildren(node.children)}</div>`;
  }

  renderStamp(node) {
    const opts = node.options || {};
    let style = 'position: absolute;';
    if (opts.xshift) style += `right: ${opts.xshift};`;
    if (opts.yshift) style += `top: ${opts.yshift};`;
    if (opts.width) style += `width: ${opts.width};`;
    if (opts.opacity) style += `opacity: ${opts.opacity};`;
    return `<img class="wtc-stamp" src="${escapeHTML(node.src || '')}" style="${style}" alt="stamp">`;
  }

  /**
   * Parse luatex-cn color format to CSS.
   * Formats: "red", "1 0 0" (RGB 0-1), "{180, 95, 75}" (RGB 0-255)
   */
  parseColor(colorStr) {
    if (!colorStr) return 'inherit';
    colorStr = colorStr.replace(/[{}]/g, '').trim();

    // Named color
    if (/^[a-zA-Z]+$/.test(colorStr)) return colorStr;

    // RGB 0-1 format: "1 0 0" or "0.5 0.3 0.2"
    const parts = colorStr.split(/[\s,]+/).map(Number);
    if (parts.length === 3) {
      if (parts.every(v => v >= 0 && v <= 1)) {
        return `rgb(${Math.round(parts[0] * 255)}, ${Math.round(parts[1] * 255)}, ${Math.round(parts[2] * 255)})`;
      }
      if (parts.every(v => v >= 0 && v <= 255)) {
        return `rgb(${parts[0]}, ${parts[1]}, ${parts[2]})`;
      }
    }

    return colorStr;
  }

  buildStyleFromOptions(opts, mapping) {
    if (!opts) return '';
    let style = '';
    for (const [key, cssVar] of Object.entries(mapping)) {
      if (opts[key] && cssVar) {
        style += `${cssVar}: ${opts[key]};`;
      }
    }
    return style;
  }
}
