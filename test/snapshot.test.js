import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToHTML } from '../src/index.js';
import { parse } from '../src/parser/index.js';

const examplesDir = join(import.meta.dirname, '..', 'examples');

function loadTex(name) {
  return readFileSync(join(examplesDir, name), 'utf-8');
}

describe('Snapshot: example files', () => {
  it('minimal.tex renders consistently', () => {
    const tex = loadTex('minimal.tex');
    const html = renderToHTML(tex);
    expect(html).toMatchSnapshot();
  });

  it('shiji.tex renders consistently', () => {
    const tex = loadTex('shiji.tex');
    const html = renderToHTML(tex);
    expect(html).toMatchSnapshot();
  });

  it('showcase.tex renders consistently', () => {
    const tex = loadTex('showcase.tex');
    const html = renderToHTML(tex);
    expect(html).toMatchSnapshot();
  });

  it('honglou.tex renders consistently', () => {
    const tex = loadTex('honglou.tex');
    const html = renderToHTML(tex);
    expect(html).toMatchSnapshot();
  });

  it('minimal.tex parses without warnings', () => {
    const tex = loadTex('minimal.tex');
    const { warnings } = parse(tex);
    expect(warnings).toEqual([]);
  });

  it('shiji.tex parses without warnings', () => {
    const tex = loadTex('shiji.tex');
    const { warnings } = parse(tex);
    expect(warnings).toEqual([]);
  });

  it('showcase.tex parses without warnings', () => {
    const tex = loadTex('showcase.tex');
    const { warnings } = parse(tex);
    expect(warnings).toEqual([]);
  });

  it('honglou.tex parses without warnings', () => {
    const tex = loadTex('honglou.tex');
    const { warnings } = parse(tex);
    expect(warnings).toEqual([]);
  });
});
