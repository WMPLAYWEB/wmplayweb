// Gerenciador do Player de Vídeo (HLS, MP4 e Embed)
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

let currentStreamUrl = null;
let currentStreamTitle = '';
let currentIsLive = false;

function playStream(url, title = 'Reproduzindo', isLive = false) {
  if (!url) {
    showPlayerError('Link de reprodução indisponível para este item.');
    return;
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

  // Limpa instância HLS anterior se houver
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }

  // Remove fontes anteriores do elemento de vídeo
  videoElement.pause();
  videoElement.removeAttribute('src');

  // CASO 1: É um Embed / Iframe (Ex: Blogger / AnimesOnline / Embeds)
  const isEmbed = url.includes('/embed') || url.includes('blogger.com') || (!url.includes('.mp4') && !url.includes('.m3u8') && !url.includes('wasabisys') && !url.includes('/api/'));
  if (isEmbed && embedPlayer) {
    videoElement.style.display = 'none';
    embedPlayer.style.display = 'block';
    embedPlayer.src = url;
    embedPlayer.onload = () => {
      playerLoading.style.display = 'none';
    };
    return;
  }

  // Garante que o vídeo está visível e o iframe oculto
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
}

function closePlayer() {
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
