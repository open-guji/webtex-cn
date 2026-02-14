import { describe, it, expect } from 'vitest';
import { parse, NodeType } from '../src/parser/index.js';

describe('Parser', () => {
  it('parses documentclass with template', () => {
    const { ast } = parse('\\documentclass[四库全书]{ltc-guji}');
    expect(ast.documentClass).toBe('ltc-guji');
    expect(ast.template).toBe('四库全书');
  });

  it('parses title and chapter', () => {
    const { ast } = parse('\\title{钦定四库全书}\n\\chapter{史记卷一}');
    expect(ast.title).toBe('钦定四库全书');
    expect(ast.chapter).toBe('史记卷一');
  });

  it('parses \\begin{document}...\\end{document}', () => {
    const { ast } = parse('\\begin{document}hello\\end{document}');
    expect(ast.children.length).toBe(1);
    expect(ast.children[0].type).toBe('body');
    expect(ast.children[0].children[0].type).toBe(NodeType.TEXT);
    expect(ast.children[0].children[0].value).toBe('hello');
  });

  it('parses 正文 environment', () => {
    const { ast } = parse('\\begin{document}\\begin{正文}天地玄黄\\end{正文}\\end{document}');
    const body = ast.children[0];
    expect(body.children[0].type).toBe(NodeType.CONTENT_BLOCK);
    expect(body.children[0].children[0].type).toBe(NodeType.TEXT);
    expect(body.children[0].children[0].value).toBe('天地玄黄');
  });

  it('parses \\\\ as newline node', () => {
    const { ast } = parse('\\begin{document}天地\\\\玄黄\\end{document}');
    const body = ast.children[0];
    expect(body.children[0].type).toBe(NodeType.TEXT);
    expect(body.children[1].type).toBe(NodeType.NEWLINE);
    expect(body.children[2].type).toBe(NodeType.TEXT);
  });

  it('parses 段落 with options', () => {
    const { ast } = parse('\\begin{document}\\begin{段落}[indent=2]天地\\end{段落}\\end{document}');
    const body = ast.children[0];
    const para = body.children[0];
    expect(para.type).toBe(NodeType.PARAGRAPH);
    expect(para.options.indent).toBe('2');
    expect(para.children[0].value).toBe('天地');
  });

  it('parses 夹注 command', () => {
    const { ast } = parse('\\begin{document}黄帝\\夹注{集解徐廣曰}少典\\end{document}');
    const body = ast.children[0];
    expect(body.children[0].type).toBe(NodeType.TEXT);
    expect(body.children[0].value).toBe('黄帝');
    expect(body.children[1].type).toBe(NodeType.JIAZHU);
    expect(body.children[1].children[0].value).toBe('集解徐廣曰');
    expect(body.children[2].type).toBe(NodeType.TEXT);
    expect(body.children[2].value).toBe('少典');
  });

  it('parses 侧批 command', () => {
    const { ast } = parse('\\begin{document}\\侧批[yoffset=10pt]{批注文字}\\end{document}');
    const body = ast.children[0];
    const sn = body.children[0];
    expect(sn.type).toBe(NodeType.SIDENOTE);
    expect(sn.options.yoffset).toBe('10pt');
    expect(sn.children[0].value).toBe('批注文字');
  });

  it('parses 批注 command', () => {
    const { ast } = parse('\\begin{document}\\批注[x=5cm, y=2cm]{注释内容}\\end{document}');
    const body = ast.children[0];
    const pz = body.children[0];
    expect(pz.type).toBe(NodeType.PIZHU);
    expect(pz.options.x).toBe('5cm');
    expect(pz.options.y).toBe('2cm');
  });

  it('parses 空格 command', () => {
    const { ast } = parse('\\begin{document}hello\\空格[3]world\\end{document}');
    const body = ast.children[0];
    expect(body.children[1].type).toBe(NodeType.SPACE);
    expect(body.children[1].value).toBe('3');
  });

  it('parses 平抬 with default option', () => {
    const { ast } = parse('\\begin{document}\\平抬\\end{document}');
    const body = ast.children[0];
    expect(body.children[0].type).toBe(NodeType.TAITOU);
    expect(body.children[0].value).toBe('0');
  });

  it('ignores usepackage', () => {
    const { ast } = parse('\\usepackage{tikz}\n\\begin{document}hello\\end{document}');
    const body = ast.children[0];
    expect(body.children[0].type).toBe(NodeType.TEXT);
    expect(body.children[0].value).toBe('hello');
  });

  it('collects setup commands', () => {
    const { ast } = parse('\\contentSetup{font-size=28pt, n-column=8}');
    expect(ast.setupCommands.length).toBe(1);
    expect(ast.setupCommands[0].setupType).toBe('content');
    expect(ast.setupCommands[0].params['font-size']).toBe('28pt');
    expect(ast.setupCommands[0].params['n-column']).toBe('8');
  });

  it('handles unknown commands gracefully', () => {
    const { ast } = parse('\\begin{document}\\unknownCmd{content}rest\\end{document}');
    const body = ast.children[0];
    // Unknown command content preserved as text
    expect(body.children.length).toBeGreaterThanOrEqual(1);
  });

  it('parses a complete example', () => {
    const tex = `
\\documentclass[四库全书]{ltc-guji}
\\title{钦定四库全书}
\\chapter{史记卷一}
\\begin{document}
\\begin{正文}
黄帝者\\夹注{集解徐廣曰}少典之子\\\\
\\begin{段落}[indent=2]
天地玄黄
\\end{段落}
\\侧批{侧批内容}
\\end{正文}
\\end{document}
`;
    const { ast, warnings } = parse(tex);
    expect(ast.template).toBe('四库全书');
    expect(ast.title).toBe('钦定四库全书');
    expect(ast.chapter).toBe('史记卷一');

    const body = ast.children[0];
    expect(body.type).toBe('body');

    const content = body.children[0];
    expect(content.type).toBe(NodeType.CONTENT_BLOCK);
    expect(content.children.length).toBeGreaterThan(0);
  });

  it('parses 列表 with items', () => {
    const tex = '\\begin{document}\\begin{列表}\\item 第一项\\item 第二项\\end{列表}\\end{document}';
    const { ast } = parse(tex);
    const body = ast.children[0];
    const list = body.children[0];
    expect(list.type).toBe(NodeType.LIST);
    expect(list.children.length).toBe(2);
    expect(list.children[0].type).toBe(NodeType.LIST_ITEM);
    expect(list.children[1].type).toBe(NodeType.LIST_ITEM);
  });
});

describe('parseKeyValue', () => {
  it('parses simple key=value pairs', () => {
    const { parseKeyValue } = require('../src/model/nodes.js');
    const result = parseKeyValue('indent=2, first-indent=0');
    expect(result.indent).toBe('2');
    expect(result['first-indent']).toBe('0');
  });

  it('handles nested braces', () => {
    const { parseKeyValue } = require('../src/model/nodes.js');
    const result = parseKeyValue('color={180, 95, 75}, size=12pt');
    expect(result.color).toBe('{180, 95, 75}');
    expect(result.size).toBe('12pt');
  });

  it('handles boolean flags', () => {
    const { parseKeyValue } = require('../src/model/nodes.js');
    const result = parseKeyValue('border, debug');
    expect(result.border).toBe('true');
    expect(result.debug).toBe('true');
  });
});

describe('Error handling', () => {
  it('warns on unknown command', () => {
    const { warnings } = parse('\\begin{document}\\unknownCmd{test}\\end{document}');
    expect(warnings.some(w => w.includes('Unknown command'))).toBe(true);
  });

  it('warns on unknown environment', () => {
    const { warnings } = parse('\\begin{document}\\begin{未知环境}test\\end{未知环境}\\end{document}');
    expect(warnings.some(w => w.includes('Unknown environment'))).toBe(true);
  });

  it('warns on unclosed environment', () => {
    const { warnings } = parse('\\begin{document}\\begin{正文}text');
    expect(warnings.some(w => w.includes('Unclosed environment'))).toBe(true);
  });

  it('recovers from unknown commands and still renders content', () => {
    const { ast, warnings } = parse('\\begin{document}\\begin{正文}hello\\unknownCmd{world}bye\\end{正文}\\end{document}');
    expect(warnings.length).toBeGreaterThan(0);
    // Should still have a content block with text
    const body = ast.children[0];
    expect(body.children.length).toBeGreaterThan(0);
  });
});
