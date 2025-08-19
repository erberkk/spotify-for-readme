# 🎵 Multi-User Spotify Widget for GitHub README

**Display your live Spotify activity in your GitHub README!** Show currently playing songs, your favorite tracks and artists... Everyone can connect their own Spotify account and create personalized widgets.

## ✨ Features

- 🎧 **Live Music**: See your currently playing song in real-time
- 🔥 **Top Lists**: Your most listened tracks and artists
- ⚡ **Quick Setup**: Connect your Spotify account with one click
- 🌍 **Multi-Language**: Turkish and English support
- 🔒 **Secure**: Tokens stored safely in Redis

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


## 🎨 What You'll See

The widget displays:
- **Currently Playing**: Live song with animated progress bar
- **Top Tracks**: Your 5 most played tracks recently
- **Top Artists**: Your 5 most played artists recently
- **Status**: Playing, paused, or offline states

## 🔧 For Developers

### Setup

1. **Fork this repository**
2. **Deploy on Vercel**
3. **Add environment variables**:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `REDIS_URL`