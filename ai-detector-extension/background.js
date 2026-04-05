// ============================================================
// AI Detector — Background Service Worker
// ============================================================

const DEFAULT_API_BASE_URL = "https://menacraft-zop4.onrender.com/";

// ── Context Menus ────────────────────────────────────────────
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "detect-image",
    title: "🔍 Detect AI — Image",
    contexts: ["image"],
  });
  chrome.contextMenus.create({
    id: "detect-video",
    title: "🔍 Detect AI — Video",
    contexts: ["video"],
  });
  chrome.contextMenus.create({
    id: "detect-page",
    title: "🔍 Detect AI — This Page",
    contexts: ["page", "link"],
  });
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  let payload = {};

  if (info.menuItemId === "detect-image") {
    payload = { type: "image", url: info.srcUrl, pageUrl: info.pageUrl };
  } else if (info.menuItemId === "detect-video") {
    payload = { type: "video", url: info.srcUrl, pageUrl: info.pageUrl };
  } else if (info.menuItemId === "detect-page") {
    payload = { type: "url", url: info.linkUrl || info.pageUrl };
  }

  // Store pending detection and open popup
  await chrome.storage.local.set({ pendingDetection: payload, detectionResult: null });
  chrome.action.openPopup?.() || chrome.tabs.create({ url: chrome.runtime.getURL("popup.html") });
  runDetection(payload);
});

// ── Message Handler ───────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "runDetection") {
    runDetection(message.payload).then(sendResponse);
    return true; // keep channel open for async
  }
  if (message.action === "getStatus") {
    chrome.storage.local.get(["detectionResult", "detectionStatus"], sendResponse);
    return true;
  }
});

// ── Core Detection Function ───────────────────────────────────
async function runDetection(payload) {
  await chrome.storage.local.set({ detectionStatus: "loading", detectionResult: null });

  try {
    const { backendUrl, apiKey } = await chrome.storage.local.get(["backendUrl", "apiKey"]);
    const apiBaseUrl = (backendUrl || DEFAULT_API_BASE_URL).trim().replace(/\/+$/, "");
    const endpointType = getEndpointType(payload);
    const endpointUrl = buildEndpointUrl(apiBaseUrl, endpointType);
    const requestData = await buildRequestData(payload, endpointType);
    const body = requestData.body;
    const headers = { ...requestData.headers };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
      headers["X-API-Key"] = apiKey;
    }

    const response = await fetch(endpointUrl, {
      method: "POST",
      headers,
      body,
    });

    if (!response.ok) {
      const errText = await safeReadError(response);
      throw new Error(formatHttpError(response.status, response.statusText, errText, response.headers.get("retry-after")));
    }

    const result = await response.json();

    // Normalise to our internal schema
    const normalized = normalizeResult(result, payload);
    await chrome.storage.local.set({ detectionResult: normalized, detectionStatus: "done" });
    return normalized;
  } catch (err) {
    const errorResult = { error: err.message, detectionStatus: "error" };
    await chrome.storage.local.set({ detectionResult: errorResult, detectionStatus: "error" });
    return errorResult;
  }
}

function getEndpointType(payload) {
  const type = (payload?.type || "url").toLowerCase();
  if (type === "image" || type === "video" || type === "url" || type === "text") {
    return type;
  }
  return "url";
}

function buildEndpointUrl(apiBaseUrl, endpointType) {
  if (apiBaseUrl.endsWith("/api/detect")) {
    return `${apiBaseUrl}/${endpointType}`;
  }
  if (apiBaseUrl.endsWith("/api")) {
    return `${apiBaseUrl}/detect/${endpointType}`;
  }
  if (apiBaseUrl.endsWith("/detect")) {
    return `${apiBaseUrl}/${endpointType}`;
  }
  return `${apiBaseUrl}/api/detect/${endpointType}`;
}

async function buildRequestData(payload, endpointType) {
  const isUpload = payload?.subtype === "upload" && Boolean(payload?.fileData);

  if (isUpload && (endpointType === "image" || endpointType === "video")) {
    const formData = new FormData();
    const blob = base64ToBlob(payload.fileData, payload.mimeType || "application/octet-stream");
    formData.append("file", blob, payload.fileName || `upload.${endpointType}`);
    return { body: formData, headers: {} };
  }

  // If page mode provides a media URL, download it and forward as multipart file.
  if ((endpointType === "image" || endpointType === "video") && payload?.url) {
    try {
      const upload = await buildUploadFromRemoteUrl(payload.url, payload.fileName, endpointType);
      return { body: upload.formData, headers: {} };
    } catch (error) {
      // For media endpoints, surface the preparation error instead of sending invalid fallback payload.
      throw new Error(error?.message || "Failed to prepare media upload.");
    }
  }

  let requestBody;

  if (endpointType === "text") {
    requestBody = { text: payload?.text || payload?.content || "" };
  } else {
    requestBody = { url: payload?.url || payload?.pageUrl || "" };
  }

  return {
    body: JSON.stringify(requestBody),
    headers: { "Content-Type": "application/json" },
  };
}

async function buildUploadFromRemoteUrl(mediaUrl, fallbackFileName, endpointType) {
  const response = await fetch(mediaUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch media URL (${response.status})`);
  }

  const blob = await response.blob();
  const normalizedBlob = await normalizeMediaBlob(blob, endpointType);

  const formData = new FormData();
  const fileName = fallbackFileName || inferFileName(mediaUrl, normalizedBlob.type);
  formData.append("file", normalizedBlob, fileName);

  return { formData, fileName };
}

async function normalizeMediaBlob(blob, endpointType) {
  if (endpointType === "video") {
    if (!String(blob.type || "").toLowerCase().startsWith("video/")) {
      throw new Error("Selected media URL did not return a video file.");
    }
    return blob;
  }

  // Image endpoint: ensure we submit an actual image format the backend can decode.
  if (isLikelyImageBlob(blob)) {
    return await convertImageBlobIfNeeded(blob);
  }

  throw new Error("Selected media URL did not return a valid image file.");
}

function isLikelyImageBlob(blob) {
  const type = String(blob?.type || "").toLowerCase();
  if (!type) return blob.size > 0;
  if (type.startsWith("text/")) return false;
  if (type.includes("json") || type.includes("html")) return false;
  return type.startsWith("image/");
}

async function convertImageBlobIfNeeded(blob) {
  const type = String(blob?.type || "").toLowerCase();
  const preferred = ["image/jpeg", "image/png"];

  if (preferred.includes(type)) return blob;

  // Convert formats like webp/avif/svg to jpeg when the backend decoder is strict.
  if (type.startsWith("image/")) {
    try {
      const bitmap = await createImageBitmap(blob);
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const converted = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
      bitmap.close();
      return converted;
    } catch {
      // Keep original if conversion is unavailable; backend may still accept it.
      return blob;
    }
  }

  return blob;
}

function inferFileName(url, mimeType) {
  try {
    const parsed = new URL(url);
    const lastPart = parsed.pathname.split("/").pop();
    if (lastPart && lastPart.includes(".")) return lastPart;
  } catch {
    // Ignore URL parse errors and use MIME fallback.
  }

  const mimeExtMap = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "video/quicktime": "mov",
  };

  const ext = mimeExtMap[mimeType] || "bin";
  return `page-media.${ext}`;
}

function base64ToBlob(fileData, mimeType) {
  const cleanBase64 = fileData.includes(",") ? fileData.split(",").pop() : fileData;
  const binary = atob(cleanBase64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}

async function safeReadError(response) {
  try {
    const data = await response.clone().json();
    return data?.detail || data?.message || data?.error || "";
  } catch {
    try {
      return await response.text();
    } catch {
      return "";
    }
  }
}

function formatHttpError(status, statusText, errText, retryAfterHeader) {
  if (status === 429) {
    const retrySeconds = extractRetrySeconds(errText, retryAfterHeader);
    const waitHint = Number.isFinite(retrySeconds) && retrySeconds > 0
      ? ` Please wait about ${Math.ceil(retrySeconds)}s, then retry.`
      : " Please wait a bit, then retry.";
    return `HTTP 429: Rate limit / quota exceeded.${waitHint}${errText ? ` Details: ${truncateError(errText)}` : ""}`;
  }

  return `HTTP ${status}: ${statusText}${errText ? ` - ${truncateError(errText)}` : ""}`;
}

function extractRetrySeconds(errText, retryAfterHeader) {
  const headerValue = Number(retryAfterHeader);
  if (Number.isFinite(headerValue) && headerValue > 0) return headerValue;

  const text = String(errText || "");
  const retryMatch = text.match(/retry\s+(?:in|after)\s+([0-9]+(?:\.[0-9]+)?)\s*s/i);
  if (retryMatch) return Number(retryMatch[1]);

  const secondsMatch = text.match(/retry_delay[^\d]*([0-9]+)/i);
  if (secondsMatch) return Number(secondsMatch[1]);

  return NaN;
}

function truncateError(text, maxLen = 300) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen - 1)}…`;
}

// ── Normalise backend response ────────────────────────────────
// Adapt this to match your actual backend response schema
function normalizeResult(raw, payload) {
  const confidence = extractConfidence(raw);
  const isAI = extractIsAI(raw, confidence);
  const explainability = extractExplainability(raw, isAI);

  return {
    type: payload.type,
    sourceUrl: payload.url || payload.fileName || "Uploaded file",
    isAI,
    confidence,
    label: extractLabel(raw, isAI),
    explainability,
    // explainability is array of { factor: string, impact: number (-1 to 1), description: string }
    modelUsed: raw.model_used ?? raw.modelUsed ?? "Unknown",
    processedAt: raw.processed_at ?? new Date().toISOString(),
    rawResponse: raw,
  };
}

function extractConfidence(raw) {
  const candidates = [
    raw?.confidence,
    raw?.score,
    raw?.result?.confidence,
    raw?.result?.score,
  ];

  const value = candidates.find((item) => Number.isFinite(Number(item)));
  const numeric = Number(value);

  if (!Number.isFinite(numeric)) return 0;

  // Backend may return probability (0..1) or percentage (0..100).
  if (numeric >= 0 && numeric <= 1) {
    return Math.round(numeric * 10000) / 100;
  }

  return Math.max(0, Math.min(100, numeric));
}

function extractIsAI(raw, confidence) {
  const boolCandidates = [raw?.is_ai, raw?.isAI, raw?.result?.is_ai, raw?.result?.isAI];
  const explicitBool = boolCandidates.find((item) => typeof item === "boolean");
  if (typeof explicitBool === "boolean") return explicitBool;

  const verdict = String(raw?.verdict || raw?.result || raw?.label || "").toLowerCase();
  if (verdict.includes("ai")) return true;
  if (verdict.includes("human") || verdict.includes("authentic") || verdict.includes("real")) return false;

  return confidence >= 50;
}

function extractLabel(raw, isAI) {
  const rawLabel = raw?.label || raw?.result?.label || raw?.verdict;
  if (typeof rawLabel === "string" && rawLabel.trim()) return rawLabel;
  return isAI ? "AI Generated" : "Human / Authentic";
}

function extractExplainability(raw, isAI) {
  if (Array.isArray(raw?.explainability)) return raw.explainability;
  if (Array.isArray(raw?.explanation)) return raw.explanation;

  if (typeof raw?.explanation === "string" && raw.explanation.trim()) {
    return [{
      factor: "Model summary",
      impact: isAI ? 0.3 : -0.3,
      description: raw.explanation,
    }];
  }

  return [];
}
