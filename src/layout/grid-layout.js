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
import { getPlainText } from '../utils/text.js';
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

    // Pages
    this.pages = [newPage()];
  }

  get currentPage() {
    return this.pages[this.pages.length - 1];
  }

  get effectiveRows() {
    return this.nRows - (this.ignoreIndent ? 0 : this.currentIndent);
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
    this.currentRow = 0;
    this.ignoreIndent = false; // Reset ignoreIndent when moving to a new column
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
    this.currentRow = 0;
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
      if (this.currentRow >= this.effectiveRows) {
        this.currentRow = 0;
        this.currentCol++;
        this.ignoreIndent = false;
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
      case NodeType.PARAGRAPH_BREAK:
      case NodeType.COLUMN_BREAK:
        // Only emit break if there's content in the current column.
        // When currentRow === 0 (e.g. after a block element like MULU_ITEM,
        // or after natural column wrap), the column is already fresh.
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
        if (this.currentCol > 0 || this.currentRow > 0) {
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
        this.placeItem(node);
        break;
      }

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
    const prevIndent = this.currentIndent;
    this.currentIndent = indent;

    this.placeMarker(LayoutMarker.PARAGRAPH_START, { paragraphNode: node });
    this.walkChildren(node.children);
    this.placeMarker(LayoutMarker.PARAGRAPH_END);

    this.currentIndent = prevIndent;
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
      this.placeItem(node);
      this.advanceRows(chars.length);
      return;
    }

    // Judou mode: split into segments of (text, punct)
    const chars = [...text];
    let buf = '';
    let i = 0;

    const flushBuf = () => {
      if (buf.length > 0) {
        this.placeItem({ type: NodeType.TEXT, value: buf });
        this.advanceRows([...buf].length);
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
    const hasComplexChildren = node.children.some(c => c.type !== NodeType.TEXT);
    const autoBalance = (node.options?.['auto-balance'] ?? node.options?.['自动均衡']) !== 'false';
    const align = node.options?.align || 'outward';
    const maxPerCol = this.effectiveRows;

    const remaining = maxPerCol - this.currentRow;
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
        // Text segment: place as jiazhu sub-segment
        const text = getPlainText(seg.children);
        const charLen = [...text].length;
        if (charLen === 0) continue;
        this.placeItem(node, { jiazhuComplexSegment: seg.children, autoBalance });
        const rows = Math.ceil(charLen / 2);
        this.advanceRows(rows);
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

  // Only layout 'body' nodes — skip preamble paragraphBreaks etc.
  for (const child of ast.children) {
    if (child.type === 'body') {
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
    gridConfig: config.grid,
    templateId: config.templateId,
    meta: config.meta,
    config,
  };
}
