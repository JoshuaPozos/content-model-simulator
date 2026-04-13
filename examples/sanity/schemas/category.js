/** @type {import('../../dist/types.js').ContentTypeDefinition} */
export default {
  id: 'category',
  name: 'Category',
  description: 'Migrated from Sanity category type',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    { id: 'slug', name: 'Slug', type: 'Symbol', required: true },
    { id: 'description', name: 'Description', type: 'Text' },
  ],
};
