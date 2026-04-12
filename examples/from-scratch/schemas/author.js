/**
 * Example schema: Author
 */
export default {
  id: 'author',
  name: 'Author',
  displayField: 'name',
  fields: [
    { id: 'name', name: 'Name', type: 'Symbol', required: true, localized: false },
    { id: 'bio', name: 'Biography', type: 'Text', localized: true },
    { id: 'avatar', name: 'Avatar', type: 'Link', linkType: 'Asset' },
    { id: 'email', name: 'Email', type: 'Symbol' },
    { id: 'twitter', name: 'Twitter Handle', type: 'Symbol' },
  ],
};
