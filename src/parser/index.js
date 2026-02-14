/**
 * Parser module entry point.
 * Exports a convenience function to parse TeX source to AST.
 */

import { Tokenizer } from './tokenizer.js';
import { Parser, setTokenizer } from './parser.js';

// Inject Tokenizer into Parser to resolve lazy dependency
setTokenizer(Tokenizer);

/**
 * Parse a TeX source string into a Document AST.
 * @param {string} source - TeX source code
 * @returns {{ ast: object, warnings: string[] }}
 */
export function parse(source) {
  const tokenizer = new Tokenizer(source);
  const tokens = tokenizer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return { ast, warnings: parser.warnings };
}

export { Tokenizer } from './tokenizer.js';
export { Parser } from './parser.js';
export { NodeType, parseKeyValue } from '../model/nodes.js';
