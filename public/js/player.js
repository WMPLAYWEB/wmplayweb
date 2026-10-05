// Gerenciador do Player de Vídeo Nativo (HLS e MP4 com Proteção Total Anti-Popups)
let hlsInstance = null;
const videoElement = document.getElementById('videoPlayer');
const playerModal = document.getElementById('playerModal');
const playerTitle = document.getElementById('playerTitle');
const playerLoading = document.getElementById('playerLoading');
const playerLoadingText = document.getElementById('playerLoadingText');
const playerError = document.getElementById('playerError');
const playerErrorMsg = document.getElementById('playerErrorMsg');
const retryStreamBtn = document.getElementById('retryStreamBtn');
const closePlayerBtn = document.getElementById('closePlayerBtn');
const playerLiveTag = document.getElementById('playerLiveTag');

// --- PROTEÇÃO TOTAL ANTI-POPUPS & ANTI-ANÚNCIOS ---
// Bloqueia qualquer tentativa de abertura de nova aba ou popup pelo navegador
window.open = function() {
  console.warn('[WMPlayWeb] Bloqueada tentativa de abertura de nova aba.');
  return null;
};

let currentStreamUrl = null;
let currentStreamTitle = '';
let currentIsLive = false;

function playStream(url, title = 'Reproduzindo', isLive = false) {
  if (!url) {
    showPlayerError('Link de reprodução indisponível para este conteúdo.');
    return;
  }

  // Fecha imediatamente o modal de detalhes para focar no player
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

  // Higieniza URL de pipes e parâmetros extras
  url = url.split('|')[0].trim();

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

  // Limpa instância HLS anterior se houver
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  // Remove fontes anteriores do elemento de vídeo
  videoElement.pause();
  videoElement.removeAttribute('src');
  videoElement.load();
  videoElement.style.display = 'block';

  // CASO 1: É um arquivo MP4 direto (Wasabi S3, Apperror404, etc.)
  const isMp4 = url.includes('.mp4') || url.includes('wasabisys.com') || url.includes('apperror404.com');
  if (isMp4) {
    videoElement.src = url;
    
    const onCanPlay = () => {
      playerLoading.style.display = 'none';
      videoElement.play().catch(e => console.log('Autoplay aguardando interação:', e.message));
      videoElement.removeEventListener('canplay', onCanPlay);
      videoElement.removeEventListener('loadeddata', onCanPlay);
    };

    videoElement.addEventListener('canplay', onCanPlay);
    videoElement.addEventListener('loadeddata', onCanPlay);

    videoElement.onerror = () => {
      showPlayerError('Não foi possível carregar a reprodução deste vídeo no momento.');
    };
    return;
  }

  // CASO 2: É um stream HLS (.m3u8) - Canais ao Vivo e Pluto TV
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
    // Fallback direto
    videoElement.src = url;
    videoElement.play().catch(() => {});
    playerLoading.style.display = 'none';
  }
}

function openPlayerLoading(title) {
  // Fecha imediatamente o modal de detalhes
  const detailsModal = document.getElementById('detailsModal');
  if (detailsModal) detailsModal.classList.remove('active');

  playerTitle.textContent = title || 'Reproduzindo Vídeo';
  if (playerLiveTag) playerLiveTag.style.display = 'none';

  playerModal.classList.add('active');
  playerLoading.style.display = 'flex';
  if (playerLoadingText) playerLoadingText.textContent = 'Conectando ao vídeo...';
  playerError.style.display = 'none';

  videoElement.pause();
  videoElement.removeAttribute('src');
  videoElement.load();
}

function showPlayerError(msg, title = '') {
  const detailsModal = document.getElementById('detailsModal');
  if (detailsModal) detailsModal.classList.remove('active');

  if (title) playerTitle.textContent = title;
  playerModal.classList.add('active');
  playerLoading.style.display = 'none';
  playerError.style.display = 'flex';
  playerErrorMsg.textContent = msg || 'Não foi possível carregar a reprodução deste vídeo no momento.';
}

function closePlayer() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
  videoElement.pause();
  videoElement.removeAttribute('src');
  videoElement.load();
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
