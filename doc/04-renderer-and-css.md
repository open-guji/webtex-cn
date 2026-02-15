# 渲染器与 CSS 设计

> 阶段 4：HTMLRenderer 将 LayoutResult 转换为 HTML+CSS 竖排页面

## 1. 设计定位

HTMLRenderer 是流水线的最后一个阶段，负责将布局引擎产出的 LayoutResult 转换为可在浏览器中显示的 HTML 字符串。这个阶段的核心原则是**纯视觉、无布局计算**——所有位置决策已由 GridLayoutEngine 完成，渲染器只做 HTML 拼接和 CSS 类名注入。

渲染器需要解决的关键问题：

- 将扁平的 items 列表转换为嵌套的 HTML 结构
- 处理 LayoutMarker 的跨页标签平衡
- 将布局引擎预计算的夹注分段数据渲染为双列 HTML
- 生成版心（banxin）、浮动元素（眉批、批注、印章）等辅助结构
- 注入 CSS 变量覆盖（来自 setup 命令）

## 2. HTMLRenderer 核心流程

文件位置：`src/renderer/html-renderer.js`

### 2.1 renderFromLayout：主入口

```javascript
renderFromLayout(layoutResult) {
  const config = layoutResult.config;
  const setupStyles = cssOverridesToStyleAttr(config.cssOverrides);
  const banxin = this.renderBanxinFromMeta(config.meta);

  let carryStack = [];    // 跨页 Marker 栈
  const pages = [];

  for (const page of layoutResult.pages) {
    const boundary = page.halfBoundary ?? page.items.length;
    const rightItems = page.items.slice(0, boundary);
    const leftItems = page.items.slice(boundary);

    // 渲染右半页，继承前一页的 carryStack
    const right = this.renderLayoutItems(rightItems, carryStack);
    // 渲染左半页，继承右半页的未闭合标签
    const left = this.renderLayoutItems(leftItems, right.openStack);
    // 左半页的未闭合标签传递到下一页
    carryStack = left.openStack;

    const floatsHTML = page.floats.map(f => this.renderNode(f)).join('\n');

    // 右半页: content 在右侧, banxin 在左侧
    pages.push(`<div class="wtc-spread wtc-spread-right"${setupStyles}>
${floatsHTML}<div class="wtc-half-page wtc-half-right">
<div class="wtc-content-border"><div class="wtc-content">${right.html}</div></div>
</div>${banxin}
</div>`);

    // 左半页: content 在左侧, banxin 在右侧
    pages.push(`<div class="wtc-spread wtc-spread-left"${setupStyles}>
<div class="wtc-half-page wtc-half-left">
<div class="wtc-content-border"><div class="wtc-content">${left.html}</div></div>
</div>${banxin}
</div>`);
  }
  return pages;
}
```

输出是一个字符串数组，每两个元素构成一个完整版面（右半页 + 左半页）。调用方（`src/index.js`）将每个字符串包裹在 `<div class="wtc-page">` 中。

### 2.2 每个版面输出两个 wtc-page

布局引擎的一个 page 对应一个物理版面（spread），包含右半页和左半页。渲染器将其拆分为两个独立的 `wtc-spread` 元素，分别用 `wtc-spread-right` 和 `wtc-spread-left` 类标记：

- `wtc-spread-right`：使用 `flex-direction: row-reverse`，内容在右侧，版心在左侧
- `wtc-spread-left`：使用 `flex-direction: row`，版心在右侧，内容在左侧

## 3. Marker 栈重建：跨页 HTML 标签平衡

### 3.1 问题

段落、列表等复合节点在布局中使用 LayoutMarker（START/END）标记。当内容跨越半页边界或页面边界时，START 和 END 标记可能分布在不同的半页中。直接将 items 转为 HTML 会导致标签不平衡。

### 3.2 解决方案

`renderLayoutItems()` 维护一个标签栈（marker stack），并返回未闭合的标签列表：

```javascript
renderLayoutItems(items, markerStack = []) {
  let html = '';

  // 1. 重新打开继承的标签
  for (const entry of markerStack) {
    html += this.markerOpenTag(entry);
  }
  const stack = [...markerStack];

  // 2. 遍历 items
  for (const item of items) {
    const type = item.node.type;
    if (this.isOpenMarker(type)) {
      html += this.markerOpenTag(item);
      stack.push(item);
    } else if (this.matchingOpenMarker(type)) {
      html += this.markerCloseTag(this.matchingOpenMarker(type));
      // 从栈中弹出匹配的 open marker
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].node.type === this.matchingOpenMarker(type)) {
          stack.splice(i, 1);
          break;
        }
      }
    } else {
      html += this.renderLayoutItem(item);
    }
  }

  // 3. 关闭所有未匹配的标签
  const unclosed = [...stack];
  for (let i = stack.length - 1; i >= 0; i--) {
    html += this.markerCloseTag(stack[i].node.type);
  }

  return { html, openStack: unclosed };
}
```

### 3.3 标签映射

| Marker 类型 | 打开标签 | 关闭标签 |
|------------|---------|---------|
| PARAGRAPH_START | `<span class="wtc-paragraph">` 或带缩进的 `<span class="wtc-paragraph wtc-paragraph-indent" style="...">` | `</span>` |
| LIST_START | `<span class="wtc-list">` | `</span>` |
| LIST_ITEM_START | `<span class="wtc-list-item">` | `</span>` |
| MULU_ITEM_START | `<span class="wtc-mulu-item" style="padding-inline-start: ...">` | `</span>` |

注意所有容器都使用 `<span>` 而非 `<div>`。这是因为在 `writing-mode: vertical-rl` 中，`<span>` 作为 inline 元素参与竖排流，而 `<div>` 的 block 行为会破坏列内排版。

### 3.4 跨页流转示例

假设一个段落跨越右半页和左半页：

```
右半页 items:
  PARAGRAPH_START { indent: 2 }
  TEXT("天地玄黄")
  TEXT("宇宙洪荒")

左半页 items:
  TEXT("日月盈昃")
  PARAGRAPH_END
```

渲染过程：

```
右半页渲染:
  → 打开 <span class="wtc-paragraph wtc-paragraph-indent" style="...">
  → 渲染 "天地玄黄" "宇宙洪荒"
  → 半页结束，栈中有未闭合的 PARAGRAPH_START → 关闭 </span>
  → openStack = [PARAGRAPH_START item]

左半页渲染 (继承 openStack):
  → 重新打开 <span class="wtc-paragraph wtc-paragraph-indent" style="...">
  → 渲染 "日月盈昃"
  → 遇到 PARAGRAPH_END → 关闭 </span>
  → openStack = []
```

每个半页的 HTML 都是标签平衡的。

## 4. 页面结构 HTML

### 4.1 完整的页面 DOM 层次

```html
<div class="wtc-page" data-template="siku-quanshu">

  <!-- 右半页 (第一个 wtc-spread) -->
  <div class="wtc-spread wtc-spread-right" style="--wtc-font-size: 20px">
    <!-- 浮动元素 (眉批、批注、印章) -->
    <div class="wtc-meipi" style="right: 2em">批注内容...</div>

    <!-- 半页内容 -->
    <div class="wtc-half-page wtc-half-right">
      <div class="wtc-content-border">
        <div class="wtc-content">
          <!-- 竖排正文内容 -->
          黄帝者<span class="wtc-jiazhu">...</span>少典之子
        </div>
      </div>
    </div>

    <!-- 版心 -->
    <div class="wtc-banxin">
      <div class="wtc-banxin-section wtc-banxin-upper">
        <span class="wtc-banxin-book-name">欽定四庫全書</span>
        <div class="wtc-yuwei wtc-yuwei-upper"></div>
      </div>
      <div class="wtc-banxin-section wtc-banxin-middle">
        <div class="wtc-banxin-chapter">
          <span class="wtc-banxin-chapter-part">史記卷一</span>
        </div>
      </div>
      <div class="wtc-banxin-section wtc-banxin-lower">
        <div class="wtc-yuwei wtc-yuwei-lower"></div>
      </div>
    </div>
  </div>

  <!-- 左半页 (第二个 wtc-spread) -->
  <div class="wtc-spread wtc-spread-left" style="--wtc-font-size: 20px">
    <div class="wtc-half-page wtc-half-left">
      <div class="wtc-content-border">
        <div class="wtc-content">...</div>
      </div>
    </div>
    <div class="wtc-banxin">...</div>
  </div>

</div>
```

### 4.2 层次说明

| 层次 | CSS 类 | 职责 |
|------|-------|------|
| wtc-page | 最外层容器 | 页面尺寸、背景、阴影 |
| wtc-spread | 版面布局 | flex 容器，控制内容和版心的左右顺序 |
| wtc-half-page | 半页容器 | flex: 1，承载边框和内容 |
| wtc-content-border | 外边框（界栏） | 双层边框结构 |
| wtc-content | 内容区 | writing-mode: vertical-rl，实际竖排区域 |
| wtc-banxin | 版心 | 书名、章节、鱼尾装饰 |

## 5. CSS 竖排布局策略

### 5.1 核心 CSS 属性

```css
.wtc-content {
  writing-mode: vertical-rl;     /* 竖排：字符从上到下，列从右到左 */
  text-orientation: upright;     /* CJK 字符保持直立（非旋转） */
  font-size: var(--wtc-font-size);
  line-height: var(--wtc-line-height);    /* 控制列间距 */
  letter-spacing: var(--wtc-letter-spacing); /* 控制字间距 */
}
```

### 5.2 竖排坐标映射

在 `writing-mode: vertical-rl` 下，CSS 的逻辑属性与物理属性的映射发生变化：

| CSS 逻辑属性 | 横排对应 | 竖排 (vertical-rl) 对应 |
|-------------|---------|----------------------|
| inline-size | width | height (列的高度方向) |
| block-size | height | width (列的宽度方向) |
| inline direction | 从左到右 → | 从上到下 ↓ |
| block direction | 从上到下 ↓ | 从右到左 ← |
| margin-inline-start | margin-left | margin-top |
| margin-block-start | margin-top | margin-right |
| padding-block-start | padding-top | padding-right |

### 5.3 换列机制

在竖排模式中，`<br>` 标签创建换行（即新列，在左边），`inline-block` 或 `inline-flex` 元素创建独立的子网格单元。布局引擎中的换列操作对应渲染器输出的 `<br class="wtc-newline">`。

### 5.4 乌丝栏（列间界线）

列间的竖线不使用真实的 DOM 元素，而是通过 CSS 背景渐变实现：

```css
.wtc-content {
  --wtc-col-width: calc(var(--wtc-font-size) * var(--wtc-line-height));
  background-image: repeating-linear-gradient(to left,
    transparent 0,
    transparent calc(var(--wtc-col-width) - var(--wtc-border-thickness)),
    var(--wtc-border-color) calc(var(--wtc-col-width) - var(--wtc-border-thickness)),
    var(--wtc-border-color) var(--wtc-col-width)
  );
}
```

这种方案比 `column-rule` 更可靠，因为内容区域不使用 CSS columns 布局，而是依赖 `writing-mode` 的自然换列。

## 6. CSS 变量系统

### 6.1 变量分层

```
层级 1: base.css      — :root 中定义所有变量的默认值
层级 2: template.css   — 模板覆盖特定变量 (如 honglou.css)
层级 3: inline style   — 运行时由 setup 命令注入 (通过 cssOverridesToStyleAttr)
```

### 6.2 完整变量清单

**页面与网格**

| 变量 | 默认值 | 说明 |
|------|-------|------|
| --wtc-n-rows | 21 | 每列字符数 |
| --wtc-n-cols | 8 | 每半页列数 |
| --wtc-page-width | (计算值) | 页面宽度 |
| --wtc-page-height | (计算值) | 页面高度 |
| --wtc-margin-top/bottom/left/right | 60px/40px/50px/50px | 页面边距 |
| --wtc-grid-width | calc(font-size * line-height) | 网格宽度（列宽） |
| --wtc-grid-height | calc(font-size * (1 + letter-spacing-ratio)) | 网格高度（字高） |

**排版**

| 变量 | 默认值 | 说明 |
|------|-------|------|
| --wtc-font-family | "Noto Serif SC", ... | 字体族 |
| --wtc-font-size | 22px | 正文字号 |
| --wtc-line-height | 1.9 | 行高（竖排中为列间距比） |
| --wtc-letter-spacing-ratio | 0.05 | 字间距比例 |
| --wtc-letter-spacing | calc(ratio * 1em) | 字间距 |
| --wtc-font-color | #1a1a1a | 正文字色 |

**边框**

| 变量 | 默认值 | 说明 |
|------|-------|------|
| --wtc-border-show | 1 | 是否显示界栏 |
| --wtc-border-thickness | 0.5px | 内边框（乌丝栏）粗细 |
| --wtc-border-color | #333 | 边框颜色 |
| --wtc-outer-border-thickness | 3px | 外边框粗细 |
| --wtc-outer-border-sep | 3px | 外边框与内容间距 |
| --wtc-border-padding-top/bottom | 8px/8px | 边框内上下边距 |

**夹注**

| 变量 | 默认值 | 说明 |
|------|-------|------|
| --wtc-jiazhu-font-size | 0.7em | 夹注字号 |
| --wtc-jiazhu-letter-spacing | (计算值) | 夹注字间距（确保网格对齐） |
| --wtc-jiazhu-line-height | calc(line-height / 2) | 夹注行高 |
| --wtc-jiazhu-color | inherit | 夹注字色 |
| --wtc-jiazhu-gap | 0px | 双列间距 |

夹注字间距的计算确保夹注字符的总高度（font-size + letter-spacing）与主文本网格高度一致：

```
主文本网格高度 = font-size * (1 + letter-spacing-ratio)
夹注需要:  jiazhu-font-size * (1 + jiazhu-ls-ratio) = 网格高度
→ jiazhu-ls = (0.3 + letter-spacing-ratio) / 0.7 * 1em
```

**侧批 / 眉批 / 批注**

| 变量前缀 | 变量 | 说明 |
|---------|------|------|
| --wtc-sidenote-* | font-size (13px), color (#c00), line-height (1.25) | 侧批 |
| --wtc-meipi-* | font-size (14px), color (#c00), line-height (1.3) | 眉批 |
| --wtc-pizhu-* | font-size (14px), color (#c00), line-height (1.3) | 批注 |

**版心**

| 变量 | 默认值 | 说明 |
|------|-------|------|
| --wtc-banxin-width | 40px | 版心宽度 |
| --wtc-banxin-upper-ratio | 0.282 | 上段比例 |
| --wtc-banxin-middle-ratio | 0.563 | 中段比例 |
| --wtc-banxin-font-size | 13px | 版心字号 |
| --wtc-banxin-chapter-font-size | 13px | 章节字号 |
| --wtc-banxin-page-font-size | 11px | 页码字号 |

**装饰**

| 变量 | 默认值 | 说明 |
|------|-------|------|
| --wtc-emphasis-color | #c00 | 圈点颜色 |
| --wtc-proper-name-color | #333 | 专名号颜色 |
| --wtc-book-title-color | #333 | 书名号颜色 |

## 7. 模板系统设计

### 7.1 模板文件结构

```
src/templates/
├── base.css                    # 基础样式 + 所有 CSS 变量默认值 + 组件样式
├── siku-quanshu.css            # 四库全书（黑白）：覆盖边框和字体参数
├── siku-quanshu-colored.css    # 四库全书（彩色）：覆盖颜色和背景
├── honglou.css                 # 红楼梦甲戌本：9 列 20 行网格
└── minimal.css                 # 极简：最小化装饰
```

### 7.2 模板名称映射

文件位置：`src/config/templates.js`

```javascript
const templateCSSMap = {
  '四库全书': 'siku-quanshu',
  '四庫全書': 'siku-quanshu',
  '四库全书彩色': 'siku-quanshu-colored',
  '四庫全書彩色': 'siku-quanshu-colored',
  '红楼梦甲戌本': 'honglou',
  '紅樓夢甲戌本': 'honglou',
  '极简': 'minimal',
  '極簡': 'minimal',
  'default': 'siku-quanshu',
};
```

### 7.3 模板网格配置

每个模板有对应的网格参数，必须与 CSS 中的 `--wtc-n-rows` / `--wtc-n-cols` 一致：

| 模板 ID | nRows | nCols | 说明 |
|--------|-------|-------|------|
| siku-quanshu | 21 | 8 | 四库全书标准版面 |
| siku-quanshu-colored | 21 | 8 | 同上，仅颜色不同 |
| honglou | 20 | 9 | 红楼梦甲戌本：更宽版面 |
| minimal | 21 | 8 | 极简风格 |

### 7.4 运行时模板切换

浏览器端通过 `setTemplate()` 动态切换 CSS 模板：

```javascript
export function setTemplate(templateId, basePath = '') {
  const old = document.querySelector('link[data-wtc-template]');
  if (old) old.remove();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${basePath}${templateId}.css`;
  link.dataset.wtcTemplate = templateId;
  document.head.appendChild(link);
}
```

## 8. 各组件的 CSS 实现

### 8.1 夹注 (Jiazhu)

夹注是竖排中最核心的排版元素。HTML 结构：

```html
<span class="wtc-jiazhu">
  <span class="wtc-jiazhu-col">集解徐廣</span>
  <span class="wtc-jiazhu-col">曰號有熊</span>
</span>
```

CSS 实现要点：

```css
.wtc-jiazhu {
  display: inline-flex;
  flex-direction: column;     /* 在 vertical-rl 中，column = block axis = 从右到左 */
  vertical-align: top;
  font-size: var(--wtc-jiazhu-font-size);       /* 0.7em: 比主文本小 */
  letter-spacing: var(--wtc-jiazhu-letter-spacing); /* 补偿以匹配网格高度 */
  line-height: var(--wtc-jiazhu-line-height);    /* line-height/2: 半列宽 */
}

.wtc-jiazhu-col {
  writing-mode: vertical-rl;
  flex-shrink: 0;
  width: calc(var(--wtc-font-size) * var(--wtc-line-height) / 2);
  /* 每个子列 = 主文本一列物理宽度的一半 */
}
```

关键设计决策：使用物理 `width` 属性而非逻辑属性 `inline-size`，因为夹注子列需要精确的物理像素宽度来确保两列恰好占据一个主文本列的宽度。在 vertical-rl 中 `inline-size` 映射到 `height`，不是我们需要控制的方向。

渲染器对夹注的处理分两种路径：

- **纯文本夹注**：使用布局引擎预计算的 `jiazhuSegments`，直接渲染 RichChar 数组
- **复杂夹注**（含嵌套命令）：按子节点总字数对半分割，各半独立渲染

### 8.2 侧批 (Sidenote)

侧批显示在两列文字之间的间隙中：

```css
.wtc-sidenote {
  display: inline-block;
  writing-mode: vertical-rl;
  font-size: var(--wtc-sidenote-font-size);
  color: var(--wtc-sidenote-color);
  line-height: var(--wtc-sidenote-line-height);
  margin-left: -0.5em;    /* 向左侧列间隙偏移 */
  margin-right: -0.5em;   /* 向右侧列间隙偏移 */
}
```

负边距使侧批文字不占据主文本的列宽，而是悬浮在列间空隙中。

### 8.3 眉批 (MeiPi) 和批注 (PiZhu)

两者都使用绝对定位：

```css
.wtc-meipi {
  position: absolute;
  top: 0;
  writing-mode: vertical-rl;
  font-size: var(--wtc-meipi-font-size);
  color: var(--wtc-meipi-color);
  z-index: 10;
}

.wtc-pizhu {
  position: absolute;
  writing-mode: vertical-rl;
  font-size: var(--wtc-pizhu-font-size);
  color: var(--wtc-pizhu-color);
  z-index: 10;
}
```

眉批默认出现在页面顶部（天头区域），支持通过 `x/y` 选项自定义位置。当没有指定 `x` 时，渲染器使用计数器自动偏移避免重叠。

### 8.4 版心 (Banxin)

版心是古籍页面中间的装饰栏，分为三段：

```
上段 (28.2%): 书名 + 上鱼尾 ▼
中段 (56.3%): 章节信息
下段 (15.5%): 下鱼尾 ▲ (+ 页码，暂未实现)
```

CSS 使用 flexbox 纵向分割：

```css
.wtc-banxin {
  width: var(--wtc-banxin-width);
  display: flex;
  flex-direction: column;
  border-left: var(--wtc-border-thickness) solid var(--wtc-border-color);
  border-right: var(--wtc-border-thickness) solid var(--wtc-border-color);
}
.wtc-banxin-upper { flex: 0 0 28.2%; }
.wtc-banxin-middle { flex: 0 0 56.3%; }
.wtc-banxin-lower { flex: 0 0 15.5%; }
```

鱼尾符号使用 CSS `::before` 伪元素生成 Unicode 三角形字符。

章节信息中的 `\\` 换行在渲染时被分割为多个 `wtc-banxin-chapter-part` span，支持多行章节名。

### 8.5 段落缩进

缩进段落使用 `inline-block` + 固定高度实现：

```css
.wtc-paragraph-indent {
  display: inline-block;
  vertical-align: top;
  writing-mode: vertical-rl;
  height: var(--wtc-paragraph-indent-height);
  /* height = (nRows - indent) * grid-height */
  margin-inline-start: var(--wtc-paragraph-indent);
  /* margin-inline-start 在 vertical-rl 中 = margin-top → 顶部留白 */
}
```

通过限制 `height`，每列只能容纳 `nRows - indent` 个字符，然后自动换到下一列。`margin-inline-start` 在竖排模式下映射为 `margin-top`，创造视觉上的顶部缩进。

### 8.6 装饰类元素

**圈点（着重号）**：使用原生 `text-emphasis` CSS 属性

```css
.wtc-emphasis {
  text-emphasis: filled circle;
  text-emphasis-position: left;   /* 竖排时圈点在字的左侧 */
  text-emphasis-color: var(--wtc-emphasis-color);
}
```

**专名号（直线下划线）**：

```css
.wtc-proper-name {
  text-decoration: underline;
  text-underline-offset: 0.3em;
}
```

**书名号（波浪线下划线）**：

```css
.wtc-book-title-mark {
  text-decoration: underline wavy;
  text-decoration-thickness: 0.5px;
}
```

**八角框**：使用 `clip-path: polygon()` 裁剪

**带圈**：使用 `border-radius: 50%`

**反白**：黑底白字 `background-color: #333; color: #fff`

### 8.7 句读标记

句读标记渲染为零宽度的 inline-block 元素，通过 `::after` 伪元素显示红色小标点：

```css
.wtc-judou {
  display: inline-block;
  width: 0; height: 0;
  overflow: visible;
  position: relative;
}

.wtc-judou-ju::after {
  content: '\3002';       /* 。*/
  position: absolute;
  font-size: 1em;
  left: -0.3em; top: -0.4em;
  color: #c00;
}

.wtc-judou-dou::after {
  content: '\3001';       /* 、*/
  position: absolute;
  font-size: 1.2em;
  left: -0.3em; top: -0.4em;
  color: #c00;
}
```

零宽度确保句读标记不占据网格空间，`position: relative` + `absolute` 使标记定位在前一个字符的旁边。

### 8.8 印章 (Stamp)

印章使用绝对定位的 `<img>` 元素：

```css
.wtc-stamp {
  position: absolute;
  z-index: 5;
  pointer-events: none;   /* 不影响文字的交互 */
}
```

## 9. 响应式设计

### 9.1 移动端适配

```css
@media (max-width: 768px) {
  :root {
    --wtc-page-width: 95vw;
    --wtc-page-height: auto;
    --wtc-font-size: 16px;
    --wtc-margin-*: 15-20px;
  }
  .wtc-page { box-shadow: none; }
  .wtc-banxin { display: none; }      /* 隐藏版心 */
  .wtc-half-left { display: none; }   /* 只显示右半页 */
}
```

移动端策略：

- 缩小字体和边距
- 隐藏版心和左半页（只显示右半页内容）
- 页面宽度使用 `95vw` 自适应屏幕
- 取消页面阴影

### 9.2 打印适配

```css
@media print {
  body { background: none; padding: 0; }
  .wtc-page {
    box-shadow: none;
    margin: 0;
    page-break-after: always;
  }
  .wtc-page:last-child {
    page-break-after: avoid;
  }
}
```

打印模式下每个 `wtc-page` 在新页面开始，最后一页不强制分页。

## 10. Legacy 渲染路径

HTMLRenderer 保留了一个遗留的 `render()` 方法，直接遍历 AST 生成 HTML，不经过布局引擎。该方法不支持多页输出，仅用于向后兼容部分旧测试。

```javascript
// @deprecated — 使用 renderFromLayout(layoutResult) 代替
render() {
  let html = '';
  for (const child of this.ast.children) {
    html += this.renderNode(child);
  }
  return html;
}
```

新代码应始终使用 `renderFromLayout()` 以获得正确的多页分页和 Marker 栈平衡。
