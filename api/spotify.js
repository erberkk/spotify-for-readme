// api/spotify.js
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

function esc(s) { return (s || "—").replace(/&/g,"&amp;").replace(/</g,"&lt;"); }
function ellipsize(s, max=48){ if(!s) return "—"; return s.length>max? s.slice(0,max-1)+"…": s; }

const BLANK =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBgV3QJRoAAAAASUVORK5CYII=";

async function toDataUri(url){
  if(!url) return BLANK;
  try{
    const r = await fetch(url, { headers: { "User-Agent":"Mozilla/5.0" } });
    if(!r.ok) return BLANK;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  }catch{ return BLANK; }
}

async function getAccessToken(){
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: SPOTIFY_REFRESH_TOKEN
  });
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method:"POST",
    headers:{
      Authorization:`Basic ${auth}`,
      "Content-Type":"application/x-www-form-urlencoded"
    },
    body
  });
  if(!res.ok) throw new Error("Token yenileme başarısız");
  const j = await res.json();
  return j.access_token;
}

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
    isPlaying: j.is_playing===true,
    label: "Now Playing"
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
    image: it.album?.images?.[0]?.url || null,
    isPlaying: false,
    label: "Last Played"
  };
}

async function getTop(token){
  const [trRes, arRes] = await Promise.all([
    fetch("https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5", {
      headers:{Authorization:`Bearer ${token}`}
    }),
    fetch("https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5", {
      headers:{Authorization:`Bearer ${token}`}
    })
  ]);

  const tr = trRes.ok ? await trRes.json() : { items: [] };
  const ar = arRes.ok ? await arRes.json() : { items: [] };

  const tracks = (tr.items||[]).map(t=>({
    title: t.name,
    artist: (t.artists||[]).map(a=>a.name).join(", "),
    // 👇 düzeltildi: images?.[1] ve images?.[0]
    image: t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null
  }));

  const artists = (ar.items||[]).map(a=>({
    name: a.name,
    image: a.images?.[2]?.url || a.images?.[1]?.url || a.images?.[0]?.url || null
  }));

  return { tracks, artists };
}

function render({ hero, heroImg, topTrackImgs, topArtistImgs, top }){
  const W = 1060, H = 270;
  const gutter = 24;
  const leftW = 360;
  const colW = Math.floor((W - leftW - gutter*3)/2);
  const col1X = leftW + gutter*2;
  const col2X = leftW + gutter*2 + colW + gutter;
  const listRow = 34;
  const icon = 26;

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Summary">
  <rect width="100%" height="100%" fill="${COLORS.bg}"/>

  <!-- Sol: Now/Last -->
  <text x="24" y="32" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="18" font-weight="700" fill="${COLORS.green}">
    ${esc(hero.label)} on Spotify
  </text>
  <g>
    <rect x="20" y="46" width="${leftW}" height="200" rx="14" fill="${COLORS.card}" stroke="${COLORS.border}"/>
    ${heroImg ? `<image href="${heroImg}" x="32" y="60" width="140" height="140" />` : `<rect x="32" y="60" width="140" height="140" fill="#222"/>`}
    <text x="190" y="98" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="16" fill="${COLORS.text}" font-weight="700">
      ${esc(ellipsize(hero.title, 36))}
    </text>
    <text x="190" y="125" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.muted}">
      ${esc(ellipsize(hero.artist, 40))}
    </text>
    ${hero.url ? `<a href="${hero.url}"><rect x="20" y="46" width="${leftW}" height="200" rx="14" fill="transparent"/></a>` : ""}
  </g>

  <!-- Sağ: Top Tracks -->
  <text x="${col1X}" y="32" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="18" font-weight="700" fill="${COLORS.green}">
    Top Tracks (last month)
  </text>
  <g>
    <rect x="${col1X-12}" y="46" width="${colW+24}" height="200" rx="12" fill="${COLORS.card}" stroke="${COLORS.border}"/>
    ${top.tracks.map((t,i)=>{
      const y = 72 + i*listRow;
      const img = topTrackImgs[i] || BLANK;
      return `
        <image href="${img}" x="${col1X}" y="${y - icon + 4}" width="${icon}" height="${icon}"/>
        <text x="${col1X + icon + 10}" y="${y}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.text}">
          ${esc(ellipsize(t.title, 28))} — <tspan fill="${COLORS.muted}">${esc(ellipsize(t.artist, 28))}</tspan>
        </text>
      `;
    }).join("")}
  </g>

  <!-- Sağ: Top Artists -->
  <text x="${col2X}" y="32" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="18" font-weight="700" fill="${COLORS.green}">
    Top Artists (last month)
  </text>
  <g>
    <rect x="${col2X-12}" y="46" width="${colW+24}" height="200" rx="12" fill="${COLORS.card}" stroke="${COLORS.border}"/>
    ${top.artists.map((a,i)=>{
      const y = 72 + i*listRow;
      const img = topArtistImgs[i] || BLANK;
      return `
        <defs>
          <clipPath id="artist-${i}"><circle cx="${col2X + icon/2}" cy="${y - icon/2 + 4}" r="${icon/2}"/></clipPath>
        </defs>
        <image href="${img}" x="${col2X}" y="${y - icon + 4}" width="${icon}" height="${icon}" clip-path="url(#artist-${i})"/>
        <text x="${col2X + icon + 10}" y="${y}" font-family="Inter,Segoe UI,Roboto,Arial,sans-serif" font-size="13" fill="${COLORS.text}">
          ${esc(ellipsize(a.name, 34))}
        </text>
      `;
    }).join("")}
  </g>
</svg>`.trim();
}

export default async function handler(req, res){
  try{
    const token = await getAccessToken();

    let hero = await getNowPlaying(token);
    if(!hero) hero = await getLastPlayed(token);

    const top = await getTop(token);

    const heroImg = hero?.image ? await toDataUri(hero.image) : null;
    const topTrackImgs  = await Promise.all((top.tracks||[]).map(t => t.image ? toDataUri(t.image) : BLANK));
    const topArtistImgs = await Promise.all((top.artists||[]).map(a => a.image ? toDataUri(a.image) : BLANK));

    const out = render({
      hero: hero || { title:"Not playing", artist:"—", url:null, label:"Now Playing" },
      heroImg, topTrackImgs, topArtistImgs, top
    });

    res.setHeader("Cache-Control","no-cache, no-store, max-age=0, must-revalidate");
    res.setHeader("Content-Type","image/svg+xml; charset=utf-8");
    res.status(200).send(out);
  }catch(e){
    res.setHeader("Content-Type","text/plain; charset=utf-8");
    res.status(500).send("Hata: "+(e?.message||e));
  }
}
