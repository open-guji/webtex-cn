/**
 * AST node types for the document model.
 */

export const NodeType = {
  DOCUMENT: 'document',
  CONTENT_BLOCK: 'contentBlock',
  PARAGRAPH: 'paragraph',
  TEXT: 'text',
  NEWLINE: 'newline',
  JIAZHU: 'jiazhu',
  SIDENOTE: 'sidenote',
  MEIPI: 'meipi',
  PIZHU: 'pizhu',
  TEXTBOX: 'textbox',
  FILL_TEXTBOX: 'fillTextbox',
  SPACE: 'space',
  COLUMN_BREAK: 'columnBreak',
  TAITOU: 'taitou',
  NUOTAI: 'nuotai',
  SET_INDENT: 'setIndent',
  EMPHASIS: 'emphasis',
  PROPER_NAME: 'properName',
  BOOK_TITLE: 'bookTitle',
  INVERTED: 'inverted',
  OCTAGON: 'octagon',
  CIRCLED: 'circled',
  INVERTED_OCTAGON: 'invertedOctagon',
  FIX: 'fix',
  DECORATE: 'decorate',
  LIST: 'list',
  LIST_ITEM: 'listItem',
  SETUP: 'setup',
  STAMP: 'stamp',
  MATH: 'math',
  PARAGRAPH_BREAK: 'paragraphBreak',
  MULU_ITEM: 'muluItem',
  UNKNOWN: 'unknown',
};

/**
 * Create a node with the given type and properties.
 */
export function createNode(type, props = {}) {
  return { type, children: [], ...props };
}

/**
 * Parse a key=value string into an object.
 * Handles nested braces like color={180, 95, 75}.
 */
export function parseKeyValue(str) {
  if (!str || !str.trim()) return {};

  const result = {};
  let depth = 0;
  let currentKey = '';
  let currentValue = '';
  let inValue = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];

    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0 && ch === ',') {
      if (currentKey.trim()) {
        result[currentKey.trim()] = inValue ? currentValue.trim() : 'true';
      }
      currentKey = '';
      currentValue = '';
      inValue = false;
      continue;
    } else if (depth === 0 && ch === '=' && !inValue) {
      inValue = true;
    } else if (inValue) {
      currentValue += ch;
    } else {
      currentKey += ch;
    }
  }

  // Last pair
  if (currentKey.trim()) {
    const key = currentKey.trim();
    if (inValue) {
      result[key] = currentValue.trim();
    } else {
      // If it looks like a single number, treat it as 'value'
      if (/^\d+$/.test(key)) {
        result['value'] = key;
      } else {
        result[key] = 'true';
      }
    }
  }

  return result;
}
