// api/auth/callback.js - Spotify OAuth Callback & Token Storage
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

async function exchangeCodeForTokens(code, redirectUri) {
  const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
  
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: SPOTIFY_CLIENT_ID,
    client_secret: SPOTIFY_CLIENT_SECRET
  });

  const response = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Token exchange failed: ${error}`);
  }

  return await response.json();
}

async function getUserProfile(accessToken) {
  const response = await fetch('https://api.spotify.com/v1/me', {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });

  if (!response.ok) {
    throw new Error('Failed to get user profile');
  }

  return await response.json();
}

export default async function handler(req, res) {
  try {
    const { code, state, error } = req.query;

    // Handle authorization errors
    if (error) {
      return res.status(400).send(`
        <html>
          <head><title>Authorization Error</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1>❌ Authorization Failed</h1>
            <p>Error: ${error}</p>
            <p><a href="/api/auth/login">Try Again</a></p>
          </body>
        </html>
      `);
    }

    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    // Build redirect URI
    const baseUrl = req.headers.host.includes('localhost') 
      ? 'http://localhost:3000' 
      : `https://${req.headers.host}`;
    const redirectUri = `${baseUrl}/api/auth/callback`;

    // Exchange code for tokens
    const tokenData = await exchangeCodeForTokens(code, redirectUri);
    const { access_token, refresh_token } = tokenData;

    // Get user profile to get username
    const userProfile = await getUserProfile(access_token);
    const username = userProfile.id;

    // Store tokens in Redis
    const redis = await getRedisClient();
    const userKey = `spotify:user:${username}`;
    
    await redis.hSet(userKey, {
      refresh_token,
      access_token,
      username: userProfile.id,
      display_name: userProfile.display_name || username,
      profile_url: userProfile.external_urls?.spotify || `https://open.spotify.com/user/${username}`,
      created_at: Date.now()
    });

    // Success page with instructions
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(`
      <html>
        <head>
          <title>Spotify Integration Success</title>
          <style>
            body { 
              font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
              background: linear-gradient(135deg, #0a0e13 0%, #1a1d24 100%);
              color: #ffffff;
              margin: 0;
              padding: 50px 20px;
              text-align: center;
              min-height: 100vh;
              box-sizing: border-box;
            }
            .header {
              position: fixed;
              top: 0;
              left: 0;
              right: 0;
              padding: 20px;
              display: flex;
              justify-content: flex-end;
              z-index: 100;
            }
            .language-switcher {
              background: rgba(22, 24, 29, 0.8);
              border: 2px solid #2a2d35;
              border-radius: 25px;
              padding: 8px 16px;
              display: flex;
              gap: 10px;
              backdrop-filter: blur(10px);
            }
            .lang-btn {
              background: none;
              border: none;
              color: #9ca3af;
              cursor: pointer;
              padding: 5px 10px;
              border-radius: 15px;
              transition: all 0.3s ease;
              font-size: 14px;
            }
            .lang-btn.active {
              background: #1ed760;
              color: #000;
            }
            .lang-btn:hover:not(.active) {
              color: #ffffff;
            }
            .container {
              max-width: 600px;
              margin: 80px auto 0;
              background: #16181d;
              border-radius: 20px;
              padding: 40px;
              border: 2px solid #2a2d35;
              box-shadow: 0 20px 40px rgba(0,0,0,0.3);
            }
            h1 { 
              color: #1ed760; 
              margin-bottom: 20px;
              font-size: 2.5em;
            }
            .username {
              color: #00d4ff;
              font-weight: bold;
              background: rgba(0, 212, 255, 0.1);
              padding: 10px 20px;
              border-radius: 10px;
              display: inline-block;
              margin: 20px 0;
            }
            .url-example {
              background: #0a0e13;
              border: 1px solid #2a2d35;
              border-radius: 10px;
              padding: 20px;
              margin: 20px 0;
              font-family: 'Monaco', 'Consolas', monospace;
              font-size: 14px;
              color: #1ed760;
              word-break: break-all;
            }
            .copy-btn {
              background: linear-gradient(135deg, #1ed760, #00d4ff);
              color: #000;
              border: none;
              padding: 12px 24px;
              border-radius: 10px;
              font-weight: bold;
              cursor: pointer;
              margin: 10px;
              font-size: 14px;
            }
            .copy-btn:hover {
              transform: translateY(-2px);
              box-shadow: 0 10px 20px rgba(30, 215, 96, 0.3);
            }
            .info {
              background: rgba(156, 163, 175, 0.1);
              border-radius: 10px;
              padding: 15px;
              margin: 20px 0;
              font-size: 14px;
              color: #9ca3af;
            }
          </style>
        </head>
        <body>
          <header class="header">
            <div class="language-switcher">
              <button class="lang-btn active" data-lang="tr">🇹🇷 TR</button>
              <button class="lang-btn" data-lang="en">🇺🇸 EN</button>
            </div>
          </header>

          <div class="container">
            <h1 data-tr="🎉 Başarıyla Bağlandı!" data-en="🎉 Successfully Connected!">🎉 Başarıyla Bağlandı!</h1>
            <p data-tr="Spotify hesabınız başarıyla bağlandı." data-en="Your Spotify account has been linked successfully.">Spotify hesabınız başarıyla bağlandı.</p>
            
            <div class="username">
              <span data-tr="Kullanıcı Adı:" data-en="Username:">Kullanıcı Adı:</span> ${username}
            </div>
            
            <h3 data-tr="🔗 Kişisel Widget URL'iniz:" data-en="🔗 Your Personal Widget URL:">🔗 Kişisel Widget URL'iniz:</h3>
            <div class="url-example" id="widgetUrl">
[![Spotify Summary](https://spotify-for-readme-pi.vercel.app/api/spotify/${username})](${userProfile.external_urls?.spotify || `https://open.spotify.com/user/${username}`})
            </div>
            <button class="copy-btn" onclick="copyToClipboard()" data-tr="📋 Markdown Kopyala" data-en="📋 Copy Markdown">📋 Markdown Kopyala</button>
            
            <div class="info">
              💡 <strong data-tr="Nasıl kullanılır:" data-en="How to use:">Nasıl kullanılır:</strong><br>
              <span data-tr="1. Yukarıdaki markdown kodunu kopyalayın<br>2. GitHub profil README.md dosyanıza yapıştırın<br>3. Spotify aktiviteniz artık görünecek!" data-en="1. Copy the markdown code above<br>2. Paste it into your GitHub profile README.md<br>3. Your Spotify activity will now be displayed!">1. Yukarıdaki markdown kodunu kopyalayın<br>2. GitHub profil README.md dosyanıza yapıştırın<br>3. Spotify aktiviteniz artık görünecek!</span><br><br>
            </div>
            
            <p><a href="${userProfile.external_urls?.spotify || `https://open.spotify.com/user/${username}`}" 
                  style="color: #1ed760; text-decoration: none;" data-tr="🎧 Spotify Profilinizi Açın" data-en="🎧 Open Your Spotify Profile">
                🎧 Spotify Profilinizi Açın
              </a></p>
          </div>
          
          <script>
            // Language switching functionality
            const langBtns = document.querySelectorAll('.lang-btn');
            const elements = document.querySelectorAll('[data-tr][data-en]');
            
            function switchLanguage(lang) {
              elements.forEach(element => {
                const text = lang === 'tr' ? element.getAttribute('data-tr') : element.getAttribute('data-en');
                if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                  element.placeholder = text;
                } else {
                  element.innerHTML = text;
                }
              });
              
              // Update active button
              langBtns.forEach(btn => {
                btn.classList.remove('active');
                if (btn.getAttribute('data-lang') === lang) {
                  btn.classList.add('active');
                }
              });
            }
            
            langBtns.forEach(btn => {
              btn.addEventListener('click', () => {
                const lang = btn.getAttribute('data-lang');
                switchLanguage(lang);
              });
            });

            function copyToClipboard() {
              const url = document.getElementById('widgetUrl').textContent;
              navigator.clipboard.writeText(url).then(() => {
                const btn = document.querySelector('.copy-btn');
                const lang = document.querySelector('.lang-btn.active').getAttribute('data-lang');
                btn.textContent = lang === 'tr' ? '✅ Kopyalandı!' : '✅ Copied!';
                setTimeout(() => {
                  btn.textContent = lang === 'tr' ? '📋 Markdown Kopyala' : '📋 Copy Markdown';
                }, 2000);
              });
            }
          </script>
        </body>
      </html>
    `);

  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <head><title>Server Error</title></head>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h1>❌ Server Error</h1>
          <p>Something went wrong: ${error.message}</p>
          <p><a href="/api/auth/login">Try Again</a></p>
        </body>
      </html>
    `);
  }
}
