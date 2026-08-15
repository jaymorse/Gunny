'use strict';

const { parseNote } = require('./frontmatter');
const { normalizeMarkdown, render } = require('./normalize-markdown');

/**
 * Turn an Obsidian note into an Orbit API payload.
 *
 * Three jobs, in order:
 *   1. validate against the card-type rules (the People Ops SOPs, encoded)
 *   2. render the body into whatever format Orbit's description field takes
 *   3. map frontmatter keys onto Orbit field names via config.field_map
 *
 * Validation runs first and hard-fails: a card that reaches the board missing
 * a US salary range or a start date costs more to fix in public than to catch
 * here.
 */

/** Non-cryptographic, dependency-free FNV-1a. Only used for change detection. */
function hashString(value) {
  let hash = 0x811c9dc5;
  const str = String(value);
  for (let i = 0; i < str.length; i += 1) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Stable stringify so key order never changes the hash. */
function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function setPath(target, path, value) {
  const parts = String(path).split('.');
  let node = target;
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (typeof node[parts[i]] !== 'object' || node[parts[i]] === null) node[parts[i]] = {};
    node = node[parts[i]];
  }
  node[parts[parts.length - 1]] = value;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === '';
}

/**
 * Card-type rules drawn from the People Ops SOPs. `requires` is unconditional;
 * `conditional` entries fire when their `when` predicate matches.
 */
const CARD_RULES = {
  new_role: {
    requires: ['title', 'department', 'hiring_manager', 'headcount'],
    conditional: [
      {
        when: (fm) => /\b(us|usa|united states|remote us)\b/i.test(String(fm.location ?? '')),
        requires: ['salary_range'],
        because: 'US-based roles must publish a salary range before posting.',
      },
    ],
  },
  offer_approval: {
    // The Head of Department raises this card, but only after salary
    // expectations and start date have been confirmed with the candidate.
    requires: ['candidate', 'role', 'salary_expectation', 'start_date', 'head_of_department'],
  },
  exit: {
    requires: ['employee', 'last_day', 'reason', 'manager'],
  },
  salary_increase: {
    // Finance wants the benchmark reasoning on the card itself.
    requires: ['employee', 'current_salary', 'proposed_salary', 'benchmark_rationale'],
  },
};

/**
 * Guard against a stale note dragging a card backwards through the approval
 * flow. Obsidian may only place cards in columns it owns; everything past
 * HR Review belongs to Finance, Rory and the board itself.
 */
function resolveColumn(frontmatter, config, currentColumn) {
  const order = config.column_order ?? [];
  const owned = config.owned_columns ?? [];
  const desired = frontmatter.orbit_column;
  const warnings = [];

  if (isBlank(desired)) return { column: null, warnings };

  if (!order.includes(desired)) {
    warnings.push(`Unknown column "${desired}" — not in config.column_order. Leaving it alone.`);
    return { column: null, warnings };
  }

  if (!owned.includes(desired)) {
    warnings.push(
      `Column "${desired}" is not owned by the vault (owned: ${owned.join(', ') || 'none'}). ` +
        'Orbit stays the system of record for approvals; not moving the card.',
    );
    return { column: null, warnings };
  }

  if (currentColumn && order.includes(currentColumn)) {
    if (order.indexOf(desired) < order.indexOf(currentColumn)) {
      warnings.push(
        `Refusing to move "${currentColumn}" back to "${desired}" — the sync never rewinds ` +
          'the approval flow. Move it in Orbit if that is really what you want.',
      );
      return { column: null, warnings };
    }
    if (desired === currentColumn) return { column: null, warnings };
  }

  return { column: desired, warnings };
}

function validate(cardType, frontmatter) {
  const rules = CARD_RULES[cardType];
  if (!rules) {
    return [`Unknown orbit_type "${cardType}". Known types: ${Object.keys(CARD_RULES).join(', ')}.`];
  }

  const errors = [];
  for (const field of rules.requires) {
    if (isBlank(frontmatter[field])) errors.push(`Missing required field "${field}".`);
  }
  for (const rule of rules.conditional ?? []) {
    if (!rule.when(frontmatter)) continue;
    for (const field of rule.requires) {
      if (isBlank(frontmatter[field])) errors.push(`Missing "${field}" — ${rule.because}`);
    }
  }
  return errors;
}

/**
 * @param {object} input
 * @param {string} input.path     vault-relative note path, used in messages
 * @param {string} input.content  raw note, frontmatter included
 * @param {object} input.config   see config.example.json
 * @param {string} [input.currentColumn]  card's column in Orbit right now,
 *        fetched on the update path; omit when creating
 * @returns {{ ok: boolean, skipped?: string, errors: string[], warnings: string[],
 *             action: 'create'|'update'|null, cardId: string|null,
 *             payload: object|null, hash: string|null, tags: string[] }}
 */
function buildPayload({ path, content, config, currentColumn }) {
  const { data: fm, body } = parseNote(content);
  const result = {
    ok: false,
    errors: [],
    warnings: [],
    action: null,
    cardId: null,
    payload: null,
    hash: null,
    tags: [],
    path,
  };

  if (fm.sync !== true) {
    result.skipped = 'sync is not true';
    return result;
  }

  const cardType = fm.orbit_type;
  result.errors.push(...validate(cardType, fm));

  const normalized = normalizeMarkdown(body, {
    wikilinks: config.wikilinks ?? 'text',
    vault: config.vault,
    stripTags: config.strip_tags !== false,
  });
  result.warnings.push(...normalized.warnings);
  result.tags = normalized.tags;

  if (result.errors.length > 0) return result;

  const payload = {};

  for (const [key, value] of Object.entries(config.constant_fields ?? {})) {
    setPath(payload, key, value);
  }

  const map = config.field_map ?? {};
  for (const [noteKey, orbitPath] of Object.entries(map)) {
    if (isBlank(fm[noteKey])) continue;
    setPath(payload, orbitPath, fm[noteKey]);
  }

  if (config.description_field) {
    setPath(payload, config.description_field, render(normalized.markdown, config.description_format));
  }

  if (config.board_field && config.board_id) {
    setPath(payload, config.board_field, config.board_id);
  }

  if (config.tags_field && result.tags.length > 0) {
    setPath(payload, config.tags_field, result.tags);
  }

  const column = resolveColumn(fm, config, currentColumn);
  result.warnings.push(...column.warnings);
  if (column.column && config.column_field) {
    const mapped = (config.column_map ?? {})[column.column] ?? column.column;
    setPath(payload, config.column_field, mapped);
  }

  result.cardId = isBlank(fm.orbit_card_id) ? null : String(fm.orbit_card_id);
  result.action = result.cardId ? 'update' : 'create';
  result.payload = payload;
  result.hash = hashString(stableStringify(payload));

  // Unchanged notes are skipped so a vault-wide commit does not rewrite every
  // card (and spam every watcher's notifications).
  if (result.action === 'update' && fm.orbit_synced_hash === result.hash) {
    result.skipped = 'unchanged since last sync';
    return result;
  }

  result.ok = true;
  return result;
}

module.exports = { buildPayload, validate, resolveColumn, hashString, stableStringify, CARD_RULES };
