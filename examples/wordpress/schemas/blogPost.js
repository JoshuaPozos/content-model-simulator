/** @type {import('../../dist/types.js').ContentTypeDefinition} */
export default {
  id: 'blogPost',
  name: 'Blog Post',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
    { id: 'slug', name: 'Slug', type: 'Symbol', required: true, localized: false },
    { id: 'body', name: 'Body', type: 'RichText', required: false, localized: true },
    { id: 'excerpt', name: 'Excerpt', type: 'Text', required: false, localized: true },
    { id: 'publishDate', name: 'Publish Date', type: 'Date', required: false, localized: false },
    { id: 'author', name: 'Author', type: 'Symbol', required: false, localized: false },
    { id: 'categories', name: 'Categories', type: 'Array', items: { type: 'Symbol' }, required: false, localized: false },
    { id: 'tags', name: 'Tags', type: 'Array', items: { type: 'Symbol' }, required: false, localized: false },
    { id: 'status', name: 'Status', type: 'Symbol', required: false, localized: false },
  ],
};
