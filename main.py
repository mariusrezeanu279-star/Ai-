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


# ── CORS (explicit origins; include common local + Pages hosts) ──
FRONTEND_URL = os.environ.get(
    "FRONTEND_URL", "https://mariusrezeanu279-star.github.io"
)
_extra_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "").split(",")
    if o.strip()
]
_cors_origins = list(
    dict.fromkeys(
        [
            FRONTEND_URL,
            "https://mariusrezeanu279-star.github.io",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5500",
            "http://127.0.0.1:5500",
            "null",  # file:// opens
            *_extra_origins,
        ]
    )
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
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


# /api/models — Featherless supports page + per_page (max 1000). Frontend uses 500/page.
# load_all=true walks pages server-side (capped) with NSFW/HERMES prioritization + descriptions.
@app.get("/api/models")
@limiter.limit("30/minute")
async def api_list_models(
    provider: str = Query("venice", description="Provider: venice or featherless"),
    page: int = Query(1, ge=1, description="Page number for pagination"),
    per_page: int = Query(500, ge=1, le=1000, description="Results per page, max 1000 for Featherless"),
    load_all: bool = Query(False, description="If true, fetch many pages (server-side, safety-capped)"),
    q: Optional[str] = Query(None, description="Search query for model name/id"),
    sort: Optional[str] = Query("-popularity", description="Sort e.g. -popularity or context_length"),
):
    if provider not in PROVIDER_URLS:
        raise HTTPException(status_code=400, detail=f"Unknown provider: {provider}")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    PRIORITY_MODELS = [
        "nousresearch/hermes-3-llama-3.1-70b",
        "nousresearch/hermes-3-llama-3.1-8b",
        "teknium/openhermes-2.5-mistral-7b",
        "cognitivecomputations/dolphin-2.9.1-llama-3-70b",
        "cognitivecomputations/dolphin-2.9.1-llama-3-8b",
        "cognitivecomputations/dolphin-2.9-llama3.1-70b",
        "undi95/toppy-m-7b",
        "sao10k/l3-8b-stheno",
        "sao10k/l3-8b-lunaris",
        "nothingiisreal/lumimaid",
        "neversleep/noromaid",
        "anthracite-org/magnum",
        "sophosympatheia/midnight-miqu",
        "thedrummer/rocinante",
        "qwen/qwen2.5-72b-instruct",
        "meta-llama/llama-3.3-70b-instruct",
        "deepseek-ai/deepseek-r1",
    ]
    JAIL_KEYS = (
        "jailbreak", "uncensored", "abliterated", "unfiltered", "unrestricted",
        "heretic", "dolphin", "noromaid", "lumimaid", "stheno", "lunaris",
        "toppy", "psyfighter", "magnum", "midnight-miqu", "rocinante", "unslop",
    )
    NSFW_KEYS = ("nsfw", "erotic", "adult", "r18", "sensual", "lewd", "lust") + JAIL_KEYS

    def enrich_model(m):
        if not isinstance(m, dict):
            m = {"id": str(m), "name": str(m)}
        model_id = str(m.get("id") or "").lower()
        name = str(m.get("name") or m.get("id") or "")
        blob = f"{model_id} {name.lower()}"
        tags = []
        emoji = "🤖"
        ctx = m.get("context_length", "unknown")
        description = (
            f"General purpose LLM. Good for chat, reasoning, and creative tasks. Context: {ctx} tokens."
        )
        is_hermes = "hermes" in blob
        is_jail = any(k in blob for k in JAIL_KEYS)
        is_nsfw = any(k in blob for k in NSFW_KEYS) or is_jail
        is_priority = any(p in model_id for p in PRIORITY_MODELS) or is_hermes or is_jail

        if is_hermes:
            emoji = "✨"
            tags.append("HERMES")
            description = (
                "Hermes / OpenHermes: strong instruction following with lighter refusal tendencies. "
                "Best for creative writing, roleplay, storytelling, and complex multi-step instructions."
            )
        elif is_jail or is_nsfw:
            emoji = "🔞" if is_nsfw else "🔓"
            if is_nsfw:
                tags.append("R18")
            if is_jail:
                tags.append("UNRESTRICTED")
            description = (
                "Uncensored / less-restricted fine-tune. Ideal for adult creative writing, erotic roleplay, "
                "and freer storytelling. Pair with a clear system prompt for consistent characters."
            )
        elif is_priority:
            emoji = "⭐"
            tags.append("TOP50")
            description = (
                "Top recommended model for performance and reliability. Strong all-rounder for chat, "
                "coding, analysis, and creative work."
            )

        if any(k in blob for k in ("vision", "-vl", "llava")):
            tags.append("VISION")
            if emoji == "🤖":
                emoji = "🖼️"

        m["tags"] = tags
        m["emoji"] = emoji
        m["description"] = description + (f" Context ≈ {ctx} tokens." if ctx != "unknown" else "")
        m["is_nsfw"] = bool(is_nsfw or is_jail)
        m["priority"] = bool(is_priority or is_hermes or is_nsfw)
        m["display"] = (
            f"[{emoji} {'·'.join(tags)}] {m.get('id') or name}"
            if tags
            else f"{emoji} {m.get('id') or name}"
        )
        return m

    def sort_enriched(items):
        items.sort(
            key=lambda x: (
                0 if x.get("priority") else 1,
                0 if x.get("is_nsfw") else 1,
                str(x.get("id") or ""),
            )
        )
        return items

    headers = {}
    if key:
        headers["Authorization"] = f"Bearer {key}"

    params = {"page": page, "per_page": per_page}
    if q:
        params["q"] = q
    if sort:
        params["sort"] = sort

    enriched = []
    has_more = False
    pages_fetched = 0
    # load_all: up to 20 pages * 500 = 10k models (safety). Frontend Load All is preferred for full catalogue.
    max_pages = 20 if load_all else 1
    start_page = page

    async with httpx.AsyncClient(timeout=90) as client:
        for p in range(start_page, start_page + max_pages):
            params["page"] = p
            # Venice models endpoint may not use page/per_page the same way
            req_params = params if provider == "featherless" else None
            res = await client.get(
                f"{base}/models",
                params=req_params,
                headers=headers,
            )
            if res.status_code != 200:
                if pages_fetched == 0:
                    raise HTTPException(status_code=res.status_code, detail=res.text)
                break
            data = res.json()
            models = data.get("data", []) if isinstance(data, dict) else data
            if not isinstance(models, list):
                models = []
            batch = [enrich_model(m) for m in models]
            enriched.extend(batch)
            pages_fetched += 1
            has_more = len(batch) >= per_page
            if not load_all or not has_more or provider != "featherless":
                break

    seen = set()
    deduped = []
    for m in enriched:
        mid = m.get("id")
        if mid in seen:
            continue
        seen.add(mid)
        deduped.append(m)
    enriched = sort_enriched(deduped)

    return {
        "data": enriched,
        "page": page,
        "per_page": per_page,
        "total_loaded": len(enriched),
        "pages_fetched": pages_fetched,
        "has_more": has_more if not load_all else False,
        "provider": provider,
        "note": (
            "Use page/per_page=500 for Load, and keep calling with page++ for full catalogues. "
            "load_all=true is server-capped. Frontend Load All walks all pages client-side. "
            "Models include emoji, tags (R18/HERMES/UNRESTRICTED/TOP50), and descriptions."
        ),
    }


@app.get("/api/health")
async def api_health():
    return {"status": "ok"}


# ===================================================================
#  PROMPT ALCHEMIST ROUTES (restored full)
# ===================================================================

AI_BYPASS_RULES: Dict[str, Dict[str, object]] = {
    "grok": {
        "video_qualities": ["420p", "720p"],
        "durations": [5, 10, 15],
        "image_counts": ["auto", "4", "8", "12"],
        "stealth_keywords": [
            "Cinematic artistic video in fine-art boudoir sensual storytelling style",
            "Photorealistic artistic photograph, high-end sensual erotica meets fine art photography",
            "Ethereal cinematic study of light, form, and human connection",
            "Luxurious sensual video, artistic and tasteful presentation of desire and beauty",
        ],
        "banned_terms": [
            "nude",
            "naked",
            "fuck",
            "sex",
            "penis",
            "vagina",
            "explicit",
            "adult",
        ],
        "replacements": {
            "nude": "luminous skin kissed by light and water",
            "naked": "celebrating the natural beauty of the human form",
            "fuck": "intimate connection",
            "sex": "slow sensual movement",
            "penis": "curves highlighted by dramatic lighting",
            "vagina": "form sculpted by golden highlights and deep shadows",
            "explicit": "sensual and tasteful",
            "adult": "artistic and mature",
        },
        "technical_armor": {
            "video": "photorealistic skin texture, cinematic color grading, warm golden tones, shallow depth of field, --ar 16:9 --stylize 200 --quality high --motion high",
            "image": "photorealistic, 8K, ultra-detailed, --ar 3:4 --stylize 200 --v 6",
        },
    },
    "midjourney": {
        "video_qualities": ["720p", "1080p"],
        "durations": [5, 10, 15],
        "image_counts": ["auto", "4", "8", "12"],
        "stealth_keywords": [
            "hyper-detailed 8K, cinematic lighting, artistic nude study",
            "fine-art photography, dramatic chiaroscuro lighting",
        ],
        "banned_terms": ["porn", "explicit", "hardcore"],
        "replacements": {
            "porn": "fine-art erotica",
            "explicit": "suggestive and tasteful",
            "hardcore": "bold artistic expression",
        },
        "technical_armor": "realistic skin texture, subsurface scattering, artistic pose, 8K resolution",
    },
    "stable_diffusion": {
        "video_qualities": ["720p", "1080p"],
        "durations": [5, 10, 15],
        "image_counts": ["auto", "4", "8", "12"],
        "stealth_keywords": [
            "realistic skin texture, subsurface scattering, artistic pose",
            "fine-art photography with dramatic lighting",
        ],
        "banned_terms": ["nsfw", "hentai", "lewd"],
        "replacements": {
            "nsfw": "sensual and artistic",
            "hentai": "anime-inspired fine art",
            "lewd": "playful and teasing",
        },
        "technical_armor": "8K, ultra-detailed, cinematic lighting, photorealistic",
    },
    "dalle": {
        "video_qualities": ["720p", "1080p"],
        "durations": [5, 10, 15],
        "image_counts": ["auto", "4", "8", "12"],
        "stealth_keywords": [
            "artistic illustration, soft lighting, tasteful composition",
            "fine-art painting with elegant styling",
        ],
        "banned_terms": ["porn", "sex", "fuck", "nude", "explicit"],
        "replacements": {
            "porn": "erotic art",
            "sex": "sensual embrace",
            "fuck": "passionate connection",
            "nude": "artistic study of the human form",
            "explicit": "suggestive artistic",
        },
        "technical_armor": "highly detailed, 8K, cinematic lighting, professional quality",
    },
    "leonardo": {
        "video_qualities": ["720p", "1080p", "4k"],
        "durations": [5, 10, 15],
        "image_counts": ["auto", "4", "8", "12"],
        "stealth_keywords": [
            "cinematic render, dramatic lighting, artistic composition",
            "photorealistic style with fine-art aesthetics",
        ],
        "banned_terms": ["nsfw", "explicit", "porn"],
        "replacements": {
            "nsfw": "artistic sensual",
            "explicit": "tasteful artistic",
            "porn": "fine-art photography",
        },
        "technical_armor": "ultra-detailed, 8K, cinematic lighting, photorealistic render",
    },
    "playground": {
        "video_qualities": ["720p", "1080p"],
        "durations": [5, 10, 15],
        "image_counts": ["auto", "4", "8", "12"],
        "stealth_keywords": [
            "artistic portrait, soft studio lighting",
            "cinematic composition with elegant styling",
        ],
        "banned_terms": ["nsfw", "porn", "explicit"],
        "replacements": {
            "nsfw": "sensual artistic",
            "porn": "fine-art portrait",
            "explicit": "tasteful and artistic",
        },
        "technical_armor": "photorealistic, high detail, professional lighting, 8K",
    },
}

SUCCESS_TIPS: Dict[str, List[str]] = {
    "grok": [
        "For Grok: Use 'fine-art erotica' and 'cinematic sensual storytelling' for highest success.",
        "Video mode: Keep prompts under 50 words for best results.",
        "Use 'artistic' and 'tasteful' as prefix keywords to improve acceptance.",
    ],
    "midjourney": [
        "For MidJourney: Avoid 'NSFW' tag—use 'artistic nude study' instead.",
        "Add --v 6 at the end for the latest model version.",
        "Use aspect ratio parameters like --ar 3:4 for portraits.",
    ],
    "stable_diffusion": [
        "For Stable Diffusion: Add 'realistic skin texture' and 'subsurface scattering'.",
        "Use negative prompts to exclude unwanted elements.",
        "Include 'photorealistic' and '8K' for higher quality outputs.",
    ],
    "dalle": [
        "For DALL-E: Use 'artistic illustration' style keywords.",
        "Avoid any explicit terminology—use artistic alternatives.",
        "Keep prompts descriptive but tasteful for best results.",
    ],
    "leonardo": [
        "For Leonardo: Use 'cinematic render' and 'dramatic lighting' keywords.",
        "Include style presets for consistent outputs.",
        "Add 'photorealistic' for more realistic results.",
    ],
    "playground": [
        "For Playground AI: Use 'artistic portrait' and 'soft studio lighting'.",
        "Experiment with different filter strengths.",
        "Include quality modifiers like '8K' and 'photorealistic'.",
    ],
}


# ── Request/Response Models ──

class PromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=2000)
    ai_model: str = Field(default="grok")
    video_quality: str = Field(default="720p")
    duration: int = Field(default=10, ge=5, le=15)
    image_count: str = Field(default="auto")
    mode: str = Field(default="stealth")


class PromptResponse(BaseModel):
    original_prompt: str
    optimized_prompt: str
    ai_model: str
    video_quality: str
    duration: int
    image_count: str
    mode: str
    success_tips: List[str]
    is_video_prompt: bool


class BatchPromptRequest(BaseModel):
    prompts: List[PromptRequest]


class BatchPromptResponse(BaseModel):
    results: List[PromptResponse]


class SavedPromptRequest(BaseModel):
    original_prompt: str
    optimized_prompt: str
    ai_model: str
    video_quality: str
    duration: int
    image_count: str
    mode: str
    user_label: Optional[str] = None


class SavedPromptResponse(BaseModel):
    id: int
    original_prompt: str
    optimized_prompt: str
    ai_model: str
    video_quality: str
    duration: int
    image_count: str
    mode: str
    user_label: Optional[str]
    created_at: str


# ── Helpers ──

def normalize_prompt(text: str, replacements: Dict[str, str]) -> str:
    normalized = text
    for banned, safe_value in replacements.items():
        pattern = re.compile(re.escape(banned), re.IGNORECASE)
        normalized = pattern.sub(safe_value, normalized)
    return normalized


def detect_video_intent(prompt: str, ai_model: str) -> bool:
    video_keywords = [
        "video",
        "clip",
        "animation",
        "movement",
        "motion",
        "cinematic",
    ]
    prompt_lower = prompt.lower()
    return (
        any(keyword in prompt_lower for keyword in video_keywords)
        and ai_model.lower() == "grok"
    )


def build_nsfw_prompt(payload: PromptRequest) -> str:
    model_key = payload.ai_model.lower()
    rules = AI_BYPASS_RULES.get(model_key)
    if not rules:
        raise HTTPException(
            status_code=400, detail=f"Unsupported AI model: {payload.ai_model}"
        )

    replacements = rules["replacements"]
    stealth_keywords = rules["stealth_keywords"]
    technical_armor = rules["technical_armor"]

    base_prompt = normalize_prompt(payload.prompt.strip(), replacements)
    is_video = detect_video_intent(payload.prompt, payload.ai_model)

    if payload.mode == "stealth":
        stealth_opener = stealth_keywords[0]
        cleaned_prompt = f"{stealth_opener}, {base_prompt}"
    else:
        cleaned_prompt = f"Artistic collage grid moodboard style, {base_prompt}"

    if model_key == "grok":
        if is_video:
            armor = technical_armor["video"]
            cleaned_prompt += (
                f", {payload.video_quality}, {payload.duration}-second cinematic clip"
            )
            cleaned_prompt += f", slow subtle push-in camera movement, {armor}"
        else:
            armor = technical_armor["image"]
            cleaned_prompt += f", {armor}"

        if payload.image_count != "auto":
            cleaned_prompt += f", generate {payload.image_count} variations"
    else:
        armor = (
            technical_armor
            if isinstance(technical_armor, str)
            else technical_armor.get("image", "")
        )
        cleaned_prompt += f", {armor}"
        if payload.image_count != "auto":
            cleaned_prompt += f", generate {payload.image_count} variations"

    return cleaned_prompt


def get_success_tips(ai_model: str) -> List[str]:
    model_key = ai_model.lower()
    tips = SUCCESS_TIPS.get(model_key, [])
    general_tips = [
        "Always test prompts in the target AI to refine bypass rules.",
        "Stealth mode has 90%+ success rate | Bold mode has higher risk but potentially better results.",
    ]
    return tips + general_tips


# ── Prompt Routes ──

@app.post("/generate-prompt", response_model=PromptResponse)
@limiter.limit("30/minute")
def generate_prompt(payload: PromptRequest) -> PromptResponse:
    optimized = build_nsfw_prompt(payload)
    is_video = detect_video_intent(payload.prompt, payload.ai_model)
    tips = get_success_tips(payload.ai_model)

    return PromptResponse(
        original_prompt=payload.prompt,
        optimized_prompt=optimized,
        ai_model=payload.ai_model,
        video_quality=payload.video_quality,
        duration=payload.duration,
        image_count=payload.image_count,
        mode=payload.mode,
        success_tips=tips,
        is_video_prompt=is_video,
    )

@app.post("/generate-batch", response_model=BatchPromptResponse)
@limiter.limit("10/minute")
def generate_batch(payload: BatchPromptRequest) -> BatchPromptResponse:
    results = []
    for p in payload.prompts:
        optimized = build_nsfw_prompt(p)
        is_video = detect_video_intent(p.prompt, p.ai_model)
        tips = get_success_tips(p.ai_model)
        results.append(
            PromptResponse(
                original_prompt=p.prompt,
                optimized_prompt=optimized,
                ai_model=p.ai_model,
                video_quality=p.video_quality,
                duration=p.duration,
                image_count=p.image_count,
                mode=p.mode,
                success_tips=tips,
                is_video_prompt=is_video,
            )
        )
    return BatchPromptResponse(results=results)

@app.get("/supported-models")
def get_supported_models() -> List[str]:
    return list(AI_BYPASS_RULES.keys())

@app.get("/model-config/{model_name}")
def get_model_config(model_name: str) -> Dict[str, object]:
    model_key = model_name.lower()
    rules = AI_BYPASS_RULES.get(model_key)
    if not rules:
        raise HTTPException(status_code=404, detail=f"Model not found: {model_name}")
    return {
        "model": model_key,
        "video_qualities": rules.get("video_qualities", []),
        "durations": rules.get("durations", []),
        "image_counts": rules.get("image_counts", []),
        "has_video_support": model_key == "grok",
    }


# ── Supabase Routes ──

@app.post("/save-prompt", response_model=SavedPromptResponse)
def save_prompt_to_db(payload: SavedPromptRequest) -> SavedPromptResponse:
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    insert_data = {
        "original_prompt": payload.original_prompt,
        "optimized_prompt": payload.optimized_prompt,
        "ai_model": payload.ai_model,
        "video_quality": payload.video_quality,
        "duration": payload.duration,
        "image_count": payload.image_count,
        "mode": payload.mode,
        "user_label": payload.user_label,
    }

    result = supabase.table("saved_prompts").insert(insert_data).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save prompt")

    saved = result.data[0]
    return SavedPromptResponse(
        id=saved["id"],
        original_prompt=saved["original_prompt"],
        optimized_prompt=saved["optimized_prompt"],
        ai_model=saved["ai_model"],
        video_quality=saved["video_quality"],
        duration=saved["duration"],
        image_count=saved["image_count"],
        mode=saved["mode"],
        user_label=saved.get("user_label"),
        created_at=saved["created_at"],
    )


@app.get("/saved-prompts")
def get_saved_prompts(
    limit: int = 20, offset: int = 0
) -> List[SavedPromptResponse]:
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    result = (
        supabase.table("saved_prompts")
        .select("*")
        .order("created_at", desc=True)
        .limit(limit)
        .offset(offset)
        .execute()
    )

    return [
        SavedPromptResponse(
            id=item["id"],
            original_prompt=item["original_prompt"],
            optimized_prompt=item["optimized_prompt"],
            ai_model=item["ai_model"],
            video_quality=item["video_quality"],
            duration=item["duration"],
            image_count=item["image_count"],
            mode=item["mode"],
            user_label=item.get("user_label"),
            created_at=item["created_at"],
        )
        for item in (result.data or [])
    ]


@app.delete("/saved-prompts/{prompt_id}")
def delete_saved_prompt(prompt_id: str) -> Dict[str, bool]:
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    result = supabase.table("saved_prompts").delete().eq("id", prompt_id).execute()

    return {"success": True}


@app.patch("/saved-prompts/{prompt_id}/favorite")
def toggle_favorite(
    prompt_id: str, is_favorite: bool = True
) -> Dict[str, bool]:
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    result = (
        supabase.table("saved_prompts")
        .update({"is_favorite": is_favorite})
        .eq("id", prompt_id)
        .execute()
    )

    return {"success": True}


@app.get("/community-prompts")
def get_community_prompts(
    limit: int = 20, model: Optional[str] = None
) -> List[Dict]:
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    query = supabase.table("community_prompts").select("*")
    if model:
        query = query.eq("ai_model", model)

    result = query.order("upvotes", desc=True).limit(limit).execute()

    return result.data or []


@app.post("/community-prompts")
def submit_community_prompt(
    payload: SavedPromptRequest, contributor_name: Optional[str] = None
) -> Dict:
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    insert_data = {
        "original_prompt": payload.original_prompt,
        "optimized_prompt": payload.optimized_prompt,
        "ai_model": payload.ai_model,
        "mode": payload.mode,
        "contributor_name": contributor_name,
    }

    result = supabase.table("community_prompts").insert(insert_data).execute()

    return {"success": True, "id": result.data[0]["id"] if result.data else None}


@app.post("/community-prompts/{prompt_id}/upvote")
def upvote_community_prompt(prompt_id: str) -> Dict[str, bool]:
    if not supabase:
        raise HTTPException(status_code=503, detail="Database not configured")

    current = (
        supabase.table("community_prompts")
        .select("upvotes")
        .eq("id", prompt_id)
        .single()
        .execute()
    )

    if not current.data:
        raise HTTPException(status_code=404, detail="Prompt not found")

    new_upvotes = (current.data.get("upvotes") or 0) + 1

    supabase.table("community_prompts").update(
        {"upvotes": new_upvotes}
    ).eq("id", prompt_id).execute()

    return {"success": True}


# ── /api/ aliases (kept for backward compat) ──

@app.post("/api/generate-prompt", response_model=PromptResponse)
@limiter.limit("30/minute")
def api_generate_prompt(payload: PromptRequest) -> PromptResponse:
    return generate_prompt(payload)


@app.post("/api/generate-batch", response_model=BatchPromptResponse)
@limiter.limit("10/minute")
def api_generate_batch(payload: BatchPromptRequest) -> BatchPromptResponse:
    return generate_batch(payload)


@app.get("/api/supported-models")
def api_get_supported_models() -> List[str]:
    return get_supported_models()


@app.get("/api/model-config/{model_name}")
def api_get_model_config(model_name: str) -> Dict[str, object]:
    return get_model_config(model_name)
