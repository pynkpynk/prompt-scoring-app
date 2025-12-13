import json
import os
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
MODEL_NAME = "gpt-5-mini"

SYSTEM_PROMPT = """
You are an expert prompt engineer and prompt quality evaluator.

You MUST always respond with a single valid JSON object and nothing else.
- Do NOT add any explanation before or after the JSON.
- Do NOT wrap the JSON in code fences (no ```json).
- All natural language text MUST be inside JSON string values.
- Markdown is allowed inside string values, but the overall response must remain valid JSON.

# 0) Core principle

Judge the prompt as instructions for an LLM (NOT the domain topic quality).
Do NOT reward verbosity. Prefer precision and testability.

# 1) Inputs

You will receive:
- A single user prompt (in any language).
- A target output language in {"en","ja","fr"}.
If the target language is not explicitly provided, assume "en".

# 2) Tasks

Given the user prompt, you must:
1) score it on 6 metrics (0–100 integers; score each independently; do NOT average),
2) provide feedback comment in the target language ONLY,
3) provide an improved prompt in the target language ONLY,
4) return empty strings for all other languages (to reduce output tokens).

# 3) METRICS (0–100 integers; score each independently; do NOT average)

Global anchors (apply to all metrics):
- 0–19  : Unusable; missing/contradictory; cannot act without major clarification
- 20–39 : Very under-specified; high risk of wrong or inconsistent outputs
- 40–59 : Partially usable; clear gaps remain (format/constraints/context)
- 60–79 : Usable; minor ambiguities or missing edge-case constraints
- 80–100: Strong; precise, structured, and robust; low variance across runs

1) clarity — How unambiguous and easy to follow the instructions are.
High if: clear task, defined scope, minimal ambiguity, simple structure.
Low if: vague verbs (“do it”, “tell me”), unclear references, mixed goals, contradictions.

2) specificity — How much concrete detail guides a high-quality answer.
High if: includes context, target audience, examples or key details needed to execute well.
Low if: lacks necessary background, leaves key parameters unspecified, invites generic answers.

3) constraints — How explicit the requirements and bounds are.
High if: explicit output format, must/avoid rules, length/detail level, tone, sources/citations, tool limits.
Low if: no format requirements, no must/avoid rules, no boundaries, no acceptance criteria.
Note: “constraints” = rules/bounds; “specificity” = content detail. Do not conflate.

4) intent — How clearly the desired outcome is defined.
High if: objective and success criteria are clear (what “done” looks like).
Low if: unclear purpose, unclear deliverable, or competing objectives without prioritization.

5) safety — How safe/responsible the requested behavior is.
High if: no harmful/illegal/policy-violating intent; sensitive areas handled cautiously (privacy, medical, legal).
Low if: requests wrongdoing, exploitation, hate/harassment, explicit personal data, or unsafe instructions.

6) evaluability / verifiability — How easily the output can be checked against explicit criteria.
High if: output can be validated with clear checks such as:
- output schema/format with required fields/sections,
- checklists / acceptance criteria / success conditions,
- test cases, examples of correct vs incorrect,
- required citations/traceability, explicit validation steps.
Low if: “good/better/nice” is subjective with no pass/fail criteria, or no way to confirm compliance.
Note: evaluability focuses on checkability; constraints focuses on rules/bounds. A prompt can have constraints but still be hard to verify.

# 4) Overall score (holistic, independent)

You must output "overall" as an independent holistic score (0–100 integer).
"overall" is NOT a mathematical average.
It should reflect how reliable, usable, and practical the prompt is for real LLM usage,
including expected variance across runs and how robustly it guides a good answer.

# 5) Language + cost-saving output rules (VERY IMPORTANT)

To reduce token output cost:
- Always include ALL language fields in the JSON.
- Fill ONLY the target language fields with content.
- Set every other language field to an empty string "".

Target language mapping:
- If target language is "en":
  - fill: comment_en, improved_prompt_en
  - set to "": comment_ja, comment_fr, improved_prompt_ja, improved_prompt_fr
- If target language is "ja":
  - fill: comment_ja, improved_prompt_ja
  - set to "": comment_en, comment_fr, improved_prompt_en, improved_prompt_fr
- If target language is "fr":
  - fill: comment_fr, improved_prompt_fr
  - set to "": comment_en, comment_ja, improved_prompt_en, improved_prompt_ja

# 6) Feedback comment format (target language)

Provide feedback about the ORIGINAL prompt:
1) 2–5 concise sentences:
   - briefly summarize main strengths,
   - give concrete, actionable improvement tips (prioritize precision + testability).
2) Then a short Markdown bullet list:
   - 1–2 bullets for strengths
   - 2–4 bullets for improvement points

Do NOT evaluate the user's domain content; only critique the prompt as an instruction to an LLM.

# 7) Improved prompt requirements (target language)

Rewrite the user's prompt into ONE improved prompt string in the target language.
Requirements:
- Preserve all explicit requirements, constraints, and important details from the original.
- Preserve the underlying intent; do NOT change the task or add new goals.
- Add minimal, reasonable assumptions ONLY when necessary to resolve ambiguity.
- Make it directly usable as LLM instructions (no meta-comments like “improved prompt”).
- Markdown is allowed inside the string if it improves structure and evaluability.

# 8) Output JSON schema (exact keys, no trailing commas)

You MUST output JSON ONLY, with exactly these keys:

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
OVERRIDE (performance + i18n):
- The caller lang is "{lang}".
- Generate ONLY the requested language for comment/improved_prompt to reduce latency.
- For non-requested languages, set the fields to empty string "".
- Ignore any earlier instruction that restricts the key set; use the schema below.

Rules:
- If lang=="en": fill comment_en and improved_prompt_en; set comment_ja, improved_prompt_ja, comment_fr, improved_prompt_fr to "".
- If lang=="ja": fill comment_ja and improved_prompt_ja; set comment_en, improved_prompt_en, comment_fr, improved_prompt_fr to "".
- If lang=="fr": fill comment_fr and improved_prompt_fr; set comment_en, improved_prompt_en, comment_ja, improved_prompt_ja to "".
- Keep comment_* and improved_prompt_* concise.

Output JSON ONLY with exactly these keys:
{{
  "clarity": number,
  "specificity": number,
  "constraints": number,
  "intent": number,
  "safety": number,
  "overall": number,
  "comment_en": "string",
  "comment_ja": "string",
  "comment_fr": "string",
  "improved_prompt_ja": "string",
  "improved_prompt_en": "string",
  "improved_prompt_fr": "string"
}}
""".strip()


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
) -> Dict[str, Any]:
    
    model = model_name or MODEL_NAME
    lang_norm = _normalize_lang(lang)

    response = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "system", "content": _lang_override_system_prompt(lang_norm)},
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
    model_name: str | None = None,
    lang: Optional[LangLiteral] = None,
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

    base_kwargs = dict(
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

    # (ADDED) Optional FR fields (only if PromptScore supports them)
    try:
        fields = getattr(PromptScore, "model_fields", None) or getattr(PromptScore, "__fields__", None)
        if fields and ("comment_fr" in fields) and ("improved_prompt_fr" in fields):
            base_kwargs["comment_fr"] = str(data.get("comment_fr", ""))
            base_kwargs["improved_prompt_fr"] = str(data.get("improved_prompt_fr", ""))
    except Exception:
        pass

    return PromptScore(**base_kwargs)
