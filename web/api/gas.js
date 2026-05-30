module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    return res.status(405).json({
      ok: false,
      error: { message: 'Gunakan request POST.' }
    });
  }

  const gasUrl = process.env.GAS_WEB_APP_URL;
  if (!gasUrl) {
    return res.status(500).json({
      ok: false,
      error: { message: 'Environment GAS_WEB_APP_URL belum diatur di Vercel.' }
    });
  }

  try {
    const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
    const response = await fetch(gasUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });

    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch (err) {
      return res.status(502).json({
        ok: false,
        error: {
          message: 'Respons GAS bukan JSON. Pastikan URL Web App GAS memakai akhiran /exec dan sudah dideploy ulang.'
        }
      });
    }

    return res.status(response.ok ? 200 : 502).json(payload);
  } catch (err) {
    return res.status(502).json({
      ok: false,
      error: {
        message: err && err.message ? err.message : 'Tidak bisa menghubungi backend GAS.'
      }
    });
  }
};
