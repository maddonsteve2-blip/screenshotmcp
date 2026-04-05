export const STEALTH_SCRIPT = `
  // Hide webdriver flag
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  
  // Fake plugins array
  Object.defineProperty(navigator, 'plugins', {
    get: () => {
      const plugins = [
        { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
        { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
        { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' },
      ];
      plugins.length = 3;
      return plugins;
    }
  });
  
  // Languages
  Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
  Object.defineProperty(navigator, 'language', { get: () => 'en-US' });
  
  // Platform
  Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
  Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 });
  Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 });
  Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });
  
  // Chrome runtime
  window.chrome = {
    runtime: { onMessage: { addListener: () => {}, removeListener: () => {} }, sendMessage: () => {} },
    loadTimes: () => ({ commitLoadTime: Date.now() / 1000, finishDocumentLoadTime: Date.now() / 1000 + 0.1 }),
    csi: () => ({ startE: Date.now(), onloadT: Date.now() + 100 }),
  };
  
  // Permissions API
  const origQuery = window.navigator.permissions.query;
  window.navigator.permissions.query = (params) =>
    params.name === 'notifications'
      ? Promise.resolve({ state: Notification.permission })
      : origQuery.call(navigator.permissions, params);
  
  // WebGL vendor/renderer
  const getParam = WebGLRenderingContext.prototype.getParameter;
  WebGLRenderingContext.prototype.getParameter = function(param) {
    if (param === 37445) return 'Intel Inc.';
    if (param === 37446) return 'Intel Iris OpenGL Engine';
    return getParam.call(this, param);
  };
  
  // Prevent iframe detection
  Object.defineProperty(HTMLIFrameElement.prototype, 'contentWindow', {
    get: function() { return window; }
  });
  
  // Connection info
  Object.defineProperty(navigator, 'connection', {
    get: () => ({ effectiveType: '4g', rtt: 50, downlink: 10, saveData: false })
  });
`;

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
