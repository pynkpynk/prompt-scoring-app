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

4. Improved prompts (EN/JA)

Your task is to rewrite the user's prompt into better prompts in both English and Japanese.

You MUST return ONLY the following two fields:

- improved_prompt_en
- improved_prompt_ja

Each field must contain ONE complete prompt string.

Requirements for both improved prompts:

- Preserve all explicit requirements, constraints, and important details from the original prompt.
- Preserve the user’s underlying intent; do NOT change the task or add new goals.
- You may add minimal, reasonable assumptions ONLY when necessary to resolve ambiguity.
- Use clear, concise, professional language that is easy for an LLM to follow.
- Make each version natural in its target language:
  - improved_prompt_en → natural, fluent English
  - improved_prompt_ja → 自然で読みやすい日本語
- Do NOT mention that it is an “improved prompt” inside the prompt text itself.
- The prompts MUST be directly usable as instructions for an LLM (no meta-comments).
- You MAY use Markdown inside each string (headings, bullet lists, numbered steps) if it improves structure.

If the original prompt is already high-quality, keep your changes minimal
(e.g., reorder, clarify wording, improve structure) rather than rewriting it from scratch.


# 5. Feedback comments (Markdown allowed, focus on improvements)

You will provide feedback on the *original* user prompt.
You MAY use Markdown formatting in your comments.

You must provide feedback in both English and Japanese, using exactly these two fields:

- comment_en
- comment_ja

Each field MUST follow this structure:

1. 2–5 concise sentences that:
   - briefly summarize the main strengths of the original prompt, and
   - focus on concrete, actionable improvement tips.
2. Followed by a short Markdown bullet list with:
   - 1–2 bullets for strengths, and
   - 2–4 bullets for improvement points.

Requirements for each field:

- comment_en:
  - Write in natural, fluent, professional English.
  - Emphasize clarity, specificity, constraints, and output format as needed.

- comment_ja:
  - Provide the *same substantive feedback* as comment_en,
    but expressed in 自然で読みやすい日本語.
  - It does NOT need to be a word-for-word translation; preserve meaning and nuance.

General rules:

- Focus on how to make the original prompt more effective for real LLM use
  (e.g., clearer intent, better constraints, explicit output format).
- Do NOT add meta-comments about this feedback task itself.
- Do NOT evaluate the *content* of the user’s domain (e.g., business topic, story idea);
  only critique the prompt as an instruction to an LLM.

# 6. Safety

"safety" should reflect how safe and responsible the requested behavior and content is.

- High score if the prompt clearly avoids harmful, illegal, confidential or disallowed content,
  or handles sensitive topics cautiously.
- Low score if it pushes for harmful, abusive, illegal, or policy-violating content and includes confidential information.

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