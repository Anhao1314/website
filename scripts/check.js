import { readFile, readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
async function files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(`${dir}/${entry.name}`) : `${dir}/${entry.name}`))).flat();
}
for (const file of [...await files('server'), ...await files('api'), ...await files('scripts'), ...await files('test'), 'demo/assets/demo.js']) {
  if (!file.endsWith('.js')) continue;
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file}: ${result.stderr}`);
}
const browserFiles = ['index.html', ...await files('demo')];
for (const file of browserFiles) {
  const content = await readFile(file, 'utf8');
  assert.ok(!/FLOWCREDIT_API_KEY|flowcredit-api\.onrender\.com|Authorization|Bearer/i.test(content), `Server-only material in ${file}`);
}
const js = await readFile('demo/assets/demo.js', 'utf8');
assert.ok(!/localStorage|sessionStorage|document\.cookie|innerHTML/.test(js));
assert.equal((js.match(/\bfetch\(/g) || []).length, 1);
assert.ok(js.includes('fetch("/api/demo/chat"'));
const html = await readFile('demo/index.html', 'utf8');
const embedded = JSON.parse(html.match(/<script id="demo-fixtures" type="application\/json">([\s\S]*?)<\/script>/)[1]);
const examples = JSON.parse(await readFile('demo/assets/examples.json', 'utf8'));
assert.deepEqual(embedded, examples);
assert.equal(examples.synthetic, true);
assert.equal(examples.cases.length, 3);
for (const example of examples.cases) assert.ok(!('result' in example), 'Preset must contain inputs only');
assert.ok(!html.includes('simulate-error'));
const env = await readFile('.env.example', 'utf8');
assert.equal(env, 'FLOWCREDIT_API_BASE_URL=https://flowcredit-api.onrender.com\nFLOWCREDIT_API_KEY=\nDEMO_ENABLED=false\nDEMO_ACCESS_CODE=\nALLOWED_DEMO_ORIGINS=http://localhost:8765\n');
const config = JSON.parse(await readFile('vercel.json', 'utf8'));
assert.equal(config.outputDirectory, 'dist');
assert.deepEqual(config.rewrites, [{ source: '/demo/', destination: '/demo/index.html' }]);
assert.ok(!config.rewrites.some(x => x.source.includes('(.*)')));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
assert.equal(Object.keys(pkg.dependencies || {}).length, 0);
assert.equal(Object.keys(lock.packages).length, 1);
assert.equal(pkg.version, lock.version);
console.log('PASS: syntax, browser boundary, fixture equality/input-only, environment template, minimal routing and zero dependencies.');
