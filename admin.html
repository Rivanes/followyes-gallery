import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenizer } from './vendor/acorn.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourcePath = path.join(root, 'src', 'Gallery_V0_11.js');
const productionPath = path.join(root, 'src', 'Gallery_V0_11.min.js');
const source = fs.readFileSync(sourcePath, 'utf8');

function conservativeMinifyJavaScript(code) {
  const stream = tokenizer(code, { ecmaVersion: 'latest', sourceType: 'module', allowHashBang: true });
  let output = '';
  let previousEnd = 0;
  while (true) {
    const token = stream.getToken();
    if (token.type && token.type.label === 'eof') break;
    const gap = code.slice(previousEnd, token.start);
    if (gap.length > 0) output += /[\r\n]/.test(gap) ? '\n' : ' ';
    output += code.slice(token.start, token.end);
    previousEnd = token.end;
  }
  return output.trim() + '\n';
}

const production = conservativeMinifyJavaScript(source);
fs.writeFileSync(productionPath, production, 'utf8');
console.log(`Current production build generated (${(production.length / source.length * 100).toFixed(1)}% of source size).`);
