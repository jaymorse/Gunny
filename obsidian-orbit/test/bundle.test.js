'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const { buildWorkflow, inlineLib } = require('../n8n/build-workflow');

/**
 * The n8n Code nodes run an inlined copy of lib/. These tests prove the
 * inlining survives module-scaffolding removal — otherwise a green test suite
 * could sit next to a workflow that throws on its first execution.
 */

test('the inlined bundle evaluates and still builds payloads', () => {
  const config = JSON.parse(
    fs.readFileSync(path.join(__dirname, '..', 'config.example.json'), 'utf8'),
  );
  const driver = `
    result = buildPayload({
      path: 'Roles/SE.md',
      content: [
        '---',
        'orbit_type: new_role',
        'orbit_column: Preparing case',
        'title: Senior SE',
        'department: Revenue',
        'hiring_manager: Alex Kim',
        'headcount: 1',
        'location: UK',
        'sync: true',
        '---',
        '',
        'Body with a [[wikilink]] and #a-tag.',
      ].join('\\n'),
      config: CONFIG,
    });
  `;
  const context = { CONFIG: config, result: null };
  vm.createContext(context);
  vm.runInContext(`${inlineLib()}\n${driver}`, context);

  assert.strictEqual(context.result.ok, true);
  assert.strictEqual(context.result.action, 'create');
  assert.strictEqual(context.result.payload.title, 'Senior SE');
  assert.match(context.result.payload.description, /Body with a wikilink/);
  // Arrays cross the VM realm boundary, so compare contents not prototypes.
  assert.strictEqual(Array.from(context.result.tags).join(','), 'a-tag');
});

test('the inlined bundle keeps updateFrontmatter available for the write-back node', () => {
  const context = { out: null };
  vm.createContext(context);
  vm.runInContext(
    `${inlineLib()}\nout = updateFrontmatter('---\\ntitle: X\\norbit_card_id:\\n---\\nBody', { orbit_card_id: 'card_1' });`,
    context,
  );
  assert.match(context.out, /orbit_card_id: card_1/);
  assert.match(context.out, /title: X/);
});

test('no require() or module.exports survives into the bundle', () => {
  const bundle = inlineLib();
  assert.ok(!/\brequire\(/.test(bundle), 'bundle still calls require()');
  assert.ok(!/module\.exports/.test(bundle), 'bundle still assigns module.exports');
});

test('the generated workflow is valid, connected n8n JSON', () => {
  const workflow = buildWorkflow();
  assert.ok(Array.isArray(workflow.nodes) && workflow.nodes.length > 0);

  const names = new Set(workflow.nodes.map((node) => node.name));
  assert.strictEqual(names.size, workflow.nodes.length, 'duplicate node names');

  const ids = new Set(workflow.nodes.map((node) => node.id));
  assert.strictEqual(ids.size, workflow.nodes.length, 'duplicate node ids');

  for (const node of workflow.nodes) {
    assert.ok(node.type && node.name && node.parameters, `node ${node.name} is incomplete`);
    assert.ok(Array.isArray(node.position) && node.position.length === 2);
  }

  // Every connection endpoint must name a node that exists.
  for (const [from, spec] of Object.entries(workflow.connections)) {
    assert.ok(names.has(from), `connection from unknown node "${from}"`);
    for (const outputs of spec.main) {
      for (const link of outputs) {
        assert.ok(names.has(link.node), `connection to unknown node "${link.node}"`);
      }
    }
  }

  // The workflow must round-trip as JSON — n8n imports it as a file.
  assert.doesNotThrow(() => JSON.parse(JSON.stringify(workflow)));
});

test('the committed workflow file matches a fresh build', () => {
  const committed = path.join(__dirname, '..', 'n8n', 'orbit-sync.workflow.json');
  if (!fs.existsSync(committed)) {
    assert.fail('n8n/orbit-sync.workflow.json is missing — run `npm run build`.');
  }
  const onDisk = fs.readFileSync(committed, 'utf8');
  const fresh = `${JSON.stringify(buildWorkflow(), null, 2)}\n`;
  assert.strictEqual(onDisk, fresh, 'workflow file is stale — run `npm run build`.');
});
