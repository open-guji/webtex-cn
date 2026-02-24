/**
 * Shared template configuration.
 * Used by both layout engine and renderer.
 */

import { getSystemTemplate } from './template-configs.js';

// Template name (Chinese/aliases) → Internal template ID mapping
export const templateCSSMap = {
  // === Guji series ===
  '四库全书': 'guji-default',
  '四庫全書': 'guji-default',
  'SiKuQuanShu': 'guji-default',
  'default': 'guji-default',
  // CSS file name compatibility (old)
  'siku-quanshu': 'guji-default',

  '四库全书彩色': 'guji-colored',
  '四庫全書彩色': 'guji-colored',
  'SiKuQuanShu-colored': 'guji-colored',
  // CSS file name compatibility (old)
  'siku-quanshu-colored': 'guji-colored',

  '红楼梦甲戌本': 'guji-honglou',
  '紅樓夢甲戌本': 'guji-honglou',
  'HongLouMengJiaXuBen': 'guji-honglou',
  'HongLou': 'guji-honglou',
  // CSS file name compatibility (old)
  'honglou': 'guji-honglou',

  // === Minimal (fallback to guji-default) ===
  '极简': 'guji-default',
  '極簡': 'guji-default',
  'Minimal': 'guji-default',
  'minimal': 'guji-default',
};

/**
 * Resolve template ID from AST metadata.
 * Checks documentclass option first, then gujiSetup override.
 */
export function resolveTemplateId(ast) {
  let templateId = templateCSSMap[ast.template] || 'guji-default';

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
 * Dynamically derived from system template configuration.
 */
export function getGridConfig(templateId) {
  const template = getSystemTemplate(templateId);
  return {
    nRows: template.content?.nCharPerCol || 21,
    nCols: template.content?.nColumn || 8,
  };
}
