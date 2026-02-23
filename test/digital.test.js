import { parse } from '../src/parser/index.js';
import { layout } from '../src/layout/grid-layout.js';
import { HTMLRenderer } from '../src/renderer/html-renderer.js';
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
});
