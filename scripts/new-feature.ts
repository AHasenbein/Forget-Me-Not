import { execSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name) || name.startsWith('_')) {
  console.error('Usage: npm run new-feature <kebab-case-name>');
  process.exit(1);
}
const src = join(root, 'features/_template');
const dest = join(root, 'features', name);
if (existsSync(dest)) {
  console.error(`features/${name} already exists`);
  process.exit(1);
}
const tokens: Record<string, string> = {
  __FEATURE_NAME__: name,
  __FEATURE_ENV__: name.toUpperCase().replace(/-/g, '_'),
  __FEATURE_TABLE__: name.replace(/-/g, '_') + '_',
};
const sub = (s: string) => Object.entries(tokens).reduce((acc, [k, v]) => acc.split(k).join(v), s);

cpSync(src, dest, { recursive: true });
(function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    let p = join(dir, entry);
    if (sub(entry) !== entry) {
      renameSync(p, join(dir, sub(entry)));
      p = join(dir, sub(entry));
    }
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|md|json|sql)$/.test(p)) writeFileSync(p, sub(readFileSync(p, 'utf8')));
  }
})(dest);
execSync('npm run -s gen:registry', { cwd: root, stdio: 'inherit' });
console.log(
  `Created features/${name}. Next: edit features/${name}/CLAUDE.md, then FEATURE_${tokens.__FEATURE_ENV__}=on npm run dev:api`,
);
