import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dev = process.argv.includes('--dev');
const outDir = path.resolve(root, '../../4 输出成品/HTML');
fs.mkdirSync(outDir, { recursive: true });

const result = await esbuild.build({
  entryPoints: [path.join(root, 'src/main.js')],
  bundle: true,
  minify: !dev,
  format: 'iife',
  target: 'es2020',
  write: false,
  legalComments: 'none',
});

const js = result.outputFiles[0].text;
const tpl = fs.readFileSync(path.join(root, 'src/template.html'), 'utf8');
const html = tpl.replace('/*__BUNDLE__*/', () => js);
const outFile = path.join(outDir, '美式城市街景.html');
fs.writeFileSync(outFile, html);
console.log('built:', outFile, (fs.statSync(outFile).size / 1024 / 1024).toFixed(2) + ' MB', dev ? '(dev)' : '');
