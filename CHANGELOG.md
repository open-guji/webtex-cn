# Changelog

## [0.1.4] - 2026-03-19

### Added
- 封面、书名页环境（\封面、\书名页）和 \行 命令
- 空白页环境、浮动文本框、\样式 命令、\臣 别名
- 数字化模式（ltc-guji-digital）检测与负缩进支持
- 版心（Banxin）、DigitalContent 及数字化布局命令
- 夹注 font-size、color 参数和 align=center 支持
- 右小列/左小列 显式列布局命令
- HTML 渲染与 PDF 尺寸/布局对齐
- serve 命令三栏对比视图
- 四库目录对比工作区示例

### Fixed
- 封面页布局、浮动文本框缩放与位置钳制
- 数字化模式列溢出与布局控制
- 列网格线在特定缩放级别下消失的问题
- vertical-rl 模式下 line-height 与 grid-width 自动同步
- 列网格线按从右到左顺序正确渲染
- tokenizer 换行折叠和 CSS 布局修复
- \臣 解析为「臣」文本及 readBraceGroup 命令重建
- 数字化模式 NEWLINE 处理中 currentRow 重置问题


## [0.1.1] - 2026-02-13

### Added
- 三阶段管线：`Parser → AST → Layout Engine → LayoutResult → HTML Renderer`
- 自动分页：内容超出一个 spread 时自动创建新页，每页有完整边框和版心
- 版心（版心）重新设计：书名在上方带鱼尾，章节信息在中间区域
- 列表项正确分列：每个 `\item` 占据独立列
- 跨页标签平衡：HTML 标签在半页和页面边界自动闭合和重开
- 夹注多段拆分：长夹注跨页时拆分为独立段，确保正确分页
- npm 发布配置：`exports`、`repository`、`prepublishOnly`

### Fixed
- 列表第一项不再浪费空列
- 序言空行不再产生空列（布局引擎仅处理 body 节点）
- 夹注字号调整为 0.7em，letter-spacing 相应适配
- 列表元素从 `display: block` 改为 `display: inline`，避免 vertical-rl 模式下的多余列

## [0.1.0] - 2026-02-12

### Added
- TeX 解析器：递归下降解析，支持 60+ luatex-cn 命令
- HTML 渲染器：AST → HTML+CSS 竖排输出
- 4 个 CSS 模板：四库全书（黑白/彩色）、红楼梦甲戌本、极简
- 夹注：双行小字注释，自动分列平衡
- 段落缩进、列表、眉批、侧批、批注
- 圈点、专名号、书名号等装饰标记
- 文本框、填充文本框
- CLI 工具：`webtex-cn build` / `webtex-cn serve`
- 浏览器 API：`renderToDOM`、`renderToHTML`、`render`
- esbuild 打包：ESM、IIFE 两种格式
- 132 个测试用例
