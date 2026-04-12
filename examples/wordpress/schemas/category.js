/** @type {import('../../dist/types.js').ContentTypeDefinition} */
export default {
  id: 'category',
  name: 'Category',
  fields: [
    { id: 'name', name: 'Name', type: 'Symbol', required: true, localized: true },
    { id: 'slug', name: 'Slug', type: 'Symbol', required: true, localized: false },
  ],
};
