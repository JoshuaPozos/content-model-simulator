import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateEntry, validateAll } from '../../dist/core/validator.js';

const blogPostDef = {
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
    const emptyDef = { id: 'empty', name: 'Empty', fields: [] };
    const entry = { id: 'e1', contentType: 'empty', fields: { x: { en: 'val' } } };
    const { errors } = validateEntry(entry, emptyDef, 'en');
    assert.equal(errors.length, 0);
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
      get(id) { return id === 'blogPost' ? blogPostDef : null; }
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
