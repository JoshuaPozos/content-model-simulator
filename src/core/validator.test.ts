import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry, validateAll } from './validator.js';
import type { ContentTypeDefinition } from '../types.js';

const blogPostDef: ContentTypeDefinition = {
  id: 'blogPost',
  name: 'Blog Post',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    { id: 'body', name: 'Body', type: 'RichText' },
    { id: 'image', name: 'Image', type: 'Link', linkType: 'Asset' },
  ],
};

describe('validateEntry', () => {
  it('returns no errors/warnings for a valid entry', () => {
    const entry = {
      id: 'entry1',
      contentType: 'blogPost',
      fields: {
        title: { en: 'Hello World' },
        body: { en: '<p>content</p>' },
      },
    };
    const { errors, warnings } = validateEntry(entry, blogPostDef, 'en');
    assert.equal(errors.length, 0);
    // May have NULL_FIELD for image and body, that's fine
  });

  it('reports MISSING_CT_DEFINITION when no def provided', () => {
    const entry = { id: 'e1', contentType: 'unknown', fields: {} };
    const { errors } = validateEntry(entry, null, 'en');
    assert.equal(errors.length, 1);
    assert.equal(errors[0].type, 'MISSING_CT_DEFINITION');
  });

  it('warns about unknown fields', () => {
    const entry = {
      id: 'e1',
      contentType: 'blogPost',
      fields: {
        title: { en: 'Hello' },
        unknownField: { en: 'value' },
      },
    };
    const { warnings } = validateEntry(entry, blogPostDef, 'en');
    const unknownWarnings = warnings.filter(w => w.type === 'FIELD_NOT_IN_DEFINITION');
    assert.ok(unknownWarnings.length > 0);
    assert.equal(unknownWarnings[0].field, 'unknownField');
  });

  it('skips "locale" field from unknown field check', () => {
    const entry = {
      id: 'e1',
      contentType: 'blogPost',
      fields: {
        title: { en: 'Hello' },
        locale: { en: 'en' },
      },
    };
    const { warnings } = validateEntry(entry, blogPostDef, 'en');
    const unknownWarnings = warnings.filter(w => w.type === 'FIELD_NOT_IN_DEFINITION');
    assert.equal(unknownWarnings.length, 0);
  });

  it('warns about required fields missing', () => {
    const entry = {
      id: 'e1',
      contentType: 'blogPost',
      fields: {
        body: { en: 'content' },
      },
    };
    const { warnings } = validateEntry(entry, blogPostDef, 'en');
    const requiredWarnings = warnings.filter(w => w.type === 'REQUIRED_FIELD_MISSING');
    assert.ok(requiredWarnings.length > 0);
    assert.equal(requiredWarnings[0].field, 'title');
  });

  it('warns about asset fields not properly linked', () => {
    const entry = {
      id: 'e1',
      contentType: 'blogPost',
      fields: {
        title: { en: 'Hi' },
        image: { en: { links: { resource: { href: 'https://example.com/img.jpg' } } } },
      },
    };
    const { warnings } = validateEntry(entry, blogPostDef, 'en');
    const assetWarnings = warnings.filter(w => w.type === 'ASSET_FIELD_NOT_LINKED');
    assert.ok(assetWarnings.length > 0);
  });

  it('does not warn when asset field is a proper link', () => {
    const entry = {
      id: 'e1',
      contentType: 'blogPost',
      fields: {
        title: { en: 'Hi' },
        image: { en: { sys: { type: 'Link', linkType: 'Asset', id: 'img1' } } },
      },
    };
    const { warnings } = validateEntry(entry, blogPostDef, 'en');
    const assetWarnings = warnings.filter(w => w.type === 'ASSET_FIELD_NOT_LINKED');
    assert.equal(assetWarnings.length, 0);
  });

  it('warns about null fields', () => {
    const entry = {
      id: 'e1',
      contentType: 'blogPost',
      fields: {
        title: { en: null },
      },
    };
    const { warnings } = validateEntry(entry, blogPostDef, 'en');
    const nullWarnings = warnings.filter(w => w.type === 'NULL_FIELD');
    assert.ok(nullWarnings.length > 0);
  });

  it('warns about entry ID > 64 chars', () => {
    const entry = {
      id: 'a'.repeat(65),
      contentType: 'blogPost',
      fields: { title: { en: 'Hello' } },
    };
    const { warnings } = validateEntry(entry, blogPostDef, 'en');
    const idWarnings = warnings.filter(w => w.type === 'ENTRY_ID_TRUNCATED');
    assert.ok(idWarnings.length > 0);
  });

  it('handles definition with empty fields array', () => {
    const emptyDef: ContentTypeDefinition = { id: 'empty', name: 'Empty', fields: [] };
    const entry = { id: 'e1', contentType: 'empty', fields: { x: { en: 'val' } } };
    const { errors } = validateEntry(entry, emptyDef, 'en');
    assert.equal(errors.length, 0);
  });

  it('warns VALIDATION_IN when value is not in allowed list', () => {
    const def: ContentTypeDefinition = {
      id: 'project', name: 'Project', fields: [
        { id: 'status', name: 'Status', type: 'Symbol', validations: [{ in: ['active', 'completed', 'archived'] }] },
      ],
    };
    const entry = { id: 'e1', contentType: 'project', fields: { status: { en: 'draft' } } };
    const { warnings } = validateEntry(entry, def, 'en');
    const inWarnings = warnings.filter(w => w.type === 'VALIDATION_IN');
    assert.equal(inWarnings.length, 1);
    assert.ok(inWarnings[0].message!.includes('draft'));
  });

  it('does not warn VALIDATION_IN when value is allowed', () => {
    const def: ContentTypeDefinition = {
      id: 'project', name: 'Project', fields: [
        { id: 'status', name: 'Status', type: 'Symbol', validations: [{ in: ['active', 'completed'] }] },
      ],
    };
    const entry = { id: 'e1', contentType: 'project', fields: { status: { en: 'active' } } };
    const { warnings } = validateEntry(entry, def, 'en');
    assert.equal(warnings.filter(w => w.type === 'VALIDATION_IN').length, 0);
  });

  it('warns VALIDATION_REGEXP when value does not match pattern', () => {
    const def: ContentTypeDefinition = {
      id: 'page', name: 'Page', fields: [
        { id: 'slug', name: 'Slug', type: 'Symbol', validations: [{ regexp: { pattern: '^[a-z0-9-]+$' } }] },
      ],
    };
    const entry = { id: 'e1', contentType: 'page', fields: { slug: { en: 'INVALID SLUG!' } } };
    const { warnings } = validateEntry(entry, def, 'en');
    const reWarnings = warnings.filter(w => w.type === 'VALIDATION_REGEXP');
    assert.equal(reWarnings.length, 1);
  });

  it('warns VALIDATION_SIZE when string is too short', () => {
    const def: ContentTypeDefinition = {
      id: 'post', name: 'Post', fields: [
        { id: 'title', name: 'Title', type: 'Symbol', validations: [{ size: { min: 5, max: 100 } }] },
      ],
    };
    const entry = { id: 'e1', contentType: 'post', fields: { title: { en: 'Hi' } } };
    const { warnings } = validateEntry(entry, def, 'en');
    assert.ok(warnings.some(w => w.type === 'VALIDATION_SIZE'));
  });

  it('warns VALIDATION_RANGE when number is out of bounds', () => {
    const def: ContentTypeDefinition = {
      id: 'product', name: 'Product', fields: [
        { id: 'price', name: 'Price', type: 'Number', validations: [{ range: { min: 0, max: 10000 } }] },
      ],
    };
    const entry = { id: 'e1', contentType: 'product', fields: { price: { en: -5 } } };
    const { warnings } = validateEntry(entry, def, 'en');
    assert.ok(warnings.some(w => w.type === 'VALIDATION_RANGE'));
  });

  it('warns VALIDATION_DATE_RANGE when date is out of bounds', () => {
    const def: ContentTypeDefinition = {
      id: 'event', name: 'Event', fields: [
        { id: 'date', name: 'Date', type: 'Date', validations: [{ dateRange: { min: '2026-01-01', max: '2026-12-31' } }] },
      ],
    };
    const entry = { id: 'e1', contentType: 'event', fields: { date: { en: '2025-06-15' } } };
    const { warnings } = validateEntry(entry, def, 'en');
    assert.ok(warnings.some(w => w.type === 'VALIDATION_DATE_RANGE'));
  });

  it('skips validation checks for null/undefined field values', () => {
    const def: ContentTypeDefinition = {
      id: 'project', name: 'Project', fields: [
        { id: 'status', name: 'Status', type: 'Symbol', validations: [{ in: ['active', 'completed'] }] },
      ],
    };
    const entry = { id: 'e1', contentType: 'project', fields: { status: { en: null } } };
    const { warnings } = validateEntry(entry, def, 'en');
    assert.equal(warnings.filter(w => w.type === 'VALIDATION_IN').length, 0);
  });
});

describe('validateAll — unique validation', () => {
  it('warns VALIDATION_UNIQUE for duplicate values across entries', () => {
    const def: ContentTypeDefinition = {
      id: 'page', name: 'Page', fields: [
        { id: 'slug', name: 'Slug', type: 'Symbol', validations: [{ unique: true }] },
      ],
    };
    const entries = [
      { id: 'e1', contentType: 'page', fields: { slug: { en: '/about' } } },
      { id: 'e2', contentType: 'page', fields: { slug: { en: '/about' } } },
    ];
    const result = validateAll(entries, { page: def }, 'en');
    assert.ok(result.warnings.some(w => w.type === 'VALIDATION_UNIQUE'));
  });

  it('does not warn VALIDATION_UNIQUE for distinct values', () => {
    const def: ContentTypeDefinition = {
      id: 'page', name: 'Page', fields: [
        { id: 'slug', name: 'Slug', type: 'Symbol', validations: [{ unique: true }] },
      ],
    };
    const entries = [
      { id: 'e1', contentType: 'page', fields: { slug: { en: '/about' } } },
      { id: 'e2', contentType: 'page', fields: { slug: { en: '/contact' } } },
    ];
    const result = validateAll(entries, { page: def }, 'en');
    assert.equal(result.warnings.filter(w => w.type === 'VALIDATION_UNIQUE').length, 0);
  });
});

describe('validateAll', () => {
  it('validates multiple entries', () => {
    const entries = [
      { id: 'e1', contentType: 'blogPost', fields: { title: { en: 'Hello' } } },
      { id: 'e2', contentType: 'blogPost', fields: { title: { en: null } } },
    ];
    const schemas = { blogPost: blogPostDef };
    const result = validateAll(entries, schemas, 'en');
    assert.ok(result.errors.length === 0);
    assert.ok(result.warnings.length > 0);
  });

  it('works with SchemaRegistry-like objects', () => {
    const schemas = {
      get(id: string) { return id === 'blogPost' ? blogPostDef : null; }
    };
    const entries = [
      { id: 'e1', contentType: 'blogPost', fields: { title: { en: 'Hello' } } },
    ];
    const result = validateAll(entries, schemas, 'en');
    assert.equal(result.errors.length, 0);
  });

  it('reports error for missing CT definition', () => {
    const entries = [
      { id: 'e1', contentType: 'unknown', fields: {} },
    ];
    const result = validateAll(entries, {}, 'en');
    assert.ok(result.errors.length > 0);
    assert.equal(result.errors[0].type, 'MISSING_CT_DEFINITION');
  });
});
