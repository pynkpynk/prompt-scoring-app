from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from typing import Optional, Literal
from pydantic import BaseModel

from .models import PromptRequest, PromptScore
from .llm_scoring import score_prompt_with_llm

class PromptRequest(BaseModel):
    prompt: str
    lang: Optional[Literal["ja", "en"]] = "en"

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
def score_prompt(req: PromptRequest, response: Response) -> PromptScore:
    """
    LLMを使って実際にプロンプトを5軸で採点するエンドポイント。
    """
    try:
        # ★ ここで「バックエンドが受け取った lang」をヘッダに載せて可視化
        response.headers["X-PSA-LANG"] = str(req.lang or "")

        result = score_prompt_with_llm(req.prompt, lang=req.lang)

        # ★ バックエンド側で“確実に”片言語を空にする（ここが効けば Debug JSON も空になる）
        if req.lang == "en":
            result.comment_ja = ""
            result.improved_prompt_ja = ""
        elif req.lang == "ja":
            result.comment_en = ""
            result.improved_prompt_en = ""

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to score prompt via LLM: {e}",
        )
