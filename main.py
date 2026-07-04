from typing import Dict, List, Literal

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field


app = FastAPI(title="Prompt Routing API")


CONTENT_TYPE_VIDEO = "video"
CONTENT_TYPE_IMAGE = "image"
CONTENT_TYPE_TEXT = "text"

MODEL_PROFILES: Dict[str, Dict[str, object]] = {
    "grok": {
        "label": "Grok",
        "aliases": ["xai", "grok-vision"],
        "style_keywords": [
            "cinematic composition",
            "grounded visual detail",
        ],
        "image_finish": "photorealistic detail, balanced contrast, editorial finish",
        "video_finish": "steady camera motion, polished color grading, natural scene continuity",
        "text_finish": "clear structure, concise delivery, practical detail",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE, CONTENT_TYPE_VIDEO],
    },
    "dalle": {
        "label": "DALL·E",
        "aliases": ["dall-e", "openai-images"],
        "style_keywords": [
            "clean composition",
            "illustrative clarity",
        ],
        "image_finish": "high detail, strong focal subject, polished lighting",
        "video_finish": "storyboard-ready visual pacing, scene continuity",
        "text_finish": "creative direction, concise visual framing",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE],
    },
    "midjourney": {
        "label": "Midjourney",
        "aliases": ["mj"],
        "style_keywords": [
            "stylized atmosphere",
            "dramatic lighting",
        ],
        "image_finish": "high texture detail, cohesive mood, concept-art polish",
        "video_finish": "concept trailer pacing, cinematic scene beats",
        "text_finish": "evocative visual language, concise scene framing",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE],
    },
    "stable-diffusion": {
        "label": "Stable Diffusion",
        "aliases": ["stable_diffusion", "sd", "sdxl"],
        "style_keywords": [
            "configurable art direction",
            "controlled composition",
        ],
        "image_finish": "sharp texture detail, flexible art style, render-ready framing",
        "video_finish": "animation-friendly keyframes, consistent shot guidance",
        "text_finish": "parameter-friendly prompt structure, direct visual descriptors",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE],
    },
    "leonardo": {
        "label": "Leonardo",
        "aliases": ["leonardo-ai"],
        "style_keywords": [
            "premium visual styling",
            "refined subject focus",
        ],
        "image_finish": "polished finish, vivid depth, studio-grade clarity",
        "video_finish": "scene-consistent frames, polished motion direction",
        "text_finish": "brand-ready creative direction, polished phrasing",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE],
    },
    "flux": {
        "label": "FLUX",
        "aliases": ["black-forest-labs", "bfl"],
        "style_keywords": [
            "modern visual realism",
            "precise subject emphasis",
        ],
        "image_finish": "crisp realism, balanced lighting, strong subject readability",
        "video_finish": "consistent motion cues, scene-accurate continuity",
        "text_finish": "precise subject language, low-ambiguity direction",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE],
    },
    "gemini": {
        "label": "Gemini",
        "aliases": ["google", "google-ai"],
        "style_keywords": [
            "structured reasoning",
            "clear multimodal framing",
        ],
        "image_finish": "clean visual hierarchy, descriptive fidelity",
        "video_finish": "scene planning, sequential clarity, storyboard-friendly pacing",
        "text_finish": "well-structured reasoning, concise multimodal instructions",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE, CONTENT_TYPE_VIDEO],
    },
    "claude": {
        "label": "Claude",
        "aliases": ["anthropic"],
        "style_keywords": [
            "clear instruction hierarchy",
            "thoughtful narrative flow",
        ],
        "image_finish": "descriptive visual hierarchy, coherent framing",
        "video_finish": "story-led sequencing, clear scene transitions",
        "text_finish": "high-clarity instructions, nuanced but concise framing",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE],
    },
    "openai": {
        "label": "OpenAI",
        "aliases": ["chatgpt", "gpt", "gpt-image"],
        "style_keywords": [
            "balanced creative direction",
            "clear subject framing",
        ],
        "image_finish": "clean detail, strong focal subject, polished composition",
        "video_finish": "sequence-ready scene direction, smooth pacing cues",
        "text_finish": "clear structure, compact instructions, creative consistency",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE],
    },
    "default": {
        "label": "Default",
        "aliases": [],
        "style_keywords": [
            "clear composition",
            "cohesive creative direction",
        ],
        "image_finish": "balanced detail, natural lighting, concise visual framing",
        "video_finish": "clear shot direction, cohesive pacing, scene continuity",
        "text_finish": "clear and direct wording, practical context",
        "supported_content": [CONTENT_TYPE_TEXT, CONTENT_TYPE_IMAGE],
    },
}

MODE_CUES: Dict[str, str] = {
    "stealth": "subtle editorial framing",
    "cinematic": "cinematic visual storytelling",
    "studio": "clean studio composition",
}

VIDEO_HINTS = (
    "video",
    "clip",
    "animation",
    "trailer",
    "scene",
    "motion",
    "camera",
)
IMAGE_HINTS = (
    "image",
    "photo",
    "photograph",
    "portrait",
    "illustration",
    "poster",
    "render",
    "concept art",
)


class PromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    ai_model: str = Field(default="grok")
    video_quality: str = Field(default="1080p")
    duration: int = Field(default=10, ge=1, le=120)
    image_count: str = Field(default="auto")
    mode: str = Field(default="stealth")


class PromptResponse(BaseModel):
    original_prompt: str
    optimized_prompt: str
    requested_model: str
    routed_model: str
    content_type: Literal["text", "image", "video"]
    video_quality: str
    duration: int
    image_count: str
    mode: str
    supported_models: List[str]


class ModelCatalogEntry(BaseModel):
    id: str
    label: str
    aliases: List[str]
    supported_content: List[str]


class ModelCatalogResponse(BaseModel):
    models: List[ModelCatalogEntry]


def resolve_model(model_name: str) -> str:
    normalized = (model_name or "").strip().lower()
    if normalized in ("", "auto"):
        return "grok"

    for model_id, profile in MODEL_PROFILES.items():
        aliases = profile["aliases"]  # type: ignore[assignment]
        if normalized == model_id or normalized in aliases:
            return model_id

    raise HTTPException(status_code=400, detail=f"Unsupported AI model: {model_name}")


def detect_content_type(prompt: str) -> Literal["text", "image", "video"]:
    lowered = prompt.lower()
    if any(hint in lowered for hint in VIDEO_HINTS):
        return CONTENT_TYPE_VIDEO
    if any(hint in lowered for hint in IMAGE_HINTS):
        return CONTENT_TYPE_IMAGE
    return CONTENT_TYPE_TEXT


def route_model(requested_model: str, content_type: Literal["text", "image", "video"]) -> str:
    resolved = resolve_model(requested_model)
    profile = MODEL_PROFILES[resolved]
    supported_content = profile["supported_content"]  # type: ignore[assignment]
    if content_type in supported_content:
        return resolved

    if content_type == CONTENT_TYPE_VIDEO:
        return "grok"

    return "default"


def build_prompt(payload: PromptRequest) -> tuple[str, str, Literal["text", "image", "video"]]:
    content_type = detect_content_type(payload.prompt.strip())
    routed_model = route_model(payload.ai_model, content_type)
    profile = MODEL_PROFILES[routed_model]
    style_keywords = profile["style_keywords"]  # type: ignore[assignment]
    mode_cue = MODE_CUES.get(payload.mode.lower(), MODE_CUES["stealth"])
    style_block = ", ".join(style_keywords)
    prompt_parts = [mode_cue, style_block, payload.prompt.strip()]

    if content_type == CONTENT_TYPE_VIDEO:
        prompt_parts.extend(
            [
                profile["video_finish"],  # type: ignore[arg-type]
                f"{payload.video_quality} output",
                f"{payload.duration}-second runtime",
            ]
        )
    elif content_type == CONTENT_TYPE_IMAGE:
        prompt_parts.append(profile["image_finish"])  # type: ignore[arg-type]
        if payload.image_count != "auto":
            prompt_parts.append(f"{payload.image_count} image variations")
    else:
        prompt_parts.append(profile["text_finish"])  # type: ignore[arg-type]

    return ", ".join(prompt_parts), routed_model, content_type


def supported_models() -> List[str]:
    return list(MODEL_PROFILES.keys())


@app.get("/models", response_model=ModelCatalogResponse)
def get_models() -> ModelCatalogResponse:
    return ModelCatalogResponse(
        models=[
            ModelCatalogEntry(
                id=model_id,
                label=profile["label"],  # type: ignore[arg-type]
                aliases=profile["aliases"],  # type: ignore[arg-type]
                supported_content=profile["supported_content"],  # type: ignore[arg-type]
            )
            for model_id, profile in MODEL_PROFILES.items()
        ]
    )


@app.post("/generate-prompt", response_model=PromptResponse)
def generate_prompt(payload: PromptRequest) -> PromptResponse:
    optimized, routed_model, content_type = build_prompt(payload)
    return PromptResponse(
        original_prompt=payload.prompt,
        optimized_prompt=optimized,
        requested_model=payload.ai_model,
        routed_model=routed_model,
        content_type=content_type,
        video_quality=payload.video_quality,
        duration=payload.duration,
        image_count=payload.image_count,
        mode=payload.mode,
        supported_models=supported_models(),
    )
