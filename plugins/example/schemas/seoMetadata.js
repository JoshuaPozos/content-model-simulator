/** @type {import('content-model-simulator').ContentTypeDefinition} */
export default {
  id: 'seoMetadata',
  name: 'SEO Metadata',
  description: 'SEO fields that can be linked from any page or post',
  displayField: 'title',
  fields: [
    { id: 'title', type: 'Symbol', required: true, localized: true },
    { id: 'description', type: 'Text', localized: true },
    { id: 'canonicalUrl', type: 'Symbol' },
    { id: 'noIndex', type: 'Boolean' },
    { id: 'ogImage', type: 'Link', linkType: 'Asset' },
    { id: 'keywords', type: 'Array', items: { type: 'Symbol' } },
  ],
};
