/**
 * Shared text utilities used by both layout and renderer.
 */

import { NodeType } from '../model/nodes.js';

/**
 * Get plain text content from a list of child nodes (recursive).
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
 * Escape HTML special characters.
 */
export function escapeHTML(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Count characters in AST children (same as getPlainText but only counts).
 */
function countChars(children) {
  let count = 0;
  for (const child of children) {
    if (child.type === NodeType.TEXT) {
      count += [...(child.value || '')].length;
    } else if (child.children && child.children.length > 0) {
      count += countChars(child.children);
    }
  }
  return count;
}

/**
 * Split AST children at a character boundary.
 * Returns { before, after } where 'before' contains exactly charCount characters.
 * TEXT nodes may be split mid-node. Wrapper nodes are duplicated if split mid-way.
 */
export function splitChildrenAtCharCount(children, charCount) {
  const before = [];
  const after = [];
  let remaining = charCount;

  for (let i = 0; i < children.length; i++) {
    if (remaining <= 0) {
      after.push(...children.slice(i));
      break;
    }

    const child = children[i];

    if (child.type === NodeType.TEXT) {
      const chars = [...(child.value || '')];
      if (chars.length <= remaining) {
        before.push(child);
        remaining -= chars.length;
      } else {
        // Split mid-text
        before.push({ type: NodeType.TEXT, value: chars.slice(0, remaining).join('') });
        after.push({ type: NodeType.TEXT, value: chars.slice(remaining).join('') });
        remaining = 0;
        after.push(...children.slice(i + 1));
        break;
      }
    } else if (child.children && child.children.length > 0) {
      const childCharCount = countChars(child.children);
      if (childCharCount <= remaining) {
        before.push(child);
        remaining -= childCharCount;
      } else {
        // Split inside wrapper node
        const inner = splitChildrenAtCharCount(child.children, remaining);
        if (inner.before.length > 0) {
          before.push({ ...child, children: inner.before });
        }
        if (inner.after.length > 0) {
          after.push({ ...child, children: inner.after });
        }
        remaining = 0;
        after.push(...children.slice(i + 1));
        break;
      }
    } else {
      // Non-text leaf with no children (e.g., space, newline) — treat as 0 chars
      before.push(child);
    }
  }

  return { before, after };
}

/**
 * Parse a color string (CSS name, RGB tuple, or 0-1 float triple) to CSS color.
 */
export function parseColor(colorStr) {
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

/**
 * Convert length unit to pt.
 * LuaTeX-CN uses pt as the base unit (1pt ≈ 0.3528mm).
 * Common conversions:
 * - 1cm = 28.3465pt
 * - 1mm = 2.83465pt
 * - 1in = 72pt
 */
// Unit → pt conversion factors
const ptConversions = {
  'cm': 28.3465,
  'mm': 2.83465,
  'in': 72,
  'px': 0.75,  // 1px = 0.75pt (CSS default)
  'pt': 1,
};

export function convertToPt(value) {
  if (!value) return '0pt';
  const str = String(value).trim();

  // Already in pt
  if (str.endsWith('pt')) return str;

  // Extract number and unit
  const match = str.match(/^([0-9.]+)([a-z]+)$/);
  if (!match) return str; // Invalid format, return as-is

  const num = parseFloat(match[1]);
  const unit = match[2];

  const factor = ptConversions[unit];
  if (factor === undefined) return str; // Unknown unit, return as-is

  const ptValue = num * factor;
  return `${ptValue.toFixed(2)}pt`;
}

/**
 * Parse a CSS dimension string to a numeric value in pt.
 * Returns 0 for invalid or empty input.
 */
export function parseToPtValue(value) {
  if (!value) return 0;
  const str = String(value).trim();

  const match = str.match(/^([0-9.]+)\s*([a-z]*)$/);
  if (!match) return 0;

  const num = parseFloat(match[1]);
  if (isNaN(num)) return 0;

  const unit = match[2] || 'pt';
  const factor = ptConversions[unit];
  return factor !== undefined ? num * factor : 0;
}
