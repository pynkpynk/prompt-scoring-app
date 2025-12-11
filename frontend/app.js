// ===== スコア値に応じてクラス名を返す（色分け用） =====
// 0–39: 赤, 40–79: 白, 80–100: 緑
function getScoreClass(score) {
  if (score <= 39) return "score-low";
  if (score <= 79) return "score-mid";
  return "score-high";
}

// ===== API ベースURLを環境ごとに切り替え =====
const RENDER_API_BASE = "https://prompt-scoring-app.onrender.com";

const API_BASE =
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1"
    ? "http://127.0.0.1:8000" // ローカル開発用（FastAPI を :8000 で起動している前提）
    : RENDER_API_BASE;      // 本番環境用

window.API_BASE = API_BASE;// デバッグ用（Console から見えるようにする）

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

  // ローディング表示
  resultDiv.innerHTML = `
    <div class="loader-wrapper">
      <div class="loader-progress" aria-label="Scoring in progress">
        <div class="loader-bar">
          <div class="loader-bar-fill"></div>
        </div>
        <span class="loader-percent js-loader-percent">0%</span>
      </div>
      <p class="loader-text">
        採点中です… 少々お待ちください。/ Scoring in progress… <br />
        Scoring in progress… usually finishes in about 5–10 seconds.
      </p>
    </div>
  `;

   const stopLoaderProgress = startLoaderProgress();

  try {
    const response = await fetch(`${API_BASE}/score`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt }),
    });

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

// ===== ローディング用プログレスバー（疑似進捗） =====
function startLoaderProgress() {
  const bar = document.querySelector(".loader-bar-fill");
  const label = document.querySelector(".js-loader-percent");

  if (!bar || !label) {
    // 何もできないとき用のダミー
    return () => {};
  }

  let progress = 0;
  let stopped = false;
  const start = performance.now();
  const approxDuration = 7000; // 想定完了時間（ms）: 7秒くらいを目安に

  function tick(now) {
    if (stopped) return;

    const elapsed = now - start;
    // 最大90%までゆっくり伸ばしておく（本当の完了タイミングはfetch側で決める）
    const target = Math.min(90, (elapsed / approxDuration) * 100);
    progress = Math.max(progress, target);

    bar.style.width = `${progress}%`;
    label.textContent = `${Math.round(progress)}%`;

    if (progress < 90) {
      requestAnimationFrame(tick);
    }
  }

  requestAnimationFrame(tick);

  // 呼び出し側で「完了時」に呼ぶ
  return () => {
    stopped = true;
    bar.style.width = "100%";
    label.textContent = "100%";
  };
}

// プログレスバーを完了状態に
    stopLoaderProgress();

    if (!response.ok) {
      const errText = await response.text();
      stopLoaderProgress();
      resultDiv.innerHTML = `
        <p>サーバー側でエラーが発生しました。 / Server returned an error.</p>
        <pre>${errText}</pre>
      `;
      return;
    }

    // 結果カード
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
