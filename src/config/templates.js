/**
 * Shared template configuration.
 * Used by both layout engine and renderer.
 */

// Template name (Chinese) → CSS file ID mapping
export const templateCSSMap = {
  '四库全书': 'siku-quanshu',
  '四庫全書': 'siku-quanshu',
  '四库全书彩色': 'siku-quanshu-colored',
  '四庫全書彩色': 'siku-quanshu-colored',
  '红楼梦甲戌本': 'honglou',
  '紅樓夢甲戌本': 'honglou',
  '极简': 'minimal',
  '極簡': 'minimal',
  'default': 'siku-quanshu',
};

// Template CSS ID → grid config (must match CSS --wtc-n-rows / --wtc-n-cols)
export const templateGridConfig = {
  'siku-quanshu': { nRows: 21, nCols: 8 },
  'siku-quanshu-colored': { nRows: 21, nCols: 8 },
  'honglou': { nRows: 20, nCols: 9 },
  'minimal': { nRows: 21, nCols: 8 },
};

/**
 * Resolve template ID from AST metadata.
 * Checks documentclass option first, then gujiSetup override.
 */
export function resolveTemplateId(ast) {
  let templateId = templateCSSMap[ast.template] || 'siku-quanshu';

  for (const cmd of (ast.setupCommands || [])) {
    if (cmd.setupType === 'guji' && cmd.params?.template) {
      const override = templateCSSMap[cmd.params.template];
      if (override) templateId = override;
    }
  }

  return templateId;
}

/**
 * Get grid config for a template ID.
 */
export function getGridConfig(templateId) {
  return templateGridConfig[templateId] || { nRows: 21, nCols: 8 };
}
