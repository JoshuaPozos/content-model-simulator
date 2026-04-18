/**
 * Migration 002: Add category and tags (fluent chaining style)
 *
 * Demonstrates the fluent-chaining API where methods return `this`
 * for chaining: .name('X').type('Symbol').required(true)
 */
export default function (migration) {
  // ── Category (fluent style) ──────────────────────────────────
  const category = migration.createContentType('category');
  category.name('Category');
  category.displayField('title');
  category.description('Blog categories');

  category.createField('title')
    .name('Title')
    .type('Symbol')
    .required(true);

  category.createField('description')
    .name('Description')
    .type('Text');

  category.createField('icon')
    .name('Icon')
    .type('Link')
    .linkType('Asset');

  // ── Edit blogPost: add tags & category ───────────────────────
  const blogPost = migration.editContentType('blogPost');

  blogPost.createField('tags', {
    name: 'Tags',
    type: 'Array',
    items: {
      type: 'Symbol',
      validations: [{ in: ['news', 'tutorial', 'opinion', 'review'] }],
    },
  });

  blogPost.createField('category', {
    name: 'Category',
    type: 'Link',
    linkType: 'Entry',
    validations: [{ linkContentType: ['category'] }],
  });

  // Data transforms are no-ops (schema-only mock)
  migration.transformEntries({
    contentType: 'blogPost',
    from: ['title'],
    to: ['slug'],
    transformEntryForLocale: (from) => ({
      slug: from.title?.toLowerCase().replace(/\s+/g, '-'),
    }),
  });
}
