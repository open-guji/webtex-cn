# 下一步开发计划

> 基于计划文档 (doc/01-06) 与实际实现的对比分析，按优先级排列

## 当前状态

- **104 个测试全部通过**（5 个测试文件，含快照回归测试）
- 核心管线完整：Tokenizer → Parser → AST → HTMLRenderer → HTML+CSS
- 4 个 CSS 模板，4 个示例，esbuild 构建系统，Node.js CLI
- **所有 P0-P3 计划项目已完成**
- ESLint + Prettier 代码规范已配置

### 完成记录
- ✅ P0-1 ~ P0-4：Setup 命令生效、抬头 CSS、版心书名、段落 first-indent
- ✅ P1-1 ~ P1-6：双半页布局、API、侧批 yoffset、眉批 height、夹注 inward、文本框选项
- ✅ P2-1 ~ P2-4：CLI 工具、minimal 模板、响应式 CSS、长夹注分段
- ✅ P3-1: MATH 令牌 ($...$)
- ✅ P3-2: 空行段落分隔
- ✅ P3-3: 自动模板 CSS 加载
- ✅ P3-5: 快照回归测试
- ✅ P3-6: ESLint + Prettier

### 未实现（已评估后跳过）
- P3-4: 虚拟滚动 — 当前文档规模不需要，留待实际需求出现时实现

---

## 优先级 P0：影响正确渲染的功能缺陷

这些问题导致某些 TeX 命令虽然被解析但无视觉效果，属于"已承诺但未交付"。

### P0-1. Setup 命令未生效（死代码）

**现状**：`\contentSetup{font-size=24pt}`、`\pageSetup{...}` 等 9 个 setup 命令被解析并存储在 `doc.setupCommands` 数组中，但**从未应用到渲染输出**。

**需要实现**：
1. 在 `HTMLRenderer` 构造函数中读取 `ast.setupCommands`
2. 实现 `applySetupOverrides()` 方法，将 setup 参数映射为 CSS 变量
3. 在 `renderContentBlock()` 输出的 `wtc-spread` 上注入 `style` 属性

**参数映射表**（参考 doc/04-template-system.md §4.3）：

| Setup 命令 | 参数 | CSS 变量 |
|------------|------|----------|
| `contentSetup` | `font-size` | `--wtc-font-size` |
| `contentSetup` | `line-height` | `--wtc-line-height` |
| `contentSetup` | `n-column` | `--wtc-n-column` |
| `contentSetup` | `border` | `--wtc-border-show` |
| `contentSetup` | `border-color` | `--wtc-border-color` |
| `pageSetup` | `page-width` | `--wtc-page-width` |
| `pageSetup` | `page-height` | `--wtc-page-height` |
| `pageSetup` | `margin-top` | `--wtc-margin-top` |
| `banxinSetup` | `width` | `--wtc-banxin-width` |
| `jiazhuSetup` | `font-size` | `--wtc-jiazhu-font-size` |
| `jiazhuSetup` | `color` | `--wtc-jiazhu-color` |
| `sidenodeSetup` | `color` | `--wtc-sidenote-color` |
| `sidenodeSetup` | `font-size` | `--wtc-sidenote-font-size` |
| `meipiSetup` | `color` | `--wtc-meipi-color` |
| `pizhuSetup` | `color` | `--wtc-pizhu-color` |
| `gujiSetup` | `template` | 触发模板切换 |

**涉及文件**：
- `src/renderer/html-renderer.js` — 新增 `applySetupOverrides()` 方法
- `src/templates/base.css` — 可能需要补充缺失的 CSS 变量

**测试**：
- 测试 `\contentSetup{font-size=18px}` 后输出 HTML 包含 `--wtc-font-size: 18px`
- 测试 `\gujiSetup{template=红楼梦甲戌本}` 后 `templateId` 变为 `honglou`

---

### P0-2. 抬头（Taitou）视觉无效

**现状**：`\平抬`、`\单抬`、`\双抬`、`\三抬` 被解析为 `<br><span class="wtc-taitou" data-level="N"></span>`，但 CSS 仅设置 `width:0; height:0`，无偏移效果。

**需要实现**：

方案：通过 `data-level` 属性选择器实现 CSS 偏移

```css
/* base.css 中替换现有 .wtc-taitou 规则 */
.wtc-taitou {
  display: inline-block;
}

.wtc-taitou[data-level="0"] {
  /* 平抬：换行但不缩进 */
}

.wtc-taitou[data-level="1"] {
  /* 单抬：上方留 1 格空白 */
  margin-block-start: calc(-1 * var(--wtc-grid-height));
}

.wtc-taitou[data-level="2"] {
  margin-block-start: calc(-2 * var(--wtc-grid-height));
}

.wtc-taitou[data-level="3"] {
  margin-block-start: calc(-3 * var(--wtc-grid-height));
}
```

> 注意：竖排模式下 `margin-block-start` 对应物理方向的上方偏移。需要实际测试确认偏移方向是否正确，可能需要用 `padding-block-start` 或负 margin 调试。

**涉及文件**：
- `src/templates/base.css` — 修改 `.wtc-taitou` 规则

**测试**：
- 验证 `\单抬` 输出的 HTML 包含 `data-level="1"`（已有）
- 视觉测试：在 demo 页面中确认偏移效果

---

### P0-3. 版心（Banxin）缺少书名和页码

**现状**：`renderBanxin()` 只输出 `wtc-banxin-chapter`（章节名），不输出 `\title` 设定的书名，也没有页码。

**需要实现**：
1. 在 `wtc-banxin-middle` 区域加入 `wtc-banxin-book-name` 显示 `ast.title`
2. 在 `wtc-banxin-lower` 区域加入页码（暂时可硬编码为空或留占位符）

**修改后的 `renderBanxin()`**：
```javascript
renderBanxin() {
  if (!this.ast.title && !this.ast.chapter) return '';
  const title = escapeHTML(this.ast.title || '');
  const chapter = escapeHTML(this.ast.chapter || '').replace(/\n/g, '<br>');
  return `<div class="wtc-banxin">
  <div class="wtc-banxin-section wtc-banxin-upper">
    <div class="wtc-yuwei wtc-yuwei-upper"></div>
  </div>
  <div class="wtc-banxin-section wtc-banxin-middle">
    <span class="wtc-banxin-book-name">${title}</span>
    <span class="wtc-banxin-chapter">${chapter}</span>
  </div>
  <div class="wtc-banxin-section wtc-banxin-lower">
    <div class="wtc-yuwei wtc-yuwei-lower"></div>
  </div>
</div>`;
}
```

**涉及文件**：
- `src/renderer/html-renderer.js` — 修改 `renderBanxin()`
- `src/templates/base.css` — 添加 `.wtc-banxin-book-name` 样式

**测试**：
- 验证输出包含 `wtc-banxin-book-name` 和书名文字

---

### P0-4. 段落 `first-indent` 无 CSS 消费

**现状**：`\begin{段落}[indent=2, first-indent=1]` 会输出 `style="--wtc-indent: 2; --wtc-first-indent: 1;"`，但 `base.css` 中没有读取 `--wtc-first-indent` 的规则。

**需要实现**：

```css
/* base.css 中 .wtc-paragraph 规则后追加 */
.wtc-paragraph > *:first-child {
  padding-block-start: calc(var(--wtc-first-indent, var(--wtc-indent, 0)) * var(--wtc-grid-height));
}
```

> 注意：竖排模式下"首行缩进"的实际效果需要实测。由于段落是 `display: inline`，first-child 选择器可能不生效。需要考虑将段落改为 `display: inline-block` 或用其他方式实现。

**涉及文件**：
- `src/templates/base.css`

---

## 优先级 P1：计划中明确要求但未实现的功能

### P1-1. 双半页布局

**现状**：`renderContentBlock()` 只输出 `wtc-half-right`，没有 `wtc-half-left`。

**需要实现**：
1. 修改 `renderContentBlock()` 输出两个半页
2. 内容目前不需要自动分页，左半页可以暂时为空或镜像

**方案 A（简单）**：输出两个半页，右半页有内容，左半页为空白占位
```html
<div class="wtc-spread">
  {floating}
  <div class="wtc-half-page wtc-half-right">
    <div class="wtc-content-border"><div class="wtc-content">{inner}</div></div>
  </div>
  {banxin}
  <div class="wtc-half-page wtc-half-left">
    <div class="wtc-content-border"><div class="wtc-content"></div></div>
  </div>
</div>
```

**方案 B（完整）**：实现内容自动分页，溢出内容流入左半页
这需要在浏览器环境中计算文本溢出，复杂度较高，可以后续实现。

**建议**：先实现方案 A，视觉上形成完整的双半页布局。

**涉及文件**：
- `src/renderer/html-renderer.js` — 修改 `renderContentBlock()`
- `src/templates/base.css` — 添加 `.wtc-half-left` 样式

---

### P1-2. `WebTeX.setTemplate()` 和 `getTemplates()` API

**现状**：`window.WebTeX` 只暴露 `render`, `renderToDOM`, `renderToHTML`, `renderToPage`, `parse`。

**需要实现**：

```javascript
// src/index.js 中新增

const templates = {
  'siku-quanshu': '四库全书 (黑白)',
  'siku-quanshu-colored': '四库全书 (彩色)',
  'honglou': '红楼梦甲戌本',
};

export function getTemplates() {
  return Object.entries(templates).map(([id, name]) => ({ id, name }));
}

export function setTemplate(templateId) {
  // 移除旧模板样式
  const old = document.querySelector('link[data-wtc-template]');
  if (old) old.remove();
  // 创建新 link
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${templateId}.css`; // 用户需自行配置路径
  link.dataset.wtcTemplate = templateId;
  document.head.appendChild(link);
}
```

> 注意：`setTemplate` 的 CSS 路径问题需要考虑。可以让用户提供 base URL，或者在 `renderToDOM` 时自动注入。

**涉及文件**：
- `src/index.js` — 新增两个函数并注册到 `window.WebTeX`

**测试**：
- `getTemplates()` 返回 3 个模板对象
- `setTemplate('honglou')` 在 DOM 中创建正确的 `<link>`

---

### P1-3. 侧批 `yoffset` 参数

**现状**：`buildStyleFromOptions` 中 `yoffset: null` 标记为"handled separately"，但实际从未处理。

**需要实现**：
```javascript
// renderSidenote() 中
if (opts.yoffset) {
  style += `margin-block-start: ${opts.yoffset};`;
}
```

**涉及文件**：
- `src/renderer/html-renderer.js` — 修改 `renderSidenote()`

---

### P1-4. 眉批 `height` 参数 + 多眉批防重叠

**现状**：`\眉批[x=2cm, height=6]{...}` 的 `height` 被忽略。多个眉批可能重叠。

**需要实现**：
1. `renderMeipi()` 中读取 `opts.height` 并输出为 `height` 或 `inline-size` 样式
2. 防重叠：简单方案是自动递增 `right` 值（在渲染器中维护一个 meipi 计数器）

```javascript
// HTMLRenderer 构造函数中
this.meipiCount = 0;

// renderMeipi() 中
if (!opts.x) {
  // 自动分配 x 位置，避免重叠
  const autoX = this.meipiCount * 2; // 每个眉批间隔 2em
  style += `right: ${autoX}em;`;
  this.meipiCount++;
}
if (opts.height) style += `height: ${opts.height};`;
```

**涉及文件**：
- `src/renderer/html-renderer.js` — 修改 `renderMeipi()`

---

### P1-5. 夹注 `inward` 对齐模式

**现状**：`splitJiazhu(text, align)` 的 `align` 参数不起作用，始终用 `Math.ceil`。

**需要实现**：
```javascript
function splitJiazhu(text, align = 'outward') {
  const chars = [...text];
  if (chars.length <= 1) return { col1: chars[0] || '', col2: '' };

  const mid = align === 'inward'
    ? Math.floor(chars.length / 2)  // inward: 前列少，后列多
    : Math.ceil(chars.length / 2);  // outward: 前列多，后列少

  return {
    col1: chars.slice(0, mid).join(''),
    col2: chars.slice(mid).join(''),
  };
}
```

**涉及文件**：
- `src/renderer/html-renderer.js` — 修改 `splitJiazhu()`

**测试**：
- `splitJiazhu('六字测试文本', 'outward')` → col1=3字, col2=3字
- `splitJiazhu('七个字的文本串', 'inward')` → col1=3字, col2=4字

---

### P1-6. 文本框完整选项

**现状**：`\文本框` 只支持 `height` 参数，计划中还有 `n-cols`, `border`, `background-color`, `font-color`, `font-size`, `border-shape`。

**需要实现**（按需逐个添加）：
```javascript
// renderTextbox() 中
if (opts.border === 'true' || opts.border === true) {
  style += 'border: 1px solid var(--wtc-border-color);';
}
if (opts['background-color']) {
  style += `background-color: ${this.parseColor(opts['background-color'])};`;
}
if (opts['font-color']) {
  style += `color: ${this.parseColor(opts['font-color'])};`;
}
if (opts['font-size']) {
  style += `font-size: ${opts['font-size']};`;
}
```

**涉及文件**：
- `src/renderer/html-renderer.js` — 修改 `renderTextbox()` 和 `renderFillTextbox()`

---

## 优先级 P2：增强功能和工具链

### P2-1. Node.js CLI 工具

**计划内容**：
- `npx webtex-cn build input.tex -o output/` — 预编译为静态 HTML
- `npx webtex-cn serve input.tex` — 本地预览服务器

**需要实现**：
1. 创建 `bin/webtex-cn.js`，使用 `#!/usr/bin/env node`
2. 在 `package.json` 中添加 `"bin": { "webtex-cn": "bin/webtex-cn.js" }`
3. `build` 子命令：读取 .tex 文件 → `renderToPage()` → 写入 .html 文件 + 复制 CSS
4. `serve` 子命令：启动简易 HTTP 服务器，可使用 Node 内置 `http` 模块

**涉及文件**：
- 新建 `bin/webtex-cn.js`
- `package.json` — 添加 `bin` 字段

**依赖**：无新依赖，使用 Node.js 内置模块 (`fs`, `path`, `http`)

---

### P2-2. `minimal.css` 模板

**计划内容**：极简模板，无边框无装饰。

**需要实现**：
```css
/* src/templates/minimal.css */
:root {
  --wtc-border-show: 0;
  --wtc-border-thickness: 0;
  --wtc-outer-border-thickness: 0;
  --wtc-page-background: #fff;
  --wtc-font-size: 18px;
  --wtc-banxin-width: 0px;
}
```

**涉及文件**：
- 新建 `src/templates/minimal.css`
- `src/renderer/html-renderer.js` — `templateCSSMap` 添加 `'极简': 'minimal'`
- `examples/index.html` — 模板下拉框添加选项
- `build.js` — 自动包含新模板

---

### P2-3. 响应式 / 移动端 CSS

**计划内容**：`@media (max-width: 768px)` 缩放页面。

**需要实现**：
```css
/* base.css 末尾追加 */
@media (max-width: 768px) {
  :root {
    --wtc-page-width: 95vw;
    --wtc-page-height: auto;
    --wtc-font-size: 16px;
    --wtc-margin-top: 20px;
    --wtc-margin-bottom: 20px;
    --wtc-margin-left: 15px;
    --wtc-margin-right: 15px;
  }
  .wtc-page { box-shadow: none; margin: 5px auto; }
  .wtc-banxin { display: none; }
}
```

**涉及文件**：
- `src/templates/base.css`

---

### P2-4. 长夹注多列分段算法

**计划内容**（doc/03 §3.2）：当夹注文字超过一定长度时，应分成多个双列段。

**需要实现**：
```javascript
function splitJiazhuMulti(text, maxCharsPerCol = 20, align = 'outward') {
  const chars = [...text];
  if (chars.length <= maxCharsPerCol * 2) {
    return [splitJiazhu(text, align)];
  }
  // 按 maxCharsPerCol * 2 分段
  const segments = [];
  for (let i = 0; i < chars.length; i += maxCharsPerCol * 2) {
    const chunk = chars.slice(i, i + maxCharsPerCol * 2).join('');
    segments.push(splitJiazhu(chunk, align));
  }
  return segments;
}
```

然后在 `renderJiazhu()` 中，如果返回多个段，连续输出多个 `wtc-jiazhu` span。

**涉及文件**：
- `src/renderer/html-renderer.js` — 新增 `splitJiazhuMulti()`，修改 `renderJiazhu()`

---

## 优先级 P3：锦上添花 / 远期规划

### P3-1. MATH 令牌类型（`$...$`）

**现状**：Tokenizer 不识别 `$` 数学模式。

**实现思路**：
1. 在 Tokenizer 中检测 `$`，读取到配对的 `$`，生成 `MATH` 令牌
2. 渲染为 `<span class="wtc-math">...</span>` 或集成 KaTeX/MathJax
3. 优先级低，因为古籍文本极少使用数学公式

---

### P3-2. 空行段落分隔

**现状**：连续空行被当作普通空白处理。

**实现思路**：
1. Tokenizer 的 `readText()` 中检测 `\n\n`（连续两个换行）
2. 生成 `PARAGRAPH_BREAK` 令牌
3. Parser 据此分隔文本块

> 优先级低：luatex-cn 的 .tex 文件主要使用 `\\` 和 `\begin{段落}` 来控制段落。

---

### P3-3. 自动模板加载

**现状**：解析 `\documentclass[四库全书]{ltc-guji}` 后，库代码不会自动加载对应 CSS 文件。demo 页面手动处理。

**实现思路**：
1. 在 `renderToDOM()` 中，检测 `ast.template`
2. 自动创建 `<link>` 标签加载对应模板 CSS
3. 需要用户提供 CSS 基础路径（通过配置选项）

```javascript
export function renderToDOM(texSource, container, options = {}) {
  const { cssBasePath = '' } = options;
  const { ast } = parse(texSource);
  const renderer = new HTMLRenderer(ast);
  // 自动注入模板 CSS
  if (cssBasePath && renderer.templateId) {
    injectTemplateCSS(cssBasePath, renderer.templateId);
  }
  // ...
}
```

---

### P3-4. 虚拟滚动 / 大文件分段渲染

**现状**：所有内容一次性渲染，大文件可能卡顿。

**实现思路**：
1. 使用 `IntersectionObserver` 检测可见区域
2. 将内容按页分割，只渲染可见页
3. 优先级最低，当前示例文件都不大

---

### P3-5. luatex-cn 示例文件回归测试

**现状**：只有自建的 4 个示例文件用于测试。

**实现思路**：
1. 从 luatex-cn 仓库的 `examples/` 目录获取 .tex 文件
2. 创建快照测试：解析 → 渲染 → 与预期 HTML 对比
3. 可以用 Vitest 的 `toMatchSnapshot()` 功能

---

### P3-6. ESLint + Prettier 配置

已在 Phase 1 计划但未执行。可随时添加：
```bash
npm install -D eslint prettier eslint-config-prettier
```

创建 `.eslintrc.json` 和 `.prettierrc`。

---

## 实施顺序建议

```
第一轮（修复已有功能）：
  P0-1 Setup 命令生效
  P0-2 抬头 CSS 修复
  P0-3 版心书名+页码
  P0-4 段落 first-indent CSS

第二轮（补齐核心功能）：
  P1-1 双半页布局
  P1-2 setTemplate/getTemplates API
  P1-3 侧批 yoffset
  P1-4 眉批 height + 防重叠
  P1-5 夹注 inward 对齐
  P1-6 文本框完整选项

第三轮（工具链+增强）：
  P2-1 Node.js CLI
  P2-2 minimal.css 模板
  P2-3 响应式 CSS
  P2-4 长夹注多列分段

第四轮（远期）：
  P3-1 ~ P3-6（按需）
```

每完成一个小步骤立即 commit 并更新测试。

---

## 文件变更清单

| 优先级 | 需修改的文件 | 需新建的文件 |
|--------|-------------|-------------|
| P0-1 | `html-renderer.js`, `base.css` | — |
| P0-2 | `base.css` | — |
| P0-3 | `html-renderer.js`, `base.css` | — |
| P0-4 | `base.css` | — |
| P1-1 | `html-renderer.js`, `base.css` | — |
| P1-2 | `index.js` | — |
| P1-3 | `html-renderer.js` | — |
| P1-4 | `html-renderer.js` | — |
| P1-5 | `html-renderer.js` | — |
| P1-6 | `html-renderer.js` | — |
| P2-1 | `package.json` | `bin/webtex-cn.js` |
| P2-2 | `html-renderer.js`, `index.html`, `build.js` | `src/templates/minimal.css` |
| P2-3 | `base.css` | — |
| P2-4 | `html-renderer.js` | — |
