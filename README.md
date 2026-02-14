# WebTeX-CN

将 [luatex-cn](https://github.com/open-guji/luatex-cn) 兼容的 `.tex` 文件转换为 HTML+CSS，在浏览器中实现传统古籍竖排效果。

## 特性

- 竖排排版（`writing-mode: vertical-rl`），从右到左阅读
- 自动分页：内容超出一个 spread 时自动创建新页
- 版心（鱼尾、书名、章节信息）
- 夹注：双行小字注释，自动分列平衡，长夹注跨页拆分
- 列表、段落缩进、眉批、侧批、批注
- 圈点、专名号、书名号等装饰标记
- 多模板：四库全书（黑白/彩色）、红楼梦甲戌本、极简
- 纯 JavaScript，零依赖，浏览器和 Node.js 均可运行
- 60+ TeX 命令支持

## 安装

```bash
npm install webtex-cn
```

## 快速开始

### 浏览器

```html
<link rel="stylesheet" href="node_modules/webtex-cn/src/templates/base.css">
<link rel="stylesheet" href="node_modules/webtex-cn/src/templates/siku-quanshu-colored.css">

<div id="viewer"></div>

<script type="module">
  import { renderToDOM } from 'webtex-cn';

  const tex = `\\documentclass[四库全书彩色]{ltc-guji}
\\title{欽定四庫全書}
\\chapter{史記\\\\卷一}

\\begin{document}
\\begin{正文}
天地玄黃宇宙洪荒\\夹注{千字文开篇}日月盈昃辰宿列張
\\end{正文}
\\end{document}`;

  renderToDOM(tex, '#viewer');
</script>
```

### Node.js

```js
import { renderToHTML } from 'webtex-cn';
import { readFileSync, writeFileSync } from 'fs';

const tex = readFileSync('input.tex', 'utf8');
const html = renderToHTML(tex);
writeFileSync('output.html', html);
```

### CLI

```bash
# 构建静态 HTML
npx webtex-cn build input.tex -o output/

# 启动预览服务器
npx webtex-cn serve input.tex -p 8080
```

## API

### `renderToHTML(texSource: string): string`

解析 TeX 源码，经过布局引擎分页后渲染为 HTML 字符串。返回多个 `<div class="wtc-page">` 拼接的 HTML。

### `renderToDOM(texSource: string, container: HTMLElement | string, options?)`

解析并渲染到指定 DOM 容器中。`container` 可以是 DOM 元素或 CSS 选择器。

options:
- `cssBasePath`: CSS 文件的基础路径，设置后自动加载模板 CSS

### `render(url: string, container: HTMLElement | string, options?)`

从 URL 获取 `.tex` 文件后渲染到 DOM 容器。

### `renderToPage(texSource: string): string`

渲染为完整的 HTML 页面（含 `<html>`, `<head>` 等）。

### `getTemplates(): Array<{id, name}>`

获取可用模板列表。

### `setTemplate(templateId: string, basePath?: string)`

动态切换 CSS 模板（仅浏览器环境）。

### 底层 API

```js
import { parse } from 'webtex-cn';
import { layout } from 'webtex-cn';
import { HTMLRenderer } from 'webtex-cn';

const { ast, warnings } = parse(texSource);
const layoutResult = layout(ast);
const renderer = new HTMLRenderer(ast);
const pageHTMLs = renderer.renderFromLayout(layoutResult);
```

## 模板

| 模板 ID | 名称 | 说明 |
|---------|------|------|
| `siku-quanshu` | 四库全书 | 黑白经典样式 |
| `siku-quanshu-colored` | 四库全书彩色 | 彩色仿古纸背景 |
| `honglou` | 红楼梦甲戌本 | 红楼梦甲戌本样式 |
| `minimal` | 极简 | 最小化样式，适合自定义 |

在 `.tex` 文件中通过 `\documentclass` 选择模板：

```latex
\documentclass[四库全书彩色]{ltc-guji}
```

## TeX 语法示例

```latex
\documentclass[四库全书彩色]{ltc-guji}
\title{欽定四庫全書}
\chapter{史記\\卷一}

\begin{document}
\begin{正文}
欽定四庫全書

\begin{列表}
    \item 史記卷一
    \item 五帝本紀第一
\end{列表}

\begin{段落}[indent=3]
    集解裴駰曰凡是徐氏義稱徐姓名以别之
\end{段落}

黄帝者\夹注{集解徐廣曰號有熊}少典之子
\end{正文}
\end{document}
```

完整命令参考请见 [doc/05-command-reference.md](doc/05-command-reference.md)。

## 架构

```
TeX 源码 → Parser → AST → Layout Engine → LayoutResult → HTML Renderer → HTML+CSS
```

三阶段管线：
1. **解析**：递归下降解析器，将 TeX 源码转为 AST
2. **布局**：虚拟网格布局引擎，计算每个节点的页/列/行坐标，处理分页和夹注分段
3. **渲染**：将布局结果转为 HTML，支持跨页标签平衡

详细架构文档见 [doc/](doc/) 目录。

## 开发

```bash
git clone https://github.com/open-guji/webtex-cn.git
cd webtex-cn
npm install

npm test            # 运行测试
npm run build       # 构建 dist/
npm run dev         # 启动示例预览
npm run lint        # ESLint 检查
npm run format      # Prettier 格式化
```

## 许可证

[Apache-2.0](LICENSE)
