# TextLens 🔍 Feed me your words

TextLens is a playful AI text analyzer. Type or paste text, or upload a PDF, and it shows:

- Words, unique words, sentences, paragraphs, characters, reading and speaking time
- A word cloud and the top 10 words (common stopwords skipped)
- Frequent two-word phrases
- A readability gauge (Flesch Reading Ease and Flesch–Kincaid grade)
- An **AI summary from Google Gemini** with key points, sentiment, tone, language and topics
- A non-AI "Quick pick" summary for comparison

## Project files

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `src/style.css` | The design |
| `src/app.js` | The app logic (buttons, rendering, mascot) |
| `src/analysis.js` | Word statistics, readability, Quick pick summary |
| `src/gemini.js` | Talks to the Gemini API |
| `build.mjs` | Builds the site into `dist/` and puts your key into `config.js` (no npm packages needed) |
| `.env` | **Your secret key. Never upload it.** |
| `.env.example` | A safe template of `.env` you can upload |
| `.gitignore` | Tells git to skip `.env`, `dist/` and other files that shouldn't be uploaded |
| `.github/workflows/deploy.yml` | GitHub Actions: builds and publishes the site to GitHub Pages |

## 1. Run it on your computer

You need [Node.js](https://nodejs.org) 18 or newer.

1. Open `.env` and replace `paste-your-gemini-api-key-here` with your key from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).
2. Open a terminal in this folder and run:

   ```
   node build.mjs --serve
   ```

3. Open http://localhost:5173.

## 2. Put it on GitHub Pages

### a. Upload the code (without `.env`)

**With git (recommended, since it respects `.gitignore` automatically):**

```
git init
git add .
git commit -m "TextLens with Gemini"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/YOUR-REPO.git
git push -u origin main
```

**With the GitHub website:** click **Add file → Upload files** and upload everything **except `.env`**: `index.html`, the `src` folder, `build.mjs`, `package.json`, `README.md`, `.env.example` and `.gitignore`. The website can't upload the `.github` folder reliably, so create the workflow by hand: click **Add file → Create new file**, type `.github/workflows/deploy.yml` as the name, paste the contents of that file and click **Commit changes**.

### b. Add your key as a secret

1. In your repository, open **Settings → Secrets and variables → Actions**.
2. Click **New repository secret**.
3. Name: `GEMINI_API_KEY`. Secret: your Gemini key. Click **Add secret**.

### c. Switch Pages to GitHub Actions

1. Open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. If "Deploy TextLens to GitHub Pages" hasn't started, click it, then **Run workflow**.
4. When it shows a green check, your site is live at `https://YOUR-USERNAME.github.io/YOUR-REPO/`.

Every push to `main` rebuilds and republishes the site.

## ⚠️ About your key on a public website

GitHub Pages only hosts files, so the key the site uses ends up inside `config.js` in the published site, where anyone who knows how can find it. The secret only keeps the key out of your **code**. To stop other people from using your key on other websites:

1. Go to [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials) and pick the project your Gemini key belongs to.
2. Click your API key.
3. Under **Application restrictions**, choose **Websites** and add `https://YOUR-USERNAME.github.io/*`.
4. Under **API restrictions**, choose **Restrict key** and select **Generative Language API**.
5. Click **Save**.

Don't add a payment method to that Google project. Then the key stays on the free tier and nobody can run up a bill.

**Prefer not to build the key in at all?** Skip step 2b. The site will show an **Add API key** button, and each visitor pastes their own key. The key stays in their browser.

## AI model

The app uses Google Gemini through the [Gemini API](https://ai.google.dev/gemini-api/docs). TextLens uses **Gemini 3.8 Flash** (`gemini-3.8-flash`), set by `GEMINI_MODEL` in `.env`. The app asks Google which models your key can use. If Gemini 3.8 Flash is unavailable, busy or out of free quota, it falls back in order to `gemini-3.7-flash`, `gemini-3.5-flash`, `gemini-2.5-flash`, then the Flash-Lite models. On GitHub, the workflow also uses Gemini 3.8 Flash first. To choose a different model there, add a repository **variable** (not a secret) named `GEMINI_MODEL`.

## Tools used

- HTML, CSS and JavaScript (ES modules), with no framework
- [Google Gemini API](https://ai.google.dev/gemini-api/docs) for the AI summary
- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 for reading PDFs
- Google Fonts: Fredoka and Nunito
- Node.js build script, GitHub Actions and GitHub Pages
