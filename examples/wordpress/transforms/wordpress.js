/**
 * WordPress → Contentful transformer
 *
 * Maps WordPress post types to Contentful content types:
 *   post       → blogPost
 *   author     → author
 *   category   → category
 *   tag        → tag
 *   page       → (skipped — add a page schema to include)
 *   attachment  → (skipped — handled as assets)
 */

import { generateEntryId } from '../../../dist/transform/helpers.js';

export function register(transformers) {
  // Skip WordPress-internal types and attachments
  transformers.skip(['attachment', 'page', 'nav_menu_item', 'wp_navigation']);

  // post → blogPost
  transformers.register('post', (doc, locale) => {
    const d = doc.data || {};
    return {
      _metadata: {
        contentType: 'blogPost',
        entryId: generateEntryId('blogPost', `${d.slug || doc.id}-${locale}`),
        sourceType: 'post',
        sourcePath: doc.path,
      },
      fields: {
        title: { [locale]: d.title },
        slug: { [locale]: d.slug },
        body: { [locale]: d.body },          // HTML — auto-converted to Rich Text by simulator
        excerpt: { [locale]: d.excerpt || '' },
        publishDate: { [locale]: d.publishDate },
        author: { [locale]: d.author },
        categories: { [locale]: d.categories || [] },
        tags: { [locale]: d.tags || [] },
        status: { [locale]: d.status },
      },
    };
  }, 'blogPost');

  // author → author
  transformers.register('author', (doc, locale) => {
    const d = doc.data || {};
    return {
      _metadata: {
        contentType: 'author',
        entryId: generateEntryId('author', `${d.login}-${locale}`),
        sourceType: 'author',
        sourcePath: doc.path,
      },
      fields: {
        displayName: { [locale]: d.displayName },
        login: { [locale]: d.login },
        email: { [locale]: d.email || '' },
        firstName: { [locale]: d.firstName || '' },
        lastName: { [locale]: d.lastName || '' },
      },
    };
  }, 'author');

  // category → category
  transformers.register('category', (doc, locale) => {
    const d = doc.data || {};
    return {
      _metadata: {
        contentType: 'category',
        entryId: generateEntryId('category', `${d.slug}-${locale}`),
        sourceType: 'category',
        sourcePath: doc.path,
      },
      fields: {
        name: { [locale]: d.name },
        slug: { [locale]: d.slug },
      },
    };
  }, 'category');

  // tag → tag
  transformers.register('tag', (doc, locale) => {
    const d = doc.data || {};
    return {
      _metadata: {
        contentType: 'tag',
        entryId: generateEntryId('tag', `${d.slug}-${locale}`),
        sourceType: 'tag',
        sourcePath: doc.path,
      },
      fields: {
        name: { [locale]: d.name },
        slug: { [locale]: d.slug },
      },
    };
  }, 'tag');
}
