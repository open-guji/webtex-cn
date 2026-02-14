/**
 * WebTeX-CN: Convert luatex-cn TeX files to HTML+CSS
 * Main entry point.
 *
 * Pipeline: parse → layout → render
 */

import { parse } from './parser/index.js';
import { layout } from './layout/grid-layout.js';
import { HTMLRenderer } from './renderer/html-renderer.js';

/**
 * Parse TeX source, run layout, and render to HTML string.
 * Returns multi-page HTML with each page wrapped in a wtc-page div.
 * @param {string} texSource - TeX source code
 * @returns {string} HTML content (multiple wtc-page divs)
 */
export function renderToHTML(texSource) {
  const { ast, warnings } = parse(texSource);
  if (warnings.length > 0) {
    console.warn('[WebTeX-CN] Parse warnings:', warnings);
  }
  const layoutResult = layout(ast);
  const renderer = new HTMLRenderer(ast);
  const pageHTMLs = renderer.renderFromLayout(layoutResult);
  return pageHTMLs.map(html =>
    `<div class="wtc-page" data-template="${layoutResult.templateId}">${html}</div>`
  ).join('\n');
}

/**
 * Parse TeX source and render to a full standalone HTML page.
 * @param {string} texSource - TeX source code
 * @returns {string} Full HTML page
 */
export function renderToPage(texSource) {
  const { ast, warnings } = parse(texSource);
  if (warnings.length > 0) {
    console.warn('[WebTeX-CN] Parse warnings:', warnings);
  }
  const renderer = new HTMLRenderer(ast);
  return renderer.renderPage();
}

/**
 * Render TeX source into a DOM container.
 * Generates multiple wtc-page divs (one per spread).
 * @param {string} texSource - TeX source code
 * @param {HTMLElement|string} container - DOM element or CSS selector
 * @param {object} [options] - Render options
 * @param {string} [options.cssBasePath=''] - Base path to CSS files for auto template loading
 */
export function renderToDOM(texSource, container, options = {}) {
  const { cssBasePath } = options;
  const { ast, warnings } = parse(texSource);
  if (warnings.length > 0) {
    console.warn('[WebTeX-CN] Parse warnings:', warnings);
  }
  const layoutResult = layout(ast);
  const renderer = new HTMLRenderer(ast);
  const pageHTMLs = renderer.renderFromLayout(layoutResult);

  const el = typeof container === 'string'
    ? document.querySelector(container)
    : container;
  if (!el) {
    throw new Error(`[WebTeX-CN] Container not found: ${container}`);
  }
  // Auto-inject template CSS if cssBasePath is provided
  if (cssBasePath && typeof document !== 'undefined') {
    setTemplate(layoutResult.templateId, cssBasePath);
  }
  el.innerHTML = pageHTMLs.map(html =>
    `<div class="wtc-page" data-template="${layoutResult.templateId}">${html}</div>`
  ).join('\n');
}

/**
 * Fetch a .tex file and render into a DOM container.
 * @param {string} url - URL to .tex file
 * @param {HTMLElement|string} container - DOM element or CSS selector
 * @param {object} [options] - Render options (passed to renderToDOM)
 */
export async function render(url, container, options = {}) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[WebTeX-CN] Failed to fetch ${url}: ${response.status}`);
  }
  const texSource = await response.text();
  renderToDOM(texSource, container, options);
}

/**
 * Get the list of available CSS templates.
 * @returns {Array<{id: string, name: string}>}
 */
export function getTemplates() {
  return [
    { id: 'siku-quanshu', name: '四库全书 (黑白)' },
    { id: 'siku-quanshu-colored', name: '四库全书 (彩色)' },
    { id: 'honglou', name: '红楼梦甲戌本' },
    { id: 'minimal', name: '极简' },
  ];
}

/**
 * Switch the active CSS template (browser only).
 * @param {string} templateId - Template ID (e.g. 'siku-quanshu')
 * @param {string} [basePath=''] - Base path to CSS files
 */
export function setTemplate(templateId, basePath = '') {
  if (typeof document === 'undefined') return;
  const old = document.querySelector('link[data-wtc-template]');
  if (old) old.remove();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `${basePath}${templateId}.css`;
  link.dataset.wtcTemplate = templateId;
  document.head.appendChild(link);
}

// Export for browser global
if (typeof window !== 'undefined') {
  window.WebTeX = { render, renderToDOM, renderToHTML, renderToPage, parse, getTemplates, setTemplate };
}

export { parse } from './parser/index.js';
export { layout } from './layout/grid-layout.js';
export { HTMLRenderer } from './renderer/html-renderer.js';
