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

    // No expiration - tokens will stay forever
    // await redis.expire(userKey, 60 * 60 * 24 * 30);

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
            .container {
              max-width: 600px;
              margin: 0 auto;
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
          <div class="container">
            <h1>🎉 Successfully Connected!</h1>
            <p>Your Spotify account has been linked successfully.</p>
            
            <div class="username">
              Username: ${username}
            </div>
            
            <h3>🔗 Your Personal Widget URL:</h3>
            <div class="url-example" id="widgetUrl">
[![Spotify Summary](https://spotify-for-readme-pi.vercel.app/api/spotify/${username})](${userProfile.external_urls?.spotify || `https://open.spotify.com/user/${username}`})
            </div>
            <button class="copy-btn" onclick="copyToClipboard()">📋 Copy Markdown</button>
            
            <div class="info">
              💡 <strong>How to use:</strong><br>
              1. Copy the markdown code above<br>
              2. Paste it into your GitHub profile README.md<br>
              3. Your Spotify activity will now be displayed!<br><br>
            </div>
            
            <p><a href="${userProfile.external_urls?.spotify || `https://open.spotify.com/user/${username}`}" 
                  style="color: #1ed760; text-decoration: none;">
                🎧 Open Your Spotify Profile
              </a></p>
          </div>
          
          <script>
            function copyToClipboard() {
              const url = document.getElementById('widgetUrl').textContent;
              navigator.clipboard.writeText(url).then(() => {
                const btn = document.querySelector('.copy-btn');
                btn.textContent = '✅ Copied!';
                setTimeout(() => {
                  btn.textContent = '📋 Copy Markdown';
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
