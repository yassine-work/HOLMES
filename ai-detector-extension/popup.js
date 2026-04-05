// ============================================================
// AI Detector — Popup Script
// ============================================================

// ── State ────────────────────────────────────────────────────
let currentMode = "url";
let selectedFile = null;
let lastPayload = null;
let pageMedia = null;
let selectedPageItem = null;
let isDetecting = false;

// ── Init ─────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", async () => {
  loadSettings();
  setupTabs();
  setupModeSwitcher();
  setupURLMode();
  setupUploadMode();
  setupPageMode();
  setupResultPanel();
  setupSettings();
  renderHistory();

  // Check for pending detection triggered from context menu
  const { pendingDetection, detectionStatus } = await chrome.storage.local.get(["pendingDetection", "detectionStatus"]);
  if (pendingDetection) {
    chrome.storage.local.remove("pendingDetection");
    lastPayload = pendingDetection;
    showLoading(pendingDetection.type === "image" ? "Analyzing image…" : "Analyzing content…");
    pollForResult();
  }
});

// ── Tabs ─────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll(".tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
      document.querySelectorAll(".tab-content").forEach((c) => {
        c.classList.remove("active");
        c.classList.add("hidden");
      });
      btn.classList.add("active");
      const target = document.getElementById(`tab-${btn.dataset.tab}`);
      target.classList.remove("hidden");
      target.classList.add("active");
      if (btn.dataset.tab === "history") renderHistory();
    });
  });
}

// ── Mode Switcher ─────────────────────────────────────────────
function setupModeSwitcher() {
  document.querySelectorAll(".mode-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".mode-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentMode = btn.dataset.mode;

      ["url", "upload", "page"].forEach((m) => {
        const el = document.getElementById(`mode-${m}`);
        el.classList.toggle("hidden", m !== currentMode);
      });

      hideResult();
      hideError();
      hideLoading();

      if (currentMode === "page") loadPageInfo();
    });
  });
}

// ── URL Mode ──────────────────────────────────────────────────
function setupURLMode() {
  const input = document.getElementById("urlInput");
  const preview = document.getElementById("urlPreview");
  const previewImg = document.getElementById("urlPreviewImg");

  // Auto-preview images
  input.addEventListener("input", debounce(() => {
    const val = input.value.trim();
    if (isImageUrl(val)) {
      previewImg.src = val;
      preview.style.display = "block";
    } else {
      preview.style.display = "none";
    }
  }, 400));

  // Paste button
  document.getElementById("pasteBtn").addEventListener("click", async () => {
    try {
      const text = await navigator.clipboard.readText();
      input.value = text;
      input.dispatchEvent(new Event("input"));
    } catch {}
  });

  document.getElementById("analyzeUrlBtn").addEventListener("click", () => {
    const url = input.value.trim();
    if (!url) return showToast("Please enter a URL");
    lastPayload = { type: guessTypeFromUrl(url), url };
    sendDetection(lastPayload);
  });
}

// ── Upload Mode ────────────────────────────────────────────────
function setupUploadMode() {
  const dropZone = document.getElementById("dropZone");
  const fileInput = document.getElementById("fileInput");
  const filePreview = document.getElementById("filePreview");

  dropZone.addEventListener("click", () => fileInput.click());
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault(); dropZone.classList.remove("drag-over");
    handleFile(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

  document.getElementById("removeFileBtn").addEventListener("click", () => {
    selectedFile = null;
    fileInput.value = "";
    filePreview.classList.add("hidden");
    dropZone.style.display = "";
  });

  document.getElementById("analyzeFileBtn").addEventListener("click", () => {
    if (!selectedFile) return;
    encodeFileToBase64(selectedFile).then((base64) => {
      lastPayload = {
        type: selectedFile.type.startsWith("video") ? "video" : "image",
        subtype: "upload",
        fileData: base64,
        fileName: selectedFile.name,
        mimeType: selectedFile.type,
      };
      sendDetection(lastPayload);
    });
  });
}

function handleFile(file) {
  if (!file) return;
  selectedFile = file;
  const preview = document.getElementById("filePreview");
  const dropZone = document.getElementById("dropZone");
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("fileSize").textContent = formatBytes(file.size);

  if (file.type.startsWith("image")) {
    const reader = new FileReader();
    reader.onload = (e) => { document.getElementById("filePreviewImg").src = e.target.result; };
    reader.readAsDataURL(file);
  } else {
    document.getElementById("filePreviewImg").src = "";
  }

  dropZone.style.display = "none";
  preview.classList.remove("hidden");
}

// ── Page Mode ─────────────────────────────────────────────────
function setupPageMode() {
  document.getElementById("analyzePageBtn").addEventListener("click", () => {
    if (selectedPageItem) {
      sendPageSelectionForDetection(selectedPageItem);
      return;
    }

    const payload = { type: "url", url: pageMedia?.pageUrl };
    lastPayload = payload;
    sendDetection(payload);
  });
}

function sendPageSelectionForDetection(item) {
  if (!item?.url) return;
  const payload = { type: item.type, url: item.url, pageUrl: pageMedia?.pageUrl };
  lastPayload = payload;
  sendDetection(payload);
}

async function loadPageInfo() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  document.getElementById("pageTitle").textContent = tab.title || "Untitled";
  document.getElementById("pageUrlDisplay").textContent = tab.url;

  try {
    const response = await getPageMediaFromTab(tab.id);
    pageMedia = response;
    renderPageMedia(response);
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const restricted = message.includes("cannot access") || message.includes("chrome://") || message.includes("edge://") || message.includes("about:") || message.includes("extensions");
    document.getElementById("pageMediaGrid").innerHTML = `<p style="color:var(--text3);font-size:11px;grid-column:span 4">${restricted ? "This tab is restricted. Open a regular website page and try again." : "Could not access page content."}</p>`;
  }
}

async function getPageMediaFromTab(tabId) {
  try {
    return await chrome.tabs.sendMessage(tabId, { action: "getPageMedia" });
  } catch {
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => {
        const images = Array.from(document.querySelectorAll("img"))
          .filter((img) => img.src && img.naturalWidth > 50)
          .slice(0, 20)
          .map((img) => ({
            type: "image",
            url: img.src,
            alt: img.alt || "",
            width: img.naturalWidth,
            height: img.naturalHeight,
          }));

        const videos = Array.from(document.querySelectorAll("video, iframe[src*='youtube'], iframe[src*='vimeo']"))
          .slice(0, 10)
          .map((el) => ({
            type: "video",
            url: el.src || el.currentSrc || el.getAttribute("src"),
            tag: el.tagName,
          }))
          .filter((v) => v.url);

        return {
          pageUrl: window.location.href,
          pageTitle: document.title,
          images,
          videos,
        };
      },
    });

    if (!result) throw new Error("Could not collect media from tab.");
    return result;
  }
}

function renderPageMedia(data) {
  const grid = document.getElementById("pageMediaGrid");
  selectedPageItem = null;
  const items = [...(data.images || []), ...(data.videos || [])].slice(0, 8);
  if (!items.length) { grid.innerHTML = ""; return; }

  grid.innerHTML = items.map((item, i) => `
    <div class="media-thumb" data-index="${i}" title="${item.url}">
      ${item.type === "image" ? `<img src="${item.url}" alt="" loading="lazy" />` : `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text3)">▶</div>`}
    </div>
  `).join("");

  grid.querySelectorAll(".media-thumb").forEach((el) => {
    el.addEventListener("click", () => {
      grid.querySelectorAll(".media-thumb").forEach((t) => t.classList.remove("selected"));
      el.classList.add("selected");
      selectedPageItem = items[+el.dataset.index];
      sendPageSelectionForDetection(selectedPageItem);
    });
  });
}

// ── Detection ─────────────────────────────────────────────────
function sendDetection(payload) {
  if (isDetecting) {
    showToast("A scan is already running. Please wait…");
    return;
  }

  isDetecting = true;
  showLoading("Sending to backend…");
  chrome.runtime.sendMessage({ action: "runDetection", payload }, (result) => {
    isDetecting = false;
    if (chrome.runtime.lastError) { showError("Extension error: " + chrome.runtime.lastError.message); return; }
    handleResult(result);
  });
}

function pollForResult(attempts = 0) {
  if (attempts > 60) { showError("Request timed out."); return; }
  chrome.runtime.sendMessage({ action: "getStatus" }, ({ detectionResult, detectionStatus }) => {
    if (detectionStatus === "done" && detectionResult) {
      handleResult(detectionResult);
    } else if (detectionStatus === "error" && detectionResult) {
      showError(detectionResult.error);
    } else {
      setTimeout(() => pollForResult(attempts + 1), 500);
    }
  });
}

function handleResult(result) {
  if (!result || result.error) { showError(result?.error || "Unknown error"); return; }
  hideLoading();
  renderResult(result);
  saveToHistory(result);
}

// ── Result Rendering ──────────────────────────────────────────
function renderResult(result) {
  const panel = document.getElementById("resultPanel");
  hideAllInputPanels();
  panel.classList.remove("hidden");

  // Verdict badge
  const confidence = result.confidence ?? 0;
  const badge = document.getElementById("verdictBadge");
  badge.textContent = result.label || (result.isAI ? "AI Generated" : "Authentic");
  badge.className = "verdict-badge";
  if (confidence >= 70) badge.classList.add("ai");
  else if (confidence <= 35) badge.classList.add("human");
  else badge.classList.add("uncertain");

  // Confidence bar
  const pct = Math.round(confidence);
  document.getElementById("confPct").textContent = pct + "%";
  const fill = document.getElementById("confBarFill");
  const glow = document.getElementById("confBarGlow");

  // Colour gradient based on confidence
  if (confidence >= 70) {
    fill.style.background = "linear-gradient(90deg, #ff4d6d, #c9184a)";
  } else if (confidence >= 40) {
    fill.style.background = "linear-gradient(90deg, #f59e0b, #d97706)";
  } else {
    fill.style.background = "linear-gradient(90deg, #4ade80, #16a34a)";
  }

  requestAnimationFrame(() => {
    fill.style.width = pct + "%";
    glow.style.left = `calc(${pct}% - 6px)`;
  });

  // Source tags
  const srcUrl = result.sourceUrl || "—";
  document.getElementById("sourceTag").textContent = srcUrl.length > 30 ? srcUrl.slice(0, 27) + "…" : srcUrl;
  document.getElementById("sourceTag").title = srcUrl;
  document.getElementById("modelTag").textContent = result.modelUsed || "—";

  // Explainability
  const list = document.getElementById("explainList");
  const factors = result.explainability || [];

  if (!factors.length) {
    list.innerHTML = `<p style="color:var(--text3);font-size:12px">No explainability data returned by the model.</p>`;
  } else {
    list.innerHTML = factors.map((f) => {
      const impact = f.impact ?? 0; // -1 (human) to +1 (AI)
      const absImpact = Math.abs(impact);
      const isPositive = impact > 0;
      const impactPct = Math.round(absImpact * 100);
      const badgeClass = impact > 0.1 ? "positive" : impact < -0.1 ? "negative" : "neutral";
      const barClass = isPositive ? "pos" : "neg";
      const impactLabel = impact > 0.1 ? `+${impactPct}% AI` : impact < -0.1 ? `−${impactPct}% AI` : "Neutral";

      return `
        <div class="explain-item">
          <div class="explain-item-header">
            <span class="explain-factor">${escapeHtml(f.factor || "Factor")}</span>
            <span class="explain-impact-badge ${badgeClass}">${impactLabel}</span>
          </div>
          <div class="explain-bar-track">
            <div class="explain-bar-fill ${barClass}" style="width:${impactPct}%"></div>
          </div>
          ${f.description ? `<span class="explain-desc">${escapeHtml(f.description)}</span>` : ""}
        </div>
      `;
    }).join("");
  }

  // Raw JSON
  document.getElementById("rawJson").textContent = JSON.stringify(result.rawResponse || result, null, 2);
}

// ── UI State Helpers ──────────────────────────────────────────
function showLoading(text = "Analyzing…") {
  hideAllInputPanels();
  hideResult();
  hideError();
  document.getElementById("loadingText").textContent = text;
  document.getElementById("loadingPanel").classList.remove("hidden");
}
function hideLoading() { document.getElementById("loadingPanel").classList.add("hidden"); }

function showError(msg) {
  hideAllInputPanels();
  hideResult();
  hideLoading();
  document.getElementById("errorMsg").textContent = msg;
  document.getElementById("errorPanel").classList.remove("hidden");
}
function hideError() { document.getElementById("errorPanel").classList.add("hidden"); }

function hideResult() { document.getElementById("resultPanel").classList.add("hidden"); }

function hideAllInputPanels() {
  ["url", "upload", "page"].forEach((m) => {
    document.getElementById(`mode-${m}`).classList.add("hidden");
  });
}
function showCurrentInputPanel() {
  document.getElementById(`mode-${currentMode}`).classList.remove("hidden");
}

// ── Result Panel Controls ─────────────────────────────────────
function setupResultPanel() {
  document.getElementById("backBtn").addEventListener("click", () => {
    hideResult();
    hideError();
    hideLoading();
    showCurrentInputPanel();
  });

  document.getElementById("rawToggle").addEventListener("click", () => {
    const raw = document.getElementById("rawJson");
    const btn = document.getElementById("rawToggle");
    raw.classList.toggle("hidden");
    btn.textContent = raw.classList.contains("hidden") ? "Show raw response ▾" : "Hide raw response ▴";
  });

  document.getElementById("retryBtn").addEventListener("click", () => {
    if (lastPayload) sendDetection(lastPayload);
  });
}

// ── History ────────────────────────────────────────────────────
async function saveToHistory(result) {
  const { saveHistory } = await chrome.storage.local.get("saveHistory");
  if (saveHistory === false) return;

  const { history = [] } = await chrome.storage.local.get("history");
  const entry = {
    id: Date.now(),
    timestamp: new Date().toISOString(),
    type: result.type,
    sourceUrl: result.sourceUrl,
    confidence: result.confidence,
    isAI: result.isAI,
    label: result.label,
    modelUsed: result.modelUsed,
  };
  history.unshift(entry);
  await chrome.storage.local.set({ history: history.slice(0, 50) });
}

async function renderHistory() {
  const { history = [] } = await chrome.storage.local.get("history");
  const list = document.getElementById("historyList");
  document.getElementById("historyCount").textContent = `${history.length} scan${history.length !== 1 ? "s" : ""}`;

  if (!history.length) {
    list.innerHTML = `
      <div class="empty-state">
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" opacity=".4"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
        <p>No scans yet.<br/>Analyze something to start.</p>
      </div>`;
    return;
  }

  const typeIcon = { image: "🖼️", video: "🎥", url: "🔗", upload: "📁" };

  list.innerHTML = history.map((item) => {
    const pct = Math.round(item.confidence ?? 0);
    const cls = pct >= 70 ? "ai" : pct <= 35 ? "human" : "uncertain";
    const date = new Date(item.timestamp).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
    const src = item.sourceUrl || "—";
    return `
      <div class="history-item">
        <div class="hist-icon">${typeIcon[item.type] || "🔍"}</div>
        <div class="hist-info">
          <span class="hist-title">${escapeHtml(src.length > 34 ? src.slice(0, 31) + "…" : src)}</span>
          <span class="hist-meta">
            <span>${date}</span>
            <span>·</span>
            <span class="hist-pct ${cls}">${pct}% AI</span>
          </span>
        </div>
      </div>
    `;
  }).join("");
}

document.getElementById("clearHistoryBtn")?.addEventListener("click", async () => {
  await chrome.storage.local.set({ history: [] });
  renderHistory();
});

// ── Settings ──────────────────────────────────────────────────
function setupSettings() {
  document.getElementById("settingsBtn").addEventListener("click", () => {
    document.getElementById("settingsOverlay").classList.remove("hidden");
  });
  document.getElementById("closeSettings").addEventListener("click", () => {
    document.getElementById("settingsOverlay").classList.add("hidden");
  });
  document.getElementById("saveSettings").addEventListener("click", saveSettings);

  // Toggles
  ["autoScanToggle", "historyToggle"].forEach((id) => {
    document.getElementById(id)?.addEventListener("click", () => {
      document.getElementById(id).classList.toggle("active");
    });
  });
}

async function loadSettings() {
  const { backendUrl, apiKey, autoScan, saveHistory } = await chrome.storage.local.get(["backendUrl", "apiKey", "autoScan", "saveHistory"]);
  if (backendUrl) document.getElementById("backendUrl").value = backendUrl;
  if (apiKey) document.getElementById("apiKey").value = apiKey;
  if (autoScan) document.getElementById("autoScanToggle").classList.add("active");
  if (saveHistory !== false) document.getElementById("historyToggle").classList.add("active");
}

async function saveSettings() {
  const backendUrl = document.getElementById("backendUrl").value.trim();
  const apiKey = document.getElementById("apiKey").value.trim();
  const autoScan = document.getElementById("autoScanToggle").classList.contains("active");
  const saveHistory = document.getElementById("historyToggle").classList.contains("active");
  await chrome.storage.local.set({ backendUrl, apiKey, autoScan, saveHistory });
  document.getElementById("settingsOverlay").classList.add("hidden");
  showToast("Settings saved ✓");
}

// ── Utilities ─────────────────────────────────────────────────
function isImageUrl(url) {
  return /\.(jpg|jpeg|png|gif|webp|svg|bmp)(\?.*)?$/i.test(url);
}

function guessTypeFromUrl(url) {
  if (/\.(mp4|webm|ogg|mov|avi)(\?.*)?$/i.test(url)) return "video";
  if (isImageUrl(url)) return "image";
  return "url";
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function encodeFileToBase64(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = () => res(reader.result.split(",")[1]);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function debounce(fn, ms) {
  let t; return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

function showToast(msg) {
  const t = document.createElement("div");
  t.textContent = msg;
  Object.assign(t.style, {
    position: "fixed", bottom: "14px", left: "50%", transform: "translateX(-50%)",
    background: "var(--bg3)", border: "1px solid var(--border)", color: "var(--text)",
    padding: "7px 16px", borderRadius: "20px", fontSize: "12px", zIndex: "999",
    fontFamily: "var(--sans)", pointerEvents: "none",
  });
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 2200);
}
