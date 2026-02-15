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
