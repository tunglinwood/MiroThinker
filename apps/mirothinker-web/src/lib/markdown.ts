// Lightweight markdown-to-HTML renderer for MiroThinker output
// Supports: headings, bold, italic, strikethrough, inline code, links, images,
// ordered/unordered lists, tables (with alignment), code blocks, blockquotes,
// horizontal rules, bold+italic, LaTeX math (inline $...$ and display $$...$$)

import katex from 'katex';

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Extract content between balanced braces starting after an opening brace.
 * Returns [content, endIndex] where endIndex is the position of the matching close brace,
 * or null if braces are unbalanced.
 */
function extractBalancedBraces(text: string, startIndex: number): [string, number] | null {
  let depth = 0;
  let i = startIndex;
  while (i < text.length) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        // Return content without the outer braces
        return [text.slice(startIndex + 1, i), i];
      }
    }
    // Handle escape sequences like \%, \$, \\
    if (text[i] === '\\') {
      i++; // skip the escaped character
    }
    i++;
  }
  return null;
}

/**
 * Find and render standalone \boxed{...} patterns in text.
 * Handles nested braces properly.
 */
function renderBoxedMath(text: string, displayMode: boolean): string {
  const result: string[] = [];
  let i = 0;
  while (i < text.length) {
    const boxedIndex = text.indexOf('\\boxed', i);
    if (boxedIndex === -1) {
      result.push(text.slice(i));
      break;
    }
    // Append text before the \boxed
    result.push(text.slice(i, boxedIndex));
    // Extract content between braces
    const braceStart = boxedIndex + 6; // position after '\boxed'
    const extracted = extractBalancedBraces(text, braceStart);
    if (extracted) {
      const [content, endIndex] = extracted;
      try {
        result.push(katex.renderToString(content, { displayMode, throwOnError: false }));
      } catch {
        result.push(`<code class="bg-background px-1.5 py-0.5 rounded text-sm text-accent">${escapeHtml('\\boxed{' + content + '}')}</code>`);
      }
      i = endIndex + 1;
    } else {
      // Unbalanced braces — treat as literal text
      result.push('\\boxed');
      i = boxedIndex + 6;
    }
  }
  return result.join('');
}

function renderDisplayMath(math: string): string {
  try {
    return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
  } catch {
    return `<pre class="bg-background p-4 rounded-lg mb-3 overflow-x-auto border border-border text-text-secondary">${escapeHtml('$$' + math + '$$')}</pre>`;
  }
}

function renderInlineMath(math: string): string {
  try {
    return katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
  } catch {
    return `<code class="bg-background px-1.5 py-0.5 rounded text-sm text-accent">${escapeHtml('$' + math + '$')}</code>`;
  }
}

function looksLikePrice(text: string): boolean {
  return /^\s*\d+([.,]\d{0,2})?\s*$/.test(text);
}

function processInline(text: string): string {
  // Handle inline display math ($$...$$) first
  text = text.replace(/\$\$([^\$]+?)\$\$/g, (match, math) => {
    try {
      return katex.renderToString(math.trim(), { displayMode: true, throwOnError: false });
    } catch {
      return `<code>${escapeHtml(match)}</code>`;
    }
  });

  // Extract inline math (using null char as safe delimiter)
  const inlineMath: string[] = [];
  text = text.replace(/(?<!\$)\$([^\$\n]+?)\$(?!\$)/g, (match, math) => {
    if (looksLikePrice(math)) return match;
    inlineMath.push(math.trim());
    return `\x00MATH_${inlineMath.length - 1}\x00`;
  });

  text = text
    // Bold+italic (must come before bold-only)
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="text-text-primary"><em>$1</em></strong>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong class="text-text-primary">$1</strong>')
    // Italic (single asterisk, not preceded/followed by another asterisk)
    .replace(/(?<!\*)\*(?!\*)(.+?)\*(?!\*)/g, '<em>$1</em>')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '<del class="text-text-muted">$1</del>')
    // Inline code
    .replace(/`(.+?)`/g, '<code class="bg-background px-1.5 py-0.5 rounded text-sm text-accent">$1</code>')
    // Images
    .replace(/!\[(.+?)\]\((.+?)\)/g, '<img src="$2" alt="$1" class="max-w-full h-auto rounded-lg my-2" loading="lazy" />')
    // Links
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-accent hover:underline">$1</a>');

  // Restore inline math
  inlineMath.forEach((math, i) => {
    text = text.replace(`\x00MATH_${i}\x00`, renderInlineMath(math));
  });

  // Handle standalone \boxed{...} without $ delimiters
  text = renderBoxedMath(text, false);

  return text;
}

export function simpleMarkdownToHtml(text: string): string {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let paragraphLines: string[] = [];

  function flushParagraph() {
    if (paragraphLines.length > 0) {
      const content = paragraphLines.join(' ').trim();
      if (content) {
        blocks.push(`<p class="mb-3 text-text-secondary">${processInline(content)}</p>`);
      }
      paragraphLines = [];
    }
  }

  function flushList(items: string[], tag: string, startAttr?: number): void {
    if (items.length === 0) return;
    const start = startAttr !== undefined ? ` start="${startAttr}"` : '';
    blocks.push(`<${tag}${start} class="list-inside mb-3 ml-4 space-y-1">${items.join('')}</${tag}>`);
  }

  // State
  let inCodeBlock = false;
  let codeContent = '';
  let codeLang = '';
  let inDisplayMath = false;
  let displayMathContent = '';
  let listItems: string[] = [];
  let listTag: string | null = null;
  let listStart: number | undefined;
  let inTable = false;
  let tableHeaders: string[] = [];
  let tableRows: string[][] = [];
  let tableAlign: Array<'left' | 'center' | 'right' | null> = [];
  let tableSkipAlign = false;

  function flushListAndTable() {
    if (inTable) {
      flushTable();
    }
    if (listTag) {
      flushList(listItems, listTag, listStart);
      listItems = [];
      listTag = null;
      listStart = undefined;
    }
  }

  function flushTable() {
    if (!inTable || tableHeaders.length === 0) {
      inTable = false;
      tableHeaders = [];
      tableRows = [];
      tableAlign = [];
      return;
    }
    const alignAttr = (i: number): string => {
      const a = tableAlign[i];
      return a ? ` style="text-align:${a}"` : '';
    };
    const headerRow = tableHeaders.map((h, i) => `<th class="px-4 py-2 text-sm font-semibold text-text-primary border-b border-border${alignAttr(i)}">${h}</th>`).join('');
    const bodyRows = tableRows.map(row => {
      const cells = row.map((cell, i) => `<td class="px-4 py-2 text-sm text-text-secondary border-b border-border${alignAttr(i)}">${processInline(cell)}</td>`).join('');
      return `<tr class="hover:bg-surface/50 transition-colors">${cells}</tr>`;
    }).join('');
    blocks.push(
      `<div class="overflow-x-auto mb-4 border border-border rounded-lg"><table class="w-full border-collapse">${headerRow ? `<thead class="bg-background-secondary"><tr>${headerRow}</tr></thead>` : ''}<tbody>${bodyRows}</tbody></table></div>`
    );
    inTable = false;
    tableHeaders = [];
    tableRows = [];
    tableAlign = [];
  }

  function isTableRow(line: string): boolean {
    return line.startsWith('|') && line.endsWith('|') && line.length > 2;
  }

  function isTableSeparator(line: string): boolean {
    const trimmed = line.trim();
    return /^\|?[\s-:|]+\|$/.test(trimmed) || /^\|?[\s-:|]+(\|[\s-:|]+)*\|?$/.test(trimmed);
  }

  function parseTableCells(line: string): string[] {
    return line.split('|').slice(1, -1).map(c => c.trim());
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Code blocks
    const codeMatch = line.match(/^```(\w*)$/);
    if (codeMatch) {
      flushParagraph();
      flushListAndTable();
      if (!inCodeBlock) {
        inCodeBlock = true;
        codeContent = '';
        codeLang = codeMatch[1];
      } else {
        const langLabel = codeLang ? `<span class="text-xs text-text-muted absolute top-2 right-3">${codeLang}</span>` : '';
        blocks.push(`<div class="relative"><pre class="bg-background p-4 rounded-lg mb-3 overflow-x-auto border border-border"><code class="text-text-secondary text-sm font-mono leading-relaxed">${escapeHtml(codeContent.trimEnd())}</code></pre>${langLabel}</div>`);
        inCodeBlock = false;
        codeLang = '';
      }
      continue;
    }

    if (inCodeBlock) {
      codeContent += line + '\n';
      continue;
    }

    // Display math blocks ($$...$$)
    const displayMathMatch = line.match(/^\s*\$\$(.*)$/);
    if (displayMathMatch) {
      flushParagraph();
      flushListAndTable();
      if (!inDisplayMath) {
        inDisplayMath = true;
        displayMathContent = displayMathMatch[1];
        // Single-line display math: $$...$$
        if (displayMathContent.endsWith('$$')) {
          displayMathContent = displayMathContent.slice(0, -2);
          blocks.push(renderDisplayMath(displayMathContent));
          inDisplayMath = false;
          displayMathContent = '';
        }
      } else {
        // Closing line of multi-line display math
        displayMathContent += '\n' + displayMathMatch[1];
        blocks.push(renderDisplayMath(displayMathContent));
        inDisplayMath = false;
        displayMathContent = '';
      }
      continue;
    }

    if (inDisplayMath) {
      displayMathContent += line + '\n';
      continue;
    }

    // Standalone \boxed{...} block (may span multiple lines with balanced braces)
    const boxedMatch = line.match(/^\s*\\boxed\{/);
    if (boxedMatch) {
      flushParagraph();
      flushListAndTable();
      // Collect lines until braces are balanced
      const braceStart = line.indexOf('{', line.indexOf('\\boxed'));
      let combined = line;
      let foundEnd = false;

      const checkExtracted = extractBalancedBraces(combined, braceStart);
      if (checkExtracted) {
        // Single-line \boxed{...}
        const content = combined.slice(braceStart + 1, -1);
        const rendered = katex.renderToString(content, { displayMode: true, throwOnError: false });
        blocks.push(`<div class="my-4 p-4 border-2 border-accent/40 rounded-lg bg-background overflow-x-auto">${rendered}</div>`);
        foundEnd = true;
      } else {
        // Multi-line boxed content — scan forward
        for (let j = i + 1; j < lines.length; j++) {
          combined = combined + '\n' + lines[j];
          const extracted = extractBalancedBraces(combined, braceStart);
          if (extracted && extracted[1] === combined.length - 1) {
            const content = combined.slice(braceStart + 1, -1);
            const rendered = katex.renderToString(content, { displayMode: true, throwOnError: false });
            blocks.push(`<div class="my-4 p-4 border-2 border-accent/40 rounded-lg bg-background overflow-x-auto">${rendered}</div>`);
            i = j;
            foundEnd = true;
            break;
          }
        }
      }

      if (!foundEnd) {
        // Fallback: render as code block
        blocks.push(`<pre class="bg-background p-4 rounded-lg mb-3 overflow-x-auto border border-border text-text-secondary font-mono text-sm">${escapeHtml(line)}</pre>`);
      }
      continue;
    }

    // Table separator row — extract per-column alignment
    if (isTableSeparator(line)) {
      const cols = parseTableCells(line);
      tableAlign = cols.map(c => {
        const trimmed = c.trim();
        if (trimmed.startsWith(':') && trimmed.endsWith(':')) return 'center';
        if (trimmed.endsWith(':')) return 'right';
        if (trimmed.startsWith(':')) return 'left';
        return null;
      });
      tableSkipAlign = true;
      continue;
    }

    // Table row
    if (isTableRow(line)) {
      flushParagraph();
      if (listTag) {
        flushList(listItems, listTag, listStart);
        listItems = [];
        listTag = null;
      }
      const cells = parseTableCells(line);
      if (!inTable) {
        inTable = true;
        tableHeaders = cells;
      } else {
        tableRows.push(cells);
      }
      tableSkipAlign = false;
      continue;
    }

    // Flush table if we hit a non-table line
    if (inTable) {
      flushTable();
    }

    // Headings
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushListAndTable();
      const level = Math.min(headingMatch[1].length, 6);
      const sizes: Record<number, string> = {
        1: 'text-2xl font-bold mb-4 mt-6 text-text-primary',
        2: 'text-xl font-bold mb-3 mt-5 text-text-primary',
        3: 'text-lg font-semibold mb-2 mt-4 text-text-primary',
        4: 'text-base font-semibold mb-2 mt-3 text-text-primary',
        5: 'text-sm font-semibold mb-2 mt-3 text-text-primary',
        6: 'text-xs font-semibold mb-2 mt-3 text-text-muted',
      };
      blocks.push(`<h${level} class="${sizes[level]}">${processInline(headingMatch[2])}</h${level}>`);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(line.trim())) {
      flushParagraph();
      flushListAndTable();
      blocks.push('<hr class="border-border my-4" />');
      continue;
    }

    // Blockquote
    if (line.startsWith('> ')) {
      flushParagraph();
      flushListAndTable();
      blocks.push(`<blockquote class="border-l-4 border-accent/30 pl-4 py-2 mb-3 text-text-secondary italic">${processInline(line.slice(2))}</blockquote>`);
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^([\s]*)[-*+]\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      if (listTag && listTag !== 'ul') {
        flushList(listItems, listTag, listStart);
        listItems = [];
        listStart = undefined;
      }
      if (!listTag) listTag = 'ul';
      const indent = ulMatch[1].length;
      const nested = indent > 0 ? ' ml-4' : '';
      listItems.push(`<li class="text-text-secondary list-disc${nested}">${processInline(ulMatch[2].trim())}</li>`);
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^([\s]*)(\d+)\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      if (listTag && listTag !== 'ol') {
        flushList(listItems, listTag, listStart);
        listItems = [];
        listStart = undefined;
      }
      if (!listTag) {
        listTag = 'ol';
        listStart = parseInt(olMatch[2], 10);
      }
      const indent = olMatch[1].length;
      const nested = indent > 0 ? ' ml-4' : '';
      listItems.push(`<li class="text-text-secondary list-decimal${nested}">${processInline(olMatch[3].trim())}</li>`);
      continue;
    }

    // Not a list item — flush any pending list
    if (listTag) {
      flushList(listItems, listTag, listStart);
      listItems = [];
      listTag = null;
      listStart = undefined;
    }

    // Empty line = paragraph break
    if (line.trim() === '') {
      flushParagraph();
      continue;
    }

    // Regular text
    paragraphLines.push(line.trim());
  }

  flushParagraph();
  flushListAndTable();

  return blocks.join('\n');
}
