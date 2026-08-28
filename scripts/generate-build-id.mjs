import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'src', 'lib', 'generated', 'buildId.ts');

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
      cwd: root,
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return '';
  }
}

const source =
  process.env.SOURCE_COMMIT ||
  process.env.COOLIFY_DEPLOYMENT_UUID ||
  gitSha() ||
  'local';

const buildId = `${source.slice(0, 12)}-${Date.now().toString(36)}`;

mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, `export const BUILD_ID = '${buildId}';\n`);

console.log(`build id: ${buildId}`);
