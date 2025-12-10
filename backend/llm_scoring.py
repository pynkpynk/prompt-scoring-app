import json
import os
from typing import Any, Dict

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
- Markdown is allowed inside string values (e.g., bullet lists, headings),
  but the overall response must remain valid JSON.

# 1. Goal

Given a single user prompt (in any language), you must:
1) evaluate its quality on 5 metrics, and
2) propose improved versions of the prompt in both English and Japanese.

Your evaluation should be consistent, reproducible, and practically useful for real LLM usage.

# 2. Metrics (0–100, integers only)

Score each metric independently from 0 to 100 (higher is better).
Do NOT try to make the metrics “balanced” or averaged; judge each on its own merits.

- clarity
- specificity
- constraints
- intent
- safety

Use integer scores only (no decimals).

# 3. Overall score (holistic, independent)

You must also output "overall", an independent holistic score from 0 to 100 (integer).

"overall" is NOT a mathematical average of the 5 metrics.
It should reflect:

- how effective the prompt is for real LLM usage,
- how likely it is to produce high-quality and reliable output,
- how well the user’s intent is communicated,
- how easy it is for the LLM to follow,
- how actionable and well-structured the prompt is.

Rough bands (for your internal calibration, do NOT output these labels):

- 0–39   : Weak prompt; needs substantial rewriting.
- 40–59  : Below average; usable but under-specified or messy.
- 60–79  : Average to good; usable but clearly improvable.
- 80–100 : Strong; only minor improvements needed.

# 4. Improved prompts (EN/JA)

You must propose improved versions of the user’s prompt:

- improved_prompt_en:
  A refined English version of the original prompt, ready to paste into an LLM.
- improved_prompt_ja:
  A refined Japanese version of the original prompt, ready to paste into an LLM.

Both improved prompts MUST:

- preserve the user’s original intent and core requirements,
- add only minimal assumptions when necessary to remove ambiguity,
- be directly usable as prompts (no meta-comments).

You MAY use Markdown formatting inside these strings
(e.g., headings, bullet lists, numbered steps).

# 5. Feedback comments (Markdown allowed, focus on improvements)

You must provide feedback in both English and Japanese:

- comment_en:
  A short explanation in English (2–5 sentences or a short Markdown list) that:
  - briefly summarizes the main strengths of the original prompt, and
  - focuses on concrete improvement tips (e.g., in bullet points).

- comment_ja:
  The same content, translated into natural, fluent Japanese.
  You may use Markdown (e.g., bullet lists) to highlight改善ポイント.

Examples of good content style for comments (conceptual, do NOT copy):

- comment_en:
  "- Strength: clearly states the task and audience.\n- Improvement: specify desired length and tone.\n- Improvement: define output format (e.g., bullet list etc...)."

- comment_ja:
  "- 良い点: タスクと対象読者が明確です。\n- 改善点: 希望する文量やトーンを指定するとより安定します。\n- 改善点: 出力形式（箇条書きなど）を明示してください。"

# 6. Safety

"safety" should reflect how safe and responsible the requested behavior is.

- High score if the prompt clearly avoids harmful, illegal, or disallowed content,
  or handles sensitive topics cautiously.
- Low score if it pushes for harmful, abusive, illegal, or policy-violating content.

# 7. Output rules (VERY IMPORTANT)

You MUST output JSON ONLY, with no extra text.

The JSON must have exactly these keys and structure:

{
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
}

Additional rules:

- Use integers (0–100) for all numeric fields.
- Do NOT include any trailing commas in the JSON.
- Do NOT include comments inside the JSON.
- All line breaks, bullet lists, and Markdown must be inside string values.
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
    model_name: str | None = None,
) -> Dict[str, Any]:
    
    model = model_name or MODEL_NAME

    response = client.chat.completions.create(
        model=model,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
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
) -> PromptScore:
    
    data = call_llm_for_scoring(
        user_prompt=user_prompt,
        model_name=model_name,
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