# WMPlayWeb 🎬📺

**WMPlayWeb** é uma plataforma moderna e completa de streaming web para assistir canais de TV ao vivo, Pluto TV, filmes, séries, animes, desenhos, doramas e novelas diretamente pelo seu navegador, sem necessidade de instalar o Kodi.

---

## 🚀 Funcionalidades

- 📺 **Canais de TV Ao Vivo**: TV aberta e fechada com player integrado e suporte HLS (.m3u8).
- 🪐 **Pluto TV Oficial**: Centenas de canais organizados por categorias.
- 🎬 **Catálogo de Filmes**: Mais de 10.000 títulos distribuídos em 18 gêneros com resolução direta em MP4 e cache inteligente.
- 🍿 **Séries, Animes & Desenhos**: Visualização de temporadas e episódios completos.
- 🔐 **Sistema de Autenticação & Cadastro**: Registro de novos usuários e login com sessão segura.
- ⚡ **Cache em Disco Persistente**: Carregamento instantâneo do catálogo após primeira sincronização.
- 📱 **Interface Responsiva**: Funciona em computadores, Smart TVs, tablets e celulares.

---

## 🛠️ Como Executar Localmente

### Pré-requisitos
- [Node.js](https://nodejs.org/) instalado (versão 18 ou superior).

### Passo a Passo
1. Clone o repositório ou baixe os arquivos:
```bash
git clone https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
cd SEU_REPOSITORIO
```

2. Instale as dependências:
```bash
npm install
```

3. Inicie o servidor:
```bash
node server.js
```
*(ou execute o arquivo iniciar-site.bat no Windows)*

4. Abra no navegador:
```
http://localhost:3000
```

---

## 👥 Contas Padrão de Acesso

Ao abrir a página de login, você pode criar uma nova conta clicando em **Cadastre-se** ou utilizar uma das contas pré-configuradas:
- **Usuário**: `admin` | **Senha**: `admin123`
- **Usuário**: `wmplay` | **Senha**: `wmplay2026`
- **Usuário**: `usuario` | **Senha**: `senha123`

---

## 📦 Deploy na Nuvem (Render / Railway / VPS)

O projeto já inclui o arquivo `render.yaml` pronto para deploy gratuito em plataformas como Render ou Railway:
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Port**: Definida automaticamente via variável de ambiente `PORT` (padrão: 3000).
