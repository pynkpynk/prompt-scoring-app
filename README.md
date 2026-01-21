# Prompt Scoring App  

**Language:** English | [日本語](README.ja.md)

_An AI-powered prompt evaluation tool for everyone_

**Prompt Scoring App** is a practical, production-minded prompt engineering portfolio project that evaluates prompts with an LLM in a single request.

It uses the OpenAI API to score prompts across six metrics—**Clarity**, **Specificity**, **Constraints**, **Intent**, **Safety**, and **Evaluability**—and generates improved prompts in **Japanese**, **English**, and **French**.

---

## Demo  
https://prompt-scoring-app.vercel.app/

---

## Features

### LLM-powered scoring
- Scores on a fine-grained **0–100** scale (10 internal scoring layers)
- Stable scoring powered by **ChatGPT (GPT-5-mini)**
- The **overall** score is a **holistic score** determined by the LLM—not a simple average of the six metrics

### Multilingual support (Japanese / English / French)
- Feedback can be produced in **Japanese**, **English**, and **French**

### Prompt improvement
- Automatically analyzes issues in the original prompt
- Generates improved prompts (**EN / JA / FR**)
- Ready to use in real-world workflows

---

## Tech Stack

| Layer | Technology |
|------|------------|
| Frontend | HTML / CSS / Vanilla JS |
| UI / Effects | Pixel fonts / Gradient UI / Animation |
| Backend | FastAPI (Python) |
| API | OpenAI ChatCompletion API |
| Hosting | Vercel |
| Package Management | pip / requirements.txt |
| Version Control | Git + GitHub |

---

## Project Structure

```text
prompt_scoring_app/
├── app.py
├── Dockerfile
├── requirements.txt
├── backend/
│   ├── main.py
│   ├── models.py
│   └── llm_scoring.py
└── frontend/
    ├── index.html
    ├── style.css
    └── app.js
````

---

## What This App Does

Prompt Scoring App evaluates a prompt as **instructions for an LLM** and returns scores, feedback, and an improved prompt. It uses six metrics (including **evaluability**) and supports **EN / JA / FR** outputs.

---

## Quickstart (Local)

### Set your API key

```bash
export OPENAI_API_KEY="your_key_here"
```

### Run the backend API

```bash
uvicorn backend.main:app --reload --port 8000
```

### Health check

```bash
curl -s http://localhost:8000/health
```

### Score a prompt

```bash
curl -s http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test prompt","lang":"en"}'
```

### Assert the response has 13 keys (including evaluability)

```bash
curl -s http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test prompt","lang":"en"}' | \
  python -c 'import json,sys; d=json.load(sys.stdin); assert len(d)==13 and "evaluability" in d; print("ok")'
```

---

## Quickstart (Docker)

### Build and run

```bash
docker build -t prompt-scoring-app .
docker run --rm -p 7860:7860 -e OPENAI_API_KEY="your_key_here" prompt-scoring-app
```

### Health check

```bash
curl -s http://localhost:7860/health
```

### Score a prompt

```bash
curl -s http://localhost:7860/score \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test prompt","lang":"en"}'
```

---

## Production (Render)

### Base URL

[https://prompt-scoring-app.onrender.com](https://prompt-scoring-app.onrender.com)

### Health check

```bash
curl -s https://prompt-scoring-app.onrender.com/health
```

### Score a prompt

```bash
curl -s https://prompt-scoring-app.onrender.com/score \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test prompt","lang":"en"}'
```

---

## API Contract

### GET /health

**Response**

```json
{"status":"ok"}
```

### POST /score

**Request body**

```json
{"prompt":"...","lang":"en"}
```

* `lang` is optional
* Supported values: `en`, `ja`, `fr` (defaults to `en`)

**Response schema (13 keys, including evaluability)**

```json
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

Non-target language fields may be empty strings.

---

## Observability Headers

The API returns timing and model metadata via headers (case-insensitive):

* `X-PSA-MODEL`: model name
* `X-PSA-IN_TOKENS`: input token count
* `X-PSA-OUT_TOKENS`: output token count
* `X-PSA-TOTAL_TOKENS`: total token count
* `X-PSA-CACHE`: `HIT` or `MISS`
* `X-PSA-LLM_MS`: LLM duration (ms)
* `X-PSA-TOTAL_MS`: total request time (ms)
* `X-PSA-REQID`: request id
* `X-PSA-LANG`: requested language

---

## Caching Behavior

The in-process cache is keyed on `(prompt + lang + model + prompt_version)`. Identical inputs should return `X-PSA-CACHE: HIT` with **0 tokens** and near-zero `X-PSA-LLM_MS`.

---

## Troubleshooting

* **Cold starts / 503**: The first request may return **503** or take longer. Retry after a few seconds.
* **Latency**: LLM scoring can take tens of seconds on cold starts; warm requests should be faster.

---

## Security

* Never paste `OPENAI_API_KEY` into logs or commit history.
* Use environment variables or Render Secrets.
* If a key is ever exposed, rotate it immediately.

---

## Author

* **Koki Sasaki**
* LinkedIn: [https://www.linkedin.com/in/koki-sasaki-89ba43325/]

