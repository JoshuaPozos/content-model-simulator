/**
 * Migration 001: Create initial content types (prop-style)
 *
 * Demonstrates the prop-style API where field definitions are passed
 * as objects to createField().
 */
export default function (migration) {
  // ── Author ───────────────────────────────────────────────────
  const author = migration.createContentType('author', {
    name: 'Author',
    displayField: 'name',
    description: 'Blog authors',
  });

  author.createField('name', {
    name: 'Name',
    type: 'Symbol',
    required: true,
  });

  author.createField('bio', {
    name: 'Biography',
    type: 'Text',
    localized: true,
  });

  author.createField('avatar', {
    name: 'Avatar',
    type: 'Link',
    linkType: 'Asset',
  });

  // ── Blog Post ────────────────────────────────────────────────
  const blogPost = migration.createContentType('blogPost', {
    name: 'Blog Post',
    displayField: 'title',
    description: 'Blog post with rich content',
  });

  blogPost.createField('title', {
    name: 'Title',
    type: 'Symbol',
    required: true,
    localized: true,
  });

  blogPost.createField('slug', {
    name: 'Slug',
    type: 'Symbol',
    required: true,
    validations: [{ unique: true }],
  });

  blogPost.createField('body', {
    name: 'Body',
    type: 'RichText',
    localized: true,
  });

  blogPost.createField('author', {
    name: 'Author',
    type: 'Link',
    linkType: 'Entry',
    validations: [{ linkContentType: ['author'] }],
  });

  blogPost.createField('publishDate', {
    name: 'Publish Date',
    type: 'Date',
  });
}
