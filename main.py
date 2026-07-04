import os
import re
from typing import Dict, List, Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, Response
from pydantic import BaseModel, Field
from supabase import create_client, Client
import httpx


app = FastAPI(title="Prompt Alchemist API")

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Supabase ──
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

# ── AI Provider Keys (set in Vercel env vars) ──
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
#  AI PROVIDER PROXY ROUTES (what the frontend calls)
# ===================================================================

@app.post("/api/chat/completions")
async def api_chat_completions(body: dict):
    provider = body.pop("provider", "venice")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{base}/chat/completions",
            json=body,
            headers={"Authorization": f"Bearer {key}"}
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


@app.post("/api/image/generate")
async def api_image_generate(body: dict):
    provider = body.pop("provider", "venice")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{base}/image/generate",
            json=body,
            headers={"Authorization": f"Bearer {key}"}
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


@app.post("/api/video/generate")
async def api_video_generate(body: dict):
    provider = body.pop("provider", "venice")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{base}/video/generate",
            json=body,
            headers={"Authorization": f"Bearer {key}"}
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


@app.post("/api/audio/speech")
async def api_audio_speech(body: dict):
    provider = body.pop("provider", "venice")
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=120) as client:
        res = await client.post(
            f"{base}/audio/speech",
            json=body,
            headers={"Authorization": f"Bearer {key}"}
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return Response(content=res.content, media_type="audio/mpeg")


@app.get("/api/models")
async def api_list_models(provider: str = "venice"):
    key = get_provider_key(provider)
    base = PROVIDER_URLS[provider]

    async with httpx.AsyncClient(timeout=30) as client:
        res = await client.get(
            f"{base}/models",
            headers={"Authorization": f"Bearer {key}"}
        )
        if res.status_code != 200:
            raise HTTPException(status_code=res.status_code, detail=res.text)
        return res.json()


@app.get("/api/health")
async def api_health():
    return {"status": "ok"}


# ===================================================================
#  PROMPT ALCHEMIST ROUTES (under /api/ for frontend, originals kept)
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
        "banned_terms": ["nude", "naked", "fuck", "sex", "penis", "vagina", "explicit", "adult"],
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


class PromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
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


def normalize_prompt(text: str, replacements: Dict[str, str]) -> str:
    normalized = text
    for banned, safe_value in replacements.items():
        pattern = re.compile(re.escape(banned), re.IGNORECASE)
        normalized = pattern.sub(safe_value, normalized)
    return normalized


def detect_video_intent(prompt: str, ai_model: str) -> bool:
    video_keywords = ["video", "clip", "animation", "movement", "motion", "cinematic"]
    prompt_lower = prompt.lower()
    return any(keyword in prompt_lower for keyword in video_keywords) and ai_model.lower() == "grok"


def build_nsfw_prompt(payload: PromptRequest) -> str:
    model_key = payload.ai_model.lower()
    rules = AI_BYPASS_RULES.get(model_key)
    if not rules:
        raise HTTPException(status_code=400, detail=f"Unsupported AI model: {payload.ai_model}")

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
            cleaned_prompt += f", {payload.video_quality}, {payload.duration}-second cinematic clip"
            cleaned_prompt += f", slow subtle push-in camera movement, {armor}"
        else:
            armor = technical_armor["image"]
            cleaned_prompt += f", {armor}"

        if payload.image_count != "auto":
            cleaned_prompt += f", generate {payload.image_count} variations"
    else:
        armor = technical_armor if isinstance(technical_armor, str) else technical_armor.get("image", "")
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


# ── Original routes (kept for backward compat) ──

@app.post("/generate-prompt", response_model=PromptResponse)
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


@app.post("/save-prompt", response_model=SavedPromptResponse)
def save_prompt_to_db(payload: SavedPromptRequest) -> SavedPromptResponse:
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

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
def get_saved_prompts(limit: int = 20, offset: int = 0) -> List[SavedPromptResponse]:
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

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
        raise HTTPException(status_code=500, detail="Database not configured")

    result = supabase.table("saved_prompts").delete().eq("id", prompt_id).execute()

    return {"success": True}


@app.patch("/saved-prompts/{prompt_id}/favorite")
def toggle_favorite(prompt_id: str, is_favorite: bool = True) -> Dict[str, bool]:
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

    result = (
        supabase.table("saved_prompts")
        .update({"is_favorite": is_favorite})
        .eq("id", prompt_id)
        .execute()
    )

    return {"success": True}


@app.get("/community-prompts")
def get_community_prompts(limit: int = 20, model: Optional[str] = None) -> List[Dict]:
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

    query = supabase.table("community_prompts").select("*")
    if model:
        query = query.eq("ai_model", model)

    result = query.order("upvotes", desc=True).limit(limit).execute()

    return result.data or []


@app.post("/community-prompts")
def submit_community_prompt(payload: SavedPromptRequest, contributor_name: Optional[str] = None) -> Dict:
    if not supabase:
        raise HTTPException(status_code=500, detail="Database not configured")

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
        raise HTTPException(status_code=500, detail="Database not configured")

    current = supabase.table("community_prompts").select("upvotes").eq("id", prompt_id).single().execute()

    if not current.data:
        raise HTTPException(status_code=404, detail="Prompt not found")

    new_upvotes = (current.data.get("upvotes") or 0) + 1

    supabase.table("community_prompts").update({"upvotes": new_upvotes}).eq("id", prompt_id).execute()

    return {"success": True}


# ── /api/ aliases for frontend ──

@app.post("/api/generate-prompt", response_model=PromptResponse)
def api_generate_prompt(payload: PromptRequest) -> PromptResponse:
    return generate_prompt(payload)


@app.post("/api/generate-batch", response_model=BatchPromptResponse)
def api_generate_batch(payload: BatchPromptRequest) -> BatchPromptResponse:
    return generate_batch(payload)


@app.get("/api/supported-models")
def api_get_supported_models() -> List[str]:
    return get_supported_models()


@app.get("/api/model-config/{model_name}")
def api_get_model_config(model_name: str) -> Dict[str, object]:
    return get_model_config(model_name)
