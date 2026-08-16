/**
 * Paste into the Chrome console on the Orbit board to record its API calls.
 *
 * v2 — v1 recorded only same-origin non-GET fetch calls and captured nothing,
 * so this version widens on every axis that could have been the reason:
 *
 *   - all hosts, not just the page's own (the API may be on another subdomain)
 *   - XHR as well as fetch (axios and friends use XHR)
 *   - GET as well as writes (just loading a card reveals the API shape)
 *   - persisted to sessionStorage, so an in-app navigation does not lose it
 *
 * Analytics and error-reporting hosts are filtered out, which is what keeps
 * the output readable.
 *
 *   1. Open the board, Cmd+Option+J for the console
 *   2. Paste this whole file, press enter
 *      (if Chrome blocks it, type `allow pasting` first)
 *   3. Click into any card — or create a throwaway one
 *   4. Run:  copy(JSON.stringify(__orbitCapture, null, 2))
 *
 * Header VALUES are never recorded, so no token or cookie can end up in the
 * output. Response bodies ARE recorded, truncated to 800 characters — enough
 * to show the JSON shape. Those may contain real card data, so skim before
 * sharing. Reloading the page removes the patch; sessionStorage.removeItem
 * ('__orbitCapture') clears what it collected.
 */
(() => {
  const IGNORE =
    /google-analytics|googletagmanager|doubleclick|gstatic|sentry|datadoghq|posthog|segment|intercom|launchdarkly|hotjar|fullstory|newrelic|cloudflareinsights/;
  const KEY = '__orbitCapture';
  const BODY_MAX = 3000;
  const RESPONSE_MAX = 800;

  let stored = [];
  try {
    stored = JSON.parse(sessionStorage.getItem(KEY) || '[]');
  } catch {
    /* corrupt or unavailable storage — start fresh */
  }
  const log = (window.__orbitCapture = stored);

  const persist = () => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(log.slice(-80)));
    } catch {
      /* quota or private mode — in-memory capture still works */
    }
  };

  const record = (entry) => {
    if (!entry.url || IGNORE.test(entry.url)) return;
    log.push(entry);
    persist();
    console.log(`[cap] ${entry.method} ${entry.url} → ${entry.status}`);
  };

  const headerNames = (headers) => {
    const names = [];
    try {
      if (!headers) return names;
      if (Array.isArray(headers)) headers.forEach(([key]) => names.push(key));
      else if (typeof headers.forEach === 'function') headers.forEach((_v, k) => names.push(k));
      else Object.keys(headers).forEach((key) => names.push(key));
    } catch {
      /* unrecognised header shape — names are a nicety, not critical */
    }
    return names;
  };

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(...args) {
    // Read the shape from the arguments rather than constructing or cloning a
    // Request: either can mark the caller's body as used and break the page.
    const input = args[0];
    const init = args[1] || {};
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    const requestBody = typeof init.body === 'string' ? init.body.slice(0, BODY_MAX) : null;
    const requestHeaderNames = headerNames(init.headers || (input && input.headers));

    const response = await originalFetch.apply(this, args);

    let responseBody = null;
    try {
      responseBody = (await response.clone().text()).slice(0, RESPONSE_MAX);
    } catch {
      /* opaque or streamed response */
    }

    record({
      via: 'fetch',
      method,
      url,
      requestHeaderNames,
      requestBody,
      status: response.status,
      response: responseBody,
    });
    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
    this.__orbitCap = { method: String(method || 'GET').toUpperCase(), url: String(url || '') };
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function patchedSend(body) {
    const cap = this.__orbitCap;
    if (cap) {
      this.addEventListener('load', () =>
        record({
          via: 'xhr',
          method: cap.method,
          url: cap.url,
          requestHeaderNames: [],
          requestBody: typeof body === 'string' ? body.slice(0, BODY_MAX) : null,
          status: this.status,
          response: String(this.responseText || '').slice(0, RESPONSE_MAX),
        }),
      );
    }
    return originalSend.call(this, body);
  };

  console.log(
    '%c[orbit-capture v2] recording',
    'color:#0a7;font-weight:bold',
    `— ${log.length} entries carried over. Click into a card, then run: copy(JSON.stringify(__orbitCapture, null, 2))`,
  );
})();
