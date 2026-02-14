# TeX 解析器设计

> 将 luatex-cn 格式的 .tex 文件解析为结构化文档模型

## 1. 设计原则

- **有限解析**：不实现完整的 TeX 引擎，只解析 luatex-cn 使用的命令子集
- **容错优先**：遇到不认识的命令时跳过而非报错
- **流式处理**：Tokenizer 产出 Token 流，Parser 消费 Token 流生成 AST

## 2. 词法分析器 (Tokenizer)

### 2.1 Token 类型

```javascript
const TokenType = {
  COMMAND: 'COMMAND',         // \xxx 命令，如 \documentclass, \夹注
  OPEN_BRACE: 'OPEN_BRACE',  // {
  CLOSE_BRACE: 'CLOSE_BRACE',// }
  OPEN_BRACKET: 'OPEN_BRACKET',   // [
  CLOSE_BRACKET: 'CLOSE_BRACKET', // ]
  TEXT: 'TEXT',               // 普通文本（含中文字符）
  NEWLINE: 'NEWLINE',        // 换行符 \\
  COMMENT: 'COMMENT',        // % 注释
  BEGIN: 'BEGIN',             // \begin
  END: 'END',                // \end
  MATH: 'MATH',              // $ ... $ (忽略)
  EOF: 'EOF',                // 文件结束
};
```

### 2.2 Tokenizer 状态机

```
初始状态 → 读字符
  ├── '%' → 跳过到行尾（注释）
  ├── '\' → 读命令名
  │   ├── '\\'  → 产出 NEWLINE token
  │   ├── '\begin' → 产出 BEGIN token
  │   ├── '\end'   → 产出 END token
  │   └── '\xxx'   → 产出 COMMAND token
  ├── '{' → 产出 OPEN_BRACE
  ├── '}' → 产出 CLOSE_BRACE
  ├── '[' → 产出 OPEN_BRACKET
  ├── ']' → 产出 CLOSE_BRACKET
  └── 其他 → 积累文本 → 产出 TEXT token
```

### 2.3 关键实现细节

**命令名称规则**：
- ASCII 命令：`\` + 字母序列（如 `\documentclass`, `\title`）
- CJK 命令：`\` + 汉字序列（如 `\夹注`, `\侧批`, `\段落`）
- 特殊命令：`\\`（换行）

**中文支持**：
```javascript
function isCommandChar(ch) {
  // ASCII 字母
  if (/[a-zA-Z]/.test(ch)) return true;
  // CJK 统一表意文字 (U+4E00-U+9FFF)
  if (/[\u4E00-\u9FFF]/.test(ch)) return true;
  return false;
}
```

**空格处理**：
- TeX 中命令后的空格被忽略
- 连续空格视为一个空格
- 空行视为段落分隔

## 3. 语法分析器 (Parser)

### 3.1 AST 节点类型

```javascript
const NodeType = {
  DOCUMENT: 'document',           // 文档根
  DOCUMENT_CLASS: 'documentClass', // \documentclass
  PREAMBLE: 'preamble',          // 导言区
  BODY: 'body',                   // \begin{document}...\end{document}
  CONTENT_BLOCK: 'contentBlock',  // \begin{正文}
  PARAGRAPH: 'paragraph',         // \begin{段落}
  TEXT: 'text',                   // 纯文本
  JIAZHU: 'jiazhu',              // \夹注{...}
  SIDENOTE: 'sidenote',          // \侧批{...}
  MEIPI: 'meipi',                // \眉批{...}
  PIZHU: 'pizhu',                // \批注[...]{...}
  TEXTBOX: 'textbox',            // \文本框[...]{...}
  FILL_TEXTBOX: 'fillTextbox',   // \填充文本框[...]{...}
  TITLE: 'title',                // \title{...}
  CHAPTER: 'chapter',            // \chapter{...}
  SPACE: 'space',                // \空格[N]
  NEWLINE: 'newline',            // \\
  TAITOU: 'taitou',              // \抬头[N], \平抬, \单抬 等
  NUOTAI: 'nuotai',              // \挪抬[N]
  DECORATE: 'decorate',          // \装饰[...]{...}
  EMPHASIS: 'emphasis',           // \圈点{...}
  PROPER_NAME: 'properName',     // \专名号{...}
  BOOK_TITLE: 'bookTitle',       // \书名号{...}
  INVERTED: 'inverted',          // \反白{...}
  OCTAGON: 'octagon',            // \八角框{...}
  CIRCLED: 'circled',            // \带圈{...}
  SET_INDENT: 'setIndent',       // \设置缩进{N}
  COLUMN_BREAK: 'columnBreak',   // \换行
  SETUP_CMD: 'setupCmd',         // \contentSetup{...} 等配置命令
  LIST: 'list',                  // \begin{列表}
  LIST_ITEM: 'listItem',         // \item
  UNKNOWN: 'unknown',            // 不认识的命令
};
```

### 3.2 命令注册表

每个命令定义其参数模式：

```javascript
const commandRegistry = {
  // 文档结构
  'documentclass': { args: ['optional', 'required'] },
  'title':         { args: ['required'] },
  'chapter':       { args: ['required'] },

  // 古籍命令（中文名称）
  '夹注':     { args: ['optional', 'required'], node: 'jiazhu' },
  'JiaZhu':   { alias: '夹注' },
  '侧批':     { args: ['optional', 'required'], node: 'sidenote' },
  'SideNode': { alias: '侧批' },
  'CePi':     { alias: '侧批' },
  '眉批':     { args: ['optional', 'required'], node: 'meipi' },
  'MeiPi':    { alias: '眉批' },
  '批注':     { args: ['optional', 'required'], node: 'pizhu' },
  'PiZhu':    { alias: '批注' },

  // 文本框
  '文本框':     { args: ['optional', 'required'], node: 'textbox' },
  'TextBox':   { alias: '文本框' },
  '填充文本框': { args: ['optional', 'required'], node: 'fillTextbox' },
  'FillTextBox': { alias: '填充文本框' },

  // 装饰
  '圈点':     { args: ['optional', 'required'], node: 'emphasis' },
  '装饰':     { args: ['optional', 'required'], node: 'decorate' },
  '专名号':   { args: ['optional', 'required'], node: 'properName' },
  '书名号':   { args: ['optional', 'required'], node: 'bookTitle' },
  '反白':     { args: ['required'], node: 'inverted' },
  '八角框':   { args: ['required'], node: 'octagon' },
  '带圈':     { args: ['required'], node: 'circled' },

  // 布局控制
  '空格':     { args: ['optional'], node: 'space' },
  'Space':   { alias: '空格' },
  '设置缩进': { args: ['required'], node: 'setIndent' },
  'SetIndent': { alias: '设置缩进' },
  '换行':     { args: [], node: 'columnBreak' },

  // 抬头命令
  '抬头':     { args: ['optional'], node: 'taitou' },
  '平抬':     { args: [], node: 'taitou', defaultOpt: '0' },
  '单抬':     { args: [], node: 'taitou', defaultOpt: '1' },
  '双抬':     { args: [], node: 'taitou', defaultOpt: '2' },
  '三抬':     { args: [], node: 'taitou', defaultOpt: '3' },
  '挪抬':     { args: ['optional'], node: 'nuotai' },
  '空抬':     { args: [], node: 'nuotai', defaultOpt: '1' },

  // 配置命令（解析但仅存储参数）
  'contentSetup':  { args: ['required'], node: 'setupCmd', setupType: 'content' },
  'pageSetup':     { args: ['required'], node: 'setupCmd', setupType: 'page' },
  'banxinSetup':   { args: ['required'], node: 'setupCmd', setupType: 'banxin' },
  'sidenodeSetup': { args: ['required'], node: 'setupCmd', setupType: 'sidenode' },
  'jiazhuSetup':   { args: ['required'], node: 'setupCmd', setupType: 'jiazhu' },
  'pizhuSetup':    { args: ['required'], node: 'setupCmd', setupType: 'pizhu' },
  'meipiSetup':    { args: ['required'], node: 'setupCmd', setupType: 'meipi' },
  'gujiSetup':     { args: ['required'], node: 'setupCmd', setupType: 'guji' },
  'judouSetup':    { args: ['required'], node: 'setupCmd', setupType: 'judou' },

  // 句读模式
  '句读模式':         { args: ['optional'], node: 'setupCmd', setupType: 'judou-on' },
  '正常标点模式':     { args: ['optional'], node: 'setupCmd', setupType: 'judou-off' },
  '无标点模式':       { args: ['optional'], node: 'setupCmd', setupType: 'judou-none' },

  // 忽略的命令（TeX 专用，网页不需要）
  'usepackage':    { args: ['optional', 'required'], ignore: true },
  'RequirePackage': { alias: 'usepackage' },
  'setmainfont':   { args: ['optional', 'required'], ignore: true },
  'pagestyle':     { args: ['required'], ignore: true },
  'noindent':      { args: [], ignore: true },
  'par':           { args: [], ignore: true },
  'relax':         { args: [], ignore: true },
  'ignorespaces':  { args: [], ignore: true },
};
```

### 3.3 环境注册表

```javascript
const environmentRegistry = {
  'document':  { node: 'body' },
  '正文':      { node: 'contentBlock', alias: 'BodyText' },
  'BodyText':  { alias: '正文' },
  '段落':      { node: 'paragraph', args: ['optional'], alias: 'Paragraph' },
  'Paragraph': { alias: '段落' },
  '列表':      { node: 'list' },
  '夹注环境':   { node: 'jiazhu' },
  'JiaZhuEnv': { alias: '夹注环境' },
};
```

### 3.4 Key-Value 参数解析

luatex-cn 大量使用 `key=value` 格式的参数，需要专门的解析器：

```javascript
// 输入: "indent=2, first-indent=0, bottom-indent=1"
// 输出: { indent: "2", "first-indent": "0", "bottom-indent": "1" }

function parseKeyValue(str) {
  const result = {};
  // 处理嵌套大括号（如 color = {180, 95, 75}）
  let depth = 0;
  let currentKey = '';
  let currentValue = '';
  let inValue = false;

  for (const ch of str) {
    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0 && ch === ',' && inValue) {
      result[currentKey.trim()] = currentValue.trim();
      currentKey = '';
      currentValue = '';
      inValue = false;
    } else if (depth === 0 && ch === '=' && !inValue) {
      inValue = true;
    } else if (inValue) {
      currentValue += ch;
    } else {
      currentKey += ch;
    }
  }
  if (currentKey.trim()) {
    result[currentKey.trim()] = (currentValue || 'true').trim();
  }
  return result;
}
```

## 4. 解析流程示例

输入 TeX：
```latex
\documentclass[四库全书]{ltc-guji}
\title{钦定四库全书}
\chapter{史记\\卷一}
\begin{document}
\begin{正文}
黄帝者\夹注{集解徐廣曰號有熊}少典之子
\侧批{批注文字}
\begin{段落}[indent=2]
  天地玄黄\\
  宇宙洪荒
\end{段落}
\end{正文}
\end{document}
```

输出 AST：
```json
{
  "type": "document",
  "class": "ltc-guji",
  "template": "四库全书",
  "title": "钦定四库全书",
  "chapter": { "lines": ["史记", "卷一"] },
  "children": [
    {
      "type": "contentBlock",
      "children": [
        { "type": "text", "value": "黄帝者" },
        {
          "type": "jiazhu",
          "options": {},
          "children": [
            { "type": "text", "value": "集解徐廣曰號有熊" }
          ]
        },
        { "type": "text", "value": "少典之子" },
        { "type": "newline" },
        {
          "type": "sidenote",
          "options": {},
          "children": [
            { "type": "text", "value": "批注文字" }
          ]
        },
        {
          "type": "paragraph",
          "options": { "indent": "2" },
          "children": [
            { "type": "text", "value": "天地玄黄" },
            { "type": "newline" },
            { "type": "text", "value": "宇宙洪荒" }
          ]
        }
      ]
    }
  ]
}
```

## 5. 特殊处理

### 5.1 `\documentclass` 模板映射

从 luatex-cn 的 `ltc-guji.cls` 中提取模板名称映射：

```javascript
const templateMap = {
  '四库全书':         'siku-quanshu',
  '四庫全書':         'siku-quanshu',
  '四库全书彩色':     'siku-quanshu-colored',
  '四庫全書彩色':     'siku-quanshu-colored',
  '红楼梦甲戌本':     'honglou',
  '紅樓夢甲戌本':     'honglou',
  'default':          'siku-quanshu',
};
```

### 5.2 `\\` 换行处理

在 luatex-cn 中 `\\` 表示强制换列（竖排中的下一列），解析为 `newline` 节点。在 HTML 渲染时视上下文不同处理：
- 在 `正文` 中：强制换列
- 在 `段落` 中：段落内换行
- 在 `\chapter{史记\\卷一}` 中：标题内分行

### 5.3 嵌套命令处理

夹注内可能包含其他命令（如 `\平抬`），需要递归解析：

```latex
\夹注{集解裴駰曰\平抬 凡是徐氏義稱}
```

### 5.4 配置命令收集

`\contentSetup{...}`, `\pageSetup{...}` 等配置命令在解析阶段收集参数，存入文档模型的配置区域，供 HTML 渲染器和 CSS 模板使用。

## 6. 错误处理策略

| 情况 | 处理方式 |
|------|---------|
| 不认识的命令 | 跳过命令名，保留大括号内的内容作为纯文本 |
| 大括号不匹配 | 输出警告，尝试自动补全 |
| 环境不匹配 | 输出警告，在文件末尾自动关闭 |
| 数学模式 `$...$` | 忽略 `$` 符号，内容作为纯文本 |
| 空 `.tex` 文件 | 产出空文档 AST |
