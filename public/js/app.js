let allItems = [];
let currentCategory = 'home';
let channelCategories = {};
let selectedChannelSubcategory = 'Todos';
const clientDataCache = {};

const contentGrid = document.getElementById('contentGrid');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const sectionTitle = document.getElementById('sectionTitle');
const sectionCount = document.getElementById('sectionCount');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const subnavContainer = document.getElementById('subnavContainer');
const subnavPills = document.getElementById('subnavPills');

// Hero Banner Elements
const heroBackdrop = document.getElementById('heroBackdrop');
const heroTitle = document.getElementById('heroTitle');
const heroSynopsis = document.getElementById('heroSynopsis');
const heroRating = document.getElementById('heroRating');
const heroYear = document.getElementById('heroYear');
const heroGenre = document.getElementById('heroGenre');
const heroPlayBtn = document.getElementById('heroPlayBtn');
const heroInfoBtn = document.getElementById('heroInfoBtn');

// Details Modal
const detailsModal = document.getElementById('detailsModal');
const closeDetailsBtn = document.getElementById('closeDetailsBtn');
const detailsBanner = document.getElementById('detailsBanner');
const modalTitle = document.getElementById('modalTitle');
const modalSynopsis = document.getElementById('modalSynopsis');
const modalRating = document.getElementById('modalRating');
const modalYear = document.getElementById('modalYear');
const modalCategory = document.getElementById('modalCategory');
const modalGenre = document.getElementById('modalGenre');
const modalPlayBtn = document.getElementById('modalPlayBtn');
const seasonsSection = document.getElementById('seasonsSection');
const seasonsCountBadge = document.getElementById('seasonsCountBadge');
const episodesLoading = document.getElementById('episodesLoading');
const seasonPills = document.getElementById('seasonPills');
const episodesGrid = document.getElementById('episodesGrid');

let activeModalItem = null;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  loadCategory('home');
  setupNavigation();
  setupSearch();
});

function setupNavigation() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      navItems.forEach(i => i.classList.remove('active'));
      item.classList.add('active');
      const cat = item.getAttribute('data-category');
      loadCategory(cat);
    });
  });

  closeDetailsBtn.addEventListener('click', () => detailsModal.classList.remove('active'));
  detailsModal.addEventListener('click', (e) => {
    if (e.target === detailsModal) detailsModal.classList.remove('active');
  });
}

function setupSearch() {
  let searchDebounce = null;

  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim();
    clearSearchBtn.style.display = term ? 'block' : 'none';

    clearTimeout(searchDebounce);
    if (!term) {
      loadCategory(currentCategory);
      return;
    }

    if (term.length < 2) {
      filterLocalContent(term.toLowerCase());
      return;
    }

    searchDebounce = setTimeout(() => {
      executeGlobalSearch(term);
    }, 300);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    loadCategory(currentCategory);
  });
}

async function loadCategory(cat) {
  currentCategory = cat;
  loadingState.style.display = 'block';
  contentGrid.innerHTML = '';
  emptyState.style.display = 'none';
  subnavContainer.style.display = 'none';

  try {
    if (cat === 'home') {
      await loadHomeView();
    } else if (cat === 'channels') {
      await loadChannelsView();
    } else if (cat === 'pluto') {
      await loadPlutoView();
    } else if (cat === 'filmes') {
      await loadMoviesView();
    } else {
      await loadCatalogView(cat);
    }
  } catch (err) {
    console.error('Erro ao carregar dados:', err);
    loadingState.style.display = 'none';
    emptyState.style.display = 'block';
  }
}

// 1. CARREGAR HOME (Visão Geral com Destaques e Categorias)
async function loadHomeView() {
  sectionTitle.textContent = 'Destaques e Lançamentos';
  
  if (clientDataCache['home'] && clientDataCache['home'].length > 0) {
    allItems = clientDataCache['home'];
    loadingState.style.display = 'none';
    sectionCount.textContent = `${allItems.length} itens`;
    renderMediaGrid(allItems);
    if (allItems.length > 0) updateHeroBanner(allItems[0]);
    return;
  }
  
  // Carrega amostras de Séries, Animes e Filmes com fontes ativas garantidas
  const [seriesRes, animesRes, lancRes, acaoRes] = await Promise.all([
    fetch('/api/catalog/series').then(r => r.json()).catch(() => ({ items: [] })),
    fetch('/api/catalog/animes').then(r => r.json()).catch(() => ({ items: [] })),
    fetch('/api/movies/lancamentos').then(r => r.json()).catch(() => ({ items: [] })),
    fetch('/api/movies/acao').then(r => r.json()).catch(() => ({ items: [] }))
  ]);

  const series = seriesRes.items || [];
  const animes = animesRes.items || [];
  const filmesLanc = (lancRes.items || []).filter(f => f.isAvailable);
  const filmesAcao = (acaoRes.items || []).filter(f => f.isAvailable);
  const workingMovies = [...filmesLanc, ...filmesAcao];

  allItems = [...workingMovies.slice(0, 10), ...series.slice(0, 12), ...animes.slice(0, 12)];

  clientDataCache['home'] = allItems;

  if (workingMovies.length > 0) {
    updateHeroBanner(workingMovies[Math.floor(Math.random() * Math.min(workingMovies.length, 5))]);
  } else if (series.length > 0) {
    updateHeroBanner(series[0]);
  }

  loadingState.style.display = 'none';
  sectionCount.textContent = `${allItems.length} itens`;
  renderMediaGrid(allItems);
}

// 2. CARREGAR CANAIS AO VIVO
async function loadChannelsView() {
  sectionTitle.textContent = 'Canais de TV Ao Vivo';
  const res = await fetch('/api/channels');
  const data = await res.json();

  channelCategories = data.channels || {};
  let totalChannels = [];
  const categoryNames = Object.keys(channelCategories);

  categoryNames.forEach(c => {
    totalChannels.push(...channelCategories[c]);
  });

  allItems = totalChannels;
  loadingState.style.display = 'none';
  sectionCount.textContent = `${allItems.length} canais`;

  // Renderiza subnav de categorias de canal
  renderSubnavPills(['Todos', ...categoryNames], (selected) => {
    if (selected === 'Todos') {
      renderChannelsGrid(totalChannels);
    } else {
      renderChannelsGrid(channelCategories[selected] || []);
    }
  });

  if (totalChannels.length > 0) {
    updateHeroBanner({
      title: 'TV Aberta & Fechada Ao Vivo',
      synopsis: 'Acompanhe as principais transmissões nacionais e internacionais em HD e FHD sem travar diretamente pelo player web.',
      rating: 'Ao Vivo',
      year: '2026',
      genre: 'Canais de TV',
      backdrop: 'https://image.tmdb.org/t/p/w1920_and_h1080_bestv2/vZsXfIDs3A8jzB46cdwusqxRjdI.jpg',
      streamUrl: totalChannels[0].streamUrl
    });
  }

  renderChannelsGrid(totalChannels);
}

// 3. CARREGAR PLUTO TV
async function loadPlutoView() {
  sectionTitle.textContent = 'Canais Oficiais Pluto TV';
  const res = await fetch('/api/pluto/channels');
  const data = await res.json();

  const channels = data.channels || [];
  allItems = channels;
  loadingState.style.display = 'none';
  sectionCount.textContent = `${channels.length} canais`;

  // Agrupa categorias
  const cats = Array.from(new Set(channels.map(c => c.category || 'Geral')));
  renderSubnavPills(['Todos', ...cats], (selected) => {
    if (selected === 'Todos') {
      renderPlutoGrid(channels);
    } else {
      renderPlutoGrid(channels.filter(c => c.category === selected));
    }
  });

  renderPlutoGrid(channels);
}

// 4. CARREGAR CATÁLOGO (Séries, Animes, Desenhos, etc.)
async function loadCatalogView(catKey) {
  const titlesMap = {
    series: 'Séries Completas',
    animes: 'Animes & Mangás',
    desenhos: 'Desenhos Animados',
    novelas: 'Novelas Brasileiras e Latinas',
    doramas: 'Doramas Asiáticos'
  };

  sectionTitle.textContent = titlesMap[catKey] || catKey.toUpperCase();
  
  if (clientDataCache[catKey] && clientDataCache[catKey].length > 0) {
    allItems = clientDataCache[catKey];
    loadingState.style.display = 'none';
    sectionCount.textContent = `${allItems.length} títulos`;
    renderMediaGrid(allItems);
    if (allItems.length > 0) updateHeroBanner(allItems[0]);
    return;
  }

  const res = await fetch(`/api/catalog/${catKey}`);
  const data = await res.json();

  const items = data.items || [];
  allItems = items;
  clientDataCache[catKey] = items;
  
  loadingState.style.display = 'none';
  sectionCount.textContent = `${items.length} títulos`;

  if (items.length > 0) {
    updateHeroBanner(items[Math.floor(Math.random() * Math.min(items.length, 10))]);
  }

  renderMediaGrid(items);
}

// 5. CARREGAR FILMES
async function loadMoviesView() {
  sectionTitle.textContent = 'Filmes - Lançamentos';

  // Genre pills for movies
  const movieGenres = [
    { key: 'lancamentos', name: 'Lançamentos' },
    { key: 'acao', name: 'Ação' },
    { key: 'aventura', name: 'Aventura' },
    { key: 'comedia', name: 'Comédia' },
    { key: 'suspense', name: 'Suspense' },
    { key: 'terror', name: 'Terror' },
    { key: 'ficcaocientifica', name: 'Ficção Científica' },
    { key: 'animacao', name: 'Animação' },
    { key: 'drama', name: 'Drama' },
    { key: 'romance', name: 'Romance' },
    { key: 'crime', name: 'Crime' },
    { key: 'documentario', name: 'Documentário' },
    { key: 'fantasia', name: 'Fantasia' },
    { key: 'familia', name: 'Família' },
    { key: 'guerra', name: 'Guerra' },
    { key: 'faroeste', name: 'Faroeste' },
    { key: 'misterio', name: 'Mistério' },
    { key: 'thriller', name: 'Thriller' }
  ];

  // Load initial genre (lancamentos com multi-servidores)
  async function loadMovieGenre(genreKey, genreName) {
    sectionTitle.textContent = `Filmes - ${genreName}`;
    
    if (clientDataCache['movies_' + genreKey] && clientDataCache['movies_' + genreKey].length > 0) {
      allItems = clientDataCache['movies_' + genreKey];
      loadingState.style.display = 'none';
      emptyState.style.display = 'none';
      sectionCount.textContent = `${allItems.length} filmes`;
      if (allItems.length > 0) updateHeroBanner(allItems[0]);
      renderMoviesGrid(allItems);
      return;
    }

    loadingState.style.display = 'block';
    contentGrid.innerHTML = '';
    emptyState.style.display = 'none';
    
    try {
      const res = await fetch(`/api/movies/${genreKey}`);
      const data = await res.json();
      const items = data.items || [];
      allItems = items;
      clientDataCache['movies_' + genreKey] = items;
      loadingState.style.display = 'none';
      sectionCount.textContent = `${items.length} filmes`;
      
      if (items.length > 0) {
        updateHeroBanner(items[Math.floor(Math.random() * Math.min(items.length, 10))]);
      }
      
      renderMoviesGrid(items);
    } catch (err) {
      console.error('Erro ao carregar filmes:', err);
      loadingState.style.display = 'none';
      emptyState.style.display = 'block';
    }
  }

  renderSubnavPills(movieGenres.map(g => g.name), (selected) => {
    const genre = movieGenres.find(g => g.name === selected);
    if (genre) loadMovieGenre(genre.key, genre.name);
  });

  await loadMovieGenre('lancamentos', 'Lançamentos');
}

function renderMoviesGrid(items) {
  contentGrid.innerHTML = '';
  if (!items || items.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'media-card';
    const badgeHtml = item.rating 
      ? `<div class="media-rating">★ ${item.rating}</div>`
      : `<div class="media-rating" style="background:rgba(34,197,94,0.85); color:#fff;">HD</div>`;

    card.innerHTML = `
      <div class="media-poster-box">
        <img src="${item.poster}" alt="${item.title}" class="media-poster" loading="lazy" onerror="this.src='https://image.tmdb.org/t/p/w300_and_h450_bestv2/3o7f2Xjwl5hcoiioR9eGdD9ezHt.jpg'">
        ${badgeHtml}
        <div class="media-play-overlay">
          <div class="play-circle"><i data-feather="play"></i></div>
        </div>
      </div>
      <div class="media-info">
        <h4 class="media-title">${item.title}</h4>
        <div class="media-sub">
          <span>${item.year || 'Filme'}</span>
          <span>${item.genre ? item.genre.split(',')[0] : 'Filme'}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => openMovieDetailsModal(item));
    contentGrid.appendChild(card);
  });

  feather.replace();
}

async function openMovieDetailsModal(item) {
  activeModalItem = item;
  modalTitle.textContent = item.title;
  modalSynopsis.textContent = item.synopsis || 'Sem sinopse disponível.';
  modalRating.textContent = `★ ${item.rating || '7.5'}`;
  modalYear.textContent = item.year || '';
  modalCategory.textContent = 'FILME';
  modalGenre.textContent = item.genre || 'Geral';
  detailsBanner.style.backgroundImage = `url('${item.backdrop || item.poster}')`;

  // Garante que a seção de temporadas NUNCA apareça em filmes
  if (seasonsSection) seasonsSection.style.display = 'none';
  if (seasonPills) seasonPills.innerHTML = '';
  if (episodesGrid) episodesGrid.innerHTML = '';
  if (episodesLoading) episodesLoading.style.display = 'none';
  
  // Limpa alerta e seletor de servidores anteriores
  const existingAlert = document.getElementById('movieModalAlert');
  if (existingAlert) existingAlert.remove();
  const existingServerPicker = document.getElementById('movieModalServerPicker');
  if (existingServerPicker) existingServerPicker.remove();

  // Determina TMDB ID
  const tmdbId = item.tmdbId || (/^\d+$/.test(item.id) ? item.id : null);
  const link = item.externalLink || '';

  // Monta lista de servidores disponíveis
  const servers = [];
  if (link && link !== 'here') {
    servers.push({
      id: 'server1',
      name: 'Servidor 1 (Stream Direto HD)',
      badge: 'Nativo HD',
      color: '#10b981',
      type: 'direct',
      url: `/api/movie/stream?link=${encodeURIComponent(link)}&title=${encodeURIComponent(item.title)}`
    });
  }

  if (tmdbId) {
    servers.push({
      id: 'server2',
      name: 'Servidor 2 (Dublado VIP)',
      badge: 'Dublado PT-BR',
      color: '#3b82f6',
      type: 'embed',
      url: `https://embedrise.com/filme/${tmdbId}`
    });
    servers.push({
      id: 'server3',
      name: 'Servidor 3 (Multi-Players)',
      badge: 'Multi-Fontes',
      color: '#8b5cf6',
      type: 'embed',
      url: `https://multiembed.mov/?video_id=${tmdbId}&tmdb=1`
    });
    servers.push({
      id: 'server4',
      name: 'Servidor 4 (VidLink Pro HD)',
      badge: '1080p Ultra',
      color: '#f59e0b',
      type: 'embed',
      url: `https://vidlink.pro/movie/${tmdbId}`
    });
    servers.push({
      id: 'server5',
      name: 'Servidor 5 (Backup Global)',
      badge: 'Internacional',
      color: '#64748b',
      type: 'embed',
      url: `https://embedder.net/e/movie?tmdb=${tmdbId}`
    });
  }

  let selectedServerIndex = 0;

  // Função para executar a reprodução de um servidor específico
  async function launchMovieServer(srvIndex) {
    const srv = servers[srvIndex];
    if (!srv) return;

    // Configura os servidores no player para troca dinâmica durante o filme
    if (typeof setupPlayerServers === 'function') {
      setupPlayerServers(servers, srvIndex, item.title);
    }

    if (srv.type === 'direct') {
      modalPlayBtn.disabled = true;
      modalPlayBtn.innerHTML = '<span class="spinner-sm" style="display:inline-block; vertical-align:middle; width:16px; height:16px; margin-right:8px;"></span> Conectando ao Servidor 1...';
      
      const oldAlert = document.getElementById('movieModalAlert');
      if (oldAlert) oldAlert.remove();

      try {
        const res = await fetch(srv.url);
        const data = await res.json();
        modalPlayBtn.disabled = false;
        modalPlayBtn.innerHTML = '<i data-feather="play"></i> Assistir Filme';
        feather.replace();

        if (data.success && data.streamUrl) {
          detailsModal.classList.remove('active');
          playStream(data.streamUrl, item.title);
        } else {
          showMovieAlternativeAlert(srvIndex);
        }
      } catch (err) {
        modalPlayBtn.disabled = false;
        modalPlayBtn.innerHTML = '<i data-feather="play"></i> Assistir Filme';
        feather.replace();
        showMovieAlternativeAlert(srvIndex);
      }
    } else {
      // Embed alternativo (EmbedRise, MultiEmbed, Vidlink, Embedder)
      detailsModal.classList.remove('active');
      playStream(srv.url, item.title);
    }
  }

  function showMovieAlternativeAlert(failedIndex) {
    const oldAlert = document.getElementById('movieModalAlert');
    if (oldAlert) oldAlert.remove();

    const alertDiv = document.createElement('div');
    alertDiv.id = 'movieModalAlert';
    alertDiv.style.cssText = 'margin-top:16px; padding:14px 18px; border-radius:12px; background:rgba(30, 41, 59, 0.95); border:1px solid rgba(59, 130, 246, 0.4); color:#e2e8f0; font-size:0.9rem; line-height:1.5;';
    
    const altButtons = servers
      .map((s, idx) => {
        if (idx === failedIndex) return '';
        return `<button class="btn btn-sm" style="background:#2563eb; color:#fff; font-weight:600; padding:8px 14px; border-radius:8px; border:none; cursor:pointer; margin:4px; display:inline-flex; align-items:center; gap:6px;" onclick="window.launchSelectedMovieServer(${idx})">▶ Assistir via ${s.name}</button>`;
      })
      .filter(Boolean)
      .join('');

    alertDiv.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
        <span style="font-size:1.3rem;">⚡</span>
        <strong style="color:#60a5fa; font-size:0.95rem;">Servidor 1 ocupado no momento. Escolha outro player para assistir:</strong>
      </div>
      <p style="margin-bottom:10px; color:#cbd5e1; font-size:0.85rem;">Os servidores abaixo estão online e prontos para reproduzir este filme imediatamente:</p>
      <div style="display:flex; flex-wrap:wrap; gap:6px;">
        ${altButtons}
      </div>
    `;

    modalPlayBtn.parentNode.insertBefore(alertDiv, modalPlayBtn.nextSibling);
    if (window.feather) feather.replace();
  }

  // Cria seletor de servidores no modal
  if (servers.length > 1) {
    const pickerDiv = document.createElement('div');
    pickerDiv.id = 'movieModalServerPicker';
    pickerDiv.style.cssText = 'margin-top:16px; margin-bottom:14px; padding:12px 14px; background:rgba(15, 23, 42, 0.75); border:1px solid rgba(59, 130, 246, 0.25); border-radius:12px;';
    
    let chipsHtml = servers.map((srv, idx) => {
      const isSelected = idx === selectedServerIndex;
      return `
        <button type="button" class="movie-server-chip" data-index="${idx}" style="background:${isSelected ? '#2563eb' : '#1e293b'}; color:#fff; border:1px solid ${isSelected ? '#60a5fa' : '#334155'}; border-radius:8px; padding:7px 12px; font-size:0.82rem; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:6px; transition:all 0.2s ease;">
          <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${srv.color || '#38bdf8'};"></span>
          ${srv.name}
        </button>
      `;
    }).join('');

    pickerDiv.innerHTML = `
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
        <span style="font-size:0.8rem; font-weight:700; color:#93c5fd; text-transform:uppercase; letter-spacing:0.5px; display:flex; align-items:center; gap:5px;">
          <i data-feather="server" style="width:13px; height:13px;"></i> Selecionar Servidor / Player:
        </span>
        <span style="font-size:0.75rem; color:#64748b;">${servers.length} Opções</span>
      </div>
      <div class="chips-container" style="display:flex; flex-wrap:wrap; gap:8px;">
        ${chipsHtml}
      </div>
    `;

    modalPlayBtn.parentNode.insertBefore(pickerDiv, modalPlayBtn);

    // Eventos de clique nos chips
    pickerDiv.querySelectorAll('.movie-server-chip').forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const idx = parseInt(chip.getAttribute('data-index'), 10);
        selectedServerIndex = idx;
        pickerDiv.querySelectorAll('.movie-server-chip').forEach(c => {
          c.style.background = '#1e293b';
          c.style.borderColor = '#334155';
        });
        chip.style.background = '#2563eb';
        chip.style.borderColor = '#60a5fa';
        modalPlayBtn.innerHTML = `<i data-feather="play"></i> Assistir via ${servers[idx].name}`;
        if (window.feather) feather.replace();
      });
    });
  }

  // Registra globalmente para cliques dentro de alertas
  window.launchSelectedMovieServer = launchMovieServer;

  modalPlayBtn.className = 'btn btn-primary';
  modalPlayBtn.innerHTML = '<i data-feather="play"></i> Assistir Filme';
  modalPlayBtn.disabled = false;
  modalPlayBtn.onclick = () => launchMovieServer(selectedServerIndex);
  
  feather.replace();
  detailsModal.classList.add('active');
}

// RENDERIZAÇÃO DE CARDS DE MÍDIA
function renderMediaGrid(items) {
  contentGrid.innerHTML = '';
  if (!items || items.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  items.forEach(item => {
    const isMovie = item.category === 'filmes' || item.contentType === 'movie';
    const isCinemaOnly = isMovie && item.isAvailable === false;
    
    let badgeHtml = '';
    if (isCinemaOnly) {
      badgeHtml = `<div class="media-rating" style="background:rgba(234,88,12,0.85); color:#fff; border:1px solid rgba(249,115,22,0.5);">🎬 CINEMA</div>`;
    } else if (isMovie && item.isAvailable) {
      badgeHtml = `<div class="media-rating" style="background:rgba(34,197,94,0.85); color:#fff;">HD</div>`;
    } else if (item.rating) {
      badgeHtml = `<div class="media-rating">★ ${item.rating}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'media-card';
    card.innerHTML = `
      <div class="media-poster-box">
        <img src="${item.poster}" alt="${item.title}" class="media-poster" loading="lazy" onerror="this.src='https://image.tmdb.org/t/p/w300_and_h450_bestv2/3o7f2Xjwl5hcoiioR9eGdD9ezHt.jpg'">
        ${badgeHtml}
        <div class="media-play-overlay">
          <div class="play-circle"><i data-feather="${isCinemaOnly ? 'film' : 'play'}"></i></div>
        </div>
      </div>
      <div class="media-info">
        <h4 class="media-title">${item.title}</h4>
        <div class="media-sub">
          <span>${item.year || (isMovie ? 'Filme' : (item.category || 'Mídia').toUpperCase())}</span>
          <span>${item.genre ? item.genre.split(',')[0] : (isMovie ? 'Filme' : '')}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      if (isMovie) {
        openMovieDetailsModal(item);
      } else {
        openDetailsModal(item);
      }
    });
    contentGrid.appendChild(card);
  });

  feather.replace();
}

// RENDERIZAÇÃO DE CANAIS
function renderChannelsGrid(channels) {
  contentGrid.innerHTML = '';
  if (!channels || channels.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  channels.forEach(ch => {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.innerHTML = `
      <div class="channel-logo-wrapper">
        <img src="${ch.thumbnail}" alt="${ch.title}" class="channel-logo" loading="lazy" onerror="this.src='https://i.imgur.com/dRfcHTf.jpg'">
      </div>
      <h4 class="channel-title">${ch.title}</h4>
      <span class="channel-tag">${ch.category}</span>
    `;

    card.addEventListener('click', () => {
      playStream(ch.streamUrl, ch.title);
    });
    contentGrid.appendChild(card);
  });
}

function renderPlutoGrid(channels) {
  contentGrid.innerHTML = '';
  if (!channels || channels.length === 0) {
    emptyState.style.display = 'block';
    return;
  }
  emptyState.style.display = 'none';

  channels.forEach(ch => {
    const card = document.createElement('div');
    card.className = 'channel-card';
    card.innerHTML = `
      <div class="channel-logo-wrapper">
        <img src="${ch.logo}" alt="${ch.name}" class="channel-logo" loading="lazy">
      </div>
      <h4 class="channel-title">${ch.name}</h4>
      <span class="channel-tag">${ch.category}</span>
    `;

    card.addEventListener('click', () => {
      playStream(ch.streamUrl, ch.name);
    });
    contentGrid.appendChild(card);
  });
}

function renderSubnavPills(categories, onSelect) {
  subnavContainer.style.display = 'block';
  subnavPills.innerHTML = '';

  categories.forEach((cat, idx) => {
    const pill = document.createElement('button');
    pill.className = 'subnav-pill' + (idx === 0 ? ' active' : '');
    pill.textContent = cat;

    pill.addEventListener('click', () => {
      document.querySelectorAll('.subnav-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      onSelect(cat);
    });

    subnavPills.appendChild(pill);
  });
}

function updateHeroBanner(item) {
  if (!item) return;
  heroTitle.textContent = item.title;
  heroSynopsis.textContent = item.synopsis || 'Sem sinopse disponível.';
  heroRating.textContent = `★ ${item.rating || '8.2'}`;
  heroYear.textContent = item.year || '2024';
  heroGenre.textContent = item.genre || 'Destaque';
  heroBackdrop.style.backgroundImage = `url('${item.backdrop || item.poster}')`;

  heroPlayBtn.onclick = () => {
    if (item.category === 'filmes' || item.contentType === 'movie') {
      openMovieDetailsModal(item);
    } else if (item.streamUrl) {
      playStream(item.streamUrl, item.title, true);
    } else {
      openDetailsModal(item);
    }
  };

  heroInfoBtn.onclick = () => {
    if (item.category === 'filmes' || item.contentType === 'movie') {
      openMovieDetailsModal(item);
    } else {
      openDetailsModal(item);
    }
  };
}

async function openDetailsModal(item) {
  if (!item) return;

  // Se for filme, nunca exibir temporadas e episódios: redirecionar imediatamente para o modal de filme
  const isMovie = item.category === 'filmes' || 
                  item.contentType === 'movie' || 
                  (item.externalLink && (item.externalLink.includes('resolver3_mv') || item.externalLink.includes('resolver2_mv') || item.externalLink.includes('movie2=')));
  if (isMovie) {
    return openMovieDetailsModal(item);
  }

  // Limpa alerta anterior de filme se existir
  const existingAlert = document.getElementById('movieModalAlert');
  if (existingAlert) existingAlert.remove();

  activeModalItem = item;
  modalTitle.textContent = item.title;
  modalSynopsis.textContent = item.synopsis || 'Sem sinopse disponível no momento.';
  modalRating.textContent = `★ ${item.rating || '7.5'}`;
  modalYear.textContent = item.year || '2024';
  modalCategory.textContent = (item.category || 'Mídia').toUpperCase();
  modalGenre.textContent = item.genre || 'Geral';
  detailsBanner.style.backgroundImage = `url('${item.backdrop || item.poster}')`;

  // Se for canal de TV ao vivo ou Pluto TV
  const isLive = item.category === 'channels' || item.category === 'pluto' || item.streamUrl;
  if (isLive) {
    if (seasonsSection) seasonsSection.style.display = 'none';
    modalPlayBtn.innerHTML = '<i data-feather="play"></i> Assistir Ao Vivo';
    modalPlayBtn.disabled = false;
    modalPlayBtn.onclick = () => {
      detailsModal.classList.remove('active');
      playStream(item.streamUrl, item.title, true);
    };
    feather.replace();
    detailsModal.classList.add('active');
    return;
  }

  // É uma Série, Anime, Desenho, Novela ou Dorama
  if (seasonsSection) seasonsSection.style.display = 'block';
  if (episodesLoading) episodesLoading.style.display = 'flex';
  if (seasonPills) seasonPills.innerHTML = '';
  if (episodesGrid) episodesGrid.innerHTML = '';
  if (seasonsCountBadge) seasonsCountBadge.textContent = 'Buscando...';

  modalPlayBtn.innerHTML = '<i data-feather="loader"></i> Carregando episódios...';
  modalPlayBtn.disabled = true;
  detailsModal.classList.add('active');
  feather.replace();

  try {
    const linkParam = item.externalLink || item.id || '';
    const res = await fetch(`/api/media/episodes?link=${encodeURIComponent(linkParam)}&title=${encodeURIComponent(item.title)}`);
    const data = await res.json();

    if (episodesLoading) episodesLoading.style.display = 'none';

    if (data.success && data.seasons && data.seasons.length > 0) {
      const seasons = data.seasons;
      if (seasonsCountBadge) {
        seasonsCountBadge.textContent = `${seasons.length} Temporada${seasons.length > 1 ? 's' : ''}`;
      }

      // Renderiza as abas de Temporadas
      renderSeasonPills(seasons, item);

      // Define botão principal para o primeiro episódio
      const firstSeason = seasons[0];
      const firstEp = firstSeason.episodes && firstSeason.episodes[0];
      if (firstEp) {
        modalPlayBtn.innerHTML = '<i data-feather="play"></i> Assistir Episódio 1';
        modalPlayBtn.disabled = false;
        modalPlayBtn.onclick = () => {
          playEpisode(item, firstEp);
        };
      } else {
        modalPlayBtn.innerHTML = '<i data-feather="play"></i> Reproduzir';
        modalPlayBtn.disabled = true;
      }
    } else {
      if (seasonsCountBadge) seasonsCountBadge.textContent = 'Sem episódios';
      if (episodesGrid) {
        episodesGrid.innerHTML = '<div class="no-episodes">Nenhum episódio disponível para esta obra no momento.</div>';
      }
      modalPlayBtn.innerHTML = '<i data-feather="alert-circle"></i> Episódios Indisponíveis';
      modalPlayBtn.disabled = true;
    }
  } catch (err) {
    console.error('Erro ao carregar episódios:', err);
    if (episodesLoading) episodesLoading.style.display = 'none';
    if (episodesGrid) {
      episodesGrid.innerHTML = '<div class="no-episodes">Falha ao conectar com o servidor para buscar episódios.</div>';
    }
    modalPlayBtn.innerHTML = '<i data-feather="alert-triangle"></i> Erro ao carregar';
    modalPlayBtn.disabled = true;
  }

  feather.replace();
}

function renderSeasonPills(seasons, item) {
  if (!seasonPills) return;
  seasonPills.innerHTML = '';

  seasons.forEach((season, index) => {
    const pill = document.createElement('button');
    pill.className = 'season-pill' + (index === 0 ? ' active' : '');
    pill.textContent = season.name || `Temporada ${season.season}`;

    pill.addEventListener('click', () => {
      document.querySelectorAll('.season-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      renderEpisodesGrid(season.episodes || [], item);
    });

    seasonPills.appendChild(pill);
  });

  // Renderiza episódios da primeira temporada por padrão
  if (seasons.length > 0) {
    renderEpisodesGrid(seasons[0].episodes || [], item);
  }
}

function renderEpisodesGrid(episodes, item) {
  if (!episodesGrid) return;
  episodesGrid.innerHTML = '';

  if (!episodes || episodes.length === 0) {
    episodesGrid.innerHTML = '<div class="no-episodes">Nenhum episódio cadastrado nesta temporada.</div>';
    return;
  }

  episodes.forEach(ep => {
    const card = document.createElement('div');
    card.className = 'episode-card';
    card.innerHTML = `
      <div class="episode-card-header">
        <span class="episode-num-badge">EP ${ep.number}</span>
        <div class="episode-play-icon"><i data-feather="play"></i></div>
      </div>
      <div class="episode-title">${ep.title || `Episódio ${ep.number}`}</div>
    `;

    card.addEventListener('click', () => {
      playEpisode(item, ep, card);
    });

    episodesGrid.appendChild(card);
  });

  feather.replace();
}

async function playEpisode(item, ep, cardElement = null) {
  if (cardElement) {
    cardElement.classList.add('active-ep');
  }

  // Abre o player imediatamente com estado de loading
  playStream(null, `${item.title} - ${ep.title || `Episódio ${ep.number}`}`);

  try {
    const res = await fetch(`/api/episode/stream?streamId=${encodeURIComponent(ep.streamId)}&type=${ep.type || 'resolver3'}`);
    const data = await res.json();

    if (data.success && data.streamUrl) {
      playStream(data.streamUrl, `${item.title} - ${ep.title || `Episódio ${ep.number}`}`);
    } else {
      showPlayerError(data.error || 'O link de vídeo deste episódio não pôde ser resolvido.');
    }
  } catch (err) {
    console.error('Erro ao resolver stream:', err);
    showPlayerError('Falha de comunicação com o servidor para obter o vídeo.');
  }
}

function filterLocalContent(term) {
  if (!term) {
    if (currentCategory === 'channels') renderChannelsGrid(allItems);
    else if (currentCategory === 'pluto') renderPlutoGrid(allItems);
    else if (currentCategory === 'filmes') renderMoviesGrid(allItems);
    else renderMediaGrid(allItems);
    return;
  }

  const filtered = allItems.filter(item => {
    const title = (item.title || item.name || '').toLowerCase();
    const synopsis = (item.synopsis || '').toLowerCase();
    const genre = (item.genre || item.category || '').toLowerCase();
    return title.includes(term) || synopsis.includes(term) || genre.includes(term);
  });

  sectionCount.textContent = `${filtered.length} resultados`;

  if (currentCategory === 'channels') renderChannelsGrid(filtered);
  else if (currentCategory === 'pluto') renderPlutoGrid(filtered);
  else if (currentCategory === 'filmes') renderMoviesGrid(filtered);
  else renderMediaGrid(filtered);
}

async function executeGlobalSearch(term) {
  loadingState.style.display = 'block';
  contentGrid.innerHTML = '';
  emptyState.style.display = 'none';
  subnavContainer.style.display = 'none';
  sectionTitle.textContent = `Resultados para "${term}"`;
  sectionCount.textContent = 'Buscando em todo o catálogo...';

  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(term)}`);
    const data = await res.json();
    const items = data.items || [];

    loadingState.style.display = 'none';
    sectionCount.textContent = `${items.length} ${items.length === 1 ? 'resultado encontrado' : 'resultados encontrados'}`;

    if (items.length === 0) {
      emptyState.style.display = 'block';
      return;
    }

    renderSearchResults(items);
  } catch (err) {
    console.error('Erro na busca global:', err);
    loadingState.style.display = 'none';
    filterLocalContent(term.toLowerCase());
  }
}

function renderSearchResults(items) {
  contentGrid.innerHTML = '';
  emptyState.style.display = 'none';

  items.forEach(item => {
    const isLive = item.category === 'channels' || item.category === 'pluto' || item.streamUrl;
    if (isLive) {
      const card = document.createElement('div');
      card.className = 'channel-card';
      card.innerHTML = `
        <div class="channel-logo-wrapper">
          <img src="${item.thumbnail || item.logo || 'https://i.imgur.com/dRfcHTf.jpg'}" alt="${item.title || item.name}" class="channel-logo" loading="lazy" onerror="this.src='https://i.imgur.com/dRfcHTf.jpg'">
        </div>
        <h4 class="channel-title">${item.title || item.name}</h4>
        <span class="channel-tag">${item.category || 'Ao Vivo'}</span>
      `;
      card.addEventListener('click', () => {
        playStream(item.streamUrl, item.title || item.name, true);
      });
      contentGrid.appendChild(card);
      return;
    }

    const isMovie = item.category === 'filmes' || item.contentType === 'movie';
    const isCinemaOnly = isMovie && item.isAvailable === false;

    let badgeHtml = '';
    if (isCinemaOnly) {
      badgeHtml = `<div class="media-rating" style="background:rgba(234,88,12,0.85); color:#fff; border:1px solid rgba(249,115,22,0.5);">🎬 CINEMA</div>`;
    } else if (isMovie && item.isAvailable) {
      badgeHtml = `<div class="media-rating" style="background:rgba(34,197,94,0.85); color:#fff;">HD</div>`;
    } else if (item.rating) {
      badgeHtml = `<div class="media-rating">★ ${item.rating}</div>`;
    }

    const card = document.createElement('div');
    card.className = 'media-card';
    card.innerHTML = `
      <div class="media-poster-box">
        <img src="${item.poster || 'https://image.tmdb.org/t/p/w300_and_h450_bestv2/3o7f2Xjwl5hcoiioR9eGdD9ezHt.jpg'}" alt="${item.title}" class="media-poster" loading="lazy" onerror="this.src='https://image.tmdb.org/t/p/w300_and_h450_bestv2/3o7f2Xjwl5hcoiioR9eGdD9ezHt.jpg'">
        ${badgeHtml}
        <div class="media-play-overlay">
          <div class="play-circle"><i data-feather="${isCinemaOnly ? 'film' : 'play'}"></i></div>
        </div>
      </div>
      <div class="media-info">
        <h4 class="media-title">${item.title}</h4>
        <div class="media-sub">
          <span>${item.year || (isMovie ? 'Filme' : (item.category || 'Mídia').toUpperCase())}</span>
          <span>${item.genre ? item.genre.split(',')[0] : (isMovie ? 'Filme' : (item.category || ''))}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => {
      if (isMovie) {
        openMovieDetailsModal(item);
      } else {
        openDetailsModal(item);
      }
    });

    contentGrid.appendChild(card);
  });

  feather.replace();
}
