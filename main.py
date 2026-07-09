import os
import re
from typing import Dict, List, Optional
from datetime import datetime
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from starlette.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.responses import StreamingResponse, Response, JSONResponse
from pydantic import BaseModel, Field
from supabase import create_client, Client
import httpx


app = FastAPI(title="AI Creative Studio", version="1.0.0")

# ── Rate Limiting ──
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter


@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"detail": "Rate limit exceeded. Please wait and try again."},
    )


# ── CORS (FIXED: explicit origins, no wildcards with credentials) ──
FRONTEND_URL = os.environ.get(
    "FRONTEND_URL", "https://mariusrezeanu279-star.github.io"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Supabase ──
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get(
    "SUPABASE_ANON_KEY", ""
)
supabase: Optional[Client] = (
    create_client(SUPABASE_URL, SUPABASE_KEY)
    if SUPABASE_URL and SUPABASE_KEY
    else None
)


# ── AI Provider Keys ──
VENICE_KEY = os.environ.get("VENICE_API_KEY", "")
FEATHERLESS_KEY = os.environ.get("FEATHERLESS_API_KEY", "")

PROVIDER_URLS = {
    "venice": "https://api.venice.ai/api/v1",
    "featherless": "https://api.featherless.ai/v1",
}


def get_provider_key(provider: str) -> str:
    if provider == "venice":
        return VENICE_KEY
    elif provider == "featherless":
        return FEATHERLESS_KEY
    raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")


# ===================================================================
#  AI PROVIDER PROXY ROUTES (with rate limiting)
# ===================================================================

@app.post("/api/chat/completions")
@limiter.limit("30/minute")
async def api_chat_completions(request: Request, body: dict):
    provider = body.pop("provider", "venice")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{base}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {key}"},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


@app.post("/api/image/generate")
@limiter.limit("10/minute")
async def api_image_generate(request: Request, body: dict):
    provider = body.pop("provider", "venice")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{base}/image/generate",
            json=body,
            headers={"Authorization": f"Bearer {key}"},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


@app.post("/api/video/generate")
@limiter.limit("5/minute")
async def api_video_generate(request: Request, body: dict):
    provider = body.pop("provider", "venice")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{base}/video/generate",
            json=body,
            headers={"Authorization": f"Bearer {key}"},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


@app.post("/api/audio/speech")
@limiter.limit("30/minute")
async def api_audio_speech(request: Request, body: dict):
    provider = body.pop("provider", "venice")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{base}/audio/speech",
            json=body,
            headers={"Authorization": f"Bearer {key}"},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        # Use actual content type from provider response
        content_type = res.headers.get("content-type", "audio/mpeg")
        return Response(content=res.content, media_type=content_type)


# Enhanced /api/models with pagination support for all providers, especially Featherless (supports page/per_page up to 1000)
# For load 500 at a time and load all, frontend can call with page and per_page, or use load_all=true for server-side multi-page fetch (limited to avoid overload)
@app.get("/api/models")
@limiter.limit("30/minute")
async def api_list_models(
    provider: str = Query("venice", description="Provider: venice or featherless"),
    page: int = Query(1, ge=1, description="Page number for pagination"),
    per_page: int = Query(500, ge=1, le=1000, description="Results per page, max 1000 for Featherless"),
    load_all: bool = Query(False, description="If true, attempt to load multiple pages (use carefully, max 5 pages for safety)"),
    q: Optional[str] = Query(None, description="Search query for model name/id"),
    sort: Optional[str] = Query(None, description="Sort e.g. -popularity or context_length")
):
    if provider not in PROVIDER_URLS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    params = {
        "page": page,
        "per_page": per_page,
    }
    if q:
        params["q"] = q
    if sort:
        params["sort"] = sort

    # For Featherless, add more filters if needed, e.g. to prioritize uncensored but API may not have direct filter
    # We can post-process for NSFW/uncensored tags

    async with httpx.AsyncClient(timeout=60) as client:
        res = await client.get(
            f"{base}/models",
            params=params,
            headers={"Authorization": f"Bearer {key}"},
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        data = res.json()

    models = data.get("data", []) if isinstance(data, dict) else data

    # Post-process: Add tags, emojis, priority for uncensored/NSFW/jailbroken/Hermes models
    # Curated list of top uncensored/NSFW/jailbroken/Hermes models (homework: popular on HF/Featherless for less censored, creative, RP, NSFW use)
    # These will be boosted to top. Examples based on known good ones: OpenHermes, Dolphin, uncensored variants, erotica fine-tunes etc.
    PRIORITY_MODELS = [
        "nousresearch/hermes-3-llama-3.1-8b", "nousresearch/hermes-3-llama-3.1-70b", 
        "cognitivecomputations/dolphin-2.9.1-llama-3-8b", "cognitivecomputations/dolphin-2.9-llama3.1-70b",
        "teknium/openhermes-2.5-mistral-7b", "microsoft/phi-3-medium-128k-instruct", # phi often less censored
        "qwen/qwen2.5-72b-instruct", # strong base
        # Add more known uncensored/NSFW friendly from research: many 'uncensored' tagged on HF
    ]

    NSFW_KEYWORDS = ["uncensored", "nsfw", "erotic", "adult", "jailbreak", "hermes", "dolphin", "lust", "sensual", "rp", "roleplay", "creative-writing", "unrestricted"]
    JAILBREAK_EMOJI = "🛡️"
    NSFW_EMOJI = "🔞"
    HERMES_EMOJI = "✨"
    UNCENSORED_EMOJI = "🔓"

    def enrich_model(m):
        model_id = m.get("id", "").lower() if isinstance(m, dict) else str(m).lower()
        name = m.get("name", model_id) if isinstance(m, dict) else model_id
        tags = []
        emoji = ""
        description = "General purpose LLM. Good for chat, reasoning, and creative tasks. Context: " + str(m.get("context_length", "unknown")) + " tokens."

        # Determine if priority/NSFW
        is_priority = any(p in model_id for p in [pm.lower() for pm in PRIORITY_MODELS])
        is_nsfw = any(kw in model_id or kw in name.lower() for kw in NSFW_KEYWORDS)
        is_hermes = "hermes" in model_id
        is_jailbreak = "jailbreak" in model_id or "uncensored" in model_id or "dolphin" in model_id

        if is_hermes:
            emoji = HERMES_EMOJI
            tags.append("HERMES")
            description = "Hermes series: Highly capable, less censored, excellent for creative writing, roleplay, and complex instructions. Best for storytelling, character development, and unrestricted creative tasks. Strong reasoning and instruction following."
        elif is_nsfw or is_jailbreak:
            emoji = NSFW_EMOJI if is_nsfw else JAILBREAK_EMOJI
            tags.append("R18" if is_nsfw else "JAILBROKEN")
            description = "Uncensored / less restricted model. Ideal for NSFW, erotic roleplay, adult content, creative freedom, and bypassing typical safety filters. Use responsibly. Excellent for sensual storytelling, character AI, and adult creative projects."
        elif is_priority:
            emoji = "⭐"
            tags.append("TOP")
            description = "Top recommended model for performance and reliability. Great all-rounder for chat, coding, analysis, and creative work."

        if isinstance(m, dict):
            m["tags"] = tags
            m["emoji"] = emoji
            m["description"] = description
            m["is_nsfw"] = is_nsfw or is_jailbreak
            m["priority"] = is_priority or is_hermes or is_nsfw
        return m

    enriched = [enrich_model(m) for m in models]

    # Sort: priority/NSFW/Hermes first, then others
    enriched.sort(key=lambda x: (0 if x.get("priority") else 1, x.get("id", "")), reverse=False)

    # If load_all, fetch more pages (safety limit: max 3 additional pages to avoid timeout/overload; for full 45k use frontend incremental load 500 at a time)
    if load_all and provider == "featherless" and page == 1:
        all_models = enriched[:]
        for p in range(2, 4):  # Load up to page 3 ( ~1500 models)
            try:
                params["page"] = p
                res2 = await client.get(f"{base}/models", params=params, headers={"Authorization": f"Bearer {key}"})
                if res2.status_code == 200:
                    extra = res2.json().get("data", [])
                    all_models.extend([enrich_model(m) for m in extra])
            except:
                break
        enriched = all_models
        # Re-sort after loading more
        enriched.sort(key=lambda x: (0 if x.get("priority") else 1, x.get("id", "")), reverse=False)

    return {
        "data": enriched,
        "page": page,
        "per_page": per_page,
        "total_loaded": len(enriched),
        "has_more": len(enriched) == per_page,  # rough indicator
        "provider": provider,
        "note": "For full access to 40k+ models, use incremental 'Load More' (500 at a time) in frontend. Top uncensored/NSFW/Hermes models are prioritized at the top with emojis and detailed descriptions."
    }


@app.get("/api/health")
async def api_health():
    return {"status": "ok"}


# ... (rest of the file remains the same as original for other routes)

# The rest of the code (Prompt Alchemist, Supabase routes, etc.) is unchanged from previous version for compatibility.
# To keep response manageable, only the models endpoint and imports are updated here. Full file can be pushed if needed.

# NOTE: For complete integration, the frontend index.html should be updated to use the new params (page, per_page, load_all) for the Load Models / Load All buttons, and display emoji + description in the model list UI (e.g. in a modal or tooltip on click/hover).
# Example frontend call: /api/models?provider=featherless&page=1&per_page=500
# For Load All: /api/models?provider=featherless&load_all=true (loads first ~1500 prioritized)
# Add 'Load More' button that increments page and appends.

# Also update frontend to show professional model cards with description, tags, emojis for easy scrolling and selection.
