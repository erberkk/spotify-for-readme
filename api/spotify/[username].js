// api/spotify/[username].js — Multi-User Spotify Widget
import { createClient } from 'redis';

let redisClient = null;

async function getRedisClient() {
  if (!redisClient) {
    const { REDIS_URL } = process.env;
    if (!REDIS_URL) {
      throw new Error('REDIS_URL environment variable not set');
    }
    
    redisClient = createClient({
      url: REDIS_URL,
      socket: {
        tls: false
      }
    });
    
    await redisClient.connect();
  }
  return redisClient;
}

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
function smartEllipsize(text, maxWidth, fontSize = 14, fontWeight = 'normal') {
  if (!text) return "—";
  
  // Karakter başına ortalama piksel (font-size ve weight'e göre tahmin)
  const charWidth = fontSize * (fontWeight === 'bold' || fontWeight === '700' ? 0.6 : 0.55);
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

async function getAccessToken(username) {
  const redis = await getRedisClient();
  const userKey = `spotify:user:${username}`;
  
  // Get user data from Redis
  const userData = await redis.hGetAll(userKey);
  
  if (!userData.refresh_token) {
    throw new Error('User not found or token expired');
  }

  // Check if access token exists
  if (userData.access_token) {
    return userData.access_token;
  }

  // Need to refresh the token
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  
  const body = new URLSearchParams({ 
    grant_type: "refresh_token", 
    refresh_token: userData.refresh_token 
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
  
  if (!res.ok) {
    throw new Error("Token refresh failed - user needs to re-authorize");
  }
  
  const tokenData = await res.json();
  
  // Update Redis with new access token
  await redis.hSet(userKey, {
    access_token: tokenData.access_token
  });
  
  return tokenData.access_token;
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
function render({ hero, heroImg, top, tImgs, aImgs, username }) {
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
  
  const titleY = imgY + 35;
  const artistY = titleY + 28;
  const statusY = artistY + 25;

  // Progress bar için
  const progressY = imgY + imgSize + 20;
  const progressWidth = cardW - 32;
  const progressPercent = hero.duration > 0 ? (hero.progress / hero.duration) : 0;
  const currentW = progressWidth * progressPercent;
  const remainingMs = Math.max(0, (hero.duration || 0) - (hero.progress || 0));

  // List item dimensions
  const listItemHeight = 40;
  const iconSize = 28;

  // Particle sistem için koordinatlar
  const particles = [
    { x: W * 0.75, y: H * 0.25, size: 8, delay: '0s' },
    { x: W * 0.85, y: H * 0.4, size: 6, delay: '2s' },
    { x: W * 0.7, y: H * 0.6, size: 10, delay: '4s' },
    { x: W * 0.9, y: H * 0.15, size: 5, delay: '1s' },
    { x: W * 0.65, y: H * 0.8, size: 7, delay: '3s' },
    { x: W * 0.8, y: H * 0.7, size: 9, delay: '5s' }
  ];

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Summary for ${username}">
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
      <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
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

    <!-- Animations -->
    <style>
      .fade-in { animation: fadeIn 0.8s ease-out; }
      .slide-up { animation: slideUp 0.6s ease-out; }
      .pulse { animation: pulse 2s infinite; }
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
      
      @keyframes float {
        0%, 100% { 
          transform: translate(0, 0) scale(1);
          opacity: 0.6;
        }
        25% { 
          transform: translate(15px, -20px) scale(1.2);
          opacity: 0.8;
        }
        50% { 
          transform: translate(30px, -10px) scale(0.8);
          opacity: 1;
        }
        75% { 
          transform: translate(20px, 15px) scale(1.1);
          opacity: 0.7;
        }
      }
      
      .particle {
        animation: float 8s infinite ease-in-out;
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
  
  <!-- Floating Particles (Sağ tarafta küçük parçacıklar) -->
  ${particles.map((p, i) => `
    <circle cx="${p.x}" cy="${p.y}" r="${p.size}" fill="${COLORS.green}" opacity="0.15" 
            class="particle" style="animation-delay: ${p.delay}"/>
    <circle cx="${p.x}" cy="${p.y}" r="${p.size/2}" fill="${COLORS.accent}" opacity="0.3" 
            class="particle" style="animation-delay: ${p.delay}"/>
  `).join('')}

  <!-- Spotify logo and title -->
  <image x="${margin}" y="8" width="24" height="24" href="/Spotify.png" class="fade-in"/>
  <text x="${margin + 32}" y="28" font-family="SF Pro Display,Inter,Segoe UI,system-ui,sans-serif" 
        font-size="24" font-weight="800" fill="url(#greenGrad)" class="glow-text fade-in">
    Spotify
  </text>

  <!-- Card titles -->
  <g class="slide-up">
    <!-- Top Tracks icon and text -->
    <image x="${x2 + 8}" y="28" width="20" height="20" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjRweCIgdmlld0JveD0iMCAtOTYwIDk2MCA5NjAiIHdpZHRoPSIyNHB4IiBmaWxsPSIjZTNlM2UzIj48cGF0aCBkPSJNODUyLTIxMiA3MzItMzMybDU2LTU2IDEyMCAxMjAtNTYgNTZaTTcwOC02OTJsLTU2LTU2IDEyMC0xMjAgNTYgNTYtMTIwIDEyMFpNNDUyLTY5MkwxMzItODEybDU2LTU2IDEyMCAxMjAtNTYgNTZaTTEwOC0yMTJsLTU2LTU2IDEyMC0xMjAgNTYgNTYtMTIwIDEyMFpNMjMzLTEyMGw2NS0yODFMODAtNTkwbDI4OC0yNSAxMTItMjY1IDExMiAyNjUgMjg4IDI1LTIxOCAxODkgNjUgMjgxLTI0Ny0xNDktMjQ3IDE0OVptMjQ3LTM2MVoiLz48L3N2Zz4=" class="fade-in"/>
    <text x="${x2 + 32}" y="44" font-family="SF Pro Display,Inter,Segoe UI,system-ui,sans-serif" 
          font-size="16" font-weight="600" fill="${COLORS.text}">
      Top Tracks
    </text>
  </g>
  
  <g class="slide-up">
    <!-- Top Artists icon and text -->
    <image x="${x3 + 8}" y="28" width="20" height="20" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIGhlaWdodD0iMjRweCIgdmlld0JveD0iMCAtOTYwIDk2MCA5NjAiIHdpZHRoPSIyNHB4IiBmaWxsPSIjZTNlM2UzIj48cGF0aCBkPSJNNzQwLTU2MGgxNDB2ODBoLTgwdjIyMHEwIDQyLTI5IDcxdC03MSAyOXEtNDIgMC03MS0yOXQtMjktNzFxMC00MiAyOS03MXQ3MS0yOXE4IDAgMTggMS41dDIyIDYuNXYtMjA4Wk0xMjAtMTYwdi0xMTJxMC0zNSAxNy41LTYzdDQ2LjUtNDNxNjItMzEgMTI2LTQ2LjVUMTQ0MC00NDBxNDIgMCA4My41IDYuNVQ2MDctNDE0cS0yMCAxMi0zNiAyOXQtMjggMzdxLTI2LTYtNTEuNS05dC01MS41LTMtcTU3IDAtMTEyIDE0dC0xMDggNDBxLTkgNS0xNC41IDE0dC01LjUgMjB2MzJoMzIxcTIwIDkuNSA0MHQyMC41IDQwSDEyMFptMzIwLTMyMHEtNjYgMC0xMTMtNDd0LTQ3LTExM3EwLTY2IDQ3LTExM3QxMTMtNDdxNjYgMCAxMTMgNDd0NDcgMTEzcTAgNjYtNDcgMTEzdC0xMTMgNDdaTTQ0MC04MHEzMyAwIDU2LjUtMjMuNVQ1MjAtNjQwcTAtMzMtMjMuNS01Ni41VDQ0MC03MjBxLTMzIDAtNTYuNSAyMy41VDM2MC02NDBxMCAzMyAyMy41IDU2LjVUNDQwLTU2MFptMC04MFptMCA0MDBaIi8+PC9zdmc+" class="fade-in"/>
    <text x="${x3 + 32}" y="44" font-family="SF Pro Display,Inter,Segoe UI,system-ui,sans-serif" 
          font-size="16" font-weight="600" fill="${COLORS.text}">
      Top Artists
    </text>
  </g>

  <!-- Card 1: Now Playing/Paused/Last -->
  <g class="card-hover fade-in">
    <rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" 
          fill="url(#cardGrad)" stroke="${COLORS.border}" stroke-width="2" filter="url(#shadow)"/>
    
    <!-- Album art (Static - No Rotation) -->
    ${heroImg ? 
      `<image href="${heroImg}" x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" 
              clip-path="url(#heroImg)"/>` :
      `<rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" rx="12" fill="#333"/>
       <text x="${imgX + imgSize/2}" y="${imgY + imgSize/2 + 8}" text-anchor="middle" 
             font-family="SF Pro Display,Inter,system-ui,sans-serif" font-size="32" fill="${COLORS.muted}">♪</text>`
    }
    
    <!-- Glowing border for album art if playing -->
    ${hero.isPlaying ? 
      `<rect x="${imgX}" y="${imgY}" width="${imgSize}" height="${imgSize}" rx="12" 
             fill="none" stroke="${COLORS.green}" stroke-width="3" opacity="0.8" class="pulse"/>` : ''
    }
    
    <!-- Song info with better fonts and sizing -->
    <text x="${textX}" y="${titleY}" font-family="SF Pro Display,Inter,Segoe UI,system-ui,sans-serif" 
          font-size="18" fill="${COLORS.text}" font-weight="700">
      ${esc(smartEllipsize(hero.title, textWidth, 18, 'bold'))}
    </text>
    <text x="${textX}" y="${artistY}" font-family="SF Pro Display,Inter,Segoe UI,system-ui,sans-serif" 
          font-size="15" fill="${COLORS.muted}" font-weight="500">
      ${esc(smartEllipsize(hero.artist, textWidth, 15))}
    </text>
    
    <!-- Status indicator -->
    <g>
      <circle cx="${textX}" cy="${statusY}" r="5" fill="${hero.isPlaying ? COLORS.green : COLORS.muted}" 
              class="${hero.isPlaying ? 'pulse' : ''}"/>
      <text x="${textX + 16}" y="${statusY + 5}" font-family="SF Pro Display,Inter,system-ui,sans-serif" 
            font-size="13" fill="${hero.isPlaying ? COLORS.green : COLORS.muted}" font-weight="600" letter-spacing="0.5px">
        ${hero.isPlaying ? 'PLAYING' : (hero.label === 'Paused' ? 'PAUSED' : 'OFFLINE')}
      </text>
    </g>
    
    <!-- Progress bar -->
    ${hero.duration > 0 ? `
      <!-- Backdrop -->
      <rect x="${imgX}" y="${progressY}" width="${progressWidth}" height="4" rx="2" fill="${COLORS.border}"/>
      
      <!-- Foreground (animates only if playing) -->
      <rect x="${imgX}" y="${progressY}" width="${currentW}" height="4" rx="2" fill="url(#greenGrad)">
        ${hero.isPlaying ? `
          <animate 
            attributeName="width"
            from="${currentW}" 
            to="${progressWidth}" 
            dur="${(remainingMs/1000).toFixed(2)}s"
            fill="freeze"
            begin="0s" />
        ` : ``}
      </rect>
    ` : ``}

    
    <!-- Clickable area -->
    ${hero.url ? 
      `<a href="${hero.url}" target="_blank">
        <rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" fill="transparent"/>
      </a>` : ''
    }
  </g>

  <!-- Card 2: Top Tracks -->
  <g class="card-hover fade-in">
    <rect x="${x2}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" 
          fill="url(#cardGrad)" stroke="${COLORS.border}" stroke-width="2" filter="url(#shadow)"/>
    
    ${top.tracks.map((t, i) => {
      const itemY = topY + 30 + (i * listItemHeight);
      const centerY = itemY + (listItemHeight / 2);
      const img = tImgs[i] || BLANK;
      const trackTextWidth = cardW - 100;
      const rank = i + 1;
      
      return `
        <g class="slide-up" style="animation-delay: ${i * 0.1}s">
          <!-- Rank number -->
          <text x="${x2 + 16}" y="${centerY + 6}" text-anchor="middle" 
                font-family="SF Pro Display,Inter,system-ui,sans-serif" font-size="16" font-weight="800" 
                fill="${COLORS.accent}" opacity="0.8">${rank}</text>
          
          <!-- Track image (square with border radius) -->
          <rect x="${x2 + 36}" y="${centerY - iconSize/2}" width="${iconSize}" height="${iconSize}" 
                rx="6" fill="${COLORS.border}"/>
          <image href="${img}" x="${x2 + 36}" y="${centerY - iconSize/2}" width="${iconSize}" height="${iconSize}" 
                 style="clip-path: inset(0 round 6px)"/>
          
          <!-- Track info (vertically centered) -->
          <text x="${x2 + 76}" y="${centerY - 4}" font-family="SF Pro Display,Inter,system-ui,sans-serif" 
                font-size="14" font-weight="600" fill="${COLORS.text}">
            ${esc(smartEllipsize(t.title, trackTextWidth * 0.65, 14, 'bold'))}
          </text>
          <text x="${x2 + 76}" y="${centerY + 12}" font-family="SF Pro Display,Inter,system-ui,sans-serif" 
                font-size="12" fill="${COLORS.muted}" font-weight="500">
            ${esc(smartEllipsize(t.artist, trackTextWidth * 0.8, 12))}
          </text>
          
          <!-- Hover effect -->
          ${t.url ? 
            `<a href="${t.url}" target="_blank">
              <rect x="${x2 + 8}" y="${itemY}" width="${cardW - 16}" height="${listItemHeight}" rx="8" fill="transparent"/>
            </a>` : ''
          }
        </g>
      `;
    }).join("")}
  </g>

  <!-- Card 3: Top Artists -->
  <g class="card-hover fade-in">
    <rect x="${x3}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" 
          fill="url(#cardGrad)" stroke="${COLORS.border}" stroke-width="2" filter="url(#shadow)"/>
    
    ${top.artists.map((a, i) => {
      const itemY = topY + 30 + (i * listItemHeight);
      const centerY = itemY + (listItemHeight / 2);
      const img = aImgs[i] || BLANK;
      const artistTextWidth = cardW - 100;
      const rank = i + 1;
      
      return `
        <g class="slide-up" style="animation-delay: ${i * 0.1}s">
          <!-- Rank number -->
          <text x="${x3 + 16}" y="${centerY + 6}" text-anchor="middle" 
                font-family="SF Pro Display,Inter,system-ui,sans-serif" font-size="16" font-weight="800" 
                fill="${COLORS.green}" opacity="0.8">${rank}</text>
          
          <!-- Artist image (square with border radius) -->
          <rect x="${x3 + 36}" y="${centerY - iconSize/2}" width="${iconSize}" height="${iconSize}" 
                rx="6" fill="${COLORS.border}"/>
          <image href="${img}" x="${x3 + 36}" y="${centerY - iconSize/2}" width="${iconSize}" height="${iconSize}" 
                 style="clip-path: inset(0 round 6px)"/>
          
          <!-- Artist name (vertically centered) -->
          <text x="${x3 + 76}" y="${centerY + 4}" font-family="SF Pro Display,Inter,system-ui,sans-serif" 
                font-size="15" font-weight="600" fill="${COLORS.text}">
            ${esc(smartEllipsize(a.name, artistTextWidth, 15, 'bold'))}
          </text>
          
          <!-- Hover effect -->
          ${a.url ? 
            `<a href="${a.url}" target="_blank">
              <rect x="${x3 + 8}" y="${itemY}" width="${cardW - 16}" height="${listItemHeight}" rx="8" fill="transparent"/>
            </a>` : ''
          }
        </g>
      `;
    }).join("")}
  </g>

  <!-- Footer -->
  <text x="${W - margin}" y="${H - 12}" text-anchor="end" 
        font-family="SF Pro Display,Inter,system-ui,sans-serif" font-size="10" 
        fill="${COLORS.muted}" opacity="0.6">
    Last updated: ${new Date().toLocaleString('tr-TR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    })}
  </text>
</svg>`.trim();
}

// Error SVG for when user is not found or needs authorization
function renderErrorSvg(username, errorType = 'not_found') {
  const W = 1000, H = 320;
  
  let title, message, actionText, actionUrl;
  
  if (errorType === 'not_found') {
    title = 'User Not Found';
    message = `${username} hasn't connected their Spotify account yet`;
    actionText = 'Connect Spotify';
  } else if (errorType === 'expired') {
    title = 'Authorization Expired';
    message = `${username}'s Spotify token has expired`;
    actionText = 'Reconnect Spotify';
  } else {
    title = 'Error';
    message = 'Something went wrong';
    actionText = 'Try Again';
  }

  return `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Spotify Setup Required">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0a0e13;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#0d1117;stop-opacity:1" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#16181d;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1a1d24;stop-opacity:1" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="100%" height="100%" fill="url(#bgGrad)"/>
  
  <!-- Main card -->
  <rect x="50" y="50" width="${W-100}" height="${H-100}" rx="20" 
        fill="url(#cardGrad)" stroke="#2a2d35" stroke-width="2"/>
  
  <!-- Content -->
  <text x="${W/2}" y="120" text-anchor="middle" 
        font-family="SF Pro Display,Inter,system-ui,sans-serif" font-size="32" 
        fill="#ffffff" font-weight="700">
    🎵 ${title}
  </text>
  
  <text x="${W/2}" y="160" text-anchor="middle" 
        font-family="SF Pro Display,Inter,system-ui,sans-serif" font-size="16" 
        fill="#9ca3af">
    ${message}
  </text>
  
  <text x="${W/2}" y="200" text-anchor="middle" 
        font-family="SF Pro Display,Inter,system-ui,sans-serif" font-size="14" 
        fill="#1ed760" font-weight="600">
    Visit: https://${process.env.VERCEL_URL || 'your-domain.vercel.app'}/api/auth/login
  </text>
  
  <text x="${W/2}" y="220" text-anchor="middle" 
        font-family="SF Pro Display,Inter,system-ui,sans-serif" font-size="14" 
        fill="#9ca3af">
    to ${actionText.toLowerCase()}
  </text>
</svg>`.trim();
}

// ------- Handler -------
export default async function handler(req, res) {
  try {
    const { username } = req.query;
    
    if (!username) {
      return res.status(400).send(renderErrorSvg('unknown', 'not_found'));
    }

    let token;
    try {
      token = await getAccessToken(username);
    } catch (error) {
      console.log(`User ${username} not found or token expired:`, error.message);
      const errorType = error.message.includes('not found') ? 'not_found' : 'expired';
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      return res.status(200).send(renderErrorSvg(username, errorType));
    }

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
    const svg = render({ hero, heroImg, top, tImgs, aImgs, username });

    // Cache headers - Short cache for real-time updates
    res.setHeader("Cache-Control", "public, max-age=30, s-maxage=30");
    res.setHeader("CDN-Cache-Control", "max-age=30");
    res.setHeader("Vercel-CDN-Cache-Control", "max-age=30");
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Refresh", "30");

    res.status(200).send(svg);
  } catch (e) {
    console.error("Spotify widget error:", e);
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    const username = req.query.username || 'unknown';
    res.status(200).send(renderErrorSvg(username, 'error'));
  }
}
