/**
 * Grid Layout Engine.
 *
 * Walks the AST and assigns every node to a page/column/row coordinate.
 * Produces a LayoutResult consumed by the renderer.
 *
 * Pipeline: Parser → AST → **layout()** → LayoutResult → HTMLRenderer
 */

import { NodeType } from '../model/nodes.js';
import { resolveTemplateId, getGridConfig } from '../config/templates.js';

// ---------------------------------------------------------------------------
// Helpers (shared with renderer)
// ---------------------------------------------------------------------------

/**
 * Get plain text content from a list of child nodes.
 */
export function getPlainText(children) {
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

/**
 * Split jiazhu text into two balanced columns.
 */
export function splitJiazhu(text, align = 'outward') {
  const chars = [...text];
  if (chars.length === 0) return { col1: '', col2: '' };
  if (chars.length === 1) return { col1: chars[0], col2: '' };

  const mid = align === 'inward'
    ? Math.floor(chars.length / 2)
    : Math.ceil(chars.length / 2);

  return {
    col1: chars.slice(0, mid).join(''),
    col2: chars.slice(mid).join(''),
  };
}

/**
 * Split long jiazhu text into multiple dual-column segments.
 * firstMaxPerCol allows the first segment to use remaining column space.
 */
export function splitJiazhuMulti(text, maxCharsPerCol = 20, align = 'outward', firstMaxPerCol = 0) {
  const first = firstMaxPerCol > 0 ? firstMaxPerCol : maxCharsPerCol;
  const chars = [...text];
  const firstChunkSize = first * 2;
  if (chars.length <= firstChunkSize) {
    return [splitJiazhu(text, align)];
  }
  const segments = [];
  const firstChunk = chars.slice(0, firstChunkSize).join('');
  segments.push(splitJiazhu(firstChunk, align));
  const fullChunkSize = maxCharsPerCol * 2;
  for (let i = firstChunkSize; i < chars.length; i += fullChunkSize) {
    const chunk = chars.slice(i, i + fullChunkSize).join('');
    segments.push(splitJiazhu(chunk, align));
  }
  return segments;
}

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

    // Pages
    this.pages = [newPage()];
  }

  get currentPage() {
    return this.pages[this.pages.length - 1];
  }

  get effectiveRows() {
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
    this.currentRow = 0;
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
    this.currentRow += count;
    while (this.currentRow >= this.effectiveRows) {
      this.currentRow -= this.effectiveRows;
      this.currentCol++;
      this.checkHalfBoundary();
      if (this.currentCol >= this.colsPerSpread) {
        const remainder = this.currentRow;
        this.newPageBreak();
        this.currentRow = remainder;
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
        this.placeItem(node);
        this.advanceColumn();
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
        this.placeItem(node);
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
      case NodeType.SET_INDENT:
        this.placeItem(node);
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
   */
  walkText(node) {
    const chars = [...(node.value || '')];
    this.placeItem(node);
    this.advanceRows(chars.length);
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
    const text = getPlainText(node.children);
    const align = node.options?.align || 'outward';
    const maxPerCol = this.effectiveRows;

    const remaining = maxPerCol - this.currentRow;
    const firstMax = remaining > 0 && remaining < maxPerCol ? remaining : maxPerCol;

    if (hasComplexChildren) {
      // Complex children: place as single item, advance by half chars
      this.placeItem(node, { jiazhuSegments: null });
      const totalChars = [...text].length;
      this.advanceRows(Math.ceil(totalChars / 2));
      return;
    }

    const jiazhuSegments = splitJiazhuMulti(text, maxPerCol, align, firstMax);

    if (jiazhuSegments.length <= 1) {
      // Single segment: place and advance
      this.placeItem(node, { jiazhuSegments });
      const totalChars = [...text].length;
      this.advanceRows(Math.ceil(totalChars / 2));
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
      const segRows = Math.max([...seg.col1].length, [...seg.col2].length);
      this.placeItem(node, {
        jiazhuSegments: [seg],
        jiazhuSegmentIndex: i,
        jiazhuTotalSegments: jiazhuSegments.length,
      });
      this.advanceRows(segRows);
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
  const templateId = resolveTemplateId(ast);
  const { nRows, nCols } = getGridConfig(templateId);
  const engine = new GridLayoutEngine(nRows, nCols);

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

  const meta = {
    title: ast.title || '',
    chapter: ast.chapter || '',
    setupCommands: ast.setupCommands || [],
  };

  return {
    pages: engine.pages,
    gridConfig: { nRows, nCols },
    templateId,
    meta,
  };
}
