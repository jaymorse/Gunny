'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { buildPayload, resolveColumn, hashString } = require('../lib/build-payload');
const { parseNote, updateFrontmatter } = require('../lib/frontmatter');

const config = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'config.example.json'), 'utf8'),
);

function note(frontmatter, body = 'Body text.') {
  const lines = Object.entries(frontmatter).map(([k, v]) => `${k}: ${v ?? ''}`);
  return `---\n${lines.join('\n')}\n---\n\n${body}`;
}

const validRole = {
  orbit_type: 'new_role',
  orbit_column: 'Preparing case',
  orbit_card_id: '',
  title: 'Senior Solutions Engineer',
  department: 'Revenue',
  hiring_manager: 'Alex Kim',
  headcount: 1,
  location: 'UK',
  sync: true,
};

test('a complete note builds a create payload', () => {
  const result = buildPayload({ path: 'Roles/SE.md', content: note(validRole), config });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.action, 'create');
  assert.strictEqual(result.cardId, null);
  assert.strictEqual(result.payload.title, 'Senior Solutions Engineer');
  assert.strictEqual(result.payload.fields.headcount, 1);
  assert.strictEqual(result.payload.fields.department, 'Revenue');
  assert.strictEqual(result.payload.source, 'obsidian-sync');
  assert.strictEqual(result.payload.board_id, config.board_id);
  assert.strictEqual(result.payload.description, 'Body text.');
});

test('sync: false is skipped, not failed', () => {
  const result = buildPayload({
    path: 'Roles/SE.md',
    content: note({ ...validRole, sync: false }),
    config,
  });
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.skipped, 'sync is not true');
  assert.deepStrictEqual(result.errors, []);
});

test('missing required fields fail with named errors', () => {
  const result = buildPayload({
    path: 'Roles/SE.md',
    content: note({ ...validRole, department: '', hiring_manager: '' }),
    config,
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join(' '), /"department"/);
  assert.match(result.errors.join(' '), /"hiring_manager"/);
});

test('a US role without a salary range is rejected', () => {
  const result = buildPayload({
    path: 'Roles/SE.md',
    content: note({ ...validRole, location: 'US - Remote' }),
    config,
  });
  assert.strictEqual(result.ok, false);
  assert.match(result.errors.join(' '), /salary_range.*US-based roles must publish/s);
});

test('a US role with a salary range passes', () => {
  const result = buildPayload({
    path: 'Roles/SE.md',
    content: note({ ...validRole, location: 'US - Remote', salary_range: '$150k–$180k' }),
    config,
  });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.payload.fields.salary_range, '$150k–$180k');
});

test('an unknown card type is an error', () => {
  const result = buildPayload({
    path: 'x.md',
    content: note({ ...validRole, orbit_type: 'nonsense' }),
    config,
  });
  assert.match(result.errors.join(' '), /Unknown orbit_type "nonsense"/);
});

test('offer approval requires salary expectation and start date', () => {
  const base = {
    orbit_type: 'offer_approval',
    title: 'Offer — J. Doe',
    candidate: 'J. Doe',
    role: 'Senior SE',
    head_of_department: 'Sam Patel',
    sync: true,
  };
  const missing = buildPayload({ path: 'o.md', content: note(base), config });
  assert.strictEqual(missing.ok, false);
  assert.match(missing.errors.join(' '), /salary_expectation/);
  assert.match(missing.errors.join(' '), /start_date/);

  const complete = buildPayload({
    path: 'o.md',
    content: note({ ...base, salary_expectation: '£95,000', start_date: '2026-09-14' }),
    config,
  });
  assert.strictEqual(complete.ok, true);
});

test('an existing card id produces an update', () => {
  const result = buildPayload({
    path: 'Roles/SE.md',
    content: note({ ...validRole, orbit_card_id: 'card_123' }),
    config,
  });
  assert.strictEqual(result.action, 'update');
  assert.strictEqual(result.cardId, 'card_123');
});

test('an unchanged note is skipped on the update path', () => {
  const first = buildPayload({
    path: 'Roles/SE.md',
    content: note({ ...validRole, orbit_card_id: 'card_123' }),
    config,
  });
  const second = buildPayload({
    path: 'Roles/SE.md',
    content: note({
      ...validRole,
      orbit_card_id: 'card_123',
      orbit_synced_hash: first.hash,
    }),
    config,
  });
  assert.strictEqual(second.ok, false);
  assert.strictEqual(second.skipped, 'unchanged since last sync');
});

test('an edited note is not skipped', () => {
  const first = buildPayload({
    path: 'Roles/SE.md',
    content: note({ ...validRole, orbit_card_id: 'card_123' }),
    config,
  });
  const second = buildPayload({
    path: 'Roles/SE.md',
    content: note({ ...validRole, orbit_card_id: 'card_123', orbit_synced_hash: first.hash },
      'Rewritten body.'),
    config,
  });
  assert.strictEqual(second.ok, true);
  assert.notStrictEqual(second.hash, first.hash);
});

test('the hash ignores key order', () => {
  assert.strictEqual(
    hashString(JSON.stringify({ a: 1, b: 2 })),
    hashString(JSON.stringify({ a: 1, b: 2 })),
  );
});

test('the vault cannot move a card into a column it does not own', () => {
  const { column, warnings } = resolveColumn({ orbit_column: 'Approved' }, config, 'HR Review');
  assert.strictEqual(column, null);
  assert.match(warnings.join(' '), /not owned by the vault/);
});

test('the vault cannot rewind a card', () => {
  const { column, warnings } = resolveColumn(
    { orbit_column: 'Preparing case' },
    config,
    'HR Review',
  );
  assert.strictEqual(column, null);
  assert.match(warnings.join(' '), /never rewinds/);
});

test('a forward move inside owned columns is allowed', () => {
  const { column } = resolveColumn({ orbit_column: 'HR Review' }, config, 'Preparing case');
  assert.strictEqual(column, 'HR Review');
});

test('an unknown column is left alone', () => {
  const { column, warnings } = resolveColumn({ orbit_column: 'Nowhere' }, config, null);
  assert.strictEqual(column, null);
  assert.match(warnings.join(' '), /Unknown column/);
});

test('frontmatter round-trips through an update', () => {
  const original = note({ ...validRole, orbit_card_id: '', orbit_synced_hash: '' }, 'Body.');
  const updated = updateFrontmatter(original, {
    orbit_card_id: 'card_999',
    orbit_synced_hash: 'deadbeef',
  });
  const { data, body } = parseNote(updated);
  assert.strictEqual(data.orbit_card_id, 'card_999');
  assert.strictEqual(data.orbit_synced_hash, 'deadbeef');
  assert.strictEqual(data.title, 'Senior Solutions Engineer');
  assert.strictEqual(body.trim(), 'Body.');
});

test('frontmatter lists and types survive parsing', () => {
  const { data } = parseNote(
    '---\ntitle: A role\nheadcount: 2\nsync: true\nempty:\ntags:\n  - one\n  - two\ninline: [x, y]\n---\nBody',
  );
  assert.strictEqual(data.title, 'A role');
  assert.strictEqual(data.headcount, 2);
  assert.strictEqual(data.sync, true);
  assert.strictEqual(data.empty, null);
  assert.deepStrictEqual(data.tags, ['one', 'two']);
  assert.deepStrictEqual(data.inline, ['x', 'y']);
});

test('every shipped template parses and names a known card type', () => {
  const dir = path.join(__dirname, '..', 'templates');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
  assert.ok(files.length >= 4);
  for (const file of files) {
    const { data } = parseNote(fs.readFileSync(path.join(dir, file), 'utf8'));
    assert.ok(data.orbit_type, `${file} has no orbit_type`);
    assert.strictEqual(data.sync, false, `${file} should ship with sync: false`);
    const result = buildPayload({
      path: file,
      content: fs.readFileSync(path.join(dir, file), 'utf8'),
      config,
    });
    // Templates are blank, so they must skip on sync rather than throw.
    assert.strictEqual(result.skipped, 'sync is not true', `${file} did not skip cleanly`);
  }
});
