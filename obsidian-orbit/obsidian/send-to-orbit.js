/**
 * Templater user script: push the active note to the n8n webhook.
 *
 * Install
 *   1. Save this file in your vault, e.g. `_scripts/send-to-orbit.js`.
 *   2. Templater → Settings → User Scripts Folder → `_scripts`.
 *   3. Make a template containing:  <%* await tp.user["send-to-orbit"](tp) %>
 *   4. Bind that template to a hotkey (Templater exposes each template as a
 *      command), and fire it from any card note.
 *
 * Set N8N_WEBHOOK below. The webhook is unauthenticated by default — put n8n
 * behind the VPN, or add Header Auth on the Webhook node and send the same
 * header here.
 */

const N8N_WEBHOOK = 'https://n8n.example.internal/webhook/orbit-sync';

module.exports = async function sendToOrbit(tp) {
  const file = app.workspace.getActiveFile();
  if (!file) {
    new Notice('No active note.');
    return;
  }

  const content = await app.vault.read(file);
  new Notice(`Syncing ${file.path}…`);

  let response;
  try {
    response = await requestUrl({
      url: N8N_WEBHOOK,
      method: 'POST',
      contentType: 'application/json',
      body: JSON.stringify({ notes: [{ path: file.path, content }] }),
      throw: false,
    });
  } catch (error) {
    new Notice(`Orbit sync failed to connect: ${error.message}`, 10000);
    return;
  }

  if (response.status >= 400) {
    new Notice(`Orbit sync HTTP ${response.status}`, 10000);
    return;
  }

  // The workflow responds with one report object per note.
  const report = Array.isArray(response.json) ? response.json[0] : response.json;
  if (!report) {
    new Notice('Orbit sync returned no report.', 10000);
    return;
  }

  if (report.errors?.length) {
    new Notice(`Not synced:\n• ${report.errors.join('\n• ')}`, 15000);
    return;
  }
  if (report.skipped) {
    new Notice(`Skipped: ${report.skipped}`, 8000);
    return;
  }

  const warnings = report.warnings?.length ? `\n⚠ ${report.warnings.join('\n⚠ ')}` : '';
  new Notice(`${report.action === 'create' ? 'Created' : 'Updated'} on Orbit.${warnings}`, 10000);
};
