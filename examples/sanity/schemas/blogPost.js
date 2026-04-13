/** @type {import('../../dist/types.js').ContentTypeDefinition} */
export default {
  id: 'blogPost',
  name: 'Blog Post',
  description: 'Migrated from Sanity post type',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
    { id: 'slug', name: 'Slug', type: 'Symbol', required: true },
    { id: 'body', name: 'Body', type: 'RichText', localized: true },
    { id: 'excerpt', name: 'Excerpt', type: 'Text', localized: true },
    { id: 'mainImage', name: 'Main Image', type: 'Link', linkType: 'Asset' },
    { id: 'author', name: 'Author', type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['author'] }] },
    { id: 'categories', name: 'Categories', type: 'Array', items: { type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['category'] }] } },
    { id: 'tags', name: 'Tags', type: 'Array', items: { type: 'Link', linkType: 'Entry', validations: [{ linkContentType: ['tag'] }] } },
    { id: 'publishDate', name: 'Publish Date', type: 'Date' },
    { id: 'featured', name: 'Featured', type: 'Boolean' },
  ],
};
