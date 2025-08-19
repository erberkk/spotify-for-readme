// api/auth/login.js - Spotify OAuth Login
export default async function handler(req, res) {
  const { SPOTIFY_CLIENT_ID } = process.env;
  
  if (!SPOTIFY_CLIENT_ID) {
    return res.status(500).json({ error: 'Spotify Client ID not configured' });
  }

  // Spotify OAuth required scopes
  const scopes = [
    'user-read-currently-playing',
    'user-read-playback-state', 
    'user-read-recently-played',
    'user-top-read'
  ].join(' ');

  // Generate state parameter for security
  const state = Math.random().toString(36).substring(2, 15);
  
  // Your Vercel domain for callback
  const baseUrl = req.headers.host.includes('localhost') 
    ? 'http://localhost:3000' 
    : `https://${req.headers.host}`;
    
  const redirectUri = `${baseUrl}/api/auth/callback`;

  const authUrl = new URL('https://accounts.spotify.com/authorize');
  authUrl.searchParams.append('client_id', SPOTIFY_CLIENT_ID);
  authUrl.searchParams.append('response_type', 'code');
  authUrl.searchParams.append('redirect_uri', redirectUri);
  authUrl.searchParams.append('scope', scopes);
  authUrl.searchParams.append('state', state);
  authUrl.searchParams.append('show_dialog', 'true'); // Force login dialog

  // Redirect to Spotify authorization
  res.redirect(authUrl.toString());
}
