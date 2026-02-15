# 架构清理执行计划

> 将代码从三阶段旧管线迁移到四阶段新管线，清除遗留路径

## 1. 背景

在引入 ConfigResolver 和 GridLayoutEngine 后，代码库中存在两条并行的渲染路径：

- **新管线**（正确）：`parse → resolveConfig → layout → renderFromLayout`
- **旧管线**（遗留）：`parse → render()`（直接遍历 AST，无布局、无分页）

以下位置仍在使用旧管线：
- `HTMLRenderer.render()` — 直接遍历 AST
- `HTMLRenderer.renderPage()` — 调用 `render()` 生成独立 HTML 页面
- `index.js renderToPage()` — 调用 `renderPage()`
- `bin/webtex-cn.js` build/serve — 调用 `renderer.render()`
- `test/renderer.test.js` — 多个测试使用 `renderer.render()`
- `test/integration.test.js` — `renderPage()` 测试

## 2. 执行步骤

### 步骤 1：迁移 CLI 到布局管线

**文件**：`bin/webtex-cn.js`

将 `renderer.render()` 替换为 `layout(ast)` → `renderer.renderFromLayout(layoutResult)`。
CLI 的 `build` 和 `serve` 命令都需要使用布局管线生成多页输出。

### 步骤 2：迁移 renderToPage / renderPage 到布局管线

**文件**：`src/index.js`, `src/renderer/html-renderer.js`

- `renderToPage()` 应调用 `layout(ast)` + `renderFromLayout()` 生成完整 HTML 页面
- `renderPage()` 要么一并迁移，要么直接删除（由 `renderToPage()` 替代）

### 步骤 3：迁移渲染器测试

**文件**：`test/renderer.test.js`, `test/integration.test.js`

- 将 `renderer.render()` 的调用改为通过 layout 管线
- 保留测试的语义（验证 HTML 输出内容），只改变调用路径

### 步骤 4：清理 HTMLRenderer

**文件**：`src/renderer/html-renderer.js`

移除以下遗留代码：
- `render()` 方法
- `renderPage()` 方法
- `getSetupStyles()` / `getSetupStylesFromCommands()` 方法
- 构造函数中的冗余模板解析（templateId、nRows、nCols 应从 LayoutResult.config 获取）

### 步骤 5：清理 grid-layout.js 的兼容性 re-export

**文件**：`src/layout/grid-layout.js`

移除第 16-19 行的 backward compatibility re-exports：
```js
export { getPlainText } from '../utils/text.js';
export { splitJiazhu, splitJiazhuMulti } from '../utils/jiazhu.js';
export { getJudouRichText } from '../utils/judou.js';
```

确认没有外部代码依赖这些 re-exports 后删除。

### 步骤 6：更新 index.js 管线注释和公开 API

**文件**：`src/index.js`

- 管线注释从 `parse → layout → render` 改为 `parse → resolve → layout → render`
- 导出 `resolveConfig` 供高级用户使用
- 确保 `window.WebTeX` 包含所有公开 API

### 步骤 7：运行测试并确保无回归

```bash
npm test
npm run build
```

所有 132 个测试必须通过，构建成功。

### 步骤 8：删除过时文档

- 删除 `doc/07-next-steps.md`（所有 P0-P3 项目已完成）
- 将本文件 (`doc/06`) 替换旧的 `doc/06-implementation-roadmap.md`

### 步骤 9：更新 Wiki

同步 `../webtex-cn.wiki/` 中的 Architecture.md 和 Home.md。

## 3. 风险与注意事项

- 渲染器测试（33 个）高度依赖 `render()` 的 HTML 输出格式。迁移到布局管线后，输出可能包含分页标记等差异，需要逐个验证。
- CLI 工具生成完整 HTML 页面时需要正确拼接多页的 `<div class="wtc-page">`。
- `HTMLRenderer` 构造函数仍然需要 AST 以提供 `renderNode()` 方法（用于浮动元素等）。但模板信息应从 `LayoutResult.config` 获取而非重新解析。
