/**
 * Command and environment registries for TeX parsing.
 *
 * Each canonical command has a rich definition:
 *   args:        Argument types for parsing: 'optional' = [...], 'required' = {...}
 *   node:        NodeType key for AST node creation
 *   category:    Semantic category (annotation, decoration, layout, setup, structure, ignored)
 *   description: Brief description for documentation
 *   status:      Implementation status (full, partial, none, n/a)
 *
 * Aliases point to the canonical name via { alias: 'canonicalName' }.
 */

// =========================================================================
// Command Registry
// =========================================================================

export const commandRegistry = {
  // ---- Document Structure ----
  'documentclass': {
    args: ['optional', 'required'],
    category: 'structure',
    description: 'Document class and template selection',
    status: 'full',
  },
  'title': {
    args: ['required'],
    category: 'structure',
    description: 'Book title (displayed in banxin)',
    status: 'full',
  },
  'chapter': {
    args: ['required'],
    category: 'structure',
    description: 'Chapter title (displayed in banxin)',
    status: 'full',
  },
  'item': {
    args: [],
    category: 'structure',
    description: 'List item separator',
    status: 'full',
  },

  // ---- Annotations: Jiazhu (夹注) ----
  '按': {
    args: ['optional', 'required'], node: 'jiazhu',
    category: 'annotation',
    description: 'Interlinear dual-column annotation (按 variant)',
    status: 'full',
  },
  '謹按': { alias: '按' },
  '谨按': { alias: '按' },
  '案': { alias: '按' },
  '謹案': { alias: '按' },
  '谨案': { alias: '按' },
  '注': {
    args: ['optional', 'required'], node: 'jiazhu',
    category: 'annotation',
    description: 'Interlinear dual-column annotation (注 variant)',
    status: 'full',
  },
  '註': { alias: '注' },
  '標': {
    args: ['optional', 'required'], node: 'jiazhu',
    category: 'annotation',
    description: 'Interlinear dual-column annotation (標 variant)',
    status: 'full',
  },
  '提': { alias: '標' },
  '夹注': {
    args: ['optional', 'required'], node: 'jiazhu',
    category: 'annotation',
    description: 'Interlinear dual-column annotation',
    status: 'full',
  },
  'JiaZhu': { alias: '夹注' },
  '夾注': { alias: '夹注' },
  '单行夹注': {
    args: ['optional', 'required'], node: 'jiazhu', single: true,
    category: 'annotation',
    description: 'Single-column annotation',
    status: 'partial',
  },
  'DanHangJiaZhu': { alias: '单行夹注' },
  '單行夾注': { alias: '单行夹注' },

  // ---- Annotations: SideNote (侧批) ----
  '侧批': {
    args: ['optional', 'required'], node: 'sidenote',
    category: 'annotation',
    description: 'Margin annotation in page edge',
    status: 'full',
  },
  'SideNode': { alias: '侧批' },
  'CePi': { alias: '侧批' },
  '側批': { alias: '侧批' },

  // ---- Annotations: MeiPi (眉批) ----
  '眉批': {
    args: ['optional', 'required'], node: 'meipi',
    category: 'annotation',
    description: 'Auto-positioned page-header annotation',
    status: 'partial',
  },
  'MeiPi': { alias: '眉批' },

  // ---- Annotations: PiZhu (批注) ----
  '批注': {
    args: ['optional', 'required'], node: 'pizhu',
    category: 'annotation',
    description: 'Floating annotation box at absolute position',
    status: 'partial',
  },
  'PiZhu': { alias: '批注' },

  // ---- Text Boxes ----
  '文本框': {
    args: ['optional', 'required'], node: 'textbox',
    category: 'layout',
    description: 'Multi-column grid text box with borders',
    status: 'partial',
  },
  'TextBox': { alias: '文本框' },
  '填充文本框': {
    args: ['optional', 'required'], node: 'fillTextbox',
    category: 'layout',
    description: 'Fill text box (legacy compatibility)',
    status: 'partial',
  },
  'FillTextBox': { alias: '填充文本框' },

  // ---- Decoration ----
  '圈点': {
    args: ['optional', 'required'], node: 'emphasis',
    category: 'decoration',
    description: 'Emphasis dot (着重号)',
    status: 'full',
  },
  'EmphasisMark': { alias: '圈点' },
  '着重号': { alias: '圈点' },
  '著重號': { alias: '圈点' },
  '装饰': {
    args: ['optional', 'required'], node: 'decorate',
    category: 'decoration',
    description: 'Generic character decoration',
    status: 'partial',
  },
  'decorate': { alias: '装饰' },
  '裝飾': { alias: '装饰' },
  '专名号': {
    args: ['optional', 'required'], node: 'properName',
    category: 'decoration',
    description: 'Proper name underline (straight)',
    status: 'full',
  },
  'ProperNameMark': { alias: '专名号' },
  '專名號': { alias: '专名号' },
  '下划线': { alias: '专名号' },
  '下劃線': { alias: '专名号' },
  'Underline': { alias: '专名号' },
  '书名号': {
    args: ['optional', 'required'], node: 'bookTitle',
    category: 'decoration',
    description: 'Book title wavy underline',
    status: 'full',
  },
  'BookTitleMark': { alias: '书名号' },
  '書名號': { alias: '书名号' },
  '波浪线': { alias: '书名号' },
  '波浪線': { alias: '书名号' },
  'WavyUnderline': { alias: '书名号' },
  '反白': {
    args: ['required'], node: 'inverted',
    category: 'decoration',
    description: 'White-on-black text',
    status: 'full',
  },
  'inverted': { alias: '反白' },
  '八角框': {
    args: ['required'], node: 'octagon',
    category: 'decoration',
    description: 'Octagonal border',
    status: 'full',
  },
  'octagon': { alias: '八角框' },
  '带圈': {
    args: ['required'], node: 'circled',
    category: 'decoration',
    description: 'Circular border',
    status: 'full',
  },
  'circled': { alias: '带圈' },
  '帶圈': { alias: '带圈' },
  '反白八角框': {
    args: ['required'], node: 'invertedOctagon',
    category: 'decoration',
    description: 'Inverted + octagonal styling',
    status: 'full',
  },
  'invertedOctagon': { alias: '反白八角框' },
  '改': {
    args: ['required'], node: 'fix',
    category: 'decoration',
    description: 'Correction mark (strikethrough with replacement)',
    status: 'full',
  },
  'fix': { alias: '改' },

  // ---- Layout Control ----
  '空格': {
    args: ['optional'], node: 'space',
    category: 'layout',
    description: 'Insert N full-width spaces',
    status: 'full',
  },
  'Space': { alias: '空格' },
  '设置缩进': {
    args: ['required'], node: 'setIndent',
    category: 'layout',
    description: 'Force current-line indent value',
    status: 'full',
  },
  'SetIndent': { alias: '设置缩进' },
  '設置縮進': { alias: '设置缩进' },
  '换行': {
    args: [], node: 'columnBreak',
    category: 'layout',
    description: 'Force column break',
    status: 'full',
  },
  'HuanHang': { alias: '换行' },
  '換行': { alias: '换行' },

  // ---- Taitou (抬头) ----
  '抬头': {
    args: ['optional'], node: 'taitou',
    category: 'layout',
    description: 'New column with N-grid elevation',
    status: 'full',
  },
  'TaiTou': { alias: '抬头' },
  '抬頭': { alias: '抬头' },
  '平抬': {
    args: [], node: 'taitou', defaultOpt: '0',
    category: 'layout',
    description: 'Taitou level 0 (new column, no elevation)',
    status: 'full',
  },
  '单抬': {
    args: [], node: 'taitou', defaultOpt: '1',
    category: 'layout',
    description: 'Taitou level 1',
    status: 'full',
  },
  '單抬': { alias: '单抬' },
  '双抬': {
    args: [], node: 'taitou', defaultOpt: '2',
    category: 'layout',
    description: 'Taitou level 2',
    status: 'full',
  },
  '雙抬': { alias: '双抬' },
  '三抬': {
    args: [], node: 'taitou', defaultOpt: '3',
    category: 'layout',
    description: 'Taitou level 3',
    status: 'full',
  },
  '挪抬': {
    args: ['optional'], node: 'nuotai',
    category: 'layout',
    description: 'Insert N full-width spaces inline without line break',
    status: 'full',
  },
  'NuoTai': { alias: '挪抬' },
  '空抬': {
    args: [], node: 'nuotai', defaultOpt: '1',
    category: 'layout',
    description: 'Insert 1 full-width space inline (shortcut for \\挪抬[1])',
    status: 'full',
  },
  'KongTai': { alias: '空抬' },
  '相对抬头': {
    args: ['optional'], node: 'relativeTaitou',
    category: 'layout',
    description: 'Relative elevation by N grids from current indent',
    status: 'full',
  },
  'XiangDuiTaiTou': { alias: '相对抬头' },
  '相對抬頭': { alias: '相对抬头' },

  // ---- Setup Commands ----
  'contentSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'content',
    category: 'setup',
    description: 'Content area typography and grid config',
    status: 'partial',
  },
  '内容设置': { alias: 'contentSetup' },
  '內容設置': { alias: 'contentSetup' },
  'pageSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'page',
    category: 'setup',
    description: 'Page geometry and margins',
    status: 'partial',
  },
  '页面设置': { alias: 'pageSetup' },
  '頁面設置': { alias: 'pageSetup' },
  'banxinSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'banxin',
    category: 'setup',
    description: 'Running header (banxin) config',
    status: 'partial',
  },
  '版心设置': { alias: 'banxinSetup' },
  '版心設置': { alias: 'banxinSetup' },
  'sidenodeSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'sidenode',
    category: 'setup',
    description: 'Sidenote default config',
    status: 'partial',
  },
  '侧批设置': { alias: 'sidenodeSetup' },
  '側批設置': { alias: 'sidenodeSetup' },
  'jiazhuSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'jiazhu',
    category: 'setup',
    description: 'Jiazhu default config',
    status: 'partial',
  },
  '夹注设置': { alias: 'jiazhuSetup' },
  '夾注設置': { alias: 'jiazhuSetup' },
  'pizhuSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'pizhu',
    category: 'setup',
    description: 'Pizhu default config',
    status: 'partial',
  },
  '批注设置': { alias: 'pizhuSetup' },
  '批注設置': { alias: 'pizhuSetup' },
  'meipiSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'meipi',
    category: 'setup',
    description: 'Meipi default config',
    status: 'partial',
  },
  '眉批设置': { alias: 'meipiSetup' },
  '眉批設置': { alias: 'meipiSetup' },
  'gujiSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'guji',
    category: 'setup',
    description: 'Load preset classical text template',
    status: 'full',
  },
  '古籍设置': { alias: 'gujiSetup' },
  '古籍設置': { alias: 'gujiSetup' },
  'judouSetup': {
    args: ['required'], node: 'setupCmd', setupType: 'judou',
    category: 'setup',
    description: 'Judou punctuation config',
    status: 'none',
  },
  '句读设置': { alias: 'judouSetup' },
  '句讀設置': { alias: 'judouSetup' },

  // ---- Judou Mode Switching ----
  '句读模式': {
    args: ['optional'], node: 'setupCmd', setupType: 'judou-on',
    category: 'setup',
    description: 'Enable judou punctuation mode',
    status: 'full',
  },
  'JudouOn': { alias: '句读模式' },
  '开启句读': { alias: '句读模式' },
  '開啟句讀': { alias: '句读模式' },
  'JudouPunctuationMode': { alias: '句读模式' },
  '正常标点模式': {
    args: ['optional'], node: 'setupCmd', setupType: 'judou-off',
    category: 'setup',
    description: 'Disable judou, use normal punctuation',
    status: 'full',
  },
  'JudouOff': { alias: '正常标点模式' },
  '关闭句读': { alias: '正常标点模式' },
  '關閉句讀': { alias: '正常标点模式' },
  'NormalPunctuationMode': { alias: '正常标点模式' },
  '无标点模式': {
    args: ['optional'], node: 'setupCmd', setupType: 'judou-none',
    category: 'setup',
    description: 'Remove all punctuation marks',
    status: 'full',
  },
  'NonePunctuationMode': { alias: '无标点模式' },
  '無標點模式': { alias: '无标点模式' },

  // ---- Ignored Commands (no web equivalent) ----
  'usepackage': {
    args: ['optional', 'required'], ignore: true,
    category: 'ignored',
    description: 'Package loading (implicit in web)',
    status: 'n/a',
  },
  'RequirePackage': { alias: 'usepackage' },
  'setmainfont': {
    args: ['optional', 'required'], ignore: true,
    category: 'ignored',
    description: 'Font setting (use CSS font-family)',
    status: 'n/a',
  },
  '设置字体': { alias: 'setmainfont' },
  '設置字體': { alias: 'setmainfont' },
  'pagestyle': {
    args: ['required'], ignore: true,
    category: 'ignored',
    description: 'PDF page style',
    status: 'n/a',
  },
  'noindent': { args: [], ignore: true, category: 'ignored', status: 'n/a' },
  'par': { args: [], ignore: true, category: 'ignored', status: 'n/a' },
  'relax': { args: [], ignore: true, category: 'ignored', status: 'n/a' },
  'ignorespaces': { args: [], ignore: true, category: 'ignored', status: 'n/a' },
  'definecolor': {
    args: ['required', 'required', 'required'], ignore: true,
    category: 'ignored',
    description: 'Color definition (use CSS colors)',
    status: 'n/a',
  },
  'AddToHook': {
    args: ['required', 'required'], ignore: true,
    category: 'ignored',
    description: 'TeX hook system',
    status: 'n/a',
  },
  '禁用分页裁剪': { args: [], ignore: true, category: 'ignored', status: 'n/a' },
  'disableSplitPage': { alias: '禁用分页裁剪' },
  '显示坐标': { args: [], ignore: true, category: 'ignored', status: 'n/a' },
  'LtcDebugOn': { args: [], ignore: true, category: 'ignored', status: 'n/a' },
  '开启调试': { alias: 'LtcDebugOn' },
  '開啟調試': { alias: 'LtcDebugOn' },
  'LtcDebugOff': { args: [], ignore: true, category: 'ignored', status: 'n/a' },
  '关闭调试': { alias: 'LtcDebugOff' },
  '關閉調試': { alias: 'LtcDebugOff' },

  // ---- Seal Stamp ----
  '印章': {
    args: ['optional', 'required'], node: 'stamp',
    category: 'layout',
    description: 'Overlay seal image on page',
    status: 'partial',
  },
  'YinZhang': { alias: '印章' },

  // ---- Catalog/Index ----
  '条目': {
    args: ['optional', 'required'], node: 'muluItem',
    category: 'structure',
    description: 'Table-of-contents entry with indent level',
    status: 'full',
  },
  '條目': { alias: '条目' },
  'TiaoMu': { alias: '条目' },
};

// =========================================================================
// Environment Registry
// =========================================================================

export const environmentRegistry = {
  'document': {
    node: 'body',
    category: 'structure',
    description: 'Document body',
    status: 'full',
  },
  '正文': {
    node: 'contentBlock',
    category: 'structure',
    description: 'Content block environment',
    status: 'full',
  },
  'BodyText': { alias: '正文' },
  '段落': {
    node: 'paragraph', hasOptions: true,
    category: 'structure',
    description: 'Paragraph with indent options',
    status: 'full',
  },
  'Paragraph': { alias: '段落' },
  '列表': {
    node: 'list',
    category: 'structure',
    description: 'List environment with \\item grouping',
    status: 'full',
  },
  '夹注环境': {
    node: 'jiazhu',
    hasOptions: true,
    category: 'annotation',
    description: 'Jiazhu environment form',
    status: 'full',
  },
  'JiaZhuEnv': { alias: '夹注环境' },
  '夾注環境': { alias: '夹注环境' },
};

// =========================================================================
// Alias Resolution
// =========================================================================

/**
 * Resolve command alias chain to the canonical definition.
 */
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

/**
 * Resolve environment alias chain to the canonical definition.
 */
export function resolveEnvironment(name) {
  let def = environmentRegistry[name];
  const visited = new Set();
  while (def && def.alias && !visited.has(def.alias)) {
    visited.add(name);
    name = def.alias;
    def = environmentRegistry[name];
  }
  return def || null;
}
