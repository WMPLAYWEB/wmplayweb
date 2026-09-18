const axios = require('axios');

let plutoCache = null;
let lastFetch = 0;
const CACHE_TTL = 1000 * 60 * 30; // 30 minutos

const DEVICE_ID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

async function getPlutoChannels() {
  if (plutoCache && (Date.now() - lastFetch < CACHE_TTL)) {
    return plutoCache;
  }

  try {
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    const res = await axios.get('https://api.pluto.tv/v2/channels.json', { headers, timeout: 15000 });
    const data = res.data;
    const channels = [];

    if (Array.isArray(data)) {
      for (const ch of data) {
        if (!ch.stitched || !ch.stitched.urls || ch.stitched.urls.length === 0) continue;
        const channelId = ch._id || ch.id || ch.slug;

        channels.push({
          id: channelId,
          name: ch.name,
          category: ch.category || 'Pluto TV',
          summary: ch.summary || '',
          logo: (ch.colorLogoPNG && ch.colorLogoPNG.path) || (ch.thumbnail && ch.thumbnail.url) || 'https://i.imgur.com/dRfcHTf.jpg',
          streamUrl: `/api/pluto/stream/${channelId}`,
          number: ch.number || ''
        });
      }
    }

    plutoCache = channels;
    lastFetch = Date.now();
    return channels;
  } catch (err) {
    console.error('Erro ao buscar canais Pluto TV:', err.message);
    return plutoCache || [];
  }
}

async function getPlutoStreamUrl(channelId) {
  const bootRes = await axios.get('https://boot.pluto.tv/v4/start', {
    params: {
      appName: 'web',
      appVersion: '9.21.0-bf9f5b4369933742859f3b2581c935110922f642',
      deviceVersion: '148.0.0',
      deviceModel: 'web',
      deviceMake: 'edge-chromium',
      deviceType: 'web',
      clientID: DEVICE_ID,
      clientModelNumber: '1.0.0',
      channelID: channelId,
      serverSideAds: 'false'
    },
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      'Referer': 'https://pluto.tv/',
      'Origin': 'https://pluto.tv'
    },
    timeout: 10000
  });

  const sessionToken = bootRes.data.sessionToken;

  const url = 'https://cfd-v4-service-channel-stitcher-use1-1.prd.pluto.tv/v2/stitch/hls/channel/' + channelId + '/master.m3u8' +
    '?advertisingId=&appName=web&appVersion=9.21.0&app_name=web&clientDeviceType=0&clientID=' + DEVICE_ID +
    '&clientModelNumber=1.0.0&country=BR&deviceDNT=false&deviceId=' + DEVICE_ID +
    '&deviceMake=chrome&deviceModel=web&deviceType=web&deviceVersion=148.0.0&marketingRegion=BR&serverSideAds=false&sessionID=' + DEVICE_ID + '&sid=' + DEVICE_ID +
    '&jwt=' + sessionToken + '&masterJWTPassthrough=true';

  return url;
}

module.exports = {
  getPlutoChannels,
  getPlutoStreamUrl
};
