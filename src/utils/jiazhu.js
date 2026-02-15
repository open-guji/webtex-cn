/**
 * Jiazhu (interlinear annotation) splitting utilities.
 * Used by both layout engine and renderer.
 */

/**
 * Split jiazhu text (array of RichChars) into two balanced columns.
 */
export function splitJiazhu(richChars, align = 'outward', balance = true) {
  if (!balance) {
    // No balancing: all content in col1, col2 empty
    return { col1: richChars, col2: richChars.slice(0, 0) };
  }
  if (richChars.length === 0) return { col1: richChars.slice(0, 0), col2: richChars.slice(0, 0) };
  if (richChars.length === 1) return { col1: richChars.slice(0, 1), col2: richChars.slice(1) };

  const mid = align === 'inward'
    ? Math.floor(richChars.length / 2)
    : Math.ceil(richChars.length / 2);

  return {
    col1: richChars.slice(0, mid),
    col2: richChars.slice(mid),
  };
}

/**
 * Split long jiazhu text (array of RichChars) into multiple dual-column segments.
 * firstMaxPerCol allows the first segment to use remaining column space.
 */
export function splitJiazhuMulti(richChars, maxCharsPerCol = 20, align = 'outward', firstMaxPerCol = 0, balance = true) {
  if (!balance) {
    // No balancing: single-column mode, each segment fills col1 only
    const first = firstMaxPerCol > 0 ? firstMaxPerCol : maxCharsPerCol;
    if (richChars.length <= first) {
      return [splitJiazhu(richChars, align, false)];
    }
    const segments = [];
    segments.push(splitJiazhu(richChars.slice(0, first), align, false));
    for (let i = first; i < richChars.length; i += maxCharsPerCol) {
      segments.push(splitJiazhu(richChars.slice(i, i + maxCharsPerCol), align, false));
    }
    return segments;
  }
  const first = firstMaxPerCol > 0 ? firstMaxPerCol : maxCharsPerCol;
  const firstChunkSize = first * 2;
  if (richChars.length <= firstChunkSize) {
    return [splitJiazhu(richChars, align)];
  }
  const segments = [];
  const firstChunk = richChars.slice(0, firstChunkSize);
  segments.push(splitJiazhu(firstChunk, align));
  const fullChunkSize = maxCharsPerCol * 2;
  for (let i = firstChunkSize; i < richChars.length; i += fullChunkSize) {
    const chunk = richChars.slice(i, i + fullChunkSize);
    segments.push(splitJiazhu(chunk, align));
  }
  return segments;
}
