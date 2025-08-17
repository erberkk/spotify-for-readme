// api/spotify.js
const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN
} = process.env;

const BG = "#121212";
const GREEN = "#1DB954";
const FG = "#FFFFFF";
const MUTED = "#BBBBBB";

async function getAccessToken() {
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: SPOTIFY_REFRESH_TOKEN
  });

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  if (!res.ok) throw new Error("Token yenileme başarısız");
  const data = await res.json();
  return data.access_token;
}

async function getNowPlaying(token) {
  const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (r.status === 204 || !r.ok) return null;
  const data = await r.json();
  const item = data?.item;
  if (!item) return null;
  return {
    title: item.name,
    artist: item.artists?.map(a => a.name).join(", "),
    url: item.external_urls?.spotify,
    albumImage: item.album?.images?.[0]?.url || null, // en büyük
    isPlaying: data.is_playing === true
  };
}

async function getTop(token) {
  const [tracksRes, artistsRes] = await Promise.all([
    fetch("https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5", {
      headers: { Authorization: `Bearer ${token}` }
    }),
    fetch("https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5", {
      headers: { Authorization: `Bearer ${token}` }
    })
  ]);

  const tracksJson = tracksRes.ok ? await tracksRes.json() : { items: [] };
  const artistsJson = artistsRes.ok ? await artistsRes.json() : { items: [] };

  const topTracks = (tracksJson.items || []).map(t => ({
    title: t.name,
    artist: t.artists?.map(a => a.name).join(", "),
    image: t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null
  }));

  const topArtists = (artistsJson.items || []).map(a => ({
    name: a.name,
    image: a.images?.[2]?.url || a.images?.[1]?.url || a.images?.[0]?.url || null
  }));

  return { topTracks, topArtists };
}

// 1x1 şeffaf PNG (placeholder)
const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBgV3QJRoAAAAASUVORK5CYII=";

// Görseli data URI (base64) yap – header ekleyip sağlamla
async function toDataUri(url) {
  if (!url) return TRANSPARENT_PNG;
  try {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return TRANSPARENT_PNG;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return TRANSPARENT_PNG;
  }
}

function esc(s) {
  return (s || "—").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}

function svgLayout({ now, topTracks, topArtists, albumDataUri, trackDataUris, artistDataUris }) {
  const W = 900, H = 220;

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Summary">
  <rect width="100%" height="100%" fill="${BG}"/>

  <!-- Header -->
  <text x="20" y="32" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="18" fill="${GREEN}" font-weight="700">
    Now Playing on Spotify
  </text>

  <!-- Now Playing card -->
  <rect x="20" y="50" width="290" height="150" rx="12" fill="#181818" />
  ${albumDataUri ? `<image href="${albumDataUri}" x="32" y="62" width="120" height="120" />`
                  : `<rect x="32" y="62" width="120" height="120" fill="#222" />`}
  <text x="166" y="94" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="16" fill="${FG}" font-weight="600">
    ${esc(now?.title || "Not playing")}
  </text>
  <text x="166" y="120" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="13" fill="${MUTED}">
    ${esc(now?.artist || "—")}
  </text>
  ${now?.url ? `<a href="${now.url}"><rect x="20" y="50" width="290" height="150" rx="12" fill="transparent"/></a>` : ""}

  <!-- Top Tracks -->
  <text x="330" y="32" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="18" fill="${GREEN}" font-weight="700">
    Top Tracks (last month)
  </text>
  ${topTracks.map((t, i) => {
    const y = 56 + i * 32;
    const img = trackDataUris[i] || TRANSPARENT_PNG;
    return `
      <g>
        <image href="${img}" x="330" y="${y - 16}" width="24" height="24" />
        <text x="360" y="${y}" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="13" fill="${FG}">
          ${esc(t.title)} — <tspan fill="${MUTED}">${esc(t.artist)}</tspan>
        </text>
      </g>
    `;
  }).join("")}

  <!-- Top Artists -->
  <text x="620" y="32" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="18" fill="${GREEN}" font-weight="700">
    Top Artists (last month)
  </text>
  ${topArtists.map((a, i) => {
    const y = 56 + i * 32;
    const img = artistDataUris[i] || TRANSPARENT_PNG;
    return `
      <g>
        <image href="${img}" x="620" y="${y - 18}" width="26" height="26" />
        <text x="652" y="${y}" font-family="Segoe UI, Roboto, Arial, sans-serif" font-size="13" fill="${FG}">
          ${esc(a.name)}
        </text>
      </g>
    `;
  }).join("")}
</svg>`.trim();
}

export default async function handler(req, res) {
  try {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET || !SPOTIFY_REFRESH_TOKEN) {
      res.status(500).send("Env vars eksik");
      return;
    }

    const token = await getAccessToken();
    const [now, top] = await Promise.all([ getNowPlaying(token), getTop(token) ]);

    // Görseller
    const albumDataUri   = now?.albumImage ? await toDataUri(now.albumImage) : null;
    const trackDataUris  = await Promise.all((top.topTracks  || []).map(t => t.image ? toDataUri(t.image) : TRANSPARENT_PNG));
    const artistDataUris = await Promise.all((top.topArtists || []).map(a => a.image ? toDataUri(a.image) : TRANSPARENT_PNG));

    const out = svgLayout({
      now,
      topTracks: top.topTracks || [],
      topArtists: top.topArtists || [],
      albumDataUri,
      trackDataUris,
      artistDataUris
    });

    res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.status(200).send(out);
  } catch (e) {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(500).send("Hata: " + (e?.message || e));
  }
}
