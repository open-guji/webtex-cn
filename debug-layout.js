#!/usr/bin/env node
import { readFileSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcDir = join(__dirname, 'src');

async function debugLayout() {
  const { parse } = await import(join(srcDir, 'parser', 'index.js'));
  const { layout } = await import(join(srcDir, 'layout', 'grid-layout.js'));

  const texPath = resolve('examples/siku-mulu.tex');
  const cfgPath = resolve('examples/四库全书文渊阁简明目录.cfg');

  const texSource = readFileSync(texPath, 'utf8');
  const cfgSource = readFileSync(cfgPath, 'utf8');

  const { ast } = parse(texSource, { cfgSource });

  console.log('\\n=== AST Structure ===');
  console.log(`ast.children: ${ast.children?.length || 0}`);
  const bodyNode = ast.children?.find(c => c.type === 'body');
  console.log(`bodyNode exists: ${!!bodyNode}`);
  if (bodyNode) {
    console.log(`bodyNode.children: ${bodyNode.children?.length || 0}`);
    bodyNode.children?.slice(0, 10).forEach((child, idx) => {
      console.log(`  [${idx}] type=${child.type}`);
    });
  }
  ast.children?.slice(0, 10).forEach((child, idx) => {
    console.log(`ast.children[${idx}]: type=${child.type}`);
  });

  const layoutResult = layout(ast);

  console.log(`Total pages: ${layoutResult.pages.length}`);
  console.log(`Template: ${layoutResult.templateId}\n`);

  // Show front matter
  console.log(`\n=== Front Matter (${layoutResult.frontMatter?.length || 0} pages) ===`);
  if (layoutResult.frontMatter) {
    layoutResult.frontMatter.forEach((fm, idx) => {
      console.log(`\n[${idx}] type=${fm.type}`);
      if (fm.node.children && fm.node.children.length > 0) {
        const firstChild = fm.node.children[0];
        console.log(JSON.stringify(firstChild, null, 2).substring(0, 2000));
      }
    });
  }

  // Show first 5 pages
  for (let i = 0; i < Math.min(5, layoutResult.pages.length); i++) {
    const page = layoutResult.pages[i];
    console.log(`\n=== Page ${i} (${page.type}) ===`);
    console.log(`Right half: ${page.halfBoundary} items`);
    console.log(`Left half: ${page.items.length - page.halfBoundary} items`);
    console.log(`Floats: ${page.floats.length}`);

    if (page.type === 'cover' || page.type === 'blank') {
      console.log('\nFloats:');
      page.floats.forEach((f, idx) => {
        const text = f.content?.children
          ?.map(c => c.text || c.value || '')
          .join('')
          .substring(0, 30);
        console.log(`  [${idx}] type=${f.type} x=${f.x} y=${f.y} text="${text}"`);
      });
    } else {
      // Show first 20 items
      console.log('\nRight half items (all):');
      for (let j = 0; j < page.halfBoundary; j++) {
        const item = page.items[j];
        let text = item.node?.value || item.node?.text || '';
        if (item.node?.children) {
          text = item.node.children.map(c => c.text || c.value || '').join('').substring(0, 25);
        }
        console.log(`  [${j}] col=${item.col} row=${item.row} indent=${item.indent} type=${item.node?.type} text="${text}"`);
      }
      console.log(`\nLeft half items (first 10):`);
      for (let j = page.halfBoundary; j < Math.min(page.halfBoundary + 10, page.items.length); j++) {
        const item = page.items[j];
        let text = item.node?.value || item.node?.text || '';
        if (item.node?.children) {
          text = item.node.children.map(c => c.text || c.value || '').join('').substring(0, 25);
        }
        console.log(`  [${j}] col=${item.col} row=${item.row} indent=${item.indent} type=${item.node?.type} text="${text}"`);
      }
    }
  }
}

debugLayout().catch(console.error);
