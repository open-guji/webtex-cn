# 布局引擎设计

> 阶段 2-3：ConfigResolver 配置集中解析 + GridLayoutEngine 网格布局

## 1. 设计定位

布局引擎是 WebTeX-CN 与 luatex-cn 保持一致的核心所在。解析器产出的 AST 只描述了文档的逻辑结构，而布局引擎负责将逻辑结构映射到物理网格坐标——决定每个字符、每段夹注、每个段落出现在哪一页、哪一列、第几行。这个过程必须与 luatex-cn 的 PDF 布局行为一致，否则同一份 `.tex` 文件在两个引擎下会产生不同的分页。

布局引擎分为两个子阶段：

1. **ConfigResolver**（阶段 2）：集中解析所有配置参数
2. **GridLayoutEngine**（阶段 3）：遍历 AST，在虚拟网格上放置每个节点

## 2. ConfigResolver：配置集中解析

文件位置：`src/model/config.js`

### 2.1 职责

ConfigResolver 从 AST 的元数据中提取所有配置信息，产出单一的 `ResolvedConfig` 对象。下游的布局引擎和渲染器都直接消费这个对象，不再重复解析。

### 2.2 解析流程

```
AST 输入
  │
  ├── ast.template → resolveTemplateId()
  │     检查 documentclass[模板名] → templateCSSMap 映射
  │     检查 gujiSetup{template=...} 覆盖
  │     → templateId (如 'siku-quanshu')
  │
  ├── templateId → getGridConfig()
  │     → { nRows, nCols } (如 { nRows: 21, nCols: 8 })
  │
  ├── ast.setupCommands → 扫描标点模式
  │     judou-on → 'judou'
  │     judou-off → 'normal'
  │     judou-none → 'none'
  │     → punctMode
  │
  ├── ast.setupCommands → 收集 CSS 变量覆盖
  │     通过 setupParamMap 映射:
  │       contentSetup{font-size=20px} → { '--wtc-font-size': '20px' }
  │       pageSetup{background=#f5e6d0} → { '--wtc-page-background': '#f5e6d0' }
  │     → cssOverrides
  │
  └── ast.title, ast.chapter → meta
```

### 2.3 ResolvedConfig 结构

```javascript
{
  templateId: 'siku-quanshu',           // CSS 模板 ID
  grid: { nRows: 21, nCols: 8 },       // 网格参数
  punctMode: 'normal',                  // 标点模式: 'normal' | 'judou' | 'none'
  meta: {
    title: '欽定四庫全書',                // 书名
    chapter: '史記卷一',                  // 章节
  },
  cssOverrides: {                       // CSS 变量覆盖
    '--wtc-font-size': '20px',
    '--wtc-border-color': 'rgb(180, 95, 75)',
  },
  setupCommands: [...]                  // 原始 setup 命令列表
}
```

### 2.4 模板解析优先级

模板 ID 的解析支持多级覆盖：

1. `\documentclass[四库全书]{ltc-guji}` — 文档类选项指定
2. `\gujiSetup{template=红楼梦甲戌本}` — 可在后续覆盖

`resolveTemplateId()` 先取 `documentclass` 的选项，再扫描 `setupCommands` 中的 `gujiSetup` 命令，后者覆盖前者。

### 2.5 Setup 参数到 CSS 变量的映射

`setupParamMap` 定义了 setup 命令参数到 CSS 变量的映射关系：

| Setup 类型 | 参数 | CSS 变量 |
|-----------|------|---------|
| content | font-size | --wtc-font-size |
| content | line-height | --wtc-line-height |
| content | font-color | --wtc-font-color |
| content | border-color | --wtc-border-color |
| content | border-thickness | --wtc-border-thickness |
| content | letter-spacing | --wtc-letter-spacing |
| page | page-width | --wtc-page-width |
| page | page-height | --wtc-page-height |
| page | margin-top/bottom/left/right | --wtc-margin-* |
| page | background | --wtc-page-background |
| banxin | width | --wtc-banxin-width |
| banxin | font-size | --wtc-banxin-font-size |
| jiazhu | font-size, color, line-height, gap | --wtc-jiazhu-* |
| sidenode | font-size, color | --wtc-sidenote-* |
| meipi | font-size, color | --wtc-meipi-* |
| pizhu | font-size, color | --wtc-pizhu-* |

### 2.6 cssOverridesToStyleAttr

ConfigResolver 还提供一个辅助函数，将 CSS 覆盖对象转换为 HTML 内联 style 属性：

```javascript
cssOverridesToStyleAttr({ '--wtc-font-size': '20px' })
// → ' style="--wtc-font-size: 20px"'
```

渲染器在生成 `wtc-spread` 元素时使用此函数注入运行时覆盖。

## 3. GridLayoutEngine：虚拟网格游标系统

文件位置：`src/layout/grid-layout.js`

### 3.1 网格模型

GridLayoutEngine 在一个虚拟的二维网格上模拟古籍排版。每个「版面」(spread) 由左右两个半页组成：

```
一个版面 (spread):
┌─────────────────────┬─────────────────────┐
│    右半页 (right)     │    左半页 (left)      │
│  col 0 ... col 7    │  col 8 ... col 15    │
│  ← 文字从右向左排     │  ← 文字从右向左排      │
│                     │                      │
│  每列 nRows=21 字    │  每列 nRows=21 字     │
└─────────────────────┴─────────────────────┘
        nCols=8 列              nCols=8 列
         colsPerSpread = 2 * nCols = 16 列
```

游标状态：

| 字段 | 类型 | 说明 |
|------|------|------|
| `currentCol` | number | 当前列号（0 起始，从右半页第一列开始） |
| `currentRow` | number | 当前行号（0 起始，从列顶部开始） |
| `currentIndent` | number | 当前段落缩进值（减少每列的有效行数） |
| `ignoreIndent` | boolean | 是否忽略缩进（抬头列使用） |
| `punctMode` | string | 标点模式：'normal'、'judou'、'none' |
| `lastCellPos` | object | 上一个占据的格子坐标（句读标记附着用） |

### 3.2 核心方法

#### advanceRows(count)

逐字推进游标，自动处理换列和换页：

```javascript
advanceRows(count) {
  for (let i = 0; i < count; i++) {
    this.lastCellPos = { col: this.currentCol, row: this.currentRow };
    this.currentRow++;
    if (this.currentRow >= this.effectiveRows) {
      this.currentRow = 0;
      this.currentCol++;
      this.ignoreIndent = false;
      this.checkHalfBoundary();
      if (this.currentCol >= this.colsPerSpread) {
        this.newPageBreak();
      }
    }
  }
}
```

关键细节：
- `effectiveRows = nRows - (ignoreIndent ? 0 : currentIndent)` — 缩进减少每列有效行数
- 每次 `currentRow` 溢出时自动推进到下一列
- 每次 `currentCol` 溢出 `colsPerSpread` 时触发换页

#### advanceColumn()

强制换到下一列（重置 currentRow=0）：

```javascript
advanceColumn() {
  this.currentCol++;
  this.currentRow = 0;
  this.ignoreIndent = false;
  this.checkHalfBoundary();
  if (this.currentCol >= this.colsPerSpread) {
    this.newPageBreak();
  }
}
```

#### advanceRows vs advanceColumn 的区别和陷阱

这是布局引擎中最容易出错的部分：

| | advanceRows(count) | advanceColumn() |
|---|---|---|
| 用途 | 逐字推进，保留余数 | 强制换列 |
| currentRow | 保留溢出后的余数 | 重置为 0 |
| 分页 | 逐步触发 | 可能直接触发 |
| 典型场景 | TEXT, SPACE, 装饰节点 | NEWLINE, COLUMN_BREAK, TAITOU |

**重要陷阱**：永远不要在循环中使用 `advanceColumn()` 来推进多列内容。例如，早期实现曾在夹注多段处理中对每段调用 `advanceColumn()`，结果每次都丢失了段末的 remainder 行。正确做法是使用 `advanceRows(segRows)` 让游标自动溢出换列。

#### placeItem / placeMarker

```javascript
placeItem(node, extra = {}) {
  this.checkHalfBoundary();
  this.currentPage.items.push({
    node, col: this.currentCol, row: this.currentRow,
    indent: this.currentIndent, ...extra
  });
}

placeMarker(markerType, data = {}) {
  this.checkHalfBoundary();
  this.currentPage.items.push({
    node: { type: markerType },
    col: this.currentCol, row: this.currentRow,
    indent: this.currentIndent, ...data
  });
}
```

两者都将 item 追加到当前页的 items 数组，并在必要时标记半页边界。区别是 `placeMarker` 创建的是虚拟标记节点（LayoutMarker 类型），不对应实际内容。

### 3.3 半页边界 (halfBoundary)

每个版面分为右半页和左半页。`halfBoundary` 记录的是 items 数组中右半页结束的位置索引：

```
items[0 ... halfBoundary-1]  → 右半页内容
items[halfBoundary ... end]  → 左半页内容
```

边界的检测时机：当 `currentCol` 首次达到 `nCols`（从右半页进入左半页），将当前 items 长度记录为 `halfBoundary`。

如果整个版面的内容不够填满右半页（即 `currentCol` 始终 < `nCols`），`halfBoundary` 在版面结束时被设为 `items.length`（所有内容都在右半页）。

## 4. LayoutMarker：跨页标记栈模式

### 4.1 问题背景

段落、列表等复合节点在逻辑上是一个整体，但在物理布局中可能跨越多个页面。例如一个缩进段落的内容可能从第 1 页右半页开始，延续到第 1 页左半页，再到第 2 页右半页。

如果将段落作为单个 item 放置，渲染器在分页时需要拆分这个 item，非常复杂。

### 4.2 解决方案

布局引擎不将复合节点作为整体放置，而是：

1. 在复合节点开始处放一个 **START 标记**
2. 逐个遍历子节点，每个子节点独立放置
3. 在复合节点结束处放一个 **END 标记**

```javascript
// 段落布局
walkParagraph(node) {
  const indent = parseInt(node.options?.indent || '0', 10);
  this.currentIndent = indent;
  this.placeMarker(LayoutMarker.PARAGRAPH_START, { paragraphNode: node });
  this.walkChildren(node.children);        // 子节点逐个放置，可能跨页
  this.placeMarker(LayoutMarker.PARAGRAPH_END);
  this.currentIndent = prevIndent;
}
```

### 4.3 LayoutMarker 枚举

```javascript
const LayoutMarker = {
  PARAGRAPH_START: '_paragraphStart',
  PARAGRAPH_END: '_paragraphEnd',
  LIST_START: '_listStart',
  LIST_END: '_listEnd',
  LIST_ITEM_START: '_listItemStart',
  LIST_ITEM_END: '_listItemEnd',
  MULU_ITEM_START: '_muluItemStart',
  MULU_ITEM_END: '_muluItemEnd',
};
```

### 4.4 渲染器如何使用

渲染器在处理一个半页的 items 时：

1. 继承上一半页未闭合的标记栈（carryStack）
2. 遇到 START 标记 → 打开 HTML 标签，压入栈
3. 遇到 END 标记 → 关闭 HTML 标签，出栈
4. 半页结束时，栈中剩余的 START 标记被临时关闭，传递给下一个半页的 carryStack

这样每个半页都能独立渲染出有效的 HTML，标签始终平衡。

## 5. 各节点类型的布局行为

### 5.1 TEXT

最基本的布局单元。放置一个 item，然后按字符数推进游标：

```javascript
walkText(node) {
  const text = node.value || '';
  if (this.punctMode !== 'judou') {
    this.placeItem(node);
    this.advanceRows([...text].length);
    return;
  }
  // 句读模式下的特殊处理（见 5.8 节）
}
```

字符计数使用 `[...text].length` 而非 `text.length`，确保正确处理 Unicode 多字节字符。

### 5.2 PARAGRAPH

使用 LayoutMarker 模式遍历子节点，同时设置缩进：

```javascript
walkParagraph(node) {
  const indent = parseInt(node.options?.indent || '0', 10);
  const prevIndent = this.currentIndent;
  this.currentIndent = indent;    // 设置缩进 → effectiveRows 减少
  this.placeMarker(LayoutMarker.PARAGRAPH_START, { paragraphNode: node });
  this.walkChildren(node.children);
  this.placeMarker(LayoutMarker.PARAGRAPH_END);
  this.currentIndent = prevIndent; // 恢复缩进
}
```

缩进通过减少 `effectiveRows`（每列有效行数）实现。缩进为 2 时，每列从第 0 行到第 18 行可用（21-2-1=18），而非从第 2 行开始。

### 5.3 NEWLINE / PARAGRAPH_BREAK / COLUMN_BREAK

三者都触发 `advanceColumn()`，强制换到下一列：

```javascript
case NodeType.NEWLINE:
case NodeType.PARAGRAPH_BREAK:
case NodeType.COLUMN_BREAK:
  this.advanceColumn();
  break;
```

### 5.4 TAITOU (抬头)

抬头是古籍排版的重要概念——遇到尊称或重要事项时换到新列并留出空格：

```javascript
case NodeType.TAITOU: {
  this.advanceColumn();                          // 先换列
  const level = parseInt(node.value, 10) || 0;
  this.currentRow = level;                       // 从第 level 行开始
  this.ignoreIndent = true;                      // 此列忽略段落缩进
  this.placeItem(node);
  break;
}
```

`\平抬`（level=0）只换列不留空；`\单抬`（level=1）换列后空一格；`\三抬`（level=3）换列后空三格。`ignoreIndent` 标记确保抬头列不受段落缩进影响。

### 5.5 NUOTAI (挪抬) 和 SPACE (空格)

两者功能类似：在当前位置插入空格，不换列：

```javascript
case NodeType.SPACE:
case NodeType.NUOTAI: {
  const count = parseInt(node.value, 10) || 1;
  this.placeItem(node);
  this.advanceRows(count);   // 只推进游标，不换列
  break;
}
```

### 5.6 装饰类节点 (EMPHASIS, PROPER_NAME 等)

装饰类节点作为单个 item 放置，但游标需要按内部文本的字符数推进：

```javascript
case NodeType.EMPHASIS:
case NodeType.PROPER_NAME:
case NodeType.BOOK_TITLE:
// ... 其他装饰类型
  this.placeItem(node);
  this.advanceRowsByNodeText(node);  // 递归获取纯文本长度并推进
  break;
```

`advanceRowsByNodeText()` 使用 `getPlainText()` 递归提取所有子节点的文本，计算字符数后调用 `advanceRows()`。

### 5.7 浮动元素 (MEIPI, PIZHU, STAMP)

浮动元素不占据网格空间，直接存入当前页的 `floats` 数组：

```javascript
case NodeType.MEIPI:
case NodeType.PIZHU:
case NodeType.STAMP:
  this.currentPage.floats.push(node);
  break;
```

渲染器会将 floats 渲染为绝对定位的 HTML 元素，叠加在页面内容之上。

### 5.8 LIST / LIST_ITEM

列表使用 LayoutMarker 模式，每个 LIST_ITEM 除第一个外都会触发换列：

```javascript
walkList(node) {
  this.placeMarker(LayoutMarker.LIST_START);
  let first = true;
  for (const child of node.children) {
    if (child.type === NodeType.LIST_ITEM) {
      this.walkListItem(child, first);
      first = false;
    } else {
      this.walkNode(child);
    }
  }
  this.placeMarker(LayoutMarker.LIST_END);
}

walkListItem(node, isFirst = false) {
  if (!isFirst) this.advanceColumn();  // 非首项换列
  this.placeMarker(LayoutMarker.LIST_ITEM_START, { isFirstListItem: isFirst });
  this.walkChildren(node.children);
  this.placeMarker(LayoutMarker.LIST_ITEM_END);
}
```

### 5.9 MULU_ITEM (目录条目)

目录条目类似列表项，但有额外的缩进级别处理：

```javascript
case NodeType.MULU_ITEM: {
  if (this.currentRow > 0) this.advanceColumn();  // 如果不在列首则换列
  const level = parseInt(node.options?.value || '0', 10);
  this.currentRow = level;   // 缩进级别 → 起始行号
  this.placeMarker(LayoutMarker.MULU_ITEM_START, { level });
  this.walkChildren(node.children);
  this.placeMarker(LayoutMarker.MULU_ITEM_END);
  break;
}
```

### 5.10 CONTENT_BLOCK

正文块 `\begin{正文}` 遍历子节点，将浮动元素分离到 floats：

```javascript
walkContentBlock(node) {
  for (const child of node.children) {
    if (child.type === NodeType.MEIPI || child.type === NodeType.PIZHU || child.type === NodeType.STAMP) {
      this.currentPage.floats.push(child);
    } else {
      this.walkNode(child);
    }
  }
}
```

## 6. 夹注多段分割算法

夹注（双行小字注释）是布局引擎中最复杂的部分。一段长夹注可能跨越多列甚至多页，需要预先分割为多个段落。

### 6.1 整体流程

```
walkJiazhu(node)
  │
  ├── 检查是否有复杂子节点（非纯文本）
  │     → 有复杂子节点：作为单个 item 放置，按半字数推进
  │
  ├── 获取纯文本 → getPlainText()
  ├── 获取富文本字符数组 → getJudouRichText(text, punctMode)
  ├── 计算当前列剩余空间 → remaining = effectiveRows - currentRow
  ├── 调用 splitJiazhuMulti(richChars, maxPerCol, align, firstMax)
  │     → 产出 segments[] 数组
  │
  ├── 单段：作为单个 item 放置
  └── 多段：每段作为独立 item，逐段放置 + advanceRows
```

### 6.2 splitJiazhuMulti 算法

文件位置：`src/utils/jiazhu.js`

夹注的双列分割核心逻辑：

1. 将文本的 RichChar 数组按 `maxCharsPerCol * 2` 分块（每块填满一列的双行）
2. 第一块使用 `firstMaxPerCol * 2`（利用当前列的剩余空间）
3. 每块内部调用 `splitJiazhu()` 分为 col1（右列）和 col2（左列）

```javascript
function splitJiazhuMulti(richChars, maxCharsPerCol, align, firstMaxPerCol) {
  const first = firstMaxPerCol > 0 ? firstMaxPerCol : maxCharsPerCol;
  const firstChunkSize = first * 2;
  if (richChars.length <= firstChunkSize) {
    return [splitJiazhu(richChars, align)];   // 一段就够
  }
  const segments = [];
  segments.push(splitJiazhu(richChars.slice(0, firstChunkSize), align));
  for (let i = firstChunkSize; i < richChars.length; i += maxCharsPerCol * 2) {
    segments.push(splitJiazhu(richChars.slice(i, i + maxCharsPerCol * 2), align));
  }
  return segments;
}
```

### 6.3 对齐模式

`splitJiazhu()` 的 `align` 参数控制文本奇数字符时多出的字归属：

- `'outward'`（默认）：`Math.ceil(n/2)` 字在 col1（右列多一字），外侧对齐
- `'inward'`：`Math.floor(n/2)` 字在 col1（左列多一字），内侧对齐

### 6.4 多段放置

多段夹注中，每段作为独立的 layout item 放置。这样当某段跨越页面边界时，布局和渲染都能正确处理：

```javascript
// 第一段：利用当前列剩余空间
this.placeItem(node, {
  jiazhuSegments: [segments[0]],
  jiazhuSegmentIndex: 0,
  jiazhuTotalSegments: segments.length,
});
this.advanceRows(firstMax);

// 后续段：每段填满一整列
for (let i = 1; i < segments.length; i++) {
  const seg = segments[i];
  const segRows = Math.max(seg.col1.length, seg.col2.length);
  this.placeItem(node, {
    jiazhuSegments: [seg],
    jiazhuSegmentIndex: i,
    jiazhuTotalSegments: segments.length,
  });
  this.advanceRows(segRows);
}
```

每个 item 携带 `jiazhuSegments`（该段的分列数据）、`jiazhuSegmentIndex`（段序号）和 `jiazhuTotalSegments`（总段数），渲染器据此直接生成 HTML。

## 7. 句读 (judou) 模式处理

### 7.1 概念

句读是古籍的传统标点方式。在句读模式下，现代标点符号被转换为附着在文字旁边的小圆点标记，不占据网格空间。

### 7.2 标点分类

文件位置：`src/utils/judou.js`

```javascript
const JUDOU_JU = new Set(['。', '？', '！']);         // 句号类 → 红圈
const JUDOU_DOU = new Set(['，', '；', '、', '：']);  // 逗号类 → 红顿号
const JUDOU_PAIRED_OPEN = new Set(['「', '『', ...]);  // 配对开括号 → 隐藏
const JUDOU_PAIRED_CLOSE = new Set(['」', '』', ...]); // 配对闭括号 → 隐藏
```

- **句** (ju)：句号、问号、叹号 → 渲染为文字旁的小圆圈
- **读** (dou)：逗号、分号、顿号、冒号 → 渲染为文字旁的小顿号
- **配对括号**：书名号 `《》` 内容转为 bookTitle 装饰；其他括号隐藏

### 7.3 RichChar 数据结构

`getJudouRichText()` 将文本转换为 RichChar 数组，每个字符携带句读元数据：

```javascript
{ char: '天', judouType: null, isBookTitle: false }
{ char: '子', judouType: 'ju', isBookTitle: false }    // 句读符号附着在前一个字符上
{ char: '史', judouType: null, isBookTitle: true }      // 书名号内的字符
```

这个数组同时服务于布局（字符计数）和渲染（生成 HTML 标记）。

### 7.4 布局中的句读处理

在句读模式下，`walkText()` 对每个字符进行分类：

1. **普通字符**：累积到缓冲区，统一放置 + advanceRows
2. **句读标点**：不占格子，作为 zero-width item 附着在前一个字符的坐标上
3. **书名号括号** `《》`：提取括号内文本，创建 bookTitle 装饰节点
4. **其他配对括号**：在句读模式下直接跳过

```javascript
// 句读标记附着在上一个占据的格子坐标上
this.currentPage.items.push({
  node: { type: 'judou', value: ch, judouType: jType },
  col: this.lastCellPos.col,
  row: this.lastCellPos.row,
});
```

## 8. LayoutResult 数据结构

布局引擎的最终输出：

```javascript
{
  pages: [
    {
      items: [
        // 普通节点
        { node: { type: 'text', value: '...' }, col: 0, row: 0, indent: 0 },

        // 带夹注分段数据的节点
        { node: { type: 'jiazhu', ... }, col: 0, row: 5, indent: 0,
          jiazhuSegments: [{col1: [...], col2: [...]}],
          jiazhuSegmentIndex: 0, jiazhuTotalSegments: 2 },

        // LayoutMarker 标记
        { node: { type: '_paragraphStart' }, col: 1, row: 0, indent: 2,
          paragraphNode: {...} },

        // 句读标记
        { node: { type: 'judou', value: '。', judouType: 'ju' },
          col: 0, row: 3 },
      ],
      floats: [
        { type: 'meipi', options: {...}, children: [...] },
        { type: 'stamp', options: {...}, src: 'seal.png' },
      ],
      halfBoundary: 42,  // items[0..41] = 右半页, items[42..] = 左半页
    },
    // ... 更多页
  ],
  gridConfig: { nRows: 21, nCols: 8 },
  templateId: 'siku-quanshu',
  meta: { title: '...', chapter: '...' },
  config: { /* 完整的 ResolvedConfig */ }
}
```

### 8.1 页面生命周期

```
newPage() → { items: [], floats: [], halfBoundary: null }
  │
  ├── placeItem / placeMarker → items.push(...)
  ├── checkHalfBoundary() → 首次 col >= nCols 时记录 halfBoundary
  ├── floats.push(node) → 浮动元素
  │
  └── 页面结束（换页或文档结束）
        → 若 halfBoundary 仍为 null，设为 items.length
```

### 8.2 空文档行为

空文档（没有 `\begin{document}` 或无正文内容）产出一个包含单个空白页的 LayoutResult：

```javascript
{ pages: [{ items: [], floats: [], halfBoundary: 0 }], ... }
```

这保证了渲染器始终能产出至少一个页面的 HTML。

## 9. 公开 API

```javascript
export function layout(ast) {
  const config = resolveConfig(ast);
  const engine = new GridLayoutEngine(config.grid.nRows, config.grid.nCols);
  engine.punctMode = config.punctMode;

  for (const child of ast.children) {
    if (child.type === 'body') {
      engine.walkNode(child);
    }
  }

  // 确保最后一页有 halfBoundary
  const lastPage = engine.currentPage;
  if (lastPage.halfBoundary === null) {
    lastPage.halfBoundary = lastPage.items.length;
  }

  return {
    pages: engine.pages,
    gridConfig: config.grid,
    templateId: config.templateId,
    meta: config.meta,
    config,
  };
}
```

注意：`layout()` 只处理 `type === 'body'` 的顶层子节点，跳过前言区域（documentclass、title 等已在解析阶段提取到 AST 元数据中）。
