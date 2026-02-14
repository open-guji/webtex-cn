# TeX 命令参考手册

> WebTeX-CN 支持的所有 luatex-cn 命令及其 HTML 映射

## 1. 文档结构命令

### 1.1 `\documentclass[模板名]{ltc-guji}`

| 属性 | 说明 |
|------|------|
| **作用** | 声明文档类型和选择模板 |
| **参数** | 可选参数：模板名称（如 `四库全书`, `四库全书彩色`, `红楼梦甲戌本`） |
| **HTML 映射** | 无直接 HTML 输出，但决定加载哪个 CSS 模板 |
| **luatex-cn 来源** | `ltc-guji.cls` |

```latex
\documentclass[四库全书彩色]{ltc-guji}
```

### 1.2 `\title{标题}`

| 属性 | 说明 |
|------|------|
| **作用** | 设置书名（显示在版心中） |
| **参数** | `{标题文字}` |
| **HTML 映射** | `<span class="wtc-banxin-book-name">标题</span>` |
| **luatex-cn 来源** | 通过 `\banxinSetup` 传递到版心 |

### 1.3 `\chapter{章节\\副标题}`

| 属性 | 说明 |
|------|------|
| **作用** | 设置章节名（显示在版心中，支持 `\\` 分行） |
| **参数** | `{章节名}` |
| **HTML 映射** | `<span class="wtc-banxin-chapter">章节名</span>` |
| **luatex-cn 来源** | 通过全局注册表传递到版心渲染 |

## 2. 环境命令

### 2.1 `\begin{正文} ... \end{正文}`

别名: `\begin{BodyText}`

| 属性 | 说明 |
|------|------|
| **作用** | 主要正文内容区域，启动竖排排版引擎 |
| **可选参数** | 无 |
| **HTML 映射** | `<div class="wtc-content">...</div>` |
| **luatex-cn 来源** | `luatex-cn-core-content.sty` |

### 2.2 `\begin{段落}[options] ... \end{段落}`

别名: `\begin{Paragraph}`

| 属性 | 说明 |
|------|------|
| **作用** | 段落块，支持缩进控制 |
| **可选参数** | `indent=N` 左缩进N格, `first-indent=N` 首行缩进, `bottom-indent=N` 末行缩进 |
| **HTML 映射** | `<div class="wtc-paragraph" style="--wtc-indent: N;">...</div>` |
| **luatex-cn 来源** | `luatex-cn-core-paragraph.sty` |

```latex
\begin{段落}[indent=3]
    集解裴駰曰...
\end{段落}
```

### 2.3 `\begin{列表} ... \end{列表}`

| 属性 | 说明 |
|------|------|
| **作用** | 列表环境，支持嵌套 |
| **内部命令** | `\item` 标记列表项 |
| **HTML 映射** | `<div class="wtc-list"><div class="wtc-list-item">...</div></div>` |

```latex
\begin{列表}
    \item 史記卷一
    \item 五帝本紀第一
\end{列表}
```

### 2.4 `\begin{夹注环境} ... \end{夹注环境}`

别名: `\begin{JiaZhuEnv}`

| 属性 | 说明 |
|------|------|
| **作用** | 夹注的环境形式，允许内部命令展开 |
| **HTML 映射** | 同 `\夹注{}` |

## 3. 注释批注命令

### 3.1 `\夹注[options]{内容}` / `\JiaZhu`

| 属性 | 说明 |
|------|------|
| **作用** | 双行小字注释，嵌入正文行内 |
| **可选参数** | `align=outward\|inward` 对齐方式 |
| **必选参数** | `{注释文字}` |
| **HTML 映射** | `<span class="wtc-jiazhu"><span class="wtc-jiazhu-col">...</span>...</span>` |
| **luatex-cn 来源** | `luatex-cn-guji-jiazhu.sty` → `luatex-cn-core-textflow.sty` |

```latex
黄帝者\夹注{集解徐廣曰號有熊索隠按有...}少典之子
```

**全局配置**：
```latex
\jiazhuSetup{
    align = outward,      % 对齐方式：outward（外侧）/ inward（内侧）
    font = {},            % 字体
    font-color = {0,0,0}, % 字色
}
```

### 3.2 `\侧批[options]{内容}` / `\SideNode` / `\CePi`

| 属性 | 说明 |
|------|------|
| **作用** | 在列间显示的小字批注 |
| **可选参数** | `yoffset=10pt` 垂直偏移, `font-size=19pt`, `color=red` |
| **必选参数** | `{批注文字}` |
| **HTML 映射** | `<span class="wtc-sidenote">批注文字</span>` |
| **luatex-cn 来源** | `luatex-cn-core-sidenote.sty` |

```latex
侧批\侧批[yoffset=10pt]{较长的侧批可换列甚至换页}可在任意位置插入
```

**全局配置**：
```latex
\sidenodeSetup{
    color = red,
    font-size = 19pt,
    grid-height = 20pt,
    yoffset = 0em,
    border-padding-top = 0.5em,
    border-padding-bottom = 0.5em,
}
```

### 3.3 `\眉批[options]{内容}` / `\MeiPi`

| 属性 | 说明 |
|------|------|
| **作用** | 页面顶部（天头区域）自动定位的批注 |
| **可选参数** | `x=Ncm`, `y=Ncm`, `height=N`, `font-size=18pt`, `color=red`, `spacing=10pt`, `gap=0pt` |
| **必选参数** | `{批注文字}` |
| **HTML 映射** | `<div class="wtc-meipi" style="...">批注文字</div>` |
| **luatex-cn 来源** | `luatex-cn-guji-meipi.sty` |

```latex
\眉批[height=6]{这是一段眉批内容}
```

**全局配置**：
```latex
\meipiSetup{
    font-size = 18pt,
    color = 1 0 0,       % RGB 空格分隔
    grid-width = 20pt,
    grid-height = 19pt,
    spacing = 10pt,      % 多个眉批之间的间距
    gap = 0pt,           % 底部间距
}
```

### 3.4 `\批注[options]{内容}` / `\PiZhu`

| 属性 | 说明 |
|------|------|
| **作用** | 绝对定位的浮动批注框 |
| **可选参数** | `x=5cm`, `y=2cm`, `height=6`, `color={1 0 0}`, `font-size=18pt` |
| **必选参数** | `{批注文字}` |
| **HTML 映射** | `<div class="wtc-pizhu" style="right:5cm; top:2cm;">...</div>` |
| **luatex-cn 来源** | `luatex-cn-guji-pizhu.sty` |

```latex
\批注[x=5cm, y=2cm, height=6, color={1 0 0}]{可在任意位置书写多列批注}
```

## 4. 文本框命令

### 4.1 `\文本框[options]{内容}` / `\TextBox`

| 属性 | 说明 |
|------|------|
| **作用** | 创建一个固定大小的文本框 |
| **可选参数** | `height=N`（行数）, `n-cols=N`, `border=true\|false`, `background-color`, `font-color`, `font-size`, `border-shape=rect\|octagon\|circle` |
| **必选参数** | `{文字}` |
| **HTML 映射** | `<span class="wtc-textbox" style="...">文字</span>` |

### 4.2 `\填充文本框[options]{内容}` / `\FillTextBox`

| 属性 | 说明 |
|------|------|
| **作用** | 内容在框内均匀分布 |
| **可选参数** | `height=N`（可以是纯数字作为旧语法） |
| **HTML 映射** | `<span class="wtc-textbox wtc-textbox-fill" style="...">...</span>` |

```latex
\填充文本框[12]{漢太史令}
```

### 4.3 装饰性文本框快捷命令

| 命令 | 效果 | HTML class |
|------|------|-----------|
| `\反白{文字}` | 深色背景白色文字 | `.wtc-inverted` |
| `\八角框{文字}` | 八角形边框 | `.wtc-octagon` |
| `\带圈{文字}` | 圆形边框 | `.wtc-circled` |
| `\反白八角框{文字}` | 深色背景+八角形+白色边框 | `.wtc-inverted.wtc-octagon` |

## 5. 缩进与抬头命令

### 5.1 `\设置缩进{N}` / `\SetIndent`

| 属性 | 说明 |
|------|------|
| **作用** | 强制设置当前行的缩进格数 |
| **参数** | `{N}` 缩进格数，0=顶格 |
| **HTML 映射** | 通过 CSS padding 或 margin 实现 |

### 5.2 抬头命令系列

| 命令 | 含义 | 缩进值 | HTML class |
|------|------|--------|-----------|
| `\抬头[N]` | 另起一行，高出 N 格 | -N | `.wtc-taitou` |
| `\平抬` | 顶格书写 | 0 | `.wtc-taitou-0` |
| `\单抬` | 高出 1 格 | -1 | `.wtc-taitou-1` |
| `\双抬` | 高出 2 格 | -2 | `.wtc-taitou-2` |
| `\三抬` | 高出 3 格 | -3 | `.wtc-taitou-3` |

### 5.3 `\挪抬[N]` / `\空抬`

| 属性 | 说明 |
|------|------|
| **作用** | 在当前位置插入 N 格空白（不换行） |
| **参数** | `[N]` 空格数，默认 1 |
| **HTML 映射** | 插入 N 个全角空格 (U+3000) |

### 5.4 `\空格[N]` / `\Space`

| 属性 | 说明 |
|------|------|
| **作用** | 插入 N 个全角空格 |
| **参数** | `[N]` 空格数，默认 1 |
| **HTML 映射** | 插入 N 个 `\u3000` |

## 6. 装饰命令

### 6.1 `\圈点[options]{文字}` / `\EmphasisMark`

| 属性 | 说明 |
|------|------|
| **作用** | 在文字旁添加圈点（着重号） |
| **可选参数** | `color=red` |
| **HTML 映射** | `<span class="wtc-emphasis">文字</span>` |
| **CSS 实现** | `text-emphasis: filled circle; text-emphasis-position: left;` |

### 6.2 `\专名号[options]{文字}` / `\ProperNameMark`

| 属性 | 说明 |
|------|------|
| **作用** | 在文字旁画直线（标注人名、地名等专有名词） |
| **HTML 映射** | `<span class="wtc-proper-name">文字</span>` |
| **CSS 实现** | `text-decoration: underline;` |

### 6.3 `\书名号[options]{文字}` / `\BookTitleMark`

| 属性 | 说明 |
|------|------|
| **作用** | 在文字旁画波浪线（标注书名） |
| **HTML 映射** | `<span class="wtc-book-title-mark">文字</span>` |
| **CSS 实现** | `text-decoration: underline wavy;` |

### 6.4 `\装饰[options]{文字}` / `\decorate`

| 属性 | 说明 |
|------|------|
| **作用** | 通用装饰命令，为每个字符添加装饰符号 |
| **可选参数** | `char=。`, `color=red`, `xoffset=0pt`, `yoffset=0pt`, `scale=1.0` |
| **HTML 映射** | 通过 CSS `text-emphasis` 或 `::after` 伪元素实现 |

### 6.5 `\改{替换字}` / `\fix`

| 属性 | 说明 |
|------|------|
| **作用** | 校勘标记，标记前一字被修正 |
| **HTML 映射** | `<span class="wtc-fix" data-fix="替换字">原字</span>` |

## 7. 布局控制命令

### 7.1 `\\`（换行/换列）

| 上下文 | 行为 | HTML 映射 |
|--------|------|-----------|
| 正文中 | 强制换列 | `<br>` 或新 `<div>` |
| 段落中 | 段落内换行 | `<br>` |
| `\chapter{}` 中 | 标题分行 | `<br>` |

### 7.2 `\换行` / Column Break

| 属性 | 说明 |
|------|------|
| **作用** | 强制换列 |
| **HTML 映射** | `<br class="wtc-column-break">` |

## 8. 配置命令

这些命令不直接产生 HTML 输出，而是修改渲染参数：

| 命令 | 作用 | 影响的 CSS 变量 |
|------|------|----------------|
| `\contentSetup{...}` | 设置内容区参数 | `--wtc-font-size`, `--wtc-border-*`, `--wtc-n-column` 等 |
| `\pageSetup{...}` | 设置页面参数 | `--wtc-page-*`, `--wtc-margin-*` |
| `\banxinSetup{...}` | 设置版心参数 | `--wtc-banxin-*` |
| `\sidenodeSetup{...}` | 设置侧批参数 | `--wtc-sidenote-*` |
| `\jiazhuSetup{...}` | 设置夹注参数 | `--wtc-jiazhu-*` |
| `\pizhuSetup{...}` | 设置批注参数 | `--wtc-pizhu-*` |
| `\meipiSetup{...}` | 设置眉批参数 | `--wtc-meipi-*` |
| `\gujiSetup{template=模板名}` | 切换模板 | 加载对应 CSS 文件 |

## 9. 句读命令

| 命令 | 作用 | HTML 处理 |
|------|------|----------|
| `\句读模式` / `\JudouOn` | 启用句读标点模式 | 添加 class `.wtc-judou` |
| `\正常标点模式` / `\JudouOff` | 恢复正常标点 | 移除 class `.wtc-judou` |
| `\无标点模式` | 隐藏标点 | 添加 class `.wtc-no-punct` |

## 10. 忽略的命令

以下 TeX 命令在解析时被识别但不产生 HTML 输出：

| 命令 | 原因 |
|------|------|
| `\usepackage{...}` | 网页不需要 TeX 包 |
| `\RequirePackage{...}` | 同上 |
| `\setmainfont{...}` | 字体通过 CSS 控制 |
| `\pagestyle{...}` | 无对应概念 |
| `\noindent` | 通过 CSS 控制 |
| `\par` | 段落通过 HTML 结构控制 |
| `\relax` | 无操作 |
| `\印章[...]{图片}` | 简化为 `<img>` 绝对定位（可选实现） |
| `\禁用分页裁剪` | 网页无此概念 |
| `\显示坐标` | 调试功能，不在网页中实现 |

## 11. 命令别名总览

| 中文命令 | 英文命令 | 类型 |
|----------|---------|------|
| `\夹注` | `\JiaZhu` | 命令 |
| `\侧批` | `\SideNode`, `\CePi` | 命令 |
| `\眉批` | `\MeiPi` | 命令 |
| `\批注` | `\PiZhu` | 命令 |
| `\文本框` | `\TextBox` | 命令 |
| `\填充文本框` | `\FillTextBox` | 命令 |
| `\装饰` | `\decorate` | 命令 |
| `\圈点` | `\EmphasisMark` | 命令 |
| `\专名号` | `\ProperNameMark` | 命令 |
| `\书名号` | `\BookTitleMark` | 命令 |
| `\空格` | `\Space` | 命令 |
| `\设置缩进` | `\SetIndent` | 命令 |
| `\正文` | `BodyText` | 环境 |
| `\段落` | `Paragraph` | 环境 |
| `\列表` | 无 | 环境 |
| `\反白` | `\inverted` | 命令 |
| `\八角框` | `\octagon` | 命令 |
| `\带圈` | `\circled` | 命令 |
| `\改` | `\fix` | 命令 |
| `\下划线` | `\Underline` | 命令 |
| `\波浪线` | `\WavyUnderline` | 命令 |
