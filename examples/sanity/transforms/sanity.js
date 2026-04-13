/**
 * Sanity → Contentful Transform
 *
 * Maps Sanity document types to Contentful content types.
 *
 * ┌──────────────────────────────────────────────────────────────────────┐
 * │  KEY RULES — read these before writing your own Sanity transforms   │
 * │                                                                     │
 * │  1. Export a `register(registry)` function — NOT a default export.  │
 * │     The CLI and programmatic API both call register(yourRegistry).  │
 * │                                                                     │
 * │  2. Return shape must be:                                           │
 * │       {                                                             │
 * │         fields: {                                                   │
 * │           fieldName: { [locale]: value },  ← locale-wrapped        │
 * │         }                                                           │
 * │       }                                                             │
 * │     NOT a flat { fieldName: value }.                                │
 * │                                                                     │
 * │  3. The reader normalizes some Sanity fields BEFORE your transform: │
 * │     • slug objects  → plain string  (d.slug is a string)            │
 * │     • Portable Text → HTML string   (d.body is HTML, not blocks)   │
 * │     • localeString  → plain object  ({en: "...", es: "..."})        │
 * │     • _key fields   → stripped                                      │
 * │     • system fields → stripped (_id, _type, _rev, etc.)             │
 * │                                                                     │
 * │  4. registry.register(sourceType, transform, targetType?)           │
 * │     • sourceType = Sanity _type (e.g. 'post')                      │
 * │     • targetType = Contentful content type ID (e.g. 'blogPost')    │
 * │       If omitted, sourceType is used as the Contentful type ID.    │
 * │                                                                     │
 * │  5. registry.skip([...types]) to ignore system/internal types.     │
 * └──────────────────────────────────────────────────────────────────────┘
 *
 * @param {import('content-model-simulator').TransformerRegistry} registry
 */
export function register(registry) {

  // ── Reusable Helpers ────────────────────────────────────────────
  //
  // Copy these into your own transforms. They handle the most
  // common Sanity → Contentful mapping patterns.

  /**
   * Handle localeString values.
   *
   * After the reader strips `_type: "localeString"`, you get a plain object
   * like `{ en: "Hello", es: "Hola" }`. If the value is already locale-keyed,
   * return it as-is; otherwise wrap it in { [locale]: value }.
   *
   * Example Sanity field:
   *   { _type: "localeString", en: "Hello", es: "Hola" }
   *
   * After reader normalization:
   *   { en: "Hello", es: "Hola" }
   *
   * With localized():
   *   localized({ en: "Hello", es: "Hola" }, "en")  →  { en: "Hello", es: "Hola" }
   *   localized("plain string", "en")                →  { en: "plain string" }
   */
  function localized(value, locale) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Check if it's already locale-keyed (has short keys like 'en', 'es', 'fr')
      const keys = Object.keys(value);
      const looksLikeLocaleMap = keys.length > 0 && keys.every(k => /^[a-z]{2}(-[A-Z]{2})?$/.test(k));
      if (looksLikeLocaleMap) return value;
    }
    return { [locale]: value };
  }

  /**
   * Convert a Sanity image reference to a Contentful Asset Link.
   *
   * Sanity images look like: { _type: "image", asset: { _ref: "image-xxx", _type: "reference" } }
   * Contentful expects:       { sys: { type: "Link", linkType: "Asset", id: "image-xxx" } }
   */
  function assetLink(imageObj) {
    if (!imageObj) return null;
    const ref = imageObj?.asset?._ref || imageObj?._ref;
    if (!ref) return null;
    return { sys: { type: 'Link', linkType: 'Asset', id: ref } };
  }

  /**
   * Convert a Sanity reference to a Contentful Entry Link.
   *
   * Sanity refs look like:  { _ref: "doc-id", _type: "reference" }
   * Contentful expects:     { sys: { type: "Link", linkType: "Entry", id: "doc-id" } }
   */
  function entryLink(ref) {
    if (!ref) return null;
    const id = ref._ref || ref;
    if (!id || typeof id !== 'string') return null;
    return { sys: { type: 'Link', linkType: 'Entry', id } };
  }


  // ── post → blogPost ──────────────────────────────────────────
  //
  // Demonstrates:
  //   • localeString fields (title, excerpt)
  //   • Reader-normalized slug (string, not {current: "..."})
  //   • Reader-normalized Portable Text → HTML (d.body is HTML)
  //   • Image reference → Asset Link
  //   • Document reference → Entry Link
  //   • Array of references → Array of Entry Links
  //   • Boolean and Date fields (pass through)

  registry.register('post', (doc, locale) => {
    const d = doc.data || {};

    return {
      fields: {
        // localeString: reader gave us {en: "...", es: "..."}
        // localized() detects this and returns it as-is
        title:      localized(d.title, locale),

        // Slug: reader already converted {_type: "slug", current: "..."} → "..."
        slug:       { [locale]: d.slug },

        // Portable Text: reader already converted PT blocks → HTML string
        // The field is named whatever the Sanity field was named.
        // If the original Sanity field was "body", you get d.body as HTML.
        body:       localized(d.body, locale),

        // localeString excerpt
        excerpt:    localized(d.excerpt, locale),

        // Image → Asset Link
        mainImage:  { [locale]: assetLink(d.mainImage) },

        // Single reference → Entry Link
        author:     { [locale]: entryLink(d.author) },

        // Array of references → Array of Entry Links
        categories: { [locale]: Array.isArray(d.categories)
          ? d.categories.map(c => entryLink(c)).filter(Boolean)
          : [] },
        tags:       { [locale]: Array.isArray(d.tags)
          ? d.tags.map(t => entryLink(t)).filter(Boolean)
          : [] },

        // Simple fields — just wrap in locale
        publishDate: { [locale]: d.publishedAt || null },
        featured:    { [locale]: d.featured || false },
      },
    };
  }, 'blogPost');  // 3rd arg: target Contentful content type ID


  // ── author → author ──────────────────────────────────────────
  //
  // Demonstrates:
  //   • localeString for name (multi-locale)
  //   • Image reference for avatar

  registry.register('author', (doc, locale) => {
    const d = doc.data || {};
    return {
      fields: {
        name:   localized(d.name, locale),
        slug:   { [locale]: d.slug },
        bio:    { [locale]: d.bio || null },
        avatar: { [locale]: assetLink(d.avatar) },
      },
    };
  });  // no 3rd arg: sourceType 'author' = targetType 'author'


  // ── category → category ──────────────────────────────────────

  registry.register('category', (doc, locale) => {
    const d = doc.data || {};
    return {
      fields: {
        title:       { [locale]: d.title },
        slug:        { [locale]: d.slug },
        description: { [locale]: d.description || null },
      },
    };
  });


  // ── tag → tag ────────────────────────────────────────────────

  registry.register('tag', (doc, locale) => {
    const d = doc.data || {};
    return {
      fields: {
        title: { [locale]: d.title },
      },
    };
  });


  // ── Skip system types ────────────────────────────────────────
  //
  // Sanity exports include internal document types that should NOT
  // become Contentful entries. Always skip these:

  registry.skip([
    'system.group',
    'system.schema',
    'system.retention',
    // Add any other internal types from your dataset here
  ]);
}
