from typing import Dict, List

from fastapi import FastAPI
from pydantic import BaseModel, Field


app = FastAPI(title="Prompt Alchemist API")


AI_PROMPT_RULES: Dict[str, Dict[str, object]] = {
    "grok": {
        "style_keywords": [
            "cinematic fine-art composition",
            "soft directional lighting",
        ],
        "sensitive_terms": ["explicit", "nude", "nsfw"],
        "replacements": {
            "explicit": "sensual and tasteful",
            "nude": "artistic study",
            "nsfw": "creative portrait",
        },
        "technical_armor": "photorealistic detail, 8K fidelity, cinematic color grading",
    },
    "dalle": {
        "style_keywords": [
            "artistic illustration",
            "soft studio lighting",
        ],
        "sensitive_terms": ["adult", "mature"],
        "replacements": {
            "adult": "artistic and mature",
            "mature": "sophisticated",
        },
        "technical_armor": "high detail, 8K rendering, cinematic finish",
    },
    "default": {
        "style_keywords": [
            "cinematic framing",
            "fine-art styling",
        ],
        "sensitive_terms": ["explicit", "nude", "nsfw"],
        "replacements": {
            "explicit": "sensual and tasteful",
            "nude": "artistic study",
            "nsfw": "creative portrait",
        },
        "technical_armor": "photorealistic detail, cinematic lighting",
    },
}


MODE_CUES: Dict[str, str] = {
    "stealth": "discreet editorial storytelling",
    "cinematic": "cinematic visual storytelling",
    "studio": "clean studio composition",
}


class PromptRequest(BaseModel):
    prompt: str = Field(..., min_length=1)
    ai_model: str = Field(default="default")
    video_quality: str = Field(default="1080p")
    duration: int = Field(default=10, ge=1, le=120)
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


def normalize_prompt(text: str, replacements: Dict[str, str]) -> str:
    normalized = text
    for banned, safe_value in replacements.items():
        normalized = normalized.replace(banned, safe_value).replace(
            banned.capitalize(), safe_value
        )
    return normalized


def build_prompt(payload: PromptRequest) -> str:
    model_key = payload.ai_model.lower()
    rules = AI_PROMPT_RULES.get(model_key, AI_PROMPT_RULES["default"])
    replacements = rules["replacements"]  # type: ignore[assignment]
    style_keywords = rules["style_keywords"]  # type: ignore[assignment]
    technical_armor = rules["technical_armor"]  # type: ignore[assignment]

    base_prompt = normalize_prompt(payload.prompt.strip(), replacements)
    mode_cue = MODE_CUES.get(payload.mode.lower(), MODE_CUES["stealth"])
    style_block = ", ".join(style_keywords)

    return (
        f"{mode_cue}, {style_block}, {base_prompt}, "
        f"{technical_armor}, {payload.video_quality}, "
        f"{payload.duration}-second clip"
    )


@app.post("/generate-prompt", response_model=PromptResponse)
def generate_prompt(payload: PromptRequest) -> PromptResponse:
    optimized = build_prompt(payload)
    return PromptResponse(
        original_prompt=payload.prompt,
        optimized_prompt=optimized,
        ai_model=payload.ai_model,
        video_quality=payload.video_quality,
        duration=payload.duration,
        image_count=payload.image_count,
        mode=payload.mode,
    )
