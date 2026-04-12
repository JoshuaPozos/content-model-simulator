/**
 * Example schema: Blog Post
 */
export default {
  id: 'blogPost',
  name: 'Blog Post',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true, localized: true },
    { id: 'slug', name: 'Slug', type: 'Symbol', required: true, localized: false },
    { id: 'body', name: 'Body', type: 'Text', required: true, localized: true },
    { id: 'excerpt', name: 'Excerpt', type: 'Text', localized: true },
    { id: 'author', name: 'Author', type: 'Symbol', localized: false },
    { id: 'publishDate', name: 'Publish Date', type: 'Date', required: true },
    { id: 'heroImage', name: 'Hero Image', type: 'Link', linkType: 'Asset' },
    { id: 'category', name: 'Category', type: 'Symbol', validations: [{ in: ['Tech', 'Design', 'Business', 'Lifestyle'] }] },
    { id: 'tags', name: 'Tags', type: 'Array', items: { type: 'Symbol' } },
    { id: 'relatedPosts', name: 'Related Posts', type: 'Array', items: { type: 'Link', linkType: 'Entry' } },
  ],
};
