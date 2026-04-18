/**
 * Migration 003: Refine fields — rename, edit, delete
 *
 * Demonstrates editField, changeFieldId, and adding fields to
 * existing content types across multiple migration files.
 */
export default function (migration) {
  const blogPost = migration.editContentType('blogPost');

  // Mark body as required
  blogPost.editField('body').required(true);

  // Rename publishDate → date
  blogPost.changeFieldId('publishDate', 'date');

  // Add a featured image
  blogPost.createField('featuredImage', {
    name: 'Featured Image',
    type: 'Link',
    linkType: 'Asset',
  });

  // Add email to author
  const author = migration.editContentType('author');
  author.createField('email', {
    name: 'Email',
    type: 'Symbol',
    validations: [{ regexp: { pattern: '^.+@.+\\..+$' } }],
  });
}
