const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const xml2js = require('xml2js');
const urlModule = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
const cookieParser = require('cookie-parser');
app.use(cookieParser());

// --- AUTHENTICATION & USERS STORAGE ---
const USERS_FILE = path.join(__dirname, 'users.json');
let USERS = [
  { username: 'admin', password: 'admin123' },
  { username: 'wmplay', password: 'wmplay2026' },
  { username: 'usuario', password: 'senha123' }
];

function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      USERS = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    } else {
      fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2), 'utf8');
    }
  } catch (e) {
    console.error('Erro ao carregar users.json:', e.message);
  }
}
loadUsers();

function saveUsers() {
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(USERS, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar users.json:', e.message);
  }
}

const AUTH_SESSIONS = {};

function generateSessionId() {
  return Buffer.from(Date.now() + '-' + Math.random().toString(36).slice(2)).toString('hex');
}

// Autenticação desativada - acesso direto e aberto a todo o conteúdo
function authMiddleware(req, res, next) {
  return next();
}


// ==========================================
// 1. SERVICES EMBEDDED
// ==========================================

// --- BRAZUCA PARSER ---
const parser = new xml2js.Parser({ explicitArray: false, trim: true });
const GIST_URLS = {
  channels: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/channels.xml',
  series: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/SeriesBase',
  animes: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/AnimesBase',
  desenhos: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/DesenhosBase',
  doramas: 'https://gist.githubusercontent.com/skyrisk/16070347f20c87c72540f9f805b57a66/raw/DoramasBase',
  novelas: 'https://gist.githubusercontent.com/skyrisk/07f1f4cd1b203cbf2efec959c4e8645a/raw/novelas.xml',
  filmes: 'https://gist.githubusercontent.com/skyrisk/5b87797329c7b46422565ffbaab3be7e/raw/lancamentos.xml'
};
const brazucaCache = {};
const CACHE_TTL = 1000 * 60 * 60; // 1 hora na RAM

// --- CACHE EM DISCO (Persistente para Carregamento Instantâneo) ---
const CACHE_DIR = path.join(__dirname, 'data_cache');
if (!fs.existsSync(CACHE_DIR)) {
  try { fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch (e) {}
}

function getDiskCache(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    if (fs.existsSync(file)) {
      const stats = fs.statSync(file);
      // Válido por 24 horas
      if (Date.now() - stats.mtimeMs < 24 * 60 * 60 * 1000) {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
      }
    }
  } catch (e) {}
  return null;
}

function setDiskCache(key, data) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`);
    fs.writeFileSync(file, JSON.stringify(data));
  } catch (e) {}
}

function cleanKodiText(str) {
  if (!str) return '';
  return str.replace(/\[\/?B\]/gi, '').replace(/\[COLOR\s+[a-zA-Z0-9#]+\]/gi, '').replace(/\[\/COLOR\]/gi, '').replace(/\[CR\]/gi, ' ').trim();
}

function parseInfo(infoStr) {
  const result = { rating: '', genre: '', year: '', synopsis: '' };
  if (!infoStr) return result;
  const clean = cleanKodiText(infoStr);
  const ratingMatch = clean.match(/Avalia[çc][ãa]o:\s*([0-9.]+)/i);
  if (ratingMatch) result.rating = ratingMatch[1];
  const genreMatch = clean.match(/G[êe]neros?:\s*([^\n]+?)(?:Lan[çc]amento:|Sinopse:|$)/i);
  if (genreMatch) result.genre = genreMatch[1].trim();
  const yearMatch = clean.match(/Lan[çc]amento:\s*([0-9\/]+)/i);
  if (yearMatch) result.year = yearMatch[1].trim();
  const sinopseMatch = clean.match(/Sinopse:\s*([\s\S]*?)(?:Lan[çc]amento:|Avalia[çc][ãa]o:|G[êe]neros?:|$)/i);
  if (sinopseMatch) result.synopsis = sinopseMatch[1].trim();
  return result;
}

const chHosts = {
  '1': 'http://sixcine.store:80/live/%s/%s.m3u8',
  '2': 'http://bttv.lat:80/live/%s/%s.m3u8'
};
const chAccounts = {
  '1': ['468489339/355818635', '254959548/138442946', '338899111/421696680', '231426366/687653441', '276842566/138235928'],
  '2': ['lvieira/8574068490', 'Dirlan345/Asd12', 'Bruno14pc/6qaz36281vu', 'Wellington015/Fnsiptv22', 'Carol519S/Tc71']
};

function resolveChannelStream(rawLink) {
  if (!rawLink) return null;
  const link = rawLink.trim();
  if (link.startsWith('http://') || link.startsWith('https://')) {
    const cleanUrl = link.split('|')[0];
    return `/api/proxy/stream?url=${encodeURIComponent(cleanUrl)}`;
  }
  if (link.startsWith('chresolver1=')) {
    const clean = link.replace('chresolver1=', '').trim();
    const parts = clean.split('#');
    const chId = parts[0];
    const serverId = parts[1] || '1';
    const hostTemplate = chHosts[serverId] || chHosts['1'];
    const accList = chAccounts[serverId] || chAccounts['1'];
    const acc = accList[0];
    const streamUrl = hostTemplate.replace('%s', acc).replace('%s', chId);
    return `/api/proxy/stream?url=${encodeURIComponent(streamUrl)}&ua=XC-IPTV`;
  }
  return null;
}

async function getChannels() {
  if (brazucaCache.channels && (Date.now() - brazucaCache.channels.timestamp < CACHE_TTL)) {
    return brazucaCache.channels.data;
  }
  const disk = getDiskCache('channels');
  if (disk) {
    brazucaCache.channels = { data: disk, timestamp: Date.now() };
    return disk;
  }
  const res = await axios.get(GIST_URLS.channels, { timeout: 20000 });
  const rawXml = res.data;

  // Extrai hosts e credenciais atualizados do XML se presentes
  const host1Match = rawXml.match(/<hostname_1>(.*?)<\/hostname_1>/);
  const users1Match = rawXml.match(/<users_1>(.*?)<\/users_1>/);
  const host2Match = rawXml.match(/<hostname_2>(.*?)<\/hostname_2>/);
  const users2Match = rawXml.match(/<users_2>(.*?)<\/users_2>/);

  if (host1Match) {
    try { chHosts['1'] = Buffer.from(host1Match[1], 'base64').toString('utf8'); } catch(e){}
  }
  if (users1Match) {
    try { chAccounts['1'] = Buffer.from(users1Match[1], 'base64').toString('utf8').split('|'); } catch(e){}
  }
  if (host2Match) {
    try { chHosts['2'] = Buffer.from(host2Match[1], 'base64').toString('utf8'); } catch(e){}
  }
  if (users2Match) {
    try { chAccounts['2'] = Buffer.from(users2Match[1], 'base64').toString('utf8').split('|'); } catch(e){}
  }

  const sanitized = rawXml.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
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
    if (!categories[currentCategory]) categories[currentCategory] = [];
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
  setDiskCache('channels', categories);
  brazucaCache.channels = { data: categories, timestamp: Date.now() };
  return categories;
}

async function getCatalog(categoryKey) {
  if (!GIST_URLS[categoryKey]) throw new Error('Categoria inválida: ' + categoryKey);
  if (brazucaCache[categoryKey] && (Date.now() - brazucaCache[categoryKey].timestamp < CACHE_TTL)) {
    return brazucaCache[categoryKey].data;
  }
  const disk = getDiskCache('catalog_' + categoryKey);
  if (disk) {
    brazucaCache[categoryKey] = { data: disk, timestamp: Date.now() };
    return disk;
  }
  const res = await axios.get(GIST_URLS[categoryKey], { timeout: 25000 });
  const sanitized = res.data.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
  const parsed = await parser.parseStringPromise(sanitized);
  const items = [];
  const rawItems = (parsed.channels && parsed.channels.channel) ? 
    (Array.isArray(parsed.channels.channel) ? parsed.channels.channel : [parsed.channels.channel]) : [];

  for (const item of rawItems) {
    const cleanTitle = cleanKodiText(item.name || item.title || '');
    const info = parseInfo(item.info);
    items.push({
      id: item.content_id || item.tmdb_id || Buffer.from(cleanTitle).toString('hex').slice(0, 12),
      tmdbId: item.tmdb_id || null,
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
  setDiskCache('catalog_' + categoryKey, items);
  brazucaCache[categoryKey] = { data: items, timestamp: Date.now() };
  return items;
}

// --- PLUTO SERVICE ---
let plutoCache = null;
let lastPlutoFetch = 0;
const PLUTO_CACHE_TTL = 1000 * 60 * 30;
const DEVICE_ID = 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d';

async function getPlutoChannels() {
  if (plutoCache && (Date.now() - lastPlutoFetch < PLUTO_CACHE_TTL)) return plutoCache;
  const res = await axios.get('https://api.pluto.tv/v2/channels.json', {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000
  });
  const data = res.data;
  const channels = data.filter(ch => ch.isStitched).map(ch => ({
    id: ch._id,
    slug: ch.slug,
    name: ch.name,
    number: ch.number,
    category: ch.category || 'Geral',
    summary: ch.summary,
    logo: ch.colorLogoPNG ? ch.colorLogoPNG.path : (ch.logo ? ch.logo.path : ''),
    streamUrl: `/api/pluto/stream/${ch._id}`
  }));
  plutoCache = channels;
  lastPlutoFetch = Date.now();
  return channels;
}

async function getPlutoStreamUrl(channelId) {
  const bootRes = await axios.get('https://boot.pluto.tv/v4/start', {
    params: {
      appName: 'web',
      appVersion: 'na',
      deviceVersion: 'na',
      deviceModel: 'web',
      deviceMake: 'chrome',
      deviceType: 'web',
      clientID: DEVICE_ID,
      clientModelNumber: 'na'
    },
    headers: { 'User-Agent': 'Mozilla/5.0' },
    timeout: 15000
  });
  const sessionToken = bootRes.data.sessionToken;
  const servers = bootRes.data.servers || {};
  let stitcherUrl = servers.stitcher || 'https://stitcher-ipv4.pluto.tv';
  if (stitcherUrl.endsWith('/')) stitcherUrl = stitcherUrl.slice(0, -1);
  return `${stitcherUrl}/stitch/hls/channel/${channelId}/master.m3u8?jwt=${sessionToken}&deviceType=web&deviceMake=chrome&deviceId=${DEVICE_ID}&deviceModel=web&sid=${DEVICE_ID}&clientModelNumber=na&serverSideAds=false`;
}

// --- STREAM PROXY ---
async function handleStreamProxy(req, res) {
  const targetUrl = req.query.url;
  const customUa = req.query.ua || 'Mozilla/5.0';
  if (!targetUrl) return res.status(400).send('URL de stream ausente');
  try {
    const headers = { 'User-Agent': customUa, 'Accept': '*/*' };
    if (targetUrl.includes('pluto.tv')) {
      headers['Referer'] = 'https://pluto.tv/';
      headers['Origin'] = 'https://pluto.tv';
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

    const response = await axios({ method: 'get', url: targetUrl, headers, responseType: 'stream', timeout: 15000 });
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    if (response.headers['content-type']) res.setHeader('Content-Type', response.headers['content-type']);
    response.data.pipe(res);
  } catch (error) {
    res.status(502).json({ error: 'Falha ao conectar à transmissão', details: error.message });
  }
}

// --- EPISODE RESOLVER ---
const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXNvbHZlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc5MDk4OTczfQ.WzQBuOqMai96Afleh9g-i7NXo6h-YsjPUbOgxlUqVsU';
const RESOLVER_API = 'https://api.geekantenado.online/?resolver=';
const episodeCache = {};

async function callGeekResolver(paramsStr) {
  try {
    const payload = encodeURIComponent(Buffer.from(paramsStr).toString('base64'));
    const url = RESOLVER_API + payload;
    const res = await axios.get(url, { headers: { 'Authorization': 'Bearer ' + TOKEN }, timeout: 12000 });
    if (res.data && res.data.result) {
      const rawResult = res.data.result;
      if (rawResult === 'episode not found!' || rawResult === 'API Under Maintenance') return null;
      let decoded = null;
      try { decoded = Buffer.from(rawResult, 'base64').toString('utf8'); } catch { decoded = rawResult; }
      try { return JSON.parse(decoded); } catch { return decoded; }
    }
  } catch (e) {}
  return null;
}

function extractCandidateSlugs(externalLink, mediaTitle) {
  const candidates = new Set();
  if (externalLink) {
    const parts = externalLink.split('|');
    for (const part of parts) {
      let s = null;
      if (part.includes('resolver3_tvshows=')) s = part.split('resolver3_tvshows=')[1];
      else if (part.includes('tvshows=')) s = part.split('tvshows=')[1];
      else if (part.includes('serie3=')) s = part.split('serie3=')[1];
      else if (!part.includes('=') && !part.includes('/') && part.length > 2) s = part;
      if (s) {
        s = s.split('#')[0].split('&')[0].trim();
        const clean = s.replace(/-dublado-\d+/, '').replace(/-legendado-\d+/, '').replace(/-\d{4,}$/, '').trim();
        if (clean) candidates.add(clean);
        candidates.add(s);
      }
    }
  }
  if (mediaTitle) {
    const cleanTitle = mediaTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    candidates.add(cleanTitle.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    const matchParen = cleanTitle.match(/^([^(]+)\(([^)]+)\)/);
    if (matchParen) {
      candidates.add(matchParen[1].trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
      candidates.add(matchParen[2].trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''));
    }
  }
  return Array.from(candidates).filter(c => c && c.length > 1).sort((a, b) => {
    const isBogusA = /\d{8,}/.test(a) || a.length > 25;
    const isBogusB = /\d{8,}/.test(b) || b.length > 25;
    if (isBogusA && !isBogusB) return 1;
    if (!isBogusA && isBogusB) return -1;
    return 0;
  });
}

async function getSeasonsAndEpisodes(externalLink, mediaTitle) {
  if (!externalLink) return [];
  const cacheKey = `${externalLink}_${mediaTitle || ''}`;
  if (episodeCache[cacheKey]) return episodeCache[cacheKey];

  const seasonsResult = [];
  try {
    const candidates = extractCandidateSlugs(externalLink, mediaTitle);
    for (const cleanSlug of candidates) {
      const data = await callGeekResolver(`{'resolver': 3, 'request': 'tvshows=${cleanSlug}'}`);
      if (data && typeof data === 'object' && Object.keys(data).length > 0) {
        const seasonKeys = Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b));
        for (const sKey of seasonKeys) {
          const sData = data[sKey];
          const episodesObj = sData.episodes || {};
          const epKeys = Object.keys(episodesObj).sort((a, b) => parseInt(a) - parseInt(b));
          const epList = [];
          for (const epNum of epKeys) {
            const epInfo = episodesObj[epNum] || {};
            const lang = epInfo.dual_audio ? 'Dublado' : (sData.has_dual_audio ? 'Dublado' : 'Dublado');
            epList.push({
              number: epNum,
              title: epInfo.title || `Episódio ${epNum}`,
              streamId: `${cleanSlug}#${sKey}#${epNum}#${lang}`,
              type: 'resolver3'
            });
          }
          seasonsResult.push({ season: sKey, name: `${sKey}ª Temporada`, episodes: epList });
        }
        if (seasonsResult.length > 0) break;
      }
    }

    if (seasonsResult.length === 0 && externalLink && externalLink.includes('resolver2_tvshows=')) {
      let r2Link = externalLink.split('resolver2_tvshows=')[1].split('|')[0].split('&')[0].trim();
      if (!r2Link.includes('#')) r2Link = 'serie#' + r2Link;
      const r2Data = await callGeekResolver(`{'resolver': 2, 'request':'tvshows=${r2Link}'}`);
      if (Array.isArray(r2Data) && r2Data.length > 0) {
        for (const sItem of r2Data) {
          const sNum = String(sItem.season_number);
          const epList = (sItem.episodes || []).map(ep => ({
            number: String(ep.episode_number),
            title: ep.episode_name ? `Episódio ${ep.episode_number} - ${ep.episode_name}` : `Episódio ${ep.episode_number}`,
            streamId: ep.link,
            type: 'direct_url'
          }));
          seasonsResult.push({ season: sNum, name: `${sNum}ª Temporada`, episodes: epList });
        }
      }
    }

    if (seasonsResult.length === 0 && externalLink.includes('animes3=')) {
      const animeSlug = externalLink.split('animes3=')[1].split('|')[0].split('#')[0];
      const pageRes = await axios.get('https://animesonlinecc.to/anime/' + animeSlug, {
        headers: { 'User-Agent': 'Mozilla/5.0' },
        timeout: 10000
      });
      const html = pageRes.data;
      const seasonMatches = html.match(/<div class="se-c">([\s\S]*?)<\/div><\/div>/g) || [];
      if (seasonMatches.length > 0) {
        let sCount = 1;
        for (const sHtml of seasonMatches) {
          const titleMatch = sHtml.match(/<span class="title">([^<]+)<\/span>/);
          const sTitle = titleMatch ? titleMatch[1].trim() : `${sCount}ª Temporada`;
          const epMatches = [...sHtml.matchAll(/<a href="([^"]+)">([^<]+)<\/a>/g)];
          const epList = [];
          let epNum = 1;
          for (const match of epMatches) {
            const epUrl = match[1];
            const epTitle = match[2].trim();
            if (epUrl.includes('/episodio/')) {
              epList.push({ number: String(epNum++), title: epTitle || `Episódio ${epNum}`, streamId: epUrl, type: 'direct_url' });
            }
          }
          if (epList.length > 0) seasonsResult.push({ season: String(sCount++), name: sTitle, episodes: epList });
        }
      }
    }

    if (seasonsResult.length === 0) {
      seasonsResult.push({
        season: '1',
        name: '1ª Temporada',
        episodes: [{ number: '1', title: 'Episódio 1', streamId: externalLink, type: 'general' }]
      });
    }

    episodeCache[cacheKey] = seasonsResult;
    return seasonsResult;
  } catch (err) {
    return [{ season: '1', name: '1ª Temporada', episodes: [{ number: '1', title: 'Episódio 1', streamId: externalLink, type: 'general' }] }];
  }
}

async function resolveStreamUrl(streamId, type = 'resolver3') {
  if (!streamId) return null;
  try {
    if (type === 'resolver3' || streamId.includes('#')) {
      let streamUrl = await callGeekResolver(`{'resolver': 3, 'request': 'episodes=${streamId}'}`);
      if (!streamUrl && streamId.includes('#Dublado')) {
        streamUrl = await callGeekResolver(`{'resolver': 3, 'request': 'episodes=${streamId.replace('#Dublado', '#Legendado')}'}`);
      }
      if (!streamUrl && streamId.includes('#Dublado')) {
        streamUrl = await callGeekResolver(`{'resolver': 3, 'request': 'episodes=${streamId.replace('#Dublado', '#Nacional')}'}`);
      }
      if (streamUrl && typeof streamUrl === 'string' && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
        return streamUrl;
      }
    }
    if (streamId.startsWith('http://') || streamId.startsWith('https://')) {
      if (streamId.includes('animesonlinecc.to/episodio/')) {
        try {
          const pageRes = await axios.get(streamId, { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 8000 });
          const m = pageRes.data.match(/<iframe[^>]+src=["']([^"']+)["']/i) || pageRes.data.match(/<div id="option-[^"]*"[^>]*src=["']([^"']+)["']/i);
          if (m && m[1]) return m[1];
        } catch (e) {}
      }
      return streamId;
    }
    return null;
  } catch (err) {
    return null;
  }
}

// ==========================================
// 2. FRONTEND ASSETS FALLBACK (INLINE)
// ==========================================
const hasPublicDir = fs.existsSync(path.join(__dirname, 'public', 'index.html'));

if (hasPublicDir) {
  app.use(express.static(path.join(__dirname, 'public')));
} else {
  console.log('Pasta public/ externa não detectada. Usando frontend embutido!');
  const EMBEDDED_HTML = "<!DOCTYPE html>\n<html lang=\"pt-BR\">\n<head>\n  <meta charset=\"UTF-8\">\n  <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n  <title>WMPlayWeb - Filmes, Séries, Desenhos, Canais & Animes</title>\n  <link rel=\"icon\" type=\"image/png\" href=\"https://i.imgur.com/BfFiAAy.png\">\n  <link rel=\"preconnect\" href=\"https://fonts.googleapis.com\">\n  <link rel=\"preconnect\" href=\"https://fonts.gstatic.com\" crossorigin>\n  <link href=\"https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap\" rel=\"stylesheet\">\n  <!-- HLS.js para reprodução de streams .m3u8 no navegador -->\n  <script src=\"https://cdn.jsdelivr.net/npm/hls.js@latest\"></script>\n  <!-- Feather Icons -->\n  <script src=\"https://unpkg.com/feather-icons\"></script>\n  <link rel=\"stylesheet\" href=\"/css/style.css\">\n</head>\n<body>\n  <!-- Header / Barra de Navegação Superior -->\n  <header class=\"navbar\">\n    <div class=\"nav-container\">\n      <div class=\"brand\">\n        <img src=\"https://i.imgur.com/kjtlfSP.png\" alt=\"WMPlayWeb\" class=\"brand-logo\">\n        <div class=\"brand-text\">\n          <span class=\"brand-title\">WM<span class=\"highlight\">PLAY</span></span>\n          <span class=\"brand-badge\">WEB</span>\n        </div>\n      </div>\n\n      <nav class=\"nav-menu\">\n        <button class=\"nav-item active\" data-category=\"home\"><i data-feather=\"home\"></i> Início</button>\n        <button class=\"nav-item\" data-category=\"channels\"><i data-feather=\"tv\"></i> Canais Ao Vivo</button>\n        <button class=\"nav-item\" data-category=\"pluto\"><i data-feather=\"play-circle\"></i> Pluto TV</button>\n        <button class=\"nav-item\" data-category=\"series\"><i data-feather=\"film\"></i> Séries</button>\n        <button class=\"nav-item\" data-category=\"animes\"><i data-feather=\"video\"></i> Animes</button>\n        <button class=\"nav-item\" data-category=\"desenhos\"><i data-feather=\"smile\"></i> Desenhos</button>\n        <button class=\"nav-item\" data-category=\"novelas\"><i data-feather=\"book-open\"></i> Novelas</button>\n        <button class=\"nav-item\" data-category=\"doramas\"><i data-feather=\"heart\"></i> Doramas</button>\n      </nav>\n\n      <div class=\"nav-actions\">\n        <div class=\"search-box\">\n          <i data-feather=\"search\" class=\"search-icon\"></i>\n          <input type=\"text\" id=\"searchInput\" placeholder=\"Pesquisar títulos ou canais...\">\n          <button id=\"clearSearchBtn\" class=\"clear-btn\" style=\"display:none;\"><i data-feather=\"x\"></i></button>\n        </div>\n      </div>\n    </div>\n  </header>\n\n  <!-- Destaque / Hero Banner -->\n  <section class=\"hero-banner\" id=\"heroBanner\">\n    <div class=\"hero-backdrop\" id=\"heroBackdrop\"></div>\n    <div class=\"hero-overlay\"></div>\n    <div class=\"hero-content\">\n      <div class=\"hero-badges\">\n        <span class=\"badge badge-gold\" id=\"heroRating\">★ 8.5</span>\n        <span class=\"badge badge-blue\" id=\"heroYear\">2024</span>\n        <span class=\"badge badge-purple\" id=\"heroGenre\">Ação, Aventura</span>\n      </div>\n      <h1 class=\"hero-title\" id=\"heroTitle\">Carregando catálogo WMPlayWeb...</h1>\n      <p class=\"hero-synopsis\" id=\"heroSynopsis\">Acesse centenas de canais ao vivo, filmes, séries, desenhos, novelas e animes diretamente pelo seu navegador, sem precisar instalar o Kodi.</p>\n      <div class=\"hero-actions\">\n        <button class=\"btn btn-primary\" id=\"heroPlayBtn\"><i data-feather=\"play\"></i> Assistir Agora</button>\n        <button class=\"btn btn-secondary\" id=\"heroInfoBtn\"><i data-feather=\"info\"></i> Ver Detalhes</button>\n      </div>\n    </div>\n  </section>\n\n  <!-- Filtros Secundários de Canais / Categorias -->\n  <div class=\"subnav-container\" id=\"subnavContainer\" style=\"display: none;\">\n    <div class=\"subnav-scroll\" id=\"subnavPills\"></div>\n  </div>\n\n  <!-- Área Principal de Conteúdo -->\n  <main class=\"main-container\">\n    <!-- Estado de Carregamento -->\n    <div class=\"loading-state\" id=\"loadingState\">\n      <div class=\"spinner\"></div>\n      <p>Sincronizando conteúdos do repositório WMPlayWeb...</p>\n    </div>\n\n    <!-- Título da Seção Ativa -->\n    <div class=\"section-header\" id=\"sectionHeader\">\n      <h2 id=\"sectionTitle\">Conteúdos em Destaque</h2>\n      <span class=\"count-badge\" id=\"sectionCount\">0 itens</span>\n    </div>\n\n    <!-- Grade de Itens (Cards / Canais) -->\n    <div class=\"content-grid\" id=\"contentGrid\"></div>\n\n    <!-- Mensagem de Nenhum Resultado -->\n    <div class=\"empty-state\" id=\"emptyState\" style=\"display: none;\">\n      <i data-feather=\"alert-circle\"></i>\n      <h3>Nenhum conteúdo encontrado</h3>\n      <p>Tente usar outros termos de pesquisa ou selecionar outra categoria.</p>\n    </div>\n  </main>\n\n  <!-- Modal do Player de Vídeo -->\n  <div class=\"player-modal\" id=\"playerModal\">\n    <div class=\"player-container\">\n      <div class=\"player-header\">\n        <div class=\"player-info\">\n          <span class=\"live-tag\" id=\"playerLiveTag\"><span class=\"pulse\"></span> AO VIVO</span>\n          <h3 id=\"playerTitle\">Reproduzindo Vídeo</h3>\n        </div>\n        <button class=\"close-player-btn\" id=\"closePlayerBtn\" title=\"Fechar Player\"><i data-feather=\"x\"></i></button>\n      </div>\n      \n      <div class=\"video-wrapper\">\n        <video id=\"videoPlayer\" controls autoplay playsinline></video>\n        <iframe id=\"embedPlayer\" style=\"display:none; width:100%; height:100%; border:none;\" allowfullscreen allow=\"autoplay; fullscreen\"></iframe>\n        <div class=\"player-loading\" id=\"playerLoading\">\n          <div class=\"spinner\"></div>\n          <span id=\"playerLoadingText\">Carregando transmissão...</span>\n        </div>\n        <div class=\"player-error\" id=\"playerError\" style=\"display:none;\">\n          <i data-feather=\"alert-triangle\"></i>\n          <p id=\"playerErrorMsg\">Não foi possível carregar o sinal deste canal ou vídeo.</p>\n          <button class=\"btn btn-primary btn-sm\" id=\"retryStreamBtn\"><i data-feather=\"refresh-cw\"></i> Tentar Novamente</button>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <!-- Modal de Detalhes da Mídia -->\n  <div class=\"details-modal\" id=\"detailsModal\">\n    <div class=\"details-card\">\n      <button class=\"close-modal-btn\" id=\"closeDetailsBtn\"><i data-feather=\"x\"></i></button>\n      <div class=\"details-banner\" id=\"detailsBanner\">\n        <div class=\"details-banner-overlay\"></div>\n      </div>\n      <div class=\"details-body\">\n        <div class=\"details-meta\">\n          <span class=\"badge badge-gold\" id=\"modalRating\">★ 8.0</span>\n          <span class=\"badge badge-blue\" id=\"modalYear\">2023</span>\n          <span class=\"badge badge-dark\" id=\"modalCategory\">Série</span>\n          <span class=\"badge badge-purple\" id=\"modalGenre\">Drama</span>\n        </div>\n        <h2 id=\"modalTitle\">Título da Obra</h2>\n        <p class=\"modal-synopsis\" id=\"modalSynopsis\">Sinopse detalhada do conteúdo selecionado.</p>\n        <div class=\"modal-actions\">\n          <button class=\"btn btn-primary\" id=\"modalPlayBtn\"><i data-feather=\"play\"></i> Assistir Agora</button>\n        </div>\n\n        <!-- Seção de Temporadas e Episódios -->\n        <div class=\"seasons-section\" id=\"seasonsSection\">\n          <div class=\"seasons-header\">\n            <div class=\"seasons-header-title\">\n              <i data-feather=\"layers\"></i>\n              <h3>Temporadas e Episódios</h3>\n            </div>\n            <span class=\"seasons-badge\" id=\"seasonsCountBadge\">0 Temporadas</span>\n          </div>\n          \n          <!-- Loading de Episódios -->\n          <div class=\"episodes-loading\" id=\"episodesLoading\">\n            <div class=\"spinner-sm\"></div>\n            <span>Carregando lista de episódios...</span>\n          </div>\n\n          <!-- Seletor de Temporadas -->\n          <div class=\"season-pills\" id=\"seasonPills\"></div>\n\n          <!-- Grade de Episódios -->\n          <div class=\"episodes-grid\" id=\"episodesGrid\"></div>\n        </div>\n      </div>\n    </div>\n  </div>\n\n  <!-- Rodapé -->\n  <footer class=\"footer\">\n    <div class=\"footer-content\">\n      <div class=\"footer-brand\">\n        <h3>WMPlayWeb</h3>\n        <p>Interface Web Standalone para streaming de filmes, séries, canais de TV e animes diretamente pelo seu navegador.</p>\n      </div>\n      <div class=\"footer-status\">\n        <span class=\"status-indicator online\"></span>\n        <span>Servidor Online & Conectado aos Repositórios</span>\n      </div>\n    </div>\n    <div class=\"footer-bottom\">\n      <p>&copy; 2026 WMPlayWeb. Criado para compatibilidade universal sem necessidade do Kodi.</p>\n    </div>\n  </footer>\n\n  <script src=\"/js/player.js\"></script>\n  <script src=\"/js/app.js\"></script>\n  <script>\n    feather.replace();\n  </script>\n</body>\n</html>\n";
  const EMBEDDED_CSS = ":root {\n  --bg-dark: #090d12;\n  --bg-card: #121822;\n  --bg-card-hover: #1a2230;\n  --bg-nav: rgba(15, 21, 30, 0.92);\n  --border: #1f2937;\n  --border-light: rgba(255, 255, 255, 0.08);\n  --text: #f3f4f6;\n  --text-muted: #9ca3af;\n  --primary: #3b82f6;\n  --primary-hover: #2563eb;\n  --accent-gold: #f59e0b;\n  --accent-purple: #8b5cf6;\n  --accent-red: #ef4444;\n  --shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.5);\n  --radius-sm: 8px;\n  --radius-md: 12px;\n  --radius-lg: 18px;\n  --transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);\n}\n\n* {\n  margin: 0;\n  padding: 0;\n  box-sizing: border-box;\n}\n\nbody {\n  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;\n  background-color: var(--bg-dark);\n  color: var(--text);\n  line-height: 1.5;\n  overflow-x: hidden;\n  min-height: 100vh;\n}\n\n/* Scrollbar Personalizada */\n::-webkit-scrollbar {\n  width: 8px;\n  height: 8px;\n}\n::-webkit-scrollbar-track {\n  background: var(--bg-dark);\n}\n::-webkit-scrollbar-thumb {\n  background: #273344;\n  border-radius: 4px;\n}\n::-webkit-scrollbar-thumb:hover {\n  background: var(--primary);\n}\n\n/* NAVBAR */\n.navbar {\n  position: sticky;\n  top: 0;\n  z-index: 100;\n  background: var(--bg-nav);\n  backdrop-filter: blur(16px);\n  -webkit-backdrop-filter: blur(16px);\n  border-bottom: 1px solid var(--border-light);\n  padding: 12px 0;\n}\n\n.nav-container {\n  max-width: 1400px;\n  margin: 0 auto;\n  padding: 0 24px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  gap: 20px;\n}\n\n.brand {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n  cursor: pointer;\n  text-decoration: none;\n}\n\n.brand-logo {\n  height: 38px;\n  width: 38px;\n  border-radius: var(--radius-sm);\n  object-fit: cover;\n  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);\n}\n\n.brand-title {\n  font-weight: 800;\n  font-size: 1.25rem;\n  letter-spacing: -0.5px;\n  color: #ffffff;\n}\n\n.brand-title .highlight {\n  color: var(--primary);\n}\n\n.brand-badge {\n  background: linear-gradient(135deg, var(--accent-gold), #ea580c);\n  color: #000;\n  font-size: 0.65rem;\n  font-weight: 800;\n  padding: 2px 6px;\n  border-radius: 4px;\n  margin-left: 6px;\n  letter-spacing: 0.5px;\n}\n\n.nav-menu {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  overflow-x: auto;\n  padding-bottom: 4px;\n}\n\n.nav-item {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  padding: 8px 14px;\n  border-radius: var(--radius-md);\n  background: transparent;\n  border: none;\n  color: var(--text-muted);\n  font-size: 0.88rem;\n  font-weight: 600;\n  cursor: pointer;\n  transition: var(--transition);\n  white-space: nowrap;\n}\n\n.nav-item svg {\n  width: 16px;\n  height: 16px;\n}\n\n.nav-item:hover {\n  color: #ffffff;\n  background: rgba(255, 255, 255, 0.05);\n}\n\n.nav-item.active {\n  color: #ffffff;\n  background: var(--primary);\n  box-shadow: 0 4px 14px rgba(59, 130, 246, 0.4);\n}\n\n.search-box {\n  position: relative;\n  display: flex;\n  align-items: center;\n  min-width: 260px;\n}\n\n.search-icon {\n  position: absolute;\n  left: 12px;\n  width: 18px;\n  height: 18px;\n  color: var(--text-muted);\n  pointer-events: none;\n}\n\n.search-box input {\n  width: 100%;\n  padding: 9px 36px 9px 38px;\n  border-radius: var(--radius-md);\n  border: 1px solid var(--border);\n  background: #151d29;\n  color: #ffffff;\n  font-size: 0.88rem;\n  outline: none;\n  transition: var(--transition);\n}\n\n.search-box input:focus {\n  border-color: var(--primary);\n  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);\n}\n\n.clear-btn {\n  position: absolute;\n  right: 10px;\n  background: transparent;\n  border: none;\n  color: var(--text-muted);\n  cursor: pointer;\n}\n\n/* HERO BANNER */\n.hero-banner {\n  position: relative;\n  min-height: 480px;\n  max-height: 600px;\n  display: flex;\n  align-items: center;\n  overflow: hidden;\n  border-bottom: 1px solid var(--border-light);\n}\n\n.hero-backdrop {\n  position: absolute;\n  inset: 0;\n  background-size: cover;\n  background-position: center top;\n  filter: brightness(0.65);\n  transition: background-image 0.6s ease-in-out;\n}\n\n.hero-overlay {\n  position: absolute;\n  inset: 0;\n  background: linear-gradient(180deg, rgba(9, 13, 18, 0.2) 0%, rgba(9, 13, 18, 0.85) 70%, #090d12 100%);\n}\n\n.hero-content {\n  position: relative;\n  z-index: 2;\n  max-width: 1400px;\n  width: 100%;\n  margin: 0 auto;\n  padding: 40px 24px;\n}\n\n.hero-badges {\n  display: flex;\n  gap: 8px;\n  margin-bottom: 14px;\n  flex-wrap: wrap;\n}\n\n.badge {\n  font-size: 0.75rem;\n  font-weight: 700;\n  padding: 4px 10px;\n  border-radius: 6px;\n  text-transform: uppercase;\n  letter-spacing: 0.5px;\n}\n\n.badge-gold { background: rgba(245, 158, 11, 0.2); color: var(--accent-gold); border: 1px solid rgba(245, 158, 11, 0.4); }\n.badge-blue { background: rgba(59, 130, 246, 0.2); color: var(--primary); border: 1px solid rgba(59, 130, 246, 0.4); }\n.badge-purple { background: rgba(139, 92, 246, 0.2); color: var(--accent-purple); border: 1px solid rgba(139, 92, 246, 0.4); }\n.badge-dark { background: rgba(255, 255, 255, 0.1); color: #fff; border: 1px solid var(--border-light); }\n\n.hero-title {\n  font-size: 2.8rem;\n  font-weight: 800;\n  line-height: 1.15;\n  margin-bottom: 16px;\n  max-width: 800px;\n  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);\n}\n\n.hero-synopsis {\n  color: #cbd5e1;\n  font-size: 1rem;\n  line-height: 1.6;\n  max-width: 650px;\n  margin-bottom: 24px;\n  display: -webkit-box;\n  -webkit-line-clamp: 3;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.hero-actions {\n  display: flex;\n  gap: 14px;\n}\n\n.btn {\n  display: inline-flex;\n  align-items: center;\n  gap: 8px;\n  padding: 12px 24px;\n  border-radius: var(--radius-md);\n  font-size: 0.95rem;\n  font-weight: 700;\n  cursor: pointer;\n  transition: var(--transition);\n  border: none;\n}\n\n.btn svg {\n  width: 18px;\n  height: 18px;\n}\n\n.btn-primary {\n  background: var(--primary);\n  color: #ffffff;\n  box-shadow: 0 4px 16px rgba(59, 130, 246, 0.4);\n}\n.btn-primary:hover {\n  background: var(--primary-hover);\n  transform: translateY(-2px);\n}\n\n.btn-secondary {\n  background: rgba(255, 255, 255, 0.12);\n  color: #ffffff;\n  backdrop-filter: blur(8px);\n}\n.btn-secondary:hover {\n  background: rgba(255, 255, 255, 0.22);\n  transform: translateY(-2px);\n}\n\n.btn-sm {\n  padding: 8px 16px;\n  font-size: 0.85rem;\n}\n\n/* SUBNAV PILLS */\n.subnav-container {\n  max-width: 1400px;\n  margin: 16px auto 0;\n  padding: 0 24px;\n}\n\n.subnav-scroll {\n  display: flex;\n  gap: 8px;\n  overflow-x: auto;\n  padding-bottom: 8px;\n}\n\n.subnav-pill {\n  padding: 6px 14px;\n  border-radius: 20px;\n  background: #141c27;\n  border: 1px solid var(--border);\n  color: var(--text-muted);\n  font-size: 0.82rem;\n  font-weight: 600;\n  cursor: pointer;\n  white-space: nowrap;\n  transition: var(--transition);\n}\n\n.subnav-pill:hover {\n  color: #fff;\n  border-color: var(--primary);\n}\n\n.subnav-pill.active {\n  background: var(--primary);\n  border-color: var(--primary);\n  color: #fff;\n}\n\n/* MAIN CONTAINER & GRID */\n.main-container {\n  max-width: 1400px;\n  margin: 0 auto;\n  padding: 32px 24px 80px;\n}\n\n.section-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 24px;\n}\n\n.section-header h2 {\n  font-size: 1.5rem;\n  font-weight: 700;\n}\n\n.count-badge {\n  background: #1e293b;\n  color: var(--text-muted);\n  font-size: 0.8rem;\n  font-weight: 600;\n  padding: 4px 10px;\n  border-radius: 12px;\n}\n\n.content-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));\n  gap: 22px;\n}\n\n/* CARDS DE CONTEÚDO (Filmes, Séries, Animes) */\n.media-card {\n  position: relative;\n  border-radius: var(--radius-md);\n  background: var(--bg-card);\n  border: 1px solid var(--border);\n  overflow: hidden;\n  cursor: pointer;\n  transition: var(--transition);\n  display: flex;\n  flex-direction: column;\n}\n\n.media-card:hover {\n  transform: translateY(-6px);\n  border-color: var(--primary);\n  box-shadow: 0 12px 30px -5px rgba(0, 0, 0, 0.6);\n}\n\n.media-poster-box {\n  position: relative;\n  aspect-ratio: 2/3;\n  width: 100%;\n  overflow: hidden;\n  background: #17202d;\n}\n\n.media-poster {\n  width: 100%;\n  height: 100%;\n  object-fit: cover;\n  transition: transform 0.4s ease;\n}\n\n.media-card:hover .media-poster {\n  transform: scale(1.05);\n}\n\n.media-rating {\n  position: absolute;\n  top: 8px;\n  left: 8px;\n  background: rgba(0, 0, 0, 0.75);\n  backdrop-filter: blur(4px);\n  color: var(--accent-gold);\n  font-size: 0.75rem;\n  font-weight: 700;\n  padding: 2px 6px;\n  border-radius: 4px;\n  display: flex;\n  align-items: center;\n  gap: 4px;\n}\n\n.media-play-overlay {\n  position: absolute;\n  inset: 0;\n  background: rgba(0, 0, 0, 0.45);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  opacity: 0;\n  transition: var(--transition);\n}\n\n.media-card:hover .media-play-overlay {\n  opacity: 1;\n}\n\n.play-circle {\n  width: 48px;\n  height: 48px;\n  border-radius: 50%;\n  background: var(--primary);\n  color: #fff;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  box-shadow: 0 0 20px rgba(59, 130, 246, 0.6);\n}\n\n.media-info {\n  padding: 12px;\n  flex: 1;\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between;\n}\n\n.media-title {\n  font-size: 0.92rem;\n  font-weight: 700;\n  line-height: 1.3;\n  margin-bottom: 6px;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.media-sub {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  color: var(--text-muted);\n  font-size: 0.78rem;\n}\n\n/* CARDS DE CANAIS AO VIVO */\n.channel-card {\n  position: relative;\n  background: var(--bg-card);\n  border: 1px solid var(--border);\n  border-radius: var(--radius-md);\n  padding: 16px;\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  text-align: center;\n  cursor: pointer;\n  transition: var(--transition);\n  aspect-ratio: 1;\n  justify-content: center;\n}\n\n.channel-card:hover {\n  transform: translateY(-5px);\n  border-color: var(--primary);\n  box-shadow: 0 10px 24px -5px rgba(59, 130, 246, 0.25);\n}\n\n.channel-logo-wrapper {\n  width: 72px;\n  height: 72px;\n  margin-bottom: 12px;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.channel-logo {\n  max-width: 100%;\n  max-height: 100%;\n  object-fit: contain;\n  filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.5));\n}\n\n.channel-title {\n  font-size: 0.88rem;\n  font-weight: 700;\n  line-height: 1.25;\n  color: #ffffff;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.channel-tag {\n  margin-top: 6px;\n  font-size: 0.7rem;\n  font-weight: 700;\n  color: var(--accent-gold);\n  background: rgba(245, 158, 11, 0.15);\n  padding: 2px 8px;\n  border-radius: 4px;\n}\n\n/* SPINNER & LOADING */\n.loading-state {\n  text-align: center;\n  padding: 60px 0;\n}\n\n.spinner {\n  width: 44px;\n  height: 44px;\n  border: 4px solid rgba(59, 130, 246, 0.15);\n  border-top-color: var(--primary);\n  border-radius: 50%;\n  animation: spin 0.8s linear infinite;\n  margin: 0 auto 16px;\n}\n\n@keyframes spin {\n  to { transform: rotate(360deg); }\n}\n\n.empty-state {\n  text-align: center;\n  padding: 80px 20px;\n  color: var(--text-muted);\n}\n.empty-state svg {\n  width: 48px;\n  height: 48px;\n  margin-bottom: 12px;\n  color: var(--text-muted);\n}\n\n/* MODAL DO PLAYER DE VÍDEO */\n.player-modal {\n  position: fixed;\n  inset: 0;\n  z-index: 999;\n  background: rgba(0, 0, 0, 0.88);\n  backdrop-filter: blur(10px);\n  display: none;\n  align-items: center;\n  justify-content: center;\n  padding: 24px;\n  animation: fadeIn 0.25s ease;\n}\n\n.player-modal.active {\n  display: flex;\n}\n\n.player-container {\n  width: 100%;\n  max-width: 1040px;\n  background: #0f151e;\n  border-radius: var(--radius-lg);\n  border: 1px solid var(--border);\n  overflow: hidden;\n  box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.9);\n}\n\n.player-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  padding: 14px 20px;\n  background: #141b26;\n  border-bottom: 1px solid var(--border);\n}\n\n.player-info {\n  display: flex;\n  align-items: center;\n  gap: 12px;\n}\n\n.live-tag {\n  background: var(--accent-red);\n  color: #fff;\n  font-size: 0.72rem;\n  font-weight: 800;\n  padding: 3px 8px;\n  border-radius: 4px;\n  display: inline-flex;\n  align-items: center;\n  gap: 5px;\n}\n\n.pulse {\n  width: 6px;\n  height: 6px;\n  background: #fff;\n  border-radius: 50%;\n  animation: pulse 1s infinite;\n}\n\n@keyframes pulse {\n  0% { opacity: 1; transform: scale(1); }\n  50% { opacity: 0.4; transform: scale(0.8); }\n  100% { opacity: 1; transform: scale(1); }\n}\n\n.close-player-btn, .close-modal-btn {\n  background: transparent;\n  border: none;\n  color: var(--text-muted);\n  cursor: pointer;\n  padding: 6px;\n  border-radius: var(--radius-sm);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  transition: var(--transition);\n}\n\n.close-player-btn:hover, .close-modal-btn:hover {\n  background: rgba(255, 255, 255, 0.1);\n  color: #ffffff;\n}\n\n.video-wrapper {\n  position: relative;\n  width: 100%;\n  aspect-ratio: 16/9;\n  background: #000;\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}\n\n.video-wrapper video {\n  width: 100%;\n  height: 100%;\n  outline: none;\n}\n\n.player-loading, .player-error {\n  position: absolute;\n  inset: 0;\n  background: rgba(0, 0, 0, 0.75);\n  display: flex;\n  flex-direction: column;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  color: #fff;\n  z-index: 10;\n}\n\n.player-error svg {\n  width: 42px;\n  height: 42px;\n  color: var(--accent-gold);\n}\n\n/* MODAL DE DETALHES */\n.details-modal {\n  position: fixed;\n  inset: 0;\n  z-index: 800;\n  background: rgba(0, 0, 0, 0.8);\n  backdrop-filter: blur(8px);\n  display: none;\n  align-items: center;\n  justify-content: center;\n  padding: 24px;\n}\n\n.details-modal.active {\n  display: flex;\n}\n\n.details-card {\n  position: relative;\n  width: 100%;\n  max-width: 820px;\n  max-height: 90vh;\n  background: var(--bg-card);\n  border-radius: var(--radius-lg);\n  border: 1px solid var(--border);\n  overflow-y: auto;\n  box-shadow: var(--shadow);\n}\n\n.details-card .close-modal-btn {\n  position: absolute;\n  top: 14px;\n  right: 14px;\n  z-index: 10;\n  background: rgba(0, 0, 0, 0.6);\n}\n\n.details-banner {\n  position: relative;\n  height: 240px;\n  background-size: cover;\n  background-position: center;\n}\n\n.details-banner-overlay {\n  position: absolute;\n  inset: 0;\n  background: linear-gradient(180deg, transparent 40%, var(--bg-card) 100%);\n}\n\n.details-body {\n  padding: 24px;\n}\n\n.details-meta {\n  display: flex;\n  gap: 8px;\n  margin-bottom: 12px;\n  flex-wrap: wrap;\n}\n\n.details-body h2 {\n  font-size: 1.8rem;\n  font-weight: 800;\n  margin-bottom: 14px;\n}\n\n.modal-synopsis {\n  color: #cbd5e1;\n  font-size: 0.95rem;\n  line-height: 1.6;\n  max-height: 140px;\n  overflow-y: auto;\n  margin-bottom: 20px;\n}\n\n/* SEÇÃO DE TEMPORADAS E EPISÓDIOS */\n.seasons-section {\n  margin-top: 24px;\n  border-top: 1px solid var(--border-light);\n  padding-top: 20px;\n}\n\n.seasons-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  margin-bottom: 16px;\n}\n\n.seasons-header-title {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n}\n\n.seasons-header-title svg {\n  color: var(--primary);\n  width: 20px;\n  height: 20px;\n}\n\n.seasons-header-title h3 {\n  font-size: 1.15rem;\n  font-weight: 700;\n  color: #fff;\n}\n\n.seasons-badge {\n  font-size: 0.75rem;\n  font-weight: 700;\n  background: rgba(59, 130, 246, 0.15);\n  color: var(--primary);\n  padding: 4px 10px;\n  border-radius: 20px;\n  border: 1px solid rgba(59, 130, 246, 0.3);\n}\n\n.episodes-loading {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  gap: 12px;\n  padding: 30px;\n  background: rgba(255, 255, 255, 0.02);\n  border-radius: var(--radius-md);\n  border: 1px dashed var(--border);\n  color: var(--text-muted);\n  font-size: 0.9rem;\n}\n\n.spinner-sm {\n  width: 20px;\n  height: 20px;\n  border: 2px solid rgba(255, 255, 255, 0.15);\n  border-top-color: var(--primary);\n  border-radius: 50%;\n  animation: spin 0.8s linear infinite;\n}\n\n/* Pílulas de Temporadas */\n.season-pills {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n  overflow-x: auto;\n  padding-bottom: 12px;\n  margin-bottom: 16px;\n}\n\n.season-pill {\n  flex-shrink: 0;\n  background: rgba(255, 255, 255, 0.05);\n  border: 1px solid var(--border);\n  color: var(--text-muted);\n  padding: 8px 16px;\n  border-radius: 20px;\n  font-size: 0.85rem;\n  font-weight: 600;\n  cursor: pointer;\n  transition: var(--transition);\n}\n\n.season-pill:hover {\n  background: rgba(255, 255, 255, 0.1);\n  color: #fff;\n}\n\n.season-pill.active {\n  background: var(--primary);\n  color: #fff;\n  border-color: var(--primary);\n  box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);\n}\n\n/* Grade de Episódios */\n.episodes-grid {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(210px, 1fr));\n  gap: 12px;\n  max-height: 380px;\n  overflow-y: auto;\n  padding-right: 4px;\n}\n\n.episode-card {\n  background: #151c27;\n  border: 1px solid var(--border);\n  border-radius: var(--radius-md);\n  padding: 14px;\n  cursor: pointer;\n  transition: var(--transition);\n  display: flex;\n  flex-direction: column;\n  justify-content: space-between;\n  gap: 12px;\n  min-height: 85px;\n}\n\n.episode-card:hover {\n  background: #1c2635;\n  border-color: var(--primary);\n  transform: translateY(-2px);\n  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.4);\n}\n\n.episode-card.active-ep {\n  border-color: #10b981;\n  background: rgba(16, 185, 129, 0.1);\n}\n\n.episode-card-header {\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n}\n\n.episode-num-badge {\n  font-size: 0.72rem;\n  font-weight: 800;\n  background: rgba(59, 130, 246, 0.2);\n  color: #60a5fa;\n  padding: 3px 8px;\n  border-radius: 4px;\n}\n\n.episode-play-icon {\n  width: 28px;\n  height: 28px;\n  border-radius: 50%;\n  background: rgba(255, 255, 255, 0.08);\n  display: flex;\n  align-items: center;\n  justify-content: center;\n  color: #fff;\n  transition: var(--transition);\n}\n\n.episode-card:hover .episode-play-icon {\n  background: var(--primary);\n  transform: scale(1.1);\n}\n\n.episode-title {\n  font-size: 0.88rem;\n  font-weight: 600;\n  color: #e2e8f0;\n  line-height: 1.35;\n  display: -webkit-box;\n  -webkit-line-clamp: 2;\n  -webkit-box-orient: vertical;\n  overflow: hidden;\n}\n\n.no-episodes {\n  grid-column: 1 / -1;\n  text-align: center;\n  color: var(--text-muted);\n  padding: 30px;\n  font-size: 0.9rem;\n}\n\n/* FOOTER */\n.footer {\n  border-top: 1px solid var(--border-light);\n  background: #06090e;\n  padding: 40px 24px 24px;\n  margin-top: 60px;\n}\n\n.footer-content {\n  max-width: 1400px;\n  margin: 0 auto 30px;\n  display: flex;\n  align-items: center;\n  justify-content: space-between;\n  flex-wrap: wrap;\n  gap: 20px;\n}\n\n.footer-brand h3 {\n  font-weight: 800;\n  color: var(--primary);\n  margin-bottom: 6px;\n}\n\n.footer-brand p {\n  color: var(--text-muted);\n  font-size: 0.85rem;\n  max-width: 500px;\n}\n\n.footer-status {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  color: #10b981;\n  font-size: 0.85rem;\n  font-weight: 600;\n}\n\n.status-indicator {\n  width: 8px;\n  height: 8px;\n  border-radius: 50%;\n  background: #10b981;\n  box-shadow: 0 0 10px #10b981;\n}\n\n.footer-bottom {\n  max-width: 1400px;\n  margin: 0 auto;\n  text-align: center;\n  color: #64748b;\n  font-size: 0.8rem;\n  border-top: 1px solid rgba(255, 255, 255, 0.05);\n  padding-top: 20px;\n}\n\n@keyframes fadeIn {\n  from { opacity: 0; }\n  to { opacity: 1; }\n}\n\n/* RESPONSIVIDADE */\n@media (max-width: 900px) {\n  .nav-menu {\n    order: 3;\n    width: 100%;\n  }\n  .hero-title {\n    font-size: 2rem;\n  }\n  .content-grid {\n    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));\n    gap: 14px;\n  }\n}\n";
  const EMBEDDED_APP_JS = "let allItems = [];\nlet currentCategory = 'home';\nlet channelCategories = {};\nlet selectedChannelSubcategory = 'Todos';\n\nconst contentGrid = document.getElementById('contentGrid');\nconst loadingState = document.getElementById('loadingState');\nconst emptyState = document.getElementById('emptyState');\nconst sectionTitle = document.getElementById('sectionTitle');\nconst sectionCount = document.getElementById('sectionCount');\nconst searchInput = document.getElementById('searchInput');\nconst clearSearchBtn = document.getElementById('clearSearchBtn');\nconst subnavContainer = document.getElementById('subnavContainer');\nconst subnavPills = document.getElementById('subnavPills');\n\n// Hero Banner Elements\nconst heroBackdrop = document.getElementById('heroBackdrop');\nconst heroTitle = document.getElementById('heroTitle');\nconst heroSynopsis = document.getElementById('heroSynopsis');\nconst heroRating = document.getElementById('heroRating');\nconst heroYear = document.getElementById('heroYear');\nconst heroGenre = document.getElementById('heroGenre');\nconst heroPlayBtn = document.getElementById('heroPlayBtn');\nconst heroInfoBtn = document.getElementById('heroInfoBtn');\n\n// Details Modal\nconst detailsModal = document.getElementById('detailsModal');\nconst closeDetailsBtn = document.getElementById('closeDetailsBtn');\nconst detailsBanner = document.getElementById('detailsBanner');\nconst modalTitle = document.getElementById('modalTitle');\nconst modalSynopsis = document.getElementById('modalSynopsis');\nconst modalRating = document.getElementById('modalRating');\nconst modalYear = document.getElementById('modalYear');\nconst modalCategory = document.getElementById('modalCategory');\nconst modalGenre = document.getElementById('modalGenre');\nconst modalPlayBtn = document.getElementById('modalPlayBtn');\nconst seasonsSection = document.getElementById('seasonsSection');\nconst seasonsCountBadge = document.getElementById('seasonsCountBadge');\nconst episodesLoading = document.getElementById('episodesLoading');\nconst seasonPills = document.getElementById('seasonPills');\nconst episodesGrid = document.getElementById('episodesGrid');\n\nlet activeModalItem = null;\n\n// Inicialização\ndocument.addEventListener('DOMContentLoaded', () => {\n  loadCategory('home');\n  setupNavigation();\n  setupSearch();\n});\n\nfunction setupNavigation() {\n  const navItems = document.querySelectorAll('.nav-item');\n  navItems.forEach(item => {\n    item.addEventListener('click', () => {\n      navItems.forEach(i => i.classList.remove('active'));\n      item.classList.add('active');\n      const cat = item.getAttribute('data-category');\n      loadCategory(cat);\n    });\n  });\n\n  closeDetailsBtn.addEventListener('click', () => detailsModal.classList.remove('active'));\n  detailsModal.addEventListener('click', (e) => {\n    if (e.target === detailsModal) detailsModal.classList.remove('active');\n  });\n}\n\nfunction setupSearch() {\n  searchInput.addEventListener('input', (e) => {\n    const term = e.target.value.trim().toLowerCase();\n    clearSearchBtn.style.display = term ? 'block' : 'none';\n    filterContent(term);\n  });\n\n  clearSearchBtn.addEventListener('click', () => {\n    searchInput.value = '';\n    clearSearchBtn.style.display = 'none';\n    filterContent('');\n  });\n}\n\nasync function loadCategory(cat) {\n  currentCategory = cat;\n  loadingState.style.display = 'block';\n  contentGrid.innerHTML = '';\n  emptyState.style.display = 'none';\n  subnavContainer.style.display = 'none';\n\n  try {\n    if (cat === 'home') {\n      await loadHomeView();\n    } else if (cat === 'channels') {\n      await loadChannelsView();\n    } else if (cat === 'pluto') {\n      await loadPlutoView();\n    } else {\n      await loadCatalogView(cat);\n    }\n  } catch (err) {\n    console.error('Erro ao carregar dados:', err);\n    loadingState.style.display = 'none';\n    emptyState.style.display = 'block';\n  }\n}\n\n// 1. CARREGAR HOME (Visão Geral com Destaques e Categorias)\nasync function loadHomeView() {\n  sectionTitle.textContent = 'Destaques e Lançamentos';\n  \n  // Carrega amostras de Séries e Animes\n  const [seriesRes, animesRes, channelsRes] = await Promise.all([\n    fetch('/api/catalog/series').then(r => r.json()),\n    fetch('/api/catalog/animes').then(r => r.json()),\n    fetch('/api/channels').then(r => r.json())\n  ]);\n\n  const series = seriesRes.items || [];\n  const animes = animesRes.items || [];\n  allItems = [...series.slice(0, 16), ...animes.slice(0, 16)];\n\n  if (series.length > 0) {\n    updateHeroBanner(series[Math.floor(Math.random() * Math.min(series.length, 10))]);\n  }\n\n  loadingState.style.display = 'none';\n  sectionCount.textContent = `${allItems.length} itens`;\n  renderMediaGrid(allItems);\n}\n\n// 2. CARREGAR CANAIS AO VIVO\nasync function loadChannelsView() {\n  sectionTitle.textContent = 'Canais de TV Ao Vivo';\n  const res = await fetch('/api/channels');\n  const data = await res.json();\n\n  channelCategories = data.channels || {};\n  let totalChannels = [];\n  const categoryNames = Object.keys(channelCategories);\n\n  categoryNames.forEach(c => {\n    totalChannels.push(...channelCategories[c]);\n  });\n\n  allItems = totalChannels;\n  loadingState.style.display = 'none';\n  sectionCount.textContent = `${allItems.length} canais`;\n\n  // Renderiza subnav de categorias de canal\n  renderSubnavPills(['Todos', ...categoryNames], (selected) => {\n    if (selected === 'Todos') {\n      renderChannelsGrid(totalChannels);\n    } else {\n      renderChannelsGrid(channelCategories[selected] || []);\n    }\n  });\n\n  if (totalChannels.length > 0) {\n    updateHeroBanner({\n      title: 'TV Aberta & Fechada Ao Vivo',\n      synopsis: 'Acompanhe as principais transmissões nacionais e internacionais em HD e FHD sem travar diretamente pelo player web.',\n      rating: 'Ao Vivo',\n      year: '2026',\n      genre: 'Canais de TV',\n      backdrop: 'https://image.tmdb.org/t/p/w1920_and_h1080_bestv2/vZsXfIDs3A8jzB46cdwusqxRjdI.jpg',\n      streamUrl: totalChannels[0].streamUrl\n    });\n  }\n\n  renderChannelsGrid(totalChannels);\n}\n\n// 3. CARREGAR PLUTO TV\nasync function loadPlutoView() {\n  sectionTitle.textContent = 'Canais Oficiais Pluto TV';\n  const res = await fetch('/api/pluto/channels');\n  const data = await res.json();\n\n  const channels = data.channels || [];\n  allItems = channels;\n  loadingState.style.display = 'none';\n  sectionCount.textContent = `${channels.length} canais`;\n\n  // Agrupa categorias\n  const cats = Array.from(new Set(channels.map(c => c.category || 'Geral')));\n  renderSubnavPills(['Todos', ...cats], (selected) => {\n    if (selected === 'Todos') {\n      renderPlutoGrid(channels);\n    } else {\n      renderPlutoGrid(channels.filter(c => c.category === selected));\n    }\n  });\n\n  renderPlutoGrid(channels);\n}\n\n// 4. CARREGAR CATÁLOGO (Séries, Animes, Desenhos, etc.)\nasync function loadCatalogView(catKey) {\n  const titlesMap = {\n    series: 'Séries Completas',\n    animes: 'Animes & Mangás',\n    desenhos: 'Desenhos Animados',\n    novelas: 'Novelas Brasileiras e Latinas',\n    doramas: 'Doramas Asiáticos'\n  };\n\n  sectionTitle.textContent = titlesMap[catKey] || catKey.toUpperCase();\n  const res = await fetch(`/api/catalog/${catKey}`);\n  const data = await res.json();\n\n  const items = data.items || [];\n  allItems = items;\n  loadingState.style.display = 'none';\n  sectionCount.textContent = `${items.length} títulos`;\n\n  if (items.length > 0) {\n    updateHeroBanner(items[Math.floor(Math.random() * Math.min(items.length, 10))]);\n  }\n\n  renderMediaGrid(items);\n}\n\n// RENDERIZAÇÃO DE CARDS DE MÍDIA\nfunction renderMediaGrid(items) {\n  contentGrid.innerHTML = '';\n  if (!items || items.length === 0) {\n    emptyState.style.display = 'block';\n    return;\n  }\n  emptyState.style.display = 'none';\n\n  items.forEach(item => {\n    const card = document.createElement('div');\n    card.className = 'media-card';\n    card.innerHTML = `\n      <div class=\"media-poster-box\">\n        <img src=\"${item.poster}\" alt=\"${item.title}\" class=\"media-poster\" loading=\"lazy\" onerror=\"this.src='https://image.tmdb.org/t/p/w300_and_h450_bestv2/3o7f2Xjwl5hcoiioR9eGdD9ezHt.jpg'\">\n        ${item.rating ? `<div class=\"media-rating\">★ ${item.rating}</div>` : ''}\n        <div class=\"media-play-overlay\">\n          <div class=\"play-circle\"><i data-feather=\"play\"></i></div>\n        </div>\n      </div>\n      <div class=\"media-info\">\n        <h4 class=\"media-title\">${item.title}</h4>\n        <div class=\"media-sub\">\n          <span>${item.year || item.category.toUpperCase()}</span>\n          <span>${item.genre ? item.genre.split(',')[0] : ''}</span>\n        </div>\n      </div>\n    `;\n\n    card.addEventListener('click', () => openDetailsModal(item));\n    contentGrid.appendChild(card);\n  });\n\n  feather.replace();\n}\n\n// RENDERIZAÇÃO DE CANAIS\nfunction renderChannelsGrid(channels) {\n  contentGrid.innerHTML = '';\n  if (!channels || channels.length === 0) {\n    emptyState.style.display = 'block';\n    return;\n  }\n  emptyState.style.display = 'none';\n\n  channels.forEach(ch => {\n    const card = document.createElement('div');\n    card.className = 'channel-card';\n    card.innerHTML = `\n      <div class=\"channel-logo-wrapper\">\n        <img src=\"${ch.thumbnail}\" alt=\"${ch.title}\" class=\"channel-logo\" loading=\"lazy\" onerror=\"this.src='https://i.imgur.com/dRfcHTf.jpg'\">\n      </div>\n      <h4 class=\"channel-title\">${ch.title}</h4>\n      <span class=\"channel-tag\">${ch.category}</span>\n    `;\n\n    card.addEventListener('click', () => {\n      playStream(ch.streamUrl, ch.title);\n    });\n    contentGrid.appendChild(card);\n  });\n}\n\nfunction renderPlutoGrid(channels) {\n  contentGrid.innerHTML = '';\n  if (!channels || channels.length === 0) {\n    emptyState.style.display = 'block';\n    return;\n  }\n  emptyState.style.display = 'none';\n\n  channels.forEach(ch => {\n    const card = document.createElement('div');\n    card.className = 'channel-card';\n    card.innerHTML = `\n      <div class=\"channel-logo-wrapper\">\n        <img src=\"${ch.logo}\" alt=\"${ch.name}\" class=\"channel-logo\" loading=\"lazy\">\n      </div>\n      <h4 class=\"channel-title\">${ch.name}</h4>\n      <span class=\"channel-tag\">${ch.category}</span>\n    `;\n\n    card.addEventListener('click', () => {\n      playStream(ch.streamUrl, ch.name);\n    });\n    contentGrid.appendChild(card);\n  });\n}\n\nfunction renderSubnavPills(categories, onSelect) {\n  subnavContainer.style.display = 'block';\n  subnavPills.innerHTML = '';\n\n  categories.forEach((cat, idx) => {\n    const pill = document.createElement('button');\n    pill.className = 'subnav-pill' + (idx === 0 ? ' active' : '');\n    pill.textContent = cat;\n\n    pill.addEventListener('click', () => {\n      document.querySelectorAll('.subnav-pill').forEach(p => p.classList.remove('active'));\n      pill.classList.add('active');\n      onSelect(cat);\n    });\n\n    subnavPills.appendChild(pill);\n  });\n}\n\nfunction updateHeroBanner(item) {\n  if (!item) return;\n  heroTitle.textContent = item.title;\n  heroSynopsis.textContent = item.synopsis || 'Sem sinopse disponível.';\n  heroRating.textContent = `★ ${item.rating || '8.2'}`;\n  heroYear.textContent = item.year || '2024';\n  heroGenre.textContent = item.genre || 'Destaque';\n  heroBackdrop.style.backgroundImage = `url('${item.backdrop || item.poster}')`;\n\n  heroPlayBtn.onclick = () => {\n    if (item.streamUrl) {\n      playStream(item.streamUrl, item.title);\n    } else {\n      openDetailsModal(item);\n    }\n  };\n\n  heroInfoBtn.onclick = () => openDetailsModal(item);\n}\n\nasync function openDetailsModal(item) {\n  activeModalItem = item;\n  modalTitle.textContent = item.title;\n  modalSynopsis.textContent = item.synopsis || 'Sem sinopse disponível no momento.';\n  modalRating.textContent = `★ ${item.rating || '7.5'}`;\n  modalYear.textContent = item.year || '2024';\n  modalCategory.textContent = (item.category || 'Mídia').toUpperCase();\n  modalGenre.textContent = item.genre || 'Geral';\n  detailsBanner.style.backgroundImage = `url('${item.backdrop || item.poster}')`;\n\n  // Se for canal de TV ao vivo ou Pluto TV\n  const isLive = item.category === 'channels' || item.category === 'pluto' || item.streamUrl;\n  if (isLive) {\n    if (seasonsSection) seasonsSection.style.display = 'none';\n    modalPlayBtn.innerHTML = '<i data-feather=\"play\"></i> Assistir Ao Vivo';\n    modalPlayBtn.disabled = false;\n    modalPlayBtn.onclick = () => {\n      detailsModal.classList.remove('active');\n      playStream(item.streamUrl, item.title, true);\n    };\n    feather.replace();\n    detailsModal.classList.add('active');\n    return;\n  }\n\n  // É uma Série, Anime, Desenho, Novela ou Dorama\n  if (seasonsSection) seasonsSection.style.display = 'block';\n  if (episodesLoading) episodesLoading.style.display = 'flex';\n  if (seasonPills) seasonPills.innerHTML = '';\n  if (episodesGrid) episodesGrid.innerHTML = '';\n  if (seasonsCountBadge) seasonsCountBadge.textContent = 'Buscando...';\n\n  modalPlayBtn.innerHTML = '<i data-feather=\"loader\"></i> Carregando episódios...';\n  modalPlayBtn.disabled = true;\n  detailsModal.classList.add('active');\n  feather.replace();\n\n  try {\n    const linkParam = item.externalLink || item.id || '';\n    const res = await fetch(`/api/media/episodes?link=${encodeURIComponent(linkParam)}&title=${encodeURIComponent(item.title)}`);\n    const data = await res.json();\n\n    if (episodesLoading) episodesLoading.style.display = 'none';\n\n    if (data.success && data.seasons && data.seasons.length > 0) {\n      const seasons = data.seasons;\n      if (seasonsCountBadge) {\n        seasonsCountBadge.textContent = `${seasons.length} Temporada${seasons.length > 1 ? 's' : ''}`;\n      }\n\n      // Renderiza as abas de Temporadas\n      renderSeasonPills(seasons, item);\n\n      // Define botão principal para o primeiro episódio\n      const firstSeason = seasons[0];\n      const firstEp = firstSeason.episodes && firstSeason.episodes[0];\n      if (firstEp) {\n        modalPlayBtn.innerHTML = '<i data-feather=\"play\"></i> Assistir Episódio 1';\n        modalPlayBtn.disabled = false;\n        modalPlayBtn.onclick = () => {\n          playEpisode(item, firstEp);\n        };\n      } else {\n        modalPlayBtn.innerHTML = '<i data-feather=\"play\"></i> Reproduzir';\n        modalPlayBtn.disabled = true;\n      }\n    } else {\n      if (seasonsCountBadge) seasonsCountBadge.textContent = 'Sem episódios';\n      if (episodesGrid) {\n        episodesGrid.innerHTML = '<div class=\"no-episodes\">Nenhum episódio disponível para esta obra no momento.</div>';\n      }\n      modalPlayBtn.innerHTML = '<i data-feather=\"alert-circle\"></i> Episódios Indisponíveis';\n      modalPlayBtn.disabled = true;\n    }\n  } catch (err) {\n    console.error('Erro ao carregar episódios:', err);\n    if (episodesLoading) episodesLoading.style.display = 'none';\n    if (episodesGrid) {\n      episodesGrid.innerHTML = '<div class=\"no-episodes\">Falha ao conectar com o servidor para buscar episódios.</div>';\n    }\n    modalPlayBtn.innerHTML = '<i data-feather=\"alert-triangle\"></i> Erro ao carregar';\n    modalPlayBtn.disabled = true;\n  }\n\n  feather.replace();\n}\n\nfunction renderSeasonPills(seasons, item) {\n  if (!seasonPills) return;\n  seasonPills.innerHTML = '';\n\n  seasons.forEach((season, index) => {\n    const pill = document.createElement('button');\n    pill.className = 'season-pill' + (index === 0 ? ' active' : '');\n    pill.textContent = season.name || `Temporada ${season.season}`;\n\n    pill.addEventListener('click', () => {\n      document.querySelectorAll('.season-pill').forEach(p => p.classList.remove('active'));\n      pill.classList.add('active');\n      renderEpisodesGrid(season.episodes || [], item);\n    });\n\n    seasonPills.appendChild(pill);\n  });\n\n  // Renderiza episódios da primeira temporada por padrão\n  if (seasons.length > 0) {\n    renderEpisodesGrid(seasons[0].episodes || [], item);\n  }\n}\n\nfunction renderEpisodesGrid(episodes, item) {\n  if (!episodesGrid) return;\n  episodesGrid.innerHTML = '';\n\n  if (!episodes || episodes.length === 0) {\n    episodesGrid.innerHTML = '<div class=\"no-episodes\">Nenhum episódio cadastrado nesta temporada.</div>';\n    return;\n  }\n\n  episodes.forEach(ep => {\n    const card = document.createElement('div');\n    card.className = 'episode-card';\n    card.innerHTML = `\n      <div class=\"episode-card-header\">\n        <span class=\"episode-num-badge\">EP ${ep.number}</span>\n        <div class=\"episode-play-icon\"><i data-feather=\"play\"></i></div>\n      </div>\n      <div class=\"episode-title\">${ep.title || `Episódio ${ep.number}`}</div>\n    `;\n\n    card.addEventListener('click', () => {\n      playEpisode(item, ep, card);\n    });\n\n    episodesGrid.appendChild(card);\n  });\n\n  feather.replace();\n}\n\nasync function playEpisode(item, ep, cardElement = null) {\n  if (cardElement) {\n    cardElement.classList.add('active-ep');\n  }\n\n  // Abre o player imediatamente com estado de loading\n  playStream(null, `${item.title} - ${ep.title || `Episódio ${ep.number}`}`);\n\n  try {\n    const res = await fetch(`/api/episode/stream?streamId=${encodeURIComponent(ep.streamId)}&type=${ep.type || 'resolver3'}`);\n    const data = await res.json();\n\n    if (data.success && data.streamUrl) {\n      playStream(data.streamUrl, `${item.title} - ${ep.title || `Episódio ${ep.number}`}`);\n    } else {\n      showPlayerError(data.error || 'O link de vídeo deste episódio não pôde ser resolvido.');\n    }\n  } catch (err) {\n    console.error('Erro ao resolver stream:', err);\n    showPlayerError('Falha de comunicação com o servidor para obter o vídeo.');\n  }\n}\n\nfunction filterContent(term) {\n  if (!term) {\n    if (currentCategory === 'channels') renderChannelsGrid(allItems);\n    else if (currentCategory === 'pluto') renderPlutoGrid(allItems);\n    else renderMediaGrid(allItems);\n    return;\n  }\n\n  const filtered = allItems.filter(item => {\n    const title = (item.title || item.name || '').toLowerCase();\n    const synopsis = (item.synopsis || '').toLowerCase();\n    const genre = (item.genre || item.category || '').toLowerCase();\n    return title.includes(term) || synopsis.includes(term) || genre.includes(term);\n  });\n\n  sectionCount.textContent = `${filtered.length} resultados`;\n\n  if (currentCategory === 'channels') renderChannelsGrid(filtered);\n  else if (currentCategory === 'pluto') renderPlutoGrid(filtered);\n  else renderMediaGrid(filtered);\n}\n";
  const EMBEDDED_PLAYER_JS = "// Gerenciador do Player de Vídeo (HLS, MP4 e Embed)\nlet hlsInstance = null;\nconst videoElement = document.getElementById('videoPlayer');\nconst embedPlayer = document.getElementById('embedPlayer');\nconst playerModal = document.getElementById('playerModal');\nconst playerTitle = document.getElementById('playerTitle');\nconst playerLoading = document.getElementById('playerLoading');\nconst playerLoadingText = document.getElementById('playerLoadingText');\nconst playerError = document.getElementById('playerError');\nconst playerErrorMsg = document.getElementById('playerErrorMsg');\nconst retryStreamBtn = document.getElementById('retryStreamBtn');\nconst closePlayerBtn = document.getElementById('closePlayerBtn');\nconst playerLiveTag = document.getElementById('playerLiveTag');\n\nlet currentStreamUrl = null;\nlet currentStreamTitle = '';\nlet currentIsLive = false;\n\nfunction playStream(url, title = 'Reproduzindo', isLive = false) {\n  if (!url) {\n    showPlayerError('Link de reprodução indisponível para este item.');\n    return;\n  }\n\n  currentStreamUrl = url;\n  currentStreamTitle = title;\n  currentIsLive = isLive || url.includes('/api/proxy/stream') || url.includes('.m3u8');\n\n  playerTitle.textContent = title;\n  if (playerLiveTag) {\n    playerLiveTag.style.display = currentIsLive ? 'inline-flex' : 'none';\n  }\n\n  playerModal.classList.add('active');\n  playerLoading.style.display = 'flex';\n  if (playerLoadingText) playerLoadingText.textContent = 'Carregando vídeo...';\n  playerError.style.display = 'none';\n\n  // Limpa instância HLS anterior se houver\n  if (hlsInstance) {\n    hlsInstance.destroy();\n    hlsInstance = null;\n  }\n\n  // Remove fontes anteriores do elemento de vídeo\n  videoElement.pause();\n  videoElement.removeAttribute('src');\n\n  // CASO 1: É um Embed / Iframe (Ex: Blogger / AnimesOnline / Embeds)\n  const isEmbed = url.includes('/embed') || url.includes('blogger.com') || (!url.includes('.mp4') && !url.includes('.m3u8') && !url.includes('wasabisys') && !url.includes('/api/'));\n  if (isEmbed && embedPlayer) {\n    videoElement.style.display = 'none';\n    embedPlayer.style.display = 'block';\n    embedPlayer.src = url;\n    embedPlayer.onload = () => {\n      playerLoading.style.display = 'none';\n    };\n    return;\n  }\n\n  // Garante que o vídeo está visível e o iframe oculto\n  if (embedPlayer) {\n    embedPlayer.style.display = 'none';\n    embedPlayer.src = 'about:blank';\n  }\n  videoElement.style.display = 'block';\n\n  // CASO 2: É um arquivo MP4 direto (Ex: Wasabi S3 de Séries / Episódios)\n  const isMp4 = url.includes('.mp4') || url.includes('wasabisys.com');\n  if (isMp4) {\n    videoElement.src = url;\n    \n    const onCanPlay = () => {\n      playerLoading.style.display = 'none';\n      videoElement.play().catch(e => console.log('Autoplay MP4 aguardando interação:', e.message));\n      videoElement.removeEventListener('canplay', onCanPlay);\n      videoElement.removeEventListener('loadeddata', onCanPlay);\n    };\n\n    videoElement.addEventListener('canplay', onCanPlay);\n    videoElement.addEventListener('loadeddata', onCanPlay);\n\n    videoElement.onerror = () => {\n      showPlayerError('Não foi possível carregar o arquivo de vídeo deste episódio.');\n    };\n    return;\n  }\n\n  // CASO 3: É um stream HLS (.m3u8) - Canais ao Vivo e Pluto TV\n  if (Hls.isSupported()) {\n    hlsInstance = new Hls({\n      enableWorker: true,\n      lowLatencyMode: true,\n      backBufferLength: 60\n    });\n\n    hlsInstance.loadSource(url);\n    hlsInstance.attachMedia(videoElement);\n\n    hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {\n      playerLoading.style.display = 'none';\n      videoElement.play().catch(() => {\n        console.log('Autoplay bloqueado pelo navegador, aguardando clique.');\n      });\n    });\n\n    hlsInstance.on(Hls.Events.ERROR, function (event, data) {\n      if (data.fatal) {\n        switch (data.type) {\n          case Hls.ErrorTypes.NETWORK_ERROR:\n            console.warn('Erro de rede HLS, tentando recuperar...');\n            hlsInstance.startLoad();\n            break;\n          case Hls.ErrorTypes.MEDIA_ERROR:\n            console.warn('Erro de mídia HLS, recuperando...');\n            hlsInstance.recoverMediaError();\n            break;\n          default:\n            hlsInstance.destroy();\n            showPlayerError('O sinal desta transmissão está temporariamente indisponível.');\n            break;\n        }\n      }\n    });\n  } \n  // Suporte nativo ao HLS (Safari / iOS)\n  else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {\n    videoElement.src = url;\n    videoElement.addEventListener('loadedmetadata', function () {\n      playerLoading.style.display = 'none';\n      videoElement.play();\n    });\n    videoElement.addEventListener('error', function () {\n      showPlayerError('Falha ao carregar transmissão no navegador.');\n    });\n  } else {\n    // Fallback: tenta definir diretamente o src do vídeo\n    videoElement.src = url;\n    videoElement.play().catch(() => {});\n    playerLoading.style.display = 'none';\n  }\n}\n\nfunction showPlayerError(msg) {\n  playerLoading.style.display = 'none';\n  playerError.style.display = 'flex';\n  playerErrorMsg.textContent = msg;\n}\n\nfunction closePlayer() {\n  if (hlsInstance) {\n    hlsInstance.destroy();\n    hlsInstance = null;\n  }\n  videoElement.pause();\n  videoElement.removeAttribute('src');\n  videoElement.load();\n  if (embedPlayer) {\n    embedPlayer.src = 'about:blank';\n    embedPlayer.style.display = 'none';\n  }\n  playerModal.classList.remove('active');\n}\n\nclosePlayerBtn.addEventListener('click', closePlayer);\nplayerModal.addEventListener('click', (e) => {\n  if (e.target === playerModal) closePlayer();\n});\n\nretryStreamBtn.addEventListener('click', () => {\n  if (currentStreamUrl) {\n    playStream(currentStreamUrl, currentStreamTitle, currentIsLive);\n  }\n});\n";

  app.get('/css/style.css', (req, res) => { res.setHeader('Content-Type', 'text/css'); res.send(EMBEDDED_CSS); });
  app.get('/js/app.js', (req, res) => { res.setHeader('Content-Type', 'application/javascript'); res.send(EMBEDDED_APP_JS); });
  app.get('/js/player.js', (req, res) => { res.setHeader('Content-Type', 'application/javascript'); res.send(EMBEDDED_PLAYER_JS); });
  app.get('/', (req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.send(EMBEDDED_HTML); });
}

// ==========================================
// 3. API ROUTES
// ==========================================

// Auth routes (excluded from auth middleware)
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, error: 'Usuário e senha são obrigatórios' });
  }
  
  const user = USERS.find(u => u.username === username && u.password === password);
  if (!user) {
    return res.json({ success: false, error: 'Usuário ou senha incorretos' });
  }
  
  const sessionId = generateSessionId();
  AUTH_SESSIONS[sessionId] = { user: username, createdAt: Date.now() };
  
  res.cookie('wmplay_session', sessionId, {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax'
  });
  
  res.json({ success: true, user: username });
});

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.json({ success: false, error: 'Usuário e senha são obrigatórios' });
  }
  if (username.trim().length < 3) {
    return res.json({ success: false, error: 'O usuário deve ter pelo menos 3 caracteres' });
  }
  if (password.length < 4) {
    return res.json({ success: false, error: 'A senha deve ter pelo menos 4 caracteres' });
  }
  const cleanUsername = username.trim();
  const existing = USERS.find(u => u.username.toLowerCase() === cleanUsername.toLowerCase());
  if (existing) {
    return res.json({ success: false, error: 'Este nome de usuário já está cadastrado' });
  }
  USERS.push({ username: cleanUsername, password });
  saveUsers();
  console.log(`[AUTH] Novo usuário registrado: ${cleanUsername}`);
  res.json({ success: true, message: 'Usuário registrado com sucesso!' });
});

app.get('/api/auth/check', (req, res) => {
  res.json({ authenticated: true, user: 'visitante' });
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.cookies && req.cookies.wmplay_session;
  if (sessionId) {
    delete AUTH_SESSIONS[sessionId];
    res.clearCookie('wmplay_session');
  }
  res.json({ success: true });
});

app.get('/api/categories', (req, res) => {
  res.json({
    categories: [
      { id: 'channels', name: 'Canais de TV Ao Vivo', icon: 'tv' },
      { id: 'series', name: 'Séries', icon: 'film' },
      { id: 'animes', name: 'Animes', icon: 'video' },
      { id: 'desenhos', name: 'Desenhos', icon: 'smile' },
      { id: 'doramas', name: 'Doramas', icon: 'heart' },
      { id: 'novelas', name: 'Novelas', icon: 'book-open' }
    ]
  });
});

app.get('/api/channels', async (req, res) => {
  try {
    const channels = await getChannels();
    res.json({ success: true, count: Object.keys(channels).length, channels });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/pluto/channels', async (req, res) => {
  try {
    const channels = await getPlutoChannels();
    res.json({ success: true, count: channels.length, channels });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/pluto/stream/:channelId', async (req, res) => {
  try {
    const streamUrl = await getPlutoStreamUrl(req.params.channelId);
    res.redirect(`/api/proxy/stream?url=${encodeURIComponent(streamUrl)}`);
  } catch (err) {
    res.status(500).json({ error: 'Falha ao obter stream Pluto TV', details: err.message });
  }
});

app.get('/api/catalog/:category', async (req, res) => {
  try {
    const items = await getCatalog(req.params.category.toLowerCase());
    res.json({ success: true, category: req.params.category, total: items.length, items });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/media/episodes', async (req, res) => {
  try {
    const seasons = await getSeasonsAndEpisodes(req.query.link, req.query.title);
    res.json({ success: true, count: seasons.length, seasons });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/episode/stream', async (req, res) => {
  try {
    const streamUrl = await resolveStreamUrl(req.query.streamId, req.query.type);
    if (!streamUrl) return res.status(404).json({ success: false, error: 'Stream do episódio não encontrado' });
    res.json({ success: true, streamUrl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/proxy/stream', handleStreamProxy);

// Movie genre categories
const MOVIE_GENRES = {
  lancamentos: 'lancamentos.xml',
  acao: 'acao.xml',
  animacao: 'animacao.xml',
  aventura: 'aventura.xml',
  comedia: 'comedia.xml',
  crime: 'crime.xml',
  documentario: 'documentario.xml',
  drama: 'drama.xml',
  fantasia: 'fantasia.xml',
  ficcaocientifica: 'ficcaocientifica.xml',
  terror: 'terror.xml',
  suspense: 'suspense.xml',
  thriller: 'thriller.xml',
  romance: 'romance.xml',
  faroeste: 'faroeste.xml',
  guerra: 'guerra.xml',
  misterio: 'misterio.xml',
  familia: 'familia.xml'
};
const MOVIE_GIST_BASE = 'https://gist.githubusercontent.com/skyrisk/5b87797329c7b46422565ffbaab3be7e/raw/';

app.get('/api/movies/genres', (req, res) => {
  res.json({ genres: Object.keys(MOVIE_GENRES).map(k => ({ key: k, name: k.charAt(0).toUpperCase() + k.slice(1).replace('cientifica', ' Científica').replace('cao', 'ção') })) });
});

const movieAvailabilityCache = {};
const movieStreamCache = {};

async function checkMovieAvailability(slug) {
  if (!slug) return false;
  if (movieAvailabilityCache[slug] !== undefined) return movieAvailabilityCache[slug];
  try {
    const p = encodeURIComponent(Buffer.from(`{'resolver': 2, 'request': 'mvshows=${slug}'}`).toString('base64'));
    const res = await axios.get(RESOLVER_API + p, { headers: { 'Authorization': 'Bearer ' + TOKEN }, timeout: 3500 });
    if (res.data && res.data.result && res.data.result !== 'episode not found!' && res.data.result !== 'API Under Maintenance') {
      movieAvailabilityCache[slug] = true;
      let dec = res.data.result;
      try { dec = Buffer.from(res.data.result, 'base64').toString('utf8'); } catch(e){}
      const streamUrl = dec.split('|')[0];
      if (streamUrl && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
        movieStreamCache[slug] = { url: streamUrl, timestamp: Date.now() };
      }
      return true;
    }
  } catch(e){}
  movieAvailabilityCache[slug] = false;
  return false;
}

async function getMovieGenreItems(genre) {
  const xmlFile = MOVIE_GENRES[genre];
  if (!xmlFile) return [];
  
  const cacheKey = 'movies_' + genre;
  if (brazucaCache[cacheKey] && (Date.now() - brazucaCache[cacheKey].timestamp < CACHE_TTL)) {
    return brazucaCache[cacheKey].data;
  }
  const disk = getDiskCache(cacheKey);
  if (disk) {
    brazucaCache[cacheKey] = { data: disk, timestamp: Date.now() };
    return disk;
  }
  
  const url = MOVIE_GIST_BASE + xmlFile;
  const response = await axios.get(url, { timeout: 25000 });
  const sanitized = response.data.replace(/&(?!amp;|lt;|gt;|quot;|apos;)/g, '&amp;');
  const parsed = await parser.parseStringPromise(sanitized);
  
  const root = parsed.movies || parsed.channels || parsed;
  let rawItems = [];
  if (root.item) rawItems.push(...(Array.isArray(root.item) ? root.item : [root.item]));
  if (root.channel) rawItems.push(...(Array.isArray(root.channel) ? root.channel : [root.channel]));
  for (const key of Object.keys(root)) {
    if (key.startsWith('page_') && root[key] && root[key].item) {
      rawItems.push(...(Array.isArray(root[key].item) ? root[key].item : [root[key].item]));
    }
  }

  const items = [];
  for (const item of rawItems) {
    const cleanTitle = cleanKodiText(item.name || item.title || '');
    const link = item.externallink || item.link || '';
    if (!cleanTitle || link === 'here' || cleanTitle.includes('PRÓXIMA PÁGINA') || cleanTitle.includes('|||') || !link) {
      continue;
    }
    const info = parseInfo(item.info);
    const hasStreamSource = link.includes('resolver3_mv=') || link.includes('resolver2_mv=') || link.includes('.mp4') || link.includes('.m3u8');
    const tmdbId = (item.tmdb_id && /^\d+$/.test(item.tmdb_id)) ? item.tmdb_id : null;
    items.push({
      id: item.content_id || item.tmdb_id || Buffer.from(cleanTitle).toString('hex').slice(0, 12),
      tmdbId: tmdbId,
      title: cleanTitle,
      category: 'filmes',
      poster: item.thumbnail || 'https://image.tmdb.org/t/p/w300_and_h450_bestv2/3o7f2Xjwl5hcoiioR9eGdD9ezHt.jpg',
      backdrop: item.fanart || item.thumbnail || 'https://image.tmdb.org/t/p/w1920_and_h1080_bestv2/vZsXfIDs3A8jzB46cdwusqxRjdI.jpg',
      rating: info.rating || (item.tmdb_id ? '7.5' : ''),
      genre: info.genre || genre.charAt(0).toUpperCase() + genre.slice(1),
      year: info.year || item.tmdb_date || '',
      synopsis: info.synopsis || 'Sem sinopse disponível.',
      externalLink: link,
      contentType: 'movie',
      isAvailable: true,
      hasDirectStream: hasStreamSource
    });
  }
  
  // Realiza verificação rápida de disponibilidade para priorizar no topo filmes com stream nativo comprovado
  const verifyLimit = (genre === 'lancamentos') ? 60 : 30;
  const toVerify = items.slice(0, verifyLimit);
  for (let i = 0; i < toVerify.length; i += 15) {
    const chunk = toVerify.slice(i, i + 15);
    await Promise.all(chunk.map(async item => {
      const match = item.externalLink.match(/resolver3_mv=([^|#&]+)/);
      if (match) {
        const slug = match[1].trim();
        item.hasDirectStream = await checkMovieAvailability(slug);
      }
    }));
  }

  // Prioriza filmes com stream nativo imediato comprovado
  items.sort((a, b) => {
    if (a.hasDirectStream && !b.hasDirectStream) return -1;
    if (!a.hasDirectStream && b.hasDirectStream) return 1;
    return 0;
  });
  
  setDiskCache(cacheKey, items);
  brazucaCache[cacheKey] = { data: items, timestamp: Date.now() };
  return items;
}

app.get('/api/movies/:genre', async (req, res) => {
  try {
    const genre = req.params.genre;
    if (!MOVIE_GENRES[genre]) return res.status(404).json({ error: 'Gênero não encontrado' });
    const items = await getMovieGenreItems(genre);
    res.json({ items });
  } catch (err) {
    console.error('Erro ao carregar filmes:', err.message);
    res.status(500).json({ error: 'Falha ao carregar catálogo de filmes', details: err.message });
  }
});

// Endpoint de Busca Global Unificada (Canais, Filmes, Séries, Desenhos, Animes, etc.)
app.get('/api/search', async (req, res) => {
  try {
    const rawQ = (req.query.q || '').trim();
    if (!rawQ || rawQ.length < 2) {
      return res.json({ success: true, count: 0, items: [] });
    }
    const q = rawQ.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const results = [];
    const seenIds = new Set();

    function addMatches(list, defaultCat, isMovie = false) {
      if (!list || !Array.isArray(list)) return;
      for (const item of list) {
        if (!item) continue;
        const id = item.id || item.title;
        if (seenIds.has(id)) continue;
        const rawTitle = (item.title || item.name || '');
        const normTitle = rawTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normSynopsis = (item.synopsis || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const normGenre = (item.genre || item.category || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

        if (normTitle.includes(q) || normSynopsis.includes(q) || normGenre.includes(q)) {
          seenIds.add(id);
          results.push({
            ...item,
            category: isMovie ? 'filmes' : (item.category || defaultCat),
            contentType: isMovie ? 'movie' : (item.contentType || defaultCat)
          });
          if (results.length >= 80) return;
        }
      }
    }

    // 1. Canais de TV
    try {
      const channelsObj = await getChannels();
      for (const catName of Object.keys(channelsObj)) {
        addMatches(channelsObj[catName], 'channels');
        if (results.length >= 80) break;
      }
    } catch (e) {}

    // 2. Filmes (gêneros mais populares primeiro)
    const priorityMovieGenres = ['lancamentos', 'acao', 'animacao', 'comedia', 'terror', 'ficcaocientifica', 'aventura', 'drama', 'familia', 'suspense'];
    for (const g of priorityMovieGenres) {
      if (results.length >= 80) break;
      try {
        const mList = await getMovieGenreItems(g);
        addMatches(mList, 'filmes', true);
      } catch (e) {}
    }

    // 3. Séries, Animes, Desenhos, Doramas, Novelas
    const catalogKeys = ['series', 'animes', 'desenhos', 'novelas', 'doramas'];
    for (const catKey of catalogKeys) {
      if (results.length >= 80) break;
      try {
        const catList = await getCatalog(catKey);
        addMatches(catList, catKey, false);
      } catch (e) {}
    }

    res.json({ success: true, count: results.length, items: results });
  } catch (err) {
    console.error('Erro na rota de busca:', err.message);
    res.status(500).json({ success: false, error: 'Falha ao realizar busca', items: [] });
  }
});

app.get('/api/movie/stream', async (req, res) => {
  try {
    const { link, title } = req.query;
    if (!link && !title) return res.status(400).json({ error: 'Link ou título do filme ausente' });
    
    const cacheKey = (link || '') + '_' + (title || '');
    if (movieStreamCache[cacheKey] && (Date.now() - movieStreamCache[cacheKey].timestamp < 2 * 60 * 60 * 1000)) {
      return res.json({ success: true, streamUrl: movieStreamCache[cacheKey].url });
    }
    
    const slugs = [];
    const rawLink = link || '';

    // Extract all regex matches of resolver3_mv=, resolver2_mv=, movie2=, tvshows=
    const allMatches = [...rawLink.matchAll(/(?:resolver[12345]_mv|movie2|serie3|tvshows)=([^|#&]+)/g)];
    for (const m of allMatches) {
      const raw = m[1].trim();
      if (raw && !slugs.includes(raw)) slugs.push(raw);
      const clean = raw
        .replace(/-dublado-\d+/gi, '')
        .replace(/-legendado-\d+/gi, '')
        .replace(/-imagem-de-cinema/gi, '')
        .replace(/-cinema/gi, '')
        .replace(/-cam/gi, '')
        .replace(/-ts/gi, '')
        .replace(/-\d{4,}$/g, '')
        .trim();
      if (clean && clean.length > 2 && !slugs.includes(clean)) slugs.push(clean);
    }

    // Also extract from pipe separated segments
    const parts = rawLink.split('|');
    for (const part of parts) {
      if (part.includes('=')) {
        const val = part.split('=').pop().split('#')[0].split('&')[0].trim();
        const clean = val
          .replace(/-dublado-\d+/gi, '')
          .replace(/-legendado-\d+/gi, '')
          .replace(/-imagem-de-cinema/gi, '')
          .replace(/-\d{4,}$/g, '')
          .trim();
        if (clean && clean.length > 2 && !slugs.includes(clean)) slugs.push(clean);
        if (val && val.length > 2 && !slugs.includes(val)) slugs.push(val);
      }
    }

    // Generate slugs from title if provided
    if (title) {
      const cleanTitle = title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      const sTitle = cleanTitle.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      if (sTitle && !slugs.includes(sTitle)) slugs.push(sTitle);
      const withoutArticle = sTitle.replace(/^(o|a|os|as)-/, '');
      if (withoutArticle && !slugs.includes(withoutArticle)) slugs.push(withoutArticle);
    }
    
    // Retorna imediatamente se já verificado e em cache
    for (const slug of slugs) {
      if (movieStreamCache[slug] && movieStreamCache[slug].url) {
        movieStreamCache[cacheKey] = movieStreamCache[slug];
        return res.json({ success: true, streamUrl: movieStreamCache[slug].url });
      }
    }

    for (const slug of slugs) {
      for (const r of [2, 3]) {
        const result = await callGeekResolver(`{'resolver': ${r}, 'request': 'mvshows=${slug}'}`);
        if (result && typeof result === 'string' && (result.startsWith('http://') || result.startsWith('https://'))) {
          const cleanUrl = result.split('|')[0];
          movieStreamCache[cacheKey] = { url: cleanUrl, timestamp: Date.now() };
          return res.json({ success: true, streamUrl: cleanUrl });
        }
      }
      
      const tvResult = await callGeekResolver(`{'resolver': 3, 'request': 'tvshows=${slug}'}`);
      if (tvResult && typeof tvResult === 'object' && Object.keys(tvResult).length > 0) {
        const firstSeason = Object.keys(tvResult)[0];
        const episodes = tvResult[firstSeason]?.episodes || {};
        const firstEpNum = Object.keys(episodes)[0];
        if (firstEpNum) {
          const streamUrl = await callGeekResolver(`{'resolver': 3, 'request': 'episodes=${slug}#${firstSeason}#${firstEpNum}#Dublado'}`);
          if (streamUrl && typeof streamUrl === 'string' && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
            const cleanUrl = streamUrl.split('|')[0];
            movieStreamCache[cacheKey] = { url: cleanUrl, timestamp: Date.now() };
            return res.json({ success: true, streamUrl: cleanUrl });
          }
        }
      }
    }
    
    res.json({ success: false, error: 'Não foi possível resolver o stream deste filme no momento' });
  } catch (err) {
    console.error('Erro ao resolver filme:', err.message);
    res.json({ success: false, error: 'Falha ao resolver stream do filme' });
  }
});

// Provedores e Servidores Alternativos de Reprodução
app.get('/api/movie/servers', (req, res) => {
  const { tmdbId, link, title } = req.query;
  const servers = [];
  
  if (link && link !== 'here') {
    servers.push({
      id: 'server1',
      name: 'Servidor 1 (Stream Direto HD)',
      badge: 'Nativo HD',
      type: 'direct',
      url: `/api/movie/stream?link=${encodeURIComponent(link)}&title=${encodeURIComponent(title || '')}`
    });
  }
  
  if (tmdbId && /^\d+$/.test(tmdbId)) {
    servers.push({
      id: 'server2',
      name: 'Servidor 2 (VidLink Pro HD)',
      badge: '1080p Sem Anúncios',
      type: 'embed',
      url: `https://vidlink.pro/movie/${tmdbId}?primaryColor=3b82f6&secondaryColor=1d4ed8&autoplay=true`
    });
    servers.push({
      id: 'server3',
      name: 'Servidor 3 (VidSrc VIP)',
      badge: 'Multi-Players',
      type: 'embed',
      url: `https://vidsrc.me/embed/movie?tmdb=${tmdbId}`
    });
    servers.push({
      id: 'server4',
      name: 'Servidor 4 (VidSrc TO)',
      badge: 'Ultra Rápido',
      type: 'embed',
      url: `https://vidsrc.to/embed/movie/${tmdbId}`
    });
    servers.push({
      id: 'server5',
      name: 'Servidor 5 (AutoEmbed Global)',
      badge: 'Auto-Player',
      type: 'embed',
      url: `https://autoembed.co/movie/tmdb/${tmdbId}`
    });
  }

  res.json({ success: true, count: servers.length, servers });
});

app.use((req, res) => {
  if (hasPublicDir) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  } else {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(EMBEDDED_HTML);
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('==================================================');
  console.log('  WMPLAYWEB STREAMING ATIVO NA NUVEM!');
  console.log('  Porta: ' + PORT);
  console.log('==================================================');
});
