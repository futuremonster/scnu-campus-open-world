import { readFile, writeFile } from 'node:fs/promises';

const readSource = (name) => readFile(new URL(`src/${name}`, import.meta.url), 'utf8');
const [template, styles, ...scripts] = await Promise.all(
  ['index.template.html', 'campus.css', 'campus.js', 'terrain.js', 'scene.js', 'viewer.js'].map(readSource)
);
const page = template
  .replace('/* CAMPUS_CSS */', () => styles)
  .replace('// CAMPUS_JS', () => scripts.join('\n\n'));

await writeFile(new URL('index.html', import.meta.url), page);
