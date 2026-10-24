import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listFeatureDirs } from '../core/feature-registry/discover';

// Feature migrations are named <feature>__<YYYYMMDDHHmm>_<desc>.sql. Supabase wants
// <version>_<name>.sql in supabase/migrations/, so we derive a stable version from the file's own
// timestamp. Adding a feature never renumbers anything. Core migrations: core/db/migrations/<YYYYMMDDHHmm>_<desc>.sql.
const root = fileURLToPath(new URL('..', import.meta.url));
const out = join(root, 'supabase/migrations');
mkdirSync(out, { recursive: true });
const sources = [
  { prefix: 'core', dir: join(root, 'core/db/migrations') },
  ...listFeatureDirs().map((f) => ({ prefix: f, dir: join(root, 'features', f, 'migrations') })),
];
let n = 0;
for (const { prefix, dir } of sources) {
  if (!existsSync(dir)) continue;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
    const m = /^(?:.+__)?(\d{12})_(.+)\.sql$/.exec(file);
    if (!m)
      throw new Error(
        `${prefix}: bad migration name ${file} (want <feature>__<YYYYMMDDHHmm>_<desc>.sql)`,
      );
    if (prefix !== 'core' && !file.startsWith(`${prefix}__`))
      throw new Error(`${file} must start with ${prefix}__`);
    copyFileSync(join(dir, file), join(out, `${m[1]}00_${prefix}__${m[2]}.sql`));
    n++;
  }
}
console.log(`migrations: ${n} file(s) -> supabase/migrations`);
