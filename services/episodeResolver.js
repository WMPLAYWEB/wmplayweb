const axios = require('axios');

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJyZXNvbHZlciIsInJvbGUiOiJ1c2VyIiwiaWF0IjoxNzc5MDk4OTczfQ.WzQBuOqMai96Afleh9g-i7NXo6h-YsjPUbOgxlUqVsU';
const RESOLVER_API = 'https://api.geekantenado.online/?resolver=';

// Cache para temporadas e episódios
const episodeCache = {};

async function callGeekResolver(paramsStr) {
  try {
    const payload = encodeURIComponent(Buffer.from(paramsStr).toString('base64'));
    const url = RESOLVER_API + payload;
    const res = await axios.get(url, {
      headers: { 'Authorization': 'Bearer ' + TOKEN },
      timeout: 12000
    });

    if (res.data && res.data.result) {
      const rawResult = res.data.result;
      if (rawResult === 'episode not found!' || rawResult === 'API Under Maintenance') {
        return null;
      }
      let decoded = null;
      try {
        decoded = Buffer.from(rawResult, 'base64').toString('utf8');
      } catch {
        decoded = rawResult;
      }

      try {
        return JSON.parse(decoded);
      } catch {
        return decoded;
      }
    }
  } catch (e) {
    // Silencia erros de timeout ou rede
  }
  return null;
}

function extractCandidateSlugs(externalLink, mediaTitle) {
  const candidates = new Set();
  
  if (externalLink) {
    const parts = externalLink.split('|');
    for (const part of parts) {
      let s = null;
      if (part.includes('resolver3_tvshows=')) {
        s = part.split('resolver3_tvshows=')[1];
      } else if (part.includes('tvshows=')) {
        s = part.split('tvshows=')[1];
      } else if (part.includes('serie3=')) {
        s = part.split('serie3=')[1];
      } else if (!part.includes('=') && !part.includes('/') && part.length > 2) {
        s = part;
      }
      
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
  if (episodeCache[cacheKey]) {
    return episodeCache[cacheKey];
  }

  const seasonsResult = [];

  try {
    // 1. Tenta obter temporadas via Resolver 3 com a lista de slugs candidatos
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

          seasonsResult.push({
            season: sKey,
            name: `${sKey}ª Temporada`,
            episodes: epList
          });
        }

        // Se encontrou temporadas no Resolver 3, encerra o loop
        if (seasonsResult.length > 0) break;
      }
    }

    // 2. Se não encontrou no Resolver 3, tenta Resolver 2 (ex: The Walking Dead e outras séries clássicas)
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

          seasonsResult.push({
            season: sNum,
            name: `${sNum}ª Temporada`,
            episodes: epList
          });
        }
      }
    }

    // 3. Caso animes3= (AnimesOnline)
    if (seasonsResult.length === 0 && externalLink.includes('animes3=')) {
      const animeSlug = externalLink.split('animes3=')[1].split('|')[0].split('#')[0];
      const pageUrl = 'https://animesonlinecc.to/anime/' + animeSlug;

      const pageRes = await axios.get(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
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
              epList.push({
                number: String(epNum++),
                title: epTitle || `Episódio ${epNum}`,
                streamId: epUrl,
                type: 'direct_url'
              });
            }
          }

          if (epList.length > 0) {
            seasonsResult.push({
              season: String(sCount++),
              name: sTitle,
              episodes: epList
            });
          }
        }
      }
    }

    // Fallback: Se não encontrou temporadas, cria Temporada 1 com episódios gerados
    if (seasonsResult.length === 0) {
      seasonsResult.push({
        season: '1',
        name: '1ª Temporada',
        episodes: [
          { number: '1', title: 'Episódio 1', streamId: externalLink, type: 'general' }
        ]
      });
    }

    episodeCache[externalLink] = seasonsResult;
    return seasonsResult;
  } catch (err) {
    console.error('Erro ao resolver temporadas:', err.message);
    return [
      {
        season: '1',
        name: '1ª Temporada',
        episodes: [{ number: '1', title: 'Episódio 1', streamId: externalLink, type: 'general' }]
      }
    ];
  }
}

async function resolveStreamUrl(streamId, type = 'resolver3') {
  if (!streamId) return null;

  try {
    if (type === 'resolver3' || streamId.includes('#')) {
      let streamUrl = await callGeekResolver(`{'resolver': 3, 'request': 'episodes=${streamId}'}`);
      
      // Fallback de idioma se Dublado não tiver disponível
      if (!streamUrl && streamId.includes('#Dublado')) {
        const legendadoId = streamId.replace('#Dublado', '#Legendado');
        streamUrl = await callGeekResolver(`{'resolver': 3, 'request': 'episodes=${legendadoId}'}`);
      }
      if (!streamUrl && streamId.includes('#Dublado')) {
        const nacionalId = streamId.replace('#Dublado', '#Nacional');
        streamUrl = await callGeekResolver(`{'resolver': 3, 'request': 'episodes=${nacionalId}'}`);
      }

      if (streamUrl && typeof streamUrl === 'string' && (streamUrl.startsWith('http://') || streamUrl.startsWith('https://'))) {
        return streamUrl;
      }
    }

    if (streamId.startsWith('http://') || streamId.startsWith('https://')) {
      // Se for página de animesonline, tenta extrair iframe do player
      if (streamId.includes('animesonlinecc.to/episodio/')) {
        try {
          const pageRes = await axios.get(streamId, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
            timeout: 8000
          });
          const m = pageRes.data.match(/<iframe[^>]+src=["']([^"']+)["']/i) || 
                    pageRes.data.match(/<div id="option-[^"]*"[^>]*src=["']([^"']+)["']/i);
          if (m && m[1]) {
            return m[1];
          }
        } catch (e) {
          console.log('Aviso: falha ao extrair iframe de animesonline, retornando URL original:', e.message);
        }
      }
      return streamId;
    }

    return null;
  } catch (err) {
    console.error('Erro ao resolver stream do episódio:', err.message);
    return null;
  }
}

module.exports = {
  getSeasonsAndEpisodes,
  resolveStreamUrl
};
