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
//  - If .lang-btn exists, use it ("ja" / "en")
//  - If not, keep bilingual (SELECTED_LANG = null) for backward compatibility
// ================================
let SELECTED_LANG = "en";

// ===== Site-wide i18n helpers  =====
const LANG_STORAGE_KEY = "psa_lang";

//  supported langs
const SUPPORTED_LANGS = ["en", "ja", "fr"];

// plain text translations (no " / ", no JP parens)
const PLAIN_I18N = {
  fr: {
    "Start!": "Démarrer",
    "スコア結果 / Score Results": "Résultats du score",
    "サーバー側でエラーが発生しました。 / Server returned an error.": "Une erreur s'est produite côté serveur.",
    "通信エラーが発生しました。 / Network error occurred.": "Une erreur réseau s'est produite.",
    "プロンプトを入力してください。 / Enter your prompt.": "Veuillez saisir un prompt.",
    "SCORING IN PROGRESS / 採点中": "NOTATION EN COURS",
    "Debug: raw JSON": "Débogage : JSON brut",
    "Comment (English)": "Commentaire",
    "Improved Prompt (English)": "Prompt amélioré",
    "Comment (English) / コメント（日本語）": "Commentaire",
    "Improved Prompt (English) / 改善プロンプト（日本語）": "Prompt amélioré",
    "Score Results": "Résultats",
    "Overall（総合評価）": "Note globale",
    "Overall": "Note globale",
    "Comment": "Commentaire",
    "Improved Prompt": "Prompt amélioré",
    "コメント": "Commentaire",
    "改善プロンプト": "Prompt amélioré",
  },
};

// score label translations for FR (outside text of JP parens)
const FR_SCORE_LABELS = {
  Clarity: "Clarté",
  Specificity: "Spécificité",
  Constraints: "Contraintes",
  Intent: "Intention",
  Safety: "Sécurité",
  Overall: "Note globale",
};

//  subtitle HTML translations (because subtitle is EN-only in HTML)
const SUBTITLE_I18N_HTML = {
  en: 'Score your prompts on <span>5 dimensions</span> with feedback and improved prompt',
  ja: 'あなたのプロンプトを <span>5軸スコアリング</span> ＋ フィードバックと改善プロンプト',
  fr: 'Évaluez vos prompts sur <span>5 dimensions</span> avec des retours et un prompt amélioré',
};

function hasJaChars(s) {
  return /[ぁ-んァ-ン一-龯]/.test(String(s || ""));
}

//  translate plain texts when needed
function translatePlain(text, lang) {
  if (!lang || lang === "en") return text;
  const s = String(text || "");
  const map = PLAIN_I18N[lang];
  return map && map[s] ? map[s] : text;
}

function splitBySlash(text, lang) {
  const s = String(text || "");
  if (!s.includes(" / ")) return translatePlain(s, lang);

  const parts = s.split(" / ").map((p) => p.trim());

  //  3-way support: "JA / EN / FR" (assume order)
  if (parts.length >= 3) {
    if (lang === "ja") return parts[0];
    if (lang === "en") return parts[1];
    if (lang === "fr") return parts[2];
    return parts[1];
  }

  // FR fallback for 2-way strings
  if (lang === "fr") {
    const mapped = translatePlain(s, lang);
    if (mapped !== s) return mapped;
  }

  const left = parts[0] || "";
  const right = parts.slice(1).join(" / ").trim();

  const leftJa = hasJaChars(left);
  const rightJa = hasJaChars(right);

  // "JP / EN" or "EN / JP" 両対応
  if (leftJa && !rightJa) return lang === "ja" ? left : right;
  if (!leftJa && rightJa) return lang === "ja" ? right : left;

  // 判定できない場合は左=ja想定
  return lang === "ja" ? left : right;
}

function splitByParen(text, lang) {
  const s = String(text || "");
  const m = s.match(/^\s*(.*?)（(.*?)）\s*$/);
  if (!m) return translatePlain(s, lang);

  const outside = (m[1] || "").trim();
  const inside = (m[2] || "").trim();

  if (lang === "ja") return inside;
  if (lang === "fr") return FR_SCORE_LABELS[outside] || translatePlain(outside, lang);
  return outside;
}

function localizeText(text, lang) {
  // 先に " / " を優先
  if (String(text || "").includes(" / ")) return splitBySlash(text, lang);
  // 次に "（ ）"
  if (String(text || "").includes("（") && String(text || "").includes("）")) return splitByParen(text, lang);
  return translatePlain(text, lang);
}

function selectSideFromHTML(html, lang) {
  const s = String(html || "");
  if (!s.includes(" / ")) return s;

  const parts = s.split(" / ");

  //  3-way support: "JA / EN / FR" (assume order)
  if (parts.length >= 3) {
    const leftHTML = parts[0];
    const midHTML = parts[1];
    const rightHTML = parts.slice(2).join(" / ");
    if (lang === "ja") return leftHTML;
    if (lang === "en") return midHTML;
    if (lang === "fr") return rightHTML;
    return midHTML;
  }

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
    // 元HTMLを保持（1回だけ）
    if (!subtitle.dataset.i18nHtml) subtitle.dataset.i18nHtml = subtitle.innerHTML;

    // if subtitle is not " / " based, use map
    if (subtitle.dataset.i18nHtml.includes(" / ")) {
      subtitle.innerHTML = selectSideFromHTML(subtitle.dataset.i18nHtml, lang);
    } else {
      const mapped = SUBTITLE_I18N_HTML[lang];
      subtitle.innerHTML = mapped ? mapped : subtitle.dataset.i18nHtml;
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

  // localize Start button
  const btn = document.getElementById("send-btn");
  if (btn) {
    if (!btn.dataset.i18nText) btn.dataset.i18nText = btn.textContent;
    btn.textContent = localizeText(btn.dataset.i18nText, lang);
  }
}

function localizeResultCard(root, lang) {
  if (!root || !lang) return;

  // pre は JSON や本文なので触らない
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
  const buttons = Array.from(document.querySelectorAll(".lang-btn"));

  // (ADDED) one-click toggle: #lang-toggle があればそれを優先
  const singleToggle = document.getElementById("lang-toggle");
  if (singleToggle) {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    SELECTED_LANG = SUPPORTED_LANGS.includes(saved) ? saved : "en";

    // (ADDED) cycle through 3 langs
    singleToggle.textContent = SELECTED_LANG.toUpperCase();
    singleToggle.setAttribute("aria-pressed", SELECTED_LANG === "en" ? "true" : "false");

    applyLanguageToPage(SELECTED_LANG);

    singleToggle.addEventListener("click", () => {
      const idx = SUPPORTED_LANGS.indexOf(SELECTED_LANG);
      SELECTED_LANG = SUPPORTED_LANGS[(idx + 1) % SUPPORTED_LANGS.length];
      localStorage.setItem(LANG_STORAGE_KEY, SELECTED_LANG);

      singleToggle.textContent = SELECTED_LANG.toUpperCase();
      singleToggle.setAttribute("aria-pressed", SELECTED_LANG === "en" ? "true" : "false");

      applyLanguageToPage(SELECTED_LANG);
    });

    return;
  }

  if (!buttons.length) {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (SUPPORTED_LANGS.includes(saved)) SELECTED_LANG = saved;
    applyLanguageToPage(SELECTED_LANG);
    return;
  }

  const active = buttons.find((b) => b.classList.contains("is-active"));
  const initialFromDom = active?.dataset.lang;
  const saved = localStorage.getItem(LANG_STORAGE_KEY);
  const initial = SUPPORTED_LANGS.includes(saved) ? saved : initialFromDom;

  SELECTED_LANG = SUPPORTED_LANGS.includes(initial) ? initial : "en";

  // 初期 active を揃える（文字列は触らない）
  buttons.forEach((b) => b.classList.remove("is-active"));
  const initBtn = buttons.find((b) => b.dataset.lang === SELECTED_LANG);
  if (initBtn) initBtn.classList.add("is-active");

  applyLanguageToPage(SELECTED_LANG);

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const lang = btn.dataset.lang;
      if (!SUPPORTED_LANGS.includes(lang)) return;

      SELECTED_LANG = lang;
      localStorage.setItem(LANG_STORAGE_KEY, SELECTED_LANG);

      buttons.forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");

      applyLanguageToPage(SELECTED_LANG);
    });
  });
}

function renderLangBlocks(data) {
  // SELECTED_LANG が未設定（=トグル無し）の場合は従来通り両方出す
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

  // JPのみ
  if (SELECTED_LANG === "ja") {
    return `
      <h3>コメント</h3>
      <pre>${data.commentJa || "（コメントがありません）"}</pre>

      <h3>改善プロンプト</h3>
      <pre>${data.improvedJa || "（改善プロンプトがありません）"}</pre>
    `;
  }

  // FRのみ
  if (SELECTED_LANG === "fr") {
    return `
      <h3>Comment</h3>
      <pre>${data.commentFr || "(Aucun commentaire fourni.)"}</pre>

      <h3>Improved Prompt</h3>
      <pre>${data.improvedFr || "(Aucun prompt amélioré fourni.)"}</pre>
    `;
  }

  // ENのみ
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
//  - base text: "採点中" / "SCORINGINPROGRESS"
//  - glitch: handled by startMatrixGlitch()
// ================================
function buildMatrixRain(container, opts = {}) {
  if (!container) return;

  const {
    columns = 66,
    density = 10,
    jpWeight = 0.5,
  } = opts;

  const jpBase = "採点中";
  const enBase = "SCORINGINPROGRESS"; // スペースは省略（雨で見えやすい）
  const frBase = "NOTATIONENCOURS";    // fr "SCORING IN PROGRESS"
  container.innerHTML = "";

  for (let i = 0; i < columns; i++) {
    const col = document.createElement("div");
    col.className = "matrix-col";

    // 列タイプ（JP/EN/FR）
    let base;
    if (SELECTED_LANG === "ja") base = jpBase;
    else if (SELECTED_LANG === "fr") base = frBase;
    else if (SELECTED_LANG === "en") base = enBase;
    else {
      const isJP = Math.random() < jpWeight;
      base = isJP ? jpBase : enBase;
    }

    // CSS変数
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
    tickMs = 160,        // グリッチ発生の刻み
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
  const commentFr = raw.comment_fr ?? "";                 // (ADDED)
  const improvedJa = raw.improved_prompt_ja ?? "";
  const improvedEn = raw.improved_prompt_en ?? "";
  const improvedFr = raw.improved_prompt_fr ?? "";        // (ADDED)

  return {
    clarity,
    specificity,
    constraints,
    intent,
    safety,
    overall,
    commentJa,
    commentEn,
    commentFr,        // (ADDED)
    improvedJa,
    improvedEn,
    improvedFr,       // (ADDED)
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

    // (ADDED) 選択言語があるなら表示も寄せる
    if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

    return;
  }

  // ローディング表示
  resultDiv.innerHTML = createMatrixOverlayHTML();

  // (ADDED) overlay の "SCORING... / 採点中" も寄せる
  if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

  const rainRoot = resultDiv.querySelector(".js-matrix-rain");
  buildMatrixRain(rainRoot, { columns: 34, density: 28, jpWeight: 0.5 });

  // グリッチ開始（stop関数を保持）
  const stopGlitch = startMatrixGlitch(rainRoot, {
    tickMs: 110,
    perTick: 9,
    glitchMinMs: 55,
    glitchMaxMs: 140,
  });

  // ボタン連打防止（念のため）
  btn.disabled = true;

  const startedAt = performance.now();
  const minShowMs = 300;

  try {
    // lang を送る（バックエンド未対応なら 422 などで落ちる可能性があるのでリトライを用意）
    const payload = SELECTED_LANG ? { prompt, lang: SELECTED_LANG } : { prompt };

    let response = await fetch(`${API_BASE}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // 互換リトライ（lang未対応バックエンド向け）
    if (!response.ok && SELECTED_LANG && (response.status === 400 || response.status === 422)) {
      response = await fetch(`${API_BASE}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
    }

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

      // (ADDED) 選択言語があるなら表示も寄せる
      if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

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

      ${renderLangBlocks(data)}

      <details style="margin-top:12px;">
        <summary>Debug: raw JSON</summary>
        <pre>${JSON.stringify(rawData, null, 2)}</pre>
      </details>
    `;

    // (ADDED) 結果カード内の " / " や "X（Y）" を選択言語に寄せる
    if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

    await animateScoresSequential(resultDiv);
  } catch (err) {
    console.error(err);
    // 念のため停止
    try { stopGlitch(); } catch (_) {}
    resultDiv.innerHTML = `
      <p>通信エラーが発生しました。 / Network error occurred.</p>
      <pre>${String(err)}</pre>
    `;

    // (ADDED) 選択言語があるなら表示も寄せる
    if (SELECTED_LANG) applyLanguageToPage(SELECTED_LANG);

  } finally {
    btn.disabled = false;
  }
});
