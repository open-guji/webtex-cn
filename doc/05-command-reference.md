# 命令参考手册（开发者版）

> 本文档面向 WebTeX-CN 开发者，详述每个命令从解析到渲染的完整处理流程。
> 用户视角的命令用法请参见 Wiki 上的 Command-Reference 页面。

## 1. 架构概览

命令的生命周期贯穿三个阶段：

```
TeX 源码 → [解析] → AST 节点 → [布局] → LayoutItem → [渲染] → HTML
```

- **解析阶段**：`commands.js` 中的 CommandRegistry 定义了命令的参数格式和 NodeType 映射。`parser.js` 消费 token 流，按定义读取 `[optional]` 和 `{required}` 参数，构造 AST 节点。
- **布局阶段**：`grid-layout.js` 中的 `GridLayoutEngine` 遍历 AST，维护虚拟光标 `(currentCol, currentRow)`，将节点放置到网格坐标上，产出 `LayoutResult`。
- **渲染阶段**：`html-renderer.js` 遍历 `LayoutResult.pages`，将每个 LayoutItem 转换为 HTML 字符串。

### 1.1 命令注册表格式

`commandRegistry` 中每个规范命令的定义：

```js
'夹注': {
  args: ['optional', 'required'],  // 参数签名
  node: 'jiazhu',                  // 映射到 NodeType
  category: 'annotation',          // 语义分类
  description: '...',              // 简要说明
  status: 'full',                  // 实现状态: full | partial | none | n/a
}
```

别名通过 `{ alias: '规范名' }` 指向规范定义，解析时由 `resolveCommand()` 沿链路查找。

### 1.2 环境注册表格式

`environmentRegistry` 结构类似，增加 `hasOptions` 字段表示环境是否接受 `[...]` 可选参数。

### 1.3 分类 (category)

| 分类 | 说明 |
|------|------|
| `structure` | 文档结构：documentclass, title, chapter, item, 条目 |
| `annotation` | 批注类：夹注系列、侧批、眉批、批注 |
| `decoration` | 装饰类：圈点、专名号、书名号、反白、八角框等 |
| `layout` | 布局控制：空格、换行、抬头系列、文本框、印章 |
| `setup` | 配置命令：各种 Setup、句读模式切换 |
| `ignored` | 忽略命令：usepackage、setmainfont 等无 Web 对应物 |

### 1.4 实现状态统计

命令注册表共追踪 91 条命令：37 full、15 partial、27 none、8 n/a（纯别名不计入）。

---

## 2. 文档结构命令 (structure)

### 2.1 `\documentclass[模板名]{ltc-guji}`

| 项目 | 内容 |
|------|------|
| **别名** | 无 |
| **参数** | `args: ['optional', 'required']` |
| **解析** | 特殊处理：不创建 AST 节点，直接设置 `doc.documentClass` 和 `doc.template` |
| **布局** | 不参与布局；`resolveConfig()` 根据 `doc.template` 解析 templateId 和 gridConfig |
| **渲染** | 不产生 HTML；templateId 决定加载的 CSS 模板和 `data-template` 属性 |
| **状态** | full |

### 2.2 `\title{标题}`

| 项目 | 内容 |
|------|------|
| **别名** | 无 |
| **参数** | `args: ['required']` |
| **解析** | 特殊处理：不创建节点，设置 `doc.title`，存入 `config.meta.title` |
| **布局** | 不参与布局 |
| **渲染** | 通过 `renderBanxinFromMeta()` 输出 `<span class="wtc-banxin-book-name">` |
| **状态** | full |

### 2.3 `\chapter{章节名}`

| 项目 | 内容 |
|------|------|
| **别名** | 无 |
| **参数** | `args: ['required']`，内容支持 `\\` 分行 |
| **解析** | 特殊处理：不创建节点，设置 `doc.chapter`，存入 `config.meta.chapter` |
| **布局** | 不参与布局 |
| **渲染** | `renderBanxinFromMeta()` 按 `\\` 分割后输出多个 `<span class="wtc-banxin-chapter-part">` |
| **状态** | full |

### 2.4 `\item`

| 项目 | 内容 |
|------|------|
| **别名** | 无 |
| **参数** | `args: []` |
| **解析** | 返回空的 `LIST_ITEM` 节点作为分隔标记；后续由 `groupListItems()` 将 `\item` 之间的内容归组到 `LIST_ITEM.children` |
| **布局** | 见列表环境（3.5 节） |
| **渲染** | 见列表环境（3.5 节） |
| **状态** | full |

### 2.5 `\条目[缩进级别]{内容}`

| 项目 | 内容 |
|------|------|
| **别名** | `條目`, `TiaoMu` |
| **参数** | `args: ['optional', 'required']` |
| **AST** | `{ type: 'muluItem', options: { value: N }, children: [...] }` |
| **布局** | 若当前行非空则换列；`currentRow = level`；发射 `MULU_ITEM_START/END` 标记，内部子节点逐个放置 |
| **渲染** | `<span class="wtc-mulu-item" style="padding-inline-start: calc(N * var(--wtc-grid-height))">` |
| **状态** | full |

---

## 3. 环境命令

### 3.1 `\begin{document}...\end{document}`

| 项目 | 内容 |
|------|------|
| **节点** | `body`（特殊类型，非 NodeType 枚举成员） |
| **解析** | `parseUntilEnd('document')` 收集子节点 |
| **布局** | `walkNode` 中 `case 'body'` 直接递归遍历 children |
| **渲染** | `renderChildren(node.children)` |

### 3.2 `\begin{正文}...\end{正文}`

| 项目 | 内容 |
|------|------|
| **别名** | `BodyText` |
| **节点** | `NodeType.CONTENT_BLOCK` |
| **解析** | `parseUntilEnd` 收集子节点 |
| **布局** | `walkContentBlock()`：浮动元素（MEIPI/PIZHU/STAMP）分离到 `page.floats`，其余逐个 walk |
| **渲染** | 在布局管线中，由 `renderFromLayout()` 输出 `<div class="wtc-spread">` 包裹 half-page 和 banxin |

### 3.3 `\begin{段落}[options]...\end{段落}`

| 项目 | 内容 |
|------|------|
| **别名** | `Paragraph` |
| **节点** | `NodeType.PARAGRAPH`，`hasOptions: true` |
| **参数** | 可选：`indent=N`, `first-indent=N`, `bottom-indent=N` |
| **AST** | `{ type: 'paragraph', options: { indent: '3' }, children: [...] }` |
| **布局** | `walkParagraph()`：保存/恢复 `currentIndent`，发射 `PARAGRAPH_START/END` 标记，子节点逐个放置（可跨页） |
| **渲染** | indent > 0 时：`<span class="wtc-paragraph wtc-paragraph-indent" style="--wtc-paragraph-indent: ...">` |
| **状态** | full |

### 3.4 `\begin{列表}...\end{列表}`

| 项目 | 内容 |
|------|------|
| **别名** | 无 |
| **节点** | `NodeType.LIST` |
| **解析** | `parseUntilEnd` 后由 `groupListItems()` 后处理：将 `\item` 标记之间的内容归组为 `LIST_ITEM` 节点 |
| **布局** | `walkList()`：发射 `LIST_START/END` 标记；每个 `LIST_ITEM` 调用 `walkListItem()`（非首项先 `advanceColumn()`），发射 `LIST_ITEM_START/END` 标记 |
| **渲染** | `<span class="wtc-list"><span class="wtc-list-item">...</span></span>`，非首项前插入 `<br class="wtc-newline">` |
| **状态** | full |

### 3.5 `\begin{夹注环境}...\end{夹注环境}`

| 项目 | 内容 |
|------|------|
| **别名** | `JiaZhuEnv`, `夾注環境` |
| **节点** | `NodeType.JIAZHU`（与命令形式相同） |
| **解析** | 环境形式允许内部包含其他命令 |
| **布局/渲染** | 同夹注命令（4.1 节） |
| **状态** | full |

---

## 4. 批注命令 (annotation)

### 4.1 `\夹注[options]{内容}` — 双行夹注

| 项目 | 内容 |
|------|------|
| **别名** | `JiaZhu`, `夾注`, 以及语义变体 `按`/`謹按`/`谨按`/`案`/`謹案`/`谨案`/`注`/`註`/`標`/`提` |
| **参数** | `args: ['optional', 'required']`；可选：`align=outward\|inward` |
| **AST** | `{ type: 'jiazhu', options: { align: 'outward' }, children: [TEXT...] }` |
| **布局** | `walkJiazhu()`：<br>1) 计算当前列剩余行数 `firstMax`<br>2) 纯文本时调用 `splitJiazhuMulti()` 预计算分段<br>3) 单段：放置一个 item，`advanceRows(ceil(chars/2))`<br>4) 多段：每段独立放置为 item（带 `jiazhuSegmentIndex`），分别 advanceRows，可跨页<br>5) 复杂子节点（含命令）：放置为单个 item，按一半字数推进 |
| **渲染** | `<span class="wtc-jiazhu"><span class="wtc-jiazhu-col">列1</span><span class="wtc-jiazhu-col">列2</span></span>`<br>多段时每段生成独立的 `wtc-jiazhu` span |
| **状态** | full |

### 4.2 `\单行夹注[options]{内容}` — 单行夹注

| 项目 | 内容 |
|------|------|
| **别名** | `DanHangJiaZhu`, `單行夾注` |
| **参数** | 同夹注，注册表中额外标记 `single: true` |
| **AST** | 同 `jiazhu`，`single` 标记暂未在布局/渲染中区分 |
| **状态** | partial |

### 4.3 `\侧批[options]{内容}` — 侧批

| 项目 | 内容 |
|------|------|
| **别名** | `SideNode`, `CePi`, `側批` |
| **参数** | `args: ['optional', 'required']`；可选：`yoffset`, `color`, `font-size` |
| **AST** | `{ type: 'sidenote', options: {...}, children: [...] }` |
| **布局** | `placeItem(node)` 放置到当前位置，不推进光标（零宽度） |
| **渲染** | `<span class="wtc-sidenote" style="margin-block-start: ...; --wtc-sidenote-color: ...">内容</span>` |
| **状态** | full |

### 4.4 `\眉批[options]{内容}` — 眉批

| 项目 | 内容 |
|------|------|
| **别名** | `MeiPi` |
| **参数** | `args: ['optional', 'required']`；可选：`x`, `y`, `height`, `font-size`, `color`, `spacing`, `gap` |
| **AST** | `{ type: 'meipi', options: {...}, children: [...] }` |
| **布局** | 浮动元素：在 `walkContentBlock()` 和 `walkNode()` 中直接推入 `page.floats`，不占据网格空间 |
| **渲染** | `<div class="wtc-meipi" style="right: ...; top: ...">内容</div>`；无 `x` 时自动按 `meipiCount` 递增定位 |
| **状态** | partial |

### 4.5 `\批注[options]{内容}` — 批注

| 项目 | 内容 |
|------|------|
| **别名** | `PiZhu` |
| **参数** | `args: ['optional', 'required']`；可选：`x`, `y`, `height`, `color`, `font-size` |
| **AST** | `{ type: 'pizhu', options: {...}, children: [...] }` |
| **布局** | 浮动元素：推入 `page.floats`，不占据网格空间 |
| **渲染** | `<div class="wtc-pizhu" style="right: ...; top: ...">内容</div>` |
| **状态** | partial |

---

## 5. 装饰命令 (decoration)

装饰命令在布局阶段的统一处理方式：`placeItem(node)` 后调用 `advanceRowsByNodeText(node)` 按子节点纯文本长度推进光标。

### 5.1 `\圈点[options]{文字}` — 着重号

| 项目 | 内容 |
|------|------|
| **别名** | `EmphasisMark`, `着重号`, `著重號` |
| **参数** | `args: ['optional', 'required']`；可选：`color` |
| **AST** | `{ type: 'emphasis', options: {...}, children: [...] }` |
| **渲染** | `<span class="wtc-emphasis">文字</span>`<br>CSS: `text-emphasis: filled circle; text-emphasis-position: left;` |
| **状态** | full |

### 5.2 `\专名号[options]{文字}` — 直线下划线

| 项目 | 内容 |
|------|------|
| **别名** | `ProperNameMark`, `專名號`, `下划线`, `下劃線`, `Underline` |
| **参数** | `args: ['optional', 'required']` |
| **AST** | `{ type: 'properName', options: {...}, children: [...] }` |
| **渲染** | `<span class="wtc-proper-name">文字</span>` |
| **状态** | full |

### 5.3 `\书名号[options]{文字}` — 波浪线下划线

| 项目 | 内容 |
|------|------|
| **别名** | `BookTitleMark`, `書名號`, `波浪线`, `波浪線`, `WavyUnderline` |
| **参数** | `args: ['optional', 'required']` |
| **AST** | `{ type: 'bookTitle', options: {...}, children: [...] }` |
| **渲染** | `<span class="wtc-book-title-mark">文字</span>` |
| **状态** | full |

### 5.4 `\装饰[options]{文字}` — 通用装饰

| 项目 | 内容 |
|------|------|
| **别名** | `decorate`, `裝飾` |
| **参数** | `args: ['optional', 'required']`；可选：`char`, `color`, `xoffset`, `yoffset`, `scale` |
| **AST** | `{ type: 'decorate', options: {...}, children: [...] }` |
| **渲染** | `<span class="wtc-decorate">文字</span>` |
| **状态** | partial |

### 5.5 `\反白{文字}` — 反白

| 项目 | 内容 |
|------|------|
| **别名** | `inverted` |
| **参数** | `args: ['required']` |
| **AST** | `{ type: 'inverted', children: [...] }` |
| **渲染** | `<span class="wtc-inverted">文字</span>` |
| **状态** | full |

### 5.6 `\八角框{文字}` — 八角形边框

| 项目 | 内容 |
|------|------|
| **别名** | `octagon` |
| **参数** | `args: ['required']` |
| **AST** | `{ type: 'octagon', children: [...] }` |
| **渲染** | `<span class="wtc-octagon">文字</span>` |
| **状态** | full |

### 5.7 `\带圈{文字}` — 圆形边框

| 项目 | 内容 |
|------|------|
| **别名** | `circled`, `帶圈` |
| **参数** | `args: ['required']` |
| **AST** | `{ type: 'circled', children: [...] }` |
| **渲染** | `<span class="wtc-circled">文字</span>` |
| **状态** | full |

### 5.8 `\反白八角框{文字}` — 反白+八角框组合

| 项目 | 内容 |
|------|------|
| **别名** | `invertedOctagon` |
| **参数** | `args: ['required']` |
| **AST** | `{ type: 'invertedOctagon', children: [...] }` |
| **渲染** | `<span class="wtc-inverted wtc-octagon">文字</span>`（双 class） |
| **状态** | full |

### 5.9 `\改{替换字}` — 校勘标记

| 项目 | 内容 |
|------|------|
| **别名** | `fix` |
| **参数** | `args: ['required']` |
| **AST** | `{ type: 'fix', children: [...] }` |
| **布局** | 同其他装饰命令 |
| **渲染** | `<span class="wtc-fix">替换字</span>` |
| **状态** | full |

---

## 6. 布局控制命令 (layout)

### 6.1 `\空格[N]` — 全角空格

| 项目 | 内容 |
|------|------|
| **别名** | `Space` |
| **参数** | `args: ['optional']`；默认 N=1 |
| **AST** | `{ type: 'space', value: '3' }` |
| **布局** | `placeItem(node)` 后 `advanceRows(N)` |
| **渲染** | `'\u3000'.repeat(N)` — 输出 N 个全角空格字符 |
| **状态** | full |

### 6.2 `\换行` — 强制换列

| 项目 | 内容 |
|------|------|
| **别名** | `HuanHang`, `換行` |
| **参数** | `args: []` |
| **AST** | `{ type: 'columnBreak' }` |
| **布局** | 调用 `advanceColumn()`：`currentCol++`, `currentRow=0`，可能触发分页 |
| **渲染** | `<br class="wtc-column-break">` |
| **状态** | full |

> `\\`（双反斜杠）在 tokenizer 中生成 `NEWLINE` token，布局中同样调用 `advanceColumn()`。

### 6.3 `\抬头[N]` — 抬头

| 项目 | 内容 |
|------|------|
| **别名** | `TaiTou`, `抬頭` |
| **参数** | `args: ['optional']`；N 为抬头级数 |
| **AST** | `{ type: 'taitou', value: 'N' }` |
| **布局** | `advanceColumn()` 换到新列 → `currentRow = level` → 设置 `ignoreIndent = true`（本列忽略段落缩进）→ `placeItem(node)` |
| **渲染** | `<br class="wtc-newline"><span class="wtc-taitou" data-level="N"></span>` |
| **状态** | full |

### 6.4 `\平抬` / `\单抬` / `\双抬` / `\三抬` — 抬头快捷方式

| 命令 | 别名 | defaultOpt | 效果 |
|------|------|-----------|------|
| `\平抬` | 无 | `'0'` | 顶格书写 |
| `\单抬` | `單抬` | `'1'` | 高出 1 格 |
| `\双抬` | `雙抬` | `'2'` | 高出 2 格 |
| `\三抬` | 无 | `'3'` | 高出 3 格 |

这些命令 `args: []`（无参数），通过 `defaultOpt` 提供固定值。当用户未提供 `[N]` 时，`node.options = { value: defaultOpt }`。AST 和布局/渲染行为与 `\抬头[N]` 一致。

### 6.5 `\挪抬[N]` / `\空抬` — 行内空格

| 项目 | 内容 |
|------|------|
| **别名** | `NuoTai` / `KongTai` |
| **参数** | `\挪抬`: `args: ['optional']`；`\空抬`: `args: []`, `defaultOpt: '1'` |
| **AST** | `{ type: 'nuotai', value: 'N' }` |
| **布局** | `placeItem(node)` 后 `advanceRows(N)`（不换列，行内推进） |
| **渲染** | `'\u3000'.repeat(N)` |
| **状态** | full |

### 6.6 `\相对抬头[N]` — 相对抬头

| 项目 | 内容 |
|------|------|
| **别名** | `XiangDuiTaiTou`, `相對抬頭` |
| **参数** | `args: ['optional']` |
| **AST** | `{ type: 'taitou', value: 'N' }`（映射为同一 NodeType `TAITOU`） |
| **布局/渲染** | 同 `\抬头`，但语义上是相对于当前缩进的提升 |
| **状态** | partial |

### 6.7 `\设置缩进{N}` — 强制缩进

| 项目 | 内容 |
|------|------|
| **别名** | `SetIndent`, `設置縮進` |
| **参数** | `args: ['required']` |
| **AST** | `{ type: 'setIndent', value: 'N' }` |
| **布局** | `placeItem(node)` 放置，不推进光标（渲染时处理） |
| **渲染** | `<span class="wtc-set-indent" data-indent="N"></span>` |
| **状态** | full |

### 6.8 `\文本框[options]{内容}` — 文本框

| 项目 | 内容 |
|------|------|
| **别名** | `TextBox` |
| **参数** | `args: ['optional', 'required']`；可选：`height`, `n-cols`, `border`, `background-color`, `font-color`, `font-size`, `border-shape` |
| **AST** | `{ type: 'textbox', options: {...}, children: [...] }` |
| **布局** | `placeItem(node)` 后 `advanceRows(height)`，height 从 options 中提取 |
| **渲染** | `<span class="wtc-textbox" style="--wtc-textbox-height: N; ...">内容</span>` |
| **状态** | partial |

### 6.9 `\填充文本框[options]{内容}` — 均匀填充文本框

| 项目 | 内容 |
|------|------|
| **别名** | `FillTextBox` |
| **参数** | `args: ['optional', 'required']`；可选 `height` 或纯数字（旧语法，解析为 `value`） |
| **AST** | `{ type: 'fillTextbox', options: {...}, children: [...] }` |
| **布局** | 同 textbox：`placeItem` + `advanceRows(height)` |
| **渲染** | `<span class="wtc-textbox wtc-textbox-fill" style="--wtc-textbox-height: N">内容</span>` |
| **状态** | partial |

### 6.10 `\印章[options]{图片路径}` — 印章图片

| 项目 | 内容 |
|------|------|
| **别名** | `YinZhang` |
| **参数** | `args: ['optional', 'required']`；可选：`xshift`, `yshift`, `width`, `opacity` |
| **AST** | `{ type: 'stamp', options: {...}, src: '图片路径' }`（特殊处理：required arg 存入 `node.src`，不解析为子节点） |
| **布局** | 浮动元素：推入 `page.floats` |
| **渲染** | `<img class="wtc-stamp" src="..." style="position: absolute; right: ...; top: ..." alt="stamp">` |
| **状态** | partial |

---

## 7. 配置命令 (setup)

所有 Setup 命令共享统一的解析和处理路径：

1. **解析**：`def.node === 'setupCmd'` 触发特殊分支 → 读取参数 → `parseKeyValue()` 解析键值对 → 创建 `SETUP` 节点 → 推入 `doc.setupCommands`，不加入 AST children
2. **布局前**：`resolveConfig()` 遍历 `setupCommands`，通过 `setupParamMap` 将参数映射到 CSS 变量覆盖
3. **渲染**：`cssOverridesToStyleAttr()` 将 CSS 变量写入 `<div class="wtc-spread">` 的 `style` 属性

### 7.1 内容/页面/版心配置

| 命令 | setupType | 别名 | CSS 变量前缀 |
|------|-----------|------|-------------|
| `\contentSetup{...}` | `content` | `内容设置`, `內容設置` | `--wtc-font-*`, `--wtc-border-*`, `--wtc-line-height`, `--wtc-letter-spacing` |
| `\pageSetup{...}` | `page` | `页面设置`, `頁面設置` | `--wtc-page-*`, `--wtc-margin-*` |
| `\banxinSetup{...}` | `banxin` | `版心设置`, `版心設置` | `--wtc-banxin-*` |

### 7.2 批注类配置

| 命令 | setupType | 别名 | CSS 变量前缀 |
|------|-----------|------|-------------|
| `\jiazhuSetup{...}` | `jiazhu` | `夹注设置`, `夾注設置` | `--wtc-jiazhu-*` |
| `\sidenodeSetup{...}` | `sidenode` | `侧批设置`, `側批設置` | `--wtc-sidenote-*` |
| `\meipiSetup{...}` | `meipi` | `眉批设置`, `眉批設置` | `--wtc-meipi-*` |
| `\pizhuSetup{...}` | `pizhu` | `批注设置`, `批注設置` | `--wtc-pizhu-*` |

### 7.3 `\gujiSetup{template=模板名}` — 模板切换

| 项目 | 内容 |
|------|------|
| **别名** | `古籍设置`, `古籍設置` |
| **setupType** | `guji` |
| **行为** | 通过 `template` 参数切换 templateId，影响 gridConfig 和 CSS |
| **状态** | full |

### 7.4 句读模式切换

| 命令 | setupType | 别名 | 行为 |
|------|-----------|------|------|
| `\句读模式` | `judou-on` | `JudouOn`, `开启句读`, `開啟句讀`, `JudouPunctuationMode` | 设置 `punctMode = 'judou'`，布局阶段文本分离句读标点 |
| `\正常标点模式` | `judou-off` | `JudouOff`, `关闭句读`, `關閉句讀`, `NormalPunctuationMode` | 恢复 `punctMode = 'normal'` |
| `\无标点模式` | `judou-none` | `NonePunctuationMode`, `無標點模式` | 设置 `punctMode = 'none'` |

这三个命令 `args: ['optional']`，但通常不带参数使用。它们的 setupType 不在 `setupParamMap` 中，而是由 `resolveConfig()` 单独处理为 `config.punctMode`。

### 7.5 `\judouSetup{...}` — 句读配置

| 项目 | 内容 |
|------|------|
| **别名** | `句读设置`, `句讀設置` |
| **setupType** | `judou` |
| **状态** | none（已注册但未实现参数映射） |

---

## 8. 忽略命令 (ignored)

这些命令被 tokenizer 识别为 COMMAND token，commandRegistry 中标记 `ignore: true`。解析时消费参数后返回 `null`，不产生 AST 节点。

| 命令 | 参数 | 说明 |
|------|------|------|
| `\usepackage` / `\RequirePackage` | `['optional', 'required']` | TeX 包加载，Web 不需要 |
| `\setmainfont` / `设置字体` / `設置字體` | `['optional', 'required']` | 字体设置，CSS 控制 |
| `\pagestyle` | `['required']` | PDF 页面样式 |
| `\noindent` | `[]` | CSS 控制缩进 |
| `\par` | `[]` | 段落通过 HTML 结构表达 |
| `\relax` | `[]` | TeX 空操作 |
| `\ignorespaces` | `[]` | TeX 空格控制 |
| `\definecolor` | `['required', 'required', 'required']` | 颜色定义，CSS 替代 |
| `\AddToHook` | `['required', 'required']` | TeX Hook 系统 |
| `\禁用分页裁剪` / `disableSplitPage` | `[]` | Web 无此概念 |
| `\显示坐标` | `[]` | 调试功能 |
| `\LtcDebugOn` / `开启调试` / `開啟調試` | `[]` | 调试开关 |
| `\LtcDebugOff` / `关闭调试` / `關閉調試` | `[]` | 调试开关 |

---

## 9. 特殊机制

### 9.1 别名解析链

`resolveCommand()` 和 `resolveEnvironment()` 支持多级别名链，用 `visited` Set 防止循环引用。例如：

```
'JiaZhu' → alias '夹注' → 规范定义 { args, node, ... }
```

### 9.2 CJK 命令名陷阱

Tokenizer 遇到 `\` 后的 CJK 字符时，会贪婪地消费所有后续 CJK 字符作为命令名。因此 `\换行地` 被解析为命令名 `换行地`（未注册）。要分隔需使用 `\换行{}地` 或 `\换行 地`。

### 9.3 parseKeyValue 特殊行为

- 逗号分隔，等号赋值
- 无等号的键被视为布尔标记：`key → { key: 'true' }`
- 纯数字无等号被视为旧语法：`12 → { value: '12' }`
- 支持嵌套花括号：`color={180, 95, 75}`

### 9.4 布局标记系统 (LayoutMarker)

复合节点（段落、列表、目录条目）在布局中不作为单个 item 放置，而是发射 START/END 标记对。这使得内容可以跨页边界流动——渲染时通过 `markerStack` 在页面边界处正确关闭和重新打开 HTML 标签。

| 标记对 | 用途 |
|--------|------|
| `PARAGRAPH_START / END` | 段落包裹 |
| `LIST_START / END` | 列表包裹 |
| `LIST_ITEM_START / END` | 列表项包裹 |
| `MULU_ITEM_START / END` | 目录条目包裹 |

### 9.5 浮动元素

MEIPI、PIZHU、STAMP 三种类型在布局中推入 `page.floats`，不占据网格空间。渲染时在 spread 层级输出，通过绝对定位放置。

### 9.6 句读模式文本处理

`punctMode === 'judou'` 时，`walkText()` 逐字符扫描：
- 句号/逗号类标点 → 作为零宽度 `judou` item 附着到前一个字符的坐标
- `《》`/`〈〉` → 提取内容生成 `BOOK_TITLE` 节点
- 其他成对标点 → 跳过

渲染时 `judou` item 输出为 `<span class="wtc-judou wtc-judou-ju"></span>` 或 `wtc-judou-dou`。

---

## 10. NodeType 完整枚举

下表列出 `nodes.js` 中定义的所有节点类型及其来源命令：

| NodeType | 值 | 来源 |
|----------|-----|------|
| DOCUMENT | `'document'` | 根节点 |
| CONTENT_BLOCK | `'contentBlock'` | `\begin{正文}` |
| PARAGRAPH | `'paragraph'` | `\begin{段落}` |
| TEXT | `'text'` | CJK/ASCII 文本 |
| NEWLINE | `'newline'` | `\\` 双反斜杠 |
| JIAZHU | `'jiazhu'` | `\夹注`, `\按`, `\注`, `\標` 等 |
| SIDENOTE | `'sidenote'` | `\侧批` |
| MEIPI | `'meipi'` | `\眉批` |
| PIZHU | `'pizhu'` | `\批注` |
| TEXTBOX | `'textbox'` | `\文本框` |
| FILL_TEXTBOX | `'fillTextbox'` | `\填充文本框` |
| SPACE | `'space'` | `\空格` |
| COLUMN_BREAK | `'columnBreak'` | `\换行` |
| TAITOU | `'taitou'` | `\抬头`, `\平抬` ~ `\三抬`, `\相对抬头` |
| NUOTAI | `'nuotai'` | `\挪抬`, `\空抬` |
| SET_INDENT | `'setIndent'` | `\设置缩进` |
| EMPHASIS | `'emphasis'` | `\圈点` |
| PROPER_NAME | `'properName'` | `\专名号` |
| BOOK_TITLE | `'bookTitle'` | `\书名号`, 句读模式 `《》` |
| INVERTED | `'inverted'` | `\反白` |
| OCTAGON | `'octagon'` | `\八角框` |
| CIRCLED | `'circled'` | `\带圈` |
| INVERTED_OCTAGON | `'invertedOctagon'` | `\反白八角框` |
| FIX | `'fix'` | `\改` |
| DECORATE | `'decorate'` | `\装饰` |
| LIST | `'list'` | `\begin{列表}` |
| LIST_ITEM | `'listItem'` | `\item` 分组 |
| SETUP | `'setup'` | 所有 Setup 命令 |
| STAMP | `'stamp'` | `\印章` |
| MATH | `'math'` | `$...$` |
| PARAGRAPH_BREAK | `'paragraphBreak'` | 空行 |
| MULU_ITEM | `'muluItem'` | `\条目` |
| UNKNOWN | `'unknown'` | 未知环境 |
