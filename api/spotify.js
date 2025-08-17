// api/spotify.js — 3 eşit kutu, ellipsize, Last Played fallback, sol kart dikey ortalı
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
function ellipsize(s, max){ if(!s) return "—"; return s.length>max? s.slice(0,max-1)+"…": s; }

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

// ------- Spotify -------
async function getNowPlaying(token){
  const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing",{
    headers:{ Authorization:`Bearer ${token}` }
  });
  if(r.status===204 || !r.ok) return null;
  const j = await r.json();
  const it = j.item;
  if(!it) return null;
  return {
    title: it.name,
    artist: (it.artists||[]).map(a=>a.name).join(", "),
    url: it.external_urls?.spotify,
    image: it.album?.images?.[0]?.url || null,
    isPlaying: j.is_playing === true
  };
}

async function getLastPlayed(token){
  const r = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1",{
    headers:{ Authorization:`Bearer ${token}` }
  });
  if(!r.ok) return null;
  const j = await r.json();
  const it = j.items?.[0]?.track;
  if(!it) return null;
  return {
    title: it.name,
    artist: (it.artists||[]).map(a=>a.name).join(", "),
    url: it.external_urls?.spotify,
    image: it.album?.images?.[0]?.url || null
  };
}

async function getTop(token){
  const [trRes, arRes] = await Promise.all([
    fetch("https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5",{ headers:{ Authorization:`Bearer ${token}` }}),
    fetch("https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5",{ headers:{ Authorization:`Bearer ${token}` }})
  ]);
  const tr = trRes.ok? await trRes.json(): {items:[]};
  const ar = arRes.ok? await arRes.json(): {items:[]};

  const tracks = (tr.items||[]).map(t=>({
    title: t.name,
    artist: (t.artists||[]).map(a=>a.name).join(", "),
    image: t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null
  }));

  const artists = (ar.items||[]).map(a=>({
    name: a.name,
    image: a.images?.[2]?.url || a.images?.[1]?.url || a.images?.[0]?.url || null
  }));

  return { tracks, artists };
}

// ------- SVG (3 eşit kutu) -------
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

  // --- Sol kart: dikey merkezleme hesapları ---
  const imgSize = 120;
  const imgX = x1 + 14;
  const imgY = topY + (cardH - imgSize) / 2;
  const textX = imgX + imgSize + 16;
  const centerY = topY + cardH / 2;
  const titleY  = centerY - 6;
  const artistY = centerY + 16;

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Summary">
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

  <!-- Card 1: Now/Last (dikey ortalı) -->
  <g>
    <rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="14" fill="${COLORS.card}" stroke="${COLORS.border}"/>
    ${heroImg ? `<image href="${heroImg}" x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}"/>`
              : `<rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" fill="#222"/>`}
    <text x="${textX}" y="${titleY}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="16" fill="${COLORS.text}" font-weight="700">
      ${esc(ellipsize(hero.title, 28))}
    </text>
    <text x="${textX}" y="${artistY}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.muted}">
      ${esc(ellipsize(hero.artist, 30))}
    </text>
    ${hero.url ? `<a href="${hero.url}"><rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="14" fill="transparent"/></a>` : ""}
  </g>

  <!-- Card 2: Top Tracks -->
  <g>
    <rect x="${x2}" y="${topY}" width="${cardW}" height="${cardH}" rx="14" fill="${COLORS.card}" stroke="${COLORS.border}"/>
    ${top.tracks.map((t,i)=>{
      const y = topY + 26 + (i+1)*rowH;
      const img = tImgs[i] || BLANK;
      return `
        <image href="${img}" x="${x2+14}" y="${y - icon + 6}" width="${icon}" height="${icon}"/>
        <text x="${x2+14+icon+10}" y="${y}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.text}">
          ${esc(ellipsize(t.title, 24))} — <tspan fill="${COLORS.muted}">${esc(ellipsize(t.artist, 22))}</tspan>
        </text>
      `;
    }).join("")}
  </g>

  <!-- Card 3: Top Artists -->
  <g>
    <rect x="${x3}" y="${topY}" width="${cardW}" height="${cardH}" rx="14" fill="${COLORS.card}" stroke="${COLORS.border}"/>
    ${top.artists.map((a,i)=>{
      const y = topY + 26 + (i+1)*rowH;
      const img = aImgs[i] || BLANK;
      return `
        <defs><clipPath id="artist-${i}"><circle cx="${x3+14+icon/2}" cy="${y - icon/2 + 6}" r="${icon/2}"/></clipPath></defs>
        <image href="${img}" x="${x3+14}" y="${y - icon + 6}" width="${icon}" height="${icon}" clip-path="url(#artist-${i})"/>
        <text x="${x3+14+icon+10}" y="${y}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.text}">
          ${esc(ellipsize(a.name, 34))}
        </text>
      `;
    }).join("")}
  </g>
</svg>`.trim();
}

// ------- Handler -------
export default async function handler(req, res){
  try{
    const token = await getAccessToken();

    // Now Playing → değilse Last Played
    const np = await getNowPlaying(token);
    let hero;
    if (!np || np.isPlaying !== true) {
      const last = await getLastPlayed(token);
      hero = last ? { ...last, label: "Last Played" }
                  : { title:"Not playing", artist:"—", url:null, image:null, label:"Now Playing" };
    } else {
      hero = { ...np, label: "Now Playing" };
    }

    // Top listeler
    const top = await getTop(token);

    // Görseller
    const heroImg = hero?.image ? await toDataUri(hero.image) : null;
    const tImgs = await Promise.all((top.tracks||[]).map(t => t.image ? toDataUri(t.image) : BLANK));
    const aImgs = await Promise.all((top.artists||[]).map(a => a.image ? toDataUri(a.image) : BLANK));

    // Çiz
    const svg = render({ hero, heroImg, top, tImgs, aImgs });

    res.setHeader("Cache-Control","no-cache, no-store, max-age=0, must-revalidate");
    res.setHeader("Content-Type","image/svg+xml; charset=utf-8");
    res.status(200).send(svg);
  }catch(e){
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    res.status(500).send("Hata: " + (e?.message || e));
  }
}
