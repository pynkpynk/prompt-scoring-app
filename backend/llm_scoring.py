import json
import os
import time
import hashlib
from collections import OrderedDict
from typing import Any, Dict, Optional, Literal

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
MODEL_NAME = os.environ.get("OPENAI_MODEL", "gpt-5-mini")
PROMPT_VERSION = "v2"
MAX_TOKENS = 600
GPT5_MAX_COMPLETION_TOKENS_DEFAULT = 1600
GPT5_MAX_COMPLETION_TOKENS_CAP = 4096
GPT5_REASONING_EFFORT_DEFAULT = "minimal"
GPT5_REASONING_EFFORT_ALLOWED = {"minimal", "low", "medium", "high"}

CACHE_TTL_SECONDS = 60 * 60 * 24
CACHE_MAX_ENTRIES = 200
_CACHE: "OrderedDict[str, Dict[str, Any]]" = OrderedDict()

SYSTEM_PROMPT = """
You are an expert prompt-quality evaluator.

Return a single valid JSON object and nothing else (no extra text, no code fences).
All natural language must be inside JSON string values.

Judge the prompt as instructions for an LLM (NOT the domain topic quality).
Do not reward verbosity; prefer precision and testability.

Task (target lang in {"en","ja","fr"}, default "en"):
- Score 6 metrics (0–100 integers; independent): clarity, specificity, constraints, intent, safety, evaluability.
- Provide overall score (0–100 integer), not an average.
- Provide comment_* and improved_prompt_* strings.
- Fill ONLY the target language fields; set all other language fields to "".
- Length limits: comment <= 450 chars, improved_prompt <= 900 chars.

Metric reminders:
clarity: unambiguous, easy to follow.
specificity: concrete details/context.
constraints: explicit rules/format/bounds.
intent: objective and success criteria.
safety: no harmful/illegal/confidential intent.
evaluability: output can be checked against explicit criteria/tests.

Feedback comment (target language):
- 2–5 concise sentences: strengths + actionable improvements.
- Then 1–2 bullet strengths + 2–4 bullet improvements.

Improved prompt (target language):
- Preserve intent/requirements; add only minimal assumptions to resolve ambiguity.
- Make it directly usable as LLM instructions.

Output JSON ONLY with exactly these keys:

{
  "clarity": number,
  "specificity": number,
  "constraints": number,
  "intent": number,
  "safety": number,
  "evaluability": number,
  "overall": number,
  "comment_en": "string",
  "comment_ja": "string",
  "comment_fr": "string",
  "improved_prompt_en": "string",
  "improved_prompt_ja": "string",
  "improved_prompt_fr": "string"
}

All numeric fields MUST be integers (0–100).
"""

LangLiteral = Literal["en", "ja", "fr"]


def _normalize_lang(lang: Optional[str]) -> str:
    v = (lang or "").strip().lower()
    if v in ("en", "ja", "fr"):
        return v
    return "en"


def _lang_override_system_prompt(lang: str) -> str:
    # NOTE: Keep this short; it is an override for speed + schema control.
    return f"""
OVERRIDE:
- Target language: "{lang}".
- Fill ONLY that language's comment_* and improved_prompt_*; set all others to "".
- Enforce length limits: comment <= 450 chars, improved_prompt <= 900 chars.
- Follow the schema from the main system prompt; do not change keys (includes evaluability).
""".strip()


def _cache_key(prompt: str, lang: str, model: str) -> str:
    base = f"{PROMPT_VERSION}|{model}|{lang}|{prompt}"
    return hashlib.sha256(base.encode("utf-8")).hexdigest()


def _cache_prune(now: float) -> None:
    expired = []
    for k, v in _CACHE.items():
        if now - float(v.get("ts", 0)) > CACHE_TTL_SECONDS:
            expired.append(k)
    for k in expired:
        _CACHE.pop(k, None)
    while len(_CACHE) > CACHE_MAX_ENTRIES:
        _CACHE.popitem(last=False)


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
    model_name: str | None = None,
    lang: Optional[LangLiteral] = None,
) -> tuple[Dict[str, Any], Dict[str, int], bool, str]:
    
    model = model_name or MODEL_NAME
    lang_norm = _normalize_lang(lang)
    now = time.time()
    cache_key = _cache_key(user_prompt, lang_norm, model)

    _cache_prune(now)
    cached = _CACHE.get(cache_key)
    if cached:
        _CACHE.move_to_end(cache_key)
        data = cached.get("data")
        if isinstance(data, dict):
            return data, {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}, True, model

    completion_kwargs = {
        "model": model,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": _lang_override_system_prompt(lang_norm)},
            {"role": "user", "content": user_prompt},
        ],
    }
    if model.startswith("gpt-5"):
        effort = os.environ.get("PSA_REASONING_EFFORT", GPT5_REASONING_EFFORT_DEFAULT).strip().lower()
        if effort not in GPT5_REASONING_EFFORT_ALLOWED:
            effort = GPT5_REASONING_EFFORT_DEFAULT
        completion_kwargs["reasoning_effort"] = effort
        max_completion = os.environ.get("PSA_MAX_COMPLETION_TOKENS_GPT5", "")
        try:
            max_completion_tokens = int(max_completion)
        except (TypeError, ValueError):
            max_completion_tokens = GPT5_MAX_COMPLETION_TOKENS_DEFAULT
        completion_kwargs["max_completion_tokens"] = max_completion_tokens
    else:
        completion_kwargs["temperature"] = 0
        completion_kwargs["max_tokens"] = MAX_TOKENS

    def extract_text(resp: Any) -> str:
        message = resp.choices[0].message
        content = message.content
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            parts = []
            for part in content:
                if getattr(part, "type", None) == "text":
                    t = getattr(getattr(part, "text", None), "value", None)
                    if isinstance(t, str):
                        parts.append(t)
            return "".join(parts)
        return ""

    def call_once() -> Any:
        return client.chat.completions.create(**completion_kwargs)

    try:
        response = call_once()
    except Exception as e:
        msg = str(e).lower()
        if "temperature" in msg and "default (1)" in msg and "temperature" in completion_kwargs:
            completion_kwargs.pop("temperature", None)
            response = call_once()
        else:
            raise

    text = extract_text(response)
    if not text or text.strip() == "":
        if model.startswith("gpt-5"):
            current_max = int(completion_kwargs.get("max_completion_tokens", GPT5_MAX_COMPLETION_TOKENS_DEFAULT))
            bumped = min(current_max * 2, GPT5_MAX_COMPLETION_TOKENS_CAP)
            completion_kwargs["max_completion_tokens"] = bumped
            completion_kwargs["reasoning_effort"] = GPT5_REASONING_EFFORT_DEFAULT
            response = call_once()
            text = extract_text(response)

    if not text or text.strip() == "":
        raise ValueError("LLM returned empty content (only whitespace)")

    data = _parse_json_text(text)

    usage_obj = getattr(response, "usage", None)
    usage = {
        "prompt_tokens": int(getattr(usage_obj, "prompt_tokens", 0) or 0),
        "completion_tokens": int(getattr(usage_obj, "completion_tokens", 0) or 0),
        "total_tokens": int(getattr(usage_obj, "total_tokens", 0) or 0),
    }

    _CACHE[cache_key] = {"ts": now, "data": data, "usage": usage}
    _cache_prune(now)

    return data, usage, False, model


def score_prompt_with_llm(
    user_prompt: str,
    model_name: str | None = None,
    lang: Optional[LangLiteral] = None,
) -> tuple[PromptScore, Dict[str, int], bool, str]:
    
    data, usage, cache_hit, model = call_llm_for_scoring(
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

    base_kwargs = dict(
        clarity=to_int_0_100(data.get("clarity")),
        specificity=to_int_0_100(data.get("specificity")),
        constraints=to_int_0_100(data.get("constraints")),
        intent=to_int_0_100(data.get("intent")),
        safety=to_int_0_100(data.get("safety")),
        evaluability=to_int_0_100(data.get("evaluability") or data.get("verifiability")),
        overall=to_int_0_100(data.get("overall")),
        comment_en=str(data.get("comment_en", "")),
        comment_ja=str(data.get("comment_ja", "")),
        improved_prompt_ja=str(data.get("improved_prompt_ja", "")),
        improved_prompt_en=str(data.get("improved_prompt_en", "")),
    )

    # (ADDED) Optional FR fields (only if PromptScore supports them)
    try:
        fields = getattr(PromptScore, "model_fields", None) or getattr(PromptScore, "__fields__", None)
        if fields and ("comment_fr" in fields) and ("improved_prompt_fr" in fields):
            base_kwargs["comment_fr"] = str(data.get("comment_fr", ""))
            base_kwargs["improved_prompt_fr"] = str(data.get("improved_prompt_fr", ""))
    except Exception:
        pass

    return PromptScore(**base_kwargs), usage, cache_hit, model
