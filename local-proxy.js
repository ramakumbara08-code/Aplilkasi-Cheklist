const http = require('http');

const HOST = '127.0.0.1';
const PORT = 5501;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbyZ0LTjTCA3wRni_h4QXjts0kS8Tfm61gktfTGFeqpcIgUF2jfgL7YojuyKR7LkZGZTMA/exec';

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Cache-Control', 'no-store');
}

function sendJson(res, status, payload) {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Ukuran request melebihi 6 MB.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.url !== '/api/gas' || req.method !== 'POST') {
    sendJson(res, 404, { ok: false, error: { message: 'Endpoint tidak ditemukan.' } });
    return;
  }

  try {
    const body = await readBody(req);
    const gasResponse = await fetch(GAS_WEB_APP_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      redirect: 'follow'
    });
    const text = await gasResponse.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      throw new Error('Respons GAS bukan JSON. Pastikan deployment GAS terbaru sudah aktif.');
    }
    sendJson(res, gasResponse.ok ? 200 : 502, payload);
  } catch (err) {
    sendJson(res, 502, {
      ok: false,
      error: { message: err && err.message ? err.message : 'Proxy lokal gagal menghubungi GAS.' }
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Proxy upload lokal aktif: http://${HOST}:${PORT}/api/gas`);
  console.log('Biarkan terminal ini tetap terbuka selama memakai Live Server.');
});
