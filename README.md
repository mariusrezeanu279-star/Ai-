# README.md

# AI Creative Studio

A full-stack AI creative platform with prompt engineering, AI media generation (images, video, audio), and community features.

## Architecture

```
Ai-/
├── .github/workflows/pages.yml  # Frontend deployment to GitHub Pages
├── Dockerfile                   # Backend container for Render/other platforms
├── render.yaml                  # Render deployment config
├── main.py                      # FastAPI backend
├── index.html                   # Single-file frontend (React via CDN)
├── requirements.txt             # Python dependencies
├── .env.example                 # Environment variable template
└── supabase/migrations/         # Database schema
```

## Quick Start

### 1. Clone & Setup

```bash
git clone https://github.com/mariusrezeanu279-star/Ai-.git
cd Ai-
cp .env.example .env
# Edit .env with your API keys
```

### 2. Run Backend Locally

```bash
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Backend runs at: `http://localhost:8000`

### 3. Deploy Frontend to GitHub Pages

The `pages.yml` workflow automatically deploys the frontend on every push to `main`.

**Setup required:**
1. Go to repo Settings → Pages
2. Set Source to "GitHub Actions"
3. Push to main to trigger deployment

### 4. Deploy Backend (Render)

```bash
# Install the Render CLI
npm i -g @render-cloud/cli

# Deploy
render deploy
```

Or deploy manually:
1. Create a new Web Service on Render
2. Connect this repo
3. Set environment variables in Render dashboard
4. Deploy

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SUPABASE_URL` | Supabase project URL | Optional (backend features disabled without it) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service key | Optional |
| `VENICE_API_KEY` | Venice AI API key | Required for AI features |
| `FEATHERLESS_API_KEY` | Featherless AI API key | Optional |

## API Endpoints

### Backend (`/api/` prefix)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/chat/completions` | Proxy to AI provider (chat) |
| POST | `/api/image/generate` | Proxy to AI provider (images) |
| POST | `/api/video/generate` | Proxy to AI provider (video) |
| POST | `/api/audio/speech` | Proxy to AI provider (TTS) |
| GET | `/api/models` | List available models |
| GET | `/api/health` | Health check |

### Prompt Alchemist (`/` prefix)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/generate-prompt` | Generate optimized prompt |
| POST | `/generate-batch` | Batch prompt generation |
| GET | `/supported-models` | List supported AI models |
| GET | `/model-config/{model}` | Get model-specific config |
| POST | `/save-prompt` | Save to Supabase |
| GET | `/saved-prompts` | Retrieve saved prompts |
| DELETE | `/saved-prompts/{id}` | Delete a saved prompt |
| PATCH | `/saved-prompts/{id}/favorite` | Toggle favorite |
| GET | `/community-prompts` | Browse community prompts |
| POST | `/community-prompts` | Submit community prompt |
| POST | `/community-prompts/{id}/upvote` | Upvote a prompt |

## Frontend

The frontend is a single-file HTML application (`index.html`) that loads React via CDN. It includes:

- AI chat interface
- Image generation UI
- Media generation tools (video, audio)
- Prompt Alchemist (optimized prompt generator)
- Setup wizard for first-time configuration

## Database

Supabase tables are managed via migrations:

```sql
-- Run this in Supabase SQL Editor
supabase/migrations/20260704110816_create_prompts_tables.sql
```

Tables:
- `saved_prompts` - User-saved optimized prompts
- `community_prompts` - Community-contributed prompt templates

## Development

### Prerequisites

- Python 3.10+
- Node.js (for any future frontend rebuilds)
- Git

### Local Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run backend
uvicorn main:app --reload

# Access frontend
# Open index.html in browser (or serve via any static server)
```

### API Documentation

Once the backend is running, visit:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## Deployment

### Backend (Render)

1. Create a new Web Service on Render
2. Connect this repository
3. Set build command: `pip install -r requirements.txt`
4. Set start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Add environment variables from `.env.example`
6. Deploy

### Frontend (GitHub Pages)

1. Push to `main` branch
2. GitHub Actions will automatically deploy via `pages.yml`
3. Configure Pages in repo Settings → Pages → Source: GitHub Actions

## License

MIT
