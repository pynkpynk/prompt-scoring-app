import json
from typing import Dict, Any

from openai import OpenAI

from models import PromptScore

# OpenAIクライアント
client = OpenAI()

# 使用するモデル名（必要に応じて変更OK）
MODEL_NAME = "gpt-4.1-mini"

SYSTEM_PROMPT = """
You are an expert prompt engineer and evaluator.

Your task:
Given a user prompt (in any language), evaluate it on 5 metrics and return scores AND bilingual feedback.

Metrics (0–100):
- clarity
- specificity
- constraints
- intent
- safety

SCORING STYLE (VERY IMPORTANT):
- Use FINE-GRAINED scores.
- Do NOT restrict yourself to multiples of 5 or 10.
- In most cases, the ones digit of each score should NOT be 0 or 5.
- Prefer natural-looking scores such as 37, 42, 58, 71, 83, 94, etc.
- 0 and 100 are allowed as edge cases, but all other scores should usually end in 1,2,3,4,6,7,8, or 9.

OVERALL SCORE (INDEPENDENT):
- "overall" MUST be an independent holistic evaluation, NOT a mathematical average.
- It should reflect:
    - how effective the prompt is for real LLM usage,
    - how likely it is to produce high-quality and reliable output,
    - how well the user's intent is communicated,
    - how easy it is for the LLM to follow,
    - how actionable and well-structured the prompt is.
- overall may be higher or lower than any individual metric.
- overall MUST be a number between 0 and 100 and should also avoid 5 or 10 multiples unless you are extremely certain.

You MUST output:
- comment_en: short English explanation of strengths/weaknesses (2–3 sentences)
- comment_ja: same content translated into natural Japanese
- improved_prompt_en: improved English version of the prompt
- improved_prompt_ja: improved Japanese version of the prompt

Return JSON ONLY in this exact format (no extra text):

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
"""

def call_llm_for_scoring(user_prompt: str) -> Dict[str, Any]:
    """
    LLMを呼び出して、プロンプトのスコアリング結果(JSON)を返す。
    """
    response = client.chat.completions.create(
        model=MODEL_NAME,
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
    )
    content = response.choices[0].message.content
    data = json.loads(content)
    return data


def score_prompt_with_llm(user_prompt: str) -> PromptScore:
    """
    user_prompt を LLM に渡して、PromptScore オブジェクトとして返す。
    """
    data = call_llm_for_scoring(user_prompt)

    def to_int_0_100(value: Any) -> int:
        # float / str / int なんでも受けて 0〜100 にクリップ
        v = float(value)
        v = round(v)
        return max(0, min(100, int(v)))

    return PromptScore(
        clarity=to_int_0_100(data["clarity"]),
        specificity=to_int_0_100(data["specificity"]),
        constraints=to_int_0_100(data["constraints"]),
        intent=to_int_0_100(data["intent"]),
        safety=to_int_0_100(data["safety"]),
        overall=to_int_0_100(data["overall"]),
        comment_en=str(data["comment_en"]),
        comment_ja=str(data["comment_ja"]),
        improved_prompt_ja=str(data["improved_prompt_ja"]),
        improved_prompt_en=str(data["improved_prompt_en"]),
    )


