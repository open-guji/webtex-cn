/**
 * Parameter Converter for luatex-cn → webtex-cn
 *
 * Converts parameter values from luatex-cn .cfg format to CSS-compatible format.
 * Mainly used for runtime parsing of user .cfg files (system templates are pre-converted).
 */

/**
 * Convert TeX RGB color formats to CSS rgb() format.
 *
 * Supported formats:
 * - {R, G, B}  → rgb(R, G, B)  (0-255 range)
 * - R G B      → rgb(R*255, G*255, B*255)  (0-1 range, space-separated)
 * - named colors → pass through (e.g., 'red', 'black')
 *
 * @param {string} value
 * @returns {string} CSS color value
 */
export function convertColor(value) {
  if (!value) return value;

  const trimmed = value.trim();

  // {R, G, B} format (0-255 range)
  const bracketMatch = trimmed.match(/^\{?\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\}?$/);
  if (bracketMatch) {
    const [, r, g, b] = bracketMatch;
    return `rgb(${r}, ${g}, ${b})`;
  }

  // R G B format (0-1 range, space-separated)
  const spaceMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/);
  if (spaceMatch) {
    const [, r, g, b] = spaceMatch;
    const rInt = Math.round(parseFloat(r) * 255);
    const gInt = Math.round(parseFloat(g) * 255);
    const bInt = Math.round(parseFloat(b) * 255);
    return `rgb(${rInt}, ${gInt}, ${bInt})`;
  }

  // Named color or already CSS format → pass through
  return trimmed;
}

/**
 * Convert TeX dimension to CSS dimension.
 * CSS natively supports pt, mm, cm, em, ex, etc., so most values pass through.
 *
 * @param {string|number} value
 * @returns {string} CSS dimension
 */
export function convertDimension(value) {
  if (typeof value === 'number') return `${value}pt`;
  if (!value) return value;

  const trimmed = value.trim();
  // Already has unit → pass through
  if (/^\d+(\.\d+)?(pt|mm|cm|em|ex|px|in)$/.test(trimmed)) {
    return trimmed;
  }

  // Pure number → assume pt
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}pt`;
  }

  return trimmed;
}

/**
 * Convert boolean string to actual boolean or numeric flag.
 *
 * @param {string|boolean} value
 * @param {boolean} asNumber - If true, return 1/0 instead of true/false
 * @returns {boolean|number}
 */
export function convertBoolean(value, asNumber = false) {
  if (typeof value === 'boolean') return asNumber ? (value ? 1 : 0) : value;
  if (!value) return asNumber ? 0 : false;

  const trimmed = value.toString().trim().toLowerCase();
  const boolValue = trimmed === 'true' || trimmed === '1';

  return asNumber ? (boolValue ? 1 : 0) : boolValue;
}

/**
 * Convert alignment value to flexbox justify-content value.
 * Used in vertical writing mode context.
 *
 * @param {string} value - 'left', 'right', 'center'
 * @returns {string} - 'flex-start', 'flex-end', 'center'
 */
export function convertAlign(value) {
  if (!value) return value;
  const trimmed = value.trim().toLowerCase();

  // Map alignment to flexbox values
  const alignMap = {
    'left': 'flex-start',
    'right': 'flex-end',
    'center': 'center',
  };

  return alignMap[trimmed] || trimmed;
}

/**
 * Auto-detect and convert parameter value based on type.
 *
 * @param {string} paramName - Parameter name (e.g., 'font-size', 'border-color')
 * @param {any} value - Raw value from .cfg
 * @returns {any} Converted value
 */
export function convertParam(paramName, value) {
  if (value === null || value === undefined) return value;

  // Color parameters
  if (paramName.includes('color') || paramName === 'background-color') {
    return convertColor(value);
  }

  // Boolean parameters
  if (paramName === 'border' || paramName === 'outer-border' ||
      paramName === 'banxin' || paramName.includes('yuwei') ||
      paramName === 'banxin-divider') {
    return convertBoolean(value, false);
  }

  // Dimension parameters
  if (paramName.includes('width') || paramName.includes('height') ||
      paramName.includes('size') || paramName.includes('margin') ||
      paramName.includes('padding') || paramName.includes('spacing') ||
      paramName.includes('sep') || paramName.includes('thickness') ||
      paramName.includes('gap')) {
    return convertDimension(value);
  }

  // Ratio parameters (float)
  if (paramName.includes('ratio')) {
    return typeof value === 'number' ? value : parseFloat(value);
  }

  // Numeric parameters (integer)
  if (paramName === 'n-column' || paramName === 'n-char-per-col' || paramName === 'cols') {
    return typeof value === 'number' ? value : parseInt(value, 10);
  }

  // Alignment parameters
  if (paramName === 'align') {
    return convertAlign(value);
  }

  // String parameters
  return value.toString().trim();
}
