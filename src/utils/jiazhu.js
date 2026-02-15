/**
 * Jiazhu (interlinear annotation) splitting utilities.
 * Used by both layout engine and renderer.
 */

/**
 * Split jiazhu text (array of RichChars) into two columns.
 * When balance=true (default), splits evenly (balanced columns).
 * When balance=false, col1 fills up to maxPerCol first, remainder goes to col2.
 */
export function splitJiazhu(richChars, align = 'outward', balance = true, maxPerCol = 0) {
  if (richChars.length === 0) return { col1: richChars.slice(0, 0), col2: richChars.slice(0, 0) };
  if (richChars.length === 1) return { col1: richChars.slice(0, 1), col2: richChars.slice(1) };

  let mid;
  if (!balance && maxPerCol > 0) {
    // Unbalanced: col1 fills to maxPerCol, remainder in col2
    mid = Math.min(richChars.length, maxPerCol);
  } else {
    mid = align === 'inward'
      ? Math.floor(richChars.length / 2)
      : Math.ceil(richChars.length / 2);
  }

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
  const first = firstMaxPerCol > 0 ? firstMaxPerCol : maxCharsPerCol;
  const firstChunkSize = first * 2;
  if (richChars.length <= firstChunkSize) {
    return [splitJiazhu(richChars, align, balance, first)];
  }
  const segments = [];
  const firstChunk = richChars.slice(0, firstChunkSize);
  segments.push(splitJiazhu(firstChunk, align, balance, first));
  const fullChunkSize = maxCharsPerCol * 2;
  for (let i = firstChunkSize; i < richChars.length; i += fullChunkSize) {
    const chunk = richChars.slice(i, i + fullChunkSize);
    segments.push(splitJiazhu(chunk, align, balance, maxCharsPerCol));
  }
  return segments;
}
