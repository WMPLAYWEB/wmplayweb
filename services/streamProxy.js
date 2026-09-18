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

    // Se for playlist m3u8, podemos reescrever as URLs relativas se necessário
    response.data.pipe(res);
  } catch (error) {
    console.error('Erro no Stream Proxy:', error.message, 'URL:', targetUrl);
    res.status(502).json({ error: 'Falha ao conectar à transmissão', details: error.message });
  }
}

module.exports = {
  handleStreamProxy
};
