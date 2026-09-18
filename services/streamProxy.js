const axios = require('axios');
const urlModule = require('url');

async function handleStreamProxy(req, res) {
  const targetUrl = req.query.url;
  const customUa = req.query.ua || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

  if (!targetUrl) {
    return res.status(400).send('URL de stream ausente');
  }

  try {
    const headers = {
      'User-Agent': customUa,
      'Accept': '*/*'
    };

    if (targetUrl.includes('pluto.tv')) {
      headers['Referer'] = 'https://pluto.tv/';
      headers['Origin'] = 'https://pluto.tv';
    }

    const response = await axios({
      method: 'get',
      url: targetUrl,
      headers: headers,
      responseType: 'stream',
      timeout: 15000
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    const contentType = response.headers['content-type'];
    if (contentType) {
      res.setHeader('Content-Type', contentType);
    }

    // Se for playlist m3u8, reescreve as URLs relativas para passarem pelo proxy com User-Agent
    if (targetUrl.includes('.m3u8')) {
      const m3u8Res = await axios.get(targetUrl, { headers, responseType: 'text', timeout: 12000 });
      const parsedBase = new URL(targetUrl);
      const lines = m3u8Res.data.split('\n');
      const rewritten = lines.map(line => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        let absoluteUrl = '';
        if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
          absoluteUrl = trimmed;
        } else if (trimmed.startsWith('/')) {
          absoluteUrl = `${parsedBase.origin}${trimmed}`;
        } else {
          const basePath = parsedBase.pathname.substring(0, parsedBase.pathname.lastIndexOf('/') + 1);
          absoluteUrl = `${parsedBase.origin}${basePath}${trimmed}`;
        }
        return `/api/proxy/stream?url=${encodeURIComponent(absoluteUrl)}&ua=${encodeURIComponent(customUa)}`;
      }).join('\n');

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      return res.send(rewritten);
    }

    response.data.pipe(res);
  } catch (error) {
    console.error('Erro no Stream Proxy:', error.message, 'URL:', targetUrl);
    res.status(502).json({ error: 'Falha ao conectar à transmissão', details: error.message });
  }
}

module.exports = {
  handleStreamProxy
};
