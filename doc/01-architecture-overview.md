# WebTeX-CN 整体架构设计

> 将 luatex-cn 古籍竖排 TeX 文件转换为 HTML+CSS 网页展示

## 1. 项目定位

WebTeX-CN 是一个纯前端 JavaScript 工具，接收与 [luatex-cn](https://github.com/open-guji/luatex-cn) 兼容的 `.tex` 输入文件，解析其中的命令和内容，在浏览器中生成竖排古籍排版的 HTML+CSS 页面。

### 核心目标
- **输入兼容**：接受 luatex-cn 的 `.tex` 文件格式，支持相同的命令体系
- **网页展示**：通过 HTML + CSS（`writing-mode: vertical-rl`）实现竖排
- **大致还原**：不追求精确到像素的还原，而是大致呈现竖排效果
- **模板化**：通过 CSS 模板切换字体、间距、配色等样式
- **纯前端**：全部由 JavaScript 在浏览器端完成，无需后端

## 2. 与 luatex-cn 的关系

```
luatex-cn 流水线（PDF 输出）：
  .tex → LuaTeX 引擎 → 三阶段流水线（展平→布局→渲染）→ PDF

WebTeX-CN 流水线（HTML 输出）：
  .tex → JavaScript TeX 解析器 → HTML DOM 生成器 → CSS 竖排渲染 → 网页
```

### 关键差异
| 方面 | luatex-cn | WebTeX-CN |
|------|-----------|-----------|
| 排版引擎 | LuaTeX（网格精确定位） | CSS `writing-mode: vertical-rl` |
| 布局精度 | 像素级精确 | 大致还原，依赖浏览器排版 |
| 输出格式 | PDF | HTML + CSS |
| 运行环境 | TeX Live 命令行 | 浏览器 / Node.js |
| 分页 | 物理分页 | CSS 分页（可选） |

## 3. 整体架构

```
┌─────────────────────────────────────────────────┐
│                  用户 .tex 文件                   │
│  \documentclass[四库全书]{ltc-guji}               │
│  \title{...}  \chapter{...}                      │
│  \begin{正文} ... \夹注{...} ... \end{正文}       │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│          Layer 1: TeX 解析器 (tex-parser.js)      │
│                                                   │
│  • 词法分析 (Tokenizer)                            │
│  • 语法分析 (Parser)                               │
│  • 输出: 抽象文档树 (Document AST)                  │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│      Layer 2: 文档模型 (document-model.js)        │
│                                                   │
│  • 文档节点 (DocumentNode)                         │
│  • 正文块 (ContentBlock)                           │
│  • 段落 (Paragraph)                                │
│  • 夹注 (Jiazhu)                                   │
│  • 侧批 (SideNote)                                 │
│  • 眉批 (MeiPi)                                    │
│  • 批注 (PiZhu)                                    │
│  • 版心 (BanXin)                                   │
│  • 装饰 (Decorate)                                 │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│      Layer 3: HTML 生成器 (html-generator.js)     │
│                                                   │
│  • 遍历文档模型                                    │
│  • 为每种节点类型生成对应 HTML 结构                  │
│  • 注入 CSS 类名和内联样式                          │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│      Layer 4: CSS 模板系统 (templates/)            │
│                                                   │
│  • base.css — 竖排基础样式                          │
│  • siku-quanshu.css — 四库全书风格                   │
│  • siku-quanshu-colored.css — 四库全书彩色版         │
│  • honglou.css — 红楼梦甲戌本风格                    │
│  • custom.css — 用户自定义                          │
└─────────────────────────────────────────────────┘
```

## 4. 核心模块划分

### 4.1 TeX 解析器 (`src/parser/`)

负责将 `.tex` 文件解析为结构化的文档 AST。

```
src/parser/
  ├── tokenizer.js      # 词法分析：将 TeX 源码拆分为 token 流
  ├── parser.js          # 语法分析：将 token 流组装为 AST
  ├── commands.js        # 命令注册表：定义每个 TeX 命令的解析规则
  └── environments.js    # 环境注册表：定义环境的解析规则
```

### 4.2 文档模型 (`src/model/`)

定义文档的内部数据结构。

```
src/model/
  ├── document.js        # 文档根节点
  ├── content-block.js   # 正文块（对应 \begin{正文}）
  ├── paragraph.js       # 段落（对应 \begin{段落}）
  ├── jiazhu.js          # 夹注
  ├── sidenote.js        # 侧批
  ├── meipi.js           # 眉批
  ├── pizhu.js           # 批注
  ├── textbox.js         # 文本框
  ├── decorate.js        # 装饰（圈点、专名号等）
  └── banxin.js          # 版心
```

### 4.3 HTML 生成器 (`src/renderer/`)

将文档模型渲染为 HTML。

```
src/renderer/
  ├── html-renderer.js   # 主渲染器：遍历文档模型生成 HTML
  ├── page-builder.js    # 分页构建器（可选）
  ├── banxin-renderer.js # 版心渲染
  └── utils.js           # 工具函数
```

### 4.4 CSS 模板 (`src/templates/`)

可替换的 CSS 样式文件。

```
src/templates/
  ├── base.css                    # 竖排基础样式（所有模板共用）
  ├── siku-quanshu.css            # 四库全书（黑白）
  ├── siku-quanshu-colored.css    # 四库全书（彩色）
  ├── honglou.css                 # 红楼梦甲戌本
  └── variables.css               # CSS 变量定义（字体、间距等）
```

### 4.5 入口与工具 (`src/`)

```
src/
  ├── index.js           # 主入口：加载 .tex、调用解析器、渲染
  ├── config.js          # 配置管理（模板映射、默认参数）
  └── loader.js          # 文件加载器（fetch .tex 文件）
```

## 5. 数据流详解

```
用户加载网页
     │
     ▼
index.html 引用 webtex-cn.js + 选定的 CSS 模板
     │
     ▼
JavaScript 通过 fetch() 加载 .tex 文件内容
     │
     ▼
Tokenizer 将 TeX 源码分解为 Token 流:
  [\documentclass, [, 四库全书, ], {, ltc-guji, }, \title, {, 钦定四库全书, }, ...]
     │
     ▼
Parser 根据命令注册表构建 AST:
  Document {
    class: "ltc-guji",
    template: "四库全书",
    title: "钦定四库全书",
    chapter: "史记\n卷一",
    body: ContentBlock {
      children: [
        TextNode("黄帝者"),
        JiazhuNode("集解徐廣曰..."),
        TextNode("少典之子"),
        SideNoteNode("较长的侧批..."),
        ...
      ]
    }
  }
     │
     ▼
HTML Renderer 遍历 AST 生成 DOM:
  <div class="wtc-page">
    <div class="wtc-banxin">版心内容</div>
    <div class="wtc-content" style="writing-mode: vertical-rl">
      <span>黄帝者</span>
      <span class="wtc-jiazhu">
        <span class="wtc-jiazhu-left">集解徐</span>
        <span class="wtc-jiazhu-right">廣曰號</span>
      </span>
      ...
    </div>
  </div>
     │
     ▼
CSS 模板控制视觉呈现:
  字体、颜色、边框、间距、版心装饰等
```

## 6. 使用方式

### 方式 A：静态 HTML 文件（推荐）

```html
<!DOCTYPE html>
<html>
<head>
  <link rel="stylesheet" href="webtex-cn/base.css">
  <link rel="stylesheet" href="webtex-cn/templates/siku-quanshu.css">
  <script src="webtex-cn/webtex-cn.js"></script>
</head>
<body>
  <div id="webtex-container"></div>
  <script>
    WebTeX.render('example.tex', '#webtex-container');
  </script>
</body>
</html>
```

### 方式 B：Node.js 预编译

```bash
npx webtex-cn build example.tex -o output/
# 生成 output/index.html + output/style.css
```

### 方式 C：TeX 文件内嵌使用

在 .tex 文件中通过 `\documentclass` 选项指定模板：

```latex
\documentclass[四库全书]{ltc-guji}     % → 加载 siku-quanshu.css
\documentclass[红楼梦甲戌本]{ltc-guji}  % → 加载 honglou.css
```

WebTeX-CN 解析 `\documentclass` 选项，自动切换对应的 CSS 模板。

## 7. 技术选型

| 方面 | 选择 | 理由 |
|------|------|------|
| 语言 | JavaScript (ES2020+) | 浏览器原生支持，无编译步骤 |
| 打包 | Rollup / esbuild | 生成单文件 `webtex-cn.js` |
| CSS 竖排 | `writing-mode: vertical-rl` | 现代浏览器原生支持 |
| 夹注实现 | CSS `display: inline-flex` + 双列 | 简洁直观 |
| 分页 | CSS `break-before` / JS 计算 | 按需分页 |
| 测试 | Vitest | 轻量快速 |

## 8. 不在范围内（Out of Scope）

以下 luatex-cn 功能在 WebTeX-CN 中**不实现**或**简化处理**：

- **筒子页模式**（split page）：网页不需要物理筒子页
- **精确网格定位**：依赖 CSS 自然排版，不做像素级网格
- **PDF 输出**：仅输出 HTML
- **句读模式**（judou）：简化为 CSS 样式类
- **印章图片**（yinzhang）：简化为 `<img>` 绝对定位
- **鱼尾装饰**（yuwei）：用 CSS border/SVG 近似
- **脚注/校勘记**：简化为页面底部注释

## 9. 浏览器兼容性

| 浏览器 | 最低版本 | 说明 |
|--------|---------|------|
| Chrome | 80+ | `writing-mode` 完整支持 |
| Firefox | 78+ | `writing-mode` 完整支持 |
| Safari | 14+ | `writing-mode` 完整支持 |
| Edge | 80+ | Chromium 内核 |

## 10. 目录结构总览

```
webtex-cn/
├── doc/                          # 设计文档（本目录）
├── src/
│   ├── parser/                   # TeX 解析器
│   │   ├── tokenizer.js
│   │   ├── parser.js
│   │   ├── commands.js
│   │   └── environments.js
│   ├── model/                    # 文档模型
│   │   ├── document.js
│   │   ├── content-block.js
│   │   ├── paragraph.js
│   │   ├── jiazhu.js
│   │   ├── sidenote.js
│   │   ├── meipi.js
│   │   ├── pizhu.js
│   │   ├── textbox.js
│   │   ├── decorate.js
│   │   └── banxin.js
│   ├── renderer/                 # HTML 渲染器
│   │   ├── html-renderer.js
│   │   ├── page-builder.js
│   │   ├── banxin-renderer.js
│   │   └── utils.js
│   ├── templates/                # CSS 模板
│   │   ├── base.css
│   │   ├── variables.css
│   │   ├── siku-quanshu.css
│   │   ├── siku-quanshu-colored.css
│   │   └── honglou.css
│   ├── index.js                  # 主入口
│   ├── config.js                 # 配置
│   └── loader.js                 # 文件加载
├── examples/                     # 示例 .tex 文件
├── test/                         # 测试
├── dist/                         # 构建输出
├── package.json
└── README.md
```
