# 🎵 Multi-User Spotify Widget for GitHub README

**Display your live Spotify activity in your GitHub README!** Show currently playing songs, your favorite tracks and artists... Everyone can connect their own Spotify account and create personalized widgets.

## ✨ Features

- 🎧 **Live Music**: See your currently playing song in real-time
- 🔥 **Top Lists**: Your most listened tracks and artists
- ⚡ **Quick Setup**: Connect your Spotify account with one click
- 🌍 **Multi-Language**: Turkish and English support
- 🔒 **Secure**: Tokens stored safely in Redis
- 🎯 **Interactive**: Click on songs/artists to open in Spotify (not available on github readme because of restricts)

## 🚀 Quick Start

### For Users

1. **Visit the landing page**: `https://spotify-for-readme-pi.vercel.app/`
2. **Click "Connect Spotify"**
3. **Authorize on Spotify**
4. **Copy your widget URL**
5. **Add to your GitHub README**

### Widget URL Format

```markdown
[![Spotify Summary](https://your-domain.vercel.app/api/spotify/USERNAME)](https://open.spotify.com/user/USERNAME)
```

### Example Usage

```markdown
# 🎵 My GitHub Profile

[![Spotify Summary](https://spotify-for-readme-pi.vercel.app/api/spotify/erberkk)](https://open.spotify.com/user/erberkk)
```

## 🎨 What You'll See

The widget displays:
- **Currently Playing**: Live song with animated progress bar
- **Top Tracks**: Your 5 most played tracks recently
- **Top Artists**: Your 5 most played artists recently
- **Status**: Playing, paused, or offline states

## 🔧 For Developers

Want to deploy your own instance? Follow these steps:

### 1. 🍴 Fork & Clone

```bash
# Fork this repository on GitHub
# Then clone your fork
git clone https://github.com/YOUR_USERNAME/spotify-for-readme.git
cd spotify-for-readme
```

### 2. 🎵 Spotify Developer Setup

1. **Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)**
2. **Create New App** (or use existing)
3. **Get Client ID & Secret**:
   - Copy `Client ID`
   - Copy `Client Secret`
4. **Configure Redirect URIs**:
   - Add: `https://your-domain.vercel.app/api/auth/callback`
   - Add: `http://localhost:3000/api/auth/callback` (for local testing)
5. **Request Extended Quota** (recommended for production)

### 3. 🗄️ Redis Database

**Option A: Redis Cloud (Free)**
1. [redis.com](https://redis.com/try-free/) - Create free account
2. Create database
3. Copy connection URL

**Option B: Upstash Redis (Vercel Integration)**
1. In Vercel dashboard, go to Storage
2. Create Redis database
3. Auto-connects to your project

### 4. 🚀 Deploy on Vercel

1. **Connect GitHub**:
   - Go to [vercel.com](https://vercel.com)
   - Import your forked repository

2. **Add Environment Variables**:
   ```
   SPOTIFY_CLIENT_ID=your_client_id_here
   SPOTIFY_CLIENT_SECRET=your_client_secret_here
   REDIS_URL=your_redis_connection_string
   ```

3. **Deploy** - Vercel will automatically build and deploy

## 📁 Project Structure

```
spotify-for-readme/
├── api/
│   ├── auth/
│   │   ├── login.js          # Spotify OAuth initiation
│   │   └── callback.js       # OAuth callback & token storage
│   └── spotify/
│       └── [username].js     # Dynamic Spotify widget endpoint
├── public/
│   └── index.html            # Landing page
├── package.json
└── README.md
```

## 🔑 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SPOTIFY_CLIENT_ID` | Your Spotify app client ID | ✅ |
| `SPOTIFY_CLIENT_SECRET` | Your Spotify app client secret | ✅ |
| `REDIS_URL` | Redis connection string | ✅ |

## 🚨 Important Notes

- **Development Mode**: Spotify apps start in development mode (25 user limit)