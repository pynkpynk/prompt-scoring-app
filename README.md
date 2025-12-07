---
title: Prompt Scoring App
emoji: 📝
colorFrom: purple
colorTo: indigo
sdk: docker
pinned: false
app_file: app.py
---

# 🔍 Prompt Scoring App  
_An AI-powered Prompt Evaluation Tool for everyone_

"Prompt Scoring App"は、LLM によるプロンプト評価を一括で行うための  
本格的・実用的な Prompt Engineering ポートフォリオプロジェクトです。

本アプリは OpenAI API を利用し、"明確さ (Clarity)"、"具体性 (Specificity)"、"制約 (Constraints)"、"意図の明確さ (Intent)"、"安全性 (Safety)"  
の5指標に基づいてプロンプトを採点し、改善されたプロンプト（日本語・英語の両方）を生成します。

さらに、スコアリング結果はゲーミフィケーションされたUI + アニメーション付きで可視化されており、  
Prompt Engineer のポートフォリオとして他者との差別化につながる構成となっています。

---

# 🚀 Demo  
Hugging Face Space で実際に動作を試せます：  
👉 https://huggingface.co/spaces/pynkpynk/prompt-scoring-app  

---

# 🎯 Features（特徴）

## 🔸 LLM による本格スコアリング
- 0〜100 の細かなグラデーションで評価(内部スコアリングレイヤー10層)
- ChatGPT（GPT-5-mini）を利用して安定した採点  
- 「overall スコア」は 5 指標の単純平均ではなく、LLMが総合的に判断する “Holistic Score”

---

## 🔸 バイリンガル対応（日本語／英語）
- 出力されるフィードバックは英語と日本語の両方

---

## 🔸 プロンプト改善機能
- 元のプロンプトの問題点を自動分析  
- 改善済みプロンプト（英語／日本語）を生成 
- 実務でそのまま利用可能

---

## 🔸 近未来 UI（アニメーション＆配色）
- ピクセルフォント + 青/紫のグラデーションデザイン  
- スコア表示には ルーレット式カウントアップアニメーション 
- Overall スコアには特別エフェクト  
- モダンな SPA 風 UI

---

# 📁 Tech Stack（技術構成）

| Layer | Technology |
|------|------------|
| Frontend | HTML / CSS / Vanilla JS |
| UI/Effects | Pixel fonts / Gradient UI / Animation |
| Backend | FastAPI (Python) |
| API | OpenAI ChatCompletion API |
| Hosting | Hugging Face Spaces |
| Package Mgmt | pip / requirements.txt |
| Version Control | Git + GitHub |

---

# 🧩 Project Structure

prompt_scoring_app/
├── app.py
├── backend/
│ ├── main.py
│ ├── models.py
│ └── llm_scoring.py
├── frontend/
│ ├── index.html
│ ├── style.css
│ └── script.js
├── requirements.txt
└── README.md

---

# 🙌 Author

- Koki Sasaki 
- LinkedIn:linkedin.com/in/koki-sasaki-89ba43325

---  
