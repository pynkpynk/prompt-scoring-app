from pydantic import BaseModel


class PromptRequest(BaseModel):
    prompt: str


class PromptScore(BaseModel):
    clarity: int
    specificity: int
    constraints: int
    intent: int
    safety: int
    overall: int
    comment_en: str
    comment_ja: str
    comment_fr: str
    improved_prompt_ja: str
    improved_prompt_en: str
    improved_prompt_fr: str
