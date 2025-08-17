// api/spotify.js — compact layout + last played fallback
const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN
} = process.env;

const COLORS = {
  bg: "#0f1115",
  card: "#171a21",
  green: "#1DB954",
  text: "#FFFFFF",
  muted: "#B3B3B3",
  border: "#222831"
};

// ------------ utils ------------
function esc(s){ return (s || "—").replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function ellipsize(s,max=40){ if(!s) return "—"; return s.length>max? s.slice(0,max-1)+"…": s; }

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

// ------------ spotify data ------------
async function getNowPlaying(token){
  const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing",{
    headers:{ Authorization:`Bearer ${token}` }
  });
  if(r.status === 204 || !r.ok) return null;
  const j = await r.json();
  const it = j.item;
  if(!it) return null;
  return {
    title: it.name,
    artist: (it.artists || []).map(a => a.name).join(", "),
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
    artist: (it.artists || []).map(a => a.name).join(", "),
    url: it.external_urls?.spotify,
    image: it.album?.images?.[0]?.url || null
  };
}

async function getTop(token){
  const [trRes, arRes] = await Promise.all([
    fetch("https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5",{ headers:{ Authorization:`Bearer ${token}` }}),
    fetch("https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5",{ headers:{ Authorization:`Bearer ${token}` }})
  ]);

  const tr = trRes.ok ? await trRes.json() : { items: [] };
  const ar = arRes.ok ? await arRes.json() : { items: [] };

  const tracks = (tr.items || []).map(t => ({
    title: t.name,
    artist: (t.artists || []).map(a => a.name).join(", "),
    image: t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null
  }));

  const artists = (ar.items || []).map(a => ({
    name: a.name,
    image: a.images?.[2]?.url || a.images?.[1]?.url || a.images?.[0]?.url || null
  }));

  return { tracks, artists };
}

// ------------ svg layout (compact) ------------
function render({ hero, heroImg, top, trackImgs, artistImgs }){
  const W = 820, H = 320;
  const leftW = 300, leftH = 240, leftX = 20, topY = 50;
  const rightX = leftX + leftW + 16;
  const rightW = W - rightX - 20;
  const sectionGap = 18;
  const icon = 24, rowH = 30;

  const leftTitle = `${hero.label} on Spotify`;
  const rightTitle = "Your Monthly Highlights";

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Summary Compact">
  <rect width="100%" height="100%" fill="${COLORS.bg}"/>

  <!-- Başlıklar -->
  <text x="${leftX+4}" y="28" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="18" font-weight="700" fill="${COLORS.green}">
    ${esc(leftTitle)}
  </text>
  <text x="${rightX}" y="28" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="18" font-weight="700" fill="${COLORS.green}">
    ${esc(rightTitle)}
  </text>

  <!-- Sol kart: Now/Last -->
  <g>
    <rect x="${leftX}" y="${topY}" width="${leftW}" height="${leftH}" rx="14" fill="${COLORS.card}" stroke="${COLORS.border}"/>
    ${heroImg ? `<image href="${heroImg}" x="${leftX+14}" y="${topY+16}" width="120" height="120"/>`
              : `<rect x="${leftX+14}" y="${topY+16}" width="120" height="120" fill="#222"/>`}
    <text x="${leftX+150}" y="${topY+56}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="16" fill="${COLORS.text}" font-weight="700">
      ${esc(ellipsize(hero.title, 30))}
    </text>
    <text x="${leftX+150}" y="${topY+82}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.muted}">
      ${esc(ellipsize(hero.artist, 32))}
    </text>
    ${hero.url ? `<a href="${hero.url}"><rect x="${leftX}" y="${topY}" width="${leftW}" height="${leftH}" rx="14" fill="transparent"/></a>` : ""}
  </g>

  <!-- Sağ birleşik kart -->
  <g>
    <rect x="${rightX}" y="${topY}" width="${rightW}" height="${leftH}" rx="14" fill="${COLORS.card}" stroke="${COLORS.border}"/>

    <!-- Top Tracks -->
    <text x="${rightX+14}" y="${topY+24}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="16" font-weight="700" fill="${COLORS.text}">
      Top Tracks (last month)
    </text>
    ${top.tracks.map((t,i)=>{
      const y = topY + 46 + i*rowH;
      const img = trackImgs[i] || BLANK;
      return `
      <image href="${img}" x="${rightX+14}" y="${y - icon + 6}" width="${icon}" height="${icon}"/>
      <text x="${rightX+14+icon+10}" y="${y}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.text}">
        ${esc(ellipsize(t.title, 28))} — <tspan fill="${COLORS.muted}">${esc(ellipsize(t.artist, 26))}</tspan>
      </text>`;
    }).join("")}

    <!-- Ayırıcı çizgi -->
    <line x1="${rightX+12}" y1="${topY+46 + top.tracks.length*rowH + sectionGap}" x2="${rightX+rightW-12}" y2="${topY+46 + top.tracks.length*rowH + sectionGap}" stroke="${COLORS.border}"/>

    <!-- Top Artists -->
    <text x="${rightX+14}" y="${topY+46 + top.tracks.length*rowH + sectionGap + 22}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="16" font-weight="700" fill="${COLORS.text}">
      Top Artists (last month)
    </text>
    ${top.artists.map((a,i)=>{
      const y = topY + 46 + top.tracks.length*rowH + sectionGap + 44 + i*rowH;
      const img = artistImgs[i] || BLANK;
      return `
      <defs><clipPath id="a-${i}"><circle cx="${rightX+14+icon/2}" cy="${y - icon/2 + 6}" r="${icon/2}"/></clipPath></defs>
      <image href="${img}" x="${rightX+14}" y="${y - icon + 6}" width="${icon}" height="${icon}" clip-path="url(#a-${i})"/>
      <text x="${rightX+14+icon+10}" y="${y}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.text}">
        ${esc(ellipsize(a.name, 36))}
      </text>`;
    }).join("")}
  </g>
</svg>`.trim();
}

// ------------ handler ------------
export default async function handler(req, res){
  try{
    const token = await getAccessToken();

    // 1) Now Playing; eğer yoksa veya isPlaying=false ise Last Played'a düş
    let heroNP = await getNowPlaying(token);
    let hero;
    if (!heroNP || heroNP.isPlaying !== true) {
      const last = await getLastPlayed(token);
      if (last) {
        hero = { ...last, label: "Last Played" };
      } else {
        hero = { title:"Not playing", artist:"—", url:null, image:null, label:"Now Playing" };
      }
    } else {
      hero = { ...heroNP, label: "Now Playing" };
    }

    // 2) Top lists
    const top = await getTop(token);

    // 3) Görseller
    const heroImg   = hero?.image ? await toDataUri(hero.image) : null;
    const trackImgs  = await Promise.all((top.tracks  || []).map(t => t.image ? toDataUri(t.image) : BLANK));
    const artistImgs = await Promise.all((top.artists || []).map(a => a.image ? toDataUri(a.image) : BLANK));

    // 4) Render
    const svg = render({ hero, heroImg, top, trackImgs, artistImgs });

    res.setHeader("Cache-Control","no-cache, no-store, max-age=0, must-revalidate");
    res.setHeader("Content-Type","image/svg+xml; charset=utf-8");
    res.status(200).send(svg);
  }catch(e){
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    res.status(500).send("Hata: " + (e?.message || e));
  }
}
