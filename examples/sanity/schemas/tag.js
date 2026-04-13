/** @type {import('../../dist/types.js').ContentTypeDefinition} */
export default {
  id: 'tag',
  name: 'Tag',
  description: 'Migrated from Sanity tag type',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
  ],
};
