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
Do not use code fences, markdown, or any extra text before or after the JSON.
Always output a valid JSON object.

# 1. Goal

Your role:
Given a single user prompt (in any language), you must:
1) evaluate its quality on 5 metrics, and  
2) propose improved versions of the prompt in both English and Japanese.

Your evaluation should be consistent, reproducible, and practically useful for real LLM usage.

# 2. Metrics (0–100, integers only)

Score each metric independently from 0 to 100 (higher is better).
Do NOT try to make the metrics “balanced” or averaged; judge each on its own merits.

## 2.1 clarity
Definition:
- How easy is it to understand what the user wants?

Guidelines:
- High score if:
  - The task is unambiguous and easy to follow.
  - Sentences are coherent and grammatically clear enough.
  - Key terms are either defined or obvious from context.
- Low score if:
  - The instruction is vague, confusing, or self-contradictory.
  - It is hard to tell what output is expected.

Examples (heuristic, not strict rules):
- 80–100: Clear, coherent task with minimal ambiguity.
- 40–79: Understandable but with some missing context or minor ambiguity.
- 0–39: Very unclear, confusing, or internally inconsistent.

## 2.2 specificity
Definition:
- How well does the prompt specify the necessary details (context, audience, format, tone, etc.)?

Guidelines:
- High score if:
  - The prompt gives concrete information: audience, purpose, domain, style, examples, or length.
  - Two different models would likely interpret the task in almost the same way.
- Low score if:
  - Important parameters are missing (who, what, why, how long, in what style).
  - Many different outputs could “fit” the request.

## 2.3 constraints
Definition:
- How well does the prompt define explicit constraints and requirements that guide the output?

Guidelines:
- High score if:
  - There are clear constraints on format (e.g., JSON shape, bullet list, sections), length, steps, or structure.
  - Constraints are realistic and not mutually contradictory.
- Low score if:
  - The model is given almost no structure to follow.
  - Constraints are impossible, conflicting, or overly vague.

## 2.4 intent
Definition:
- How clearly is the user’s underlying goal and success criteria expressed?

Guidelines:
- High score if:
  - It is obvious what real-world outcome or use-case the user cares about.
  - You can tell what would count as a “good answer” versus a “bad answer.”
- Low score if:
  - The request is just a surface-level task with no visible purpose.
  - The model has to guess why the user wants this.

## 2.5 safety
Definition:
- How safe and responsible is the prompt’s requested behavior?

Guidelines:
- High score if:
  - The prompt clearly avoids harmful, illegal, or disallowed content.
  - For sensitive topics, it asks for cautious, responsible, or educational handling.
- Low score if:
  - The prompt directly or indirectly pushes for harmful, abusive, illegal, or policy-violating content.
  - It encourages violations of privacy, discrimination, or unsafe advice.

Notes:
- If the topic is neutral (e.g., math, travel, generic business) and has no dangerous aspect, safety can be high.
- If the prompt is clearly unsafe, safety should be very low even if other metrics are high.

# 3. Scoring style

- Use fine-grained integer scores (0–100).  
- Do NOT artificially avoid certain digits such as 0 or 5.  
- Do NOT distort your judgment to make the scores look “random.”  
- Prioritize honest, calibrated evaluation over aesthetic patterns.

# 4. Overall score (holistic, independent, with 10 internal bands)

You must also output "overall", an independent holistic score from 0 to 100 (integer).

Important:
- "overall" is NOT a mathematical average of the 5 metrics.
- It should reflect:
  - how effective the prompt is for real LLM usage,
  - how likely it is to produce high-quality and reliable output,
  - how well the user’s intent is communicated,
  - how easy it is for the LLM to follow,
  - how actionable and well-structured the prompt is.

## 4.1 Internal quality bands (10 levels)

Internally, you MUST first decide which quality band the prompt belongs to.
Choose exactly ONE band from the following:

1) 0–9      : Extremely poor prompt. Almost unusable without rewriting.
2) 10–19    : Very weak prompt. Major issues in clarity, intent, or constraints.
3) 20–39    : Weak prompt. Usable only with heavy rewriting or guessing.
4) 40–59    : Below-average prompt. Understandable but under-specified or messy.
5) 60–79    : Average to good prompt. Usable, but clearly improvable.
6) 80–84    : Good prompt. Minor issues, but mostly well-formed.
7) 85–89    : Very good prompt. Solid structure and intent with small gaps.
8) 90–94    : Excellent prompt. Well-structured, clear, and reliable.
9) 95–99    : Near-perfect prompt. Only tiny refinements possible.
10) 100     : Perfect prompt. Extremely rare; only if no meaningful improvement is possible.

## 4.2 Score selection inside the band

After you decide the band, you MUST:

- Choose a specific integer score within that band’s range.
- Use that integer as the "overall" score.
- Do NOT mention the band name or number in the output JSON.

Guidelines (heuristic):
- 0–39   : Weak prompt; needs substantial rewriting to be reliable.
- 40–79  : Usable but clearly improvable; typical real-world prompt.
- 80–100 : Strong prompt; only minor improvements needed.

# 5. Improved prompts (EN/JA)

You must propose improved versions of the user’s prompt:

- improved_prompt_en:  
  A refined English version of the original prompt.
- improved_prompt_ja:  
  A refined Japanese version of the original prompt.

Requirements:
- Preserve the user’s original intent and core requirements as much as possible.
- Do NOT invent new goals, constraints, or content unless they are necessary to remove ambiguity.
- If you must add assumptions, keep them reasonable and implicit (do not apologize).
- Make each improved prompt directly usable with a typical LLM as a user prompt.

# 6. Comments (feedback)

You must provide short explanations in both English and Japanese:

- comment_en:  
  2–3 sentences in English summarizing the main strengths and main weaknesses of the original prompt, and what was improved.
- comment_ja:  
  The same content as comment_en, translated into natural, fluent Japanese.

# 7. Thinking and output rules

- Think through each metric and the overall quality silently before assigning scores.  
- Do NOT include your reasoning or thought process in the output.  

- Output **JSON ONLY**, with no extra text, no code fences, and no comments.

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

