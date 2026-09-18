const axios = require('axios');
const xml2js = require('xml2js');

const parser = new xml2js.Parser({ explicitArray: false, trim: true });

const GIST_URLS = {
  channels: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/channels.xml',
  series: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/SeriesBase',
  animes: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/AnimesBase',
  desenhos: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/DesenhosBase',
  doramas: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/DoramasBase',
  novelas: 'https://gist.githubusercontent.com/skyrisk/07f1f4cd1b203cbf2efec959c4e8645a/raw/novelas.xml'
};

const cache = {};
const CACHE_TTL = 1000 * 60 * 60; // 1 hora

function cleanKodiText(str) {
  if (!str) return '';
  return str
    .replace(/\[\/?B\]/gi, '')
    .replace(/\[COLOR\s+[a-zA-Z0-9#]+\]/gi, '')
    .replace(/\[\/COLOR\]/gi, '')
    .replace(/\[CR\]/gi, ' ')
    .trim();
}

function parseInfo(infoStr) {
  const result = { rating: '', genre: '', year: '', synopsis: '' };
  if (!infoStr) return result;

  const clean = cleanKodiText(infoStr);

  const ratingMatch = clean.match(/Avalia[çc][ãa]o:\s*([0-9.]+)/i);
  if (ratingMatch) result.rating = ratingMatch[1];

  const genreMatch = clean.match(/G[êe]nero:\s*([^\n]+?)(?:Lan[çc]amento:|Sinopse:|$)/i);
  if (genreMatch) result.genre = genreMatch[1].trim();

  const yearMatch = clean.match(/Lan[çc]amento:\s*([0-9\/]+)/i);
  if (yearMatch) result.year = yearMatch[1].trim();

  const synMatch = clean.match(/Sinopse:\s*([\s\S]+)$/i);
  if (synMatch) {
    result.synopsis = synMatch[1].trim();
  } else {
    result.synopsis = clean
      .replace(/Avalia[çc][ãa]o:[^\n]*/i, '')
      .replace(/G[êe]nero:[^\n]*/i, '')
      .replace(/Lan[çc]amento:[^\n]*/i, '')
      .trim();
  }

  return result;
}

function resolveChannelStream(link) {
  if (!link) return null;
  
  if (link.startsWith('chresolver1=')) {
    const channelId = link.replace('chresolver1=', '').split('#')[0];
    const streamUrl = `http://s.apkwuv.xyz/live/demopadexchange/demopad/${channelId}.m3u8`;
    const ua = 'Dalvik/2.1.0 (Linux; U; Android 9; SM-S908E Build/TP1A.220624.014)';
    return `/api/proxy/stream?url=${encodeURIComponent(streamUrl)}&ua=${encodeURIComponent(ua)}`;
  }

  if (link.startsWith('http://') || link.startsWith('https://')) {
    return `/api/proxy/stream?url=${encodeURIComponent(link)}`;
  }

  return null;
}

async function getChannels() {
  if (cache.channels && Date.now() - cache.channels.timestamp < CACHE_TTL) {
    return cache.channels.data;
  }

  const res = await axios.get(GIST_URLS.channels, { timeout: 15000 });
  const sanitized = res.data.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
  const parsed = await parser.parseStringPromise(sanitized);

  const categories = {};
  let currentCategory = 'Geral';

  const channelSections = [];
  if (parsed.channels && parsed.channels.channel_1 && parsed.channels.channel_1.item) {
    channelSections.push(...(Array.isArray(parsed.channels.channel_1.item) ? parsed.channels.channel_1.item : [parsed.channels.channel_1.item]));
  }
  if (parsed.channels && parsed.channels.channel_2 && parsed.channels.channel_2.item) {
    channelSections.push(...(Array.isArray(parsed.channels.channel_2.item) ? parsed.channels.channel_2.item : [parsed.channels.channel_2.item]));
  }

  for (const item of channelSections) {
    const rawTitle = item.title || '';
    const cleanTitle = cleanKodiText(rawTitle);

    if (rawTitle.includes('|||') || rawTitle.includes('CATEGORIA') || (!item.link && !item.thumbnail)) {
      currentCategory = cleanTitle.replace(/\|/g, '').replace(/CATEGORIA:?/i, '').trim();
      if (!currentCategory) currentCategory = 'Variedades';
      if (!categories[currentCategory]) categories[currentCategory] = [];
      continue;
    }

    if (!categories[currentCategory]) {
      categories[currentCategory] = [];
    }

    const streamUrl = resolveChannelStream(item.link);
    if (!streamUrl && !item.link) continue;

    categories[currentCategory].push({
      id: item.epgid || Buffer.from(cleanTitle).toString('hex').slice(0, 10),
      title: cleanTitle,
      category: currentCategory,
      rawLink: item.link || '',
      streamUrl: streamUrl || item.link,
      thumbnail: item.thumbnail || 'https://i.imgur.com/dRfcHTf.jpg'
    });
  }

  cache.channels = { data: categories, timestamp: Date.now() };
  return categories;
}

async function getCatalog(categoryKey) {
  if (!GIST_URLS[categoryKey]) {
    throw new Error('Categoria inválida: ' + categoryKey);
  }

  if (cache[categoryKey] && Date.now() - cache[categoryKey].timestamp < CACHE_TTL) {
    return cache[categoryKey].data;
  }

  const res = await axios.get(GIST_URLS[categoryKey], { timeout: 25000 });
  const sanitized = res.data.replace(/&(?!(amp|lt|gt|quot|apos);)/g, '&amp;');
  const parsed = await parser.parseStringPromise(sanitized);

  const items = [];
  const rawItems = (parsed.channels && parsed.channels.channel) ? 
    (Array.isArray(parsed.channels.channel) ? parsed.channels.channel : [parsed.channels.channel]) : [];

  for (const item of rawItems) {
    const cleanTitle = cleanKodiText(item.name || item.title || '');
    const info = parseInfo(item.info);

    items.push({
      id: item.content_id || item.tmdb_id || Buffer.from(cleanTitle).toString('hex').slice(0, 12),
      title: cleanTitle,
      originalTitle: item.tmdb_original_name || cleanTitle,
      category: categoryKey,
      poster: item.thumbnail || 'https://image.tmdb.org/t/p/w300_and_h450_bestv2/3o7f2Xjwl5hcoiioR9eGdD9ezHt.jpg',
      backdrop: item.fanart || item.thumbnail || 'https://image.tmdb.org/t/p/w1920_and_h1080_bestv2/vZsXfIDs3A8jzB46cdwusqxRjdI.jpg',
      rating: info.rating || (item.tmdb_id ? '7.5' : ''),
      genre: info.genre || 'Geral',
      year: info.year || item.tmdb_date || '',
      synopsis: info.synopsis || 'Sem sinopse disponível.',
      externalLink: item.externallink || '',
      contentType: item.content_type || categoryKey
    });
  }

  cache[categoryKey] = { data: items, timestamp: Date.now() };
  return items;
}

module.exports = {
  getChannels,
  getCatalog,
  cleanKodiText
};
