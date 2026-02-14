# 实现路线图

> WebTeX-CN 从零到完成的分阶段开发计划

## 总体策略

采用**垂直切片**（Vertical Slice）策略：每个阶段都产出一个可运行的端到端示例，逐步增加功能复杂度。

```
阶段 1: 最小可用 → 纯文本竖排                    ✅ 完成
阶段 2: 核心功能 → 夹注 + 段落                    ✅ 完成
阶段 3: 批注系统 → 侧批 + 眉批 + 批注             ✅ 完成
阶段 4: 装饰边框 → 版心 + 边框 + 装饰             ✅ 完成
阶段 5: 模板系统 → CSS 模板切换                    ✅ 完成
阶段 6: 完善打磨 → 示例 + 文档 + 打包             ✅ 完成
```

### 当前进展摘要
- **104 个单元/集成/快照测试全部通过**（5 个测试文件）
- 4 个源代码模块: tokenizer, parser, model, renderer
- 4 个 CSS 模板: siku-quanshu, siku-quanshu-colored, honglou, minimal
- 4 个示例 TeX 文件 + 交互式 HTML demo 页面
- esbuild 构建系统: ESM + IIFE + 压缩版 (~24KB)
- Node.js CLI: `webtex-cn build` / `webtex-cn serve`
- Setup 命令覆盖: contentSetup, pageSetup, jiazhuSetup 等 → CSS 变量
- 双半页布局 + 版心（书名+章节）
- 响应式移动端适配 (@media max-width: 768px)
- 长夹注自动多列分段
- API: renderToHTML, renderToDOM, render, getTemplates, setTemplate
- 错误处理: 未知命令/环境警告, 未闭合环境检测
- $...$ 数学模式支持 (MATH token → `<span class="wtc-math">`)
- 空行段落分隔 (PARAGRAPH_BREAK token)
- 自动模板 CSS 加载 (renderToDOM 的 cssBasePath 选项)
- 快照回归测试 (4 个示例文件)
- ESLint + Prettier 代码规范
- 支持的命令: 夹注, 侧批, 眉批, 批注, 段落, 空格, 抬头, 圈点, 专名号, 书名号, 反白, 带圈, 文本框, 列表等

---

## 阶段 1：最小可用原型（Milestone 1）

**目标**：实现 TeX 文件的基本解析，纯文本竖排显示

### 任务清单

#### 1.1 项目初始化
- [ ] `npm init` 创建 `package.json`
- [ ] 配置 ESLint、Prettier
- [ ] 配置 Vitest 测试框架
- [ ] 创建基本目录结构 (`src/parser/`, `src/model/`, `src/renderer/`, `src/templates/`)

#### 1.2 TeX Tokenizer
- [ ] 实现 `src/parser/tokenizer.js`
  - 识别 `\command`（ASCII + CJK）
  - 识别 `{}`、`[]`
  - 识别 `\\` 换行
  - 跳过 `%` 注释
  - 产出 Token 流
- [ ] 编写 Tokenizer 单元测试

#### 1.3 TeX Parser（基础版）
- [ ] 实现 `src/parser/parser.js`
  - 解析 `\documentclass[...]{...}`
  - 解析 `\title{...}`、`\chapter{...}`
  - 解析 `\begin{document}...\end{document}`
  - 解析 `\begin{正文}...\end{正文}`
  - 纯文本内容收集
  - `\\` 换行处理
- [ ] 实现 `src/parser/commands.js` — 命令注册表（基础版）
- [ ] 编写 Parser 单元测试

#### 1.4 文档模型（基础版）
- [ ] 实现 `src/model/document.js` — Document 节点
- [ ] 实现 `src/model/content-block.js` — ContentBlock 节点
- [ ] 实现 `src/model/nodes.js` — TextNode、NewlineNode

#### 1.5 HTML 渲染器（基础版）
- [ ] 实现 `src/renderer/html-renderer.js`
  - 遍历 Document AST
  - 生成 `<div class="wtc-page"><div class="wtc-content">文本</div></div>`
  - 处理 `\\` → `<br>`
- [ ] 编写渲染器单元测试

#### 1.6 CSS 基础样式
- [ ] 创建 `src/templates/base.css`
  - `writing-mode: vertical-rl`
  - 基本字体和间距
  - 页面容器样式

#### 1.7 示例与集成
- [ ] 创建 `examples/minimal.tex` — 最小示例
- [ ] 创建 `examples/index.html` — 浏览器预览页面
- [ ] 实现 `src/index.js` — 主入口（加载 .tex → 解析 → 渲染）

### 验收标准
- 能解析包含 `\documentclass`, `\begin{正文}`, 纯文本和 `\\` 的 `.tex` 文件
- 在浏览器中显示竖排中文文本
- 所有单元测试通过

---

## 阶段 2：核心功能（Milestone 2）

**目标**：实现夹注、段落缩进、空格等核心排版功能

### 任务清单

#### 2.1 夹注 (Jiazhu)
- [ ] Parser 支持 `\夹注[options]{内容}` 和 `\JiaZhu`
- [ ] 实现 `src/model/jiazhu.js`
- [ ] 实现夹注分列算法（`splitJiazhu`）
- [ ] HTML 渲染：双列内联 flex 布局
- [ ] CSS 样式：字号缩小、双列对齐
- [ ] 测试长夹注自动分段

#### 2.2 段落环境
- [ ] Parser 支持 `\begin{段落}[indent=N]...\end{段落}`
- [ ] 支持 Key-Value 参数解析（`indent`, `first-indent`, `bottom-indent`）
- [ ] 实现 `src/model/paragraph.js`
- [ ] HTML 渲染：缩进通过 CSS padding 实现

#### 2.3 空格与换行
- [ ] Parser 支持 `\空格[N]`、`\Space[N]`
- [ ] Parser 支持 `\换行` 强制换列
- [ ] HTML 渲染：插入全角空格字符

#### 2.4 抬头命令
- [ ] Parser 支持 `\平抬`、`\单抬`、`\双抬`、`\三抬`
- [ ] Parser 支持 `\抬头[N]`
- [ ] Parser 支持 `\挪抬[N]`、`\空抬`
- [ ] HTML 渲染：通过 CSS margin/padding 偏移

#### 2.5 设置缩进
- [ ] Parser 支持 `\设置缩进{N}`
- [ ] 渲染：动态修改当前行缩进

#### 2.6 增强示例
- [ ] 创建 `examples/shiji.tex` — 使用史记五帝本纪的内容
- [ ] 验证夹注在长文本中的表现

### 验收标准
- 能正确渲染包含大量夹注的史记示例
- 段落缩进正确显示
- 抬头命令在视觉上正确偏移

---

## 阶段 3：批注系统（Milestone 3）

**目标**：实现侧批、眉批、批注三种批注形式

### 任务清单

#### 3.1 侧批 (SideNote)
- [ ] Parser 支持 `\侧批[options]{内容}`
- [ ] 实现 `src/model/sidenote.js`
- [ ] HTML 渲染：列间定位的小字批注
- [ ] CSS 样式：红色小字、偏移定位
- [ ] 支持 `yoffset` 参数

#### 3.2 眉批 (MeiPi)
- [ ] Parser 支持 `\眉批[options]{内容}`
- [ ] 实现 `src/model/meipi.js`
- [ ] HTML 渲染：页面顶部绝对定位
- [ ] CSS 样式：天头区域竖排
- [ ] 支持 `x`, `y`, `height` 参数
- [ ] 自动 x 定位（多个眉批不重叠）

#### 3.3 批注 (PiZhu)
- [ ] Parser 支持 `\批注[options]{内容}`
- [ ] 实现 `src/model/pizhu.js`
- [ ] HTML 渲染：绝对定位浮动框
- [ ] 支持 `x`, `y`, `height`, `color` 参数

#### 3.4 配置命令支持
- [ ] Parser 支持 `\sidenodeSetup{...}`
- [ ] Parser 支持 `\meipiSetup{...}`
- [ ] Parser 支持 `\pizhuSetup{...}`
- [ ] 收集配置参数并传递给渲染器

### 验收标准
- 侧批正确显示在列间
- 眉批显示在页面顶部天头区域
- 批注显示在指定的绝对位置
- 多个批注/眉批不重叠

---

## 阶段 4：装饰与边框（Milestone 4）

**目标**：实现边框、版心、装饰等视觉元素

### 任务清单

#### 4.1 边框系统
- [ ] Parser 支持 `\contentSetup{border=true, ...}`
- [ ] 实现内边框（界栏）— CSS column-rule 或 border
- [ ] 实现外边框 — CSS border
- [ ] 支持边框颜色、粗细参数

#### 4.2 版心 (BanXin)
- [ ] 实现 `src/renderer/banxin-renderer.js`
- [ ] HTML 结构：三段式（上段鱼尾 / 中段书名章节 / 下段页码鱼尾）
- [ ] CSS 样式：垂直分割、居中对齐
- [ ] 鱼尾符号渲染（使用 CSS/SVG）
- [ ] 动态插入书名、章节名、页码

#### 4.3 装饰命令
- [ ] 圈点/着重号 — CSS `text-emphasis`
- [ ] 专名号 — CSS `text-decoration: underline`
- [ ] 书名号 — CSS `text-decoration: underline wavy`
- [ ] 反白 — CSS `background/color`
- [ ] 八角框 — CSS `clip-path`
- [ ] 带圈 — CSS `border-radius`

#### 4.4 文本框
- [ ] Parser 支持 `\文本框[options]{内容}`
- [ ] Parser 支持 `\填充文本框[options]{内容}`
- [ ] HTML 渲染：固定高度的 inline-block
- [ ] 填充模式：CSS `justify-content: space-between`

#### 4.5 列表环境
- [ ] Parser 支持 `\begin{列表}...\item...\end{列表}`
- [ ] 支持嵌套列表
- [ ] HTML 渲染

#### 4.6 页面布局
- [ ] Parser 支持 `\pageSetup{...}`
- [ ] 实现双半页布局（版心分隔左右）
- [ ] 页面尺寸由 CSS 变量控制
- [ ] 分页逻辑（可选）

### 验收标准
- 完整的四库全书页面布局（外框 + 界栏 + 版心 + 鱼尾）
- 装饰命令正确显示
- 文本框和填充文本框正常工作

---

## 阶段 5：模板系统（Milestone 5）

**目标**：完善 CSS 模板系统，支持多种古籍风格

### 任务清单

#### 5.1 CSS 变量体系
- [ ] 创建 `src/templates/variables.css` — 完整变量定义
- [ ] 确保所有组件使用 CSS 变量而非硬编码值

#### 5.2 模板文件
- [ ] 创建 `src/templates/siku-quanshu.css` — 四库全书黑白版
- [ ] 创建 `src/templates/siku-quanshu-colored.css` — 四库全书彩色版
- [ ] 创建 `src/templates/honglou.css` — 红楼梦甲戌本
- [ ] 创建 `src/templates/minimal.css` — 极简模板

#### 5.3 模板加载机制
- [ ] 实现 `src/config.js` — 模板名称到 CSS 文件的映射
- [ ] 从 `\documentclass` 选项自动加载模板
- [ ] 支持 `\gujiSetup{template=xxx}` 切换
- [ ] 支持 `\contentSetup{...}` 覆盖模板参数

#### 5.4 运行时切换
- [ ] 实现 `WebTeX.setTemplate()` API
- [ ] 动态替换 CSS 文件

### 验收标准
- 同一 `.tex` 文件在不同模板下显示不同风格
- TeX 文件中的 `\documentclass[四库全书彩色]{ltc-guji}` 自动应用彩色模板
- `\contentSetup{font-size=24pt}` 覆盖模板默认字号

---

## 阶段 6：完善与打包（Milestone 6）

**目标**：打包发布、完善文档、优化性能

### 任务清单

#### 6.1 打包构建
- [ ] 配置 Rollup/esbuild
- [ ] 生成 `dist/webtex-cn.js` 单文件
- [ ] 生成 `dist/webtex-cn.min.js` 压缩版
- [ ] CSS 文件合并/压缩

#### 6.2 API 设计
- [ ] `WebTeX.render(texPath, container)` — 从 URL 加载并渲染
- [ ] `WebTeX.renderString(texString, container)` — 从字符串渲染
- [ ] `WebTeX.setTemplate(name)` — 切换模板
- [ ] `WebTeX.getTemplates()` — 获取可用模板列表

#### 6.3 Node.js CLI 工具
- [ ] `npx webtex-cn build input.tex -o output/` — 预编译为静态 HTML
- [ ] `npx webtex-cn serve input.tex` — 本地预览服务器

#### 6.4 示例集
- [ ] `examples/minimal.tex` — 最小示例
- [ ] `examples/shiji.tex` — 史记五帝本纪
- [ ] `examples/honglou.tex` — 红楼梦示例
- [ ] `examples/showcase.tex` — 全功能展示
- [ ] 每个示例附带 `index.html` 预览页面

#### 6.5 错误处理与调试
- [ ] TeX 解析错误友好提示
- [ ] 控制台输出解析进度
- [ ] 未知命令的警告日志

#### 6.6 性能优化
- [ ] 大文件分段解析
- [ ] 虚拟滚动（长文档只渲染可见部分）
- [ ] CSS 动画减少重排

#### 6.7 测试覆盖
- [ ] Tokenizer 完整测试
- [ ] Parser 完整测试
- [ ] 渲染器完整测试
- [ ] 端到端集成测试
- [ ] 与 luatex-cn 示例文件的回归测试

### 验收标准
- `npm run build` 产出可用的发布包
- 所有示例在主流浏览器中正确显示
- 测试覆盖率 > 80%

---

## 依赖关系图

```
阶段 1 (基础)
  │
  ├── 阶段 2 (夹注+段落)
  │     │
  │     ├── 阶段 3 (批注系统)
  │     │     │
  │     │     └── 阶段 5 (模板系统) ─── 阶段 6 (完善打包)
  │     │
  │     └── 阶段 4 (装饰+边框)
  │           │
  │           └── 阶段 5 (模板系统)
  │
  └── 阶段 6 (完善打包) ← 所有阶段完成后
```

## 技术风险与应对

| 风险 | 可能性 | 影响 | 应对方案 |
|------|--------|------|---------|
| CSS `writing-mode` 浏览器兼容性 | 低 | 高 | 主流浏览器已充分支持，测试 Safari |
| 夹注双列对齐精度 | 中 | 中 | 使用 `inline-flex` 布局，容忍小偏差 |
| 长文档性能 | 中 | 中 | 虚拟滚动 + 分页加载 |
| TeX 解析器覆盖度不足 | 中 | 低 | 遇到不认识的命令时跳过，渐进增加支持 |
| 侧批定位不精确 | 中 | 低 | 简化为内联元素或使用 JS 计算位置 |
