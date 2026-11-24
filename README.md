# TextLens: AI Text Analyzer & Summarizer

TextLens is a web app that analyzes and summarizes text. Type or paste text, or upload a PDF, and it shows:

- Word, unique word, sentence, paragraph and character counts
- Reading and speaking time, average word and sentence length, lexical diversity
- The most frequent words (common stopwords removed) and frequent word pairs
- Readability (Flesch Reading Ease and Flesch–Kincaid grade)
- An AI summary with key points, sentiment and topics
- A non-AI extractive summary for comparison

It is a static site (one `index.html` file), so it runs on GitHub Pages with no server.

## AI engines

| Engine | Models | Cost | Notes |
| --- | --- | --- | --- |
| Free (default) | DistilBART-CNN 6-6 for summaries, DistilBERT SST-2 for sentiment, run in the browser with Transformers.js | Free | Downloads about 300 MB the first time, then is cached. English text works best. |
| Claude API | Claude Haiku 5.5 or Claude Sonnet 5.5 (Anthropic) | Billed to your Anthropic account | Paste your own API key in the app. The key stays in your browser and is sent only to Anthropic. |

## Deploy on GitHub Pages

1. Sign in at [github.com](https://github.com) and create a new **public** repository, for example `textlens`.
2. Click **Add file → Upload files**, then upload `index.html`, `README.md` and `.nojekyll` from this folder. Click **Commit changes**.
3. Open **Settings → Pages**. Under **Build and deployment**, set **Source** to **Deploy from a branch**, choose the **main** branch and the **/ (root)** folder, then click **Save**.
4. Wait 1 to 2 minutes. Your site will be live at `https://YOUR-USERNAME.github.io/textlens/`.

Tip: `.nojekyll` is a hidden file. If your computer hides it, you can skip it; the site still works.

## Run locally

Open a terminal in this folder and run:

```
python3 -m http.server 8000
```

Then open http://localhost:8000 in your browser.

## Tools and libraries

- HTML, CSS and JavaScript (no build step)
- [PDF.js](https://mozilla.github.io/pdf.js/) 3.11.174 for PDF text extraction
- [Transformers.js](https://huggingface.co/docs/transformers.js) 3.5.1 for the in-browser AI models
- [Anthropic Messages API](https://docs.claude.com/) for the optional Claude engine
- Google Fonts: Manrope
- GitHub Pages for hosting
