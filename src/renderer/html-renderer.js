/**
 * HTML Renderer: converts LayoutResult to HTML string.
 *
 * This module is purely visual — it does NOT compute positions or grid math.
 * All layout decisions come from the LayoutResult produced by the layout stage.
 */

import { NodeType } from '../model/nodes.js';
import { resolveTemplateId, getGridConfig } from '../config/templates.js';
import { cssOverridesToStyleAttr } from '../model/config.js';
import { getPlainText, escapeHTML } from '../utils/text.js';
import { splitJiazhuMulti } from '../utils/jiazhu.js';
import { getJudouRichText } from '../utils/judou.js';
import { LayoutMarker } from '../layout/grid-layout.js';

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
    this.punctMode = (ast.setupCommands || []).some(cmd => cmd.setupType === 'judou-on') ? 'judou' : 'normal';
  }

  /**
 * Render a LayoutResult into multi-page HTML.
 * Each layout page is split into two visual half-pages, each with its own banxin.
 *
 * @param {object} layoutResult  Output of layout()
 * @returns {string[]} Array of page HTML strings (two per layout page)
 */
  renderFromLayout(layoutResult) {
    const config = layoutResult.config;
    this.punctMode = config.punctMode || this.punctMode;
    const setupStyles = cssOverridesToStyleAttr(config.cssOverrides);
    const banxin = this.renderBanxinFromMeta(config.meta);

    let carryStack = []; // marker stack carried across pages
    const pages = [];
    for (const page of layoutResult.pages) {
      const boundary = page.halfBoundary ?? page.items.length;
      const rightItems = page.items.slice(0, boundary);
      const leftItems = page.items.slice(boundary);

      const right = this.renderLayoutItems(rightItems, carryStack);
      const left = this.renderLayoutItems(leftItems, right.openStack);
      carryStack = left.openStack;

      const rightHTML = right.html;
      const leftHTML = left.html;
      const floatsHTML = page.floats.map(f => this.renderNode(f)).join('\n');

      // Right half-page: content on right, banxin on left
      pages.push(`<div class="wtc-spread wtc-spread-right"${setupStyles}>
${floatsHTML}<div class="wtc-half-page wtc-half-right"><div class="wtc-content-border"><div class="wtc-content">${rightHTML}</div></div></div>${banxin}
</div>`);

      // Left half-page: content on left, banxin on right
      pages.push(`<div class="wtc-spread wtc-spread-left"${setupStyles}>
<div class="wtc-half-page wtc-half-left"><div class="wtc-content-border"><div class="wtc-content">${leftHTML}</div></div></div>${banxin}
</div>`);
    }
    return pages;
  }

  /**
   * Get the open tag HTML for a marker item.
   */
  markerOpenTag(item) {
    const type = item.node.type;
    if (type === LayoutMarker.PARAGRAPH_START) {
      return '<span class="wtc-paragraph">';
    }
    if (type === LayoutMarker.LIST_START) return '<span class="wtc-list">';
    if (type === LayoutMarker.LIST_ITEM_START) return '<span class="wtc-list-item">';
    if (type === LayoutMarker.MULU_ITEM_START) {
      const level = item.level || 0;
      return `<span class="wtc-mulu-item" style="padding-inline-start: calc(${level} * var(--wtc-grid-height))">`;
    }
    return '';
  }

  /**
   * Get the close tag HTML for a marker type.
   */
  markerCloseTag(type) {
    if (type === LayoutMarker.PARAGRAPH_START) return '</span>';
    if (type === LayoutMarker.LIST_START) return '</span>';
    if (type === LayoutMarker.LIST_ITEM_START) return '</span>';
    if (type === LayoutMarker.MULU_ITEM_START) return '</span>';
    return '';
  }

  /**
   * Check if a marker type is an "open" marker.
   */
  isOpenMarker(type) {
    return type === LayoutMarker.PARAGRAPH_START ||
      type === LayoutMarker.LIST_START ||
      type === LayoutMarker.LIST_ITEM_START ||
      type === LayoutMarker.MULU_ITEM_START;
  }

  /**
   * Check if a marker type is a "close" marker, and return its matching open type.
   */
  matchingOpenMarker(type) {
    if (type === LayoutMarker.PARAGRAPH_END) return LayoutMarker.PARAGRAPH_START;
    if (type === LayoutMarker.LIST_END) return LayoutMarker.LIST_START;
    if (type === LayoutMarker.LIST_ITEM_END) return LayoutMarker.LIST_ITEM_START;
    if (type === LayoutMarker.MULU_ITEM_END) return LayoutMarker.MULU_ITEM_START;
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
    // Also recover paragraph indent state from inherited stack
    let paragraphIndent = 0;
    let lastCol = -1;
    for (const entry of markerStack) {
      html += this.markerOpenTag(entry);
      if (entry.node.type === LayoutMarker.PARAGRAPH_START) {
        paragraphIndent = parseInt(entry.paragraphNode?.options?.indent || '0', 10);
      }
    }
    const stack = [...markerStack];

    for (const item of items) {
      const type = item.node.type;

      // Emit column break for intentional breaks (\\, blank line, \换行)
      if (type === LayoutMarker.COLUMN_BREAK) {
        html += '<br class="wtc-newline">';
        continue;
      }

      if (this.isOpenMarker(type)) {
        html += this.markerOpenTag(item);
        stack.push(item);
        if (type === LayoutMarker.PARAGRAPH_START) {
          paragraphIndent = parseInt(item.paragraphNode?.options?.indent || '0', 10);
          lastCol = -1;
        }
      } else if (this.matchingOpenMarker(type)) {
        if (type === LayoutMarker.PARAGRAPH_END) {
          paragraphIndent = 0;
        }
        html += this.markerCloseTag(this.matchingOpenMarker(type));
        // Pop matching open marker from stack
        for (let i = stack.length - 1; i >= 0; i--) {
          if (stack[i].node.type === this.matchingOpenMarker(type)) {
            stack.splice(i, 1);
            break;
          }
        }
      } else {
        // Emit indent spacer at the start of each column within an indented paragraph
        if (paragraphIndent > 0 && item.col !== lastCol) {
          html += `<span class="wtc-indent-spacer" style="--wtc-indent-size: calc(${paragraphIndent} * var(--wtc-grid-height))"></span>`;
          lastCol = item.col;
        }
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
    // Judou marks: rendered as decorative zero-width spans
    if (item.node.type === 'judou') {
      const jType = item.node.judouType;
      if (jType === 'ju') {
        return '<span class="wtc-judou wtc-judou-ju"></span>';
      } else if (jType === 'dou') {
        return '<span class="wtc-judou wtc-judou-dou"></span>';
      } else if (jType === 'open' || jType === 'close') {
        // Paired punctuation: render as small inline mark
        return `<span class="wtc-judou wtc-judou-paired">${escapeHTML(item.node.value)}</span>`;
      }
      return '';
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
      `<span class="wtc-jiazhu"><span class="wtc-jiazhu-col">${this.renderRichChars(col1)}</span><span class="wtc-jiazhu-col">${this.renderRichChars(col2)}</span></span>`
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

      case NodeType.TEXT: {
        const val = node.value || '';
        this.colPos += [...val].length;
        return escapeHTML(val);
      }

      case NodeType.NEWLINE:
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
      case NodeType.RELATIVE_TAITOU:
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

    const richChars = getJudouRichText(text, this.punctMode);
    const segments = splitJiazhuMulti(richChars, maxPerCol, align, firstMax);

    if (richChars.length <= firstMax * 2) {
      this.colPos += Math.ceil(richChars.length / 2);
    } else {
      const lastSeg = segments[segments.length - 1];
      this.colPos = Math.max(lastSeg.col1.length, lastSeg.col2.length);
    }

    return segments.map(({ col1, col2 }) =>
      `<span class="wtc-jiazhu"><span class="wtc-jiazhu-col">${this.renderRichChars(col1)}</span><span class="wtc-jiazhu-col">${this.renderRichChars(col2)}</span></span>`
    ).join('');
  }

  renderRichChars(richChars) {
    let html = '';
    let currentInTitle = false;

    const toggleTitle = (isBookTitle) => {
      if (isBookTitle === currentInTitle) return;
      if (isBookTitle) html += '<span class="wtc-book-title-mark">';
      else html += '</span>';
      currentInTitle = isBookTitle;
    };

    for (const rc of richChars) {
      toggleTitle(rc.isBookTitle);
      html += escapeHTML(rc.char);
      if (rc.judouType === 'ju') {
        html += '<span class="wtc-judou wtc-judou-ju"></span>';
      } else if (rc.judouType === 'dou') {
        html += '<span class="wtc-judou wtc-judou-dou"></span>';
      }
    }
    toggleTitle(false);
    return html;
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
    const renderChild = (c) => {
      if (c.type === NodeType.TEXT && this.punctMode === 'judou') {
        const richChars = getJudouRichText(c.value || '', 'judou');
        return this.renderRichChars(richChars);
      }
      return this.renderNode(c);
    };
    const col1HTML = node.children.slice(0, splitIdx).map(renderChild).join('');
    const col2HTML = node.children.slice(splitIdx).map(renderChild).join('');
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
