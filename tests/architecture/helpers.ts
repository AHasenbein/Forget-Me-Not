import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, posix, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = fileURLToPath(new URL('../..', import.meta.url));

export interface SourceFile {
  path: string; // repo-relative, posix
  content: string;
}

export function readSources(dir: string): SourceFile[] {
  const out: SourceFile[] = [];
  const walk = (d: string) => {
    for (const e of readdirSync(d)) {
      if (e === 'node_modules') continue;
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e))
        out.push({
          path: relative(ROOT, p).split(sep).join('/'),
          content: readFileSync(p, 'utf8'),
        });
    }
  };
  walk(join(ROOT, dir));
  return out;
}

export function importSpecifiers(content: string): string[] {
  const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)['"]([^'"]+)['"]/g;
  return [...content.matchAll(re)].map((m) => m[1] as string);
}

/**
 * Rules:
 *  1. A feature file may not import via the @features alias (that is how you reach another feature).
 *  2. A feature file may not use a relative import that leaves its own feature folder
 *     (shared code must come through @core/* or @contracts/*).
 *  3. core/ and contracts/ never import @features/* (only the generated registry is exempt).
 */
export function findBoundaryViolations(files: SourceFile[]): string[] {
  const problems: string[] = [];
  for (const f of files) {
    const parts = f.path.split('/');
    for (const spec of importSpecifiers(f.content)) {
      if (parts[0] === 'features' && parts[1]) {
        if (spec.startsWith('@features/'))
          problems.push(`${f.path}: imports ${spec} (use event bus or a contract)`);
        if (spec.startsWith('.')) {
          const target = posix.join(posix.dirname(f.path), spec); // posix: no drive letters on Windows
          if (!target.startsWith(`features/${parts[1]}/`) && target !== `features/${parts[1]}`)
            problems.push(`${f.path}: relative import ${spec} escapes features/${parts[1]}/`);
        }
      }
      const coreExempt = /^core\/feature-registry\/(ui-)?registry\.generated\.ts$/.test(f.path);
      if (
        (parts[0] === 'core' || parts[0] === 'contracts') &&
        !coreExempt &&
        spec.startsWith('@features/')
      )
        problems.push(`${f.path}: shared code must not import ${spec}`);
    }
  }
  return problems;
}
