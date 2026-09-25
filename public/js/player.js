// Gerenciador do Player de Vídeo (HLS, MP4 e Embed com Multi-Servidores e Escudo Anti-Anúncios)
let hlsInstance = null;
const videoElement = document.getElementById('videoPlayer');
const embedPlayer = document.getElementById('embedPlayer');
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const playerLoading = document.getElementById('playerLoading');
const playerLoadingText = document.getElementById('playerLoadingText');
const playerError = document.getElementById('playerError');
const playerErrorMsg = document.getElementById('playerErrorMsg');
const retryStreamBtn = document.getElementById('retryStreamBtn');
const closePlayerBtn = document.getElementById('closePlayerBtn');
const playerLiveTag = document.getElementById('playerLiveTag');
const playerServerControls = document.getElementById('playerServerControls');
const playerServerSelect = document.getElementById('playerServerSelect');
const playerAlternativeServers = document.getElementById('playerAlternativeServers');

// --- ESCUDO ANTI-ANÚNCIOS & ANTI-POPUPS ---
const _nativeWindowOpen = window.open;
let isShieldActive = false;

function activatePopupShield() {
  if (isShieldActive) return;
  isShieldActive = true;
  window.open = function(url) {
    console.warn('[WMPlayWeb Shield] Bloqueada tentativa de abertura de aba/anúncio:', url);
    return null;
  };
}

function deactivatePopupShield() {
  if (!isShieldActive) return;
  isShieldActive = false;
  window.open = _nativeWindowOpen;
}

let currentStreamUrl = null;
let currentStreamTitle = '';
let currentIsLive = false;
let currentActiveServers = [];
let currentServerIndex = 0;

function setupPlayerServers(servers, activeIndex = 0, title = '') {
  currentActiveServers = servers || [];
  currentServerIndex = activeIndex;
  if (title) currentStreamTitle = title;
  
  if (!playerServerControls || !playerServerSelect) return;
  
  if (currentActiveServers.length > 1) {
    playerServerControls.style.display = 'flex';
    playerServerSelect.innerHTML = '';
    currentActiveServers.forEach((srv, idx) => {
      const opt = document.createElement('option');
      opt.value = idx;
      opt.textContent = srv.name;
      if (idx === activeIndex) opt.selected = true;
      playerServerSelect.appendChild(opt);
    });
  } else {
    playerServerControls.style.display = 'none';
  }
}

if (playerServerSelect) {
  playerServerSelect.addEventListener('change', async (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && currentActiveServers[idx]) {
      await switchToServer(idx);
    }
  });
}

async function switchToServer(index) {
  currentServerIndex = index;
  const srv = currentActiveServers[index];
  if (!srv) return;
  
  if (playerServerSelect) playerServerSelect.value = index;
  playerLoading.style.display = 'flex';
  if (playerLoadingText) playerLoadingText.textContent = `Conectando ao ${srv.name}...`;
  playerError.style.display = 'none';
  if (playerAlternativeServers) playerAlternativeServers.style.display = 'none';
  
  if (srv.type === 'direct' && srv.url.startsWith('/api/movie/stream')) {
    try {
      const res = await fetch(srv.url);
      const data = await res.json();
      if (data.success && data.streamUrl) {
        playStream(data.streamUrl, currentStreamTitle);
      } else {
        showPlayerError('Servidor 1 temporariamente indisponível.');
      }
    } catch (err) {
      showPlayerError('Falha ao conectar com o Servidor 1.');
    }
  } else {
    playStream(srv.url, currentStreamTitle);
  }
}

function playStream(url, title = 'Reproduzindo', isLive = false) {
  if (!url) {
    showPlayerError('Link de reprodução indisponível para este item.');
    return;
  }

  // Fecha imediatamente qualquer modal de detalhes aberto para evitar modais sobrepostos
  const detailsModal = document.getElementById('detailsModal');
  if (detailsModal) {
    detailsModal.classList.remove('active');
  }

  // Se for canal com link legado chresolver1 em cache do navegador, resolve na hora
  if (url && url.startsWith('chresolver1=')) {
    const parts = url.replace('chresolver1=', '').split('#');
    const chId = parts[0];
    url = `/api/proxy/stream?url=${encodeURIComponent(`http://sixcine.store:80/live/468489339/355818635/${chId}.m3u8`)}&ua=XC-IPTV`;
  }

  currentStreamUrl = url;
  currentStreamTitle = title;
  currentIsLive = isLive || url.includes('/api/proxy/stream') || url.includes('.m3u8');

  playerTitle.textContent = title;
  if (playerLiveTag) {
    playerLiveTag.style.display = currentIsLive ? 'inline-flex' : 'none';
  }

  playerModal.classList.add('active');
  playerLoading.style.display = 'flex';
  if (playerLoadingText) playerLoadingText.textContent = 'Carregando vídeo...';
  playerError.style.display = 'none';
  if (playerAlternativeServers) playerAlternativeServers.style.display = 'none';

  // Limpa instância HLS anterior se houver
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  // Remove fontes anteriores do elemento de vídeo
  videoElement.pause();
  videoElement.removeAttribute('src');

  // CASO 1: É um Embed / Iframe explícito (somente para provedores externos reais que não suportam HLS)
  const isEmbed = !currentIsLive && !url.includes('/api/') && (
    url.includes('vidlink.pro') ||
    url.includes('vidsrc') ||
    url.includes('autoembed') ||
    url.includes('/embed') ||
    url.includes('blogger.com') ||
    url.includes('superembed') ||
    url.includes('player')
  );

  if (isEmbed && embedPlayer) {
    activatePopupShield();
    videoElement.style.display = 'none';
    embedPlayer.style.display = 'block';
    embedPlayer.src = url;
    
    // Oculta o loading rapidamente para que o usuário possa interagir com os controles nativos do player
    const hideLoading = () => {
      if (playerLoading) playerLoading.style.display = 'none';
    };
    embedPlayer.onload = hideLoading;
    setTimeout(hideLoading, 1000);
    return;
  }

  // Se for vídeo direto ou HLS, desativa o escudo e oculta o iframe
  deactivatePopupShield();
  if (embedPlayer) {
    embedPlayer.style.display = 'none';
    embedPlayer.src = 'about:blank';
  }
  videoElement.style.display = 'block';

  // CASO 2: É um arquivo MP4 direto (Ex: Wasabi S3 de Séries / Episódios)
  const isMp4 = url.includes('.mp4') || url.includes('wasabisys.com');
  if (isMp4) {
    videoElement.src = url;
    
    const onCanPlay = () => {
      playerLoading.style.display = 'none';
      videoElement.play().catch(e => console.log('Autoplay MP4 aguardando interação:', e.message));
      videoElement.removeEventListener('canplay', onCanPlay);
      videoElement.removeEventListener('loadeddata', onCanPlay);
    };

    videoElement.addEventListener('canplay', onCanPlay);
    videoElement.addEventListener('loadeddata', onCanPlay);

    videoElement.onerror = () => {
      showPlayerError('Não foi possível carregar o arquivo de vídeo deste episódio.');
    };
    return;
  }

  // CASO 3: É um stream HLS (.m3u8) - Canais ao Vivo e Pluto TV
  if (Hls.isSupported()) {
    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      backBufferLength: 60
    });

    hlsInstance.loadSource(url);
    hlsInstance.attachMedia(videoElement);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {
      playerLoading.style.display = 'none';
      videoElement.play().catch(() => {
        console.log('Autoplay bloqueado pelo navegador, aguardando clique.');
      });
    });

    hlsInstance.on(Hls.Events.ERROR, function (event, data) {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            console.warn('Erro de rede HLS, tentando recuperar...');
            hlsInstance.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            console.warn('Erro de mídia HLS, recuperando...');
            hlsInstance.recoverMediaError();
            break;
          default:
            hlsInstance.destroy();
            showPlayerError('O sinal desta transmissão está temporariamente indisponível.');
            break;
        }
      }
    });
  } 
  // Suporte nativo ao HLS (Safari / iOS)
  else if (videoElement.canPlayType('application/vnd.apple.mpegurl')) {
    videoElement.src = url;
    videoElement.addEventListener('loadedmetadata', function () {
      playerLoading.style.display = 'none';
      videoElement.play();
    });
    videoElement.addEventListener('error', function () {
      showPlayerError('Falha ao carregar transmissão no navegador.');
    });
  } else {
    // Fallback: tenta definir diretamente o src do vídeo
    videoElement.src = url;
    videoElement.play().catch(() => {});
    playerLoading.style.display = 'none';
  }
}

function showPlayerError(msg) {
  playerLoading.style.display = 'none';
  playerError.style.display = 'flex';
  playerErrorMsg.textContent = msg;

  if (playerAlternativeServers) {
    if (currentActiveServers.length > 1) {
      playerAlternativeServers.style.display = 'block';
      playerAlternativeServers.innerHTML = `
        <div style="background: rgba(15, 23, 42, 0.85); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 10px; padding: 12px; margin: 10px 0;">
          <p style="font-size: 0.85rem; font-weight: 700; color: #93c5fd; margin-bottom: 8px;">
            Tente outro servidor para continuar assistindo agora:
          </p>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; justify-content: center;">
            ${currentActiveServers.map((srv, idx) => {
              if (idx === currentServerIndex) return '';
              return `<button class="btn btn-sm btn-primary" style="padding:6px 12px; border-radius:8px; font-size:0.8rem; cursor:pointer;" onclick="switchToServer(${idx})">▶ ${srv.name}</button>`;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      playerAlternativeServers.style.display = 'none';
    }
  }
}

function closePlayer() {
  deactivatePopupShield();
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  videoElement.pause();
  videoElement.removeAttribute('src');
  videoElement.load();
  if (embedPlayer) {
    embedPlayer.src = 'about:blank';
    embedPlayer.style.display = 'none';
  }
  if (playerServerControls) playerServerControls.style.display = 'none';
  if (playerAlternativeServers) playerAlternativeServers.style.display = 'none';
  currentActiveServers = [];
  playerModal.classList.remove('active');
}

closePlayerBtn.addEventListener('click', closePlayer);
playerModal.addEventListener('click', (e) => {
  if (e.target === playerModal) closePlayer();
});

retryStreamBtn.addEventListener('click', () => {
  if (currentStreamUrl) {
    playStream(currentStreamUrl, currentStreamTitle, currentIsLive);
  }
});
