/**
 * HTML Renderer: converts Document AST (or LayoutResult) to HTML string.
 */

import { NodeType } from '../model/nodes.js';
import { resolveTemplateId, getGridConfig } from '../config/templates.js';
import { getPlainText, splitJiazhuMulti, LayoutMarker } from '../layout/grid-layout.js';

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
 * Escape HTML special characters.
 */
function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export class HTMLRenderer {
  constructor(ast) {
    this.ast = ast;
    this.templateId = resolveTemplateId(ast);
    this.meipiCount = 0;

    const grid = getGridConfig(this.templateId);
    this.nRows = grid.nRows;
    this.nCols = grid.nCols;
    this.currentIndent = 0;
    this.colPos = 0;
  }

  /**
   * Collect CSS variable overrides from setup commands.
   */
  getSetupStylesFromCommands(setupCommands) {
    const overrides = [];
    for (const cmd of (setupCommands || [])) {
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

  getSetupStyles() {
    return this.getSetupStylesFromCommands(this.ast.setupCommands);
  }

  // =====================================================================
  // Legacy render() — walks AST directly (kept for backward compat)
  // =====================================================================

  render() {
    let html = '';
    for (const child of this.ast.children) {
      html += this.renderNode(child);
    }
    return html;
  }

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

  // =====================================================================
  // New layout-based render pipeline
  // =====================================================================

  /**
   * Render a LayoutResult into multi-page HTML.
   * Each page becomes one wtc-page div with a complete spread.
   *
   * @param {object} layoutResult  Output of layout()
   * @returns {string[]} Array of page HTML strings (one per page)
   */
  renderFromLayout(layoutResult) {
    const setupStyles = this.getSetupStylesFromCommands(layoutResult.meta.setupCommands);
    const banxin = this.renderBanxinFromMeta(layoutResult.meta);

    let carryStack = []; // marker stack carried across pages
    return layoutResult.pages.map(page => {
      const boundary = page.halfBoundary ?? page.items.length;
      const rightItems = page.items.slice(0, boundary);
      const leftItems = page.items.slice(boundary);

      const right = this.renderLayoutItems(rightItems, carryStack);
      const left = this.renderLayoutItems(leftItems, right.openStack);
      carryStack = left.openStack;

      const rightHTML = right.html;
      const leftHTML = left.html;
      const floatsHTML = page.floats.map(f => this.renderNode(f)).join('\n');

      return `<div class="wtc-spread"${setupStyles}>
${floatsHTML}<div class="wtc-half-page wtc-half-right"><div class="wtc-content-border"><div class="wtc-content">${rightHTML}</div></div></div>${banxin}<div class="wtc-half-page wtc-half-left"><div class="wtc-content-border"><div class="wtc-content">${leftHTML}</div></div></div>
</div>`;
    });
  }

  /**
   * Get the open tag HTML for a marker item.
   */
  markerOpenTag(item) {
    const type = item.node.type;
    if (type === LayoutMarker.PARAGRAPH_START) {
      const indent = parseInt(item.paragraphNode?.options?.indent || '0', 10);
      if (indent > 0) {
        return `<span class="wtc-paragraph wtc-paragraph-indent" style="--wtc-paragraph-indent: calc(${indent} * var(--wtc-grid-height)); --wtc-paragraph-indent-height: calc((var(--wtc-n-rows) - ${indent}) * var(--wtc-grid-height))">`;
      }
      return '<span class="wtc-paragraph">';
    }
    if (type === LayoutMarker.LIST_START) return '<span class="wtc-list">';
    if (type === LayoutMarker.LIST_ITEM_START) return '<span class="wtc-list-item">';
    return '';
  }

  /**
   * Get the close tag HTML for a marker type.
   */
  markerCloseTag(type) {
    if (type === LayoutMarker.PARAGRAPH_START) return '</span>';
    if (type === LayoutMarker.LIST_START) return '</span>';
    if (type === LayoutMarker.LIST_ITEM_START) return '</span>';
    return '';
  }

  /**
   * Check if a marker type is an "open" marker.
   */
  isOpenMarker(type) {
    return type === LayoutMarker.PARAGRAPH_START ||
           type === LayoutMarker.LIST_START ||
           type === LayoutMarker.LIST_ITEM_START;
  }

  /**
   * Check if a marker type is a "close" marker, and return its matching open type.
   */
  matchingOpenMarker(type) {
    if (type === LayoutMarker.PARAGRAPH_END) return LayoutMarker.PARAGRAPH_START;
    if (type === LayoutMarker.LIST_END) return LayoutMarker.LIST_START;
    if (type === LayoutMarker.LIST_ITEM_END) return LayoutMarker.LIST_ITEM_START;
    return null;
  }

  /**
   * Render an array of layout items into HTML.
   * Handles start/end markers for paragraphs, lists, and list items.
   * markerStack: open markers inherited from a previous slice (for tag balancing).
   * Returns { html, openStack } where openStack is the unclosed markers at the end.
   */
  renderLayoutItems(items, markerStack = []) {
    let html = '';

    // Re-open tags from inherited stack
    for (const entry of markerStack) {
      html += this.markerOpenTag(entry);
    }
    const stack = [...markerStack];

    for (const item of items) {
      const type = item.node.type;
      if (this.isOpenMarker(type)) {
        // Non-first list items need a column break to match layout engine's advanceColumn()
        if (type === LayoutMarker.LIST_ITEM_START && !item.isFirstListItem) {
          html += '<br class="wtc-newline">';
        }
        html += this.markerOpenTag(item);
        stack.push(item);
      } else if (this.matchingOpenMarker(type)) {
        html += this.markerCloseTag(this.matchingOpenMarker(type));
        // Pop matching open marker from stack
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].node.type === this.matchingOpenMarker(type)) {
            stack.splice(i, 1);
            break;
          }
        }
      } else {
        html += this.renderLayoutItem(item);
      }
    }

    // Close unclosed tags (in reverse order)
    const unclosed = [...stack];
    for (let i = stack.length - 1; i >= 0; i--) {
      html += this.markerCloseTag(stack[i].node.type);
    }

    return { html, openStack: unclosed };
  }

  /**
   * Render a single layout item.
   * If the item has pre-computed jiazhuSegments, use those directly.
   */
  renderLayoutItem(item) {
    if (item.jiazhuSegments && item.node.type === NodeType.JIAZHU) {
      return this.renderJiazhuFromSegments(item.node, item.jiazhuSegments);
    }
    return this.renderNode(item.node);
  }

  /**
   * Render jiazhu from pre-computed segments.
   */
  renderJiazhuFromSegments(node, segments) {
    // Check if children are complex (non-text)
    const hasComplexChildren = node.children.some(c => c.type !== NodeType.TEXT);
    if (hasComplexChildren) {
      // Fall back to node-based rendering
      return this.renderJiazhuComplex(node);
    }

    return segments.map(({ col1, col2 }) =>
      `<span class="wtc-jiazhu"><span class="wtc-jiazhu-col">${escapeHTML(col1)}</span><span class="wtc-jiazhu-col">${escapeHTML(col2)}</span></span>`
    ).join('');
  }

  /**
   * Render banxin from layout metadata.
   */
  renderBanxinFromMeta(meta) {
    if (!meta.title && !meta.chapter) return '';
    const title = escapeHTML(meta.title || '');
    // Chapter may contain \\ for line breaks → split into separate spans
    const chapterParts = (meta.chapter || '').split(/\\\\|\n/).map(s => s.trim()).filter(Boolean);
    const chapterHTML = chapterParts.map(p => `<span class="wtc-banxin-chapter-part">${escapeHTML(p)}</span>`).join('');

    return `<div class="wtc-banxin">
  <div class="wtc-banxin-section wtc-banxin-upper">
    <span class="wtc-banxin-book-name">${title}</span>
    <div class="wtc-yuwei wtc-yuwei-upper"></div>
  </div>
  <div class="wtc-banxin-section wtc-banxin-middle">
    <div class="wtc-banxin-chapter">${chapterHTML}</div>
  </div>
  <div class="wtc-banxin-section wtc-banxin-lower">
    <div class="wtc-yuwei wtc-yuwei-lower"></div>
  </div>
</div>`;
  }

  // =====================================================================
  // Node rendering (shared between legacy and layout pipelines)
  // =====================================================================

  renderNode(node) {
    if (!node) return '';

    switch (node.type) {
      case 'body':
        return this.renderChildren(node.children);

      case NodeType.CONTENT_BLOCK:
        return this.renderContentBlock(node);

      case NodeType.PARAGRAPH:
        return this.renderParagraph(node);

      case NodeType.TEXT: {
        const val = node.value || '';
        this.colPos += [...val].length;
        return escapeHTML(val);
      }

      case NodeType.NEWLINE:
        this.colPos = 0;
        return '<br class="wtc-newline">';

      case NodeType.MATH:
        return `<span class="wtc-math">${escapeHTML(node.value || '')}</span>`;

      case NodeType.PARAGRAPH_BREAK:
        this.colPos = 0;
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
        this.colPos = 0;
        return '<br class="wtc-column-break">';

      case NodeType.TAITOU:
        return this.renderTaitou(node);

      case NodeType.NUOTAI:
        return this.renderNuotai(node);

      case NodeType.SET_INDENT:
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
    const chapterParts = (this.ast.chapter || '').split(/\\\\|\n/).map(s => s.trim()).filter(Boolean);
    const chapterHTML = chapterParts.map(p => `<span class="wtc-banxin-chapter-part">${escapeHTML(p)}</span>`).join('');

    return `<div class="wtc-banxin">
  <div class="wtc-banxin-section wtc-banxin-upper">
    <span class="wtc-banxin-book-name">${title}</span>
    <div class="wtc-yuwei wtc-yuwei-upper"></div>
  </div>
  <div class="wtc-banxin-section wtc-banxin-middle">
    <div class="wtc-banxin-chapter">${chapterHTML}</div>
  </div>
  <div class="wtc-banxin-section wtc-banxin-lower">
    <div class="wtc-yuwei wtc-yuwei-lower"></div>
  </div>
</div>`;
  }

  renderParagraph(node) {
    const indent = parseInt(node.options?.indent || '0', 10);
    if (indent > 0) {
      const prevIndent = this.currentIndent;
      this.currentIndent = indent;
      const inner = this.renderChildren(node.children);
      this.currentIndent = prevIndent;
      return `<span class="wtc-paragraph wtc-paragraph-indent" style="--wtc-paragraph-indent: calc(${indent} * var(--wtc-grid-height)); --wtc-paragraph-indent-height: calc((var(--wtc-n-rows) - ${indent}) * var(--wtc-grid-height))">${inner}</span>`;
    }
    return `<span class="wtc-paragraph">${this.renderChildren(node.children)}</span>`;
  }

  renderJiazhu(node) {
    const hasComplexChildren = node.children.some(c => c.type !== NodeType.TEXT);

    if (hasComplexChildren) {
      return this.renderJiazhuComplex(node);
    }

    const text = getPlainText(node.children);
    const align = node.options?.align || 'outward';
    const maxPerCol = this.nRows - this.currentIndent;
    const remaining = maxPerCol - (this.colPos % maxPerCol);
    const firstMax = remaining > 0 && remaining < maxPerCol ? remaining : maxPerCol;
    const segments = splitJiazhuMulti(text, maxPerCol, align, firstMax);

    const totalChars = [...text].length;
    const firstSegChars = firstMax * 2;
    if (totalChars <= firstSegChars) {
      this.colPos += Math.ceil(totalChars / 2);
    } else {
      const lastSeg = segments[segments.length - 1];
      this.colPos = Math.max([...lastSeg.col1].length, [...lastSeg.col2].length);
    }

    return segments.map(({ col1, col2 }) =>
      `<span class="wtc-jiazhu"><span class="wtc-jiazhu-col">${escapeHTML(col1)}</span><span class="wtc-jiazhu-col">${escapeHTML(col2)}</span></span>`
    ).join('');
  }

  renderJiazhuComplex(node) {
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

  parseColor(colorStr) {
    if (!colorStr) return 'inherit';
    colorStr = colorStr.replace(/[{}]/g, '').trim();
    if (/^[a-zA-Z]+$/.test(colorStr)) return colorStr;
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
