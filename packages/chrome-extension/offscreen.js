// Offscreen document for canvas stitching operations

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === "stitchInOffscreen") {
    stitchImages(msg.captures, msg.dims).then((dataUrl) => {
      sendResponse({ dataUrl });
    });
    return true;
  }
});

async function stitchImages(captures, dims) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = dims.viewportWidth * dims.devicePixelRatio;
  canvas.height = dims.scrollHeight * dims.devicePixelRatio;

  for (const capture of captures) {
    const img = await loadImage(capture.dataUrl);
    const y = capture.scrollY * dims.devicePixelRatio;
    const drawHeight = capture.height * dims.devicePixelRatio;
    ctx.drawImage(img, 0, 0, img.width, drawHeight, 0, y, img.width, drawHeight);
  }

  return canvas.toDataURL("image/png");
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}
