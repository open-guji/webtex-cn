#!/usr/bin/env node
/**
 * WebTeX-CN CLI
 * Usage:
 *   webtex-cn build input.tex [-o output/]
 *   webtex-cn serve input.tex [-p port]
 */
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'fs';
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
  return { parse, layout, HTMLRenderer };
}

function usage() {
  console.log(`WebTeX-CN CLI

Usage:
  webtex-cn build <input.tex> [-o <output-dir>]    Build static HTML
  webtex-cn serve <input.tex> [-p <port>]           Preview server

Options:
  -o, --output <dir>    Output directory (default: ./output)
  -p, --port <port>     Server port (default: 8080)
  -h, --help            Show this help`);
}

function parseArgs(args) {
  const result = { command: null, input: null, output: './output', port: 8080 };
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

  const { parse, layout, HTMLRenderer } = await loadLib();
  const texSource = readFileSync(resolve(inputPath), 'utf8');
  const { ast, warnings } = parse(texSource);

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

async function serveCommand(inputPath, port) {
  if (!inputPath || !existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    process.exit(1);
  }

  const { parse, layout, HTMLRenderer } = await loadLib();
  const templatesDir = join(srcDir, 'templates');

  const server = createServer((req, res) => {
    const url = req.url === '/' ? '/index.html' : req.url;

    // Serve generated HTML
    if (url === '/index.html') {
      const texSource = readFileSync(resolve(inputPath), 'utf8');
      const { ast } = parse(texSource);
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

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      return;
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
    console.log(`  URL:  http://localhost:${port}/`);
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
    await serveCommand(args.input, args.port);
    break;
  case 'help':
  default:
    usage();
    break;
}
