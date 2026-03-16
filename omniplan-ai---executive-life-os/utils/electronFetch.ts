/**
 * electronFetch — a fetch() replacement that routes requests through the
 * Electron main process when running inside the desktop app.
 *
 * Why: the renderer's fetch() can be blocked by CORS (null file:// origin)
 * or Windows Firewall. Routing through Electron's `net` module (main process)
 * bypasses both problems because:
 *   1. The main process has no CORS origin restrictions.
 *   2. Windows Firewall grants elevated network access to the admin process.
 */
export async function electronFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const electronAPI = (window as any).electronAPI;

  if (!electronAPI?.netFetch) {
    // Web browser context — use regular fetch
    return fetch(url, options);
  }

  // Serialize headers to a plain object for IPC transport
  const headers: Record<string, string> = {};
  if (options.headers) {
    const h = options.headers as any;
    if (typeof h.forEach === 'function') {
      (h as Headers).forEach((v: string, k: string) => { headers[k] = v; });
    } else if (Array.isArray(h)) {
      (h as [string, string][]).forEach(([k, v]) => { headers[k] = v; });
    } else {
      Object.assign(headers, h);
    }
  }

  const result = await electronAPI.netFetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body != null ? String(options.body) : undefined,
  });

  return new Response(result.body, {
    status: result.status,
    headers: new Headers(result.headers as Record<string, string>),
  });
}
