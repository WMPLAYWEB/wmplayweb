const axios = require('axios');

async function run() {
  const r = await axios.get('http://localhost:3000/api/movies/lancamentos');
  const items = r.data.items || [];
  console.log('Total lancamentos:', items.length);
  for (let i = 0; i < Math.min(items.length, 6); i++) {
    const it = items[i];
    console.log('--- Item ' + i + ': ' + it.title + ' | link: ' + it.externalLink);
    try {
      const res = await axios.get('http://localhost:3000/api/movie/stream?link=' + encodeURIComponent(it.externalLink) + '&title=' + encodeURIComponent(it.title), { timeout: 15000 });
      console.log('    Result:', res.data);
    } catch (e) {
      console.log('    Error:', e.message);
    }
  }
}
run();
