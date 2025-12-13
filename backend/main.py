from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from typing import Optional

from .models import PromptRequest, PromptScore
from .llm_scoring import score_prompt_with_llm

app = FastAPI(title="Prompt Scoring API v1 (LLM powered)")

@app.get("/")
def read_root():
    return {"status": "ok."}

origins = [
    "http://localhost:3000",
    "https://prompt-scoring-app.vercel.app",
    "https://pynkpynk-prompt-scoring-app.hf.space",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}


class PromptRequestWithLang(PromptRequest):
    lang: Optional[str] = None


@app.post("/score", response_model=PromptScore)
def score_prompt(req: PromptRequestWithLang) -> PromptScore:
    """
    LLMを使って実際にプロンプトを5軸で採点するエンドポイント。
    """
    try:
        lang = req.lang if req.lang in ("ja", "en") else None

        try:
            result = score_prompt_with_llm(req.prompt, lang=lang)
        except TypeError:
            # score_prompt_with_llm がまだ lang を受け取れない旧実装の場合
            result = score_prompt_with_llm(req.prompt)

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to score prompt via LLM: {e}",
        )
