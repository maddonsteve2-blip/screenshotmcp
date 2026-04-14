// IndexedDB storage layer for screenshot history
const DB_NAME = "screenshotsmcp";
const DB_VERSION = 1;
const STORE_NAME = "screenshots";

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("timestamp", "timestamp", { unique: false });
        store.createIndex("url", "url", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function saveScreenshot(data) {
  const db = await openDB();
  const id = `ss_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const record = {
    id,
    dataUrl: data.dataUrl,
    url: data.url || "",
    title: data.title || "",
    width: data.width || 0,
    height: data.height || 0,
    type: data.type || "viewport", // viewport | fullpage
    timestamp: Date.now(),
    cloudUrl: data.cloudUrl || null,
    thumbnail: null, // generated below
  };

  // Generate thumbnail (200px wide)
  record.thumbnail = await generateThumbnail(data.dataUrl, 200);

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function getScreenshot(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function updateScreenshot(id, updates) {
  const db = await openDB();
  const existing = await getScreenshot(id);

  if (!existing) {
    throw new Error("Screenshot not found");
  }

  const record = { ...existing, ...updates };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => resolve(record);
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllScreenshots(limit = 50) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const index = store.index("timestamp");
    const results = [];
    const request = index.openCursor(null, "prev"); // newest first
    request.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        // Return metadata + thumbnail only (not full dataUrl) for list views
        const { dataUrl, ...meta } = cursor.value;
        results.push(meta);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

async function deleteScreenshot(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getScreenshotCount() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearAllScreenshots() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function generateThumbnail(dataUrl, maxWidth) {
  try {
    // Service-worker-safe: use OffscreenCanvas + createImageBitmap (no DOM needed)
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    const bitmap = await createImageBitmap(blob);

    const scale = maxWidth / bitmap.width;
    const canvas = new OffscreenCanvas(maxWidth, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const thumbBlob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.7 });
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(thumbBlob);
    });
  } catch {
    return null;
  }
}

// Export for use in other scripts
if (typeof globalThis !== "undefined") {
  globalThis.ScreenshotStorage = {
    saveScreenshot,
    getScreenshot,
    updateScreenshot,
    getAllScreenshots,
    deleteScreenshot,
    getScreenshotCount,
    clearAllScreenshots,
  };
}
