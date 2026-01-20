from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from backend.models import PromptRequest, PromptScore
from backend.llm_scoring import score_prompt_with_llm

app = FastAPI(title="Prompt Scoring API (HF Spaces)")

# CORS 設定（今回はデモなので * ）
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="frontend"), name="static")

@app.get("/")
def read_index():
    return FileResponse("frontend/index.html")


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/score", response_model=PromptScore)
def score_prompt(req: PromptRequest, response: Response) -> PromptScore:
    """LLM を使ってプロンプトを採点するエンドポイント"""
    try:
        result, usage, cache_hit, model_name = score_prompt_with_llm(req.prompt)
        response.headers["X-PSA-MODEL"] = str(model_name)
        response.headers["X-PSA-IN_TOKENS"] = str(usage.get("prompt_tokens", 0))
        response.headers["X-PSA-OUT_TOKENS"] = str(usage.get("completion_tokens", 0))
        response.headers["X-PSA-TOTAL_TOKENS"] = str(usage.get("total_tokens", 0))
        response.headers["X-PSA-CACHE"] = "HIT" if cache_hit else "MISS"
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
