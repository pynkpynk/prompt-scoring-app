// ===== API ベースURLを環境ごとに切り替え =====
const RENDER_API_BASE = "https://prompt-scoring-app.onrender.com";

const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000" // ローカル開発用（FastAPI を :8000 で起動している前提）
    : RENDER_API_BASE;        // 本番環境用

// デバッグ用（Console から確認）
window.API_BASE = API_BASE;

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

    // ===== Matrix Rain ローダー（JS生成） =====

function createMatrixOverlayHTML() {
  return `
    <div class="matrix-overlay" aria-label="Scoring in progress">
      <div class="matrix-rain-layer js-matrix-rain"></div>
      <p class="matrix-label">Scoring in progress… / 採点中…</p>
    </div>
  `;
}

function buildMatrixRain(container, opts = {}) {
  const {
    columns = 34,          // 列の本数（PCは30〜45くらいが気持ちいい）
    density = 26,          // 1列あたりの文字数（多いほど密）
    jpWeight = 0.45,       // "採点中"寄りにする割合
  } = opts;

  const phrases = ["採点中", "SCORING IN PROGRESS"];
  const extra = "01|:_-+*/<>[]{}()$#@"; // 少し混ぜるとMatrixっぽさ増す

  // containerの中身を一旦クリア（再生成に対応）
  container.innerHTML = "";

  // 画面幅に応じて列数を自動調整したい場合はここで補正してもOK
  const colCount = columns;

  for (let i = 0; i < colCount; i++) {
    const col = document.createElement("div");
    col.className = "matrix-col";

    // ===== 列ごとのランダム変数 =====
    const x = Math.random() * 100;                 // 横位置 %
    const dur = rand(2400, 6200);                  // 落下速度（ms）
    const delay = -rand(0, 3000);                  // 負のdelayで既に降ってる感
    const size = randFloat(11, 18);                // フォントサイズ
    const alpha = randFloat(0.25, 0.95);           // 透明度（奥行き）
    const glow = randFloat(0.2, 1.0);              // 光量（奥行き）
    const blur = randFloat(0, 1.6);                // ぼかし（遠景）

    col.style.setProperty("--x", `${x}%`);
    col.style.setProperty("--dur", `${dur}ms`);
    col.style.setProperty("--delay", `${delay}ms`);
    col.style.setProperty("--size", `${size}px`);
    col.style.setProperty("--alpha", alpha.toFixed(3));
    col.style.setProperty("--glow", glow.toFixed(3));
    col.style.setProperty("--blur", `${blur}px`);

    // ===== 文字を縦に積む（採点中と英語を増やす） =====
    // 1列に複数フレーズが繰り返し混ざるようにする
    const frag = document.createDocumentFragment();

    for (let j = 0; j < density; j++) {
      const span = document.createElement("span");
      span.className = "matrix-ch";

      // 先頭付近は明るくして“ヘッド”感
      if (j < 2) span.classList.add("is-head");

      span.textContent = ch;
      frag.appendChild(span);
    }

    col.appendChild(frag);
    container.appendChild(col);
  }
}

function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}

// overlay をフェードアウトして削除
const overlay = document.querySelector(".matrix-overlay");
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

