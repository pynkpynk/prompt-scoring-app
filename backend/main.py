from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import PromptRequest, PromptScore
from .llm_scoring import score_prompt_with_llm

app = FastAPI(title="Prompt Scoring API v1 (LLM powered)")

origins = [
    "http://localhost:3000",
    "https://your-vercel-app.vercel.app",
    "https://pynkpynk-prompt-scoring-app.hf.space",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins, 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/score", response_model=PromptScore)
def score_prompt(req: PromptRequest) -> PromptScore:
    """
    LLMを使って実際にプロンプトを5軸で採点するエンドポイント。
    """
    try:
        result = score_prompt_with_llm(req.prompt)
        return result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to score prompt via LLM: {e}",
        )

