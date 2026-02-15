import { describe, it, expect } from 'vitest';
import {
  readBalancedBraces,
  readBalancedBrackets,
  parseArgSpec,
  parseCfg,
  substituteParams,
  expandMacros,
  preprocessWithCfg,
  extractTemplateName,
} from '../src/parser/macros.js';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('macros.js — readBalancedBraces', () => {
  it('reads simple brace group', () => {
    const r = readBalancedBraces('{hello}', 0);
    expect(r.content).toBe('hello');
    expect(r.endPos).toBe(7);
  });

  it('reads nested braces', () => {
    const r = readBalancedBraces('{a {b} c}', 0);
    expect(r.content).toBe('a {b} c');
  });

  it('handles escaped braces', () => {
    const r = readBalancedBraces('{a \\{ b \\} c}', 0);
    expect(r.content).toBe('a \\{ b \\} c');
  });

  it('reads from offset', () => {
    const r = readBalancedBraces('xxx{content}yyy', 3);
    expect(r.content).toBe('content');
    expect(r.endPos).toBe(12);
  });

  it('returns null if no opening brace', () => {
    expect(readBalancedBraces('hello', 0)).toBeNull();
  });
});

describe('macros.js — readBalancedBrackets', () => {
  it('reads simple bracket group', () => {
    const r = readBalancedBrackets('[hello]', 0);
    expect(r.content).toBe('hello');
  });

  it('returns null if no opening bracket', () => {
    expect(readBalancedBrackets('{hello}', 0)).toBeNull();
  });

  it('handles nested brackets', () => {
    const r = readBalancedBrackets('[a [b] c]', 0);
    expect(r.content).toBe('a [b] c');
  });
});

describe('macros.js — parseArgSpec', () => {
  it('parses empty spec', () => {
    expect(parseArgSpec('')).toEqual([]);
    expect(parseArgSpec('  ')).toEqual([]);
  });

  it('parses m', () => {
    expect(parseArgSpec('m')).toEqual([{ type: 'mandatory', long: false }]);
  });

  it('parses +m', () => {
    expect(parseArgSpec('+m')).toEqual([{ type: 'mandatory', long: true }]);
  });

  it('parses o', () => {
    expect(parseArgSpec('o')).toEqual([{ type: 'optional', long: false }]);
  });

  it('parses o m', () => {
    expect(parseArgSpec('o m')).toEqual([
      { type: 'optional', long: false },
      { type: 'mandatory', long: false },
    ]);
  });

  it('parses o +m', () => {
    expect(parseArgSpec('o +m')).toEqual([
      { type: 'optional', long: false },
      { type: 'mandatory', long: true },
    ]);
  });
});

describe('macros.js — substituteParams', () => {
  it('substitutes #1', () => {
    expect(substituteParams('hello #1 world', ['foo'])).toBe('hello foo world');
  });

  it('substitutes multiple params', () => {
    expect(substituteParams('#1 and #2', ['A', 'B'])).toBe('A and B');
  });

  it('preserves ##', () => {
    expect(substituteParams('## is literal', [])).toBe('# is literal');
  });

  it('leaves unmatched #N', () => {
    expect(substituteParams('#3', ['A'])).toBe('#3');
  });
});

describe('macros.js — parseCfg', () => {
  it('parses simple command macro', () => {
    const cfg = '\\NewDocumentCommand{\\foo}{m}{hello #1}';
    const { macros } = parseCfg(cfg);
    expect(macros.has('foo')).toBe(true);
    const m = macros.get('foo');
    expect(m.argSpecs).toEqual([{ type: 'mandatory', long: false }]);
    expect(m.body).toBe('hello #1');
  });

  it('parses CJK command macro', () => {
    const cfg = '\\NewDocumentCommand{\\注}{ +m }{\\begin{段落}[indent=2]\\夹注{#1}\\end{段落}}';
    const { macros } = parseCfg(cfg);
    expect(macros.has('注')).toBe(true);
    const m = macros.get('注');
    expect(m.argSpecs).toEqual([{ type: 'mandatory', long: true }]);
    expect(m.body).toContain('\\begin{段落}');
    expect(m.body).toContain('#1');
  });

  it('parses no-arg macro', () => {
    const cfg = '\\NewDocumentCommand{\\國朝}{}{\\相对抬头[1]{國朝}}';
    const { macros } = parseCfg(cfg);
    expect(macros.has('國朝')).toBe(true);
    const m = macros.get('國朝');
    expect(m.argSpecs).toEqual([]);
    expect(m.body).toBe('\\相对抬头[1]{國朝}');
  });

  it('parses environment definition', () => {
    const cfg = '\\NewDocumentEnvironment{按环境}{}{\\begin{段落}[indent=4]}{\\end{段落}}';
    const { environments } = parseCfg(cfg);
    expect(environments.has('按环境')).toBe(true);
    const env = environments.get('按环境');
    expect(env.argSpecs).toEqual([]);
    expect(env.beginCode).toBe('\\begin{段落}[indent=4]');
    expect(env.endCode).toBe('\\end{段落}');
  });

  it('extracts preamble commands', () => {
    const cfg = '\\gujiSetup{template=SiKuQuanShu-colored}\n\\NewDocumentCommand{\\foo}{}{bar}';
    const { preamble, macros } = parseCfg(cfg);
    expect(preamble).toContain('\\gujiSetup{template=SiKuQuanShu-colored}');
    expect(macros.has('foo')).toBe(true);
  });

  it('strips comments', () => {
    const cfg = '% this is a comment\n\\NewDocumentCommand{\\foo}{}{bar}';
    const { macros } = parseCfg(cfg);
    expect(macros.has('foo')).toBe(true);
  });

  it('stops at \\endinput', () => {
    const cfg = '\\NewDocumentCommand{\\foo}{}{bar}\n\\endinput\n\\NewDocumentCommand{\\baz}{}{qux}';
    const { macros } = parseCfg(cfg);
    expect(macros.has('foo')).toBe(true);
    expect(macros.has('baz')).toBe(false);
  });

  it('handles line-continuation comments in body', () => {
    const cfg = '\\NewDocumentCommand{\\foo}{ +m }{%\n  hello #1%\n}';
    const { macros } = parseCfg(cfg);
    expect(macros.get('foo').body).toBe('hello #1');
  });
});

describe('macros.js — expandMacros', () => {
  it('expands simple command', () => {
    const macros = new Map([['foo', { name: 'foo', argSpecs: [], body: 'bar baz' }]]);
    // TeX convention: trailing space after command name is consumed
    const result = expandMacros('hello \\foo world', macros, new Map());
    expect(result).toBe('hello bar bazworld');
  });

  it('expands command with mandatory arg', () => {
    const macros = new Map([['wrap', { name: 'wrap', argSpecs: [{ type: 'mandatory' }], body: '[#1]' }]]);
    const result = expandMacros('\\wrap{content}', macros, new Map());
    expect(result).toBe('[content]');
  });

  it('expands command with nested braces in arg', () => {
    const macros = new Map([['wrap', { name: 'wrap', argSpecs: [{ type: 'mandatory' }], body: '(#1)' }]]);
    const result = expandMacros('\\wrap{a {b} c}', macros, new Map());
    expect(result).toBe('(a {b} c)');
  });

  it('expands environment', () => {
    const envs = new Map([['myenv', { name: 'myenv', argSpecs: [], beginCode: '<BEGIN>', endCode: '<END>' }]]);
    const result = expandMacros('\\begin{myenv}content\\end{myenv}', new Map(), envs);
    expect(result).toBe('<BEGIN>content<END>');
  });

  it('handles nested macros (multi-pass)', () => {
    const macros = new Map([
      ['inner', { name: 'inner', argSpecs: [], body: 'INNER' }],
      ['outer', { name: 'outer', argSpecs: [], body: '\\inner' }],
    ]);
    const result = expandMacros('\\outer', macros, new Map());
    expect(result).toBe('INNER');
  });

  it('expands \\按 → \\begin{按环境} → expanded env', () => {
    const macros = new Map([
      ['按', { name: '按', argSpecs: [{ type: 'mandatory', long: true }], body: '\\begin{按环境}#1\\end{按环境}' }],
    ]);
    const envs = new Map([
      ['按环境', { name: '按环境', argSpecs: [], beginCode: '<PARA><JZ>', endCode: '</JZ></PARA>' }],
    ]);
    const result = expandMacros('\\按{hello world}', macros, envs);
    expect(result).toBe('<PARA><JZ>hello world</JZ></PARA>');
  });

  it('preserves non-macro backslash commands', () => {
    const macros = new Map([['foo', { name: 'foo', argSpecs: [], body: 'FOO' }]]);
    // Space after \foo is consumed (TeX convention), space after \bar preserved
    const result = expandMacros('\\bar \\foo \\baz', macros, new Map());
    expect(result).toBe('\\bar FOO\\baz');
  });

  it('stops at maxPasses', () => {
    // Self-referencing macro (would loop forever)
    const macros = new Map([['loop', { name: 'loop', argSpecs: [], body: 'x\\loop' }]]);
    const result = expandMacros('\\loop', macros, new Map(), 3);
    // After 3 passes, should have expanded 3 times
    expect(result.startsWith('xxx')).toBe(true);
  });
});

describe('macros.js — extractTemplateName', () => {
  it('extracts template name', () => {
    expect(extractTemplateName('\\documentclass[四库全书文渊阁简明目录]{ltc-guji}'))
      .toBe('四库全书文渊阁简明目录');
  });

  it('returns null with no template', () => {
    expect(extractTemplateName('\\documentclass{ltc-guji}')).toBeNull();
  });

  it('handles whitespace', () => {
    expect(extractTemplateName('\\documentclass [ mytemplate ] { ltc-guji }'))
      .toBe('mytemplate');
  });
});

describe('macros.js — preprocessWithCfg', () => {
  it('prepends preamble and expands macros', () => {
    const cfg = '\\gujiSetup{template=colored}\n\\NewDocumentCommand{\\foo}{}{BAR}';
    const tex = '\\documentclass[test]{ltc-guji}\nhello \\foo world';
    const result = preprocessWithCfg(tex, cfg);
    expect(result).toContain('\\gujiSetup{template=colored}');
    // Space after \foo consumed (TeX convention)
    expect(result).toContain('hello BARworld');
    expect(result).not.toContain('\\foo');
  });
});

describe('macros.js — real .cfg file', () => {
  const cfgPath = join(__dirname, '..', 'examples', '四库全书文渊阁简明目录.cfg');
  let cfgSource;

  try {
    cfgSource = readFileSync(cfgPath, 'utf8');
  } catch {
    // Skip if file not found
  }

  it('parses the real .cfg file', () => {
    if (!cfgSource) return;
    const { preamble, macros, environments } = parseCfg(cfgSource);
    expect(preamble).toContain('\\gujiSetup');
    expect(macros.has('注')).toBe(true);
    expect(macros.has('按')).toBe(true);
    expect(macros.has('國朝')).toBe(true);
    expect(environments.has('按环境')).toBe(true);
  });

  it('expands \\注{text}', () => {
    if (!cfgSource) return;
    const { macros, environments } = parseCfg(cfgSource);
    const result = expandMacros('\\注{test content}', macros, environments);
    expect(result).toContain('\\begin{段落}');
    expect(result).toContain('\\夹注');
    expect(result).toContain('test content');
    expect(result).toContain('\\end{段落}');
  });

  it('expands \\按{text} (nested env + macro)', () => {
    if (!cfgSource) return;
    const { macros, environments } = parseCfg(cfgSource);
    const result = expandMacros('\\按{test content}', macros, environments);
    expect(result).toContain('\\begin{段落}');
    expect(result).toContain('\\begin{夹注环境}');
    expect(result).toContain('test content');
    expect(result).toContain('\\end{夹注环境}');
    expect(result).toContain('\\end{段落}');
  });

  it('expands \\國朝 (no args)', () => {
    if (!cfgSource) return;
    const { macros, environments } = parseCfg(cfgSource);
    const result = expandMacros('\\國朝 text', macros, environments);
    expect(result).toContain('\\相对抬头[1]{國朝}');
  });
});
