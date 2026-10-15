import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = path.dirname(fileURLToPath(import.meta.url));
const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.mp4': 'video/mp4', '.ico': 'image/x-icon' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function createSimulationServer({ root = path.join(project, 'dist'), outbox = path.join(project, '.local', 'rsvp-outbox') } = {}) {
  const pending = new Map();
  function json(response, code, body) {
    response.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(body));
  }
  async function recordRsvp(data) {
    const id = data.requestId.toLowerCase();
    const fingerprint = createHash('sha256').update(JSON.stringify([data.name, data.surname, data.attendance])).digest('hex');
    await mkdir(outbox, { recursive: true });
    const destination = path.join(outbox, `${id}.json`);
    try {
      const existing = JSON.parse(await readFile(destination, 'utf8'));
      return existing.fingerprint === fingerprint ? 200 : 409;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    const date = new Date();
    const attendance = data.attendance === 'yes' ? 'Ja' : 'Nee';
    const body = `Nuwe RSVP vir 12 Desember 2026\r\n\r\nNaam: ${data.name}\r\nVan: ${data.surname}\r\nBywoning: ${attendance}\r\n`;
    const message = {
      id, fingerprint, simulated: true,
      from: 'admin@krugers2b.co.za', to: 'krugers2b@gmail.com',
      subject: `Troue RSVP - ${attendance}`, receivedAt: date.toISOString(),
      name: data.name, surname: data.surname, attendance: data.attendance, body,
      eml: `From: Krugers se troue <admin@krugers2b.co.za>\r\nTo: krugers2b@gmail.com\r\nSubject: Troue RSVP - ${attendance}\r\nDate: ${date.toUTCString()}\r\nMessage-ID: <${id}@localhost>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\nX-RSVP-Simulated: true\r\n\r\n${body}`,
    };
    await writeFile(destination, JSON.stringify(message, null, 2) + '\n', { flag: 'wx' });
    return 200;
  }

  return createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const base = `http://${request.headers.host}`;
      const url = new URL(request.url, base);
      if (url.pathname === '/api/rsvp') {
        if (request.method !== 'POST') return json(response, 405, { ok: false });
        // A browser on another origin cannot write to this local development server.
        if (request.headers.origin && request.headers.origin !== base) return json(response, 403, { ok: false });
        if (!request.headers['content-type']?.toLowerCase().startsWith('application/json')) return json(response, 415, { ok: false });
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 4096) return json(response, 413, { ok: false });
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString('utf8');
        let data;
        try { data = JSON.parse(raw); } catch { return json(response, 400, { ok: false }); }
        if (!data || typeof data !== 'object') return json(response, 422, { ok: false });
        const validName = value => typeof value === 'string' && value.trim().length > 0 && [...value.trim()].length <= 100 && !/[\x00-\x1f\x7f]/.test(value);
        if (!validName(data.name) || !validName(data.surname) || !['yes', 'no'].includes(data.attendance) || typeof data.requestId !== 'string' || !uuidPattern.test(data.requestId) || data.website) return json(response, 422, { ok: false });
        data.name = data.name.trim();
        data.surname = data.surname.trim();
        const id = data.requestId.toLowerCase();
        // Serialize the same request ID so parallel retries still produce one email.
        const operation = (pending.get(id) || Promise.resolve()).then(() => recordRsvp(data));
        const tail = operation.catch(() => {});
        pending.set(id, tail);
        try {
          const code = await operation;
          return json(response, code, { ok: code === 200, simulated: true });
        } finally { if (pending.get(id) === tail) pending.delete(id); }
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json(response, 405, { ok: false });
      if (url.pathname === '/__dev/outbox') {
        let entries = [];
        try { entries = await readdir(outbox); } catch (error) { if (error.code !== 'ENOENT') throw error; }
        const messages = await Promise.all(entries.filter(file => uuidPattern.test(file.replace(/\.json$/, '')) && file.endsWith('.json')).map(async file => JSON.parse(await readFile(path.join(outbox, file), 'utf8'))));
        messages.sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
        const rows = messages.map(message => `<li><h2>${escape(message.name)} ${escape(message.surname)}</h2><p>${message.attendance === 'yes' ? 'Ja — woon by' : 'Nee — woon nie by nie'}</p><p>Aan: ${escape(message.to)}<br>${escape(new Date(message.receivedAt).toLocaleString('af-ZA', { timeZone: 'Africa/Johannesburg' }))}</p><a href="/__dev/outbox/${message.id}.eml">Laai toets-e-pos af</a></li>`).join('');
        response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return response.end(`<!doctype html><html lang="af"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>RSVP toets-uitboks</title><style>body{font:18px Georgia,serif;background:#f6f4ef;color:#242420;max-width:680px;margin:40px auto;padding:0 22px}h1{font-weight:400}p{line-height:1.5}ul{list-style:none;padding:0}li{background:white;border:1px solid #d7d2c9;border-radius:8px;padding:20px;margin:18px 0}h2{font-size:24px;font-weight:400;margin:0}a{color:inherit}</style><h1>RSVP toets-uitboks</h1><p>Slegs 'n plaaslike simulasie. Geen e-pos word gestuur nie.</p><p><a href="/">Maak die uitnodiging oop</a> · <a href="/__dev/outbox">Verfris</a></p><ul>${rows || '<li>Geen toets-RSVP’s ontvang nie.</li>'}</ul></html>`);
      }
      const emailMatch = url.pathname.match(/^\/__dev\/outbox\/([a-f0-9-]+)\.eml$/i);
      if (emailMatch && uuidPattern.test(emailMatch[1])) {
        const message = JSON.parse(await readFile(path.join(outbox, `${emailMatch[1].toLowerCase()}.json`), 'utf8'));
        response.writeHead(200, { 'Content-Type': 'message/rfc822', 'Content-Disposition': `attachment; filename="rsvp-${message.id}.eml"` });
        return response.end(message.eml);
      }
      if (url.pathname === '/config.js') {
        const config = await readFile(path.join(root, 'config.js'), 'utf8');
        response.writeHead(200, { 'Content-Type': types['.js'] });
        return response.end(`${config}\n// Local development only: simulate email delivery.\nwindow.INVITATION_CONFIG.rsvpEndpoint = '/api/rsvp';\n`);
      }
      const decoded = decodeURIComponent(url.pathname);
      const filename = path.resolve(root, '.' + (decoded === '/' ? '/index.html' : decoded));
      const relative = path.relative(root, filename);
      if (relative.startsWith('..') || path.isAbsolute(relative) || decoded.includes('\\')) return json(response, 403, { ok: false });
      const info = await stat(filename);
      if (!info.isFile()) return json(response, 404, { ok: false });
      const headers = { 'Content-Type': types[path.extname(filename)] || 'application/octet-stream', 'Accept-Ranges': 'bytes' };
      if (request.headers.range) {
        const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.range);
        const start = range?.[1] ? Number(range[1]) : Math.max(0, info.size - Number(range?.[2]));
        const end = range?.[1] && range?.[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
        if (!range || !Number.isSafeInteger(start) || start < 0 || start > end) {
          response.writeHead(416, { 'Content-Range': `bytes */${info.size}` });
          return response.end();
        }
        response.writeHead(206, { ...headers, 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${info.size}` });
        if (request.method === 'HEAD') return response.end();
        return createReadStream(filename, { start, end }).pipe(response);
      }
      response.writeHead(200, { ...headers, 'Content-Length': info.size });
      if (request.method === 'HEAD') return response.end();
      createReadStream(filename).pipe(response);
    } catch (error) {
      if (!response.headersSent) json(response, error.code === 'ENOENT' ? 404 : 500, { ok: false });
      else response.end();
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 8080);
  const server = createSimulationServer();
  server.on('error', error => { console.error(`Local server could not start: ${error.message}`); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Invitation: http://127.0.0.1:${port}`);
    console.log(`Simulated email outbox: http://127.0.0.1:${port}/__dev/outbox`);
    console.log('Simulation only. No real email will be sent.');
  });
}
