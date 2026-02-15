/**
 * Macro Preprocessor for .cfg template files.
 *
 * Parses \NewDocumentCommand and \NewDocumentEnvironment definitions
 * from .cfg files, then expands macros at the text level before
 * tokenization. This avoids modifying the existing tokenizer or parser.
 *
 * Supported .cfg features:
 *   - \NewDocumentCommand{\name}{argspec}{body}
 *   - \NewDocumentEnvironment{name}{argspec}{begin}{end}
 *   - \gujiSetup{...} and other preamble commands (passed through)
 *   - % comments, \endinput
 *   - Arg-spec: empty {}, m/+m (mandatory), o (optional)
 */

// ---------------------------------------------------------------------------
// Low-level text utilities
// ---------------------------------------------------------------------------

/**
 * Read a balanced brace group from source starting at pos.
 * @param {string} source
 * @param {number} pos - Position of the opening '{'
 * @returns {{ content: string, endPos: number } | null}
 */
export function readBalancedBraces(source, pos) {
  if (pos >= source.length || source[pos] !== '{') return null;
  pos++; // skip opening {
  let depth = 1;
  let content = '';
  while (pos < source.length && depth > 0) {
    const ch = source[pos];
    if (ch === '\\' && pos + 1 < source.length) {
      // Escaped character — consume two chars, don't affect depth
      content += ch + source[pos + 1];
      pos += 2;
      continue;
    }
    if (ch === '{') {
      depth++;
      content += ch;
    } else if (ch === '}') {
      depth--;
      if (depth > 0) content += ch;
    } else {
      content += ch;
    }
    pos++;
  }
  return { content, endPos: pos };
}

/**
 * Read a balanced bracket group from source starting at pos.
 * @param {string} source
 * @param {number} pos - Position of potential opening '['
 * @returns {{ content: string, endPos: number } | null}
 */
export function readBalancedBrackets(source, pos) {
  if (pos >= source.length || source[pos] !== '[') return null;
  pos++; // skip opening [
  let depth = 1;
  let content = '';
  while (pos < source.length && depth > 0) {
    const ch = source[pos];
    if (ch === '\\' && pos + 1 < source.length) {
      content += ch + source[pos + 1];
      pos += 2;
      continue;
    }
    if (ch === '[') {
      depth++;
      content += ch;
    } else if (ch === ']') {
      depth--;
      if (depth > 0) content += ch;
    } else {
      content += ch;
    }
    pos++;
  }
  return { content, endPos: pos };
}

/**
 * Skip whitespace (spaces, tabs, newlines) at pos.
 */
function skipWhitespace(source, pos) {
  while (pos < source.length && /\s/.test(source[pos])) pos++;
  return pos;
}

/**
 * Read a command name starting at pos (after the backslash).
 * Returns { name, endPos } or null.
 */
function readCommandName(source, pos) {
  if (pos >= source.length) return null;
  const ch = source[pos];

  // CJK command
  if (isCJK(ch)) {
    let name = '';
    while (pos < source.length && isCJK(source[pos])) {
      name += source[pos];
      pos++;
    }
    return { name, endPos: pos };
  }

  // ASCII command
  if (/[a-zA-Z@*]/.test(ch)) {
    let name = '';
    while (pos < source.length && /[a-zA-Z@*]/.test(source[pos])) {
      name += source[pos];
      pos++;
    }
    return { name, endPos: pos };
  }

  // Single non-letter command (like \,)
  return { name: ch, endPos: pos + 1 };
}

function isCJK(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x4E00 && code <= 0x9FFF) return true;
  if (code >= 0x3400 && code <= 0x4DBF) return true;
  if (code >= 0xF900 && code <= 0xFAFF) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Arg-spec parsing
// ---------------------------------------------------------------------------

/**
 * Parse a LaTeX3 argument specification string.
 * Supported: empty, m, +m, o.
 * @param {string} specStr
 * @returns {Array<{ type: 'mandatory'|'optional', long: boolean }>}
 */
export function parseArgSpec(specStr) {
  const specs = [];
  const s = specStr.trim();
  if (!s) return specs;

  let i = 0;
  let long = false;
  while (i < s.length) {
    const ch = s[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    if (ch === '+') {
      long = true;
      i++;
      continue;
    }
    if (ch === 'm') {
      specs.push({ type: 'mandatory', long });
      long = false;
      i++;
      continue;
    }
    if (ch === 'o') {
      specs.push({ type: 'optional', long: false });
      i++;
      continue;
    }
    // Unknown specifier — skip
    i++;
  }
  return specs;
}

// ---------------------------------------------------------------------------
// .cfg file parser
// ---------------------------------------------------------------------------

/**
 * Strip TeX line-end comments from a string.
 * Removes % and everything after it on each line, unless escaped (\%).
 */
function stripComments(source) {
  return source.replace(/^%.*$/gm, '').replace(/([^\\])%.*$/gm, '$1');
}

/**
 * Clean macro body: remove line-continuation comments (%\n) and trim.
 */
function cleanBody(body) {
  // Remove %\n (TeX line continuation)
  return body.replace(/%\s*\n\s*/g, '').trim();
}

/**
 * Parse a .cfg source into macro/environment definitions and preamble.
 * @param {string} cfgSource
 * @returns {{ preamble: string, macros: Map<string, object>, environments: Map<string, object> }}
 */
export function parseCfg(cfgSource) {
  const macros = new Map();
  const environments = new Map();
  let preamble = '';

  // Handle \endinput
  const endinputIdx = cfgSource.indexOf('\\endinput');
  if (endinputIdx !== -1) {
    cfgSource = cfgSource.substring(0, endinputIdx);
  }

  // Strip comments
  const source = stripComments(cfgSource);

  let pos = 0;
  while (pos < source.length) {
    // Skip whitespace
    pos = skipWhitespace(source, pos);
    if (pos >= source.length) break;

    // Look for backslash
    if (source[pos] !== '\\') {
      // Non-command text — accumulate into preamble
      let textEnd = source.indexOf('\\', pos);
      if (textEnd === -1) textEnd = source.length;
      const text = source.substring(pos, textEnd).trim();
      if (text) preamble += text + '\n';
      pos = textEnd;
      continue;
    }

    // Read command name
    const cmd = readCommandName(source, pos + 1);
    if (!cmd) { pos++; continue; }

    if (cmd.name === 'NewDocumentCommand') {
      // \NewDocumentCommand{\name}{argspec}{body}
      let p = skipWhitespace(source, cmd.endPos);
      // Read {\name}
      const nameGroup = readBalancedBraces(source, p);
      if (!nameGroup) { pos = cmd.endPos; continue; }
      p = skipWhitespace(source, nameGroup.endPos);
      // Extract command name (strip leading \)
      const macroName = nameGroup.content.replace(/^\\/, '').trim();
      // Read {argspec}
      const argGroup = readBalancedBraces(source, p);
      if (!argGroup) { pos = nameGroup.endPos; continue; }
      p = skipWhitespace(source, argGroup.endPos);
      // Read {body}
      const bodyGroup = readBalancedBraces(source, p);
      if (!bodyGroup) { pos = argGroup.endPos; continue; }

      macros.set(macroName, {
        name: macroName,
        argSpecs: parseArgSpec(argGroup.content),
        body: cleanBody(bodyGroup.content),
      });
      pos = bodyGroup.endPos;

    } else if (cmd.name === 'NewDocumentEnvironment') {
      // \NewDocumentEnvironment{name}{argspec}{begin}{end}
      let p = skipWhitespace(source, cmd.endPos);
      // Read {name}
      const nameGroup = readBalancedBraces(source, p);
      if (!nameGroup) { pos = cmd.endPos; continue; }
      p = skipWhitespace(source, nameGroup.endPos);
      const envName = nameGroup.content.trim();
      // Read {argspec}
      const argGroup = readBalancedBraces(source, p);
      if (!argGroup) { pos = nameGroup.endPos; continue; }
      p = skipWhitespace(source, argGroup.endPos);
      // Read {beginCode}
      const beginGroup = readBalancedBraces(source, p);
      if (!beginGroup) { pos = argGroup.endPos; continue; }
      p = skipWhitespace(source, beginGroup.endPos);
      // Read {endCode}
      const endGroup = readBalancedBraces(source, p);
      if (!endGroup) { pos = beginGroup.endPos; continue; }

      environments.set(envName, {
        name: envName,
        argSpecs: parseArgSpec(argGroup.content),
        beginCode: cleanBody(beginGroup.content),
        endCode: cleanBody(endGroup.content),
      });
      pos = endGroup.endPos;

    } else {
      // Other command — accumulate into preamble
      // Re-read from original backslash position to capture the full command
      let p = cmd.endPos;
      // Skip trailing spaces
      while (p < source.length && source[p] === ' ') p++;
      // Consume brace groups that follow (arguments)
      let cmdText = '\\' + cmd.name;
      while (p < source.length && (source[p] === '{' || source[p] === '[')) {
        if (source[p] === '{') {
          const bg = readBalancedBraces(source, p);
          if (bg) {
            cmdText += '{' + bg.content + '}';
            p = bg.endPos;
          } else break;
        } else if (source[p] === '[') {
          const bk = readBalancedBrackets(source, p);
          if (bk) {
            cmdText += '[' + bk.content + ']';
            p = bk.endPos;
          } else break;
        }
        // Skip whitespace between args
        while (p < source.length && source[p] === ' ') p++;
      }
      preamble += cmdText + '\n';
      pos = p;
    }
  }

  return { preamble: preamble.trim(), macros, environments };
}

// ---------------------------------------------------------------------------
// Macro expansion
// ---------------------------------------------------------------------------

/**
 * Replace #1, #2, ... #9 in template with provided argument values.
 * ## becomes a literal #.
 * @param {string} template
 * @param {string[]} args
 * @returns {string}
 */
export function substituteParams(template, args) {
  return template.replace(/##|#(\d)/g, (match, num) => {
    if (match === '##') return '#';
    const idx = parseInt(num, 10) - 1;
    return idx >= 0 && idx < args.length ? args[idx] : match;
  });
}

/**
 * Read macro arguments from source at pos, according to argSpecs.
 * @param {string} source
 * @param {number} pos
 * @param {Array<{ type: string }>} argSpecs
 * @returns {{ args: string[], endPos: number }}
 */
function readMacroArgs(source, pos, argSpecs) {
  const args = [];
  for (const spec of argSpecs) {
    pos = skipWhitespace(source, pos);
    if (spec.type === 'mandatory') {
      const bg = readBalancedBraces(source, pos);
      if (bg) {
        args.push(bg.content);
        pos = bg.endPos;
      } else {
        args.push('');
      }
    } else if (spec.type === 'optional') {
      const bk = readBalancedBrackets(source, pos);
      if (bk) {
        args.push(bk.content);
        pos = bk.endPos;
      } else {
        args.push('');
      }
    }
  }
  return { args, endPos: pos };
}

/**
 * Find the matching \end{envName} that balances the nesting.
 * @param {string} source
 * @param {number} startPos - Position after \begin{envName} and its arguments
 * @param {string} envName
 * @returns {{ content: string, endPos: number } | null}
 */
function findMatchingEnd(source, startPos, envName) {
  let depth = 1;
  let pos = startPos;
  const beginPattern = '\\begin{' + envName + '}';
  const endPattern = '\\end{' + envName + '}';

  while (pos < source.length && depth > 0) {
    if (source.startsWith(beginPattern, pos)) {
      depth++;
      pos += beginPattern.length;
    } else if (source.startsWith(endPattern, pos)) {
      depth--;
      if (depth === 0) {
        const content = source.substring(startPos, pos);
        return { content, endPos: pos + endPattern.length };
      }
      pos += endPattern.length;
    } else {
      pos++;
    }
  }
  return null;
}

/**
 * Single expansion pass: scan source and expand macros/environments.
 * @param {string} source
 * @param {Map<string, object>} macros
 * @param {Map<string, object>} environments
 * @returns {{ result: string, changed: boolean }}
 */
function expandOnce(source, macros, environments) {
  let result = '';
  let pos = 0;
  let changed = false;

  while (pos < source.length) {
    if (source[pos] !== '\\') {
      result += source[pos];
      pos++;
      continue;
    }

    // Read command name
    const cmd = readCommandName(source, pos + 1);
    if (!cmd) {
      result += source[pos];
      pos++;
      continue;
    }

    // Check for \begin{envName}
    if (cmd.name === 'begin') {
      let p = skipWhitespace(source, cmd.endPos);
      const nameGroup = readBalancedBraces(source, p);
      if (nameGroup && environments.has(nameGroup.content.trim())) {
        const envName = nameGroup.content.trim();
        const envDef = environments.get(envName);
        p = nameGroup.endPos;

        // Read environment arguments
        const { args, endPos: argsEnd } = readMacroArgs(source, p, envDef.argSpecs);

        // Find matching \end{envName}
        const match = findMatchingEnd(source, argsEnd, envName);
        if (match) {
          const beginCode = substituteParams(envDef.beginCode, args);
          const endCode = substituteParams(envDef.endCode, args);
          result += beginCode + match.content + endCode;
          pos = match.endPos;
          changed = true;
          continue;
        }
      }
      // Not a known environment — pass through
      result += '\\' + cmd.name;
      pos = cmd.endPos;
      continue;
    }

    // Check for known macro
    if (macros.has(cmd.name)) {
      const macroDef = macros.get(cmd.name);
      let p = cmd.endPos;

      // Skip spaces after command name (TeX convention)
      while (p < source.length && source[p] === ' ') p++;

      const { args, endPos: argsEnd } = readMacroArgs(source, p, macroDef.argSpecs);
      const expanded = substituteParams(macroDef.body, args);
      result += expanded;
      pos = argsEnd;
      changed = true;
      continue;
    }

    // Not a macro — pass through
    result += '\\' + cmd.name;
    pos = cmd.endPos;
  }

  return { result, changed };
}

/**
 * Expand all macros/environments iteratively until no more changes.
 * @param {string} source
 * @param {Map<string, object>} macros
 * @param {Map<string, object>} environments
 * @param {number} [maxPasses=20]
 * @returns {string}
 */
export function expandMacros(source, macros, environments, maxPasses = 20) {
  for (let i = 0; i < maxPasses; i++) {
    const { result, changed } = expandOnce(source, macros, environments);
    if (!changed) break;
    source = result;
  }
  return source;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract template name from \documentclass[templateName]{ltc-guji}.
 * @param {string} texSource
 * @returns {string|null}
 */
export function extractTemplateName(texSource) {
  const match = texSource.match(/\\documentclass\s*\[([^\]]*)\]\s*\{[^}]*\}/);
  return match ? match[1].trim() : null;
}

/**
 * Preprocess TeX source with .cfg macro definitions.
 * @param {string} texSource
 * @param {string} cfgSource
 * @returns {string} Expanded TeX source
 */
export function preprocessWithCfg(texSource, cfgSource) {
  const { preamble, macros, environments } = parseCfg(cfgSource);

  // Insert preamble commands after \documentclass line (if present)
  let combined = texSource;
  if (preamble) {
    const dcMatch = combined.match(/\\documentclass\s*(\[[^\]]*\])?\s*\{[^}]*\}/);
    if (dcMatch) {
      const insertPos = dcMatch.index + dcMatch[0].length;
      combined = combined.substring(0, insertPos) + '\n' + preamble + '\n' + combined.substring(insertPos);
    } else {
      combined = preamble + '\n' + combined;
    }
  }

  // Expand macros if any were defined
  if (macros.size > 0 || environments.size > 0) {
    combined = expandMacros(combined, macros, environments);
  }

  return combined;
}
