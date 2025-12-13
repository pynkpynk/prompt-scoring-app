from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from typing import Optional, Literal
from pydantic import BaseModel

from .models import PromptScore
from .llm_scoring import score_prompt_with_llm

class PromptRequest(BaseModel):
    prompt: str
    lang: Optional[Literal["ja", "en", "fr"]] = "en"

app = FastAPI(title="Prompt Scoring API v1 (LLM powered)")

@app.get("/")
def read_root():
    return {"status": "ok."}

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


@app.post("/score", response_model=PromptScore)
def score_prompt(req: PromptRequest, response: Response) -> PromptScore:
    """
    LLMを使って実際にプロンプトを5軸で採点するエンドポイント。
    """
    try:
        response.headers["X-PSA-LANG"] = str(req.lang or "")

        result = score_prompt_with_llm(req.prompt, lang=req.lang)

        # スキーマ互換のため「未使用言語」は空文字で返す
        if req.lang == "ja":
            result.comment_en = ""
            result.improved_prompt_en = ""
            if hasattr(result, "comment_fr"):
                result.comment_fr = ""
            if hasattr(result, "improved_prompt_fr"):
                result.improved_prompt_fr = ""

        elif req.lang == "fr":
            # 互換救済：もしFRが comment_en / improved_prompt_en に入ってきたら fr に移す
            if hasattr(result, "comment_fr"):
                if (result.comment_fr or "") == "" and (getattr(result, "comment_en", "") or "") != "":
                    result.comment_fr = result.comment_en
            if hasattr(result, "improved_prompt_fr"):
                if (result.improved_prompt_fr or "") == "" and (getattr(result, "improved_prompt_en", "") or "") != "":
                    result.improved_prompt_fr = result.improved_prompt_en

            result.comment_en = ""
            result.improved_prompt_en = ""
            result.comment_ja = ""
            result.improved_prompt_ja = ""

        else:
            # en
            result.comment_ja = ""
            result.improved_prompt_ja = ""
            if hasattr(result, "comment_fr"):
                result.comment_fr = ""
            if hasattr(result, "improved_prompt_fr"):
                result.improved_prompt_fr = ""

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to score prompt via LLM: {e}",
        )
