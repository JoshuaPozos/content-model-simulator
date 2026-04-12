/**
 * Content Model Simulator — HTML → Contentful Rich Text Converter
 *
 * Zero-dependency HTML parser that converts HTML strings into
 * Contentful Rich Text document format. Handles:
 *
 * - Block elements: p, h1-h6, blockquote, hr, ul, ol, li, table/tr/td/th, pre
 * - Inline marks: b/strong, i/em, u, code, s/del/strike, sup, sub
 * - Links: a[href]
 * - Images: img[src] → embedded-asset-block (placeholder)
 * - Nested structures: lists inside blockquotes, bold inside links, etc.
 *
 * Contentful Rich Text spec: https://www.contentful.com/developers/docs/concepts/rich-text/
 */

// ── Contentful Rich Text node types ────────────────────────────

export interface RichTextNode {
  nodeType: string;
  data: Record<string, unknown>;
  content?: RichTextNode[];
  value?: string;
  marks?: Array<{ type: string }>;
}

export interface RichTextDocument {
  nodeType: 'document';
  data: Record<string, unknown>;
  content: RichTextNode[];
}

// ── Tag-to-node mapping ──────────────────────────────────────────

const BLOCK_MAP: Record<string, string> = {
  p: 'paragraph',
  h1: 'heading-1',
  h2: 'heading-2',
  h3: 'heading-3',
  h4: 'heading-4',
  h5: 'heading-5',
  h6: 'heading-6',
  blockquote: 'blockquote',
  ul: 'unordered-list',
  ol: 'ordered-list',
  li: 'list-item',
  table: 'table',
  tr: 'table-row',
  td: 'table-cell',
  th: 'table-header-cell',
  pre: 'paragraph',
};

const MARK_MAP: Record<string, string> = {
  b: 'bold',
  strong: 'bold',
  i: 'italic',
  em: 'italic',
  u: 'underline',
  code: 'code',
  s: 'strikethrough',
  del: 'strikethrough',
  strike: 'strikethrough',
  sup: 'superscript',
  sub: 'subscript',
};

const VOID_TAGS = new Set(['br', 'hr', 'img', 'input', 'meta', 'link']);

// ── Lightweight HTML tokenizer ───────────────────────────────────

interface Token {
  type: 'open' | 'close' | 'self-close' | 'text';
  tag?: string;
  attrs?: Record<string, string>;
  text?: string;
}

function tokenize(html: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < html.length) {
    if (html[i] === '<') {
      // Comment
      if (html.startsWith('<!--', i)) {
        const end = html.indexOf('-->', i + 4);
        i = end === -1 ? html.length : end + 3;
        continue;
      }
      // DOCTYPE
      if (html.startsWith('<!', i)) {
        const end = html.indexOf('>', i + 2);
        i = end === -1 ? html.length : end + 1;
        continue;
      }

      const close = html.indexOf('>', i);
      if (close === -1) { i++; continue; }

      const tagContent = html.substring(i + 1, close).trim();
      i = close + 1;

      if (!tagContent) continue;

      // Closing tag
      if (tagContent[0] === '/') {
        const tag = tagContent.substring(1).trim().toLowerCase().split(/[\s/]/)[0];
        if (tag) tokens.push({ type: 'close', tag });
        continue;
      }

      // Self-closing or opening tag
      const selfClosing = tagContent.endsWith('/');
      const raw = selfClosing ? tagContent.slice(0, -1).trim() : tagContent;

      const spaceIdx = raw.search(/[\s]/);
      const tag = (spaceIdx === -1 ? raw : raw.substring(0, spaceIdx)).toLowerCase();
      const attrStr = spaceIdx === -1 ? '' : raw.substring(spaceIdx + 1);

      const attrs: Record<string, string> = {};
      if (attrStr) {
        const re = /([a-zA-Z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
        let m: RegExpExecArray | null;
        while ((m = re.exec(attrStr)) !== null) {
          attrs[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
        }
      }

      if (selfClosing || VOID_TAGS.has(tag)) {
        tokens.push({ type: 'self-close', tag, attrs });
      } else {
        tokens.push({ type: 'open', tag, attrs });
      }
    } else {
      // Text content
      let end = html.indexOf('<', i);
      if (end === -1) end = html.length;
      const raw = html.substring(i, end);
      const text = decodeEntities(raw);
      if (text) {
        tokens.push({ type: 'text', text });
      }
      i = end;
    }
  }

  return tokens;
}

function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&nbsp;/gi, '\u00A0')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── Tree builder (tokens → Rich Text AST) ────────────────────────

function buildTree(tokens: Token[], marks: Array<{ type: string }> = []): RichTextNode[] {
  const nodes: RichTextNode[] = [];
  let i = 0;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token.type === 'text') {
      nodes.push({
        nodeType: 'text',
        value: token.text!,
        marks: [...marks],
        data: {},
      });
      i++;
      continue;
    }

    if (token.type === 'close') {
      // Return to parent — closing tag consumed by caller
      break;
    }

    if (token.type === 'self-close') {
      const tag = token.tag!;

      if (tag === 'br') {
        nodes.push({ nodeType: 'text', value: '\n', marks: [...marks], data: {} });
      } else if (tag === 'hr') {
        nodes.push({ nodeType: 'hr', data: {}, content: [] });
      } else if (tag === 'img') {
        const src = token.attrs?.src || '';
        const alt = token.attrs?.alt || '';
        if (src) {
          nodes.push({
            nodeType: 'embedded-asset-block',
            data: { target: { sys: { type: 'Link', linkType: 'Asset', id: `asset-${simpleHashStr(src)}` } }, uri: src, alt },
            content: [],
          });
        }
      }
      i++;
      continue;
    }

    // Opening tag
    if (token.type === 'open') {
      const tag = token.tag!;
      i++;

      // Collect children until matching close
      const childTokens: Token[] = [];
      let depth = 1;
      while (i < tokens.length && depth > 0) {
        if (tokens[i].type === 'open' && tokens[i].tag === tag) depth++;
        if (tokens[i].type === 'close' && tokens[i].tag === tag) {
          depth--;
          if (depth === 0) { i++; break; }
        }
        childTokens.push(tokens[i]);
        i++;
      }

      // Mark tags (inline formatting)
      if (MARK_MAP[tag]) {
        const newMarks = [...marks, { type: MARK_MAP[tag] }];
        const children = buildTree(childTokens, newMarks);
        nodes.push(...children);
        continue;
      }

      // Anchor tags
      if (tag === 'a') {
        const href = token.attrs?.href || '';
        const children = buildTree(childTokens, marks);
        // Flatten: ensure all children are text nodes
        const textChildren = flattenToText(children);
        nodes.push({
          nodeType: 'hyperlink',
          data: { uri: href },
          content: textChildren.length > 0 ? textChildren : [{ nodeType: 'text', value: href, marks: [...marks], data: {} }],
        });
        continue;
      }

      // Block elements
      const nodeType = BLOCK_MAP[tag];
      if (nodeType) {
        const children = buildTree(childTokens, tag === 'pre' ? [...marks, { type: 'code' }] : marks);
        const block: RichTextNode = { nodeType, data: {}, content: ensureBlockContent(nodeType, children) };
        nodes.push(block);
        continue;
      }

      // div, span, section, article, etc. — transparent wrappers
      const children = buildTree(childTokens, marks);
      nodes.push(...children);
      continue;
    }

    i++;
  }

  return nodes;
}

/** Ensure block nodes have valid children per Contentful spec. */
function ensureBlockContent(nodeType: string, children: RichTextNode[]): RichTextNode[] {
  // Lists must contain only list-item children
  if (nodeType === 'unordered-list' || nodeType === 'ordered-list') {
    return children.filter(c => c.nodeType === 'list-item');
  }

  // list-item must contain block nodes (paragraph wrapping)
  if (nodeType === 'list-item') {
    return wrapInlineInParagraph(children);
  }

  // blockquote must contain block nodes
  if (nodeType === 'blockquote') {
    return wrapInlineInParagraph(children);
  }

  // table-cell / table-header-cell must contain block nodes
  if (nodeType === 'table-cell' || nodeType === 'table-header-cell') {
    return wrapInlineInParagraph(children);
  }

  // paragraph, heading — must contain inline nodes only
  if (nodeType === 'paragraph' || nodeType.startsWith('heading-')) {
    return flattenToInline(children);
  }

  return children.length > 0 ? children : [{ nodeType: 'text', value: '', marks: [], data: {} }];
}

/** Wrap any loose inline nodes (text, hyperlink) in a paragraph. */
function wrapInlineInParagraph(nodes: RichTextNode[]): RichTextNode[] {
  const result: RichTextNode[] = [];
  let inlineBuf: RichTextNode[] = [];

  const flushInline = () => {
    if (inlineBuf.length > 0) {
      result.push({ nodeType: 'paragraph', data: {}, content: inlineBuf });
      inlineBuf = [];
    }
  };

  for (const node of nodes) {
    if (isInlineNode(node)) {
      inlineBuf.push(node);
    } else {
      flushInline();
      result.push(node);
    }
  }
  flushInline();

  if (result.length === 0) {
    result.push({ nodeType: 'paragraph', data: {}, content: [{ nodeType: 'text', value: '', marks: [], data: {} }] });
  }

  return result;
}

function isInlineNode(node: RichTextNode): boolean {
  return node.nodeType === 'text' || node.nodeType === 'hyperlink' ||
         node.nodeType === 'embedded-entry-inline';
}

/** Flatten any block children down to text nodes (for paragraph/heading context). */
function flattenToInline(nodes: RichTextNode[]): RichTextNode[] {
  const result: RichTextNode[] = [];
  for (const node of nodes) {
    if (isInlineNode(node)) {
      result.push(node);
    } else if (node.content) {
      result.push(...flattenToInline(node.content));
    }
  }
  return result.length > 0 ? result : [{ nodeType: 'text', value: '', marks: [], data: {} }];
}

/** Extract text nodes from a node tree (for hyperlink content). */
function flattenToText(nodes: RichTextNode[]): RichTextNode[] {
  const result: RichTextNode[] = [];
  for (const node of nodes) {
    if (node.nodeType === 'text') {
      result.push(node);
    } else if (node.content) {
      result.push(...flattenToText(node.content));
    }
  }
  return result;
}

function simpleHashStr(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Convert an HTML string to a Contentful Rich Text document.
 *
 * @param html - Raw HTML string (can include tags, entities, etc.)
 * @returns A Contentful Rich Text document object (`{ nodeType: 'document', ... }`)
 *
 * @example
 * ```ts
 * import { htmlToRichText } from 'content-model-simulator';
 *
 * const doc = htmlToRichText('<h1>Hello</h1><p>World with <b>bold</b></p>');
 * // → { nodeType: 'document', data: {}, content: [
 * //     { nodeType: 'heading-1', ... },
 * //     { nodeType: 'paragraph', ... }
 * //   ]}
 * ```
 */
export function htmlToRichText(html: string): RichTextDocument {
  if (!html || typeof html !== 'string') {
    return emptyDocument();
  }

  const trimmed = html.trim();
  if (!trimmed) {
    return emptyDocument();
  }

  // If it doesn't look like HTML, wrap as plain text paragraph
  if (!trimmed.includes('<')) {
    return {
      nodeType: 'document',
      data: {},
      content: [{
        nodeType: 'paragraph',
        data: {},
        content: [{ nodeType: 'text', value: trimmed, marks: [], data: {} }],
      }],
    };
  }

  const tokens = tokenize(trimmed);
  const rawNodes = buildTree(tokens);

  // Top-level: ensure only block nodes
  const topLevel = wrapInlineInParagraph(rawNodes);

  // Dedup empty paragraphs
  const content = topLevel.filter((node, idx) => {
    if (node.nodeType === 'paragraph' && node.content?.length === 1 &&
        node.content[0].nodeType === 'text' && !node.content[0].value?.trim()) {
      // Keep if it's the only node, skip otherwise
      return topLevel.length === 1;
    }
    return true;
  });

  if (content.length === 0) {
    return emptyDocument();
  }

  return { nodeType: 'document', data: {}, content };
}

/**
 * Check if a value looks like it could be HTML (contains tags).
 */
export function looksLikeHTML(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  return /<[a-z][\s\S]*>/i.test(value);
}

/**
 * Check if a value is already a Contentful Rich Text document.
 */
export function isRichTextDocument(value: unknown): value is RichTextDocument {
  return typeof value === 'object' && value !== null &&
    (value as RichTextDocument).nodeType === 'document' &&
    Array.isArray((value as RichTextDocument).content);
}

function emptyDocument(): RichTextDocument {
  return {
    nodeType: 'document',
    data: {},
    content: [{
      nodeType: 'paragraph',
      data: {},
      content: [{ nodeType: 'text', value: '', marks: [], data: {} }],
    }],
  };
}
