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
        tls: false,
        connectTimeout: 60000, // 60 seconds
        commandTimeout: 10000  // 10 seconds per command
      },
      retry_strategy: (options) => {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          return new Error('The server refused the connection');
        }
        if (options.total_retry_time > 1000 * 60 * 60) {
          return new Error('Retry time exhausted');
        }
        if (options.attempt > 10) {
          return undefined;
        }
        return Math.min(options.attempt * 100, 3000);
      }
    });
    
    redisClient.on('error', (err) => {
      console.error('Redis Client Error:', err);
      redisClient = null;
    });
    
    redisClient.on('connect', () => {
      console.log('✅ Redis connected successfully');
    });
    
    redisClient.on('reconnecting', () => {
      console.log('🔄 Redis reconnecting...');
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

  // Try using existing access token first (if exists)
  if (userData.access_token) {
    // Test if token is still valid by making a simple API call
    try {
      const testResponse = await fetch("https://api.spotify.com/v1/me", {
        headers: { Authorization: `Bearer ${userData.access_token}` },
        signal: AbortSignal.timeout(5000)
      });
      
      if (testResponse.ok) {
        console.log(`✅ Access token valid for user: ${username}`);
        return userData.access_token;
      } else {
        console.log(`⚠️ Access token invalid for user: ${username}, status: ${testResponse.status}`);
      }
    } catch (error) {
      console.log(`⚠️ Access token test failed for user: ${username}, error: ${error.message}`);
    }
  }

  // Token doesn't exist or is invalid - refresh it
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
    body,
    signal: AbortSignal.timeout(10000)
  });
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error(`❌ Token refresh failed for user: ${username}, status: ${res.status}, error: ${errorText}`);
    throw new Error("Token refresh failed - user needs to re-authorize");
  }
  
  const tokenData = await res.json();
  
  // Update Redis with new access token and timestamp
  await redis.hSet(userKey, {
    access_token: tokenData.access_token,
    token_refreshed_at: Date.now()
  });
  
  return tokenData.access_token;
}

// ------- Spotify API -------
async function getNowPlaying(token) {
  try {
    const r = await fetch("https://api.spotify.com/v1/me/player/currently-playing", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000) // 8 second timeout
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
  } catch (error) {
    console.error('❌ getNowPlaying error:', error.message);
    return null;
  }
}

async function getLastPlayed(token) {
  try {
    const r = await fetch("https://api.spotify.com/v1/me/player/recently-played?limit=1", {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000) // 8 second timeout
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
  } catch (error) {
    console.error('❌ getLastPlayed error:', error.message);
    return null;
  }
}

async function getTop(token) {
  try {
    const [trRes, arRes] = await Promise.all([
      fetch("https://api.spotify.com/v1/me/top/tracks?time_range=short_term&limit=5", { 
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000) // 8 second timeout
      }),
      fetch("https://api.spotify.com/v1/me/top/artists?time_range=short_term&limit=5", { 
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(8000) // 8 second timeout
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
  } catch (error) {
    console.error('❌ getTop error:', error.message);
    return { tracks: [], artists: [] };
  }
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
      
      /* Hover effects for clickable items */
      rect[style*="cursor: pointer"]:hover {
        fill: rgba(30, 215, 96, 0.1) !important;
      }
      
      a:hover rect {
        fill: rgba(30, 215, 96, 0.1) !important;
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
  <a href="https://open.spotify.com/user/${username}" target="_blank">
    <text x="10" y="28" font-family="SF Pro Display,Inter,Segoe UI,system-ui,sans-serif" 
          font-size="24" font-weight="800" fill="url(#greenGrad)" class="glow-text fade-in"
          style="cursor: pointer">
      <title>Spotify Profiline Git</title>
      Spotify
    </text>
  </a>

  <!-- Card titles -->
  <g class="slide-up">
    <!-- Top Tracks icon and text -->
    <g x="${x2 + 8}" y="28">
      <svg x="${x2 + 8}" y="28" width="20" height="20" viewBox="0 -960 960 960" fill="#FFFFFF">
        <path d="M852-212 732-332l56-56 120 120-56 56ZM708-692l-56-56 120-120 56 56-120 120Zm-456 0L132-812l56-56 120 120-56 56ZM108-212l-56-56 120-120 56 56-120 120Zm246-75 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143ZM233-120l65-281L80-590l288-25 112-265 112 265 288 25-218 189 65 281-247-149-247 149Zm247-361Z"/>
      </svg>
    </g>
    <text x="${x2 + 32}" y="44" font-family="SF Pro Display,Inter,Segoe UI,system-ui,sans-serif" 
          font-size="16" font-weight="600" fill="${COLORS.text}">
      Top Tracks
    </text>
  </g>
  
  <g class="slide-up">
    <!-- Top Artists icon and text -->
    <g x="${x3 + 8}" y="28">
      <svg x="${x3 + 8}" y="28" width="20" height="20" viewBox="0 -960 960 960" fill="#FFFFFF">
        <path d="M740-560h140v80h-80v220q0 42-29 71t-71 29q-42 0-71-29t-29-71q0-42 29-71t71-29q8 0 18 1.5t22 6.5v-208ZM120-160v-112q0-35 17.5-63t46.5-43q62-31 126-46.5T440-440q42 0 83.5 6.5T607-414q-20 12-36 29t-28 37q-26-6-51.5-9t-51.5-3q-57 0-112 14t-108 40q-9 5-14.5 14t-5.5 20v32h321q2 20 9.5 40t20.5 40H120Zm320-320q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 66-47 113t-113 47Zm0-80q33 0 56.5-23.5T520-640q0-33-23.5-56.5T440-720q-33 0-56.5 23.5T360-640q0 33 23.5 56.5T440-560Zm0-80Zm0 400Z"/>
      </svg>
    </g>
    <text x="${x3 + 32}" y="44" font-family="SF Pro Display,Inter,Segoe UI,system-ui,sans-serif" 
          font-size="16" font-weight="600" fill="${COLORS.text}">
      Top Artists
    </text>
  </g>

  <!-- Card 1: Now Playing/Paused/Last -->
  <g class="card-hover fade-in">
    ${hero.url ? `<a href="${hero.url}" target="_blank">` : ''}
    <rect x="${x1}" y="${topY}" width="${cardW}" height="${cardH}" rx="16" 
          fill="url(#cardGrad)" stroke="${COLORS.border}" stroke-width="2" filter="url(#shadow)"
          style="cursor: ${hero.url ? 'pointer' : 'default'}">
      <title>${hero.url ? 'Tıklayın - Spotify\'da dinleyin' : esc(hero.title) + ' - ' + esc(hero.artist)}</title>
    </rect>
    ${hero.url ? `</a>` : ''}
    
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
          ${t.url ? `<a href="${t.url}" target="_blank">` : ''}
          <rect x="${x2 + 8}" y="${itemY}" width="${cardW - 16}" height="${listItemHeight - 4}" rx="8" 
                fill="transparent" style="cursor: ${t.url ? 'pointer' : 'default'}">
            <title>${t.url ? 'Tıklayın - Spotify\'da dinleyin' : esc(t.name) + ' - ' + esc(t.artist)}</title>
          </rect>
          ${t.url ? `</a>` : ''}
          
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
          ${a.url ? `<a href="${a.url}" target="_blank">` : ''}
          <rect x="${x3 + 8}" y="${itemY}" width="${cardW - 16}" height="${listItemHeight - 4}" rx="8" 
                fill="transparent" style="cursor: ${a.url ? 'pointer' : 'default'}">
            <title>${a.url ? 'Tıklayın - Spotify\'da dinleyin' : esc(a.name)}</title>
          </rect>
          ${a.url ? `</a>` : ''}
          
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
  const startTime = Date.now();
  
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error('⏰ Request timeout after 25 seconds');
      res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
      res.status(200).send(renderErrorSvg('timeout', 'error'));
    }
  }, 25000); // 25 second timeout
  
  try {
    const { username } = req.query;
    
    if (!username) {
      clearTimeout(timeout);
      return res.status(400).send(renderErrorSvg('unknown', 'not_found'));
    }

    let token;
    try {
      token = await getAccessToken(username);
    } catch (error) {
      clearTimeout(timeout);
      console.log(`❌ User ${username} not found or token expired:`, error.message);
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

    // 3) Görseller (paralel olarak)
    const [heroImg, tImgs, aImgs] = await Promise.all([
      hero?.image ? toDataUri(hero.image) : Promise.resolve(null),
      Promise.all((top.tracks || []).map(t => 
        t.image ? toDataUri(t.image) : Promise.resolve(BLANK)
      )),
      Promise.all((top.artists || []).map(a => 
        a.image ? toDataUri(a.image) : Promise.resolve(BLANK)
      ))
    ]);

    // 4) Render
    const svg = render({ hero, heroImg, top, tImgs, aImgs, username });

    clearTimeout(timeout);
    const duration = Date.now() - startTime;

    // Cache headers - Real-time updates
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    res.setHeader("CDN-Cache-Control", "no-store");
    res.setHeader("Vercel-CDN-Cache-Control", "no-store");
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");

    res.status(200).send(svg);
  } catch (e) {
    clearTimeout(timeout);
    const duration = Date.now() - startTime;
    console.error(`❌ Spotify widget error for user ${req.query.username} after ${duration}ms:`, e);
    res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
    const username = req.query.username || 'unknown';
    res.status(200).send(renderErrorSvg(username, 'error'));
  }
}
