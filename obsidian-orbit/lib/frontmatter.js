'use strict';

/**
 * Minimal YAML-frontmatter reader/writer.
 *
 * Deliberately dependency-free: this same code is inlined into n8n Code nodes,
 * which cannot `npm install`. It supports the subset of YAML the Obsidian
 * templates in ../templates use:
 *
 *   key: value          scalars (string / number / boolean / empty)
 *   key: "value"        quoted strings (single or double)
 *   key:                empty value -> null
 *   key:                block lists
 *     - one
 *     - two
 *   key: [one, two]     inline lists
 *
 * Anything fancier (nested maps, multi-line scalars, anchors) is out of scope
 * and will be read back as a plain string. Keep the templates simple.
 */

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

function parseScalar(raw) {
  const value = raw.trim();
  if (value === '') return null;

  const quoted = value.match(/^"(.*)"$/s) || value.match(/^'(.*)'$/s);
  if (quoted) return quoted[1];

  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null' || value === '~') return null;

  // Inline list: [a, b, c]
  if (value.startsWith('[') && value.endsWith(']')) {
    const inner = value.slice(1, -1).trim();
    if (inner === '') return [];
    return inner.split(',').map((part) => parseScalar(part));
  }

  if (/^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  if (/^-?\d*\.\d+$/.test(value)) return Number.parseFloat(value);

  return value;
}

/**
 * Split a note into its frontmatter object and its body.
 * A note without frontmatter yields `{ data: {}, body: <whole note> }`.
 */
function parseNote(content) {
  const text = String(content ?? '');
  const match = text.match(FRONTMATTER_RE);
  if (!match) return { data: {}, body: text, raw: null };

  const data = {};
  const lines = match[1].split(/\r?\n/);

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue;

    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:(.*)$/);
    if (!keyMatch) continue;

    const key = keyMatch[1];
    const inline = keyMatch[2];

    if (inline.trim() === '') {
      // Could be an empty value or the head of a block list.
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) {
        items.push(parseScalar(lines[j].replace(/^\s*-\s+/, '')));
        j += 1;
      }
      if (items.length > 0) {
        data[key] = items;
        i = j - 1;
      } else {
        data[key] = null;
      }
      continue;
    }

    data[key] = parseScalar(inline);
  }

  return { data, body: text.slice(match[0].length), raw: match[1] };
}

function serializeValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  const str = String(value);
  // Quote anything that would otherwise change meaning on re-parse.
  if (str === '' || /^[\s]|[\s]$|^[[{>|*&!%@`-]|:\s|#/.test(str)) {
    return `"${str.replace(/"/g, '\\"')}"`;
  }
  return str;
}

/**
 * Rewrite a note's frontmatter with `updates`, preserving key order and the
 * body byte-for-byte. Used to stamp `orbit_card_id` back into the vault after
 * a card is created — the step that makes the sync idempotent.
 */
function updateFrontmatter(content, updates) {
  const text = String(content ?? '');
  const match = text.match(FRONTMATTER_RE);
  const pending = { ...updates };

  if (!match) {
    const block = Object.entries(pending)
      .map(([key, value]) => `${key}: ${serializeValue(value)}`)
      .join('\n');
    return `---\n${block}\n---\n${text}`;
  }

  const lines = match[1].split(/\r?\n/);
  const out = lines.map((line) => {
    const keyMatch = line.match(/^([A-Za-z0-9_-]+)\s*:(.*)$/);
    if (!keyMatch) return line;
    const key = keyMatch[1];
    if (!Object.prototype.hasOwnProperty.call(pending, key)) return line;
    const value = pending[key];
    delete pending[key];
    return `${key}: ${serializeValue(value)}`;
  });

  for (const [key, value] of Object.entries(pending)) {
    out.push(`${key}: ${serializeValue(value)}`);
  }

  return `---\n${out.join('\n')}\n---\n${text.slice(match[0].length)}`;
}

module.exports = { parseNote, updateFrontmatter, parseScalar };
