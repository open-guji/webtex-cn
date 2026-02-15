import { describe, it, expect } from 'vitest';
import { parse } from '../src/parser/index.js';
import { layout, GridLayoutEngine } from '../src/layout/grid-layout.js';
import { splitJiazhu, splitJiazhuMulti } from '../src/utils/jiazhu.js';

function layoutTex(tex) {
  const { ast } = parse(tex);
  return layout(ast);
}

describe('GridLayoutEngine', () => {
  describe('basic placement', () => {
    it('places short text on single page', () => {
      const result = layoutTex('\\begin{document}\\begin{正文}天地\\end{正文}\\end{document}');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].items.length).toBeGreaterThan(0);
    });

    it('produces correct grid config from template', () => {
      const result = layoutTex('\\documentclass[四库全书]{ltc-guji}\\begin{document}\\begin{正文}天\\end{正文}\\end{document}');
      expect(result.gridConfig).toEqual({ nRows: 21, nCols: 8 });
      expect(result.templateId).toBe('siku-quanshu');
    });

    it('produces honglou grid config', () => {
      const result = layoutTex('\\documentclass[红楼梦甲戌本]{ltc-guji}\\begin{document}\\begin{正文}天\\end{正文}\\end{document}');
      expect(result.gridConfig).toEqual({ nRows: 20, nCols: 9 });
      expect(result.templateId).toBe('honglou');
    });
  });

  describe('column wrapping', () => {
    it('wraps cursor to next column when exceeding nRows', () => {
      // 25 chars with nRows=21 → cursor should advance past column 0
      const engine = new GridLayoutEngine(21, 8);
      engine.walkNode({ type: 'text', value: '一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾甲乙丙丁戊' });
      // After 25 chars: 21 fill column 0, 4 in column 1
      expect(engine.currentCol).toBe(1);
      expect(engine.currentRow).toBe(4);
    });

    it('fills exactly nRows per column without advancing', () => {
      // Exactly 21 chars → fills column 0, cursor at row 0 of column 1
      const engine = new GridLayoutEngine(21, 8);
      engine.walkNode({ type: 'text', value: '一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾甲' });
      expect(engine.currentCol).toBe(1);
      expect(engine.currentRow).toBe(0);
    });
  });

  describe('page breaking', () => {
    it('creates new page when exceeding 2*nCols columns', () => {
      // With nRows=21, nCols=8, colsPerSpread=16. Need 16 newlines to use 16 columns → page break
      let tex = '\\begin{document}\\begin{正文}';
      for (let i = 0; i < 17; i++) {
        tex += '天\\\\';
      }
      tex += '\\end{正文}\\end{document}';
      const result = layoutTex(tex);
      expect(result.pages.length).toBeGreaterThanOrEqual(2);
    });

    it('single page for content within spread limit', () => {
      const chars = '天'.repeat(100);
      const tex = `\\begin{document}\\begin{正文}${chars}\\end{正文}\\end{document}`;
      const result = layoutTex(tex);
      expect(result.pages).toHaveLength(1);
    });

    it('page break via many columns of text', () => {
      // Each newline forces a new column. 17 newlines = 17+ columns > 16 colsPerSpread
      const engine = new GridLayoutEngine(21, 8);
      for (let i = 0; i < 17; i++) {
        engine.placeItem({ type: 'newline' });
        engine.advanceColumn();
      }
      expect(engine.pages.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('halfBoundary', () => {
    it('marks boundary when content crosses to left half-page', () => {
      // Use 9 newlines to push into 9 columns → crosses nCols=8 boundary
      let tex = '\\begin{document}\\begin{正文}';
      for (let i = 0; i < 9; i++) {
        tex += '天\\\\';
      }
      tex += '\\end{正文}\\end{document}';
      const result = layoutTex(tex);
      expect(result.pages[0].halfBoundary).not.toBeNull();
      expect(result.pages[0].halfBoundary).toBeGreaterThan(0);
      expect(result.pages[0].halfBoundary).toBeLessThan(result.pages[0].items.length);
    });

    it('halfBoundary equals items.length when content fits right half only', () => {
      const chars = '天'.repeat(10);
      const tex = `\\begin{document}\\begin{正文}${chars}\\end{正文}\\end{document}`;
      const result = layoutTex(tex);
      expect(result.pages[0].halfBoundary).toBe(result.pages[0].items.length);
    });
  });

  describe('jiazhu placement', () => {
    it('jiazhu following text stays in same column when it fits', () => {
      // 3 chars of text + short jiazhu (4 chars → 2 per col)
      const tex = '\\begin{document}\\begin{正文}黄帝者\\夹注{四字文本}\\end{正文}\\end{document}';
      const result = layoutTex(tex);
      // All items should be in column 0
      const cols = new Set(result.pages[0].items.map(i => i.col));
      expect(cols.size).toBe(1);
      expect(cols.has(0)).toBe(true);
    });

    it('long jiazhu produces pre-computed segments', () => {
      const longText = '集解徐廣曰號有熊索隠按有土徳之瑞土色黄故稱黄帝猶神農火徳王而稱炎帝然也此以黄帝為五帝之首';
      const tex = `\\begin{document}\\begin{正文}黄帝者\\夹注{${longText}}\\end{正文}\\end{document}`;
      const result = layoutTex(tex);
      const jiazhuItem = result.pages[0].items.find(i => i.node.type === 'jiazhu');
      expect(jiazhuItem).toBeDefined();
      expect(jiazhuItem.jiazhuSegments).toBeDefined();
      expect(jiazhuItem.jiazhuSegments.length).toBeGreaterThanOrEqual(1);
    });

    it('jiazhu first segment uses remaining column space', () => {
      // 3 chars text → 18 rows remaining (nRows=21)
      const longText = '一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾甲乙丙丁戊己庚辛壬癸子丑寅卯辰巳午未申酉戌亥';
      const tex = `\\begin{document}\\begin{正文}黄帝者\\夹注{${longText}}\\end{正文}\\end{document}`;
      const result = layoutTex(tex);
      const jiazhuItem = result.pages[0].items.find(i => i.node.type === 'jiazhu');
      expect(jiazhuItem.jiazhuSegments).toBeDefined();
      const firstSeg = jiazhuItem.jiazhuSegments[0];
      expect([...firstSeg.col1].length).toBeLessThanOrEqual(18);
    });
  });

  describe('paragraph indent', () => {
    it('reduces effective rows in indented paragraph', () => {
      // With indent=3, effectiveRows = 21-3 = 18
      // The paragraph node is placed as a single item, cursor tracked internally
      const engine = new GridLayoutEngine(21, 8);
      const paraNode = {
        type: 'paragraph',
        options: { indent: '3' },
        children: [
          { type: 'text', value: '一二三四五六七八九十壹贰叁肆伍陆柒捌玖拾' } // 20 chars
        ]
      };
      engine.walkNode(paraNode);
      // 20 chars with effectiveRows=18: 18 fill col 0, 2 in col 1
      expect(engine.currentCol).toBe(1);
      expect(engine.currentRow).toBe(2);
    });
  });

  describe('floating elements', () => {
    it('meipi goes to floats, not items', () => {
      const tex = '\\begin{document}\\begin{正文}\\眉批{批注}text\\end{正文}\\end{document}';
      const result = layoutTex(tex);
      expect(result.pages[0].floats.length).toBeGreaterThanOrEqual(1);
      expect(result.pages[0].floats[0].type).toBe('meipi');
    });

    it('pizhu goes to floats', () => {
      const tex = '\\begin{document}\\begin{正文}\\批注{批注}text\\end{正文}\\end{document}';
      const result = layoutTex(tex);
      expect(result.pages[0].floats.length).toBeGreaterThanOrEqual(1);
      expect(result.pages[0].floats[0].type).toBe('pizhu');
    });
  });

  describe('metadata', () => {
    it('collects title and chapter', () => {
      const tex = '\\title{书名}\\chapter{卷一}\\begin{document}\\begin{正文}text\\end{正文}\\end{document}';
      const result = layoutTex(tex);
      expect(result.meta.title).toBe('书名');
      expect(result.meta.chapter).toBe('卷一');
    });

    it('collects setup commands', () => {
      const tex = '\\contentSetup{font-size=16px}\\begin{document}\\begin{正文}text\\end{正文}\\end{document}';
      const result = layoutTex(tex);
      expect(result.config.setupCommands.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('newline and breaks', () => {
    it('newline advances to next column', () => {
      const engine = new GridLayoutEngine(21, 8);
      engine.walkNode({ type: 'text', value: '天' });
      expect(engine.currentCol).toBe(0);
      engine.walkNode({ type: 'newline' });
      expect(engine.currentCol).toBe(1);
    });

    it('paragraph break advances column', () => {
      const engine = new GridLayoutEngine(21, 8);
      engine.walkNode({ type: 'text', value: '天' });
      engine.walkNode({ type: 'paragraphBreak' });
      expect(engine.currentCol).toBe(1);
    });
  });

  describe('empty content', () => {
    it('produces one page for empty document', () => {
      const result = layoutTex('\\begin{document}\\end{document}');
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0].items).toHaveLength(0);
    });
  });
});

describe('splitJiazhu', () => {
  it('splits evenly with outward alignment', () => {
    const result = splitJiazhu('一二三四五六', 'outward');
    expect(result.col1).toBe('一二三');
    expect(result.col2).toBe('四五六');
  });

  it('splits with inward alignment', () => {
    const result = splitJiazhu('一二三四五六七', 'inward');
    expect(result.col1).toBe('一二三');
    expect(result.col2).toBe('四五六七');
  });

  it('handles empty text', () => {
    const result = splitJiazhu('');
    expect(result.col1).toBe('');
    expect(result.col2).toBe('');
  });

  it('handles single char', () => {
    const result = splitJiazhu('一');
    expect(result.col1).toBe('一');
    expect(result.col2).toBe('');
  });
});

describe('splitJiazhuMulti', () => {
  it('returns single segment for short text', () => {
    const result = splitJiazhuMulti('一二三四', 10);
    expect(result).toHaveLength(1);
  });

  it('splits into multiple segments for long text', () => {
    const result = splitJiazhuMulti('一二三四五六七八九十壹贰叁肆伍', 5);
    expect(result).toHaveLength(2);
  });

  it('respects firstMaxPerCol for first segment', () => {
    const text = '一二三四五六七八九十壹贰叁肆伍陆';
    const result = splitJiazhuMulti(text, 5, 'outward', 3);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect([...result[0].col1].length).toBeLessThanOrEqual(3);
  });
});
