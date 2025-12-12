// ================================
//  API BASE
// ================================
const RENDER_API_BASE = "https://prompt-scoring-app.onrender.com";

const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000"
    : RENDER_API_BASE;

// （任意）デバッグ用
window.API_BASE = API_BASE;

// ================================
//  Matrix Overlay (HTML)
// ================================
function createMatrixOverlayHTML() {
  return `
    <div class="matrix-overlay" aria-label="Scoring in progress">
      <div class="matrix-rain-layer js-matrix-rain"></div>
      <p class="matrix-label">SCORING IN PROGRESS / 採点中</p>
    </div>
  `;
}

// ================================
//  Matrix Rain (Build)
//  - base text: "採点中" / "SCORINGINPROGRESS"
//  - glitch: handled by startMatrixGlitch()
// ================================
function buildMatrixRain(container, opts = {}) {
  if (!container) return;

  const {
    columns = 34,
    density = 28,
    jpWeight = 0.5,
  } = opts;

  const jpBase = "採点中";
  const enBase = "SCORINGINPROGRESS"; // スペースは省略（雨で見えやすい）
  container.innerHTML = "";

  for (let i = 0; i < columns; i++) {
    const col = document.createElement("div");
    col.className = "matrix-col";

    // 列タイプ（JP/EN）
    const isJP = Math.random() < jpWeight;
    const base = isJP ? jpBase : enBase;

    // CSS変数（あなたのCSSに合わせる）
    const x = Math.random() * 100;
    const dur = rand(5200, 8200);
    const delay = -rand(0, 3000);
    const size = randFloat(11, 18);
    const alpha = randFloat(0.25, 0.95);
    const glow = randFloat(0.25, 1.25);
    const blur = randFloat(0, 1.6);

    col.style.setProperty("--x", `${x}%`);
    col.style.setProperty("--dur", `${dur}ms`);
    col.style.setProperty("--delay", `${delay}ms`);
    col.style.setProperty("--size", `${size}px`);
    col.style.setProperty("--alpha", alpha.toFixed(3));
    col.style.setProperty("--glow", glow.toFixed(3));
    col.style.setProperty("--blur", `${blur.toFixed(2)}px`);

    // 位相ずらし（同じ列でも開始文字が揃いすぎないように）
    const offset = rand(0, base.length - 1);

    for (let j = 0; j < density; j++) {
      const span = document.createElement("span");
      span.className = "matrix-ch";
      if (j === 0 || j === 1) span.classList.add("is-head");

      const baseChar = base[(j + offset) % base.length];
      span.textContent = baseChar;
      span.dataset.base = baseChar; // 後でグリッチから戻す用

      col.appendChild(span);
    }

    container.appendChild(col);
  }
}

// ================================
//  Matrix Glitch (Start/Stop)
//  - “採点中 / SCORING…” の文字の一部が一瞬だけ記号に置換→元に戻る
//  - 戻す文字は span.dataset.base を参照
// ================================
function startMatrixGlitch(container, opts = {}) {
  if (!container) return () => {};

  const {
    tickMs = 110,        // グリッチ発生の刻み
    perTick = 8,         // 1回でグリッチさせる文字数（増やすと賑やか）
    glitchMinMs = 55,    // グリッチ持続（最短）
    glitchMaxMs = 140,   // グリッチ持続（最長）
  } = opts;

  const glyphs = "01|:_-+*/<>[]{}$#@%&!?".split("");
  const spans = () => Array.from(container.querySelectorAll(".matrix-ch"));

  let alive = true;
  const active = new WeakSet(); // 連続で同じspanを荒らしすぎない

  function randomGlyph() {
    return glyphs[Math.floor(Math.random() * glyphs.length)];
  }

  function glitchOne(span) {
    if (!span || active.has(span)) return;
    active.add(span);

    const base = span.dataset.base ?? span.textContent ?? "";
    span.textContent = randomGlyph();
    span.classList.add("is-glitch");

    const ms = rand(glitchMinMs, glitchMaxMs);
    setTimeout(() => {
      // stop後にDOMが消えてても安全に抜ける
      if (!alive) return;
      span.textContent = base;
      span.classList.remove("is-glitch");
      active.delete(span);
    }, ms);
  }

  const timer = setInterval(() => {
    const all = spans();
    if (!alive || all.length === 0) return;

    // ランダムに選ぶ（同一列で連続2文字を崩すと“部分グリッチ感”が出る）
    for (let k = 0; k < perTick; k++) {
      const idx = rand(0, all.length - 1);
      glitchOne(all[idx]);

      // 30%くらいの確率で「隣」もグリッチ（部分的に崩れる感じ）
      if (Math.random() < 0.3 && idx + 1 < all.length) {
        glitchOne(all[idx + 1]);
      }
    }
  }, tickMs);

  // stop関数
  return () => {
    alive = false;
    clearInterval(timer);

    // 可能な限り元に戻す
    const all = spans();
    for (const s of all) {
      const base = s.dataset.base;
      if (base != null) s.textContent = base;
      s.classList.remove("is-glitch");
    }
  };
}

// ================================
//  Utils
// ================================
function rand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return Math.random() * (max - min) + min;
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ================================
//  APIレスポンス正規化
// ================================
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

// ================================
//  スコア表示アニメ
// ================================
function getScoreClass(score) {
  if (score <= 39) return "score-low";
  if (score <= 79) return "score-mid";
  return "score-high";
}

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

      if (progress < 1) requestAnimationFrame(frame);
      else {
        element.textContent = target;
        resolve();
      }
    }

    requestAnimationFrame(frame);
  });
}

async function animateScoresSequential(container) {
  const nodes = Array.from(container.querySelectorAll(".js-score"));
  const normalNodes = nodes.slice(0, 5);
  const overallNode = nodes[5];

  for (const node of normalNodes) {
    await animateScore(node, 1100);
  }

  if (overallNode) {
    overallNode.classList.add("overall-animating");
    await animateScore(overallNode, 1800);
    setTimeout(() => overallNode.classList.remove("overall-animating"), 2400);
  }
}

// ================================
//  Click handler
// ================================
document.getElementById("send-btn").addEventListener("click", async () => {
  const prompt = document.getElementById("prompt-input").value;
  const resultDiv = document.getElementById("result");
  const btn = document.getElementById("send-btn");

  if (!prompt.trim()) {
    resultDiv.innerHTML =
      "<p>プロンプトを入力してください。 / Enter your prompt.</p>";
    return;
  }

  // ローディング表示
  resultDiv.innerHTML = createMatrixOverlayHTML();

  const rainRoot = resultDiv.querySelector(".js-matrix-rain");
  buildMatrixRain(rainRoot, { columns: 34, density: 28, jpWeight: 0.5 });

  // グリッチ開始（stop関数を保持）
  const stopGlitch = startMatrixGlitch(rainRoot, {
    tickMs: 110,
    perTick: 9,
    glitchMinMs: 55,
    glitchMaxMs: 140,
  });

  // ボタン連打防止（任意）
  btn.disabled = true;

  const startedAt = performance.now();
  const minShowMs = 300;

  try {
    const response = await fetch(`${API_BASE}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    // ローダーが一瞬で消えないように
    const elapsed = performance.now() - startedAt;
    if (elapsed < minShowMs) await sleep(minShowMs - elapsed);

    // ローダー停止（先に止める：DOM差し替えで事故らない）
    stopGlitch();

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

    // overlay をフェードアウト → 少し待ってから結果に差し替え
    const overlay = resultDiv.querySelector(".matrix-overlay");
    if (overlay) {
      overlay.classList.add("fade-out");
      await sleep(260);
    }

    // 結果カード
    resultDiv.innerHTML = `
      <h2>スコア結果 / Score Results</h2>

      <div class="score-grid">
        <div class="score-item">
          <div class="score-label">Clarity（明瞭性）</div>
          <div class="score-value ${getScoreClass(data.clarity)} js-score" data-target="${data.clarity}">0</div>
        </div>

        <div class="score-item">
          <div class="score-label">Specificity（具体性）</div>
          <div class="score-value ${getScoreClass(data.specificity)} js-score" data-target="${data.specificity}">0</div>
        </div>

        <div class="score-item">
          <div class="score-label">Constraints（制約性）</div>
          <div class="score-value ${getScoreClass(data.constraints)} js-score" data-target="${data.constraints}">0</div>
        </div>

        <div class="score-item">
          <div class="score-label">Intent（意図性）</div>
          <div class="score-value ${getScoreClass(data.intent)} js-score" data-target="${data.intent}">0</div>
        </div>

        <div class="score-item">
          <div class="score-label">Safety（安全性）</div>
          <div class="score-value ${getScoreClass(data.safety)} js-score" data-target="${data.safety}">0</div>
        </div>
      </div>

      <div class="overall-wrapper">
        <div class="overall-card">
          <div class="overall-label">Overall（総合評価）</div>
          <div class="overall-value ${getScoreClass(data.overall)} js-score" data-target="${data.overall}">0</div>
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
    // 念のため停止
    try { stopGlitch(); } catch (_) {}
    resultDiv.innerHTML = `
      <p>通信エラーが発生しました。 / Network error occurred.</p>
      <pre>${String(err)}</pre>
    `;
  } finally {
    btn.disabled = false;
  }
});
