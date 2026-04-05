// ============================================================
// AI Detector — Content Script
// ============================================================

// Listen for messages from popup to grab page media
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getPageMedia") {
    const media = collectPageMedia();
    sendResponse(media);
  }
  if (message.action === "highlightElement") {
    highlightElement(message.selector);
    sendResponse({ ok: true });
  }
});

function collectPageMedia() {
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
}

function highlightElement(selector) {
  document.querySelectorAll(".ai-detector-highlight").forEach((el) => {
    el.classList.remove("ai-detector-highlight");
    el.style.outline = "";
  });
  const el = document.querySelector(selector);
  if (el) {
    el.classList.add("ai-detector-highlight");
    el.style.outline = "3px solid #00f5d4";
    el.style.outlineOffset = "2px";
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}
