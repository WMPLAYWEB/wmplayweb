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

  // Logout
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login.html';
    });
  }
}

function setupSearch() {
  searchInput.addEventListener('input', (e) => {
    const term = e.target.value.trim().toLowerCase();
    clearSearchBtn.style.display = term ? 'block' : 'none';
    filterContent(term);
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.style.display = 'none';
    filterContent('');
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
  
  // Carrega amostras de Séries, Animes e Filmes em paralelo
  const [seriesRes, animesRes, filmesRes] = await Promise.all([
    fetch('/api/catalog/series').then(r => r.json()).catch(() => ({ items: [] })),
    fetch('/api/catalog/animes').then(r => r.json()).catch(() => ({ items: [] })),
    fetch('/api/movies/lancamentos').then(r => r.json()).catch(() => ({ items: [] }))
  ]);

  const series = seriesRes.items || [];
  const animes = animesRes.items || [];
  const filmes = filmesRes.items || [];
  allItems = [...filmes.slice(0, 8), ...series.slice(0, 12), ...animes.slice(0, 12)];

  clientDataCache['home'] = allItems;

  if (series.length > 0) {
    updateHeroBanner(series[Math.floor(Math.random() * Math.min(series.length, 10))]);
  } else if (allItems.length > 0) {
    updateHeroBanner(allItems[0]);
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
    { key: 'drama', name: 'Drama' },
    { key: 'terror', name: 'Terror' },
    { key: 'suspense', name: 'Suspense' },
    { key: 'ficcaocientifica', name: 'Ficção Científica' },
    { key: 'animacao', name: 'Animação' },
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

  // Load initial genre (lancamentos)
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
    const isCinemaOnly = item.isAvailable === false;
    const badgeHtml = isCinemaOnly 
      ? `<div class="media-rating" style="background:rgba(234,88,12,0.85); color:#fff; border:1px solid rgba(249,115,22,0.5);">🎬 CINEMA</div>`
      : (item.rating ? `<div class="media-rating">★ ${item.rating}</div>` : `<div class="media-rating" style="background:rgba(34,197,94,0.85); color:#fff;">HD</div>`);

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
          <span>${item.year || 'Filme'}</span>
          <span>${item.genre ? item.genre.split(',')[0] : (isCinemaOnly ? 'Em Breve' : 'Filme')}</span>
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

  if (seasonsSection) seasonsSection.style.display = 'none';
  
  // Limpa alerta anterior
  const existingAlert = document.getElementById('movieModalAlert');
  if (existingAlert) existingAlert.remove();

  const isCinemaOnly = item.isAvailable === false;
  if (isCinemaOnly) {
    modalPlayBtn.className = 'btn btn-secondary';
    modalPlayBtn.innerHTML = '<i data-feather="film"></i> Em Breve nos Cinemas';
    modalPlayBtn.disabled = true;
    
    const alertDiv = document.createElement('div');
    alertDiv.id = 'movieModalAlert';
    alertDiv.style.cssText = 'margin-top:16px; padding:14px 18px; border-radius:12px; background:rgba(234,88,12,0.15); border:1px solid rgba(249,115,22,0.35); color:#fdba74; font-size:0.9rem; line-height:1.5; display:flex; align-items:flex-start; gap:12px;';
    alertDiv.innerHTML = `
      <span style="font-size:1.3rem;">🎬</span>
      <div>
        <strong style="color:#fff;">Título em Exibição / Lançamento de Cinema (${item.year || '2026'})</strong><br>
        Este filme ainda está em exibição nas salas de cinema e ainda não foi liberado pelas distribuidoras para transmissão digital. A versão em streaming estará disponível automaticamente assim que for lançada mundialmente. Aproveite os outros títulos disponíveis com selo <strong>HD</strong> ou navegue nas categorias como <em>Ação</em> e <em>Terror</em>!
      </div>
    `;
    modalPlayBtn.parentNode.insertBefore(alertDiv, modalPlayBtn.nextSibling);
    feather.replace();
    detailsModal.classList.add('active');
    return;
  }

  modalPlayBtn.className = 'btn btn-primary';
  modalPlayBtn.innerHTML = '<i data-feather="play"></i> Assistir Filme';
  modalPlayBtn.disabled = false;
  modalPlayBtn.onclick = async () => {
    // Show spinner inside button
    modalPlayBtn.disabled = true;
    modalPlayBtn.innerHTML = '<span class="spinner-sm" style="display:inline-block; vertical-align:middle; width:16px; height:16px; margin-right:8px;"></span> Conectando ao servidor...';
    
    // Clear old alert
    const oldAlert = document.getElementById('movieModalAlert');
    if (oldAlert) oldAlert.remove();
    
    try {
      const link = item.externalLink || '';
      const res = await fetch(`/api/movie/stream?link=${encodeURIComponent(link)}&title=${encodeURIComponent(item.title)}`);
      const data = await res.json();
      
      if (data.success && data.streamUrl) {
        modalPlayBtn.innerHTML = '<i data-feather="play"></i> Assistir Filme';
        modalPlayBtn.disabled = false;
        feather.replace();
        detailsModal.classList.remove('active');
        playStream(data.streamUrl, item.title);
      } else {
        modalPlayBtn.innerHTML = '<i data-feather="alert-circle"></i> Transmissão Indisponível';
        modalPlayBtn.disabled = false;
        
        const alertDiv = document.createElement('div');
        alertDiv.id = 'movieModalAlert';
        alertDiv.style.cssText = 'margin-top:16px; padding:12px 16px; border-radius:12px; background:rgba(239,68,68,0.15); border:1px solid rgba(239,68,68,0.3); color:#fca5a5; font-size:0.88rem; line-height:1.4; display:flex; align-items:flex-start; gap:10px;';
        alertDiv.innerHTML = `
          <span style="font-size:1.2rem;">⚠️</span>
          <div>
            <strong>Fonte de Vídeo Temporariamente Ocupada</strong><br>
            Não foi possível estabelecer conexão com o servidor de vídeo deste filme no momento. Por favor, tente novamente em instantes ou selecione outro filme do catálogo.
          </div>
        `;
        modalPlayBtn.parentNode.insertBefore(alertDiv, modalPlayBtn.nextSibling);
        feather.replace();
      }
    } catch (err) {
      console.error('Erro ao reproduzir filme:', err);
      modalPlayBtn.innerHTML = '<i data-feather="refresh-cw"></i> Tentar Novamente';
      modalPlayBtn.disabled = false;
      feather.replace();
    }
  };
  
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
    const card = document.createElement('div');
    card.className = 'media-card';
    card.innerHTML = `
      <div class="media-poster-box">
        <img src="${item.poster}" alt="${item.title}" class="media-poster" loading="lazy" onerror="this.src='https://image.tmdb.org/t/p/w300_and_h450_bestv2/3o7f2Xjwl5hcoiioR9eGdD9ezHt.jpg'">
        ${item.rating ? `<div class="media-rating">★ ${item.rating}</div>` : ''}
        <div class="media-play-overlay">
          <div class="play-circle"><i data-feather="play"></i></div>
        </div>
      </div>
      <div class="media-info">
        <h4 class="media-title">${item.title}</h4>
        <div class="media-sub">
          <span>${item.year || item.category.toUpperCase()}</span>
          <span>${item.genre ? item.genre.split(',')[0] : ''}</span>
        </div>
      </div>
    `;

    card.addEventListener('click', () => openDetailsModal(item));
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

function filterContent(term) {
  if (!term) {
    if (currentCategory === 'channels') renderChannelsGrid(allItems);
    else if (currentCategory === 'pluto') renderPlutoGrid(allItems);
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
  else renderMediaGrid(filtered);
}
