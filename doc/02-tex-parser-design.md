# TeX 解析器设计

> 阶段 1：将 luatex-cn 格式的 .tex 文件解析为 AST

## 1. 设计原则

- **有限解析**：不实现完整的 TeX 引擎，只解析 luatex-cn 使用的命令子集（60+ 条）
- **容错优先**：遇到不认识的命令时生成警告并尝试保留其内容，而非中断解析
- **流式两阶段**：Tokenizer 一次性产出完整 Token 数组，Parser 消费该数组生成 AST
- **递归下降**：Parser 使用递归下降策略，天然支持嵌套命令和环境
- **数据驱动**：所有命令的参数模式、节点映射、别名关系都定义在 CommandRegistry 中，Parser 不硬编码任何具体命令

## 2. 词法分析器 (Tokenizer)

文件位置：`src/parser/tokenizer.js`

### 2.1 Token 类型

```javascript
const TokenType = {
  COMMAND: 'COMMAND',              // \xxx 命令
  OPEN_BRACE: 'OPEN_BRACE',       // {
  CLOSE_BRACE: 'CLOSE_BRACE',     // }
  OPEN_BRACKET: 'OPEN_BRACKET',   // [
  CLOSE_BRACKET: 'CLOSE_BRACKET', // ]
  TEXT: 'TEXT',                    // 普通文本（含中文）
  NEWLINE: 'NEWLINE',             // \\ (强制换列)
  COMMENT: 'COMMENT',             // % 开头的注释（跳过，不产出 token）
  BEGIN: 'BEGIN',                  // \begin (特殊命令)
  END: 'END',                     // \end (特殊命令)
  MATH: 'MATH',                   // $...$ 数学模式
  PARAGRAPH_BREAK: 'PARAGRAPH_BREAK', // 空行（\n\s*\n）
  EOF: 'EOF',                     // 文件结束标记
};
```

### 2.2 Tokenizer 扫描逻辑

Tokenizer 维护一个位置指针 `pos`，从头到尾扫描源文本，根据当前字符分派处理：

```
读取字符 ch
  ├── '%' → skipComment(): 跳过到行尾（含换行符），不产出 token
  ├── '$' → readMath(): 读到配对的 '$'，产出 MATH token
  │         若未找到配对 $，回退为 TEXT token（容错）
  ├── '\' → readCommand():
  │   ├── '\\' → 产出 NEWLINE token
  │   ├── 转义字符 \{ \} \[ \] \% \$ \& \# \_ \~ \^ → 产出 TEXT token
  │   ├── '\ ' 或 '\换行' → 产出 TEXT(' ') (控制空格)
  │   ├── ASCII 字母序列 → 产出 COMMAND/BEGIN/END token
  │   ├── CJK 字符序列 → 产出 COMMAND token
  │   └── 单个非字母字符 → 产出 COMMAND token (如 \,)
  ├── '{' → 产出 OPEN_BRACE
  ├── '}' → 产出 CLOSE_BRACE
  ├── '[' → 产出 OPEN_BRACKET
  ├── ']' → 产出 CLOSE_BRACKET
  └── 其他 → readText(): 累积文本直到遇到特殊字符
             文本中的空行 (\n\s*\n) 拆分为 PARAGRAPH_BREAK token
```

### 2.3 CJK 命令识别规则

这是 luatex-cn 的一个独特设计：命令名可以是中文字符。Tokenizer 根据首字符类型决定命令名的扫描策略：

- **ASCII 命令**（首字符是字母/`@`/`*`）：持续读取字母、`@`、`*`，例如 `\documentclass`、`\begin`
- **CJK 命令**（首字符是 CJK 统一表意文字）：持续读取 CJK 字符，例如 `\夹注`、`\侧批`

CJK 字符判断范围：

```javascript
function isCJK(ch) {
  const code = ch.codePointAt(0);
  if (code >= 0x4E00 && code <= 0x9FFF) return true;  // CJK 统一表意文字
  if (code >= 0x3400 && code <= 0x4DBF) return true;  // CJK 扩展 A
  if (code >= 0xF900 && code <= 0xFAFF) return true;  // CJK 兼容表意文字
  return false;
}
```

**重要陷阱**：CJK 命令会贪婪地消费所有后续 CJK 字符。例如 `\换行地` 会被解析为命令 `换行地` 而非命令 `换行` + 文字 `地`。要分隔必须使用空大括号 `\换行{}地` 或空格 `\换行 地`。

### 2.4 命令后空格吞并

所有命令（无论 ASCII 还是 CJK）在读取命令名后都会跳过尾随空格。这符合标准 TeX 行为：

```javascript
// 命令名读取完毕后
while (this.pos < this.source.length && this.source[this.pos] === ' ') {
  this.pos++;
}
```

### 2.5 文本中的段落分隔

`readText()` 在累积普通文本时，会检测空行模式 `\n\s*\n`（连续两个换行，中间可以有空白字符）。遇到空行时，将文本拆分并插入 `PARAGRAPH_BREAK` token：

```javascript
// 文本 "第一段\n\n第二段" 产出:
//   TEXT("第一段")
//   PARAGRAPH_BREAK
//   TEXT("第二段")
```

连续空白字符在文本内被折叠为单个空格（`/[ \t]+/g` → `' '`），空白-only 的文本片段被丢弃。

### 2.6 数学模式

`$...$` 内容作为 MATH token 保留原始文本。若 `$` 未配对（到文件末尾没有找到闭合 `$`），整段内容回退为 TEXT token（在前面加上 `$` 字符），这是容错设计。

## 3. 语法分析器 (Parser)

文件位置：`src/parser/parser.js`

### 3.1 核心结构

Parser 采用经典的递归下降策略，维护以下状态：

- `tokens[]`：Tokenizer 产出的完整 token 数组
- `pos`：当前消费到的 token 位置
- `warnings[]`：解析过程中收集的警告信息

主要方法：

| 方法 | 职责 |
|------|------|
| `parse()` | 入口：创建 DOCUMENT 根节点，循环调用 parseToken() |
| `parseToken(doc)` | 根据当前 token 类型分派处理 |
| `parseCommand(doc)` | 处理 COMMAND token：查找定义、解析参数、创建节点 |
| `parseEnvironment(doc)` | 处理 BEGIN token：解析环境名和内容直到 END |
| `readBraceGroup()` | 读取 `{...}` 内容为原始字符串 |
| `readBracketGroup()` | 读取 `[...]` 内容为原始字符串，未找到 `[` 返回 null |
| `readBraceGroupAsNodes()` | 读取 `{...}` 内容并递归解析为子节点列表 |
| `parseCommandArgs(def)` | 根据命令定义的 args 数组逐个解析参数 |

### 3.2 命令解析流程

当 `parseToken()` 遇到 COMMAND token 时：

```
1. 消费 COMMAND token，获取命令名
2. 调用 resolveCommand(name) 查找命令定义
3. 特殊处理:
   - documentclass → 提取模板和文档类名，存入 doc 元数据
   - title / chapter → 提取内容，存入 doc 元数据
   - item → 直接返回 LIST_ITEM 标记节点
4. 未找到定义 → 生成警告，尝试消费后续 {} 内容作为 TEXT
5. ignore 标记的命令 → 消费参数后返回 null（不产生 AST 节点）
6. setupCmd 命令 → 解析参数为 key-value，创建 SETUP 节点存入 doc.setupCommands
7. 普通命令:
   a. 调用 parseCommandArgs(def) 读取可选/必选参数
   b. 解析可选参数为 options (parseKeyValue)
   c. 创建目标类型的 AST 节点
   d. 若有 defaultOpt 且未提供可选参数，使用默认值
   e. 必选参数内容递归解析为子节点 (re-tokenize + re-parse)
   f. 特殊字段处理: space/taitou → value, stamp → src, setIndent → value
```

### 3.3 嵌套命令处理

命令的必选参数 `{...}` 内可能包含其他命令。Parser 通过「重新词法分析+递归解析」实现嵌套：

```javascript
// 将必选参数的原始文本重新 tokenize 和 parse
const { Tokenizer } = require_tokenizer();
const innerTokens = new Tokenizer(requiredArgs[0]).tokenize();
const innerParser = new Parser(innerTokens);
// 逐个解析 token 并添加为子节点
while (innerParser.pos < innerParser.tokens.length) {
  const child = innerParser.parseToken(doc);
  if (child) node.children.push(child);
}
```

这使得 `\夹注{集解\圈点{重要}徐廣曰}` 能正确解析为 JIAZHU 节点包含 TEXT + EMPHASIS + TEXT 子节点。

### 3.4 环境解析流程

当 `parseToken()` 遇到 BEGIN token 时：

```
1. 消费 BEGIN token
2. 读取 {envName}
3. 调用 resolveEnvironment(envName) 查找环境定义
4. 未找到定义 → 生成警告，解析内容直到 \end{envName}，创建 UNKNOWN 节点
5. 找到定义:
   a. 若 hasOptions 为 true，尝试读取 [options]
   b. 创建目标类型的 AST 节点
   c. 调用 parseUntilEnd(envName) 解析环境体
   d. 若为 list 类型，后处理: groupListItems() 将 \item 分隔符转为容器节点
```

`parseUntilEnd()` 循环解析 token 直到遇到匹配的 `\end{envName}`。若遇到不匹配的 `\end`，生成警告并继续；若到达 EOF，生成「未闭合环境」警告。

### 3.5 列表项分组

列表环境 `\begin{列表}...\end{列表}` 内部使用 `\item` 分隔各条目。解析后的原始子节点列表中，`\item` 产生的 LIST_ITEM 节点只是分隔标记。`groupListItems()` 后处理将其转为容器结构：

```
原始: [LIST_ITEM, TEXT("条目一"), TEXT("内容"), LIST_ITEM, TEXT("条目二")]

分组后: [
  LIST_ITEM { children: [TEXT("条目一"), TEXT("内容")] },
  LIST_ITEM { children: [TEXT("条目二")] }
]
```

首个 `\item` 之前如有内容，会创建隐式 LIST_ITEM 包裹。

## 4. 命令注册表 (CommandRegistry)

文件位置：`src/parser/commands.js`

### 4.1 命令定义格式

每个规范命令的完整定义包含以下字段：

```javascript
'夹注': {
  args: ['optional', 'required'],  // 参数模式: [] 可选 + {} 必选
  node: 'jiazhu',                  // AST 节点类型映射键
  category: 'annotation',          // 语义分类
  description: 'Interlinear dual-column annotation',  // 文档描述
  status: 'full',                  // 实现状态
}
```

字段说明：

| 字段 | 类型 | 说明 |
|------|------|------|
| `args` | string[] | 参数解析模式：`'optional'` 对应 `[...]`，`'required'` 对应 `{...}` |
| `node` | string | 节点类型映射键，通过 `mapNodeType()` 转为 `NodeType` 枚举值 |
| `category` | string | 语义分类：structure, annotation, decoration, layout, setup, ignored |
| `description` | string | 命令功能描述，用于文档生成 |
| `status` | string | 实现状态：full（完整）、partial（部分）、none（未实现）、n/a（不适用） |
| `ignore` | boolean | 为 true 时消费参数但不产生 AST 节点 |
| `defaultOpt` | string | 未提供可选参数时的默认值（如 `\平抬` 默认值为 `'0'`） |
| `setupType` | string | setup 命令的配置类型（content, page, banxin, jiazhu 等） |
| `single` | boolean | 夹注特有：单行夹注标记 |

### 4.2 别名链

别名通过 `{ alias: '规范名' }` 指向规范命令。支持多级别名链（虽然实践中通常只有一级）：

```javascript
// 简体中文 → 规范命令
'谨按': { alias: '按' },

// 繁体中文 → 简体别名 → 规范命令
'謹按': { alias: '按' },

// 拼音 → 规范命令
'JiaZhu': { alias: '夹注' },
'SideNode': { alias: '侧批' },
```

`resolveCommand()` 通过循环解析别名链，使用 `Set` 检测循环防止无限循环：

```javascript
export function resolveCommand(name) {
  let def = commandRegistry[name];
  const visited = new Set();
  while (def && def.alias && !visited.has(def.alias)) {
    visited.add(name);
    name = def.alias;
    def = commandRegistry[name];
  }
  return def || null;
}
```

### 4.3 命令分类总览

| 类别 (category) | 命令数量 | 代表命令 |
|-----------------|---------|---------|
| structure | 5 | documentclass, title, chapter, item, 条目 |
| annotation | 16 | 夹注/按/注/標, 侧批, 眉批, 批注 (含别名) |
| decoration | 14 | 圈点, 专名号, 书名号, 反白, 八角框, 带圈, 改, 装饰 |
| layout | 17 | 空格, 换行, 抬头/平抬/单抬/双抬/三抬, 挪抬/空抬, 设置缩进, 相对抬头, 文本框, 印章 |
| setup | 19 | contentSetup, pageSetup, banxinSetup, gujiSetup, 句读模式等 |
| ignored | 12 | usepackage, setmainfont, pagestyle, noindent, par 等 |

### 4.4 环境注册表

环境注册表 (`environmentRegistry`) 结构类似，定义了 `\begin{...}...\end{...}` 形式的环境：

```javascript
'正文': {
  node: 'contentBlock',
  category: 'structure',
  description: 'Content block environment',
  status: 'full',
},
'段落': {
  node: 'paragraph', hasOptions: true,  // 支持 [indent=2] 可选参数
  category: 'structure',
  description: 'Paragraph with indent options',
  status: 'full',
},
'列表': { node: 'list', ... },
'夹注环境': { node: 'jiazhu', ... },
'document': { node: 'body', ... },
```

环境别名同样通过 `{ alias: '规范名' }` 实现，例如 `'BodyText': { alias: '正文' }`。

## 5. AST 节点类型

文件位置：`src/model/nodes.js`

### 5.1 NodeType 枚举完整列表

```javascript
const NodeType = {
  // 文档结构
  DOCUMENT: 'document',           // 文档根节点
  CONTENT_BLOCK: 'contentBlock',  // \begin{正文}
  PARAGRAPH: 'paragraph',         // \begin{段落}[indent=N]
  TEXT: 'text',                   // 纯文本内容
  NEWLINE: 'newline',             // \\ 强制换列
  PARAGRAPH_BREAK: 'paragraphBreak', // 空行段落分隔

  // 注释类
  JIAZHU: 'jiazhu',              // \夹注[options]{content}
  SIDENOTE: 'sidenote',          // \侧批[options]{content}
  MEIPI: 'meipi',                // \眉批[options]{content}
  PIZHU: 'pizhu',                // \批注[options]{content}

  // 文本框
  TEXTBOX: 'textbox',            // \文本框[options]{content}
  FILL_TEXTBOX: 'fillTextbox',   // \填充文本框[options]{content}

  // 布局控制
  SPACE: 'space',                // \空格[N]
  COLUMN_BREAK: 'columnBreak',   // \换行
  TAITOU: 'taitou',              // \抬头[N], \平抬, \单抬...
  NUOTAI: 'nuotai',              // \挪抬[N], \空抬
  SET_INDENT: 'setIndent',       // \设置缩进{N}

  // 装饰类
  EMPHASIS: 'emphasis',           // \圈点{text}
  PROPER_NAME: 'properName',     // \专名号{text}
  BOOK_TITLE: 'bookTitle',       // \书名号{text}
  INVERTED: 'inverted',          // \反白{text}
  OCTAGON: 'octagon',            // \八角框{text}
  CIRCLED: 'circled',            // \带圈{text}
  INVERTED_OCTAGON: 'invertedOctagon', // \反白八角框{text}
  FIX: 'fix',                    // \改{text}
  DECORATE: 'decorate',          // \装饰[options]{text}

  // 列表
  LIST: 'list',                  // \begin{列表}
  LIST_ITEM: 'listItem',         // \item

  // 配置与元数据
  SETUP: 'setup',                // setup 命令 (存入 doc.setupCommands)
  STAMP: 'stamp',                // \印章[options]{src}
  MATH: 'math',                  // $...$
  MULU_ITEM: 'muluItem',         // \条目[level]{content}

  // 兜底
  UNKNOWN: 'unknown',            // 未识别的命令/环境
};
```

### 5.2 节点结构

所有节点通过 `createNode(type, props)` 创建，基础结构为：

```javascript
{ type: NodeType.XXX, children: [], ...props }
```

不同类型的节点会附加不同的属性：

| 节点类型 | 额外属性 |
|---------|---------|
| TEXT | `value: string` |
| JIAZHU / SIDENOTE / MEIPI / PIZHU | `options: object`, `children: Node[]` |
| SPACE / TAITOU / NUOTAI | `value: string` (数值) |
| SET_INDENT | `value: string` (数值) |
| STAMP | `options: object`, `src: string` |
| SETUP | `setupType: string`, `params: object` |
| PARAGRAPH | `options: { indent: string }` |
| MULU_ITEM | `options: { value: string }`, `children: Node[]` |
| DOCUMENT | `template, documentClass, title, chapter, setupCommands[]` |

## 6. parseKeyValue 实现

文件位置：`src/model/nodes.js`

`parseKeyValue()` 解析 TeX 的 key=value 参数字符串。该函数处理以下场景：

### 6.1 基本键值对

```
"indent=2, first-indent=0" → { indent: "2", "first-indent": "0" }
```

### 6.2 嵌套大括号值

```
"color={180, 95, 75}" → { color: "180, 95, 75" }
```

大括号嵌套通过 `depth` 计数器跟踪，只在 depth=0 时识别逗号和等号分隔符。

### 6.3 布尔标记（无等号的键）

```
"border, rounded" → { border: "true", rounded: "true" }
```

没有 `=` 的键被视为布尔标记，值设为 `'true'`。

### 6.4 纯数字值

```
"2" → { value: "2" }
```

当整个字符串是单个数字时，将其存为 `{ value: "2" }`。这用于 `\空格[2]`、`\抬头[1]` 等只接受数值的命令。

### 6.5 实现细节

```javascript
export function parseKeyValue(str) {
  if (!str || !str.trim()) return {};
  const result = {};
  let depth = 0, currentKey = '', currentValue = '', inValue = false;

  for (let i = 0; i < str.length; i++) {
    const ch = str[i];
    if (ch === '{') depth++;
    if (ch === '}') depth--;

    if (depth === 0 && ch === ',') {
      // 完成一对 key=value
      if (currentKey.trim()) {
        result[currentKey.trim()] = inValue ? currentValue.trim() : 'true';
      }
      currentKey = ''; currentValue = ''; inValue = false;
    } else if (depth === 0 && ch === '=' && !inValue) {
      inValue = true;
    } else if (inValue) {
      currentValue += ch;
    } else {
      currentKey += ch;
    }
  }
  // 处理最后一对
  if (currentKey.trim()) {
    const key = currentKey.trim();
    if (inValue) {
      result[key] = currentValue.trim();
    } else if (/^\d+$/.test(key)) {
      result['value'] = key;    // 纯数字 → value 字段
    } else {
      result[key] = 'true';     // 布尔标记
    }
  }
  return result;
}
```

## 7. Parser 与 Tokenizer 的循环依赖解决

Parser 需要 Tokenizer 来处理嵌套命令（将必选参数内容重新 tokenize），而 Tokenizer 是在 Parser 同一模块体系内定义的。这构成了潜在的循环依赖。

解决方案采用**惰性注入模式** (`setTokenizer`)：

```javascript
// parser.js 内部
let _Tokenizer = null;

function require_tokenizer() {
  if (!_Tokenizer) _Tokenizer = { Tokenizer: null };
  return _Tokenizer;
}

export function setTokenizer(TokenizerClass) {
  if (!_Tokenizer) _Tokenizer = {};
  _Tokenizer.Tokenizer = TokenizerClass;
}
```

在模块入口 `src/parser/index.js` 中完成注入：

```javascript
import { Tokenizer } from './tokenizer.js';
import { Parser, setTokenizer } from './parser.js';

setTokenizer(Tokenizer);  // 注入完成，Parser 可以使用 Tokenizer

export function parse(source) {
  const tokenizer = new Tokenizer(source);
  const tokens = tokenizer.tokenize();
  const parser = new Parser(tokens);
  const ast = parser.parse();
  return { ast, warnings: parser.warnings };
}
```

这样 `parser.js` 不直接 import `tokenizer.js`，避免了 ES Module 的循环依赖问题。

## 8. 解析流程完整示例

### 输入

```latex
\documentclass[四库全书]{ltc-guji}
\title{欽定四庫全書}
\contentSetup{font-size=20px, border-color={180, 95, 75}}
\begin{document}
\begin{正文}
\begin{段落}[indent=2]
天地玄黄\夹注[align=inward]{宇宙洪荒日月盈昃}\\
辰宿列張\圈点{寒來暑往}
\end{段落}
\end{正文}
\end{document}
```

### 词法分析产出 Token 流

```
COMMAND("documentclass") OPEN_BRACKET TEXT("四库全书") CLOSE_BRACKET
OPEN_BRACE TEXT("ltc-guji") CLOSE_BRACE
COMMAND("title") OPEN_BRACE TEXT("欽定四庫全書") CLOSE_BRACE
COMMAND("contentSetup") OPEN_BRACE TEXT("font-size=20px, border-color={180, 95, 75}") CLOSE_BRACE
BEGIN OPEN_BRACE TEXT("document") CLOSE_BRACE
BEGIN OPEN_BRACE TEXT("正文") CLOSE_BRACE
BEGIN OPEN_BRACE TEXT("段落") CLOSE_BRACE OPEN_BRACKET TEXT("indent=2") CLOSE_BRACKET
TEXT("天地玄黄")
COMMAND("夹注") OPEN_BRACKET TEXT("align=inward") CLOSE_BRACKET OPEN_BRACE TEXT("宇宙洪荒日月盈昃") CLOSE_BRACE
NEWLINE TEXT("辰宿列張")
COMMAND("圈点") OPEN_BRACE TEXT("寒來暑往") CLOSE_BRACE
END OPEN_BRACE TEXT("段落") CLOSE_BRACE
END OPEN_BRACE TEXT("正文") CLOSE_BRACE
END OPEN_BRACE TEXT("document") CLOSE_BRACE
EOF
```

### 语法分析产出 AST

```javascript
{
  type: 'document',
  documentClass: 'ltc-guji',
  template: '四库全书',
  title: '欽定四庫全書',
  chapter: '',
  setupCommands: [
    {
      type: 'setup',
      setupType: 'content',
      params: { 'font-size': '20px', 'border-color': '180, 95, 75' }
    }
  ],
  children: [
    {
      type: 'body',
      children: [
        {
          type: 'contentBlock',
          children: [
            {
              type: 'paragraph',
              options: { indent: '2' },
              children: [
                { type: 'text', value: '天地玄黄' },
                {
                  type: 'jiazhu',
                  options: { align: 'inward' },
                  children: [
                    { type: 'text', value: '宇宙洪荒日月盈昃' }
                  ]
                },
                { type: 'newline' },
                { type: 'text', value: '辰宿列張' },
                {
                  type: 'emphasis',
                  options: {},
                  children: [
                    { type: 'text', value: '寒來暑往' }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## 9. 错误处理策略

| 情况 | 处理方式 |
|------|---------|
| 不认识的命令 | 生成警告，消费后续 `{...}` 内容作为 TEXT 节点返回 |
| 大括号不匹配 | 在 EOF 处停止读取，已读内容正常返回 |
| 环境不匹配 | `\end{A}` 遇到 `\end{B}` 时生成警告并继续；到 EOF 生成「未闭合环境」警告 |
| 未闭合数学模式 `$` | 将 `$` 和后续内容作为 TEXT 返回（非错误） |
| 空 `.tex` 文件 | 返回空的 DOCUMENT 节点（`children: []`） |
| 命令后无参数 | 如定义要求 `required` 但未遇到 `{`，`readBraceGroup()` 返回空字符串 |
| 嵌套深度过大 | 无硬编码限制，由调用栈深度决定（实践中古籍文件嵌套不超过 5 层） |

所有警告收集在 `parser.warnings[]` 数组中，由调用方决定是否展示。`parse()` 返回 `{ ast, warnings }` 双字段结构。
