/**
 * Transform for seoMetadata — maps raw SEO fields to the schema.
 * Demonstrates the transforms/ convention: export register(registry).
 *
 * @param {import('content-model-simulator').TransformerRegistry} registry
 */
export function register(registry) {
  registry.register('seoMetadata', (doc, locale) => {
    const d = doc.data || doc.fields || {};
    return {
      fields: {
        title: { [locale]: d.meta_title || d.title || '' },
        description: { [locale]: d.meta_description || d.description || null },
        canonicalUrl: { [locale]: d.canonical_url || null },
        noIndex: { [locale]: d.noindex === true || d.noindex === 'true' },
        ogImage: { [locale]: d.og_image ? { sys: { type: 'Link', linkType: 'Asset', id: d.og_image } } : null },
        keywords: { [locale]: d.keywords || [] },
      },
    };
  });
}
