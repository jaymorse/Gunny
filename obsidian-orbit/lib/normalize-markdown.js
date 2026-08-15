'use strict';

/**
 * Turn Obsidian-flavoured markdown into something a non-Obsidian system can
 * render. Wikilinks, embeds, callouts, highlights, comments, block refs and
 * Dataview blocks all mean nothing outside the vault; left alone they show up
 * on the board as literal punctuation.
 *
 * Fenced and inline code are masked before any other rule runs, so a code
 * sample containing [[foo]] or #tag survives verbatim.
 *
 * Output format is chosen by the caller because Orbit's description field
 * format is not yet confirmed — see README "Confirm the API contract".
 */

// Sentinel is plain ASCII and improbable in prose, so masking never collides
// with note content and stays greppable when debugging a bad render.
const MASK_PREFIX = '@@ORBITCODE';
const MASK_SUFFIX = '@@';
const MASK_RE = /@@ORBITCODE(\d+)@@/g;

function maskCode(text) {
  const blocks = [];
  const stash = (match) => {
    blocks.push(match);
    return `${MASK_PREFIX}${blocks.length - 1}${MASK_SUFFIX}`;
  };
  const masked = text
    .replace(/```[\s\S]*?```/g, stash)
    .replace(/`[^`\n]+`/g, stash);
  return { masked, blocks };
}

function unmaskCode(text, blocks) {
  return text.replace(MASK_RE, (_, index) => blocks[Number(index)]);
}

function obsidianUri(vault, target) {
  return `obsidian://open?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(target)}`;
}

/**
 * @param {string} body        note body, frontmatter already removed
 * @param {object} [options]
 * @param {'text'|'uri'} [options.wikilinks='text']  render [[links]] as plain
 *        text, or as obsidian:// links (only useful if every board reader has
 *        the vault — usually they do not)
 * @param {string} [options.vault]  vault name, required when wikilinks='uri'
 * @param {boolean} [options.stripTags=true]  pull #tags out of the prose and
 *        return them separately, for mapping onto Orbit labels
 * @returns {{ markdown: string, tags: string[], warnings: string[] }}
 */
function normalizeMarkdown(body, options = {}) {
  const { wikilinks = 'text', vault, stripTags = true } = options;
  const warnings = [];
  const tags = [];

  let text = String(body ?? '').replace(/\r\n/g, '\n');
  const { masked, blocks } = maskCode(text);
  text = masked;

  // Dataview/query fences are already masked; blank them by inspecting the
  // captured blocks, so unmasking drops them entirely.
  blocks.forEach((block, index) => {
    if (/^```\s*(dataview|dataviewjs|query|tasks)\b/i.test(block)) {
      blocks[index] = '';
      warnings.push('Removed a Dataview/query block — it cannot render outside Obsidian.');
    }
  });

  // %% Obsidian comments %% never leave the vault.
  text = text.replace(/%%[\s\S]*?%%/g, '');

  // ![[embed]] — attachments and transclusions do not travel.
  text = text.replace(/!\[\[([^\]]+)\]\]/g, (_, target) => {
    warnings.push(`Dropped embed "${target}" — attachments are not synced.`);
    return '';
  });

  // [[Note|Alias]] and [[Note]]
  text = text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => {
    const label = (alias || target).trim();
    if (wikilinks === 'uri') {
      if (!vault) {
        warnings.push('wikilinks="uri" needs a vault name; fell back to plain text.');
        return label;
      }
      return `[${label}](${obsidianUri(vault, target.trim())})`;
    }
    return label;
  });

  // > [!note] Title / > body  ->  **Title** / body
  text = text.replace(
    // [ \t]* rather than \s*: \s would swallow the newline and eat the body.
    /^>[ \t]*\[!(\w+)\][+-]?[ \t]*(.*)$((?:\n>.*)*)/gm,
    (_, kind, title, rest) => {
      const heading = (title || '').trim() || kind.toUpperCase();
      const bodyLines = rest
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((line) => line.replace(/^>\s?/, ''));
      return [`**${heading}**`, ...bodyLines].join('\n');
    },
  );

  // ==highlight== has no portable equivalent; bold is the closest.
  text = text.replace(/==([^=\n]+)==/g, '**$1**');

  // Trailing ^block-ids.
  text = text.replace(/[ \t]*\^[A-Za-z0-9-]+[ \t]*$/gm, '');

  // Footnote refs and definitions.
  let sawFootnote = false;
  text = text.replace(/^\[\^[^\]]+\]:.*$/gm, () => {
    sawFootnote = true;
    return '';
  });
  text = text.replace(/\[\^[^\]]+\]/g, () => {
    sawFootnote = true;
    return '';
  });
  if (sawFootnote) warnings.push('Removed footnotes — no footnote support on the card.');

  if (stripTags) {
    // A tag is #word preceded by start-of-line or whitespace. Headings are
    // "# " (hash then space) so they never match.
    text = text.replace(/(^|[\s(])#([A-Za-z][\w/-]*)/gm, (match, lead, tag) => {
      tags.push(tag);
      return lead;
    });
  }

  text = unmaskCode(text, blocks);

  // Tidy the blank lines the removals left behind.
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return { markdown: text, tags: [...new Set(tags)], warnings };
}

/** Strip markdown syntax down to readable plain text. */
function toPlainText(markdown) {
  return String(markdown)
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, '').trimEnd())
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1$2')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '- ')
    .replace(/^---+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inlineHtml(text) {
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, (_, code) => `<code>${code}</code>`)
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
}

/**
 * A deliberately small markdown -> HTML renderer: headings, paragraphs, lists,
 * blockquotes, fenced code, rules, and the inline set above. It is not a
 * CommonMark implementation — no tables, no nested lists. If Orbit accepts
 * HTML and you outgrow this, swap in `marked` on a self-hosted n8n with
 * NODE_FUNCTION_ALLOW_EXTERNAL set (see README).
 */
function toHtml(markdown) {
  const lines = String(markdown).split('\n');
  const out = [];
  let paragraph = [];
  let list = null; // 'ul' | 'ol'
  let quote = [];
  let fence = null;

  const flushParagraph = () => {
    if (paragraph.length) {
      out.push(`<p>${inlineHtml(paragraph.join(' '))}</p>`);
      paragraph = [];
    }
  };
  const flushList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const flushQuote = () => {
    if (quote.length) {
      out.push(`<blockquote>${inlineHtml(quote.join(' '))}</blockquote>`);
      quote = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
    flushQuote();
  };

  for (const line of lines) {
    const fenceMatch = line.match(/^```(\w*)\s*$/);
    if (fenceMatch) {
      if (fence === null) {
        flushAll();
        fence = [];
      } else {
        out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
        fence = null;
      }
      continue;
    }
    if (fence !== null) {
      fence.push(line);
      continue;
    }

    if (line.trim() === '') {
      flushAll();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      out.push(`<h${level}>${inlineHtml(heading[2])}</h${level}>`);
      continue;
    }

    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      flushAll();
      out.push('<hr>');
      continue;
    }

    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (bullet || ordered) {
      flushParagraph();
      flushQuote();
      const wanted = bullet ? 'ul' : 'ol';
      if (list !== wanted) {
        flushList();
        out.push(`<${wanted}>`);
        list = wanted;
      }
      out.push(`<li>${inlineHtml((bullet || ordered)[1])}</li>`);
      continue;
    }
    flushList();

    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (quoted) {
      flushParagraph();
      quote.push(quoted[1]);
      continue;
    }
    flushQuote();

    paragraph.push(line.trim());
  }

  if (fence !== null) out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
  flushAll();
  return out.join('\n');
}

/** Render normalized markdown into whichever format Orbit accepts. */
function render(markdown, format) {
  switch (format) {
    case 'html':
      return toHtml(markdown);
    case 'text':
      return toPlainText(markdown);
    case 'markdown':
    default:
      return markdown;
  }
}

module.exports = { normalizeMarkdown, toPlainText, toHtml, render };
