/**
 * TeX Tokenizer for luatex-cn compatible files.
 * Splits TeX source into a stream of tokens.
 */

export const TokenType = {
  COMMAND: 'COMMAND',
  OPEN_BRACE: 'OPEN_BRACE',
  CLOSE_BRACE: 'CLOSE_BRACE',
  OPEN_BRACKET: 'OPEN_BRACKET',
  CLOSE_BRACKET: 'CLOSE_BRACKET',
  TEXT: 'TEXT',
  NEWLINE: 'NEWLINE',       // \\
  COMMENT: 'COMMENT',
  BEGIN: 'BEGIN',
  END: 'END',
  MATH: 'MATH',
  PARAGRAPH_BREAK: 'PARAGRAPH_BREAK',
  EOF: 'EOF',
};

function isLetter(ch) {
  return /[a-zA-Z]/.test(ch);
}

function isCJK(ch) {
  const code = ch.codePointAt(0);
  // CJK Unified Ideographs
  if (code >= 0x4E00 && code <= 0x9FFF) return true;
  // CJK Extension A
  if (code >= 0x3400 && code <= 0x4DBF) return true;
  // CJK Compatibility Ideographs
  if (code >= 0xF900 && code <= 0xFAFF) return true;
  return false;
}

function isCommandChar(ch) {
  return isLetter(ch) || isCJK(ch) || ch === '@' || ch === '*';
}

export class Tokenizer {
  constructor(source) {
    this.source = source;
    this.pos = 0;
    this.tokens = [];
  }

  peek() {
    if (this.pos >= this.source.length) return null;
    return this.source[this.pos];
  }

  advance() {
    const ch = this.source[this.pos];
    this.pos++;
    return ch;
  }

  tokenize() {
    while (this.pos < this.source.length) {
      const ch = this.peek();

      if (ch === '%') {
        // Comment: skip to end of line
        this.skipComment();
        continue;
      }

      if (ch === '$') {
        this.readMath();
        continue;
      }

      if (ch === '\\') {
        this.readCommand();
        continue;
      }

      if (ch === '{') {
        this.tokens.push({ type: TokenType.OPEN_BRACE, value: '{' });
        this.advance();
        continue;
      }

      if (ch === '}') {
        this.tokens.push({ type: TokenType.CLOSE_BRACE, value: '}' });
        this.advance();
        continue;
      }

      if (ch === '[') {
        this.tokens.push({ type: TokenType.OPEN_BRACKET, value: '[' });
        this.advance();
        continue;
      }

      if (ch === ']') {
        this.tokens.push({ type: TokenType.CLOSE_BRACKET, value: ']' });
        this.advance();
        continue;
      }

      // Regular text
      this.readText();
    }

    this.tokens.push({ type: TokenType.EOF, value: '' });
    return this.tokens;
  }

  skipComment() {
    while (this.pos < this.source.length && this.source[this.pos] !== '\n') {
      this.pos++;
    }
    // Skip the newline too
    if (this.pos < this.source.length) this.pos++;
  }

  readCommand() {
    this.advance(); // skip '\'

    if (this.pos >= this.source.length) {
      this.tokens.push({ type: TokenType.TEXT, value: '\\' });
      return;
    }

    const nextCh = this.peek();

    // \\ = forced newline
    if (nextCh === '\\') {
      this.advance();
      this.tokens.push({ type: TokenType.NEWLINE, value: '\\\\' });
      return;
    }

    // \{ \} \[ \] \% \$ \& \# \_ \~ \^ - escaped characters
    if ('{}[]%$&#_~^'.includes(nextCh)) {
      this.advance();
      this.tokens.push({ type: TokenType.TEXT, value: nextCh });
      return;
    }

    // \  (backslash + space) = control space
    if (nextCh === ' ' || nextCh === '\n') {
      this.advance();
      this.tokens.push({ type: TokenType.TEXT, value: ' ' });
      return;
    }

    // Read command name: sequence of letters or CJK chars
    if (!isCommandChar(nextCh)) {
      // Single non-letter character command (like \,)
      this.advance();
      this.tokens.push({ type: TokenType.COMMAND, value: nextCh });
      return;
    }

    // Determine if we're reading ASCII letters or CJK characters
    const isAsciiStart = isLetter(nextCh) || nextCh === '@' || nextCh === '*';
    const isCJKStart = isCJK(nextCh);

    let name = '';
    if (isAsciiStart) {
      // ASCII command: read letters, @, *
      while (this.pos < this.source.length && (isLetter(this.peek()) || this.peek() === '@' || this.peek() === '*')) {
        name += this.advance();
      }
      // Skip trailing spaces after ASCII commands
      while (this.pos < this.source.length && this.source[this.pos] === ' ') {
        this.pos++;
      }
    } else if (isCJKStart) {
      // CJK command: read CJK characters
      while (this.pos < this.source.length && isCJK(this.peek())) {
        name += this.advance();
      }
    }

    // Special handling for \begin and \end
    if (name === 'begin') {
      this.tokens.push({ type: TokenType.BEGIN, value: 'begin' });
    } else if (name === 'end') {
      this.tokens.push({ type: TokenType.END, value: 'end' });
    } else {
      this.tokens.push({ type: TokenType.COMMAND, value: name });
    }
  }

  readMath() {
    this.advance(); // skip opening $
    let content = '';
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === '$') {
        this.advance(); // skip closing $
        this.tokens.push({ type: TokenType.MATH, value: content });
        return;
      }
      content += this.advance();
    }
    // Unclosed $: treat as text
    this.tokens.push({ type: TokenType.TEXT, value: '$' + content });
  }

  readText() {
    let text = '';
    while (this.pos < this.source.length) {
      const ch = this.peek();
      if (ch === '\\' || ch === '{' || ch === '}' || ch === '[' || ch === ']' || ch === '%' || ch === '$') {
        break;
      }
      text += this.advance();
    }
    if (text) {
      // Split on blank lines (paragraph breaks): \n followed by whitespace-only line
      const parts = text.split(/\n[ \t]*\n/);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) {
          this.tokens.push({ type: TokenType.PARAGRAPH_BREAK, value: '' });
        }
        const collapsed = parts[i].replace(/[ \t]+/g, ' ');
        if (collapsed.trim() || collapsed === ' ') {
          this.tokens.push({ type: TokenType.TEXT, value: collapsed });
        }
      }
    }
  }
}
