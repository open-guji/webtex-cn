#!/usr/bin/env node
/**
 * WebTeX-CN CLI
 * Usage:
 *   webtex-cn build input.tex [-o output/]
 *   webtex-cn serve input.tex [-p port] [--pdf reference.pdf]
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { fileURLToPath } from 'url';
import { createServer } from 'http';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, '..', 'src');

// Dynamic import of the library
async function loadLib() {
  const { parse } = await import(join(srcDir, 'parser', 'index.js'));
  const { layout } = await import(join(srcDir, 'layout', 'grid-layout.js'));
  const { HTMLRenderer } = await import(join(srcDir, 'renderer', 'html-renderer.js'));
  const { extractTemplateName } = await import(join(srcDir, 'parser', 'macros.js'));
  return { parse, layout, HTMLRenderer, extractTemplateName };
}

/**
 * Try to load a .cfg file for the given .tex source.
 * Looks for <templateName>.cfg in the same directory as the .tex file.
 */
function loadCfgSource(texSource, inputPath, extractTemplateName) {
  const templateName = extractTemplateName(texSource);
  if (!templateName) return null;
  const texDir = dirname(resolve(inputPath));
  const cfgPath = join(texDir, `${templateName}.cfg`);
  if (existsSync(cfgPath)) {
    console.log(`Loading template config: ${cfgPath}`);
    return readFileSync(cfgPath, 'utf8');
  }
  return null;
}

function usage() {
  console.log(`WebTeX-CN CLI

Usage:
  webtex-cn build <input.tex> [-o <output-dir>]        Build static HTML
  webtex-cn serve <input.tex> [-p <port>] [--pdf ref]  Preview server

Options:
  -o, --output <dir>    Output directory (default: ./output)
  -p, --port <port>     Server port (default: 8080)
  --pdf <file>          PDF reference for side-by-side comparison
  -h, --help            Show this help`);
}

function parseArgs(args) {
  const result = { command: null, input: null, output: './output', port: 8080, pdfRef: null };
  let i = 0;
  if (args.length === 0) return result;

  result.command = args[i++];
  if (result.command === '-h' || result.command === '--help') {
    result.command = 'help';
    return result;
  }

  while (i < args.length) {
    const arg = args[i];
    if (arg === '-o' || arg === '--output') {
      result.output = args[++i];
    } else if (arg === '-p' || arg === '--port') {
      result.port = parseInt(args[++i], 10);
    } else if (arg === '--pdf') {
      result.pdfRef = args[++i];
    } else if (arg === '-h' || arg === '--help') {
      result.command = 'help';
    } else if (!result.input) {
      result.input = arg;
    }
    i++;
  }
  return result;
}

async function buildCommand(inputPath, outputDir) {
  if (!inputPath || !existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const { parse, layout, HTMLRenderer, extractTemplateName } = await loadLib();
  const texSource = readFileSync(resolve(inputPath), 'utf8');
  const cfgSource = loadCfgSource(texSource, inputPath, extractTemplateName);
  const { ast, warnings } = parse(texSource, cfgSource ? { cfgSource } : {});

  if (warnings.length > 0) {
    console.warn('Parse warnings:');
    warnings.forEach(w => console.warn(`  - ${w}`));
  }

  const layoutResult = layout(ast);
  const renderer = new HTMLRenderer(ast);
  const templateId = layoutResult.templateId;
  const pageHTMLs = renderer.renderFromLayout(layoutResult);
  const pagesContent = pageHTMLs.map(h =>
    `<div class="wtc-page" data-template="${templateId}">${h}</div>`
  ).join('\n');

  const html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ast.title || 'WebTeX-CN'}</title>
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="${templateId}.css">
</head>
<body>
${pagesContent}
</body>
</html>`;

  mkdirSync(resolve(outputDir), { recursive: true });

  const outputName = basename(inputPath, '.tex') + '.html';
  writeFileSync(join(resolve(outputDir), outputName), html, 'utf8');

  // Copy CSS files
  const templatesDir = join(srcDir, 'templates');
  const cssFiles = ['base.css', `${templateId}.css`];
  for (const file of cssFiles) {
    const src = join(templatesDir, file);
    if (existsSync(src)) {
      copyFileSync(src, join(resolve(outputDir), file));
    }
  }

  console.log(`Built: ${join(outputDir, outputName)}`);
  console.log(`Template: ${templateId}`);
  console.log(`CSS files copied to ${outputDir}/`);
}

async function serveCommand(inputPath, port, pdfRefPath = null) {
  if (!inputPath || !existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  // Check if PDF reference exists
  let pdfPagesDir = null;
  if (pdfRefPath) {
    if (!existsSync(pdfRefPath)) {
      console.warn(`Warning: PDF reference not found: ${pdfRefPath}`);
      pdfRefPath = null;
    } else {
      // Assume PDF pages are already converted in output/compare/pdf-pages/
      const projectRoot = join(__dirname, '..');
      pdfPagesDir = join(projectRoot, 'output', 'compare', 'pdf-pages');
      if (!existsSync(pdfPagesDir)) {
        console.warn(`Warning: PDF pages directory not found: ${pdfPagesDir}`);
        console.warn(`Run visual-compare first to generate PDF page images.`);
        pdfRefPath = null;
        pdfPagesDir = null;
      }
    }
  }

  const { parse, layout, HTMLRenderer, extractTemplateName } = await loadLib();
  const templatesDir = join(srcDir, 'templates');

  const server = createServer((req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url;

    // Serve generated HTML
    if (url === '/index.html' || url.startsWith('/index.html?')) {
      const texSource = readFileSync(resolve(inputPath), 'utf8');
      const cfgSource = loadCfgSource(texSource, inputPath, extractTemplateName);
      const { ast } = parse(texSource, cfgSource ? { cfgSource } : {});
      const layoutResult = layout(ast);
      const renderer = new HTMLRenderer(ast);
      const templateId = layoutResult.templateId;
      const pageHTMLs = renderer.renderFromLayout(layoutResult);

      // Parse page parameter
      const urlObj = new URL(url, `http://localhost:${port}`);
      const requestedPage = parseInt(urlObj.searchParams.get('page') || '1', 10);
      const pageIndex = requestedPage - 1;

      let html;
      if (pdfPagesDir && pageIndex >= 0 && pageIndex < pageHTMLs.length) {
        // Three-column comparison mode
        const pdfFiles = readdirSync(pdfPagesDir).filter(f => f.endsWith('.png')).sort();
        const pdfPageFile = pdfFiles[pageIndex] || null;

        const navigation = `<div class="nav">
          ${pageIndex > 0 ? `<a href="?page=${pageIndex}">&larr; Prev</a>` : '<span>&larr; Prev</span>'}
          <span>Page ${requestedPage} / ${pageHTMLs.length}</span>
          ${pageIndex < pageHTMLs.length - 1 ? `<a href="?page=${pageIndex + 2}">Next &rarr;</a>` : '<span>Next &rarr;</span>'}
        </div>`;

        const texDisplay = `<pre class="tex-source">${texSource.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;

        const htmlDisplay = `<div class="wtc-page" data-template="${templateId}">${pageHTMLs[pageIndex]}</div>`;

        const pdfDisplay = pdfPageFile
          ? `<img src="/pdf-page/${pdfPageFile}" alt="PDF Page ${requestedPage}" style="max-width: 100%; border: 1px solid #ccc;">`
          : `<p>PDF page not found</p>`;

        html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Page ${requestedPage} - ${ast.title || 'WebTeX-CN'}</title>
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="${templateId}.css">
<style>
  body { margin: 0; padding: 20px; font-family: sans-serif; }
  .nav { text-align: center; margin-bottom: 20px; }
  .nav a { margin: 0 10px; text-decoration: none; color: #0066cc; }
  .nav span { margin: 0 10px; color: #999; }
  .container { display: flex; gap: 20px; }
  .column { flex: 1; overflow: auto; }
  .column h3 { margin: 0 0 10px 0; font-size: 14px; color: #666; }
  .tex-source {
    font-family: monospace;
    font-size: 12px;
    line-height: 1.4;
    background: #f5f5f5;
    padding: 10px;
    border: 1px solid #ddd;
    overflow: auto;
    max-height: 800px;
  }
  .wtc-page {
    display: inline-block;
    margin: 0 auto;
  }
</style>
</head>
<body>
${navigation}
<div class="container">
  <div class="column">
    <h3>TeX Source</h3>
    ${texDisplay}
  </div>
  <div class="column">
    <h3>WebTeX-CN Output</h3>
    ${htmlDisplay}
  </div>
  <div class="column">
    <h3>PDF Reference (Page ${requestedPage})</h3>
    ${pdfDisplay}
  </div>
</div>
</body>
</html>`;
      } else {
        // Normal single-page mode
        const pagesContent = pageHTMLs.map(h =>
          `<div class="wtc-page" data-template="${templateId}">${h}</div>`
        ).join('\n');

        html = `<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${ast.title || 'WebTeX-CN'}</title>
<link rel="stylesheet" href="base.css">
<link rel="stylesheet" href="${templateId}.css">
</head>
<body>
${pagesContent}
</body>
</html>`;
      }

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
    }

    // Serve PDF page images
    if (pdfPagesDir && url.startsWith('/pdf-page/')) {
      const filename = url.replace('/pdf-page/', '');
      const imgPath = join(pdfPagesDir, filename);
      if (existsSync(imgPath)) {
        const img = readFileSync(imgPath);
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(img);
        return;
      }
    }

    // Serve CSS files
    const cssPath = join(templatesDir, url.replace(/^\//, ''));
    if (existsSync(cssPath) && url.endsWith('.css')) {
      const css = readFileSync(cssPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end(css);
      return;
    }

    res.writeHead(404);
    res.end('Not Found');
  });

  server.listen(port, () => {
    console.log(`WebTeX-CN preview server`);
    console.log(`  File: ${inputPath}`);
    if (pdfPagesDir) {
      console.log(`  Mode: Comparison (with PDF reference)`);
      console.log(`  URL:  http://localhost:${port}/?page=1`);
    } else {
      console.log(`  URL:  http://localhost:${port}/`);
    }
    console.log(`  Press Ctrl+C to stop`);
  });
}

// Main
const args = parseArgs(process.argv.slice(2));

switch (args.command) {
  case 'build':
    await buildCommand(args.input, args.output);
    break;
  case 'serve':
    await serveCommand(args.input, args.port, args.pdfRef);
    break;
  case 'help':
  default:
    usage();
    break;
}
