'use strict';

const test = require('node:test');
const assert = require('node:assert');

const { normalizeMarkdown, toPlainText, toHtml } = require('../lib/normalize-markdown');

test('wikilinks render as their alias, or their target', () => {
  const { markdown } = normalizeMarkdown('See [[Rec Tracker|the tracker]] and [[Orbit]].');
  assert.strictEqual(markdown, 'See the tracker and Orbit.');
});

test('wikilinks can render as obsidian:// URIs when a vault is given', () => {
  const { markdown } = normalizeMarkdown('See [[Rec Tracker]].', {
    wikilinks: 'uri',
    vault: 'Gravitee',
  });
  assert.match(markdown, /\[Rec Tracker\]\(obsidian:\/\/open\?vault=Gravitee&file=Rec%20Tracker\)/);
});

test('wikilinks fall back to text when uri mode has no vault', () => {
  const { markdown, warnings } = normalizeMarkdown('[[Orbit]]', { wikilinks: 'uri' });
  assert.strictEqual(markdown, 'Orbit');
  assert.match(warnings.join(' '), /needs a vault name/);
});

test('embeds are dropped and warned about', () => {
  const { markdown, warnings } = normalizeMarkdown('Before\n![[org-chart.png]]\nAfter');
  assert.ok(!markdown.includes('org-chart'));
  assert.match(warnings.join(' '), /Dropped embed "org-chart.png"/);
});

test('callouts become a bold heading plus body', () => {
  const input = '> [!warning] Confidential\n> Check with Sanjay first.';
  const { markdown } = normalizeMarkdown(input);
  assert.strictEqual(markdown, '**Confidential**\nCheck with Sanjay first.');
});

test('a callout with no title falls back to its kind', () => {
  const { markdown } = normalizeMarkdown('> [!note]\n> Body text.');
  assert.strictEqual(markdown, '**NOTE**\nBody text.');
});

test('comments, highlights, block refs and footnotes are cleaned up', () => {
  const input = [
    'Kept %% hidden %% text.',
    '',
    'A ==highlight== here.',
    '',
    'Anchored line ^abc123',
    '',
    'With a ref[^1].',
    '',
    '[^1]: the footnote body',
  ].join('\n');
  const { markdown, warnings } = normalizeMarkdown(input);
  assert.ok(!markdown.includes('hidden'));
  assert.ok(markdown.includes('A **highlight** here.'));
  assert.ok(!markdown.includes('^abc123'));
  assert.ok(markdown.includes('With a ref.'));
  assert.ok(!markdown.includes('the footnote body'));
  assert.match(warnings.join(' '), /Removed footnotes/);
});

test('tags are pulled out of the prose, headings are not', () => {
  const { markdown, tags } = normalizeMarkdown('# Heading\n\nOwned by #people-ops and #hiring.');
  assert.deepStrictEqual(tags, ['people-ops', 'hiring']);
  assert.ok(markdown.startsWith('# Heading'));
  assert.ok(markdown.includes('Owned by  and .') || markdown.includes('Owned by and .'));
});

test('tags survive when stripTags is off', () => {
  const { markdown, tags } = normalizeMarkdown('Owned by #people-ops.', { stripTags: false });
  assert.deepStrictEqual(tags, []);
  assert.ok(markdown.includes('#people-ops'));
});

test('code fences are left verbatim, including wikilink-looking content', () => {
  const input = 'Text\n\n```\nnot a [[link]] and not a #tag\n```\n\nMore';
  const { markdown, tags } = normalizeMarkdown(input);
  assert.ok(markdown.includes('not a [[link]] and not a #tag'));
  assert.deepStrictEqual(tags, []);
});

test('inline code is left verbatim', () => {
  const { markdown } = normalizeMarkdown('Use `[[this]]` literally.');
  assert.strictEqual(markdown, 'Use `[[this]]` literally.');
});

test('dataview blocks are removed', () => {
  const input = 'Before\n\n```dataview\nTABLE file.name\n```\n\nAfter';
  const { markdown, warnings } = normalizeMarkdown(input);
  assert.ok(!markdown.includes('TABLE'));
  assert.match(warnings.join(' '), /Removed a Dataview/);
});

test('toPlainText flattens markdown syntax', () => {
  const text = toPlainText('# Title\n\n**bold** and *italic* and [a link](https://x.test)\n\n- one\n- two');
  assert.ok(text.includes('Title'));
  assert.ok(text.includes('bold and italic and a link'));
  assert.ok(text.includes('- one'));
  assert.ok(!text.includes('**'));
  assert.ok(!text.includes('https://x.test'));
});

test('toHtml renders the supported subset', () => {
  const html = toHtml('## Scope\n\nA **bold** para.\n\n- one\n- two\n\n> quoted');
  assert.ok(html.includes('<h2>Scope</h2>'));
  assert.ok(html.includes('<p>A <strong>bold</strong> para.</p>'));
  assert.ok(html.includes('<ul>\n<li>one</li>\n<li>two</li>\n</ul>'));
  assert.ok(html.includes('<blockquote>quoted</blockquote>'));
});

test('toHtml escapes raw HTML in the note', () => {
  const html = toHtml('A <script>alert(1)</script> line.');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});
