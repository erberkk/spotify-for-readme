# Spotify Now Playing for GitHub README

This project generates a dynamic image card that displays your currently playing song on Spotify, perfect for your GitHub profile README. 🎵

---

## 🚀 Setup and Deployment

Follow these steps to set up and deploy your own Spotify summary card.

### 1. Fork the Repository
First, **fork this repository** to your own GitHub account so you can deploy it.

### 2. Get Spotify API Credentials
You need to create a Spotify App to get the necessary credentials.

1.  Navigate to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications) and log in.
2.  Click on **Create an app**.
3.  Choose an **App name** and **App description**, then click **Create**.
4.  You will now see your `Client ID`. Click **Show client secret** to view your `Client Secret`. **Copy both of these values.**
5.  Next, click on **Edit Settings**.
6.  Under the **Redirect URIs** section, add the following URL and click **Add**, then **Save** at the bottom of the page:
    ```
    https://spotify-refresh-token-generator.netlify.app/callback
    ```

### 3. Generate Your Spotify Refresh Token
Now, you'll use your new credentials to get a refresh token.

1.  Open this URL in a new tab: [https://spotify-refresh-token-generator.netlify.app/](https://spotify-refresh-token-generator.netlify.app/)
2.  Enter the `Client ID` and `Client Secret` you obtained in the previous step.
3.  Click **Get Refresh Token**. You will be redirected to a Spotify authorization page.
4.  Log in and agree to the permissions. **Important:** Ensure that the following scopes are selected/approved during authorization: `user-read-currently-playing`, `user-read-playback-state`, `user-read-recently-played`, and `user-top-read`.
5.  After authorization, you'll be sent back to the generator page, and your **`Refresh Token`** will be displayed. **Copy this value.**

### 4. Deploy on Vercel
The final step is to deploy your forked repository using Vercel.

1.  Go to [Vercel](https://vercel.com/new) and import the repository you forked from GitHub.
2.  During the import process, expand the **Environment Variables** section.
3.  Add the three credentials you have gathered as environment variables:
    * `SPOTIFY_CLIENT_ID`
    * `SPOTIFY_CLIENT_SECRET`
    * `SPOTIFY_REFRESH_TOKEN`
4.  Click **Deploy**. After the deployment is complete, Vercel will provide you with a production domain (e.g., `your-project.vercel.app`).

---

## 💻 Add to Your README

You're all set! To display the Spotify card on your profile, add the following markdown to your README file.

**Important:**
* Replace `<your_vercel_domain>` with the domain from your Vercel deployment.
* Replace `<your_spotify_user_name>` with your actual Spotify username.

```markdown
[![Spotify Summary](https://<your_vercel_domain>/api/spotify)](https://open.spotify.com/user/<your_spotify_user_name>)
```

## Result
<img width="887" height="340" alt="image" src="https://github.com/user-attachments/assets/55d66f1f-fe01-46c0-a691-bba52473255f" />
