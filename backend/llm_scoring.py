import json
import os
from typing import Any, Dict, Optional

from openai import OpenAI
from .models import PromptScore

# === OpenAI クライアントの初期化 ===
api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError(
        "OPENAI_API_KEY is not set in environment. "
        "Set it in your Hugging Face Space settings (Secrets) or local .env."
    )

client = OpenAI(api_key=api_key)

# デフォルトで使うモデル（通常利用向け）
MODEL_NAME = "gpt-5-mini"


SYSTEM_PROMPT_TEMPLATE = """
You are an expert prompt engineer and prompt quality evaluator.

Return ONLY a single valid JSON object with EXACTLY these keys:

{{
  "clarity": number,
  "specificity": number,
  "constraints": number,
  "intent": number,
  "safety": number,
  "overall": number,
  "comment_en": "string",
  "comment_ja": "string",
  "improved_prompt_ja": "string",
  "improved_prompt_en": "string"
}}

Rules:
- Integers only (0–100) for all numeric fields.
- "overall" is holistic and NOT a mathematical average.
- Markdown is allowed inside string values.
- Output JSON only. No extra text.

Requested output language: {LANG}

Language behavior (IMPORTANT):
- If LANG == "ja":
  - Write "comment_ja" and "improved_prompt_ja" in natural Japanese.
  - Set "comment_en" = "" and "improved_prompt_en" = "".
- If LANG == "en":
  - Write "comment_en" and "improved_prompt_en" in natural English.
  - Set "comment_ja" = "" and "improved_prompt_ja" = "".
- If LANG == "fr":
  - Write "comment_en" and "improved_prompt_en" in natural French.
  - Set "comment_ja" = "" and "improved_prompt_ja" = "".

Comment format (for the used comment field only):
- 2–5 concise sentences summarizing strengths + actionable improvement tips
- then a short Markdown bullet list:
  - 1–2 bullets for strengths
  - 2–4 bullets for improvement points

Improved prompt (for the used improved_prompt field only):
- Preserve all explicit requirements/constraints and the user’s intent.
- Make it directly usable as an instruction for an LLM.
"""


def _parse_json_text(text: str) -> Dict[str, Any]:
    """
    Parse the model output as JSON.
    If there are code fences or extra text, try to recover the JSON object.
    """
    s = (text or "").strip()
    if not s:
        raise ValueError("LLM returned empty content (only whitespace)")

    # First, try direct JSON
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        pass

    # Strip ```json ... ``` style fences if present
    cleaned = s
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`").strip()
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].strip()

    # Extract the first {...} block
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = cleaned[start : end + 1]
        return json.loads(candidate)

    # Give up if we still can't parse
    raise ValueError(f"LLM returned non-JSON content: {s}")


def call_llm_for_scoring(
    user_prompt: str,
    model_name: Optional[str] = None,
    lang: Optional[str] = "en",
) -> Dict[str, Any]:

    model = model_name or MODEL_NAME
    lang_norm = (lang or "en").strip().lower()
    if lang_norm not in ("ja", "en", "fr"):
        lang_norm = "en"

    system_prompt = SYSTEM_PROMPT_TEMPLATE.replace("{LANG}", lang_norm)

    response = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )

    message = response.choices[0].message
    content = message.content

    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        parts = []
        for part in content:
            if getattr(part, "type", None) == "text":
                t = getattr(getattr(part, "text", None), "value", None)
                if isinstance(t, str):
                    parts.append(t)
        text = "".join(parts)
    else:
        text = ""

    if not text or text.strip() == "":
        raise ValueError("LLM returned empty content (only whitespace)")

    return _parse_json_text(text)


def score_prompt_with_llm(
    user_prompt: str,
    model_name: Optional[str] = None,
    lang: Optional[str] = "en",
) -> PromptScore:

    data = call_llm_for_scoring(
        user_prompt=user_prompt,
        model_name=model_name,
        lang=lang,
    )

    def to_int_0_100(value: Any) -> int:
        try:
            v = float(value)
        except (TypeError, ValueError):
            return 0
        v = round(v)
        return max(0, min(100, int(v)))

    return PromptScore(
        clarity=to_int_0_100(data.get("clarity")),
        specificity=to_int_0_100(data.get("specificity")),
        constraints=to_int_0_100(data.get("constraints")),
        intent=to_int_0_100(data.get("intent")),
        safety=to_int_0_100(data.get("safety")),
        overall=to_int_0_100(data.get("overall")),
        comment_en=str(data.get("comment_en", "")),
        comment_ja=str(data.get("comment_ja", "")),
        improved_prompt_ja=str(data.get("improved_prompt_ja", "")),
        improved_prompt_en=str(data.get("improved_prompt_en", "")),
    )
