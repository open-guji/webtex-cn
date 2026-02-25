/**
 * HTML Renderer: converts LayoutResult to HTML string.
 *
 * This module is purely visual — it does NOT compute positions or grid math.
 * All layout decisions come from the LayoutResult produced by the layout stage.
 */

import { NodeType } from '../model/nodes.js';
import { resolveTemplateId, getGridConfig } from '../config/templates.js';
import { getPlainText, escapeHTML, splitChildrenAtCharCount, convertToPt } from '../utils/text.js';
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
    const defaultBanxin = this.renderBanxinFromMeta(config.meta);
    const digitalModeAttr = layoutResult.isDigitalMode ? ' data-digital-mode="true"' : '';

    let carryStack = []; // marker stack carried across pages
    const pages = [];

    // Render front matter pages (cover, title page) before grid pages
    if (layoutResult.frontMatter) {
      for (const fm of layoutResult.frontMatter) {
        if (fm.type === 'cover') {
          pages.push(this.renderCover(fm.node));
        } else if (fm.type === 'titlePage') {
          pages.push(this.renderTitlePage(fm.node));
        } else if (fm.type === 'blankPage') {
          pages.push(this.renderBlankPage(fm.node));
        }
      }
    }

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

      const banxin = page.meta?.banxin ? this.renderBanxinFromMeta(page.meta) : defaultBanxin;

      // Right half-page: content on right, banxin on left
      pages.push(`<div class="wtc-spread wtc-spread-right"${digitalModeAttr}>
${floatsHTML}<div class="wtc-half-page wtc-half-right"><div class="wtc-content-border"><div class="wtc-content">${rightHTML}</div></div></div>${banxin}
</div>`);

      // Left half-page: content on left, banxin on right
      pages.push(`<div class="wtc-spread wtc-spread-left"${digitalModeAttr}>
<div class="wtc-half-page wtc-half-left"><div class="wtc-content-border"><div class="wtc-content">${leftHTML}</div></div></div>${banxin}
</div>`);
    }

    // Render back matter pages (cover, blank pages) after main content
    if (layoutResult.backMatter) {
      for (const bm of layoutResult.backMatter) {
        if (bm.type === 'cover') {
          pages.push(this.renderCover(bm.node));
        } else if (bm.type === 'titlePage') {
          pages.push(this.renderTitlePage(bm.node));
        } else if (bm.type === 'blankPage') {
          pages.push(this.renderBlankPage(bm.node));
        }
      }
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
    let lastCol = -1;
    for (const entry of markerStack) {
      html += this.markerOpenTag(entry);
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
        // Emit indent spacer at the start of each column based on item.row from layout
        if (item.col !== lastCol) {
          if (item.row > 0) {
            html += `<span class="wtc-indent-spacer" style="--wtc-indent-size: calc(${item.row} * var(--wtc-grid-height))"></span>`;
          }
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
    if (item.jiazhuComplexSegment && item.node.type === NodeType.JIAZHU) {
      const align = item.node.options?.align || 'outward';
      const options = item.node.options || {};
      return this.renderJiazhuComplexSegment(item.jiazhuComplexSegment, item.autoBalance, item.jiazhuComplexMaxPerCol, align, options);
    }
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

    // Add align class if specified
    const align = node.options?.align || 'outward';
    const alignClass = align === 'center' ? ' wtc-jiazhu-center' : align === 'inward' ? ' wtc-jiazhu-inward' : '';

    // Add inline styles for font-size and other options
    const opts = node.options || {};
    const styles = [];
    if (opts['font-size']) styles.push(`font-size: ${opts['font-size']}`);
    if (opts['color']) styles.push(`color: ${this.parseColor(opts['color'])}`);
    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

    return segments.map(({ col1, col2 }) =>
      `<span class="wtc-jiazhu${alignClass}"${styleAttr}><span class="wtc-jiazhu-col">${this.renderRichChars(col1)}</span><span class="wtc-jiazhu-col">${this.renderRichChars(col2)}</span></span>`
    ).join('');
  }

  /**
   * Render a cover page (full-page, no grid).
   */
  renderCover(node) {
    const opts = node.options || {};
    const styles = [];

    // Background color
    if (opts['底色']) {
      styles.push(`background-color: ${this.parseColor(opts['底色'])}`);
    }

    // Background image
    if (opts['背景图片']) {
      styles.push(`background-image: url('${opts['背景图片']}')`);
      styles.push(`background-size: ${opts['背景尺寸'] || 'cover'}`);
      styles.push(`background-position: ${opts['背景位置'] || 'center'}`);
      styles.push(`background-repeat: ${opts['背景重复'] || 'no-repeat'}`);
    }

    // Border decoration
    if (opts['边框']) {
      styles.push(`border: ${opts['边框']}`);
    }
    if (opts['边框颜色']) {
      styles.push(`border-color: ${this.parseColor(opts['边框颜色'])}`);
    }
    if (opts['边框宽度']) {
      styles.push(`border-width: ${opts['边框宽度']}`);
    }
    if (opts['边框样式']) {
      styles.push(`border-style: ${opts['边框样式']}`);
    }

    // Padding
    if (opts['内边距']) {
      styles.push(`padding: ${opts['内边距']}`);
    }

    const floatsHTML = [];
    const contentHTML = [];
    for (const child of node.children) {
      if (child.type === NodeType.TEXTBOX || child.type === NodeType.FILL_TEXTBOX ||
        child.type === NodeType.STAMP) {
        floatsHTML.push(this.renderNode(child));
      } else if (child.type !== NodeType.NEWLINE && child.type !== NodeType.PARAGRAPH_BREAK) {
        contentHTML.push(this.renderNode(child));
      }
    }

    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

    return `<div class="wtc-spread wtc-spread-cover"${styleAttr}>
${floatsHTML.join('\n')}${contentHTML.join('')}
</div>`;
  }

  /**
   * Render a title page (full-page with vertical text lines).
   */
  renderTitlePage(node) {
    const opts = node.options || {};
    let containerStyle = '';

    // Line gap (spacing between lines)
    if (opts['行间距'] || opts['gap']) {
      containerStyle += `gap: ${opts['行间距'] || opts['gap']};`;
    }

    // Background color
    if (opts['底色']) {
      containerStyle += `background-color: ${this.parseColor(opts['底色'])};`;
    }

    // Padding
    if (opts['内边距']) {
      containerStyle += `padding: ${opts['内边距']};`;
    }

    const linesHTML = [];
    for (const child of node.children) {
      if (child.type === NodeType.LINE) {
        linesHTML.push(this.renderLine(child));
      }
    }
    return `<div class="wtc-spread wtc-spread-title-page"${containerStyle ? ` style="${containerStyle}"` : ''}>
${linesHTML.join('\n')}
</div>`;
  }

  /**
   * Render a single vertical text line (used in title pages).
   */
  renderLine(node) {
    const opts = node.options || {};
    let style = '';
    let className = 'wtc-line';

    // Width
    if (opts.width) style += `width: ${opts.width};`;

    // Font settings
    if (opts['font-size']) style += `font-size: ${opts['font-size']};`;
    if (opts['grid-height']) style += `--wtc-grid-height: ${opts['grid-height']};`;
    if (opts['letter-spacing'] || opts['字间距']) {
      style += `letter-spacing: ${opts['letter-spacing'] || opts['字间距']};`;
    }
    if (opts['font-weight'] || opts['字重']) {
      style += `font-weight: ${opts['font-weight'] || opts['字重']};`;
    }
    if (opts['color'] || opts['颜色']) {
      style += `color: ${this.parseColor(opts['color'] || opts['颜色'])};`;
    }

    // Alignment
    if (opts.align === 'top') style += 'justify-content: flex-start;';
    else if (opts.align === 'bottom') style += 'justify-content: flex-end;';
    else if (opts.align === 'center') style += 'justify-content: center;';

    // Border/decoration
    if (opts['边框']) {
      style += `border: ${opts['边框']};`;
    }
    if (opts['装饰线']) {
      className += ' wtc-line-decorated';
      if (opts['装饰线'] === 'left' || opts['装饰线'] === '左') {
        style += 'border-left: 1px solid currentColor; padding-left: 0.5em;';
      } else if (opts['装饰线'] === 'right' || opts['装饰线'] === '右') {
        style += 'border-right: 1px solid currentColor; padding-right: 0.5em;';
      } else if (opts['装饰线'] === 'both' || opts['装饰线'] === '双边') {
        style += 'border-left: 1px solid currentColor; border-right: 1px solid currentColor; padding: 0 0.5em;';
      }
    }

    // Padding & margin
    if (opts['padding'] || opts['内边距']) {
      style += `padding: ${opts['padding'] || opts['内边距']};`;
    }
    if (opts['margin'] || opts['外边距']) {
      style += `margin: ${opts['margin'] || opts['外边距']};`;
    }

    const contentHTML = this.renderChildren(node.children);
    return `<div class="${className}"${style ? ` style="${style}"` : ''}>${contentHTML}</div>`;
  }

  /**
   * Render banxin from layout metadata.
   */
  renderBanxinFromMeta(meta) {
    if (meta.banxin) {
      const b = meta.banxin;
      const upperYuwei = b.upperYuwei ? '<div class="wtc-yuwei wtc-yuwei-upper"></div>' : '';
      const lowerYuwei = b.lowerYuwei ? '<div class="wtc-yuwei wtc-yuwei-lower"></div>' : '';
      const chapterHTML = (b.chapter || '').split(/\\\\|\n/).map(s => s.trim()).filter(Boolean)
        .map(p => `<span class="wtc-banxin-chapter-part">${escapeHTML(p)}</span>`).join('');
      const pageHTML = b.page ? `<span class="wtc-banxin-page-num">${escapeHTML(b.page)}</span>` : '';

      return `<div class="wtc-banxin">
  <div class="wtc-banxin-section wtc-banxin-upper">
    <span class="wtc-banxin-book-name">${escapeHTML(b.upper || '')}</span>
    ${upperYuwei}
  </div>
  <div class="wtc-banxin-section wtc-banxin-middle">
    <div class="wtc-banxin-chapter">${chapterHTML}</div>
  </div>
  <div class="wtc-banxin-section wtc-banxin-lower">
    ${pageHTML}
    ${lowerYuwei}
    ${b.lower ? `<span class="wtc-banxin-lower-text">${escapeHTML(b.lower)}</span>` : ''}
  </div>
</div>`;
    }

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

      case NodeType.STYLE:
        return this.renderStyle(node);

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
    // Check for explicit column layout: \双列{\右小列{...}\左小列{...}}
    const hasExplicitCols = node.children.some(c => c.type === NodeType.JIAZHU_COL);
    if (hasExplicitCols) {
      return this.renderJiazhuExplicitCols(node);
    }

    const hasComplexChildren = node.children.some(c => c.type !== NodeType.TEXT);

    if (hasComplexChildren) {
      return this.renderJiazhuComplex(node);
    }

    const text = getPlainText(node.children);
    const align = node.options?.align || 'outward';
    const autoBalance = (node.options?.['auto-balance'] ?? node.options?.['自动均衡']) !== 'false';
    const maxPerCol = this.nRows - this.currentIndent;
    const remaining = maxPerCol - (this.colPos % maxPerCol);
    const firstMax = remaining > 0 && remaining < maxPerCol ? remaining : maxPerCol;

    const richChars = getJudouRichText(text, this.punctMode);
    const segments = splitJiazhuMulti(richChars, maxPerCol, align, firstMax, autoBalance);

    if (richChars.length <= firstMax * 2) {
      this.colPos += Math.ceil(richChars.length / 2);
    } else {
      const lastSeg = segments[segments.length - 1];
      this.colPos = Math.max(lastSeg.col1.length, lastSeg.col2.length);
    }

    // Add align class if specified
    const alignClass = align === 'center' ? ' wtc-jiazhu-center' : align === 'inward' ? ' wtc-jiazhu-inward' : '';

    // Add inline styles for font-size and other options
    const opts = node.options || {};
    const styles = [];
    if (opts['font-size']) styles.push(`font-size: ${opts['font-size']}`);
    if (opts['color']) styles.push(`color: ${this.parseColor(opts['color'])}`);
    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

    return segments.map(({ col1, col2 }) =>
      `<span class="wtc-jiazhu${alignClass}"${styleAttr}><span class="wtc-jiazhu-col">${this.renderRichChars(col1)}</span><span class="wtc-jiazhu-col">${this.renderRichChars(col2)}</span></span>`
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
    const renderChild = (c) => {
      if (c.type === NodeType.TEXT && this.punctMode === 'judou') {
        const richChars = getJudouRichText(c.value || '', 'judou');
        return this.renderRichChars(richChars);
      }
      return this.renderNode(c);
    };
    const { before, after } = splitChildrenAtCharCount(node.children, mid);
    const col1HTML = before.map(renderChild).join('');
    const col2HTML = after.map(renderChild).join('');

    // Add align class if specified
    const align = node.options?.align || 'outward';
    const alignClass = align === 'center' ? ' wtc-jiazhu-center' : align === 'inward' ? ' wtc-jiazhu-inward' : '';

    // Add inline styles for font-size and other options
    const opts = node.options || {};
    const styles = [];
    if (opts['font-size']) styles.push(`font-size: ${opts['font-size']}`);
    if (opts['color']) styles.push(`color: ${this.parseColor(opts['color'])}`);
    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

    return `<span class="wtc-jiazhu${alignClass}"${styleAttr}><span class="wtc-jiazhu-col">${col1HTML}</span><span class="wtc-jiazhu-col">${col2HTML}</span></span>`;
  }

  /**
   * Render jiazhu with explicit \右小列 / \左小列 columns.
   * Content is placed exactly as specified without auto-splitting.
   */
  renderJiazhuExplicitCols(node) {
    let rightChildren = [];
    let leftChildren = [];
    for (const child of node.children) {
      if (child.type === NodeType.JIAZHU_COL) {
        if (child.value === 'right') rightChildren = child.children;
        else leftChildren = child.children;
      }
    }

    const renderColChildren = (children) => {
      return children.map(c => {
        if (c.type === NodeType.SET_INDENT) {
          const n = parseInt(c.value, 10) || 0;
          let spacer = '';
          if (n > 0) {
            spacer = `<span class="wtc-indent-spacer" style="--wtc-indent-size: calc(${n} * var(--wtc-grid-height))"></span>`;
          } else if (n < 0) {
            // Negative indent (taitou): use margin-inline-start to pull content up in vertical-rl
            spacer = `<span class="wtc-indent-spacer" style="margin-inline-start: calc(${n} * var(--wtc-grid-height))"></span>`;
          }
          return `${spacer}<span class="wtc-set-indent" data-indent="${n}"></span>`;
        }
        return this.renderNode(c);
      }).join('');
    };

    const col1HTML = renderColChildren(rightChildren);
    const col2HTML = renderColChildren(leftChildren);

    const colCharCount = (children) => {
      let count = 0;
      for (const c of children) {
        if (c.type === NodeType.SET_INDENT) {
          count += Math.max(0, parseInt(c.value, 10) || 0);
        } else if (c.type === NodeType.TEXT) {
          count += [...(c.value || '')].length;
        } else if (c.children) {
          count += [...getPlainText(c.children)].length;
        }
      }
      return count;
    };
    const rows = Math.max(colCharCount(rightChildren), colCharCount(leftChildren));
    this.colPos += rows;

    const align = node.options?.align || 'outward';
    const alignClass = align === 'center' ? ' wtc-jiazhu-center' : align === 'inward' ? ' wtc-jiazhu-inward' : '';

    const opts = node.options || {};
    const styles = [];
    if (opts['font-size']) styles.push(`font-size: ${opts['font-size']}`);
    if (opts['color']) styles.push(`color: ${this.parseColor(opts['color'])}`);
    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

    return `<span class="wtc-jiazhu${alignClass}"${styleAttr}><span class="wtc-jiazhu-col">${col1HTML}</span><span class="wtc-jiazhu-col">${col2HTML}</span></span>`;
  }

  /**
   * Render a complex jiazhu segment (from layout walkJiazhuComplex).
   * Each segment is a slice of children between taitou boundaries.
   */
  renderJiazhuComplexSegment(children, autoBalance = true, segMaxPerCol, align = 'outward', options = {}) {
    const renderChild = (c) => {
      if (c.type === NodeType.TEXT && this.punctMode === 'judou') {
        const richChars = getJudouRichText(c.value || '', 'judou');
        return this.renderRichChars(richChars);
      }
      return this.renderNode(c);
    };

    const text = getPlainText(children);
    const totalChars = [...text].length;
    const maxPerCol = segMaxPerCol || (this.nRows - this.currentIndent);

    // Determine split point
    let mid;
    if (!autoBalance) {
      // Unbalanced: col1 fills up to maxPerCol, remainder in col2
      mid = Math.min(totalChars, maxPerCol);
    } else {
      mid = Math.ceil(totalChars / 2);
    }

    const { before, after } = splitChildrenAtCharCount(children, mid);
    const col1HTML = before.map(renderChild).join('');
    const col2HTML = after.map(renderChild).join('');

    // Add align class if specified
    const alignClass = align === 'center' ? ' wtc-jiazhu-center' : align === 'inward' ? ' wtc-jiazhu-inward' : '';

    // Add inline styles for font-size and other options
    const styles = [];
    if (options['font-size']) styles.push(`font-size: ${options['font-size']}`);
    if (options['color']) styles.push(`color: ${this.parseColor(options['color'])}`);
    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';

    return `<span class="wtc-jiazhu${alignClass}"${styleAttr}><span class="wtc-jiazhu-col">${col1HTML}</span><span class="wtc-jiazhu-col">${col2HTML}</span></span>`;
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

  /**
   * Render a blank page (no grid, no banxin, floating textboxes only).
   */
  renderBlankPage(node) {
    const floatsHTML = [];
    const contentHTML = [];
    for (const child of node.children) {
      if (child.type === NodeType.TEXTBOX || child.type === NodeType.FILL_TEXTBOX ||
        child.type === NodeType.STAMP) {
        floatsHTML.push(this.renderNode(child));
      } else if (child.type !== NodeType.NEWLINE && child.type !== NodeType.PARAGRAPH_BREAK) {
        contentHTML.push(this.renderNode(child));
      }
    }
    return `<div class="wtc-spread wtc-spread-blank">
${floatsHTML.join('\n')}${contentHTML.join('')}
</div>`;
  }

  /**
   * Render inline style override: \样式[options]{content}
   */
  renderStyle(node) {
    const opts = node.options || {};
    let style = '';
    if (opts['grid-height']) style += `--wtc-grid-height: ${opts['grid-height']};`;
    if (opts['grid-width']) style += `--wtc-grid-width: ${opts['grid-width']};`;
    if (opts['font-size']) style += `font-size: ${opts['font-size']};`;
    if (opts.color) style += `color: ${this.parseColor(opts.color)};`;
    if (opts['line-height']) style += `line-height: ${opts['line-height']};`;
    return `<span class="wtc-style"${style ? ` style="${style}"` : ''}>${this.renderChildren(node.children)}</span>`;
  }

  renderTextbox(node) {
    const opts = node.options || {};
    const styles = [];
    const isFloating = opts.floating === 'true';

    // Position: LuaTeX-CN uses right-top origin (x=distance from right edge, y=distance from top)
    // Convert units to pt for consistency
    if (opts.x) {
      const xPt = convertToPt(opts.x);
      styles.push(`right: ${xPt}`);
    }
    if (opts.y) {
      const yPt = convertToPt(opts.y);
      styles.push(`top: ${yPt}`);
    }

    // Size
    if (opts.height) {
      const h = opts.height;
      if (/^\d+$/.test(h)) {
        // Pure number = character count
        styles.push(`--wtc-textbox-height: ${h}`);
      } else {
        // Length value, convert to pt
        styles.push(`inline-size: ${convertToPt(h)}`);
      }
    }

    // Font
    if (opts['font-size']) styles.push(`font-size: ${convertToPt(opts['font-size'])}`);
    if (opts['grid-height']) styles.push(`--wtc-grid-height: ${convertToPt(opts['grid-height'])}`);
    if (opts['grid-width']) styles.push(`--wtc-grid-width: ${convertToPt(opts['grid-width'])}`);

    // Border
    if (opts.border === 'true') styles.push('border: 1px solid var(--wtc-border-color)');
    if (opts['border-shape'] === 'rect') {
      const bw = convertToPt(opts['border-width'] || '1px');
      const bm = convertToPt(opts['border-margin'] || '0');
      styles.push(`border: ${bw} solid var(--wtc-border-color)`, `padding: ${bm}`);
    }
    if (opts['background-color']) styles.push(`background-color: ${this.parseColor(opts['background-color'])}`);
    if (opts['font-color']) styles.push(`color: ${this.parseColor(opts['font-color'])}`);

    // Outer border
    if (opts['outer-border'] === 'true') {
      const thickness = convertToPt(opts['outer-border-thickness'] || '2pt');
      const sep = convertToPt(opts['outer-border-sep'] || '4pt');
      styles.push(`--wtc-outer-border-thickness: ${thickness}`, `--wtc-outer-border-sep: ${sep}`);
    }

    const classes = ['wtc-textbox'];
    if (isFloating) classes.push('wtc-textbox-floating');
    if (opts['outer-border'] === 'true') classes.push('wtc-textbox-outer-border');

    const styleAttr = styles.length > 0 ? ` style="${styles.join('; ')}"` : '';
    return `<span class="${classes.join(' ')}"${styleAttr}>${this.renderChildren(node.children)}</span>`;
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
