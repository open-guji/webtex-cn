/**
 * Grid Layout Engine.
 *
 * Walks the AST and assigns every node to a page/column/row coordinate.
 * Produces a LayoutResult consumed by the renderer.
 *
 * Pipeline: Parser → AST → **layout()** → LayoutResult → HTMLRenderer
 */

import { NodeType } from '../model/nodes.js';
import { resolveConfig } from '../model/config.js';
import { getPlainText, splitChildrenAtCharCount } from '../utils/text.js';
import { splitJiazhuMulti } from '../utils/jiazhu.js';
import { getJudouType, getJudouRichText, isCJKPunctuation } from '../utils/judou.js';

// ---------------------------------------------------------------------------
// Layout markers — used to wrap compound nodes across page boundaries
// ---------------------------------------------------------------------------

export const LayoutMarker = {
  PARAGRAPH_START: '_paragraphStart',
  PARAGRAPH_END: '_paragraphEnd',
  LIST_START: '_listStart',
  LIST_END: '_listEnd',
  LIST_ITEM_START: '_listItemStart',
  LIST_ITEM_END: '_listItemEnd',
  MULU_ITEM_START: '_muluItemStart',
  MULU_ITEM_END: '_muluItemEnd',
  COLUMN_BREAK: '_columnBreak',
};

/**
 * Split AST children into multiple sub-segments, each fitting in one column pair.
 * @param {Array} children  AST child nodes
 * @param {number} fullMaxChars  Max chars per full column pair (maxPerCol * 2)
 * @param {number} firstMaxChars  Max chars for the first segment (remaining * 2)
 * @returns {Array<Array>} Array of child arrays
 */
function splitChildrenMulti(children, fullMaxChars, firstMaxChars) {
  const segments = [];
  let rest = children;
  let maxChars = firstMaxChars;

  while (rest.length > 0) {
    const totalChars = [...getPlainText(rest)].length;
    if (totalChars <= maxChars) {
      segments.push(rest);
      break;
    }
    const { before, after } = splitChildrenAtCharCount(rest, maxChars);
    if (before.length > 0) {
      segments.push(before);
    }
    rest = after;
    maxChars = fullMaxChars; // subsequent segments use full column capacity
  }

  return segments;
}

// ---------------------------------------------------------------------------
// GridLayoutEngine
// ---------------------------------------------------------------------------

function newPage() {
  return { items: [], floats: [], halfBoundary: null };
}

export class GridLayoutEngine {
  /**
   * @param {number} nRows  Chars per column
   * @param {number} nCols  Columns per half-page
   */
  constructor(nRows, nCols) {
    this.nRows = nRows;
    this.nCols = nCols;
    this.colsPerSpread = 2 * nCols;

    // Virtual cursor
    this.currentCol = 0;
    this.currentRow = 0;
    this.currentIndent = 0;

    // Punctuation mode: 'normal', 'judou', 'none'
    this.punctMode = 'normal';

    // Temporary flag to ignore paragraph indent for the current column (used by Taitou)
    this.ignoreIndent = false;

    // Track the last occupied grid cell for punctuation attachment
    this.lastCellPos = { col: 0, row: 0 };

    // Track the column where the current paragraph started (for first-col-only indent)
    this.paragraphStartCol = -1;
    // First-column indent (may differ from currentIndent via first-indent option)
    this.currentFirstIndent = 0;

    // Pages
    this.pages = [newPage()];
  }

  get currentPage() {
    return this.pages[this.pages.length - 1];
  }

  /**
   * The total number of rows in a column (upper bound for currentRow).
   * Inside a paragraph: currentRow starts at the indent value, so effectiveRows = nRows.
   * Outside a paragraph (e.g. after SET_INDENT): old behavior, effectiveRows = nRows - indent.
   */
  get effectiveRows() {
    if (this.ignoreIndent) return this.nRows;
    // Inside paragraph: currentRow already incorporates indent offset
    if (this.paragraphStartCol >= 0) return this.nRows;
    // Outside paragraph (SET_INDENT): currentRow starts at 0, reduce effective rows
    return this.nRows - this.currentIndent;
  }

  /**
   * Content rows available per full column (nRows minus indent).
   * Used by jiazhu to compute segment sizes.
   */
  get contentRows() {
    if (this.ignoreIndent) return this.nRows;
    return this.nRows - this.currentIndent;
  }

  /**
   * Check and mark the half-page boundary when crossing from right to left.
   */
  checkHalfBoundary() {
    if (this.currentPage.halfBoundary === null && this.currentCol >= this.nCols) {
      this.currentPage.halfBoundary = this.currentPage.items.length;
    }
  }

  /**
   * Advance to the next column. Triggers page break if needed.
   */
  advanceColumn() {
    this.currentCol++;
    this.ignoreIndent = false;
    // Inside a paragraph: start at the indent offset so currentRow reflects visual position
    this.currentRow = (this.paragraphStartCol >= 0) ? this.currentIndent : 0;
    this.checkHalfBoundary();
    if (this.currentCol >= this.colsPerSpread) {
      this.newPageBreak();
    }
  }

  /**
   * Create a new page and reset cursor.
   */
  newPageBreak() {
    if (this.currentPage.halfBoundary === null) {
      this.currentPage.halfBoundary = this.currentPage.items.length;
    }
    this.pages.push(newPage());
    this.currentCol = 0;
    // Inside a paragraph: start at the indent offset so currentRow reflects visual position
    this.currentRow = (this.paragraphStartCol >= 0) ? this.currentIndent : 0;
  }

  /**
   * Place a node at the current cursor position.
   */
  placeItem(node, extra = {}) {
    this.checkHalfBoundary();
    this.currentPage.items.push({
      node,
      col: this.currentCol,
      row: this.currentRow,
      indent: this.currentIndent,
      ...extra,
    });
  }

  /**
   * Place a layout marker (paragraph start/end, list start/end, etc.).
   */
  placeMarker(markerType, data = {}) {
    this.checkHalfBoundary();
    this.currentPage.items.push({
      node: { type: markerType },
      col: this.currentCol,
      row: this.currentRow,
      indent: this.currentIndent,
      ...data,
    });
  }

  /**
   * Walk a list of AST child nodes.
   */
  walkChildren(children) {
    for (const child of children) {
      this.walkNode(child);
    }
  }

  /**
   * Advance cursor by a given number of rows, wrapping columns as needed.
   * Preserves the remainder correctly across column and page breaks.
   */
  advanceRows(count) {
    for (let i = 0; i < count; i++) {
      // Record this cell as "occupied" before advancing
      this.lastCellPos = { col: this.currentCol, row: this.currentRow };

      this.currentRow++;
      // Digital mode: do NOT auto-advance column (only explicit \换行 or newline)
      if (!this.isDigitalMode && this.currentRow >= this.effectiveRows) {
        this.currentCol++;
        this.ignoreIndent = false;
        // Inside a paragraph: start at the indent offset so currentRow reflects visual position
        this.currentRow = (this.paragraphStartCol >= 0) ? this.currentIndent : 0;
        this.checkHalfBoundary();
        if (this.currentCol >= this.colsPerSpread) {
          this.newPageBreak();
        }
      }
    }
  }

  /**
   * Walk a single AST node and place it on the grid.
   */
  walkNode(node) {
    if (!node) return;

    // Clear afterParagraph flag for any node except PARAGRAPH_BREAK
    if (node.type !== NodeType.PARAGRAPH_BREAK) {
      this.afterParagraph = false;
    }

    switch (node.type) {
      case 'body':
        this.walkChildren(node.children);
        break;

      case NodeType.CONTENT_BLOCK:
        this.walkContentBlock(node);
        break;

      case NodeType.PARAGRAPH:
        this.walkParagraph(node);
        break;

      case NodeType.TEXT:
        this.walkText(node);
        break;

      case NodeType.NEWLINE:
      case NodeType.COLUMN_BREAK:
        // Only emit break if there's content in the current column.
        // When currentRow === 0 (e.g. after a block element like MULU_ITEM,
        // or after natural column wrap), the column is already fresh.
        if (this.currentRow > 0) {
          this.placeMarker(LayoutMarker.COLUMN_BREAK);
          this.advanceColumn();
        }
        break;

      case NodeType.PARAGRAPH_BREAK:
        // Skip if we just ended a paragraph — the paragraph boundary is
        // enough separation; an extra blank line between two paragraphs
        // should not produce an additional empty column.
        if (this.afterParagraph) break;
        if (this.currentRow > 0) {
          this.placeMarker(LayoutMarker.COLUMN_BREAK);
          this.advanceColumn();
        }
        break;

      case NodeType.JIAZHU:
        this.walkJiazhu(node);
        break;

      case NodeType.SPACE:
      case NodeType.NUOTAI: {
        const count = parseInt(node.value, 10) || 1;
        this.placeItem(node);
        this.advanceRows(count);
        break;
      }

      case NodeType.TAITOU: {
        this.advanceColumn();
        const level = parseInt(node.value, 10) || 0;
        this.currentRow = level;
        this.ignoreIndent = true; // Ignore indent for this specific column
        this.placeItem(node);
        break;
      }

      case NodeType.RELATIVE_TAITOU: {
        this.advanceColumn();
        const offset = parseInt(node.value, 10) || 0;
        // Relative: go up by offset from current indent level
        this.currentRow = Math.max(0, this.currentIndent - offset);
        this.ignoreIndent = true;
        this.placeItem(node);
        break;
      }

      case NodeType.NEW_PAGE: {
        // Force new page if we are not already at the very start of a page.
        // currentCol > 0 or currentRow > currentIndent (if in paragraph)
        const inParagraph = this.paragraphStartCol >= 0;
        const isFreshPage = this.currentCol === 0 && (inParagraph ? this.currentRow === this.currentIndent : this.currentRow === 0);

        if (!isFreshPage) {
          this.newPageBreak();
        }
        break;
      }

      case NodeType.MULU_ITEM: {
        if (this.currentRow > 0) {
          this.advanceColumn();
        }
        const level = parseInt(node.options?.value || '0', 10);
        this.currentRow = level;
        this.placeMarker(LayoutMarker.MULU_ITEM_START, { level });
        this.walkChildren(node.children);
        this.placeMarker(LayoutMarker.MULU_ITEM_END);
        // MULU_ITEM renders as display:block with full column height in CSS,
        // so advance cursor to match — next content starts in a new column.
        this.advanceColumn();
        break;
      }

      case NodeType.LIST:
        this.walkList(node);
        break;

      case NodeType.LIST_ITEM:
        this.walkListItem(node);
        break;

      // Floating elements — don't consume grid space
      case NodeType.MEIPI:
      case NodeType.PIZHU:
      case NodeType.STAMP:
        this.currentPage.floats.push(node);
        break;

      // Decorative wrappers — place as single item, count text for cursor
      case NodeType.EMPHASIS:
      case NodeType.PROPER_NAME:
      case NodeType.BOOK_TITLE:
      case NodeType.INVERTED:
      case NodeType.OCTAGON:
      case NodeType.CIRCLED:
      case NodeType.INVERTED_OCTAGON:
      case NodeType.FIX:
      case NodeType.DECORATE:
        this.placeItem(node);
        this.advanceRowsByNodeText(node);
        break;

      case NodeType.SIDENOTE:
        this.placeItem(node);
        break;

      case NodeType.TEXTBOX:
      case NodeType.FILL_TEXTBOX: {
        this.placeItem(node);
        const height = parseInt(node.options?.height || node.options?.value || '1', 10);
        this.advanceRows(height);
        break;
      }

      case NodeType.MATH:
        this.placeItem(node);
        break;

      case NodeType.SET_INDENT: {
        const indentVal = parseInt(node.value, 10) || 0;
        this.currentIndent = indentVal;
        // In digital mode, \缩进[N] sets currentRow to N (start from row N)
        if (this.isDigitalMode) {
          this.currentRow = indentVal;
        }
        this.placeItem(node);
        break;
      }

      case NodeType.BANXIN:
        this.walkBanxin(node);
        break;

      case NodeType.DIGITAL_CONTENT:
        this.walkDigitalContent(node);
        break;

      case NodeType.BANXIN_UPPER:
      case NodeType.BANXIN_CHAPTER:
      case NodeType.BANXIN_PAGE:
      case NodeType.BANXIN_LOWER:
      case NodeType.YUWEI:
      case NodeType.BLANK_PAGE:
        // These belong in walkBanxin or front matter; ignore if appearing naked
        break;

      case NodeType.STYLE:
        // Style wrapper: just walk children, layout doesn't change
        this.placeItem(node);
        this.advanceRowsByNodeText(node);
        break;

      default:
        if (node.children && node.children.length > 0) {
          this.walkChildren(node.children);
        }
        break;
    }
  }

  /**
   * Walk content block — separate floats from inline content.
   */
  walkContentBlock(node) {
    for (const child of node.children) {
      if (child.type === NodeType.MEIPI || child.type === NodeType.PIZHU || child.type === NodeType.STAMP) {
        this.currentPage.floats.push(child);
      } else {
        this.walkNode(child);
      }
    }
  }

  /**
   * Walk a paragraph node.
   * Emits start/end markers so the renderer can wrap the content with indent.
   * Walks children individually so they can span page boundaries.
   */
  walkParagraph(node) {
    const indent = parseInt(node.options?.indent || '0', 10);
    const firstIndentStr = node.options?.['first-indent'];
    const firstIndent = firstIndentStr !== undefined ? parseInt(firstIndentStr, 10) : indent;

    const prevIndent = this.currentIndent;
    const prevFirstIndent = this.currentFirstIndent;
    const prevParagraphStartCol = this.paragraphStartCol;
    this.currentIndent = indent;
    this.currentFirstIndent = firstIndent;

    // If current position is past the effective area for this indent,
    // advance to a fresh column before starting the paragraph.
    if (this.currentRow >= this.nRows - firstIndent && this.currentRow > 0) {
      this.advanceColumn();
    }

    // Record paragraph start column
    this.paragraphStartCol = this.currentCol;

    // Set currentRow to firstIndent if starting at the beginning of a column,
    // so currentRow reflects the visual position (indent offset).
    if (this.currentRow === 0 && firstIndent > 0) {
      this.currentRow = firstIndent;
    }

    this.placeMarker(LayoutMarker.PARAGRAPH_START, { paragraphNode: node, paragraphStartCol: this.currentCol });
    this.walkChildren(node.children);
    this.placeMarker(LayoutMarker.PARAGRAPH_END);

    // Force column break at paragraph end if column has content (matching luatex-cn behavior)
    const hasContentInCol = this.currentRow > this.currentIndent;

    this.currentIndent = prevIndent;
    this.currentFirstIndent = prevFirstIndent;
    this.paragraphStartCol = prevParagraphStartCol;
    this.afterParagraph = true;

    if (hasContentInCol) {
      this.advanceColumn();
    }
  }

  /**
   * Walk LIST node — emits start/end markers and walks children.
   * Tracks whether first item needs advanceColumn or not.
   */
  walkList(node) {
    this.placeMarker(LayoutMarker.LIST_START);
    let first = true;
    for (const child of node.children) {
      if (child.type === NodeType.LIST_ITEM) {
        this.walkListItem(child, first);
        first = false;
      } else {
        this.walkNode(child);
      }
    }
    this.placeMarker(LayoutMarker.LIST_END);
  }

  /**
   * Walk LIST_ITEM node — emits markers. Advances column for non-first items.
   */
  walkListItem(node, isFirst = false) {
    if (!isFirst) {
      this.advanceColumn();
    }
    this.placeMarker(LayoutMarker.LIST_ITEM_START, { isFirstListItem: isFirst });
    this.walkChildren(node.children);
    this.placeMarker(LayoutMarker.LIST_ITEM_END);
  }

  /**
   * Walk TEXT node — advance cursor row by character count.
   * In judou mode, punctuation is separated and emitted as zero-width items.
   * Paired punctuation like 《》 wraps text as book-title nodes.
   */
  walkText(node) {
    const text = node.value || '';

    // None mode: strip all punctuation before placing
    if (this.punctMode === 'none') {
      const filtered = [...text].filter(ch => !isCJKPunctuation(ch));
      if (filtered.length > 0) {
        this.placeItem({ type: NodeType.TEXT, value: filtered.join('') });
        this.advanceRows(filtered.length);
      }
      return;
    }

    if (this.punctMode !== 'judou') {
      const chars = [...text];

      // Digital mode: place text as-is without auto-splitting
      // (column breaks only happen via explicit \换行 or newlines)
      if (this.isDigitalMode) {
        this.placeItem({ type: NodeType.TEXT, value: text });
        this.advanceRows(chars.length);
        return;
      }

      // Semantic mode: split text into column-sized chunks so renderer gets one item per column
      let remaining = chars;
      while (remaining.length > 0) {
        const available = this.effectiveRows - this.currentRow;
        const chunk = remaining.slice(0, available);
        this.placeItem({ type: NodeType.TEXT, value: chunk.join('') });
        this.advanceRows(chunk.length);
        remaining = remaining.slice(chunk.length);
      }
      return;
    }

    // Judou mode: split into segments of (text, punct)
    const chars = [...text];
    let buf = '';
    let i = 0;

    const flushBuf = () => {
      if (buf.length > 0) {
        let remaining = [...buf];
        while (remaining.length > 0) {
          const available = this.effectiveRows - this.currentRow;
          const chunk = remaining.slice(0, available);
          this.placeItem({ type: NodeType.TEXT, value: chunk.join('') });
          this.advanceRows(chunk.length);
          remaining = remaining.slice(chunk.length);
        }
        buf = '';
      }
    };

    while (i < chars.length) {
      const ch = chars[i];

      // Book-title brackets: 《...》 or 〈...〉
      if (ch === '\u300A' || ch === '\u3008') {
        flushBuf();
        const closeChar = ch === '\u300A' ? '\u300B' : '\u3009';
        let inner = '';
        i++;
        while (i < chars.length && chars[i] !== closeChar) {
          inner += chars[i];
          i++;
        }
        if (i < chars.length) i++; // skip closing bracket
        // Emit as book-title decorated text
        if (inner.length > 0) {
          const bookNode = { type: NodeType.BOOK_TITLE, children: [{ type: NodeType.TEXT, value: inner }] };
          this.placeItem(bookNode);
          this.advanceRows([...inner].length);
        }
        continue;
      }

      const jType = getJudouType(ch);
      if (jType === 'ju' || jType === 'dou') {
        flushBuf();
        // Emit judou mark attached to the PREVIOUS cell's coordinates
        this.currentPage.items.push({
          node: { type: 'judou', value: ch, judouType: jType },
          col: this.lastCellPos.col,
          row: this.lastCellPos.row,
        });
      } else if (jType === 'open' || jType === 'close') {
        // Other paired punctuation: just skip in judou mode
        flushBuf();
      } else {
        buf += ch;
      }
      i++;
    }
    flushBuf();
  }

  /**
   * Advance cursor rows by counting text in a node (for compound nodes).
   */
  advanceRowsByNodeText(node) {
    const text = getPlainText(node.children || []);
    const len = [...text].length;
    this.advanceRows(len);
  }

  /**
   * Walk jiazhu node. Pre-compute segments based on remaining column space.
   * Each segment is placed as a separate item so page breaks work correctly.
   */
  walkJiazhu(node) {
    // Check for explicit column layout: \双列{\右小列{...}\左小列{...}}
    const hasExplicitCols = node.children.some(c => c.type === NodeType.JIAZHU_COL);
    if (hasExplicitCols) {
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
      let rightCount = 0;
      let leftCount = 0;
      for (const child of node.children) {
        if (child.type === NodeType.JIAZHU_COL) {
          if (child.value === 'right') rightCount = colCharCount(child.children);
          else leftCount = colCharCount(child.children);
        }
      }
      const rows = Math.max(rightCount, leftCount);
      this.placeItem(node);
      this.advanceRows(rows);
      return;
    }

    const hasComplexChildren = node.children.some(c => c.type !== NodeType.TEXT);
    const autoBalance = (node.options?.['auto-balance'] ?? node.options?.['自动均衡']) !== 'false';
    const align = node.options?.align || 'outward';
    const maxPerCol = this.contentRows;

    const remaining = this.nRows - this.currentRow;
    const firstMax = remaining > 0 && remaining < maxPerCol ? remaining : maxPerCol;

    if (hasComplexChildren) {
      this.walkJiazhuComplex(node, autoBalance);
      return;
    }

    const text = getPlainText(node.children);
    const richChars = getJudouRichText(text, this.punctMode);
    const jiazhuSegments = splitJiazhuMulti(richChars, maxPerCol, align, firstMax, autoBalance);

    if (jiazhuSegments.length <= 1) {
      // Single segment: place and advance
      this.placeItem(node, { jiazhuSegments });
      const rows = Math.ceil(richChars.length / 2);
      this.advanceRows(rows);
      return;
    }

    // Multi-segment: place each segment as a separate item so page breaks work.
    // First segment uses remaining space in current column.
    this.placeItem(node, {
      jiazhuSegments: [jiazhuSegments[0]],
      jiazhuSegmentIndex: 0,
      jiazhuTotalSegments: jiazhuSegments.length,
    });
    this.advanceRows(firstMax);

    // Middle and last segments each fill a full column (or partial for last)
    for (let i = 1; i < jiazhuSegments.length; i++) {
      const seg = jiazhuSegments[i];
      const segRows = Math.max(seg.col1.length, seg.col2.length);
      this.placeItem(node, {
        jiazhuSegments: [seg],
        jiazhuSegmentIndex: i,
        jiazhuTotalSegments: jiazhuSegments.length,
      });
      this.advanceRows(segRows);
    }
  }

  /**
   * Walk jiazhu with complex children (containing taitou/relative-taitou).
   * Splits children at taitou boundaries, placing each text segment as jiazhu
   * and executing taitou layout logic at split points.
   */
  walkJiazhuComplex(node, autoBalance) {
    // Split children into segments at TAITOU/RELATIVE_TAITOU boundaries
    const segments = [];
    let currentSegment = [];

    for (const child of node.children) {
      if (child.type === NodeType.TAITOU || child.type === NodeType.RELATIVE_TAITOU) {
        if (currentSegment.length > 0) {
          segments.push({ type: 'text', children: currentSegment });
          currentSegment = [];
        }
        segments.push({ type: 'taitou', node: child });
      } else {
        currentSegment.push(child);
      }
    }
    if (currentSegment.length > 0) {
      segments.push({ type: 'text', children: currentSegment });
    }

    for (const seg of segments) {
      if (seg.type === 'taitou') {
        const taitouNode = seg.node;
        if (taitouNode.type === NodeType.TAITOU) {
          this.advanceColumn();
          const level = parseInt(taitouNode.value, 10) || 0;
          this.currentRow = level;
          this.ignoreIndent = true;
        } else {
          // RELATIVE_TAITOU
          this.advanceColumn();
          const offset = parseInt(taitouNode.value, 10) || 0;
          this.currentRow = Math.max(0, this.currentIndent - offset);
          this.ignoreIndent = true;
        }
        // Place the taitou node so the renderer emits <br> + spacer
        this.placeItem(taitouNode);
      } else {
        // Text segment: split into column-sized sub-segments if needed
        const text = getPlainText(seg.children);
        const charLen = [...text].length;
        if (charLen === 0) continue;

        const maxPerCol = this.contentRows;
        const remaining = this.nRows - this.currentRow;
        const firstMax = remaining > 0 && remaining < maxPerCol ? remaining : maxPerCol;
        const firstMaxChars = firstMax * 2;
        const fullMaxChars = maxPerCol * 2;

        if (charLen <= firstMaxChars) {
          // Fits in remaining column space — single item
          this.placeItem(node, { jiazhuComplexSegment: seg.children, autoBalance });
          const rows = Math.ceil(charLen / 2);
          this.advanceRows(rows);
        } else {
          // Split into multiple sub-segments
          const subSegments = splitChildrenMulti(seg.children, fullMaxChars, firstMaxChars);

          // First sub-segment uses remaining column space
          this.placeItem(node, {
            jiazhuComplexSegment: subSegments[0],
            autoBalance,
            jiazhuComplexMaxPerCol: firstMax,
          });
          this.advanceRows(firstMax);

          // Subsequent sub-segments each get a full column
          for (let si = 1; si < subSegments.length; si++) {
            const subText = getPlainText(subSegments[si]);
            const subCharLen = [...subText].length;
            const segRows = Math.ceil(subCharLen / 2);
            this.placeItem(node, {
              jiazhuComplexSegment: subSegments[si],
              autoBalance,
              jiazhuComplexMaxPerCol: maxPerCol,
            });
            this.advanceRows(segRows);
          }
        }
      }
    }
  }

  walkBanxin(node) {
    // Banxin environment: collect its parts and update current page/global meta
    const parts = {
      upper: '',
      chapter: '',
      page: '',
      lower: '',
      upperYuwei: false,
      lowerYuwei: false,
    };

    for (const child of node.children) {
      const type = child.type;
      const text = getPlainText(child.children || []);
      if (type === NodeType.BANXIN_UPPER) parts.upper = text;
      else if (type === NodeType.BANXIN_CHAPTER) parts.chapter = text;
      else if (type === NodeType.BANXIN_PAGE) parts.page = text;
      else if (type === NodeType.BANXIN_LOWER) parts.lower = text;
      else if (type === NodeType.YUWEI) {
        const yuweiType = child.value || child.options?.value || 'lower';
        if (yuweiType === 'upper') parts.upperYuwei = true;
        else parts.lowerYuwei = true;
      }
    }

    // Attach to current page if possible, otherwise global meta
    if (this.currentPage) {
      this.currentPage.meta = { ...this.currentPage.meta, banxin: parts };
    }
  }

  walkDigitalContent(node) {
    // Obeylines: treat each NEWLINE / COLUMN_BREAK / PARAGRAPH_BREAK as a column advance
    for (const child of node.children) {
      if (child.type === NodeType.NEWLINE || child.type === NodeType.COLUMN_BREAK || child.type === NodeType.PARAGRAPH_BREAK) {
        this.advanceColumn();
      } else {
        this.walkNode(child);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run grid layout on an AST, returning a LayoutResult.
 *
 * @param {object} ast  Parsed document AST
 * @returns {LayoutResult}
 */
export function layout(ast) {
  const config = resolveConfig(ast);
  const { nRows, nCols } = config.grid;
  const engine = new GridLayoutEngine(nRows, nCols);
  engine.punctMode = config.punctMode;
  // Digital mode: disable auto column break (only explicit \换行 or newline in source)
  engine.isDigitalMode = ast.documentClass?.includes('digital') || false;

  // Collect front matter and back matter (cover, title page, blank pages) separately
  const frontMatter = [];
  const backMatter = [];
  let hasSeenContent = false; // Track if we've encountered main content

  // Determine content to layout: if there's a 'body' node, use its children; otherwise use top-level children.
  const bodyNode = ast.children.find(c => c.type === 'body');
  const itemsToWalk = bodyNode ? bodyNode.children : ast.children;

  for (const child of itemsToWalk) {
    if (child.type === NodeType.COVER) {
      const item = { type: 'cover', node: child };
      if (hasSeenContent) {
        backMatter.push(item);
      } else {
        frontMatter.push(item);
      }
    } else if (child.type === NodeType.TITLE_PAGE) {
      const item = { type: 'titlePage', node: child };
      if (hasSeenContent) {
        backMatter.push(item);
      } else {
        frontMatter.push(item);
      }
    } else if (child.type === NodeType.BLANK_PAGE) {
      const item = { type: 'blankPage', node: child };
      if (hasSeenContent) {
        backMatter.push(item);
      } else {
        frontMatter.push(item);
      }
    } else {
      // Mark that we've seen main content (contentBlock = \begin{正文})
      if (child.type === NodeType.CONTENT_BLOCK || child.type === 'chapter') {
        hasSeenContent = true;
      }
      engine.walkNode(child);
    }
  }

  // Finalize: ensure last page has halfBoundary
  const lastPage = engine.currentPage;
  if (lastPage.halfBoundary === null) {
    lastPage.halfBoundary = lastPage.items.length;
  }

  return {
    pages: engine.pages,
    frontMatter,
    backMatter,
    gridConfig: config.grid,
    templateId: config.templateId,
    meta: config.meta,
    config,
    isDigitalMode: engine.isDigitalMode,
  };
}
