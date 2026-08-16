/**
 * Paste into the Chrome console on the Orbit board to record its write calls.
 *
 * Captures method, URL, request-header NAMES, request body and response body
 * for every non-GET same-origin request. Header *values* are never recorded,
 * so the output cannot leak your token or session cookie.
 *
 *   1. Open the board, Cmd+Option+J for the console
 *   2. Paste this whole file, press enter
 *   3. Create a throwaway card
 *   4. Run:  copy(JSON.stringify(__orbitCapture, null, 2))
 *   5. Paste the result (it is on your clipboard)
 *
 * Reverted by reloading the page.
 */
(() => {
  const HOST = location.host;
  const MAX = 4000;
  const log = (window.__orbitCapture = []);

  const sameHost = (url) => {
    try {
      return new URL(url, location.href).host === HOST;
    } catch {
      return false;
    }
  };

  const headerNames = (headers) => {
    const names = [];
    try {
      if (!headers) return names;
      if (typeof headers.forEach === 'function' && !Array.isArray(headers)) {
        headers.forEach((_value, key) => names.push(key));
      } else if (Array.isArray(headers)) {
        headers.forEach(([key]) => names.push(key));
      } else {
        Object.keys(headers).forEach((key) => names.push(key));
      }
    } catch {
      /* header shape we do not recognise — names are a nicety, not critical */
    }
    return names;
  };

  const originalFetch = window.fetch;
  window.fetch = async function patchedFetch(...args) {
    // Read the request shape without constructing or cloning a Request: doing
    // either can mark the caller's body as used and break the app.
    const input = args[0];
    const init = args[1] || {};
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
    const body = typeof init.body === 'string' ? init.body : null;
    const headers = headerNames(init.headers || (input && input.headers));

    const response = await originalFetch.apply(this, args);

    if (method !== 'GET' && sameHost(url)) {
      let responseBody = null;
      try {
        responseBody = (await response.clone().text()).slice(0, MAX);
      } catch {
        /* opaque or already-consumed response */
      }
      log.push({
        via: 'fetch',
        method,
        url,
        requestHeaderNames: headers,
        requestBody: body ? body.slice(0, MAX) : null,
        status: response.status,
        response: responseBody,
      });
      console.log(`[orbit-capture] ${method} ${url} → ${response.status}`);
    }

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
    if (cap && cap.method !== 'GET' && sameHost(cap.url)) {
      this.addEventListener('load', () => {
        log.push({
          via: 'xhr',
          method: cap.method,
          url: cap.url,
          requestHeaderNames: [],
          requestBody: typeof body === 'string' ? body.slice(0, MAX) : null,
          status: this.status,
          response: String(this.responseText || '').slice(0, MAX),
        });
        console.log(`[orbit-capture] ${cap.method} ${cap.url} → ${this.status}`);
      });
    }
    return originalSend.call(this, body);
  };

  console.log(
    '%c[orbit-capture] recording',
    'color:#0a7;font-weight:bold',
    '— create a test card, then run: copy(JSON.stringify(__orbitCapture, null, 2))',
  );
})();
