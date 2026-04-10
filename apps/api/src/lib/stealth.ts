export const STEALTH_SCRIPT = `
  // ── 1. Core: hide webdriver flag ──
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  // Also delete from prototype chain
  delete Object.getPrototypeOf(navigator).webdriver;

  // ── 2. Fake plugins (Chrome-realistic) ──
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const arr = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format', length: 1 },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '', length: 1 },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '', length: 1 },
      ];
      arr.item = (i) => arr[i] || null;
      arr.namedItem = (n) => arr.find(p => p.name === n) || null;
      arr.refresh = () => {};
      Object.setPrototypeOf(arr, PluginArray.prototype);
      return arr;
    }
  });
  Object.defineProperty(navigator, 'mimeTypes', {
    get: () => {
      const arr = [
        { type: 'application/pdf', suffixes: 'pdf', description: 'Portable Document Format', enabledPlugin: navigator.plugins[0] },
      ];
      arr.item = (i) => arr[i] || null;
      arr.namedItem = (n) => arr.find(m => m.type === n) || null;
      Object.setPrototypeOf(arr, MimeTypeArray.prototype);
      return arr;
    }
  });

  // ── 3. Languages & Platform ──
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
  Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
  Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
  Object.defineProperty(navigator, 'appVersion', { get: () => '5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36' });

  // ── 4. Chrome runtime object (realistic) ──
  if (!window.chrome) window.chrome = {};
  window.chrome.runtime = {
    onMessage: { addListener: () => {}, removeListener: () => {}, hasListener: () => false, hasListeners: () => false },
    onConnect: { addListener: () => {}, removeListener: () => {} },
    onInstalled: { addListener: () => {} },
    sendMessage: () => {},
    connect: () => ({ onMessage: { addListener: () => {} }, postMessage: () => {}, disconnect: () => {} }),
    getManifest: () => ({}),
    getURL: (path) => 'chrome-extension://invalid/' + path,
    id: undefined,
  };
  window.chrome.loadTimes = () => ({
    commitLoadTime: Date.now() / 1000,
    finishDocumentLoadTime: Date.now() / 1000 + 0.1,
    finishLoadTime: Date.now() / 1000 + 0.2,
    firstPaintAfterLoadTime: 0,
    firstPaintTime: Date.now() / 1000 + 0.05,
    navigationType: 'Other',
    npnNegotiatedProtocol: 'h2',
    requestTime: Date.now() / 1000 - 0.3,
    startLoadTime: Date.now() / 1000 - 0.2,
    wasAlternateProtocolAvailable: false,
    wasFetchedViaSpdy: true,
    wasNpnNegotiated: true,
  });
  window.chrome.csi = () => ({ startE: Date.now(), onloadT: Date.now() + 100, pageT: 300, tran: 15 });
  window.chrome.app = { isInstalled: false, getIsInstalled: () => false, getDetails: () => null, installState: () => 'not_installed', runningState: () => 'cannot_run' };

  // ── 5. Permissions API ──
  const origQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (params) => {
    if (params.name === 'notifications') {
      return Promise.resolve({ state: 'prompt', onchange: null, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true });
    }
    return origQuery.call(navigator.permissions, params);
  };

  // ── 6. WebGL (realistic GPU) ──
  const getParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Google Inc. (Intel)';
    if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
    return getParam.call(this, param);
  };
  if (typeof WebGL2RenderingContext !== 'undefined') {
    const getParam2 = WebGL2RenderingContext.prototype.getParameter;
    WebGL2RenderingContext.prototype.getParameter = function(param) {
      if (param === 37445) return 'Google Inc. (Intel)';
      if (param === 37446) return 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)';
      return getParam2.call(this, param);
    };
  }

  // ── 7. Canvas fingerprint noise ──
  const origToBlob = HTMLCanvasElement.prototype.toBlob;
  const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toBlob = function(cb, type, quality) {
    const ctx = this.getContext('2d');
    if (ctx) {
      const imageData = ctx.getImageData(0, 0, this.width, this.height);
      for (let i = 0; i < imageData.data.length; i += 4) {
        imageData.data[i] = imageData.data[i] ^ (1 & i);
      }
      ctx.putImageData(imageData, 0, 0);
    }
    return origToBlob.call(this, cb, type, quality);
  };

  // ── 8. Connection info ──
  Object.defineProperty(navigator, 'connection', {
    get: () => ({
      effectiveType: '4g', rtt: 50, downlink: 10, saveData: false,
      type: 'wifi', onchange: null,
      addEventListener: () => {}, removeEventListener: () => {}
    })
  });

  // ── 9. CRITICAL: document.hasFocus() must return true (Turnstile checks this) ──
  Document.prototype.hasFocus = () => true;
  Object.defineProperty(document, 'hidden', { get: () => false });
  Object.defineProperty(document, 'visibilityState', { get: () => 'visible' });

  // ── 10. Focus simulation (don't block events, just ensure focus state) ──
  window.dispatchEvent(new Event('focus'));

  // ── 11. Screen properties ──
  Object.defineProperty(screen, 'width', { get: () => 1920 });
  Object.defineProperty(screen, 'height', { get: () => 1080 });
  Object.defineProperty(screen, 'availWidth', { get: () => 1920 });
  Object.defineProperty(screen, 'availHeight', { get: () => 1040 });
  Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
  Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
  if (window.screenX === 0) Object.defineProperty(window, 'screenX', { get: () => 0 });
  if (window.screenY === 0) Object.defineProperty(window, 'screenY', { get: () => 30 });
  Object.defineProperty(window, 'outerWidth', { get: () => 1920 });
  Object.defineProperty(window, 'outerHeight', { get: () => 1040 });

  // ── 12. Battery API ──
  if (navigator.getBattery) {
    navigator.getBattery = () => Promise.resolve({
      charging: true, chargingTime: 0, dischargingTime: Infinity, level: 1,
      addEventListener: () => {}, removeEventListener: () => {}
    });
  }

  // ── 13. AudioContext fingerprint ──
  if (typeof AudioContext !== 'undefined') {
    const origCreateOsc = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function() {
      const osc = origCreateOsc.call(this);
      const origConnect = osc.connect.bind(osc);
      osc.connect = function(dest) {
        if (dest instanceof AnalyserNode) {
          return origConnect(dest);
        }
        return origConnect(dest);
      };
      return osc;
    };
  }

  // ── 14. Clean automation strings from error stacks (non-destructive) ──
  const origPrepareStackTrace = Error.prepareStackTrace;
  if (origPrepareStackTrace) {
    Error.prepareStackTrace = function(err, stack) {
      const result = origPrepareStackTrace(err, stack);
      return typeof result === 'string' ? result.replace(/playwright|puppeteer|webdriver/gi, 'browser') : result;
    };
  }

  // ── 15. Remove Playwright-injected properties ──
  delete window.__playwright;
  delete window.__pw_manual;
  delete window.__PW_inspect;

  // ── 16. Notification constructor ──
  if (typeof Notification === 'undefined') {
    window.Notification = { permission: 'default', requestPermission: () => Promise.resolve('default') };
  }
`;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";
