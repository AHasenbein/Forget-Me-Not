import { copyFileSync, existsSync } from 'node:fs';

// Cross-platform (Windows + macOS) post-install step. Never overwrites an existing .env.
if (!existsSync('.env')) {
  copyFileSync('.env.example', '.env');
  console.log('Created .env from .env.example (demo mode needs no secrets).');
}
console.log('Setup done. Try: npm test, then npm run dev:api:demo or npm run dev:demo');
