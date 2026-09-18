import { mkdir, cp, rm } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('dist/', root);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
// Publish only public assets. Never ship server/, test/, docs/ or .env files as static files.
for (const path of ['index.html', 'assets', 'demo']) await cp(new URL(path, root), new URL(path, output), { recursive: true });
