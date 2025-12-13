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
//  Language Toggle (Optional)
// ================================
let SELECTED_LANG = "en";

// ===== Site-wide i18n helpers (ADDED) =====
const LANG_STORAGE_KEY = "psa_lang";

// (ADDED) FR overrides (only for texts that cannot be derived from " / " or "（）」)
const I18N_OVERRIDES = {
  fr: {
    "スコア結果 / Score Results": "Résultats",
    "Debug: raw JSON": "Débogage : JSON brut",
    "サーバー側でエラーが発生しました。 / Server returned an error.": "Erreur côté serveur.",
    "通信エラーが発生しました。 / Network error occurred.": "Erreur réseau.",
    "プロンプトを入力してください。 / Enter your prompt.": "Veuillez saisir un prompt.",
    "SCORING IN PROGRESS / 採点中": "ÉVALUATION EN COURS",
    "Comment (English)": "Commentaire",
    "Improved Prompt (English)": "Prompt amélioré",
    "Comment": "Commentaire",
    "Improved Prompt": "Prompt amélioré",
    "Overall（総合評価）": "Score global",
    "Clarity（明瞭性）": "Clarté",
    "Specificity（具体性）": "Spécificité",
    "Constraints（制約性）": "Contraintes",
    "Intent（意図性）": "Intention",
    "Safety（安全性）": "Sécurité",
  },
  ja: {
    // subtitle etc. are handled in applyLanguageToStaticUI
  },
  en: {
    // subtitle etc. are handled in applyLanguageToStaticUI
  },
};

function hasJaChars(s) {
  return /[ぁ-んァ-ン一-龯]/.test(String(s || ""));
}

function splitBySlash(text, lang) {
  const s = String(text || "");
  if (!s.includes(" / ")) return s;

  const parts = s.split(" / ").map((p) => p.trim());

  // (ADDED) 3 languages: JP / EN / FR (固定順)
  if (parts.length >= 3) {
    if (lang === "ja") return parts[0];
    if (lang === "en") return parts[1];
    if (lang === "fr") return parts[2];
    return parts[1];
  }

  // 2 languages (legacy): JP / EN or EN / JP
  const left = parts[0];
  const right = parts[1] ?? "";

  const leftJa = hasJaChars(left);
  const rightJa = hasJaChars(right);

  if (leftJa && !rightJa) return lang === "ja" ? left : right;
  if (!leftJa && rightJa) return lang === "ja" ? right : left;

  // 判定できない場合は左=ja想定
  return lang === "ja" ? left : right;
}

function splitByParen(text, lang) {
  const s = String(text || "");
  const m = s.match(/^\s*(.*?)（(.*?)）\s*$/);
  if (!m) return s;
  const outside = (m[1] || "").trim();
  const inside = (m[2] || "").trim();

  // en/ja は既存ロジック、frは辞書に任せる
  if (lang === "ja") return inside;
  return outside;
}

function localizeText(text, lang) {
  const s = String(text || "");

  // (ADDED) exact override (FR etc.)
  const ov = I18N_OVERRIDES?.[lang]?.[s];
  if (ov) return ov;

  // 先に " / " を優先
  if (s.includes(" / ")) return splitBySlash(s, lang);
  // 次に "（ ）"
  if (s.includes("（") && s.includes("）")) return splitByParen(s, lang);

  return text;
}

function selectSideFromHTML(html, lang) {
  const s = String(html || "");
  if (!s.includes(" / ")) return s;

  const parts = s.split(" / ");

  // (ADDED) 3 parts: JP / EN / FR
  if (parts.length >= 3) {
    if (lang === "ja") return parts[0];
    if (lang === "en") return parts[1];
    if (lang === "fr") return parts.slice(2).join(" / ");
    return parts[1];
  }

  // legacy 2 parts
  const leftHTML = parts[0];
  const rightHTML = parts.slice(1).join(" / ");

  const tmp = document.createElement("div");
  tmp.innerHTML = leftHTML;
  const leftText = tmp.textContent || "";

  tmp.innerHTML = rightHTML;
  const rightText = tmp.textContent || "";

  const leftJa = hasJaChars(leftText);
  const rightJa = hasJaChars(rightText);

  if (leftJa && !rightJa) return lang === "ja" ? leftHTML : rightHTML;
  if (!leftJa && rightJa) return lang === "ja" ? rightHTML : leftHTML;

  return lang === "ja" ? leftHTML : rightHTML;
}

function applyLanguageToStaticUI(lang) {
  if (!lang) return;

  document.documentElement.lang = lang;

  const subtitle = document.querySelector(".app-subtitle");
  if (subtitle) {
    if (!subtitle.dataset.i18nHtml) subtitle.dataset.i18nHtml = subtitle.innerHTML;

    // (ADDED) subtitle is single-language in HTML → translate here
    if (lang === "ja") {
      subtitle.innerHTML =
        'あなたのプロンプトを <span>5軸スコアリング</span> ＋ フィードバックと改善プロンプト';
    } else if (lang === "fr") {
      subtitle.innerHTML =
        'Évaluez vos prompts sur <span>5 dimensions</span> avec un retour et un prompt amélioré';
    } else {
      subtitle.innerHTML = subtitle.dataset.i18nHtml;
    }
  }

  const label = document.querySelector(".label-title");
  if (label) {
    if (!label.dataset.i18nText) label.dataset.i18nText = label.textContent;
    label.textContent = localizeText(label.dataset.i18nText, lang);
  }

  const ta = document.getElementById("prompt-input");
  if (ta) {
    if (!ta.dataset.i18nPlaceholder) ta.dataset.i18nPlaceholder = ta.getAttribute("placeholder") || "";
    ta.setAttribute("placeholder", localizeText(ta.dataset.i18nPlaceholder, lang));
  }

  const btn = document.getElementById("send-btn");
  if (btn) {
    if (!btn.dataset.i18nText) btn.dataset.i18nText = btn.textContent;
    if (lang === "ja") btn.textContent = "Start!";
    else if (lang === "fr") btn.textContent = "Démarrer!";
    else btn.textContent = btn.dataset.i18nText;
  }
}

function localizeResultCard(root, lang) {
  if (!root || !lang) return;

  const targets = root.querySelectorAll("h2, h3, p, summary, .score-label, .overall-label, .matrix-label");
  targets.forEach((el) => {
    const original = el.textContent || "";
    const localized = localizeText(original, lang);
    if (localized !== original) el.textContent = localized;
  });
}

function applyLanguageToPage(lang) {
  if (!lang) return;
  applyLanguageToStaticUI(lang);
  const resultDiv = document.getElementById("result");
  if (resultDiv) localizeResultCard(resultDiv, lang);
}

function initLangToggle() {
  // (ADDED) ensure FR button exists (HTMLに無くても追加する)
  const toggleWrap = document.querySelector(".lang-toggle");
  if (toggleWrap) {
    const existingFr = toggleWrap.querySelector('.lang-btn[data-lang="fr"]');
    if (!existingFr) {
      const frBtn = document.createElement("button");
      frBtn.type = "button";
      frBtn.className = "lang-btn";
      frBtn.dataset.lang = "fr";
      frBtn.textContent = "FR";
      toggleWrap.appendChild(frBtn);
    }
  }

  const buttons = Array.from(document.querySelectorAll(".lang-btn"));

  if (!buttons.length) {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved === "en" || saved === "ja" || saved === "fr") SELECTED_LANG = saved;
    applyLanguageToPage(SELECTED_LANG);
    return;
  }

  const active = buttons.find((b) => b.classList.contains("is-active"));
  const initialFromDom = active?.dataset.lang;
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  const initial = (saved === "en" || saved === "ja" || saved === "fr") ? saved : initialFromDom;

  SELECTED_LANG = (initial === "en" || initial === "ja" || initial === "fr") ? initial : "en";

  buttons.forEach((b) => b.classList.remove("is-active"));
  const initBtn = buttons.find((b) => b.dataset.lang === SELECTED_LANG);
  if (initBtn) initBtn.classList.add("is-active");

  applyLanguageToPage(SELECTED_LANG);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang;
      if (lang !== "ja" && lang !== "en" && lang !== "fr") return;

      SELECTED_LANG = lang;
      localStorage.setItem(LANG_STORAGE_KEY, SELECTED_LANG);

      buttons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      applyLanguageToPage(SELECTED_LANG);
    });
  });
}

function renderLangBlocks(data) {
  if (!SELECTED_LANG) {
    return `
      <h3>コメント</h3>
      <pre>${data.commentJa || "（コメントがありません）"}</pre>

      <h3>Comment</h3>
      <pre>${data.commentEn || "(No English commentary provided.)"}</pre>

      <h3>改善プロンプト</h3>
      <pre>${data.improvedJa || "（改善プロンプトがありません）"}</pre>

      <h3>Improved Prompt</h3>
      <pre>${data.improvedEn || "(No improved English prompt provided.)"}</pre>
    `;
  }

  if (SELECTED_LANG === "ja") {
    return `
      <h3>コメント</h3>
      <pre>${data.commentJa || "（コメントがありません）"}</pre>

      <h3>改善プロンプト</h3>
      <pre>${data.improvedJa || "（改善プロンプトがありません）"}</pre>
    `;
  }

  if (SELECTED_LANG === "fr") {
    return `
      <h3>Comment (English)</h3>
      <pre>${data.commentFr || "(No French commentary provided.)"}</pre>

      <h3>Improved Prompt (English)</h3>
      <pre>${data.improvedFr || "(No improved French prompt provided.)"}</pre>
    `;
  }

  return `
      <h3>Comment (English)</h3>
      <pre>${data.commentEn || "(No English commentary provided.)"}</pre>

      <h3>Improved Prompt (English)</h3>
      <pre>${data.improvedEn || "(No improved English prompt provided.)"}</pre>
    `;
}

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
// ================================
function buildMatrixRain(container, opts = {}) {
  if (!container) return;

  const {
    columns = 66,
    density = 10,
    jpWeight = 0.5,
  } = opts;

  const jpBase = "採点中";
  const enBase = "SCORINGINPROGRESS";
  container.innerHTML = "";

  for (let i = 0; i < columns; i++) {
    const col = document.createElement("div");
    col.className = "matrix-col";

    const isJP = Math.random() < jpWeight;
    const base = isJP ? jpBase : enBase;

    const x = Math.random() * 100;
    const dur = rand(4000, 8200);
    const delay = -rand(0, 6000);
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

    const offset = rand(0, base.length - 1);

    for (let j = 0; j < density; j++) {
      const span = document.createElement("span");
      span.className = "matrix-ch";
      if (j === 0 || j === 1) span.classList.add("is-head");

      const baseChar = base[(j + offset) % base.length];
      span.textContent = baseChar;
      span.dataset.base = baseChar;

      col.appendChild(span);
    }

    container.appendChild(col);
  }
}

// ================================
//  Matrix Glitch (Start/Stop)
// ================================
function startMatrixGlitch(container, opts = {}) {
  if (!container) return () => {};

  const {
    tickMs = 160,
    perTick = 8,
    glitchMinMs = 55,
    glitchMaxMs = 140,
  } = opts;

  const glyphs = "01|:_-+*/<>[]{}$#@%&!?".split("");
  const spans = () => Array.from(container.querySelectorAll(".matrix-ch"));

  let alive = true;
  const active = new WeakSet();

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
      if (!alive) return;
      span.textContent = base;
      span.classList.remove("is-glitch");
      active.delete(span);
    }, ms);
  }

  const timer = setInterval(() => {
    const all = spans();
    if (!alive || all.length === 0) return;

    for (let k = 0; k < perTick; k++) {
      const idx = rand(0, all.length - 1);
      glitchOne(all[idx]);

      if (Math.random() < 0.3 && idx + 1 < all.length) {
        glitchOne(all[idx + 1]);
      }
    }
  }, tickMs);

  return () => {
    alive = false;
    clearInterval(timer);

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
  const commentFr = raw.comment_fr ?? "";
  const improvedJa = raw.improved_prompt_ja ?? "";
  const improvedEn = raw.improved_prompt_en ?? "";
  const improvedFr = raw.improved_prompt_fr ?? "";

  return {
    clarity,
    specificity,
    constraints,
    intent,
    safety,
    overall,
    commentJa,
    commentEn,
    commentFr,
    improvedJa,
    improvedEn,
    improvedFr,
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
initLangToggle();

document.getElementById("send-btn").addEventListener("click", async () => {
  const prompt = document.getElementById("prompt-input").value;
  const resultDiv = document.getElementById("result");
  const btn = document.getElementById("send-btn");

  if (!prompt.trim()) {
    resultDiv.innerHTML =
      "<p>プロンプトを入力してください。 / Enter your prompt.</p>";

    if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

    return;
  }

  resultDiv.innerHTML = createMatrixOverlayHTML();

  if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

  const rainRoot = resultDiv.querySelector(".js-matrix-rain");
  buildMatrixRain(rainRoot, { columns: 34, density: 28, jpWeight: 0.5 });

  const stopGlitch = startMatrixGlitch(rainRoot, {
    tickMs: 110,
    perTick: 9,
    glitchMinMs: 55,
    glitchMaxMs: 140,
  });

  btn.disabled = true;

  const startedAt = performance.now();
  const minShowMs = 300;

  try {
    const payload = SELECTED_LANG ? { prompt, lang: SELECTED_LANG } : { prompt };

    let response = await fetch(`${API_BASE}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (
      !response.ok &&
      SELECTED_LANG &&
      (response.status === 400 || response.status === 422)
    ) {
      response = await fetch(`${API_BASE}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    }

    const elapsed = performance.now() - startedAt;
    if (elapsed < minShowMs) await sleep(minShowMs - elapsed);

    stopGlitch();

    if (!response.ok) {
      const errText = await response.text();
      resultDiv.innerHTML = `
        <p>サーバー側でエラーが発生しました。 / Server returned an error.</p>
        <pre>${errText}</pre>
      `;

      if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

      return;
    }

    const rawData = await response.json();
    const data = normalizeResponse(rawData);

    const overlay = resultDiv.querySelector(".matrix-overlay");
    if (overlay) {
      overlay.classList.add("fade-out");
      await sleep(260);
    }

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
          <div class="overall-label">Overall（総合評価）</div>
          <div class="overall-value ${getScoreClass(
            data.overall
          )} js-score" data-target="${data.overall}">0</div>
        </div>
      </div>

      ${renderLangBlocks(data)}

      <details style="margin-top:12px;">
        <summary>Debug: raw JSON</summary>
        <pre>${JSON.stringify(rawData, null, 2)}</pre>
      </details>
    `;

    if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

    await animateScoresSequential(resultDiv);
  } catch (err) {
    console.error(err);
    try {
      stopGlitch();
    } catch (_) {}
    resultDiv.innerHTML = `
      <p>通信エラーが発生しました。 / Network error occurred.</p>
      <pre>${String(err)}</pre>
    `;

    if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);
  } finally {
    btn.disabled = false;
  }
});
