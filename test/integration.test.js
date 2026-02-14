import { describe, it, expect } from 'vitest';
import { renderToHTML } from '../src/index.js';
import { parse } from '../src/parser/index.js';
import { HTMLRenderer } from '../src/renderer/html-renderer.js';

describe('Integration: full TeX to HTML pipeline', () => {
  const shiji = `
\\documentclass[四库全书]{ltc-guji}
\\title{欽定四庫全書}
\\chapter{史記\\\\卷一}
\\begin{document}
\\begin{正文}
欽定四庫全書

\\begin{列表}
    \\item 史記卷一
    \\item 五帝本紀第一
\\end{列表}

\\begin{段落}[indent=3]
\\夹注{集解裴駰曰凡是徐氏義稱徐姓名以别之餘者悉是駰註解并集衆家義索隠紀者記也本其事而記之故曰本紀又紀理也}
\\end{段落}

黄帝者\\夹注{集解徐廣曰號有熊索隠按有土徳之瑞土色黄故稱黄帝}少典之子\\夹注{集解譙周曰有熊國君少典之子也}姓公孫名曰軒轅

\\侧批{侧批内容}

\\批注[x=5cm, y=2cm]{浮动批注}

\\end{正文}
\\end{document}
`;

  it('renders complete Shiji example without errors', () => {
    const html = renderToHTML(shiji);
    expect(html).toBeTruthy();
    expect(html.length).toBeGreaterThan(100);
  });

  it('contains all major sections', () => {
    const html = renderToHTML(shiji);
    // Content block
    expect(html).toContain('wtc-content');
    // Banxin
    expect(html).toContain('wtc-banxin');
    // Jiazhu
    expect(html).toContain('wtc-jiazhu');
    // Sidenote
    expect(html).toContain('wtc-sidenote');
    // Pizhu
    expect(html).toContain('wtc-pizhu');
    // List
    expect(html).toContain('wtc-list');
    // Paragraph
    expect(html).toContain('wtc-paragraph');
  });

  it('preserves Chinese text content', () => {
    const html = renderToHTML(shiji);
    expect(html).toContain('黄帝者');
    expect(html).toContain('少典之子');
    expect(html).toContain('姓公孫名曰軒轅');
    expect(html).toContain('史記卷一');
  });

  it('splits jiazhu into two columns', () => {
    const html = renderToHTML(shiji);
    const colMatches = html.match(/wtc-jiazhu-col/g);
    // At least 2 jiazhu nodes x 2 columns = 4+ matches
    expect(colMatches.length).toBeGreaterThanOrEqual(4);
  });

  it('extracts document metadata', () => {
    const { ast } = parse(shiji);
    expect(ast.template).toBe('四库全书');
    expect(ast.title).toBe('欽定四庫全書');
    expect(ast.documentClass).toBe('ltc-guji');
  });

  it('renders pizhu with absolute positioning', () => {
    const html = renderToHTML(shiji);
    expect(html).toContain('right: 5cm');
    expect(html).toContain('top: 2cm');
  });

  it('renders paragraph with indent', () => {
    const html = renderToHTML(shiji);
    expect(html).toContain('wtc-paragraph-indent');
    expect(html).toContain('--wtc-paragraph-indent: calc(3 * var(--wtc-grid-height))');
    expect(html).toContain('--wtc-paragraph-indent-height: calc((var(--wtc-n-rows) - 3) * var(--wtc-grid-height))');
  });

  const showcase = `
\\documentclass[四库全书彩色]{ltc-guji}
\\title{展示}
\\chapter{功能}
\\begin{document}
\\begin{正文}
\\圈点{重要}文字
\\专名号{人名}测试
\\书名号{书名}测试
\\反白{反白}效果
\\带圈{壹}数字
\\空格[2]间隔
\\end{正文}
\\end{document}
`;

  it('renders decoration elements', () => {
    const html = renderToHTML(showcase);
    expect(html).toContain('wtc-emphasis');
    expect(html).toContain('wtc-proper-name');
    expect(html).toContain('wtc-book-title-mark');
    expect(html).toContain('wtc-inverted');
    expect(html).toContain('wtc-circled');
    // Fullwidth spaces
    expect(html).toContain('\u3000\u3000');
  });

  it('selects correct template CSS', () => {
    const { ast } = parse(showcase);
    const renderer = new HTMLRenderer(ast);
    expect(renderer.templateId).toBe('siku-quanshu-colored');
  });

  it('handles empty content gracefully', () => {
    const html = renderToHTML('\\begin{document}\\end{document}');
    // Layout pipeline always produces at least one page
    expect(html).toContain('wtc-page');
    expect(html).toContain('wtc-content');
  });

  it('handles file with only preamble', () => {
    const html = renderToHTML('\\documentclass{ltc-guji}\\title{Test}');
    expect(html).toContain('wtc-page');
  });

  it('getTemplates returns available templates', async () => {
    const { getTemplates } = await import('../src/index.js');
    const templates = getTemplates();
    expect(templates.length).toBe(4);
    expect(templates[0].id).toBe('siku-quanshu');
    expect(templates.some(t => t.id === 'honglou')).toBe(true);
    expect(templates.some(t => t.id === 'minimal')).toBe(true);
  });

  it('setup commands are applied to HTML output', () => {
    const tex = `
\\documentclass[四库全书]{ltc-guji}
\\contentSetup{font-size=16px, line-height=2.2}
\\jiazhuSetup{color=blue}
\\title{Test}
\\chapter{Ch}
\\begin{document}
\\begin{正文}
测试
\\end{正文}
\\end{document}
`;
    const html = renderToHTML(tex);
    expect(html).toContain('--wtc-font-size: 16px');
    expect(html).toContain('--wtc-line-height: 2.2');
    expect(html).toContain('--wtc-jiazhu-color: blue');
  });

  it('renderToDOM includes data-template attribute', () => {
    // Since we can't fully test DOM in Node, verify the renderer sets templateId correctly
    const { ast } = parse('\\documentclass[红楼梦甲戌本]{ltc-guji}\\begin{document}\\begin{正文}text\\end{正文}\\end{document}');
    const renderer = new HTMLRenderer(ast);
    expect(renderer.templateId).toBe('honglou');
    const page = renderer.renderPage();
    expect(page).toContain('data-template="honglou"');
  });
});
