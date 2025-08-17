const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN
} = process.env;

function svg({ title, artist, url }) {
  const t = (s) => (s || '—').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `
<svg width="500" height="120" viewBox="0 0 500 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Now Playing">
  <rect width="100%" height="100%" fill="#121212"/>
  <text x="20" y="40" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="16" fill="#1DB954" font-weight="700">
    Now Playing on Spotify
  </text>
  <text x="20" y="70" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="18" fill="#FFFFFF" font-weight="600">
    ${t(title)}
  </text>
  <text x="20" y="95" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="14" fill="#BBBBBB">
    ${t(artist)}
  </text>
  <a href="${url || 'https://open.spotify.com/'}">
    <rect x="0" y="0" width="500" height="120" fill="transparent"/>
  </a>
</svg>`.trim();
}

async function getAccessToken() {
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: SPOTIFY_REFRESH_TOKEN
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body // fetch URLSearchParams'ı kabul eder
  });

  if (!res.ok) throw new Error('Token yenileme başarısız');
  const data = await res.json();
  return data.access_token;
}

async function getNowPlaying(token) {
  const r = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (r.status === 204) return null;        // o an çalmıyor
  if (!r.ok) return null;

  const data = await r.json();
  const item = data.item;
  if (!item) return null;

  const title = item.name;
  const artist = item.artists?.map(a => a.name).join(', ');
  const url = item.external_urls?.spotify;
  return { title, artist, url };
}

async function getLastPlayed(token) {
  const r = await fetch('https://api.spotify.com/v1/me/player/recently-played?limit=1', {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;

  const data = await r.json();
  const item = data.items?.[0]?.track;
  if (!item) return null;

  const title = item.name;
  const artist = item.artists?.map(a => a.name).join(', ');
  const url = item.external_urls?.spotify;
  return { title, artist, url };
}

export default async function handler(req, res) {
  try {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
      res.status(500).send('Env vars eksik');
      return;
    }

    const token = await getAccessToken();
    let track = await getNowPlaying(token);
    if (!track) track = await getLastPlayed(token);

    res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate');
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.status(200).send(svg(track || { title: 'Not playing', artist: '', url: 'https://open.spotify.com/' }));
  } catch (e) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.status(500).send('Hata: ' + (e?.message || e));
  }
}
