/**
 * Judou (句读) punctuation classification and rich-text processing.
 * Used by both layout engine and renderer.
 */

const JUDOU_JU = new Set(['。', '？', '！']);
const JUDOU_DOU = new Set(['，', '；', '、', '：']);
const JUDOU_PAIRED_OPEN = new Set(['「', '『', '《', '〈', '（', '【', '〔', '\u2018', '\u201C']);
const JUDOU_PAIRED_CLOSE = new Set(['」', '』', '》', '〉', '）', '】', '〕', '\u2019', '\u201D']);

/**
 * Classify a character's judou punctuation type.
 * @returns {'ju'|'dou'|'open'|'close'|null}
 */
export function getJudouType(ch) {
  if (JUDOU_JU.has(ch)) return 'ju';
  if (JUDOU_DOU.has(ch)) return 'dou';
  if (JUDOU_PAIRED_OPEN.has(ch)) return 'open';
  if (JUDOU_PAIRED_CLOSE.has(ch)) return 'close';
  return null;
}

/**
 * Check if a character is any CJK punctuation (used by 'none' mode to strip all punctuation).
 */
export function isCJKPunctuation(ch) {
  return JUDOU_JU.has(ch) || JUDOU_DOU.has(ch) ||
    JUDOU_PAIRED_OPEN.has(ch) || JUDOU_PAIRED_CLOSE.has(ch);
}

/**
 * Process text into an array of RichChar objects that carry judou metadata.
 *
 * @param {string} text
 * @param {'normal'|'judou'|'none'} mode
 * @returns {Array<{char: string, judouType: string|null, isBookTitle: boolean}>}
 */
export function getJudouRichText(text, mode = 'normal') {
  const chars = [...text];

  // None mode: strip all punctuation, return plain text only
  if (mode === 'none') {
    return chars
      .filter(ch => !isCJKPunctuation(ch))
      .map(ch => ({ char: ch, judouType: null, isBookTitle: false }));
  }

  if (mode !== 'judou') {
    return chars.map(ch => ({ char: ch, judouType: null, isBookTitle: false }));
  }

  const result = [];
  let isBookTitle = false;
  let i = 0;

  while (i < chars.length) {
    const ch = chars[i];

    // Book-title brackets
    if (ch === '\u300A' || ch === '\u3008') {
      isBookTitle = true;
      i++;
      continue;
    }
    if (ch === '\u300B' || ch === '\u3009') {
      isBookTitle = false;
      i++;
      continue;
    }

    const jType = getJudouType(ch);
    if (jType === 'ju' || jType === 'dou') {
      // Attach to the previous character if exists
      if (result.length > 0) {
        result[result.length - 1].judouType = jType;
      }
    } else if (jType === 'open' || jType === 'close') {
      // Skip brackets in judou mode (except for book title ones handled above)
    } else {
      result.push({ char: ch, judouType: null, isBookTitle });
    }
    i++;
  }
  return result;
}
