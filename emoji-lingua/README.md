# emoji-lingua

Translate English into emoji, and emoji back into English.

- **Live site:** https://emoji-lingua-pisan.netlify.app  *(Netlify; confirmed after first deploy)*
- **Source:** https://github.com/pisanuw/Claude-capstone/tree/main/emoji-lingua
- **Host:** Netlify (static page on the CDN + the API as a serverless function).

## What it does

- **English → Emoji.** `I love pizza on a rainy night` → `👤 ❤️ 🍕 on a 🌧️ 🌙`.
  Known words become emoji; unknown words are left in place (which reads better
  than dropping them) and are counted in a small hint under the result.
- **Emoji → English.** Two modes:
  - *Literal gloss:* `🐱🍕🌧️😢` → `cat pizza rain sad`
  - *Interpret meaning* (AI only): a natural sentence describing what the
    sequence most likely means.
- **Direction auto-detects** if the client does not specify one: input
  containing pictographs is treated as emoji.

## The hybrid engine

Two engines behind one interface:

1. **Dictionary (always available).** A curated word ↔ emoji map plus phrase
   matching (`ice cream` → 🍦 before `ice` + `cream`) and a small stemmer so
   `dogs`, `running`, `loved`, and `rainy` all resolve. Pure, deterministic,
   fully unit-tested, no network.
2. **Claude (when `ANTHROPIC_API_KEY` is set).** Understands context, so it can
   render ideas that have no one-to-one emoji and interpret an emoji sequence as
   a sentence.

The AI path **always degrades to the dictionary** on any error, so a model
outage or a missing key can never break the app. The UI labels which engine
produced each result.

## Run locally

Node 20+.

```bash
cd emoji-lingua
npm install
npm run dev        # http://localhost:3000
npm test           # 33 tests
npm run coverage   # ~94% statements
```

No configuration is required; see [`.env.example`](./.env.example) for the
optional AI key.

## API

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| GET | `/api/health` | | reports the active engine |
| POST | `/api/translate` | `{ text, direction?, mode? }` | `direction`: `to-emoji` \| `to-english` \| `auto`; `mode`: `literal` \| `interpretive`; 500-char cap |

## Architecture on Netlify

`npm run build` compiles the server and copies the static page to `dist/public`,
which Netlify serves from its CDN. `netlify/functions/api.mjs` wraps the same
Express app with `serverless-http`; [`netlify.toml`](./netlify.toml) routes
`/api/*` to it. Deployment is config-driven: edit
[`deploy/target.yml`](./deploy/target.yml) and push, and GitHub Actions
provisions and deploys the site.

## Limitations

The dictionary is hand-curated and finite, so without an AI key many words pass
through untranslated (the UI tells you how many). Emoji → English is a gloss,
not grammar: `🐱🍕` becomes `cat pizza`, not `the cat ate pizza`. Turn on the AI
key for anything better than that.
