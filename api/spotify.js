const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN
} = process.env;

// ------- Stil -------
const COLORS = {
  bg: "#0f1115",
  card: "#171a21",
  green: "#1DB954",
  text: "#FFFFFF",
  muted: "#B3B3B3",
  border: "#222831"
};

// ------- Utils -------
function esc(s){ return (s || "—").replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function ellipsize(s, maxChars, maxWidthPx, avgCharWidth = 8) {
  if (!s) return "—";
  // Char limit + approximate width check (e.g., for 13px font, ~8px/char)
  let truncated = s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s;
  if (truncated.length * avgCharWidth > maxWidthPx) {
    const newMax = Math.floor(maxWidthPx / avgCharWidth) - 1;
    truncated = s.slice(0, newMax) + "…";
  }
  return truncated;
}

const BLANK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBgV3QJRoAAAAASUVORK5CYII=";

async function toDataUri(url){
  if(!url) return BLANK;
  try{
    const r = await fetch(url,{ headers:{ "User-Agent":"Mozilla/5.0" } });
    if(!r.ok) return BLANK;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }catch{ return BLANK; }
}

async function getAccessToken(){
  const body = new URLSearchParams({ grant_type:"refresh_token", refresh_token:SPOTIFY_REFRESH_TOKEN });
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token",{
    method:"POST",
    headers:{ Authorization:`Basic ${auth}`, "Content-Type":"application/x-www-form-urlencoded" },
    body
  });
  if(!res.ok) throw new Error("Token yenileme başarısız");
  const j = await res.json();
  return j.access_token;
}

// ------- Spotify ------- (unchanged, skipped for brevity)

async function getNowPlaying(token){ /* unchanged */ }
async function getLastPlayed(token){ /* unchanged */ }
async function getTop(token){ /* unchanged */ }

// ------- SVG (with effects & animations) -------
function render({ hero, heroImg, top, tImgs, aImgs }){
  const W = 960, H = 290;
  const margin = 20, gutter = 16;
  const innerW = W - margin*2 - gutter*2;
  const cardW = Math.floor(innerW / 3);
  const cardH = 210;
  const topY  = 52;

  const x1 = margin;
  const x2 = margin + cardW + gutter;
  const x3 = margin + (cardW + gutter) * 2;

  const icon = 24, rowH = 30;

  // --- Sol kart: dikey merkezleme ---
  const imgSize = 120;
  const imgX = x1 + 14;
  const imgY = topY + (cardH - imgSize) / 2;
  const textX = imgX + imgSize + 16;
  const centerY = topY + cardH / 2;
  const titleY  = centerY - 6;
  const artistY = centerY + 16;

  // Play icon path (simple triangle for play, circle for pause)
  const playIcon = hero.isPlaying ? '<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm-2 15l5-5-5-5v10z"/>' : '<circle cx="12" cy="12" r="10"/><rect x="8" y="8" width="3" height="8" rx="1"/><rect x="13" y="8" width="3" height="8" rx="1"/>';

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Summary">
  <style>
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pulse { 0% { transform: scale(1); } 50% { transform: scale(1.05); } 100% { transform: scale(1); } }
    .card { animation: fadeIn 1s ease-in; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.2)); }
    .hero-img.playing { animation: pulse 2s infinite ease-in-out; }
    .hero-link:hover { opacity: 0.8; }
  </style>
  <defs>
    <linearGradient id="cardGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${COLORS.card}" />
      <stop offset="100%" stop-color="#101318" />
    </linearGradient>
    <filter id="shadow"><feGaussianBlur stdDeviation="3" result="blur"/><feOffset dx="0" dy="2"/></filter>
  </defs>
  <rect width="100%" height="100%" fill="${COLORS.bg}"/>

  <!-- Başlıklar -->
  <text x="${x1+4}" y="28" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="18" font-weight="700" fill="${COLORS.green}">
    ${esc(hero.label)} on Spotify
  </text>
  <text x="${x2}" y="28" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="18" font-weight="700" fill="${COLORS.green}">
    Top Tracks (last month)
  </text>
  <text x="${x3}" y="28" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="18" font-weight="700" fill="${COLORS.green}">
    Top Artists (last month)
  </text>

  <!-- Card 1: Now/Paused/Last (dikey ortalı) -->
  <g class="card">
    <rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="14" fill="url(#cardGrad)" stroke="${COLORS.border}" filter="url(#shadow)"/>
    ${heroImg ? `<image class="hero-img ${hero.isPlaying ? 'playing' : ''}" href="${heroImg}" x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}"/>`
              : `<rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" fill="#222"/>`}
    <g transform="translate(${textX - 30}, ${titleY - 20}) scale(0.08)" fill="${COLORS.green}">${playIcon}</g>
    <text x="${textX}" y="${titleY}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="16" fill="${COLORS.text}" font-weight="700">
      ${esc(ellipsize(hero.title, 22, cardW - imgSize - 50, 10))} <!-- ~10px/char for 16px font -->
    </text>
    <text x="${textX}" y="${artistY}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.muted}">
      ${esc(ellipsize(hero.artist, 28, cardW - imgSize - 50, 8))} <!-- ~8px/char for 13px -->
    </text>
    ${hero.url ? `<a class="hero-link" href="${hero.url}"><rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="14" fill="transparent"/></a>` : ""}
  </g>

  <!-- Card 2: Top Tracks -->
  <g class="card">
    <rect x="${x2}" y="${topY}" width="${cardW}" height="${cardH}" rx="14" fill="url(#cardGrad)" stroke="${COLORS.border}" filter="url(#shadow)"/>
    ${top.tracks.map((t,i)=>{
      const y = topY + 26 + (i+1)*rowH;
      const img = tImgs[i] || BLANK;
      return `
        <image href="${img}" x="${x2+14}" y="${y - icon + 6}" width="${icon}" height="${icon}"/>
        <text x="${x2+14+icon+10}" y="${y}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.text}">
          ${esc(ellipsize(t.title, 18, cardW - icon - 40, 8))} — <tspan fill="${COLORS.muted}">${esc(ellipsize(t.artist, 16, cardW - icon - 100, 8))}</tspan>
        </text>
      `;
    }).join("")}
  </g>

  <!-- Card 3: Top Artists -->
  <g class="card">
    <rect x="${x3}" y="${topY}" width="${cardW}" height="${cardH}" rx="14" fill="url(#cardGrad)" stroke="${COLORS.border}" filter="url(#shadow)"/>
    ${top.artists.map((a,i)=>{
      const y = topY + 26 + (i+1)*rowH;
      const img = aImgs[i] || BLANK;
      return `
        <defs><clipPath id="artist-${i}"><circle cx="${x3+14+icon/2}" cy="${y - icon/2 + 6}" r="${icon/2}"/></clipPath></defs>
        <image href="${img}" x="${x3+14}" y="${y - icon + 6}" width="${icon}" height="${icon}" clip-path="url(#artist-${i})"/>
        <text x="${x3+14+icon+10}" y="${y}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.text}">
          ${esc(ellipsize(a.name, 28, cardW - icon - 30, 8))}
        </text>
      `;
    }).join("")}
  </g>
</svg>`.trim();
}

// ------- Handler ------- (add isPlaying to hero for animation)
export default async function handler(req, res){
  try{
    const token = await getAccessToken();

    const np = await getNowPlaying(token);
    let hero;

    if (np) {
      hero = { ...np, label: np.isPlaying ? "Now Playing" : "Paused" };
    } else {
      const last = await getLastPlayed(token);
      hero = last ? { ...last, label: "Last Played", isPlaying: false }
                  : { title:"Not playing", artist:"—", url:null, image:null, label:"Now Playing", isPlaying: false };
    }

    const top = await getTop(token);

    const heroImg = hero?.image ? await toDataUri(hero.image) : null;
    const tImgs = await Promise.all((top.tracks||[]).map(t => t.image ? toDataUri(t.image) : BLANK));
    const aImgs = await Promise.all((top.artists||[]).map(a => a.image ? toDataUri(a.image) : BLANK));

    const svg = render({ hero, heroImg, top, tImgs, aImgs });

    res.setHeader("Cache-Control","no-cache, no-store, max-age=0, must-revalidate");
    res.setHeader("CDN-Cache-Control","no-store");
    res.setHeader("Vercel-CDN-Cache-Control","no-store");
    res.setHeader("Content-Type","image/svg+xml; charset=utf-8");

    res.status(200).send(svg);
  }catch(e){
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    res.status(500).send("Hata: " + (e?.message || e));
  }
}
