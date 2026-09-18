const { spawn } = require('child_process');

console.log('==================================================');
console.log('       INICIANDO WMPLAYWEB MODO ONLINE           ');
console.log('==================================================\n');

const server = spawn('node', ['server.js'], { stdio: ['ignore', 'inherit', 'inherit'] });
const tunnel = spawn('cloudflared.exe', ['tunnel', '--url', 'http://localhost:3000']);

let urlFound = false;

function checkText(text) {
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !urlFound) {
    urlFound = true;
    const publicUrl = match[0];
    console.log('\n==================================================');
    console.log('  🎉 SEU SITE ESTÁ 100% ONLINE E ACESSÍVEL!');
    console.log('  👉 LINK PÚBLICO: ' + publicUrl);
    console.log('==================================================\n');
    console.log('Envie esse link para amigos, familiares ou clientes.');
    console.log('Funciona direto no Celular, Computador e Smart TV!\n');
  }
}

tunnel.stderr.on('data', (d) => checkText(d.toString()));
tunnel.stdout.on('data', (d) => checkText(d.toString()));

process.on('SIGINT', () => {
  server.kill();
  tunnel.kill();
  process.exit();
});
