// ScreenshotsMCP Viewer — Full-tab screenshot viewer with toolbar

const $ = (id) => document.getElementById(id);
const CLOUD_API = "https://screenshotsmcp-api-production.up.railway.app";
const WEB_URL = "https://www.screenshotmcp.com";

let screenshotId = null;
let screenshotData = null;
let currentZoom = "fit"; // "fit" | number (percentage)
let annotationMode = false;
let annoTool = "pen";
let annoHistory = [];
let isDrawing = false;
let drawStart = null;

// ===== INIT =====
async function init() {
  const params = new URLSearchParams(window.location.search);
  screenshotId = params.get("id");

  if (!screenshotId) {
    $("loading").innerHTML = '<span style="color:#ff4444">No screenshot ID provided</span>';
    return;
  }

  try {
    screenshotData = await ScreenshotStorage.getScreenshot(screenshotId);
    if (!screenshotData) {
      $("loading").innerHTML = '<span style="color:#ff4444">Screenshot not found</span>';
      return;
    }

    // Set page info
    $("pageTitle").textContent = screenshotData.title || "Screenshot";
    $("pageUrl").textContent = screenshotData.url || "";
    document.title = `${screenshotData.title || "Screenshot"} — ScreenshotsMCP`;

    // Set meta
    $("dimensions").textContent = `${screenshotData.width} × ${screenshotData.height}`;
    $("fileSize").textContent = formatBytes(screenshotData.dataUrl.length * 0.75); // rough base64 to bytes
    $("timestamp").textContent = new Date(screenshotData.timestamp).toLocaleString();

    // Load image
    const img = $("screenshotImg");
    img.onload = () => {
      $("loading").style.display = "none";
      $("statusText").textContent = `${screenshotData.type === "fullpage" ? "Full page screenshot" : "Screenshot"} • ${screenshotData.width}×${screenshotData.height}`;
      fitToScreen();
    };
    img.src = screenshotData.dataUrl;
  } catch (e) {
    $("loading").innerHTML = `<span style="color:#ff4444">Error: ${e.message}</span>`;
  }
}

// ===== ZOOM =====
function fitToScreen() {
  const wrapper = $("canvasWrapper");
  wrapper.classList.remove("zoomed");
  wrapper.style.width = "";
  $("zoomLevel").textContent = "Fit";
  currentZoom = "fit";
}

function setZoom(pct) {
  const wrapper = $("canvasWrapper");
  const img = $("screenshotImg");
  if (!screenshotData) return;
  const w = screenshotData.width * (pct / 100);
  wrapper.classList.add("zoomed");
  wrapper.style.width = w + "px";
  img.style.width = w + "px";
  $("zoomLevel").textContent = pct + "%";
  currentZoom = pct;
}

$("zoomIn").addEventListener("click", () => {
  const current = currentZoom === "fit" ? 100 : currentZoom;
  setZoom(Math.min(current + 25, 500));
});

$("zoomOut").addEventListener("click", () => {
  const current = currentZoom === "fit" ? 100 : currentZoom;
  setZoom(Math.max(current - 25, 25));
});

$("zoomFit").addEventListener("click", fitToScreen);

// ===== DOWNLOADS =====
function downloadAs(format) {
  if (!screenshotData) return;

  const img = new Image();
  img.onload = () => {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);

    // Draw annotations if any
    const annoCanvas = $("annotationCanvas");
    if (annoCanvas.width > 0 && annoHistory.length > 0) {
      ctx.drawImage(annoCanvas, 0, 0);
    }

    let dataUrl, ext;
    if (format === "jpg") {
      dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      ext = "jpg";
    } else if (format === "pdf") {
      downloadAsPdf(canvas);
      return;
    } else {
      dataUrl = canvas.toDataURL("image/png");
      ext = "png";
    }

    const hostname = screenshotData.url ? new URL(screenshotData.url).hostname.replace(/\./g, "-") : "screenshot";
    const ts = new Date().toISOString().slice(0, 10);
    triggerDownload(dataUrl, `${hostname}_${ts}.${ext}`);
    setStatus("success", `Downloaded as ${ext.toUpperCase()}`);
  };
  img.src = screenshotData.dataUrl;
}

function downloadAsPdf(canvas) {
  // Simple PDF generation using canvas — creates a single-page PDF with the image
  const imgData = canvas.toDataURL("image/jpeg", 0.92);
  const img = new Image();
  img.onload = () => {
    // A4-ish dimensions in points, or match image aspect ratio
    const pxToMm = 0.264583;
    const widthMm = img.width * pxToMm;
    const heightMm = img.height * pxToMm;

    // Use a simple approach: open image in a new window with print dialog
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head><title>Print Screenshot</title>
      <style>
        * { margin: 0; padding: 0; }
        body { display: flex; justify-content: center; }
        img { max-width: 100%; height: auto; }
        @media print {
          @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
          img { width: 100%; }
        }
      </style></head>
      <body><img src="${imgData}" /></body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => printWindow.print(), 500);
    setStatus("success", "PDF print dialog opened");
  };
  img.src = imgData;
}

function triggerDownload(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

$("btnDownloadPng").addEventListener("click", () => downloadAs("png"));
$("btnDownloadJpg").addEventListener("click", () => downloadAs("jpg"));
$("btnDownloadPdf").addEventListener("click", () => downloadAs("pdf"));

// ===== COPY =====
$("btnCopy").addEventListener("click", async () => {
  if (!screenshotData) return;
  try {
    const res = await fetch(screenshotData.dataUrl);
    const blob = await res.blob();
    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
    setStatus("success", "Copied to clipboard!");
  } catch (e) {
    setStatus("error", "Copy failed — " + e.message);
  }
});

// ===== DELETE =====
$("btnDelete").addEventListener("click", async () => {
  if (!screenshotId) return;
  if (!confirm("Delete this screenshot? This cannot be undone.")) return;
  await ScreenshotStorage.deleteScreenshot(screenshotId);
  setStatus("success", "Deleted");
  setTimeout(() => window.close(), 500);
});

// ===== CLOUD SAVE =====
$("btnCloudSave").addEventListener("click", () => {
  $("cloudModal").style.display = "flex";
  checkCloudAuth();
});

$("cloudModalClose").addEventListener("click", () => {
  $("cloudModal").style.display = "none";
});

$("cloudSignIn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${WEB_URL}/sign-in?from=extension` });
});

$("cloudSignUp").addEventListener("click", () => {
  chrome.tabs.create({ url: `${WEB_URL}/sign-up?from=extension` });
});

$("cloudUpload").addEventListener("click", uploadToCloud);

async function checkCloudAuth() {
  const { apiKey } = await chrome.storage.sync.get("apiKey");
  if (apiKey) {
    $("cloudLoggedOut").style.display = "none";
    $("cloudLoggedIn").style.display = "block";
    $("cloudUser").textContent = "Signed in • API key configured";
    if (screenshotData?.cloudUrl) {
      $("cloudUsage").textContent = "This screenshot is already saved to ScreenshotsMCP.";
      $("cloudUpload").textContent = "Open cloud image";
    } else {
      $("cloudUsage").textContent = "Ready to save this screenshot to ScreenshotsMCP.";
      $("cloudUpload").textContent = "Upload to Cloud";
    }
  } else {
    $("cloudLoggedOut").style.display = "block";
    $("cloudLoggedIn").style.display = "none";
  }
}

async function uploadToCloud() {
  const { apiKey } = await chrome.storage.sync.get("apiKey");
  if (!apiKey || !screenshotData) return;

  if (screenshotData.cloudUrl) {
    window.open(screenshotData.cloudUrl, "_blank", "noopener,noreferrer");
    setStatus("success", "Opened saved cloud image");
    return;
  }

  $("cloudUpload").disabled = true;
  $("cloudUpload").textContent = "Uploading...";

  try {
    const res = await fetch(`${CLOUD_API}/v1/screenshot/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        dataUrl: screenshotData.dataUrl,
        url: screenshotData.url || "",
        title: screenshotData.title || "",
        width: screenshotData.width || 1280,
        height: screenshotData.height || 800,
        fullPage: screenshotData.type === "fullpage",
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Upload failed: ${res.status}${errorText ? ` ${errorText}` : ""}`);
    }
    const data = await res.json();

    screenshotData.cloudUrl = data.url;
    if (screenshotId && ScreenshotStorage.updateScreenshot) {
      await ScreenshotStorage.updateScreenshot(screenshotId, { cloudUrl: data.url });
    }

    $("cloudResult").style.display = "block";
    $("cloudResult").className = "cloud-result success";
    $("cloudResult").innerHTML = `Saved! <a href="${data.url}" target="_blank" style="color:#00ff88">${data.url}</a>`;
    $("cloudUsage").textContent = "This screenshot is already saved to ScreenshotsMCP.";
    $("cloudUpload").textContent = "Open cloud image";
    setStatus("success", "Uploaded to cloud");
  } catch (e) {
    $("cloudResult").style.display = "block";
    $("cloudResult").className = "cloud-result error";
    $("cloudResult").textContent = e.message;
  } finally {
    $("cloudUpload").disabled = false;
    if (!screenshotData.cloudUrl) {
      $("cloudUpload").textContent = "Upload to Cloud";
    }
  }
}

// ===== ANNOTATIONS =====
$("btnEdit").addEventListener("click", () => {
  annotationMode = !annotationMode;
  $("btnEdit").classList.toggle("active", annotationMode);
  $("annotationBar").style.display = annotationMode ? "flex" : "none";

  const canvas = $("annotationCanvas");
  const img = $("screenshotImg");
  if (annotationMode) {
    canvas.style.display = "block";
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.style.width = img.style.width || img.offsetWidth + "px";
    canvas.style.height = img.style.height || img.offsetHeight + "px";
    redrawAnnotations();
  } else {
    canvas.style.display = "none";
  }
});

// Annotation tool selection
document.querySelectorAll(".anno-tool[data-tool]").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".anno-tool[data-tool]").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    annoTool = btn.dataset.tool;
  });
});

$("annoUndo").addEventListener("click", () => {
  annoHistory.pop();
  redrawAnnotations();
});

$("annoClear").addEventListener("click", () => {
  annoHistory = [];
  redrawAnnotations();
});

$("annoDone").addEventListener("click", () => {
  annotationMode = false;
  $("btnEdit").classList.remove("active");
  $("annotationBar").style.display = "none";
  $("annotationCanvas").style.display = "none";
});

// Drawing handlers on annotation canvas
$("annotationCanvas").addEventListener("mousedown", (e) => {
  if (!annotationMode) return;
  isDrawing = true;
  const rect = e.target.getBoundingClientRect();
  const scaleX = e.target.width / rect.width;
  const scaleY = e.target.height / rect.height;
  drawStart = {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
  };

  if (annoTool === "pen") {
    annoHistory.push({
      tool: "pen",
      color: $("annoColor").value,
      size: parseInt($("annoSize").value),
      points: [{ x: drawStart.x, y: drawStart.y }],
    });
  }
});

$("annotationCanvas").addEventListener("mousemove", (e) => {
  if (!isDrawing || !annotationMode) return;
  const rect = e.target.getBoundingClientRect();
  const scaleX = e.target.width / rect.width;
  const scaleY = e.target.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  if (annoTool === "pen") {
    const current = annoHistory[annoHistory.length - 1];
    if (current && current.tool === "pen") {
      current.points.push({ x, y });
      redrawAnnotations();
    }
  }
});

$("annotationCanvas").addEventListener("mouseup", (e) => {
  if (!isDrawing || !annotationMode) return;
  isDrawing = false;
  const rect = e.target.getBoundingClientRect();
  const scaleX = e.target.width / rect.width;
  const scaleY = e.target.height / rect.height;
  const x = (e.clientX - rect.left) * scaleX;
  const y = (e.clientY - rect.top) * scaleY;

  if (annoTool === "arrow") {
    annoHistory.push({
      tool: "arrow",
      color: $("annoColor").value,
      size: parseInt($("annoSize").value),
      x1: drawStart.x, y1: drawStart.y,
      x2: x, y2: y,
    });
    redrawAnnotations();
  } else if (annoTool === "rect") {
    annoHistory.push({
      tool: "rect",
      color: $("annoColor").value,
      size: parseInt($("annoSize").value),
      x: Math.min(drawStart.x, x),
      y: Math.min(drawStart.y, y),
      w: Math.abs(x - drawStart.x),
      h: Math.abs(y - drawStart.y),
    });
    redrawAnnotations();
  } else if (annoTool === "text") {
    const text = prompt("Enter text:");
    if (text) {
      annoHistory.push({
        tool: "text",
        color: $("annoColor").value,
        size: parseInt($("annoSize").value) * 6,
        x: drawStart.x,
        y: drawStart.y,
        text,
      });
      redrawAnnotations();
    }
  }

  drawStart = null;
});

function redrawAnnotations() {
  const canvas = $("annotationCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (const item of annoHistory) {
    ctx.strokeStyle = item.color;
    ctx.fillStyle = item.color;
    ctx.lineWidth = item.size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (item.tool === "pen" && item.points.length > 1) {
      ctx.beginPath();
      ctx.moveTo(item.points[0].x, item.points[0].y);
      for (let i = 1; i < item.points.length; i++) {
        ctx.lineTo(item.points[i].x, item.points[i].y);
      }
      ctx.stroke();
    } else if (item.tool === "arrow") {
      drawArrow(ctx, item.x1, item.y1, item.x2, item.y2, item.size);
    } else if (item.tool === "rect") {
      ctx.strokeRect(item.x, item.y, item.w, item.h);
    } else if (item.tool === "text") {
      ctx.font = `bold ${item.size}px sans-serif`;
      ctx.fillText(item.text, item.x, item.y);
    }
  }
}

function drawArrow(ctx, x1, y1, x2, y2, size) {
  const headLen = size * 5;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
}

// ===== HELPERS =====
function setStatus(type, text) {
  $("statusText").textContent = text;
  $("statusText").className = type;
  if (type === "success") setTimeout(() => { $("statusText").textContent = ""; $("statusText").className = ""; }, 3000);
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / 1048576).toFixed(1) + " MB";
}

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.ctrlKey || e.metaKey) {
    if (e.key === "s") { e.preventDefault(); downloadAs("png"); }
    if (e.key === "c") { e.preventDefault(); $("btnCopy").click(); }
    if (e.key === "z" && annotationMode) { e.preventDefault(); $("annoUndo").click(); }
  }
  if (e.key === "Escape" && annotationMode) $("annoDone").click();
  if (e.key === "+" || e.key === "=") $("zoomIn").click();
  if (e.key === "-") $("zoomOut").click();
  if (e.key === "0") fitToScreen();
});

// ===== START =====
init();
