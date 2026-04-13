/** @type {import('../../dist/types.js').ContentTypeDefinition} */
export default {
  id: 'author',
  name: 'Author',
  description: 'Migrated from Sanity author type',
  displayField: 'name',
  fields: [
    { id: 'name', name: 'Name', type: 'Symbol', required: true, localized: true },
    { id: 'slug', name: 'Slug', type: 'Symbol', required: true },
    { id: 'bio', name: 'Bio', type: 'Text' },
    { id: 'avatar', name: 'Avatar', type: 'Link', linkType: 'Asset' },
  ],
};
