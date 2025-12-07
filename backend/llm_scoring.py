import json
from typing import Dict, Any

import os
from openai import OpenAI
from .models import PromptScore

api_key = os.environ.get("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY is not set in environment")

client = OpenAI(api_key=api_key)


MODEL_NAME = "gpt-5-mini"

SYSTEM_PROMPT = """
You are an expert prompt engineer and prompt quality evaluator.

You MUST always respond with a single valid JSON object and nothing else.
- Do NOT add any explanation before or after the JSON.
- Do NOT wrap the JSON in code fences (no ```json).
- All natural language text MUST be inside JSON string values.
- Markdown is allowed **inside** string values (e.g., bullet lists, headings),
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

# 5. Feedback comments (Markdown allowed, 改善案メイン)

You must provide feedback in both English and Japanese:

- comment_en:  
  A short explanation in English (2–5 sentences or a short Markdown list) that:
  - briefly summarizes the main strengths of the original prompt, and
  - focuses on concrete improvement tips (e.g., in bullet points).

- comment_ja:  
  The same content, translated into natural, fluent Japanese.
  You may use Markdown (e.g., 「- 箇条書き」) to show改善ポイント.

Examples of good content style for comments (conceptual, do NOT copy):

- comment_en:
  "- Strength: clearly states the task and audience.\n- Improvement: specify desired length and tone.\n- Improvement: define output format (e.g., bullet list, JSON)."

- comment_ja:
  "- 良い点: タスクと対象読者が明確です。\n- 改善点: 希望する文量やトーンを指定するとより安定します。\n- 改善点: 出力形式（箇条書き・JSONなど）を明示してください。"

# 6. Safety

"safety" should reflect how safe and responsible the requested behavior is.

- High score if the prompt clearly avoids harmful, illegal, or disallowed content,
  or handles sensitive topics cautiously.
- Low score if it pushes for harmful, abusive, illegal, or policy-violating content.

# 7. Output rules (VERY IMPORTANT)

You MUST output **JSON ONLY**, with no extra text.

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
    モデルから返ってきたテキストを JSON としてパースする。
    （コードブロックや前後のゴミが混ざっても最低限リカバリする）
    """
    s = (text or "").strip()
    if not s:
        raise ValueError("LLM returned empty content (only whitespace)")

    try:
        return json.loads(s)
    except json.JSONDecodeError:
        # ```json ... ``` で返ってきた場合を剥がす
        cleaned = s
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`").strip()
            if cleaned.lower().startswith("json"):
                cleaned = cleaned[4:].strip()

        # 最初と最後の { ... } 部分だけを抽出してパースを試みる
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidate = cleaned[start : end + 1]
            return json.loads(candidate)

        
        raise ValueError(f"LLM returned non-JSON content: {s}")


def call_llm_for_scoring(user_prompt: str) -> Dict[str, Any]:
    """
    LLMを呼び出して、プロンプトのスコアリング結果(JSON相当の dict)を返す。
    """
    response = client.chat.completions.create(
        model=MODEL_NAME,
        # GPT-5 系は reasoning にもトークンを使うので、少し多めに確保する
        max_completion_tokens=1200,
        # 「考える量」を抑えて、空レスポンスを防ぎつつ速度も上げる
        reasoning_effort="low",   
        # 出力の冗長さも抑える（省略可だけど付けておくと安定しやすい）
        verbosity="low",
        seed=42,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )

    message = response.choices[0].message
    content = message.content

    # content は str / list 両対応
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

    data = _parse_json_text(text)
    return data


def score_prompt_with_llm(user_prompt: str) -> PromptScore:
    """
    user_prompt を LLM に渡して、PromptScore オブジェクトとして返す。
    """
    data = call_llm_for_scoring(user_prompt)

    def to_int_0_100(value: Any) -> int:
        """
        任意の値を 0〜100 の int に正規化。
        想定外の値の場合は 0 を返す。
        """
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

