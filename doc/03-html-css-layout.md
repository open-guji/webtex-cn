# HTML/CSS 竖排布局设计

> 用现代 CSS 实现古籍竖排的各种排版元素

## 1. CSS 竖排基础

### 1.1 核心 CSS 属性

```css
.wtc-content {
  writing-mode: vertical-rl;   /* 竖排：从上到下，从右到左 */
  text-orientation: upright;   /* 汉字保持直立 */
  direction: ltr;              /* 列方向从左到右（默认） */
}
```

### 1.2 竖排模式下的坐标映射

| 概念 | 横排 | 竖排 (vertical-rl) |
|------|------|---------------------|
| 主轴方向 | 从左到右 → | 从上到下 ↓ |
| 交叉轴方向 | 从上到下 ↓ | 从右到左 ← |
| width | 水平宽度 | 变成逻辑上的"列高" |
| height | 垂直高度 | 变成逻辑上的"页面宽度" |
| `inline-size` | = width | 列的高度方向 |
| `block-size` | = height | 列的宽度方向（交叉轴） |

## 2. 页面结构 HTML

### 2.1 整体页面布局

```html
<!-- 一个页面 -->
<div class="wtc-page">
  <!-- 版心（中间分隔栏） -->
  <div class="wtc-banxin">
    <div class="wtc-banxin-upper">
      <div class="wtc-yuwei wtc-yuwei-upper">▼</div>
    </div>
    <div class="wtc-banxin-middle">
      <span class="wtc-banxin-title">史記卷一</span>
    </div>
    <div class="wtc-banxin-lower">
      <div class="wtc-yuwei wtc-yuwei-lower">▲</div>
      <span class="wtc-banxin-page-num">一</span>
    </div>
  </div>

  <!-- 右半页（先显示） -->
  <div class="wtc-half-page wtc-half-right">
    <div class="wtc-content">
      <!-- 正文内容 -->
    </div>
  </div>

  <!-- 左半页 -->
  <div class="wtc-half-page wtc-half-left">
    <div class="wtc-content">
      <!-- 正文内容 -->
    </div>
  </div>
</div>
```

### 2.2 简化模式（无版心）

对于不需要版心的场景，使用简单的单栏结构：

```html
<div class="wtc-page wtc-page-simple">
  <div class="wtc-content">
    <!-- 正文内容直接排列 -->
  </div>
</div>
```

## 3. 正文排版

### 3.1 基本正文

```html
<div class="wtc-content" style="writing-mode: vertical-rl;">
  <span class="wtc-char">黄</span>
  <span class="wtc-char">帝</span>
  <span class="wtc-char">者</span>
  <!-- ... -->
</div>
```

**简化方案**（推荐）：不需要逐字包装，直接放入文本，浏览器自动处理竖排。

```html
<div class="wtc-content">
  黄帝者少典之子姓公孫名曰軒轅
</div>
```

### 3.2 CSS 网格对齐（可选）

如果需要更精确的网格对齐：

```css
.wtc-content {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-size: var(--wtc-font-size, 28px);
  line-height: var(--wtc-line-height, 1.8);
  letter-spacing: var(--wtc-letter-spacing, 0.05em);
  /* 列间距 */
  column-gap: var(--wtc-column-gap, 0);
}
```

## 4. 夹注 (Jiazhu) — 双行小字

### 4.1 原理

夹注在主文本行内插入，将注释文字分成左右两列（竖排时为上下两行），字体缩小。

### 4.2 HTML 结构

```html
<span class="wtc-jiazhu">
  <span class="wtc-jiazhu-col wtc-jiazhu-col-1">集解徐廣曰號</span>
  <span class="wtc-jiazhu-col wtc-jiazhu-col-2">有熊索隠按有</span>
</span>
```

### 4.3 CSS 实现

```css
.wtc-jiazhu {
  display: inline-flex;
  flex-direction: row;          /* 竖排模式下，row = 从右到左 */
  font-size: var(--wtc-jiazhu-font-size, 0.5em);
  line-height: var(--wtc-jiazhu-line-height, 1.4);
  vertical-align: top;
}

.wtc-jiazhu-col {
  writing-mode: vertical-rl;
  text-orientation: upright;
}

/* 平衡两列：左列可能多一个字 */
.wtc-jiazhu-col-1 {
  /* 第一列（右侧） */
}
.wtc-jiazhu-col-2 {
  /* 第二列（左侧） */
}
```

### 4.4 JavaScript 分列逻辑

```javascript
function splitJiazhu(text, align = 'outward') {
  const chars = [...text];  // 正确处理 Unicode
  const mid = Math.ceil(chars.length / 2);

  if (align === 'outward') {
    // 外侧对齐：右列（第一列）可能多一个字
    return {
      col1: chars.slice(0, mid).join(''),
      col2: chars.slice(mid).join(''),
    };
  } else {
    // 内侧对齐
    return {
      col1: chars.slice(0, chars.length - mid).join(''),
      col2: chars.slice(chars.length - mid).join(''),
    };
  }
}
```

### 4.5 长夹注自动换列

当夹注文字很长时，需要在多个列中排列。这通过 JavaScript 预计算每列可容纳的字符数来实现：

```javascript
function layoutJiazhu(text, maxCharsPerCol) {
  const chars = [...text];
  const totalCols = Math.ceil(chars.length / (maxCharsPerCol * 2));
  const columns = [];

  for (let i = 0; i < totalCols; i++) {
    const start = i * maxCharsPerCol * 2;
    const chunk = chars.slice(start, start + maxCharsPerCol * 2);
    const mid = Math.ceil(chunk.length / 2);
    columns.push({
      col1: chunk.slice(0, mid).join(''),
      col2: chunk.slice(mid).join(''),
    });
  }
  return columns;
}
```

## 5. 侧批 (SideNote) — 行间批注

### 5.1 原理

侧批显示在两列正文之间的间隙中，字体较小，通常为红色。

### 5.2 HTML 结构

```html
<!-- 侧批锚点在正文中 -->
<span class="wtc-sidenote-anchor" data-sidenote-id="1"></span>

<!-- 侧批内容通过 CSS 定位到列间 -->
<span class="wtc-sidenote" data-sidenote-id="1">
  较长的侧批可换列甚至换页
</span>
```

### 5.3 CSS 实现

```css
.wtc-sidenote-anchor {
  position: relative;
}

.wtc-sidenote {
  position: absolute;
  writing-mode: vertical-rl;
  font-size: var(--wtc-sidenote-font-size, 0.6em);
  color: var(--wtc-sidenote-color, red);
  /* 定位到当前列的左侧间隙 */
  margin-inline-start: -0.5em;
  z-index: 10;
}
```

### 5.4 简化实现方案

更简单的方式是将侧批作为一个特殊的内联元素：

```html
<ruby class="wtc-sidenote-ruby">
  正文字<rp>(</rp><rt class="wtc-sidenote-text">批注</rt><rp>)</rp>
</ruby>
```

或者使用 margin 方式：

```css
.wtc-sidenote {
  display: inline-block;
  writing-mode: vertical-rl;
  font-size: var(--wtc-sidenote-font-size, 14px);
  color: var(--wtc-sidenote-color, red);
  line-height: var(--wtc-sidenote-line-height, 1.2);
  margin-left: -1em;  /* 在竖排中向列间偏移 */
  vertical-align: top;
}
```

## 6. 眉批 (MeiPi) — 页面顶部批注

### 6.1 原理

眉批出现在页面的"天头"区域（页面上方的空白处），通常是红色小字。

### 6.2 HTML 结构

```html
<div class="wtc-page">
  <!-- 眉批区域（天头） -->
  <div class="wtc-meipi-area">
    <div class="wtc-meipi" style="--wtc-meipi-x: 3;">
      眉批内容在此处竖排显示
    </div>
  </div>

  <!-- 正文区域 -->
  <div class="wtc-content">...</div>
</div>
```

### 6.3 CSS 实现

```css
.wtc-meipi-area {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: var(--wtc-margin-top, 6.72cm);
  overflow: visible;
}

.wtc-meipi {
  position: absolute;
  writing-mode: vertical-rl;
  font-size: var(--wtc-meipi-font-size, 18px);
  color: var(--wtc-meipi-color, red);
  line-height: var(--wtc-meipi-line-height, 1.3);
  /* 通过 CSS 变量控制水平位置 */
  right: calc(var(--wtc-meipi-x, 0) * var(--wtc-grid-width, 50px));
  bottom: var(--wtc-meipi-gap, 10px);
}
```

## 7. 批注 (PiZhu) — 浮动批注框

### 7.1 原理

批注是绝对定位的文本框，可以出现在页面任意位置。

### 7.2 HTML 结构

```html
<div class="wtc-pizhu" style="
  --wtc-pizhu-x: 5cm;
  --wtc-pizhu-y: 2cm;
">
  可在任意位置书写多列批注
</div>
```

### 7.3 CSS 实现

```css
.wtc-pizhu {
  position: absolute;
  writing-mode: vertical-rl;
  font-size: var(--wtc-pizhu-font-size, 18px);
  color: var(--wtc-pizhu-color, red);
  line-height: var(--wtc-pizhu-line-height, 1.3);
  right: var(--wtc-pizhu-x, 0);
  top: var(--wtc-pizhu-y, 0);
}
```

## 8. 版心 (BanXin) — 中央装饰栏

### 8.1 原理

版心是古籍页面中间的装饰栏，包含鱼尾、书名、章节名和页码。

### 8.2 HTML 结构

```html
<div class="wtc-banxin">
  <!-- 上段 (28.2%) -->
  <div class="wtc-banxin-section wtc-banxin-upper">
    <div class="wtc-yuwei wtc-yuwei-upper">◢◣</div>
  </div>

  <!-- 中段 (56.3%) - 书名/章节 -->
  <div class="wtc-banxin-section wtc-banxin-middle">
    <span class="wtc-banxin-book-name">欽定四庫全書</span>
    <span class="wtc-banxin-chapter">史記卷一</span>
  </div>

  <!-- 下段 (15.5%) - 页码 -->
  <div class="wtc-banxin-section wtc-banxin-lower">
    <div class="wtc-yuwei wtc-yuwei-lower">◥◤</div>
    <span class="wtc-banxin-page-num">一</span>
  </div>
</div>
```

### 8.3 CSS 实现

```css
.wtc-banxin {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: var(--wtc-banxin-width, 50px);
  height: 100%;
  border-left: var(--wtc-border-thickness, 0.4px) solid var(--wtc-border-color, black);
  border-right: var(--wtc-border-thickness, 0.4px) solid var(--wtc-border-color, black);
  writing-mode: vertical-rl;
}

.wtc-banxin-upper {
  flex: 0 0 28.2%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.wtc-banxin-middle {
  flex: 0 0 56.3%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  writing-mode: vertical-rl;
  font-size: var(--wtc-banxin-font-size, 15px);
}

.wtc-banxin-lower {
  flex: 0 0 15.5%;
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* 鱼尾符号 */
.wtc-yuwei {
  font-size: 1.2em;
  color: var(--wtc-border-color, black);
}

.wtc-yuwei-upper::before { content: "▼"; }
.wtc-yuwei-lower::before { content: "▲"; }
```

## 9. 段落缩进 (Paragraph Indent)

### 9.1 HTML 结构

```html
<div class="wtc-paragraph" style="--wtc-indent: 2; --wtc-first-indent: 0;">
  <div class="wtc-para-line wtc-para-first-line">
    天地玄黄
  </div>
  <div class="wtc-para-line">
    宇宙洪荒
  </div>
</div>
```

### 9.2 CSS 实现

```css
.wtc-paragraph {
  /* 竖排中 padding-top 相当于段落首行缩进 */
  padding-block-start: calc(var(--wtc-indent, 0) * var(--wtc-grid-height, 28px));
}

.wtc-para-first-line:first-child {
  padding-block-start: calc(var(--wtc-first-indent, var(--wtc-indent, 0)) * var(--wtc-grid-height, 28px));
}
```

## 10. 边框 (Border)

### 10.1 内边框（列间界栏）

```css
.wtc-content {
  /* 使用 column-rule 模拟列间界栏 */
  column-rule: var(--wtc-border-thickness, 0.4px) solid var(--wtc-border-color, black);
}
```

### 10.2 外边框

```css
.wtc-half-page {
  border: var(--wtc-outer-border-thickness, 4px) solid var(--wtc-border-color, black);
  padding: var(--wtc-outer-border-sep, 3px);
}

/* 内部再加一层细边框 */
.wtc-content {
  border: var(--wtc-border-thickness, 0.4px) solid var(--wtc-border-color, black);
  padding-top: var(--wtc-border-padding-top, 5px);
  padding-bottom: var(--wtc-border-padding-bottom, 5px);
}
```

## 11. 装饰类元素

### 11.1 圈点 / 着重号

```html
<span class="wtc-emphasis">重要文字</span>
```

```css
.wtc-emphasis {
  text-emphasis: filled circle;
  text-emphasis-position: left;  /* 竖排时在左侧 */
  text-emphasis-color: var(--wtc-emphasis-color, red);
}
```

### 11.2 专名号（直线标记）

```html
<span class="wtc-proper-name">司馬遷</span>
```

```css
.wtc-proper-name {
  text-decoration: underline;
  text-decoration-color: var(--wtc-proper-name-color, black);
  text-underline-offset: 0.3em;
}
```

### 11.3 书名号（波浪线标记）

```html
<span class="wtc-book-title-mark">史記</span>
```

```css
.wtc-book-title-mark {
  text-decoration: underline wavy;
  text-decoration-color: var(--wtc-book-title-color, black);
}
```

### 11.4 反白 / 八角框 / 带圈

```css
.wtc-inverted {
  background-color: #333;
  color: white;
  padding: 0.1em;
}

.wtc-octagon {
  border: 1px solid var(--wtc-border-color, black);
  padding: 0.1em;
  /* 八角形通过 clip-path 实现 */
  clip-path: polygon(
    30% 0%, 70% 0%, 100% 30%, 100% 70%,
    70% 100%, 30% 100%, 0% 70%, 0% 30%
  );
}

.wtc-circled {
  border: 1px solid var(--wtc-border-color, black);
  border-radius: 50%;
  padding: 0.15em;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
```

## 12. 文本框 (TextBox) 与填充文本框

### 12.1 HTML 结构

```html
<!-- 普通文本框 -->
<span class="wtc-textbox" style="--wtc-textbox-height: 12;">
  漢太史令
</span>

<!-- 填充文本框（内容均匀分布） -->
<span class="wtc-textbox wtc-textbox-fill" style="--wtc-textbox-height: 12;">
  漢太史令
</span>
```

### 12.2 CSS 实现

```css
.wtc-textbox {
  display: inline-block;
  writing-mode: vertical-rl;
  inline-size: calc(var(--wtc-textbox-height, 1) * var(--wtc-grid-height, 28px));
  overflow: hidden;
}

.wtc-textbox-fill {
  display: inline-flex;
  flex-direction: column;
  justify-content: space-between;
  text-align: center;
}
```

## 13. 抬头系统

### 13.1 CSS 实现

```css
/* 抬头：通过负 margin 实现向上偏移 */
.wtc-taitou {
  margin-block-start: calc(var(--wtc-taitou-level, 0) * var(--wtc-grid-height, 28px) * -1);
}

.wtc-taitou-0 { /* 平抬：顶格 */ }
.wtc-taitou-1 { margin-block-start: calc(-1 * var(--wtc-grid-height, 28px)); }
.wtc-taitou-2 { margin-block-start: calc(-2 * var(--wtc-grid-height, 28px)); }
.wtc-taitou-3 { margin-block-start: calc(-3 * var(--wtc-grid-height, 28px)); }
```

## 14. 列表 (列表)

```html
<div class="wtc-list">
  <div class="wtc-list-item">史記卷一</div>
  <div class="wtc-list-item">
    <div class="wtc-list">
      <div class="wtc-list-item">
        <span class="wtc-textbox wtc-textbox-fill">漢太史令</span>
        司馬遷　撰
      </div>
    </div>
  </div>
</div>
```

## 15. 响应式考虑

```css
/* 移动端：单页显示 */
@media (max-width: 768px) {
  .wtc-page {
    flex-direction: column;
  }
  .wtc-banxin {
    display: none; /* 或简化显示 */
  }
  .wtc-half-page {
    width: 100%;
  }
}
```
