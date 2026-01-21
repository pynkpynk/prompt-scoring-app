# Prompt Scoring App API Spec

## Purpose
Provide LLM-based prompt quality scoring, feedback, and an improved prompt in a target language.

## Non-goals
- This API does not judge domain topic quality.
- This API does not execute or validate user-provided code.

## Endpoints
### GET /health
- Response: `{"status":"ok"}`
- Status codes: 200

### POST /score
- Request body:
```
{"prompt":"...","lang":"en"}
```
- `lang` is optional; supported values: `en`, `ja`, `fr` (default `en`)
- Response (13 keys):
```
{
  "clarity": 0,
  "specificity": 0,
  "constraints": 0,
  "intent": 0,
  "safety": 0,
  "evaluability": 0,
  "overall": 0,
  "comment_en": "",
  "comment_ja": "",
  "comment_fr": "",
  "improved_prompt_en": "",
  "improved_prompt_ja": "",
  "improved_prompt_fr": ""
}
```
- Score fields are integers 0–100.
- Non-target language fields may be empty strings.
- Status codes: 200, 500

## Header Contract (X-PSA-*)
- X-PSA-MODEL: model name used
- X-PSA-IN_TOKENS: input tokens
- X-PSA-OUT_TOKENS: output tokens
- X-PSA-TOTAL_TOKENS: total tokens
- X-PSA-CACHE: HIT or MISS
- X-PSA-LLM_MS: LLM duration (ms)
- X-PSA-TOTAL_MS: total request time (ms)
- X-PSA-REQID: request id
- X-PSA-LANG: requested language

## Caching Rules
Cache key is SHA256 of `(prompt + lang + model + prompt_version)`. Cache HIT returns usage tokens as 0 and near-zero LLM time.

## Model Behavior Notes
- gpt-5* uses `max_completion_tokens` and omits `temperature`.
- A retry occurs on empty output to raise completion budget and reduce reasoning effort.
- Reasoning effort can be controlled via env vars.

## Performance Targets (Guidance)
- Warm p95: low tens of seconds depending on model and load.
- Cold starts: longer; free tiers may hibernate.

## Error Handling
Errors return JSON:
```
{"detail":"..."}
```
Common causes:
- Missing or invalid `OPENAI_API_KEY`
- Model parameter mismatch or provider errors

## Environment Variables
- `OPENAI_API_KEY`: required API key
- `OPENAI_MODEL`: model override (default `gpt-5-mini`)
- `PSA_REASONING_EFFORT`: gpt-5 reasoning effort (`minimal`, `low`, `medium`, `high`)
- `PSA_MAX_COMPLETION_TOKENS_GPT5`: gpt-5 completion token budget

## Backward Compatibility
If the upstream model returns `verifiability`, the backend maps it to `evaluability`.
