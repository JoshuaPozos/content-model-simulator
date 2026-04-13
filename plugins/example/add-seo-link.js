/**
 * Root-level plugin file — demonstrates the setup() convention.
 * This adds an 'seo' Link field to every content type that doesn't already have one.
 *
 * @param {{ schemas: import('content-model-simulator').SchemaRegistry, transformers: import('content-model-simulator').TransformerRegistry }} ctx
 */
export function setup({ schemas }) {
  const seoField = { id: 'seo', type: 'Link', linkType: 'Entry', name: 'SEO Metadata' };

  for (const ct of Object.values(schemas.getAll())) {
    if (ct.id === 'seoMetadata') continue;
    const hasSeo = ct.fields.some(f => f.id === 'seo');
    if (!hasSeo) {
      ct.fields.push(seoField);
    }
  }
}
