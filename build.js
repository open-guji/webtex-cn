#!/usr/bin/env node
/**
 * Build script for WebTeX-CN.
 * Bundles JS and CSS into dist/ directory.
 */
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, 'dist');

mkdirSync(distDir, { recursive: true });

// 1. Bundle JS (ESM)
await esbuild.build({
  entryPoints: [join(__dirname, 'src/index.js')],
  bundle: true,
  format: 'esm',
  outfile: join(distDir, 'webtex-cn.esm.js'),
  platform: 'browser',
});

// 2. Bundle JS (IIFE for <script> tag)
await esbuild.build({
  entryPoints: [join(__dirname, 'src/index.js')],
  bundle: true,
  format: 'iife',
  globalName: 'WebTeX',
  outfile: join(distDir, 'webtex-cn.js'),
  platform: 'browser',
});

// 3. Minified IIFE
await esbuild.build({
  entryPoints: [join(__dirname, 'src/index.js')],
  bundle: true,
  format: 'iife',
  globalName: 'WebTeX',
  outfile: join(distDir, 'webtex-cn.min.js'),
  platform: 'browser',
  minify: true,
});

// 4. Concatenate CSS files: base.css + all template CSS files
const templatesDir = join(__dirname, 'src/templates');
const baseCSS = readFileSync(join(templatesDir, 'base.css'), 'utf8');

const templateFiles = readdirSync(templatesDir)
  .filter(f => f.endsWith('.css') && f !== 'base.css')
  .sort();

let combinedCSS = `/* WebTeX-CN Combined Styles */\n\n`;
combinedCSS += `/* ---- Base Styles ---- */\n${baseCSS}\n`;

for (const file of templateFiles) {
  const css = readFileSync(join(templatesDir, file), 'utf8');
  const name = file.replace('.css', '');
  combinedCSS += `\n/* ---- Template: ${name} ---- */\n${css}\n`;
}

writeFileSync(join(distDir, 'webtex-cn.css'), combinedCSS);

// 5. Copy individual template CSS files
for (const file of ['base.css', ...templateFiles]) {
  const src = readFileSync(join(templatesDir, file), 'utf8');
  writeFileSync(join(distDir, file), src);
}

// Report
const files = readdirSync(distDir);
console.log('Build complete! Files in dist/:');
for (const f of files) {
  const size = readFileSync(join(distDir, f)).length;
  console.log(`  ${f} (${(size / 1024).toFixed(1)} KB)`);
}
