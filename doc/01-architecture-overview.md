# WebTeX-CN 整体架构设计

> 将 luatex-cn 古籍竖排 TeX 文件转换为 HTML+CSS 网页展示

## 1. 项目定位

WebTeX-CN 是一个纯前端 JavaScript 工具，接收与 [luatex-cn](https://github.com/open-guji/luatex-cn) 兼容的 `.tex` 输入文件，解析其中的命令和内容，在浏览器或 Node.js 环境中生成多页竖排古籍排版的 HTML+CSS 页面。

### 核心目标

- **输入兼容**：接受 luatex-cn 的 `.tex` 文件格式，支持 60+ 条相同的命令体系（中文命令、拼音命令、繁体别名）
- **布局一致**：通过独立的 GridLayoutEngine，在 JavaScript 端复现 luatex-cn 的网格布局逻辑，保证分页、换列、夹注分段等行为与 PDF 输出一致
- **网页展示**：通过 HTML + CSS（`writing-mode: vertical-rl`）实现竖排，每个版面输出为独立的 `wtc-page` DOM 节点
- **模板化**：4 套 CSS 模板（四库全书黑白/彩色、红楼梦甲戌本、极简），通过 CSS 变量覆盖机制支持运行时自定义
- **纯前端**：全部由 JavaScript 完成，无需后端；同时提供 CLI 工具 (`webtex-cn build / serve`) 用于 Node.js 预编译
- **轻量**：esbuild 打包后 ~24KB（minified），ESM 和 IIFE 双格式发布

## 2. 与 luatex-cn 的关系

```
luatex-cn 流水线（PDF 输出）：
  .tex → LuaTeX 引擎 → 展平 → 布局 → 渲染 → PDF

WebTeX-CN 流水线（HTML 输出）：
  .tex → 解析(Tokenizer+Parser) → 配置解析(ConfigResolver)
       → 布局(GridLayoutEngine) → 渲染(HTMLRenderer) → HTML+CSS
```

两者共享同一套 `.tex` 输入格式和命令体系，但实现完全独立。WebTeX-CN 不依赖 TeX Live 或任何 TeX 引擎，而是在 JavaScript 中从零实现了词法分析、语法分析、网格布局和 HTML 渲染四个阶段。

### 关键差异

| 方面 | luatex-cn | WebTeX-CN |
|------|-----------|-----------|
| 排版引擎 | LuaTeX（精确网格定位） | JS GridLayoutEngine + CSS vertical-rl |
| 布局精度 | 像素级精确 | 网格级精确（字/列/页），CSS 渲染依赖浏览器 |
| 输出格式 | PDF | HTML + CSS |
| 运行环境 | TeX Live 命令行 | 浏览器 / Node.js |
| 分页模型 | 物理分页 | JS 预计算分页 → 每页一个 DOM 节点 |
| 夹注分段 | TeX 盒子模型 | splitJiazhuMulti 预计算 → 每段独立 item |
| 句读处理 | TeX 宏 | JS getJudouRichText + zero-width span |

### 设计共识

- 网格参数必须一致：同一模板下 `nRows`（每列字数）和 `nCols`（每半页列数）的值与 luatex-cn 的 `.cfg` 文件保持相同
- 命令语义必须一致：`\夹注`、`\抬头`、`\侧批` 等命令的参数格式和行为语义与 luatex-cn 完全对应
- 分页边界必须一致：给定相同输入和相同网格参数，两个引擎应在相同位置换列、换页

## 3. 四阶段流水线

WebTeX-CN 采用四阶段流水线架构，每个阶段有清晰的输入/输出边界：

```
阶段1: 解析 ────────────────────────────────────────────────────
  输入: TeX 源文本 (string)
  处理: Tokenizer 词法分析 → Parser 语法分析 (CommandRegistry 驱动)
  输出: AST (Document 节点树) + warnings

阶段2: 配置解析 ────────────────────────────────────────────────
  输入: AST (含 template、setupCommands 等元数据)
  处理: ConfigResolver 集中解析模板ID、网格参数、标点模式、CSS覆盖
  输出: ResolvedConfig { templateId, grid, punctMode, meta, cssOverrides }

阶段3: 布局 ────────────────────────────────────────────────────
  输入: AST + ResolvedConfig
  处理: GridLayoutEngine 遍历 AST，维护虚拟游标，分配页/列/行坐标
  输出: LayoutResult { pages[{items, floats, halfBoundary}], gridConfig, templateId, meta, config }

阶段4: 渲染 ────────────────────────────────────────────────────
  输入: LayoutResult
  处理: HTMLRenderer 将 items 转为 HTML，处理 Marker 栈跨页平衡
  输出: string[] (每个元素是一个半页的 HTML)
```

### 阶段间的数据契约

各阶段通过明确的数据结构交互，避免耦合：

- **AST**：纯数据树，节点类型由 `NodeType` 枚举定义，节点结构为 `{ type, children, options, value }`
- **ResolvedConfig**：扁平配置对象，所有下游模块共享同一份配置
- **LayoutResult**：布局结果，包含所有页面的 items（带坐标）和 floats（浮动元素），渲染器只做 HTML 拼接，不再计算位置
- **HTML string[]**：最终产物，每个字符串代表一个半页的完整 HTML

## 4. 目录结构与模块职责

```
src/
├── index.js                    # 公开 API: renderToHTML, renderToDOM, render, renderToPage
│                               #   组装四阶段流水线，暴露浏览器全局 window.WebTeX
├── parser/
│   ├── tokenizer.js            # 阶段1a: 词法分析
│   │                           #   TeX 源文本 → Token[] (COMMAND, TEXT, MATH, BEGIN, END...)
│   ├── parser.js               # 阶段1b: 语法分析
│   │                           #   Token[] → AST，递归下降，支持嵌套命令和环境
│   ├── commands.js             # CommandRegistry + EnvironmentRegistry
│   │                           #   60+ 命令定义 (args, node, category, description, status)
│   │                           #   别名链解析 (resolveCommand/resolveEnvironment)
│   └── index.js                # 模块入口：parse() 便捷函数 + setTokenizer 依赖注入
│
├── model/
│   ├── nodes.js                # NodeType 枚举 (27+ 类型), createNode(), parseKeyValue()
│   │                           #   定义 AST 的节点类型和创建工具
│   └── config.js               # 阶段2: ConfigResolver
│                               #   resolveConfig(ast) → ResolvedConfig
│                               #   cssOverridesToStyleAttr() 生成内联样式
│
├── layout/
│   └── grid-layout.js          # 阶段3: GridLayoutEngine
│                               #   维护虚拟游标 (col, row, indent)
│                               #   遍历 AST 节点，放置到 pages[].items[]
│                               #   LayoutMarker 标记复合节点跨页边界
│                               #   layout(ast) 公开函数
│
├── renderer/
│   └── html-renderer.js        # 阶段4: HTMLRenderer
│                               #   renderFromLayout(layoutResult) → string[]
│                               #   Marker 栈重建，跨页 HTML 标签平衡
│                               #   各节点类型的 HTML 生成
│
├── utils/
│   ├── text.js                 # getPlainText, escapeHTML, parseColor
│   ├── jiazhu.js               # splitJiazhu, splitJiazhuMulti (夹注分列/分段)
│   └── judou.js                # getJudouType, getJudouRichText (句读分类与富文本处理)
│
├── config/
│   └── templates.js            # 模板配置: templateCSSMap, templateGridConfig
│                               #   resolveTemplateId(ast), getGridConfig(templateId)
│
└── templates/
    ├── base.css                # 基础 CSS 变量和所有组件的默认样式
    ├── siku-quanshu.css        # 四库全书（黑白）模板
    ├── siku-quanshu-colored.css # 四库全书（彩色）模板
    ├── honglou.css             # 红楼梦甲戌本模板
    └── minimal.css             # 极简模板
```

### 辅助文件

```
build.js                        # esbuild 打包脚本 → dist/ (ESM, IIFE, minified)
bin/webtex-cn.js                # Node.js CLI: webtex-cn build input.tex -o output/
                                #              webtex-cn serve (开发服务器)
examples/                       # 4 个示例: minimal, shiji, honglou, showcase
test/                           # 132 个测试 (vitest)
  ├── tokenizer.test.js         # 26 个词法分析测试
  ├── parser.test.js            # 23 个语法分析测试
  ├── layout.test.js            # 28 个布局测试
  ├── renderer.test.js          # 33 个渲染测试
  ├── integration.test.js       # 14 个集成测试
  └── snapshot.test.js          # 8 个快照测试
```

## 5. 数据流示例

以一个典型的 TeX 输入为例，跟踪数据在四个阶段中的流转：

### 输入

```latex
\documentclass[四库全书]{ltc-guji}
\title{欽定四庫全書}
\chapter{史記卷一}
\begin{document}
\begin{正文}
黄帝者\夹注{集解徐廣曰號有熊}少典之子
\end{正文}
\end{document}
```

### 阶段 1: 解析 → AST

```javascript
{
  type: 'document',
  documentClass: 'ltc-guji',
  template: '四库全书',
  title: '欽定四庫全書',
  chapter: '史記卷一',
  setupCommands: [],
  children: [
    {
      type: 'body',    // \begin{document}
      children: [
        {
          type: 'contentBlock',   // \begin{正文}
          children: [
            { type: 'text', value: '黄帝者' },
            {
              type: 'jiazhu', options: {},
              children: [{ type: 'text', value: '集解徐廣曰號有熊' }]
            },
            { type: 'text', value: '少典之子' }
          ]
        }
      ]
    }
  ]
}
```

### 阶段 2: 配置解析 → ResolvedConfig

```javascript
{
  templateId: 'siku-quanshu',
  grid: { nRows: 21, nCols: 8 },
  punctMode: 'normal',
  meta: { title: '欽定四庫全書', chapter: '史記卷一' },
  cssOverrides: {},
  setupCommands: []
}
```

### 阶段 3: 布局 → LayoutResult

```javascript
{
  pages: [{
    items: [
      { node: { type: 'text', value: '黄帝者' }, col: 0, row: 0, indent: 0 },
      { node: { type: 'jiazhu', ... }, col: 0, row: 3, indent: 0,
        jiazhuSegments: [{ col1: [...], col2: [...] }] },
      { node: { type: 'text', value: '少典之子' }, col: 0, row: 7, indent: 0 },
    ],
    floats: [],
    halfBoundary: 3   // 所有 items 都在右半页
  }],
  gridConfig: { nRows: 21, nCols: 8 },
  templateId: 'siku-quanshu',
  meta: { title: '欽定四庫全書', chapter: '史記卷一' },
  config: { ... }
}
```

### 阶段 4: 渲染 → HTML

```html
<!-- 右半页 -->
<div class="wtc-spread wtc-spread-right">
  <div class="wtc-half-page wtc-half-right">
    <div class="wtc-content-border"><div class="wtc-content">
      黄帝者<span class="wtc-jiazhu">
        <span class="wtc-jiazhu-col">集解徐廣</span>
        <span class="wtc-jiazhu-col">曰號有熊</span>
      </span>少典之子
    </div></div>
  </div>
  <div class="wtc-banxin">...</div>
</div>
<!-- 左半页 -->
<div class="wtc-spread wtc-spread-left">
  <div class="wtc-half-page wtc-half-left">
    <div class="wtc-content-border"><div class="wtc-content"></div></div>
  </div>
  <div class="wtc-banxin">...</div>
</div>
```

## 6. 关键设计决策

### 6.1 为什么分四个阶段

早期设计只有「解析 → 渲染」两个阶段，渲染器同时负责布局计算和 HTML 生成。这导致了几个问题：

- **分页逻辑与 HTML 生成交织**：渲染器需要同时跟踪游标位置和拼接 HTML，代码复杂且难以测试
- **布局结果不可复用**：无法在渲染前检查布局是否正确（比如单元测试验证分页边界）
- **配置散落**：模板 ID 解析、网格参数查找、CSS 变量映射分散在多个模块中

引入 ConfigResolver 和 GridLayoutEngine 后：

- 布局引擎只负责「AST → 坐标」，可以独立测试（28 个布局测试）
- 渲染器只负责「坐标 → HTML」，不做任何位置计算，也可独立测试（33 个渲染测试）
- 配置在一处解析，所有下游模块使用同一个 ResolvedConfig

### 6.2 为什么 ConfigResolver 独立为阶段 2

ConfigResolver 虽然代码量不大（约 100 行），但职责关键：

- **模板 ID 解析**：`\documentclass[四库全书]` → `siku-quanshu`，`\gujiSetup{template=红楼梦甲戌本}` 可覆盖
- **网格参数查找**：模板 ID → `{ nRows, nCols }` 映射
- **标点模式确定**：扫描 setupCommands 中的 `judou-on/off/none` 命令
- **CSS 变量收集**：将 `\contentSetup{font-size=20px}` 转换为 `{ '--wtc-font-size': '20px' }`

如果将这些逻辑分散到布局引擎和渲染器中，两者都需要重复解析模板和配置命令，既浪费又容易不一致。独立的 ConfigResolver 保证了配置的单一来源（Single Source of Truth）。

### 6.3 为什么 utils 独立

`utils/` 下的三个工具模块被布局引擎和渲染器同时使用：

- `text.js`：`getPlainText()` 用于布局阶段计算装饰节点的字符数，也用于渲染阶段获取纯文本
- `jiazhu.js`：`splitJiazhuMulti()` 用于布局阶段预计算分段，渲染阶段的 legacy 路径也需要
- `judou.js`：`getJudouRichText()` 同时服务于布局和渲染

将它们放在 `utils/` 中避免了布局和渲染之间的循环依赖，也使得这些纯函数可以独立单元测试。

### 6.4 为什么用 LayoutMarker 而不是嵌套结构

段落、列表等复合节点可能跨越多页。如果使用嵌套的 HTML 结构（如 `<div class="wtc-paragraph">` 包含所有子项），在分页时需要拆分 DOM 树，非常复杂。

LayoutMarker 采用「开/闭标记」模式：段落开始时放一个 `PARAGRAPH_START`，结束时放一个 `PARAGRAPH_END`。渲染器在分页边界处自动闭合未完成的标记并在下一页重新打开，类似 HTML 的标签平衡。这使得分页逻辑完全在布局阶段完成，渲染器只需线性扫描 items 列表。

## 7. 公开 API

`src/index.js` 导出以下函数，构成对外的完整接口：

| 函数 | 用途 |
|------|------|
| `renderToHTML(texSource)` | TeX 源文本 → 多页 HTML 字符串 |
| `renderToDOM(texSource, container, options?)` | TeX 源文本 → 注入到 DOM 容器 |
| `render(url, container, options?)` | fetch .tex URL → 注入到 DOM 容器 |
| `renderToPage(texSource)` | TeX 源文本 → 完整 HTML 页面（含 head） |
| `getTemplates()` | 获取可用模板列表 |
| `setTemplate(templateId, basePath?)` | 动态切换 CSS 模板（浏览器端） |
| `parse(source)` | 底层 API：TeX → `{ ast, warnings }` |
| `layout(ast)` | 底层 API：AST → LayoutResult |
| `HTMLRenderer` | 底层 API：渲染器类 |

浏览器环境下，所有函数同时挂载到 `window.WebTeX` 全局对象。

## 8. 构建与发布

```
build.js (esbuild)
  → dist/webtex-cn.esm.js      # ES Module 格式
  → dist/webtex-cn.iife.js     # IIFE 格式（浏览器 <script> 标签）
  → dist/webtex-cn.min.js      # 压缩版 (~24KB)
```

CLI 工具 `bin/webtex-cn.js` 提供两个子命令：

- `webtex-cn build input.tex -o output/` — 预编译为静态 HTML + CSS 文件
- `webtex-cn serve` — 启动开发服务器，实时预览

## 9. 测试策略

132 个测试覆盖全流水线：

| 类别 | 数量 | 覆盖范围 |
|------|------|---------|
| tokenizer | 26 | Token 类型识别、CJK 命令、转义字符、空行段落、数学模式 |
| parser | 23 | 命令解析、环境解析、别名链、嵌套命令、key-value 参数 |
| layout | 28 | 游标推进、分页边界、半页边界、夹注分段、抬头/挪抬、列表布局 |
| renderer | 33 | HTML 生成、Marker 栈平衡、夹注渲染、版心、装饰类、浮动元素 |
| integration | 14 | 端到端流水线：TeX → HTML 验证 |
| snapshot | 8 | 关键输入的 HTML 输出快照回归 |

测试框架使用 Vitest，与 esbuild 构建链天然兼容。

## 10. 浏览器兼容性

| 浏览器 | 最低版本 | 说明 |
|--------|---------|------|
| Chrome | 80+ | `writing-mode: vertical-rl` + CSS 变量完整支持 |
| Firefox | 78+ | 同上 |
| Safari | 14+ | 同上 |
| Edge | 80+ | Chromium 内核 |
