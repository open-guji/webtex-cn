# CSS 模板系统设计

> 通过可替换的 CSS 模板实现不同古籍排版风格

## 1. 设计理念

模板系统与 luatex-cn 的 `.cfg` 配置文件对应。在 luatex-cn 中，用户通过 `\documentclass[四库全书]{ltc-guji}` 选择模板（`.cfg` 文件）。在 WebTeX-CN 中，同样的机制切换不同的 CSS 样式文件。

```
luatex-cn:  \documentclass[四库全书]{ltc-guji}  →  加载 luatex-cn-guji-default.cfg
WebTeX-CN:  \documentclass[四库全书]{ltc-guji}  →  加载 siku-quanshu.css
```

## 2. CSS 变量体系

所有可定制参数通过 CSS Custom Properties（CSS 变量）定义，模板只需覆盖变量值即可改变风格。

### 2.1 变量分层

```
Layer 1: base.css        — 定义所有 CSS 变量的默认值
Layer 2: template.css    — 覆盖特定模板的变量值
Layer 3: inline styles   — 运行时由 JS 注入的微调值
```

### 2.2 完整变量清单

```css
/* ========================================
   variables.css — CSS 变量默认定义
   ======================================== */
:root {
  /* ---- 页面尺寸 ---- */
  --wtc-page-width: 40cm;           /* 页面宽度（对应 paper-width） */
  --wtc-page-height: 31.5cm;        /* 页面高度（对应 paper-height） */
  --wtc-margin-top: 6.72cm;         /* 上边距 */
  --wtc-margin-bottom: 3.23cm;      /* 下边距 */
  --wtc-margin-left: 4.7cm;         /* 左边距 */
  --wtc-margin-right: 4.7cm;        /* 右边距 */

  /* ---- 网格参数 ---- */
  --wtc-n-column: 8;                /* 每半页列数 */
  --wtc-n-char-per-col: 21;         /* 每列字符数 */
  --wtc-grid-width: 50px;           /* 网格宽度（列宽） */
  --wtc-grid-height: 28px;          /* 网格高度（字高） */

  /* ---- 字体 ---- */
  --wtc-font-family: "Noto Serif SC", "Source Han Serif SC", "宋体", serif;
  --wtc-font-size: 28px;            /* 正文字号 */
  --wtc-line-height: 1.8;           /* 行高（竖排中为列间距比） */
  --wtc-letter-spacing: 0.02em;     /* 字间距 */
  --wtc-font-color: #000;           /* 正文字色 */

  /* ---- 边框 ---- */
  --wtc-border-thickness: 0.4px;    /* 内边框（界栏）粗细 */
  --wtc-border-color: #000;         /* 边框颜色 */
  --wtc-outer-border-thickness: 4px;/* 外边框粗细 */
  --wtc-outer-border-sep: 3px;      /* 外边框与内容间距 */
  --wtc-border-padding-top: 5px;    /* 边框内上边距 */
  --wtc-border-padding-bottom: 5px; /* 边框内下边距 */

  /* ---- 背景 ---- */
  --wtc-page-background: #fff;      /* 页面背景色 */

  /* ---- 夹注 (Jiazhu) ---- */
  --wtc-jiazhu-font-size: 0.5em;    /* 夹注字号（相对于正文） */
  --wtc-jiazhu-line-height: 1.3;    /* 夹注行高 */
  --wtc-jiazhu-color: inherit;      /* 夹注字色（继承正文） */
  --wtc-jiazhu-gap: 2px;            /* 夹注双列间距 */

  /* ---- 侧批 (SideNote) ---- */
  --wtc-sidenote-font-size: 14px;   /* 侧批字号 */
  --wtc-sidenote-color: red;        /* 侧批颜色 */
  --wtc-sidenote-line-height: 1.2;  /* 侧批行高 */
  --wtc-sidenote-offset: 0;         /* 侧批 Y 偏移 */

  /* ---- 眉批 (MeiPi) ---- */
  --wtc-meipi-font-size: 18px;      /* 眉批字号 */
  --wtc-meipi-color: red;           /* 眉批颜色 */
  --wtc-meipi-line-height: 1.3;     /* 眉批行高 */
  --wtc-meipi-gap: 0;               /* 眉批底部间距 */

  /* ---- 批注 (PiZhu) ---- */
  --wtc-pizhu-font-size: 18px;      /* 批注字号 */
  --wtc-pizhu-color: red;           /* 批注颜色 */
  --wtc-pizhu-line-height: 1.3;     /* 批注行高 */
  --wtc-pizhu-grid-width: 20px;     /* 批注网格宽 */
  --wtc-pizhu-grid-height: 19px;    /* 批注网格高 */

  /* ---- 版心 (BanXin) ---- */
  --wtc-banxin-width: 50px;         /* 版心宽度 */
  --wtc-banxin-upper-ratio: 0.282;  /* 上段比例 */
  --wtc-banxin-middle-ratio: 0.563; /* 中段比例 */
  --wtc-banxin-lower-ratio: 0.155;  /* 下段比例 */
  --wtc-banxin-font-size: 15px;     /* 版心字号 */
  --wtc-banxin-book-font-size: 28px;/* 书名字号 */
  --wtc-banxin-page-font-size: 12px;/* 页码字号 */

  /* ---- 装饰 ---- */
  --wtc-emphasis-color: red;        /* 圈点颜色 */
  --wtc-proper-name-color: #000;    /* 专名号颜色 */
  --wtc-book-title-color: #000;     /* 书名号颜色 */
}
```

## 3. 模板文件结构

### 3.1 base.css — 基础样式（所有模板共用）

```css
/* base.css - 竖排排版基础样式 */

/* 加载变量默认值 */
@import 'variables.css';

/* 页面重置 */
* { margin: 0; padding: 0; box-sizing: border-box; }

/* 页面容器 */
.wtc-page {
  width: var(--wtc-page-width);
  height: var(--wtc-page-height);
  background: var(--wtc-page-background);
  display: flex;
  flex-direction: row-reverse;  /* 右半页在前 */
  position: relative;
  overflow: hidden;
  margin: 20px auto;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* 半页 */
.wtc-half-page {
  flex: 1;
  padding: var(--wtc-margin-top) var(--wtc-margin-left) var(--wtc-margin-bottom) var(--wtc-margin-right);
  position: relative;
}

/* 正文内容区 */
.wtc-content {
  writing-mode: vertical-rl;
  text-orientation: upright;
  font-family: var(--wtc-font-family);
  font-size: var(--wtc-font-size);
  line-height: var(--wtc-line-height);
  letter-spacing: var(--wtc-letter-spacing);
  color: var(--wtc-font-color);
  height: 100%;
  overflow: hidden;
}

/* ... 各组件基础样式 ... */
```

### 3.2 siku-quanshu.css — 四库全书（黑白）

```css
/* siku-quanshu.css - 四库全书黑白模板 */

:root {
  --wtc-page-width: 40cm;
  --wtc-page-height: 31.5cm;
  --wtc-margin-top: 6.72cm;
  --wtc-margin-bottom: 3.23cm;
  --wtc-margin-left: 4.7cm;
  --wtc-margin-right: 4.7cm;

  --wtc-font-size: 28px;
  --wtc-font-color: #000;
  --wtc-n-column: 8;
  --wtc-n-char-per-col: 21;

  --wtc-border-thickness: 0.4px;
  --wtc-border-color: #000;
  --wtc-outer-border-thickness: 4px;
  --wtc-outer-border-sep: 3px;

  --wtc-page-background: #fff;
  --wtc-sidenote-color: red;
  --wtc-meipi-color: red;
  --wtc-pizhu-color: red;
}
```

### 3.3 siku-quanshu-colored.css — 四库全书（彩色）

```css
/* siku-quanshu-colored.css - 四库全书彩色模板 */
/* 继承黑白版基础参数，覆盖颜色 */
@import 'siku-quanshu.css';

:root {
  --wtc-font-color: rgb(35, 25, 20);       /* 深棕色墨 */
  --wtc-border-color: rgb(180, 95, 75);    /* 赭石色边框 */
  --wtc-page-background: rgb(222, 188, 130); /* 仿古纸色 */
}
```

### 3.4 honglou.css — 红楼梦甲戌本

```css
/* honglou.css - 红楼梦甲戌本模板 */
/* 红楼梦有更多的眉批和侧批 */

:root {
  --wtc-font-size: 26px;
  --wtc-sidenote-color: #c00;
  --wtc-meipi-color: #c00;
  --wtc-meipi-font-size: 16px;
  --wtc-emphasis-color: #c00;
  --wtc-page-background: #f5e6d0;
}
```

## 4. 模板加载机制

### 4.1 TeX 文件驱动

当 JavaScript 解析 `.tex` 文件时，从 `\documentclass` 选项中提取模板名称：

```javascript
// config.js
const templateCSSMap = {
  '四库全书':       'siku-quanshu.css',
  '四庫全書':       'siku-quanshu.css',
  '四库全书彩色':   'siku-quanshu-colored.css',
  '四庫全書彩色':   'siku-quanshu-colored.css',
  '红楼梦甲戌本':   'honglou.css',
  '紅樓夢甲戌本':   'honglou.css',
  'default':        'siku-quanshu.css',
};

function loadTemplate(templateName) {
  const cssFile = templateCSSMap[templateName] || 'siku-quanshu.css';
  // 动态加载 CSS 文件
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `webtex-cn/templates/${cssFile}`;
  document.head.appendChild(link);
}
```

### 4.2 Setup 命令覆盖

TeX 文件中的 `\contentSetup{...}` 等命令可以覆盖模板的默认值：

```javascript
function applySetupOverrides(setupCommands) {
  const root = document.documentElement;

  for (const cmd of setupCommands) {
    switch (cmd.type) {
      case 'content':
        if (cmd.params['font-size'])
          root.style.setProperty('--wtc-font-size', cmd.params['font-size']);
        if (cmd.params['font-color'])
          root.style.setProperty('--wtc-font-color', rgbToCSS(cmd.params['font-color']));
        if (cmd.params['border-color'])
          root.style.setProperty('--wtc-border-color', rgbToCSS(cmd.params['border-color']));
        if (cmd.params['n-column'])
          root.style.setProperty('--wtc-n-column', cmd.params['n-column']);
        // ... 其他参数
        break;
      case 'banxin':
        if (cmd.params['banxin-upper-ratio'])
          root.style.setProperty('--wtc-banxin-upper-ratio', cmd.params['banxin-upper-ratio']);
        // ...
        break;
      case 'sidenode':
        if (cmd.params['color'])
          root.style.setProperty('--wtc-sidenote-color', cmd.params['color']);
        if (cmd.params['font-size'])
          root.style.setProperty('--wtc-sidenote-font-size', cmd.params['font-size']);
        break;
    }
  }
}
```

### 4.3 参数映射表

luatex-cn `.cfg` 参数 → CSS 变量的映射关系：

| luatex-cn 参数 | CSS 变量 | 说明 |
|----------------|----------|------|
| `paper-width` | `--wtc-page-width` | 页面宽度 |
| `paper-height` | `--wtc-page-height` | 页面高度 |
| `margin-top` | `--wtc-margin-top` | 上边距 |
| `margin-bottom` | `--wtc-margin-bottom` | 下边距 |
| `margin-left` | `--wtc-margin-left` | 左边距 |
| `margin-right` | `--wtc-margin-right` | 右边距 |
| `font-size` | `--wtc-font-size` | 字号 |
| `line-spacing` | 换算为 `--wtc-line-height` | 行距 |
| `font-color` | `--wtc-font-color` | 字色 |
| `n-column` | `--wtc-n-column` | 列数 |
| `n-char-per-col` | `--wtc-n-char-per-col` | 每列字数 |
| `border` | `--wtc-border-show` | 是否显示界栏 |
| `border-thickness` | `--wtc-border-thickness` | 界栏粗细 |
| `border-color` | `--wtc-border-color` | 边框颜色 |
| `outer-border-thickness` | `--wtc-outer-border-thickness` | 外框粗细 |
| `outer-border-sep` | `--wtc-outer-border-sep` | 外框间距 |
| `background-color` | `--wtc-page-background` | 背景色 |

## 5. 自定义模板创建

用户可以创建自己的 CSS 模板：

```css
/* my-custom.css */
@import 'base.css';

:root {
  /* 调整字体 */
  --wtc-font-family: "楷体", "KaiTi", serif;
  --wtc-font-size: 24px;
  --wtc-line-height: 2.0;

  /* 调整配色 */
  --wtc-page-background: #f8f4e8;
  --wtc-font-color: #2c1810;
  --wtc-border-color: #8b4513;
  --wtc-sidenote-color: #cc0000;

  /* 调整间距 */
  --wtc-letter-spacing: 0.05em;
  --wtc-margin-top: 5cm;
  --wtc-margin-bottom: 3cm;
}
```

## 6. 运行时主题切换

支持在页面上动态切换模板：

```javascript
WebTeX.setTemplate('siku-quanshu-colored');
// 或
WebTeX.setTemplate('honglou');
// 或使用自定义 CSS URL
WebTeX.setTemplate({ url: 'my-custom.css' });
```

## 7. 打印适配

```css
@media print {
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
