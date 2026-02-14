/**
 * Command and environment registries for TeX parsing.
 * Defines how each command/environment should be parsed.
 *
 * args types: 'optional' = [...], 'required' = {...}
 */

export const commandRegistry = {
  // Document structure
  'documentclass': { args: ['optional', 'required'] },
  'title': { args: ['required'] },
  'chapter': { args: ['required'] },

  // Jiazhu (夹注)
  '夹注': { args: ['optional', 'required'], node: 'jiazhu' },
  'JiaZhu': { alias: '夹注' },
  '单行夹注': { args: ['optional', 'required'], node: 'jiazhu', single: true },
  'DanHangJiaZhu': { alias: '单行夹注' },

  // SideNote (侧批)
  '侧批': { args: ['optional', 'required'], node: 'sidenote' },
  'SideNode': { alias: '侧批' },
  'CePi': { alias: '侧批' },

  // MeiPi (眉批)
  '眉批': { args: ['optional', 'required'], node: 'meipi' },
  'MeiPi': { alias: '眉批' },

  // PiZhu (批注)
  '批注': { args: ['optional', 'required'], node: 'pizhu' },
  'PiZhu': { alias: '批注' },

  // TextBox
  '文本框': { args: ['optional', 'required'], node: 'textbox' },
  'TextBox': { alias: '文本框' },
  '填充文本框': { args: ['optional', 'required'], node: 'fillTextbox' },
  'FillTextBox': { alias: '填充文本框' },

  // Decoration
  '圈点': { args: ['optional', 'required'], node: 'emphasis' },
  'EmphasisMark': { alias: '圈点' },
  '装饰': { args: ['optional', 'required'], node: 'decorate' },
  'decorate': { alias: '装饰' },
  '专名号': { args: ['optional', 'required'], node: 'properName' },
  'ProperNameMark': { alias: '专名号' },
  '书名号': { args: ['optional', 'required'], node: 'bookTitle' },
  'BookTitleMark': { alias: '书名号' },
  '下划线': { alias: '专名号' },
  'Underline': { alias: '专名号' },
  '波浪线': { alias: '书名号' },
  'WavyUnderline': { alias: '书名号' },
  '反白': { args: ['required'], node: 'inverted' },
  'inverted': { alias: '反白' },
  '八角框': { args: ['required'], node: 'octagon' },
  'octagon': { alias: '八角框' },
  '带圈': { args: ['required'], node: 'circled' },
  'circled': { alias: '带圈' },
  '反白八角框': { args: ['required'], node: 'invertedOctagon' },
  'invertedOctagon': { alias: '反白八角框' },
  '改': { args: ['required'], node: 'fix' },
  'fix': { alias: '改' },

  // Layout control
  '空格': { args: ['optional'], node: 'space' },
  'Space': { alias: '空格' },
  '设置缩进': { args: ['required'], node: 'setIndent' },
  'SetIndent': { alias: '设置缩进' },
  '换行': { args: [], node: 'columnBreak' },

  // Taitou (抬头)
  '抬头': { args: ['optional'], node: 'taitou' },
  '平抬': { args: [], node: 'taitou', defaultOpt: '0' },
  '单抬': { args: [], node: 'taitou', defaultOpt: '1' },
  '双抬': { args: [], node: 'taitou', defaultOpt: '2' },
  '三抬': { args: [], node: 'taitou', defaultOpt: '3' },
  '挪抬': { args: ['optional'], node: 'nuotai' },
  '空抬': { args: [], node: 'nuotai', defaultOpt: '1' },
  '相对抬头': { args: ['optional'], node: 'relativeTaitou' },

  // Setup commands
  'contentSetup': { args: ['required'], node: 'setupCmd', setupType: 'content' },
  'pageSetup': { args: ['required'], node: 'setupCmd', setupType: 'page' },
  'banxinSetup': { args: ['required'], node: 'setupCmd', setupType: 'banxin' },
  'sidenodeSetup': { args: ['required'], node: 'setupCmd', setupType: 'sidenode' },
  'jiazhuSetup': { args: ['required'], node: 'setupCmd', setupType: 'jiazhu' },
  'pizhuSetup': { args: ['required'], node: 'setupCmd', setupType: 'pizhu' },
  'meipiSetup': { args: ['required'], node: 'setupCmd', setupType: 'meipi' },
  'gujiSetup': { args: ['required'], node: 'setupCmd', setupType: 'guji' },
  'judouSetup': { args: ['required'], node: 'setupCmd', setupType: 'judou' },

  // Judou
  '句读模式': { args: ['optional'], node: 'setupCmd', setupType: 'judou-on' },
  'JudouOn': { alias: '句读模式' },
  '正常标点模式': { args: ['optional'], node: 'setupCmd', setupType: 'judou-off' },
  'JudouOff': { alias: '正常标点模式' },
  '无标点模式': { args: ['optional'], node: 'setupCmd', setupType: 'judou-none' },
  'NonePunctuationMode': { alias: '无标点模式' },

  // Ignored commands
  'usepackage': { args: ['optional', 'required'], ignore: true },
  'RequirePackage': { alias: 'usepackage' },
  'setmainfont': { args: ['optional', 'required'], ignore: true },
  'pagestyle': { args: ['required'], ignore: true },
  'noindent': { args: [], ignore: true },
  'par': { args: [], ignore: true },
  'relax': { args: [], ignore: true },
  'ignorespaces': { args: [], ignore: true },
  'definecolor': { args: ['required', 'required', 'required'], ignore: true },
  'AddToHook': { args: ['required', 'required'], ignore: true },
  '禁用分页裁剪': { args: [], ignore: true },
  '显示坐标': { args: [], ignore: true },
  'LtcDebugOn': { args: [], ignore: true },
  'LtcDebugOff': { args: [], ignore: true },

  // Seal stamp (simplified)
  '印章': { args: ['optional', 'required'], node: 'stamp' },

  // Catalog/Index entries
  '条目': { args: ['optional', 'required'], node: 'muluItem' },
  '條目': { alias: '条目' },
};

export const environmentRegistry = {
  'document': { node: 'body' },
  '正文': { node: 'contentBlock' },
  'BodyText': { alias: '正文' },
  '段落': { node: 'paragraph', hasOptions: true },
  'Paragraph': { alias: '段落' },
  '列表': { node: 'list' },
  '夹注环境': { node: 'jiazhu' },
  'JiaZhuEnv': { alias: '夹注环境' },
};

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
