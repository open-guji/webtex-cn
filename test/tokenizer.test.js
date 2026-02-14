import { describe, it, expect } from 'vitest';
import { Tokenizer, TokenType } from '../src/parser/tokenizer.js';

describe('Tokenizer', () => {
  it('tokenizes plain text', () => {
    const t = new Tokenizer('hello world');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'hello world' });
    expect(tokens[1].type).toBe(TokenType.EOF);
  });

  it('tokenizes CJK text', () => {
    const t = new Tokenizer('天地玄黄');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: '天地玄黄' });
  });

  it('tokenizes ASCII commands', () => {
    const t = new Tokenizer('\\documentclass');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.COMMAND, value: 'documentclass' });
  });

  it('tokenizes CJK commands', () => {
    const t = new Tokenizer('\\夹注');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.COMMAND, value: '夹注' });
  });

  it('tokenizes braces', () => {
    const t = new Tokenizer('{hello}');
    const tokens = t.tokenize();
    expect(tokens[0].type).toBe(TokenType.OPEN_BRACE);
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: 'hello' });
    expect(tokens[2].type).toBe(TokenType.CLOSE_BRACE);
  });

  it('tokenizes brackets', () => {
    const t = new Tokenizer('[opt]');
    const tokens = t.tokenize();
    expect(tokens[0].type).toBe(TokenType.OPEN_BRACKET);
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: 'opt' });
    expect(tokens[2].type).toBe(TokenType.CLOSE_BRACKET);
  });

  it('tokenizes \\\\ as NEWLINE', () => {
    const t = new Tokenizer('abc\\\\def');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'abc' });
    expect(tokens[1]).toEqual({ type: TokenType.NEWLINE, value: '\\\\' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: 'def' });
  });

  it('tokenizes \\begin and \\end', () => {
    const t = new Tokenizer('\\begin{document}\\end{document}');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.BEGIN, value: 'begin' });
    expect(tokens[1].type).toBe(TokenType.OPEN_BRACE);
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: 'document' });
    expect(tokens[3].type).toBe(TokenType.CLOSE_BRACE);
    expect(tokens[4]).toEqual({ type: TokenType.END, value: 'end' });
  });

  it('skips comments', () => {
    const t = new Tokenizer('hello % this is a comment\nworld');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'hello ' });
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: 'world' });
  });

  it('handles escaped characters', () => {
    const t = new Tokenizer('\\{\\}\\%');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: '{' });
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: '}' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: '%' });
  });

  it('tokenizes a complete TeX snippet', () => {
    const tex = '\\documentclass[四库全书]{ltc-guji}\n\\title{钦定四库全书}';
    const t = new Tokenizer(tex);
    const tokens = t.tokenize();

    expect(tokens[0]).toEqual({ type: TokenType.COMMAND, value: 'documentclass' });
    expect(tokens[1].type).toBe(TokenType.OPEN_BRACKET);
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: '四库全书' });
    expect(tokens[3].type).toBe(TokenType.CLOSE_BRACKET);
    expect(tokens[4].type).toBe(TokenType.OPEN_BRACE);
    expect(tokens[5]).toEqual({ type: TokenType.TEXT, value: 'ltc-guji' });
    expect(tokens[6].type).toBe(TokenType.CLOSE_BRACE);
    // \title
    expect(tokens[7]).toEqual({ type: TokenType.COMMAND, value: 'title' });
    expect(tokens[8].type).toBe(TokenType.OPEN_BRACE);
    expect(tokens[9]).toEqual({ type: TokenType.TEXT, value: '钦定四库全书' });
    expect(tokens[10].type).toBe(TokenType.CLOSE_BRACE);
  });

  it('skips spaces after ASCII commands', () => {
    const t = new Tokenizer('\\par text');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.COMMAND, value: 'par' });
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: 'text' });
  });

  it('does not skip spaces after CJK commands', () => {
    const t = new Tokenizer('\\夹注{注}后');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.COMMAND, value: '夹注' });
    expect(tokens[1].type).toBe(TokenType.OPEN_BRACE);
  });

  it('handles backslash at end of input', () => {
    const t = new Tokenizer('text\\');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'text' });
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: '\\' });
    expect(tokens[2].type).toBe(TokenType.EOF);
  });

  it('handles control space (backslash + space)', () => {
    const t = new Tokenizer('a\\ b');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'a' });
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: ' ' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: 'b' });
  });

  it('handles single non-letter command (\\,)', () => {
    const t = new Tokenizer('a\\,b');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'a' });
    expect(tokens[1]).toEqual({ type: TokenType.COMMAND, value: ',' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: 'b' });
  });

  it('collapses whitespace in text', () => {
    const t = new Tokenizer('hello   world');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'hello world' });
  });

  it('handles empty input', () => {
    const t = new Tokenizer('');
    const tokens = t.tokenize();
    expect(tokens.length).toBe(1);
    expect(tokens[0].type).toBe(TokenType.EOF);
  });

  it('handles nested braces and brackets', () => {
    const t = new Tokenizer('{[{}]}');
    const tokens = t.tokenize();
    expect(tokens[0].type).toBe(TokenType.OPEN_BRACE);
    expect(tokens[1].type).toBe(TokenType.OPEN_BRACKET);
    expect(tokens[2].type).toBe(TokenType.OPEN_BRACE);
    expect(tokens[3].type).toBe(TokenType.CLOSE_BRACE);
    expect(tokens[4].type).toBe(TokenType.CLOSE_BRACKET);
    expect(tokens[5].type).toBe(TokenType.CLOSE_BRACE);
  });

  it('handles multiple escaped characters in sequence', () => {
    const t = new Tokenizer('\\#\\$\\&');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: '#' });
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: '$' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: '&' });
  });

  it('handles command with @ symbol', () => {
    const t = new Tokenizer('\\make@title');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.COMMAND, value: 'make@title' });
  });

  it('tokenizes inline math $...$', () => {
    const t = new Tokenizer('text$x^2$more');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'text' });
    expect(tokens[1]).toEqual({ type: TokenType.MATH, value: 'x^2' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: 'more' });
  });

  it('handles unclosed $ as text', () => {
    const t = new Tokenizer('price $5');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'price ' });
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: '$5' });
  });

  it('handles escaped \\$ as text', () => {
    const t = new Tokenizer('cost \\$100');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'cost ' });
    expect(tokens[1]).toEqual({ type: TokenType.TEXT, value: '$' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: '100' });
  });

  it('detects paragraph break on empty line', () => {
    const t = new Tokenizer('first\n\nsecond');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'first' });
    expect(tokens[1]).toEqual({ type: TokenType.PARAGRAPH_BREAK, value: '' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: 'second' });
  });

  it('detects paragraph break with whitespace-only line', () => {
    const t = new Tokenizer('first\n  \nsecond');
    const tokens = t.tokenize();
    expect(tokens[0]).toEqual({ type: TokenType.TEXT, value: 'first' });
    expect(tokens[1]).toEqual({ type: TokenType.PARAGRAPH_BREAK, value: '' });
    expect(tokens[2]).toEqual({ type: TokenType.TEXT, value: 'second' });
  });
});
