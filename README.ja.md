# Prompt Scoring App
LLMによるプロンプト評価、スコアリング、改善提案を行うアプリです。

日本語 | [English](README.md)

## デモ
https://prompt-scoring-app.vercel.app/

## 特徴
- 6指標（clarity, specificity, constraints, intent, safety, evaluability）でスコアリング
- 指定言語（EN/JA/FR）でフィードバックと改善プロンプトを返却
- 目的言語以外のフィールドは空文字で返却し、トークンを節約

## 技術スタック
- Frontend: HTML / CSS / Vanilla JS
- Backend: FastAPI (Python)
- LLM: OpenAI Chat Completions（GPT 5.1 mini）
- Hosting: Hugging Face Spaces, Render
- Container: Docker

## プロジェクト構成
```
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
```

## ⚡ クイックスタート
### Local
1) APIキーを設定:
```
export OPENAI_API_KEY="your_key_here"
```
2) バックエンドAPIを起動:
```
uvicorn backend.main:app --reload --port 8000
```
3) ヘルスチェック:
```
curl -s http://localhost:8000/health
```
4) スコア実行:
```
curl -s http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test prompt","lang":"en"}'
```
5) 13キー確認（evaluability含む）:
```
curl -s http://localhost:8000/score \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test prompt","lang":"en"}' | \
  python -c 'import json,sys; d=json.load(sys.stdin); assert len(d)==13 and "evaluability" in d; print("ok")'
```

### Docker
ビルド & 起動:
```
docker build -t prompt-scoring-app .
docker run --rm -p 7860:7860 -e OPENAI_API_KEY="your_key_here" prompt-scoring-app
```
ヘルスチェック:
```
curl -s http://localhost:7860/health
```
スコア実行:
```
curl -s http://localhost:7860/score \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test prompt","lang":"en"}'
```

### Production (Render)
Base URL:
```
https://prompt-scoring-app.onrender.com
```
ヘルスチェック:
```
curl -s https://prompt-scoring-app.onrender.com/health
```
スコア実行:
```
curl -s https://prompt-scoring-app.onrender.com/score \
  -H "Content-Type: application/json" \
  -d '{"prompt":"test prompt","lang":"en"}'
```

## API概要
- GET `/health` → `{"status":"ok"}`
- POST `/score` → 13キーのJSONを返却（スコア・コメント・改善プロンプト）
- 詳細仕様: `docs/SPEC.md`

## 観測用ヘッダー
以下のヘッダーでメタ情報を返却（大文字小文字は区別されません）:
- X-PSA-MODEL
- X-PSA-IN_TOKENS
- X-PSA-OUT_TOKENS
- X-PSA-TOTAL_TOKENS
- X-PSA-CACHE
- X-PSA-LLM_MS
- X-PSA-TOTAL_MS
- X-PSA-REQID
- X-PSA-LANG

## キャッシュ挙動
キャッシュキーは `(prompt + lang + model + prompt_version)`。同一入力は `X-PSA-CACHE: HIT`、トークンは0、`X-PSA-LLM_MS`はほぼ0になります。

## トラブルシューティング
- Cold start / 503: 最初のリクエストで503や遅延が発生する場合があります。その場合は数秒後に再試行してください。
- レイテンシ: コールドスタート時は数十秒かかることがあります。ウォーム状態では短くなります。

## セキュリティ
- `OPENAI_API_KEY`をログや履歴に残さないでください。
- 環境変数やRender Secretsを利用してください。
- 露出した場合は即時にキーをローテーションしてください。

## Author
- Koki Sasaki
- LinkedIn: https://www.linkedin.com/in/koki-sasaki-89ba43325/
