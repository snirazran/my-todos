import { createRequire } from 'node:module';
import { copyFileSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const pkgJsonPath = require.resolve('@rive-app/canvas-lite/package.json');
const pkgDir = path.dirname(pkgJsonPath);
const version = JSON.parse(readFileSync(pkgJsonPath, 'utf8')).version;

for (const file of ['rive.wasm', 'rive_fallback.wasm']) {
  copyFileSync(path.join(pkgDir, file), path.join(root, 'public', file));
}

const versionFile = path.join(root, 'src', 'lib', 'riveWasmVersion.ts');
const content = `export const RIVE_WASM_VERSION = '${version}';\n`;
if (!existsSync(versionFile) || readFileSync(versionFile, 'utf8') !== content) {
  writeFileSync(versionFile, content);
}

console.log(`Copied Rive WASM ${version} to public/`);
