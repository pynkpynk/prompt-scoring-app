from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from typing import Optional, Literal
from pydantic import BaseModel

from .models import PromptRequest, PromptScore
from .llm_scoring import score_prompt_with_llm

# timing / id / logging
import time
import uuid
import logging

logger = logging.getLogger("psa.timing")

class PromptRequest(BaseModel):
    prompt: str
    lang: Optional[Literal["ja", "en", "fr"]] = "en"

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
    # timings
    t0 = time.perf_counter()
    req_id = uuid.uuid4().hex[:12]

    try:
        response.headers["X-PSA-REQID"] = req_id
        response.headers["X-PSA-LANG"] = str(req.lang or "")

        # t1 = LLM開始（呼び出し直前）
        t1 = time.perf_counter()

        result = score_prompt_with_llm(req.prompt, lang=req.lang)

        # t2 = LLM終了（呼び出し直後）
        t2 = time.perf_counter()

        # スキーマ互換のため「未使用言語」は空文字で返す
        if req.lang == "ja":
            result.comment_en = ""
            result.improved_prompt_en = ""
        else:
            # en / fr は comment_en 側に返す（frは中身をフランス語で生成）
            result.comment_ja = ""
            result.improved_prompt_ja = ""

        # t3 = 返却（return直前）
        t3 = time.perf_counter()

        # headers: relative ms from t0
        def ms(a, b):
            return f"{(b - a) * 1000:.1f}"

        response.headers["X-PSA-T0_MS"] = "0.0"
        response.headers["X-PSA-T1_MS"] = ms(t0, t1)  # 受信→LLM開始
        response.headers["X-PSA-T2_MS"] = ms(t0, t2)  # 受信→LLM終了
        response.headers["X-PSA-T3_MS"] = ms(t0, t3)  # 受信→返却直前

        response.headers["X-PSA-LLM_MS"] = ms(t1, t2)   # LLMに要した時間
        response.headers["X-PSA-POST_MS"] = ms(t2, t3)  # 整形/後処理
        response.headers["X-PSA-TOTAL_MS"] = ms(t0, t3) # 合計

        #logs (server-side)
        logger.info(
            f"req_id={req_id} lang={req.lang} "
            f"t0_t1_ms={ms(t0,t1)} llm_ms={ms(t1,t2)} post_ms={ms(t2,t3)} total_ms={ms(t0,t3)}"
        )

        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to score prompt via LLM: {e}",
        )
