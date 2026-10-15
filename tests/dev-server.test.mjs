import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSimulationServer } from '../dev-server.mjs';

let server, base, outbox;
const payload = () => ({ name: 'Zoë', surname: 'Voorbeeld', attendance: 'yes', website: '', requestId: randomUUID() });
const submit = (body, headers = {}) => fetch(`${base}/api/rsvp`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

before(async () => {
  outbox = await mkdtemp(path.join(os.tmpdir(), 'rsvp-simulation-test-'));
  server = createSimulationServer({ outbox });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  const resolved = path.resolve(outbox);
  const parent = path.resolve(os.tmpdir()) + path.sep;
  if (resolved.startsWith(parent) && path.basename(resolved).startsWith('rsvp-simulation-test-')) await rm(resolved, { recursive: true });
});

test('saves an RSVP as a simulated email with UTF-8 names and the fixed recipient', async () => {
  const data = payload();
  const response = await submit(data);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, simulated: true });
  const saved = JSON.parse(await readFile(path.join(outbox, `${data.requestId}.json`), 'utf8'));
  assert.equal(saved.to, 'krugers2b@gmail.com');
  assert.equal(saved.name, 'Zoë');
  assert.equal(saved.attendance, 'yes');
  const email = await fetch(`${base}/__dev/outbox/${data.requestId}.eml`);
  assert.match(await email.text(), /Naam: Zoë\r\nVan: Voorbeeld\r\nBywoning: Ja/);
  const listing = await fetch(`${base}/__dev/outbox`);
  assert.match(await listing.text(), /Zoë Voorbeeld/);
});

test('parallel retries create one email; reusing its ID with changed answers is rejected', async () => {
  const data = { ...payload(), attendance: 'no' };
  const countBefore = (await readdir(outbox)).length;
  const responses = await Promise.all([submit(data), submit(data), submit(data)]);
  assert.deepEqual(responses.map(response => response.status), [200, 200, 200]);
  assert.equal((await readdir(outbox)).length, countBefore + 1);
  const conflict = await submit({ ...data, attendance: 'yes' });
  assert.equal(conflict.status, 409);
});

test('rejects invalid names, attendance, IDs, honeypots and cross-origin writes', async () => {
  for (const invalid of [{ name: '  ' }, { name: 'A\nB' }, { surname: 'x'.repeat(101) }, { attendance: 'maybe' }, { requestId: '../secret' }, { website: 'bot' }]) {
    const response = await submit({ ...payload(), ...invalid });
    assert.equal(response.status, 422);
  }
  const crossOrigin = await submit(payload(), { Origin: 'https://example.com' });
  assert.equal(crossOrigin.status, 403);
  const oversized = await submit({ ...payload(), name: 'x'.repeat(5000) });
  assert.equal(oversized.status, 413);
});

test('serves local configuration and video ranges without exposing backend files', async () => {
  const config = await fetch(`${base}/config.js`);
  assert.match(await config.text(), /rsvpEndpoint = '\/api\/rsvp'/);
  const video = await fetch(`${base}/main.mp4`, { headers: { Range: 'bytes=0-15' } });
  assert.equal(video.status, 206);
  assert.equal((await video.arrayBuffer()).byteLength, 16);
  const privateFile = await fetch(`${base}/backend/private/config.example.php`);
  assert.equal(privateFile.status, 404);
  const invalidMethod = await fetch(`${base}/api/rsvp`);
  assert.equal(invalidMethod.status, 405);
});
