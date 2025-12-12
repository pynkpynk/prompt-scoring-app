// ===== API ベースURLを環境ごとに切り替え =====
const RENDER_API_BASE = "https://prompt-scoring-app.onrender.com";

const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000" // ローカル開発用（FastAPI を :8000 で起動している前提）
    : RENDER_API_BASE;        // 本番環境用

// デバッグ用（Console から確認）
window.API_BASE = API_BASE;

// ===== Matrix Rain ローダー HTML =====
function createMatrixOverlayHTML() {
  return `
    <div class="matrix-overlay" aria-label="Scoring in progress">
      <div class="matrix-rain-layer js-matrix-rain"></div>
      <p class="matrix-label">Scoring in progress… / 採点中…</p>
    </div>
  `;
}

// ===== Matrix Rain 生成 =====
function buildMatrixRain(container, opts = {}) {
  if (!container) return;

  const {
    columns = 34,
    density = 28,
    jpWeight = 0.5,
  } = opts;

  const jpChars = ["採", "点", "中"];
  const enChars = "SCORING IN PROGRESS".split("");
  const extra = "01|:_-+*/<>[]{}$#@".split("");

  container.innerHTML = "";

  for (let i = 0; i < columns; i++) {
    const col = document.createElement("div");
    col.className = "matrix-col";

    // 奥行きランダム
    col.style.left = `${Math.random() * 100}%`;
    col.style.animationDuration = `${rand(2400, 6200)}ms`;
    col.style.animationDelay = `${-rand(0, 3000)}ms`;
    col.style.fontSize = `${randFloat(11, 18)}px`;
    col.style.opacity = randFloat(0.3, 0.95);
    col.style.filter = `blur(${randFloat(0, 1.6)}px)`;

    for (let j = 0; j < density; j++) {
      const span = document.createElement("span");
      span.className = "matrix-ch";
      if (j === 0) span.classList.add("is-head");

      const r = Math.random();
      if (r < jpWeight) {
        span.textContent = jpChars[Math.floor(Math.random() * jpChars.length)];
      } else if (r < 0.85) {
        span.textContent = enChars[Math.floor(Math.random() * enChars.length)];
      } else {
        span.textContent = extra[Math.floor(Math.random() * extra.length)];
      }

      col.appendChild(span);
    }

    container.appendChild(col);
  }
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}


// ===== APIレスポンスを統一フォーマットに変換する =====
function normalizeResponse(raw) {
  const root = raw.scores || raw;

  const clarity = root.clarity ?? root.Clarity ?? 0;
  const specificity = root.specificity ?? root.Specificity ?? 0;
  const constraints = root.constraints ?? root.Constraints ?? 0;
  const intent = root.intent ?? root.Intent ?? 0;
  const safety = root.safety ?? root.Safety ?? 0;

  const overallRaw = root.overall ?? root.Overall;
  const overall =
    overallRaw != null
      ? overallRaw
      : Math.round((clarity + specificity + constraints + intent + safety) / 5);

  const commentJa = raw.comment_ja ?? raw.comment ?? "";
  const commentEn = raw.comment_en ?? "";
  const improvedJa = raw.improved_prompt_ja ?? "";
  const improvedEn = raw.improved_prompt_en ?? "";

  return {
    clarity,
    specificity,
    constraints,
    intent,
    safety,
    overall,
    commentJa,
    commentEn,
    improvedJa,
    improvedEn,
    raw,
  };
}

// ===== スコア値に応じてクラス名を返す（色分け用） =====
// 0–39: 赤, 40–79: 白, 80–100: 緑
function getScoreClass(score) {
  if (score <= 39) return "score-low";
  if (score <= 79) return "score-mid";
  return "score-high";
}

// ===== 1つのスコアをカウントアップ表示する（数字ルーレット風） =====
function animateScore(element, duration = 1200) {
  return new Promise((resolve) => {
    const target = Number(element.dataset.target ?? "0");
    const start = performance.now();

    function frame(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      const current = Math.floor(target * eased);
      element.textContent = current;

      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        element.textContent = target;
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

// ===== 全スコアを順番にアニメーションさせる =====
async function animateScoresSequential(container) {
  const nodes = Array.from(container.querySelectorAll(".js-score"));

  const normalNodes = nodes.slice(0, 5); // 各軸
  const overallNode = nodes[5];          // Overall

  for (const node of normalNodes) {
    await animateScore(node, 1100);
  }

  if (overallNode) {
    overallNode.classList.add("overall-animating");
    await animateScore(overallNode, 1800);
    setTimeout(() => {
      overallNode.classList.remove("overall-animating");
    }, 800 * 3);
  }
}

// ===== Start ボタンのクリック処理 =====
document.getElementById("send-btn").addEventListener("click", async () => {
  const prompt = document.getElementById("prompt-input").value;
  const resultDiv = document.getElementById("result");

  if (!prompt.trim()) {
    resultDiv.innerHTML =
      "<p>プロンプトを入力してください。 / Enter your prompt.</p>";
    return;
  }
  
// ===== ローディング表示（Matrix Rain overlay） =====
resultDiv.innerHTML = createMatrixOverlayHTML();

// 雨を生成
const rainRoot = resultDiv.querySelector(".js-matrix-rain");
buildMatrixRain(rainRoot, {
  columns: 34,
  density: 28,
  jpWeight: 0.5,
});

  // ★★★ startedAt を定義 ★★★
  const startedAt = performance.now();
  const minShowMs = 300;

  try {
    const response = await fetch(`${API_BASE}/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

    const elapsed = performance.now() - startedAt;
if (elapsed < minShowMs) {
  await new Promise((r) => setTimeout(r, minShowMs - elapsed));
}

    if (!response.ok) {
      const errText = await response.text();
      resultDiv.innerHTML = `
        <p>サーバー側でエラーが発生しました。 / Server returned an error.</p>
        <pre>${errText}</pre>
      `;
      return;
    }

    const rawData = await response.json();
    const data = normalizeResponse(rawData);

// overlay をフェードアウトして削除
const overlay = resultDiv.querySelector(".matrix-overlay");
if (overlay) {
  overlay.classList.add("fade-out");
  setTimeout(() => overlay.remove(), 400);
}

    // ===== 結果カード =====
    resultDiv.innerHTML = `
      <h2>スコア結果 / Score Results</h2>

      <div class="score-grid">
        <div class="score-item">
          <div class="score-label">Clarity（明瞭性）</div>
          <div class="score-value ${getScoreClass(
            data.clarity
          )} js-score" data-target="${data.clarity}">0</div>
        </div>

        <div class="score-item">
          <div class="score-label">Specificity（具体性）</div>
          <div class="score-value ${getScoreClass(
            data.specificity
          )} js-score" data-target="${data.specificity}">0</div>
        </div>

        <div class="score-item">
          <div class="score-label">Constraints（制約性）</div>
          <div class="score-value ${getScoreClass(
            data.constraints
          )} js-score" data-target="${data.constraints}">0</div>
        </div>

        <div class="score-item">
          <div class="score-label">Intent（意図性）</div>
          <div class="score-value ${getScoreClass(
            data.intent
          )} js-score" data-target="${data.intent}">0</div>
        </div>

        <div class="score-item">
          <div class="score-label">Safety（安全性）</div>
          <div class="score-value ${getScoreClass(
            data.safety
          )} js-score" data-target="${data.safety}">0</div>
        </div>
      </div>

      <div class="overall-wrapper">
        <div class="overall-card">
          <div class="overall-label">
            Overall（総合評価）
          </div>
          <div class="overall-value ${getScoreClass(
            data.overall
          )} js-score" data-target="${data.overall}">0</div>
        </div>
      </div>

      <h3>コメント（日本語）</h3>
      <pre>${data.commentJa || "（コメントがありません）"}</pre>

      <h3>Comment (English)</h3>
      <pre>${data.commentEn || "(No English commentary provided.)"}</pre>

      <h3>改善プロンプト（日本語）</h3>
      <pre>${data.improvedJa || "（改善プロンプトがありません）"}</pre>

      <h3>Improved Prompt (English)</h3>
      <pre>${data.improvedEn || "(No improved English prompt provided.)"}</pre>

      <details style="margin-top:12px;">
        <summary>Debug: raw JSON</summary>
        <pre>${JSON.stringify(rawData, null, 2)}</pre>
      </details>
    `;

    await animateScoresSequential(resultDiv);
  } catch (err) {
    console.error(err);
    resultDiv.innerHTML = `
      <p>通信エラーが発生しました。 / Network error occurred.</p>
      <pre>${String(err)}</pre>
    `;
  }
});

