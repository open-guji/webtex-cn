import { parse } from '../src/parser/index.js';
import { layout } from '../src/layout/grid-layout.js';
import { HTMLRenderer } from '../src/renderer/html-renderer.js';
import { resolveConfig } from '../src/model/config.js';
import { describe, it, expect } from 'vitest';

describe('Digital Layout Support', () => {
    it('should handle Banxin environment correctly', () => {
        const tex = `
\\begin{Banxin}
\\BanxinUpper{Test Title}
\\BanxinChapter{Chapter 1}
\\BanxinPageNumber{123}
\\BanxinLower{Bottom Note}
\\UpperYuwei
\\LowerYuwei
\\end{Banxin}
Text.
`;
        const { ast } = parse(tex);
        const layoutResult = layout(ast);
        const renderer = new HTMLRenderer(ast);
        const htmls = renderer.renderFromLayout(layoutResult);

        expect(htmls[0]).toContain('Test Title');
        expect(htmls[0]).toContain('Chapter 1');
        expect(htmls[0]).toContain('123');
        expect(htmls[0]).toContain('Bottom Note');
        expect(htmls[0]).toContain('wtc-yuwei-upper');
        expect(htmls[0]).toContain('wtc-yuwei-lower');
    });

    it('should handle DigitalContent environment with explicit line breaks', () => {
        // In guji-digital TeX, each column is separated by \\\\ (forced newline)
        const tex = `
\\begin{DigitalContent}
AB\\\\CD\\\\EF
\\end{DigitalContent}
`;
        const { ast } = parse(tex);
        const layoutResult = layout(ast);

        // In DigitalContent, each NEWLINE (\\\\) triggers advanceColumn().
        // So "AB" is in col 0, "CD" in col 1, "EF" in col 2.
        const page = layoutResult.pages[0];
        const textItems = page.items.filter(item => item.node.type === 'text');

        // The columns should differ across line breaks
        const cols = new Set(textItems.map(item => item.col));
        expect(cols.size).toBeGreaterThanOrEqual(3);
    });

    it('should handle DigitalContent environment with \\\\换行 line breaks', () => {
        const tex = `
\\begin{DigitalContent}
AB\\换行 CD\\换行 EF
\\end{DigitalContent}
`;
        const { ast } = parse(tex);
        const layoutResult = layout(ast);

        const page = layoutResult.pages[0];
        const textItems = page.items.filter(item => item.node.type === 'text');

        const cols = new Set(textItems.map(item => item.col));
        expect(cols.size).toBeGreaterThanOrEqual(3);
    });

    it('should parse \\\\换页 as alias for \\\\newpage', () => {
        const tex = `Text before\\换页 Text after`;
        const { ast } = parse(tex);
        const layoutResult = layout(ast);

        // Should produce more than one page
        expect(layoutResult.pages.length).toBeGreaterThanOrEqual(2);
    });

    it('should parse \\\\缩进 as setIndent', () => {
        const tex = `\\缩进[3]Text`;
        const { ast } = parse(tex);
        const setIndentNode = ast.children.find(c => c.type === 'setIndent');
        expect(setIndentNode).toBeDefined();
    });

    it('should parse \\\\双列 as alias for \\\\夹注', () => {
        const tex = `\\双列{TestContent}`;
        const { ast } = parse(tex);
        const jiazhuNode = ast.children.find(c => c.type === 'jiazhu');
        expect(jiazhuNode).toBeDefined();
    });

    it('should detect digital mode from documentclass', () => {
        const tex = `\\documentclass[template]{ltc-guji-digital}\\begin{document}Text\\end{document}`;
        const { ast } = parse(tex);
        const config = resolveConfig(ast);

        expect(config.isDigitalMode).toBe(true);
        expect(config.documentClass).toBe('ltc-guji-digital');
    });

    it('should detect semantic mode from standard documentclass', () => {
        const tex = `\\documentclass[template]{ltc-guji}\\begin{document}Text\\end{document}`;
        const { ast } = parse(tex);
        const config = resolveConfig(ast);

        expect(config.isDigitalMode).toBe(false);
        expect(config.documentClass).toBe('ltc-guji');
    });

    it('should handle \\\\缩进 with negative values (taitou)', () => {
        const tex = `\\缩进[-2]Text`;
        const { ast } = parse(tex);
        const setIndentNode = ast.children.find(c => c.type === 'setIndent');
        expect(setIndentNode).toBeDefined();
        expect(setIndentNode.value).toBe('-2');
    });

    it('should handle \\\\右小列 and \\\\左小列 in \\\\双列 structure', () => {
        const tex = `\\双列{\\右小列{Right}\\左小列{Left}}`;
        const { ast } = parse(tex);
        const jiazhuNode = ast.children.find(c => c.type === 'jiazhu');

        expect(jiazhuNode).toBeDefined();
        expect(jiazhuNode.children).toBeDefined();
        expect(jiazhuNode.children.length).toBeGreaterThan(0);
    });

    it('should render digital document with explicit layout commands', () => {
        const tex = `
\\documentclass[四库全书]{ltc-guji-digital}
\\begin{document}
\\begin{正文}
书名
\\缩进[2]段落开始
\\双列{\\右小列{右列内容}\\左小列{左列内容}}
\\end{正文}
\\end{document}
`;
        const { ast } = parse(tex);
        const config = resolveConfig(ast);
        const layoutResult = layout(ast);
        const renderer = new HTMLRenderer(ast);
        const htmls = renderer.renderFromLayout(layoutResult);

        expect(config.isDigitalMode).toBe(true);
        expect(htmls[0]).toContain('wtc-set-indent');
        expect(htmls[0]).toContain('wtc-jiazhu');
        expect(htmls[0]).toContain('右列内容');
        expect(htmls[0]).toContain('左列内容');
    });
});
