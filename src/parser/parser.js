/**
 * TeX Parser for luatex-cn compatible files.
 * Consumes token stream and produces a Document AST.
 */

import { TokenType } from './tokenizer.js';
import { resolveCommand, resolveEnvironment } from './commands.js';
import { NodeType, createNode, parseKeyValue } from '../model/nodes.js';

export class Parser {
  constructor(tokens) {
    this.tokens = tokens;
    this.pos = 0;
    this.warnings = [];
  }

  peek() {
    if (this.pos >= this.tokens.length) return { type: TokenType.EOF, value: '' };
    return this.tokens[this.pos];
  }

  advance() {
    const token = this.tokens[this.pos];
    this.pos++;
    return token;
  }

  expect(type) {
    const token = this.peek();
    if (token.type !== type) {
      this.warnings.push(`Expected ${type} but got ${token.type} ("${token.value}") at token ${this.pos}`);
      return null;
    }
    return this.advance();
  }

  /**
   * Read content inside { ... }, handling nested braces.
   * Returns the raw text content.
   */
  readBraceGroup() {
    if (this.peek().type !== TokenType.OPEN_BRACE) return '';
    this.advance(); // skip {

    let content = '';
    let depth = 1;

    while (this.pos < this.tokens.length && depth > 0) {
      const token = this.peek();
      if (token.type === TokenType.OPEN_BRACE) {
        depth++;
        content += '{';
        this.advance();
      } else if (token.type === TokenType.CLOSE_BRACE) {
        depth--;
        if (depth > 0) content += '}';
        this.advance();
      } else if (token.type === TokenType.EOF) {
        break;
      } else {
        content += token.value;
        this.advance();
      }
    }

    return content;
  }

  /**
   * Read content inside [ ... ], handling nested brackets.
   * Returns the raw text content or null if no bracket group.
   */
  readBracketGroup() {
    if (this.peek().type !== TokenType.OPEN_BRACKET) return null;
    this.advance(); // skip [

    let content = '';
    let depth = 1;

    while (this.pos < this.tokens.length && depth > 0) {
      const token = this.peek();
      if (token.type === TokenType.OPEN_BRACKET) {
        depth++;
        content += '[';
        this.advance();
      } else if (token.type === TokenType.CLOSE_BRACKET) {
        depth--;
        if (depth > 0) content += ']';
        this.advance();
      } else if (token.type === TokenType.EOF) {
        break;
      } else {
        content += token.value;
        this.advance();
      }
    }

    return content;
  }

  /**
   * Parse the content of a brace group as child nodes (recursive).
   */
  readBraceGroupAsNodes() {
    if (this.peek().type !== TokenType.OPEN_BRACE) return [];
    this.advance(); // skip {

    const children = [];
    while (this.pos < this.tokens.length) {
      const token = this.peek();
      if (token.type === TokenType.CLOSE_BRACE) {
        this.advance();
        break;
      }
      if (token.type === TokenType.EOF) break;

      const node = this.parseToken();
      if (node) children.push(node);
    }
    return children;
  }

  /**
   * Parse command arguments according to its definition.
   */
  parseCommandArgs(def) {
    let optionalArg = null;
    const requiredArgs = [];

    if (!def.args) return { optionalArg, requiredArgs };

    for (const argType of def.args) {
      if (argType === 'optional') {
        optionalArg = this.readBracketGroup();
      } else if (argType === 'required') {
        const content = this.readBraceGroup();
        requiredArgs.push(content);
      }
    }

    return { optionalArg, requiredArgs };
  }

  /**
   * Main entry point: parse the full document.
   */
  parse() {
    const doc = createNode(NodeType.DOCUMENT);
    doc.template = '';
    doc.documentClass = '';
    doc.title = '';
    doc.chapter = '';
    doc.setupCommands = [];

    // Parse preamble and body
    while (this.pos < this.tokens.length) {
      const token = this.peek();
      if (token.type === TokenType.EOF) break;

      const node = this.parseToken(doc);
      if (node) {
        doc.children.push(node);
      }
    }

    return doc;
  }

  /**
   * Parse a single token and return a node (or null).
   * @param {object} doc - The document node (for storing metadata)
   */
  parseToken(doc) {
    const token = this.peek();

    switch (token.type) {
      case TokenType.TEXT:
        this.advance();
        return createNode(NodeType.TEXT, { value: token.value });

      case TokenType.NEWLINE:
        this.advance();
        return createNode(NodeType.NEWLINE);

      case TokenType.MATH:
        this.advance();
        return createNode(NodeType.MATH, { value: token.value });

      case TokenType.PARAGRAPH_BREAK:
        this.advance();
        return createNode(NodeType.PARAGRAPH_BREAK);

      case TokenType.COMMAND:
        return this.parseCommand(doc);

      case TokenType.BEGIN:
        return this.parseEnvironment(doc);

      case TokenType.END:
        // Unexpected \end — we shouldn't be here, return null
        return null;

      case TokenType.OPEN_BRACE:
        // Bare group: parse as inline group
        return this.parseBareGroup();

      default:
        this.advance();
        return null;
    }
  }

  parseBareGroup() {
    const children = this.readBraceGroupAsNodes();
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];
    const group = createNode('group');
    group.children = children;
    return group;
  }

  parseCommand(doc) {
    const token = this.advance(); // consume COMMAND
    const name = token.value;
    const def = resolveCommand(name);

    // Handle special document commands
    if (name === 'documentclass') {
      const optArg = this.readBracketGroup();
      const reqArg = this.readBraceGroup();
      if (doc) {
        doc.documentClass = reqArg;
        doc.template = optArg || '';
      }
      return null; // metadata, no AST node
    }

    if (name === 'title') {
      const content = this.readBraceGroup();
      if (doc) doc.title = content;
      return null;
    }

    if (name === 'chapter') {
      const content = this.readBraceGroup();
      if (doc) doc.chapter = content;
      return null;
    }

    if (name === 'item') {
      // \item in a list — return marker node, content follows
      return createNode(NodeType.LIST_ITEM);
    }

    // No definition found: treat as unknown
    if (!def) {
      this.warnings.push(`Unknown command: \\${name} at token ${this.pos}`);
      // Try to consume brace group if next token is {
      let content = '';
      if (this.peek().type === TokenType.OPEN_BRACE) {
        content = this.readBraceGroup();
      }
      return createNode(NodeType.TEXT, { value: content });
    }

    // Ignored commands: consume args and return null
    if (def.ignore) {
      this.parseCommandArgs(def);
      return null;
    }

    // Setup commands
    if (def.node === 'setupCmd') {
      const { optionalArg, requiredArgs } = this.parseCommandArgs(def);
      const params = parseKeyValue(requiredArgs[0] || optionalArg || '');
      const setupNode = createNode(NodeType.SETUP, {
        setupType: def.setupType,
        params,
      });
      if (doc) doc.setupCommands.push(setupNode);
      return null;
    }

    // Commands with defaultOpt (like \平抬)
    const { optionalArg, requiredArgs } = this.parseCommandArgs(def);
    const options = parseKeyValue(optionalArg || '');

    // Build node based on def.node
    const nodeType = this.mapNodeType(def.node);
    const node = createNode(nodeType, { options });

    // Apply default option
    if (def.defaultOpt !== undefined && optionalArg === null) {
      node.options = { value: def.defaultOpt };
    }

    // Parse required arg as children (recursive parsing for content with commands)
    if (requiredArgs.length > 0 && def.node !== 'stamp') {
      // Re-tokenize and parse the required arg content
      const { Tokenizer } = require_tokenizer();
      const innerTokens = new Tokenizer(requiredArgs[0]).tokenize();
      const innerParser = new Parser(innerTokens);
      while (innerParser.pos < innerParser.tokens.length) {
        const t = innerParser.peek();
        if (t.type === TokenType.EOF) break;
        const child = innerParser.parseToken();
        if (child) node.children.push(child);
      }
    }

    // Special: space and taitou use the option value directly
    if (def.node === 'space' || def.node === 'taitou' || def.node === 'nuotai' || def.node === 'relativeTaitou') {
      node.value = optionalArg || def.defaultOpt || '1';
    }

    if (def.node === 'setIndent') {
      node.value = requiredArgs[0] || '0';
    }

    // Stamp: store raw args
    if (def.node === 'stamp') {
      node.options = parseKeyValue(optionalArg || '');
      node.src = requiredArgs[0] || '';
    }

    return node;
  }

  parseEnvironment(doc) {
    this.advance(); // consume BEGIN
    const envName = this.readBraceGroup();
    const def = resolveEnvironment(envName);

    if (!def) {
      this.warnings.push(`Unknown environment: ${envName}`);
      // Unknown environment: parse content until matching \end
      const children = this.parseUntilEnd(envName, doc);
      const node = createNode(NodeType.UNKNOWN, { envName });
      node.children = children;
      return node;
    }

    // Read optional args if the environment supports them
    let options = {};
    if (def.hasOptions) {
      const optArg = this.readBracketGroup();
      if (optArg) options = parseKeyValue(optArg);
    }

    const nodeType = this.mapNodeType(def.node);
    const node = createNode(nodeType, { options });

    // Special: body environment
    if (def.node === 'body') {
      node.children = this.parseUntilEnd(envName, doc);
      return node;
    }

    // Parse children until \end{envName}
    node.children = this.parseUntilEnd(envName, doc);

    // Post-process list environment: group items
    if (def.node === 'list') {
      node.children = this.groupListItems(node.children);
    }

    return node;
  }

  /**
   * Parse tokens until we encounter \end{envName}.
   */
  parseUntilEnd(envName, doc) {
    const children = [];
    while (this.pos < this.tokens.length) {
      const token = this.peek();

      if (token.type === TokenType.EOF) {
        this.warnings.push(`Unclosed environment: ${envName}`);
        break;
      }

      // Check for \end{envName}
      if (token.type === TokenType.END) {
        this.advance(); // consume END
        const endName = this.readBraceGroup();
        if (endName === envName) {
          break; // matching end found
        }
        // Not our end, put back (we can't really put back, so just record warning)
        this.warnings.push(`Mismatched \\end{${endName}}, expected \\end{${envName}}`);
        continue;
      }

      const node = this.parseToken(doc);
      if (node) children.push(node);
    }
    return children;
  }

  /**
   * Group list items: \item separators become container nodes.
   */
  groupListItems(children) {
    const items = [];
    let currentItem = null;

    for (const child of children) {
      if (child.type === NodeType.LIST_ITEM) {
        currentItem = createNode(NodeType.LIST_ITEM);
        items.push(currentItem);
      } else {
        if (!currentItem) {
          // Content before first \item — create implicit item
          currentItem = createNode(NodeType.LIST_ITEM);
          items.push(currentItem);
        }
        currentItem.children.push(child);
      }
    }

    return items;
  }

  mapNodeType(nodeName) {
    const map = {
      'contentBlock': NodeType.CONTENT_BLOCK,
      'paragraph': NodeType.PARAGRAPH,
      'jiazhu': NodeType.JIAZHU,
      'sidenote': NodeType.SIDENOTE,
      'meipi': NodeType.MEIPI,
      'pizhu': NodeType.PIZHU,
      'textbox': NodeType.TEXTBOX,
      'fillTextbox': NodeType.FILL_TEXTBOX,
      'space': NodeType.SPACE,
      'columnBreak': NodeType.COLUMN_BREAK,
      'taitou': NodeType.TAITOU,
      'nuotai': NodeType.NUOTAI,
      'setIndent': NodeType.SET_INDENT,
      'emphasis': NodeType.EMPHASIS,
      'properName': NodeType.PROPER_NAME,
      'bookTitle': NodeType.BOOK_TITLE,
      'inverted': NodeType.INVERTED,
      'octagon': NodeType.OCTAGON,
      'circled': NodeType.CIRCLED,
      'invertedOctagon': NodeType.INVERTED_OCTAGON,
      'fix': NodeType.FIX,
      'decorate': NodeType.DECORATE,
      'list': NodeType.LIST,
      'body': 'body',
      'stamp': NodeType.STAMP,
      'relativeTaitou': NodeType.TAITOU,
    };
    return map[nodeName] || NodeType.UNKNOWN;
  }
}

// Lazy import to avoid circular dependency
let _Tokenizer = null;
function require_tokenizer() {
  if (!_Tokenizer) {
    // Dynamic import workaround for circular deps
    _Tokenizer = { Tokenizer: null };
  }
  return _Tokenizer;
}

// Called after module load to inject the Tokenizer
export function setTokenizer(TokenizerClass) {
  if (!_Tokenizer) _Tokenizer = {};
  _Tokenizer.Tokenizer = TokenizerClass;
}
