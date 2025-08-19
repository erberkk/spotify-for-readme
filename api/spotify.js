// api/spotify.js — Enhanced Animated Spotify Widget
const {
  SPOTIFY_CLIENT_ID,
  SPOTIFY_CLIENT_SECRET,
  SPOTIFY_REFRESH_TOKEN
} = process.env;

// ------- Stil -------
const COLORS = {
  bg: "#0a0e13",
  card: "#16181d",
  cardHover: "#1a1d24",
  green: "#1ed760",
  greenGlow: "#1ed76050",
  accent: "#00d4ff",
  text: "#ffffff",
  muted: "#9ca3af",
  border: "#2a2d35",
  shadow: "#00000040"
};

// ------- Utils -------
function esc(s) { 
  return (s || "—")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;"); 
}

// Dinamik metin kısaltma - card genişliğine göre
function smartEllipsize(text, maxWidth, fontSize = 13, fontWeight = 'normal') {
  if (!text) return "—";
  
  // Karakter başına ortalama piksel (font-size ve weight'e göre tahmin)
  const charWidth = fontSize * (fontWeight === 'bold' || fontWeight === '700' ? 0.65 : 0.55);
  const maxChars = Math.floor(maxWidth / charWidth);
  
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 3) + "…";
}

const BLANK = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAuMBgV3QJRoAAAAASUVORK5CYII=";

async function toDataUri(url) {
  if (!url) return BLANK;
  try {
    const r = await fetch(url, { 
      headers: { "User-Agent": "Mozilla/5.0" },
      timeout: 5000 
    });
    if (!r.ok) return BLANK;
    const buf = Buffer.from(await r.arrayBuffer());
    const mime = r.headers.get("content-type") || "image/jpeg";
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch { 
    return BLANK; 
  }
}

async function getAccessToken() {
  const body = new URLSearchParams({ 
    grant_type: "refresh_token", 
    refresh_token: SPOTIFY_REFRESH_TOKEN 
  });
  const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString("base64");
  
  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { 
      Authorization: `Basic ${auth}`, 
      "Content-Type": "application/x-www-form-urlencoded" 
    },
    body
  });
  
  if (!res.ok) throw new Error("Token yenileme başarısız");
  const j = await res.json();
  return j.access_token;
}

// ------- Spotify API -------
async function getNowPlaying(token) {
  const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (r.status === 204 || !r.ok) return null;
  
  const j = await r.json();
  const it = j.item;
  if (!it) return null;
  
  return {
    title: it.name,
    artist: (it.artists || []).map(a => a.name).join(", "),
    url: it.external_urls?.spotify,
    image: it.album?.images?.[0]?.url || null,
    isPlaying: j.is_playing === true,
    progress: j.progress_ms || 0,
    duration: it.duration_ms || 0
  };
}

async function getLastPlayed(token) {
  const r = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!r.ok) return null;
  
  const j = await r.json();
  const it = j.items?.[0]?.track;
  if (!it) return null;
  
  return {
    title: it.name,
    artist: (it.artists || []).map(a => a.name).join(", "),
    url: it.external_urls?.spotify,
    image: it.album?.images?.[0]?.url || null
  };
}

async function getTop(token) {
  const [trRes, arRes] = await Promise.all([
    fetch("https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5", { 
      headers: { Authorization: `Bearer ${token}` } 
    }),
    fetch("https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5", { 
      headers: { Authorization: `Bearer ${token}` } 
    })
  ]);
  
  const tr = trRes.ok ? await trRes.json() : { items: [] };
  const ar = arRes.ok ? await arRes.json() : { items: [] };

  const tracks = (tr.items || []).map(t => ({
    title: t.name,
    artist: (t.artists || []).map(a => a.name).join(", "),
    image: t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
    url: t.external_urls?.spotify
  }));

  const artists = (ar.items || []).map(a => ({
    name: a.name,
    image: a.images?.[2]?.url || a.images?.[1]?.url || a.images?.[0]?.url || null,
    url: a.external_urls?.spotify
  }));

  return { tracks, artists };
}

// ------- Enhanced SVG Renderer -------
function render({ hero, heroImg, top, tImgs, aImgs }) {
  const W = 1000, H = 320;
  const margin = 24, gutter = 20;
  const innerW = W - margin * 2 - gutter * 2;
  const cardW = Math.floor(innerW / 3);
  const cardH = 240;
  const topY = 60;

  const x1 = margin;
  const x2 = margin + cardW + gutter;
  const x3 = margin + (cardW + gutter) * 2;

  // Sol kart için dinamik layout
  const imgSize = 140;
  const imgX = x1 + 16;
  const imgY = topY + 20;
  const textX = imgX + imgSize + 20;
  const textWidth = cardW - imgSize - 50;
  
  const titleY = imgY + 30;
  const artistY = titleY + 25;
  const statusY = artistY + 20;

  // Progress bar için
  const progressY = imgY + imgSize + 20;
  const progressWidth = cardW - 32;
  const progressPercent = hero.duration > 0 ? (hero.progress / hero.duration) * 100 : 0;

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Summary">
  <defs>
    <!-- Gradients -->
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.bg};stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0d1117;stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${COLORS.card};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${COLORS.cardHover};stop-opacity:1" />
    </linearGradient>
    
    <linearGradient id="greenGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" style="stop-color:${COLORS.green};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${COLORS.accent};stop-opacity:1" />
    </linearGradient>

    <!-- Filters -->
    <filter id="glow">
      <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
      <feMerge> 
        <feMergeNode in="coloredBlur"/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>

    <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
      <feDropShadow dx="0" dy="4" stdDeviation="8" flood-color="${COLORS.shadow}"/>
    </filter>

    <!-- Clip paths -->
    <clipPath id="heroImg">
      <rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" rx="12"/>
    </clipPath>
    
    ${top.artists.map((_, i) => 
      `<clipPath id="artist-${i}">
        <circle cx="${x3 + 26 + 12}" cy="${topY + 40 + (i + 1) * 35 - 6}" r="12"/>
      </clipPath>`
    ).join("")}

    <!-- Animations -->
    <style>
      .fade-in { animation: fadeIn 0.8s ease-out; }
      .slide-up { animation: slideUp 0.6s ease-out; }
      .pulse { animation: pulse 2s infinite; }
      .rotate { animation: rotate 20s linear infinite; }
      .glow-text { filter: url(#glow); }
      
      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      
      @keyframes slideUp {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.7; }
      }
      
      @keyframes rotate {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      
      .card-hover {
        transition: all 0.3s ease;
      }
      
      .card-hover:hover {
        filter: brightness(1.1);
        transform: translateY(-2px);
      }
    </style>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bgGrad)"/>
  
  <!-- Ambient lighting effects -->
  <circle cx="${W*0.2}" cy="${H*0.3}" r="100" fill="${COLORS.greenGlow}" opacity="0.1" class="pulse"/>
  <circle cx="${W*0.8}" cy="${H*0.7}" r="80" fill="${COLORS.accent}30" opacity="0.08" class="pulse"/>

  <!-- Main title with glow -->
  <text x="${margin}" y="32" font-family="Inter,SF Pro Display,Segoe UI,Roboto,Arial,sans-serif" 
        font-size="24" font-weight="800" fill="url(#greenGrad)" class="glow-text fade-in">
    🎵 Spotify Dashboard
  </text>

  <!-- Card titles -->
  <text x="${x1 + 8}" y="52" font-family="Inter,SF Pro Display,Segoe UI,Roboto,Arial,sans-serif" 
        font-size="16" font-weight="600" fill="${COLORS.text}" class="slide-up">
    ${esc(hero.label)}
  </text>
  <text x="${x2 + 8}" y="52" font-family="Inter,SF Pro Display,Segoe UI,Roboto,Arial,sans-serif" 
        font-size="16" font-weight="600" fill="${COLORS.text}" class="slide-up">
    🔥 Top Tracks
  </text>
  <text x="${x3 + 8}" y="52" font-family="Inter,SF Pro Display,Segoe UI,Roboto,Arial,sans-serif" 
        font-size="16" font-weight="600" fill="${COLORS.text}" class="slide-up">
    ⭐ Top Artists
  </text>

  <!-- Card 1: Now Playing/Paused/Last (Enhanced) -->
  <g class="card-hover fade-in">
    <rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" 
          fill="url(#cardGrad)" stroke="${COLORS.border}" stroke-width="2" filter="url(#shadow)"/>
    
    <!-- Album art with rotation if playing -->
    ${heroImg ? 
      `<image href="${heroImg}" x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" 
              clip-path="url(#heroImg)" class="${hero.isPlaying ? 'rotate' : ''}"/>` :
      `<rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" rx="12" fill="#333"/>
       <text x="${imgX + imgSize/2}" y="${imgY + imgSize/2}" text-anchor="middle" 
             font-family="Inter" font-size="24" fill="${COLORS.muted}">♪</text>`
    }
    
    <!-- Glowing border for album art if playing -->
    ${hero.isPlaying ? 
      `<rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" rx="12" 
             fill="none" stroke="${COLORS.green}" stroke-width="3" opacity="0.6" class="pulse"/>` : ''
    }
    
    <!-- Song info with smart ellipsize -->
    <text x="${textX}" y="${titleY}" font-family="Inter,SF Pro Display,Segoe UI,Roboto,Arial,sans-serif" 
          font-size="16" fill="${COLORS.text}" font-weight="700">
      ${esc(smartEllipsize(hero.title, textWidth, 16, 'bold'))}
    </text>
    <text x="${textX}" y="${artistY}" font-family="Inter,SF Pro Display,Segoe UI,Roboto,Arial,sans-serif" 
          font-size="14" fill="${COLORS.muted}">
      ${esc(smartEllipsize(hero.artist, textWidth, 14))}
    </text>
    
    <!-- Status indicator -->
    <g>
      <circle cx="${textX}" cy="${statusY}" r="4" fill="${hero.isPlaying ? COLORS.green : COLORS.muted}" 
              class="${hero.isPlaying ? 'pulse' : ''}"/>
      <text x="${textX + 12}" y="${statusY + 4}" font-family="Inter" font-size="12" 
            fill="${hero.isPlaying ? COLORS.green : COLORS.muted}" font-weight="600">
        ${hero.isPlaying ? 'PLAYING' : (hero.label === 'Paused' ? 'PAUSED' : 'OFFLINE')}
      </text>
    </g>
    
    <!-- Progress bar -->
    ${hero.duration > 0 ? `
      <rect x="${imgX}" y="${progressY}" width="${progressWidth}" height="4" rx="2" fill="${COLORS.border}"/>
      <rect x="${imgX}" y="${progressY}" width="${(progressWidth * progressPercent) / 100}" height="4" rx="2" 
            fill="url(#greenGrad)"/>
    ` : ''}
    
    <!-- Clickable area -->
    ${hero.url ? 
      `<a href="${hero.url}" target="_blank">
        <rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" fill="transparent"/>
      </a>` : ''
    }
  </g>

  <!-- Card 2: Top Tracks (Enhanced) -->
  <g class="card-hover fade-in">
    <rect x="${x2}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" 
          fill="url(#cardGrad)" stroke="${COLORS.border}" stroke-width="2" filter="url(#shadow)"/>
    
    ${top.tracks.map((t, i) => {
      const y = topY + 40 + (i + 1) * 35;
      const img = tImgs[i] || BLANK;
      const trackTextWidth = cardW - 80;
      const rank = i + 1;
      
      return `
        <g class="slide-up" style="animation-delay: ${i * 0.1}s">
          <!-- Rank number -->
          <text x="${x2 + 16}" y="${y + 4}" font-family="Inter" font-size="16" font-weight="800" 
                fill="${COLORS.accent}" opacity="0.7">${rank}</text>
          
          <!-- Track image -->
          <image href="${img}" x="${x2 + 38}" y="${y - 12}" width="24" height="24" rx="4"/>
          
          <!-- Track info -->
          <text x="${x2 + 70}" y="${y - 2}" font-family="Inter" font-size="13" font-weight="600" fill="${COLORS.text}">
            ${esc(smartEllipsize(t.title, trackTextWidth * 0.6, 13, 'bold'))}
          </text>
          <text x="${x2 + 70}" y="${y + 12}" font-family="Inter" font-size="11" fill="${COLORS.muted}">
            ${esc(smartEllipsize(t.artist, trackTextWidth * 0.8, 11))}
          </text>
          
          <!-- Hover effect -->
          ${t.url ? 
            `<a href="${t.url}" target="_blank">
              <rect x="${x2 + 8}" y="${y - 16}" width="${cardW - 16}" height="32" rx="8" fill="transparent"/>
            </a>` : ''
          }
        </g>
      `;
    }).join("")}
  </g>

  <!-- Card 3: Top Artists (Enhanced) -->
  <g class="card-hover fade-in">
    <rect x="${x3}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" 
          fill="url(#cardGrad)" stroke="${COLORS.border}" stroke-width="2" filter="url(#shadow)"/>
    
    ${top.artists.map((a, i) => {
      const y = topY + 40 + (i + 1) * 35;
      const img = aImgs[i] || BLANK;
      const artistTextWidth = cardW - 80;
      const rank = i + 1;
      
      return `
        <g class="slide-up" style="animation-delay: ${i * 0.1}s">
          <!-- Rank number -->
          <text x="${x3 + 16}" y="${y + 4}" font-family="Inter" font-size="16" font-weight="800" 
                fill="${COLORS.green}" opacity="0.7">${rank}</text>
          
          <!-- Artist image (circular) -->
          <image href="${img}" x="${x3 + 38}" y="${y - 12}" width="24" height="24" 
                 clip-path="url(#artist-${i})"/>
          <circle cx="${x3 + 50}" cy="${y}" r="12" fill="none" stroke="${COLORS.border}" stroke-width="1"/>
          
          <!-- Artist name -->
          <text x="${x3 + 70}" y="${y + 4}" font-family="Inter" font-size="14" font-weight="600" fill="${COLORS.text}">
            ${esc(smartEllipsize(a.name, artistTextWidth, 14, 'bold'))}
          </text>
          
          <!-- Hover effect -->
          ${a.url ? 
            `<a href="${a.url}" target="_blank">
              <rect x="${x3 + 8}" y="${y - 16}" width="${cardW - 16}" height="32" rx="8" fill="transparent"/>
            </a>` : ''
          }
        </g>
      `;
    }).join("")}
  </g>

  <!-- Footer -->
  <text x="${W - margin}" y="${H - 12}" text-anchor="end" font-family="Inter" font-size="10" 
        fill="${COLORS.muted}" opacity="0.6">
    Last updated: ${new Date().toLocaleString('tr-TR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}
  </text>
</svg>`.trim();
}

// ------- Handler -------
export default async function handler(req, res) {
  try {
    const token = await getAccessToken();

    // 1) Şu an çalan bilgisi
    const np = await getNowPlaying(token);
    let hero;

    if (np) {
      hero = { ...np, label: np.isPlaying ? "Now Playing" : "Paused" };
    } else {
      const last = await getLastPlayed(token);
      hero = last ? { ...last, label: "Last Played" }
                  : { 
                      title: "Nothing playing", 
                      artist: "Start listening on Spotify", 
                      url: null, 
                      image: null, 
                      label: "Offline",
                      isPlaying: false 
                    };
    }

    // 2) Top listeler
    const top = await getTop(token);

    // 3) Görseller
    const heroImg = hero?.image ? await toDataUri(hero.image) : null;
    const tImgs = await Promise.all((top.tracks || []).map(t => 
      t.image ? toDataUri(t.image) : Promise.resolve(BLANK)
    ));
    const aImgs = await Promise.all((top.artists || []).map(a => 
      a.image ? toDataUri(a.image) : Promise.resolve(BLANK)
    ));

    // 4) Render
    const svg = render({ hero, heroImg, top, tImgs, aImgs });

    // Cache headers
    res.setHeader("Cache-Control", "no-cache, no-store, max-age=0, must-revalidate");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).send(svg);
  } catch (e) {
    console.error("Spotify widget error:", e);
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(500).send("Hata: " + (e?.message || e));
  }
}
