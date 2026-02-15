import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';
import { layout } from '../src/layout/grid-layout.js';
import { HTMLRenderer } from '../src/renderer/html-renderer.js';
import { renderToHTML, renderToPage } from '../src/index.js';

function renderTex(tex) {
  const { ast } = parse(tex);
  const layoutResult = layout(ast);
  const renderer = new HTMLRenderer(ast);
  return renderer.renderFromLayout(layoutResult).join('\n');
}

describe('HTMLRenderer', () => {
  it('renders plain text in content block', () => {
    const html = renderTex('\\begin{document}\\begin{正文}天地玄黄\\end{正文}\\end{document}');
    expect(html).toContain('天地玄黄');
    expect(html).toContain('wtc-content');
  });

  it('renders text across columns after newline', () => {
    const html = renderTex('\\begin{document}\\begin{正文}天地\\\\玄黄\\end{正文}\\end{document}');
    expect(html).toContain('天地');
    expect(html).toContain('玄黄');
  });

  it('renders jiazhu as two columns', () => {
    const html = renderTex('\\begin{document}\\begin{正文}黄帝\\夹注{集解徐廣曰號有熊}者\\end{正文}\\end{document}');
    expect(html).toContain('wtc-jiazhu');
    expect(html).toContain('wtc-jiazhu-col');
    // Should have two columns
    const colCount = (html.match(/wtc-jiazhu-col"/g) || []).length;
    expect(colCount).toBe(2);
  });

  it('renders sidenote', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\侧批{批注}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-sidenote');
    expect(html).toContain('批注');
  });

  it('renders pizhu with position', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\批注[x=5cm, y=2cm]{浮动注}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-pizhu');
    expect(html).toContain('right: 5cm');
    expect(html).toContain('top: 2cm');
  });

  it('renders space as fullwidth spaces', () => {
    const html = renderTex('\\begin{document}\\begin{正文}hello\\空格[3]world\\end{正文}\\end{document}');
    expect(html).toContain('\u3000\u3000\u3000');
  });

  it('renders paragraph with indent', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\begin{段落}[indent=2]天地\\end{段落}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-indent-spacer');
    expect(html).toContain('--wtc-indent-size: calc(2 * var(--wtc-grid-height))');
    expect(html).toContain('天地');
  });

  it('renders emphasis', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\圈点{重要}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-emphasis');
    expect(html).toContain('重要');
  });

  it('renders inverted text', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\反白{卷一}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-inverted');
    expect(html).toContain('卷一');
  });

  it('renders banxin when title/chapter present', () => {
    const html = renderTex('\\title{钦定四库全书}\\chapter{史记卷一}\\begin{document}\\begin{正文}内容\\end{正文}\\end{document}');
    expect(html).toContain('wtc-banxin');
    expect(html).toContain('史记卷一');
  });

  it('renders full standalone page via renderToPage', () => {
    const page = renderToPage('\\documentclass[四库全书]{ltc-guji}\\title{测试}\\begin{document}\\begin{正文}内容\\end{正文}\\end{document}');
    expect(page).toContain('<!DOCTYPE html>');
    expect(page).toContain('base.css');
    expect(page).toContain('siku-quanshu');
  });

  it('parses color formats correctly', () => {
    const { ast } = parse('');
    const r = new HTMLRenderer(ast);
    expect(r.parseColor('red')).toBe('red');
    expect(r.parseColor('1 0 0')).toBe('rgb(255, 0, 0)');
    expect(r.parseColor('{180, 95, 75}')).toBe('rgb(180, 95, 75)');
  });

  it('renders proper name (专名号)', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\专名号{司马迁}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-proper-name');
    expect(html).toContain('司马迁');
  });

  it('renders book title mark (书名号)', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\书名号{史记}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-book-title-mark');
    expect(html).toContain('史记');
  });

  it('renders circled text', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\带圈{壹}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-circled');
    expect(html).toContain('壹');
  });

  it('renders list with items', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\begin{列表}\\item 一\\item 二\\end{列表}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-list');
    expect(html).toContain('wtc-list-item');
    expect(html).toContain('一');
    expect(html).toContain('二');
  });

  it('renders meipi (眉批)', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\眉批[x=2cm]{眉批内容}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-meipi');
    expect(html).toContain('right: 2cm');
    expect(html).toContain('眉批内容');
  });

  it('handles empty jiazhu gracefully', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\夹注{}\\end{正文}\\end{document}');
    expect(html).toContain('wtc-jiazhu');
  });

  it('escapes HTML special characters in text', () => {
    const html = renderTex('\\begin{document}\\begin{正文}a<b>c&d\\end{正文}\\end{document}');
    expect(html).toContain('&lt;');
    expect(html).toContain('&gt;');
    expect(html).toContain('&amp;');
    expect(html).not.toContain('<b>');
  });

  it('renders column break (text after \\换行 appears)', () => {
    const html = renderTex('\\begin{document}\\begin{正文}天\\换行{}地\\end{正文}\\end{document}');
    expect(html).toContain('天');
    expect(html).toContain('地');
  });

  it('selects honglou template correctly', () => {
    const { ast } = parse('\\documentclass[红楼梦甲戌本]{ltc-guji}');
    const renderer = new HTMLRenderer(ast);
    expect(renderer.templateId).toBe('honglou');
  });

  it('defaults to siku-quanshu template', () => {
    const { ast } = parse('\\documentclass{ltc-guji}');
    const renderer = new HTMLRenderer(ast);
    expect(renderer.templateId).toBe('siku-quanshu');
  });

  it('applies setup command overrides as CSS variables', () => {
    const html = renderTex('\\contentSetup{font-size=18px}\\begin{document}\\begin{正文}text\\end{正文}\\end{document}');
    expect(html).toContain('--wtc-font-size: 18px');
  });

  it('renders banxin with both title and chapter', () => {
    const html = renderTex('\\title{钦定四库全书}\\chapter{史记卷一}\\begin{document}\\begin{正文}内容\\end{正文}\\end{document}');
    expect(html).toContain('wtc-banxin-book-name');
    expect(html).toContain('钦定四库全书');
    expect(html).toContain('wtc-banxin-chapter');
    expect(html).toContain('史记卷一');
  });

  it('renders dual half-page layout', () => {
    const html = renderTex('\\begin{document}\\begin{正文}内容\\end{正文}\\end{document}');
    expect(html).toContain('wtc-half-right');
    expect(html).toContain('wtc-half-left');
  });

  it('renders taitou with data-level attribute', () => {
    const html = renderTex('\\begin{document}\\begin{正文}text\\单抬 more\\end{正文}\\end{document}');
    expect(html).toContain('data-level="1"');
  });

  it('renders sidenote with yoffset', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\侧批[yoffset=1em]{批}\\end{正文}\\end{document}');
    expect(html).toContain('margin-block-start: 1em');
  });

  it('renders meipi with height', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\眉批[x=1cm, height=5cm]{眉批}\\end{正文}\\end{document}');
    expect(html).toContain('height: 5cm');
  });

  it('splits jiazhu with inward alignment', () => {
    const tex = '\\begin{document}\\begin{正文}\\夹注[align=inward]{七个字的文本串}\\end{正文}\\end{document}';
    const html = renderTex(tex);
    expect(html).toContain('wtc-jiazhu');
    // inward: floor(7/2) = 3 chars in col1, 4 chars in col2
    expect(html).toContain('七个字');
    expect(html).toContain('的文本串');
  });

  it('renders textbox with border option', () => {
    const html = renderTex('\\begin{document}\\begin{正文}\\文本框[height=3, border]{框内}\\end{正文}\\end{document}');
    expect(html).toContain('border: 1px solid');
  });

  it('gujiSetup overrides template', () => {
    const { ast } = parse('\\documentclass[四库全书]{ltc-guji}\\gujiSetup{template=红楼梦甲戌本}');
    const renderer = new HTMLRenderer(ast);
    expect(renderer.templateId).toBe('honglou');
  });

  it('renders inline math', () => {
    const html = renderTex('\\begin{document}\\begin{正文}$x^2 + y^2 = z^2$\\end{正文}\\end{document}');
    expect(html).toContain('wtc-math');
    expect(html).toContain('x^2 + y^2 = z^2');
  });

  it('renders paragraph break (text after empty line appears)', () => {
    const html = renderTex('\\begin{document}\\begin{正文}first\n\nsecond\\end{正文}\\end{document}');
    expect(html).toContain('first');
    expect(html).toContain('second');
  });
});
