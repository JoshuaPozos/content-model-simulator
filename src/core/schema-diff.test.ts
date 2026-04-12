import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diffSchemas, formatDiff } from './schema-diff.js';
import type { ContentTypeDefinition } from '../types.js';

const blogPostV1: ContentTypeDefinition = {
  id: 'blogPost',
  name: 'Blog Post',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    { id: 'body', name: 'Body', type: 'Text' },
    { id: 'slug', name: 'Slug', type: 'Symbol' },
  ],
};

const blogPostV2: ContentTypeDefinition = {
  id: 'blogPost',
  name: 'Blog Post',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    { id: 'body', name: 'Body', type: 'RichText' }, // changed type
    { id: 'slug', name: 'Slug', type: 'Symbol' },
    { id: 'author', name: 'Author', type: 'Link', linkType: 'Entry' }, // added
  ],
};

const authorDef: ContentTypeDefinition = {
  id: 'author',
  name: 'Author',
  fields: [
    { id: 'name', name: 'Name', type: 'Symbol', required: true },
  ],
};

describe('diffSchemas', () => {
  it('detects no changes for identical schemas', () => {
    const result = diffSchemas({ blogPost: blogPostV1 }, { blogPost: blogPostV1 });
    assert.equal(result.changes.length, 0);
    assert.equal(result.summary.unchanged, 1);
    assert.equal(result.summary.added, 0);
    assert.equal(result.summary.removed, 0);
    assert.equal(result.summary.changed, 0);
  });

  it('detects added content types', () => {
    const result = diffSchemas(
      { blogPost: blogPostV1 },
      { blogPost: blogPostV1, author: authorDef },
    );
    assert.equal(result.summary.added, 1);
    assert.equal(result.summary.unchanged, 1);
    const added = result.changes.find(c => c.contentTypeId === 'author');
    assert.ok(added);
    assert.equal(added.kind, 'added');
    assert.equal(added.fieldChanges.length, 1);
    assert.equal(added.fieldChanges[0].fieldId, 'name');
  });

  it('detects removed content types', () => {
    const result = diffSchemas(
      { blogPost: blogPostV1, author: authorDef },
      { blogPost: blogPostV1 },
    );
    assert.equal(result.summary.removed, 1);
    const removed = result.changes.find(c => c.contentTypeId === 'author');
    assert.ok(removed);
    assert.equal(removed.kind, 'removed');
  });

  it('detects changed fields (type change)', () => {
    const result = diffSchemas(
      { blogPost: blogPostV1 },
      { blogPost: blogPostV2 },
    );
    assert.equal(result.summary.changed, 1);
    const changed = result.changes.find(c => c.contentTypeId === 'blogPost');
    assert.ok(changed);
    assert.equal(changed.kind, 'changed');

    const bodyChange = changed.fieldChanges.find(f => f.fieldId === 'body');
    assert.ok(bodyChange);
    assert.equal(bodyChange.kind, 'changed');
    assert.ok(bodyChange.details?.includes('Text → RichText'));

    const authorAdd = changed.fieldChanges.find(f => f.fieldId === 'author');
    assert.ok(authorAdd);
    assert.equal(authorAdd.kind, 'added');
  });

  it('detects removed fields', () => {
    const v1 = { ...blogPostV1, fields: [...blogPostV1.fields] };
    const v2: ContentTypeDefinition = {
      ...blogPostV1,
      fields: blogPostV1.fields.filter(f => f.id !== 'slug'),
    };
    const result = diffSchemas({ blogPost: v1 }, { blogPost: v2 });
    assert.equal(result.summary.changed, 1);
    const slugChange = result.changes[0].fieldChanges.find(f => f.fieldId === 'slug');
    assert.ok(slugChange);
    assert.equal(slugChange.kind, 'removed');
  });

  it('detects required flag change', () => {
    const v2: ContentTypeDefinition = {
      id: 'blogPost',
      name: 'Blog Post',
      fields: [
        { id: 'title', name: 'Title', type: 'Symbol', required: false },
        { id: 'body', name: 'Body', type: 'Text' },
        { id: 'slug', name: 'Slug', type: 'Symbol' },
      ],
    };
    const result = diffSchemas({ blogPost: blogPostV1 }, { blogPost: v2 });
    assert.equal(result.summary.changed, 1);
    const titleChange = result.changes[0].fieldChanges.find(f => f.fieldId === 'title');
    assert.ok(titleChange);
    assert.ok(titleChange.details?.includes('required'));
  });

  it('handles empty schemas', () => {
    const result = diffSchemas({}, {});
    assert.equal(result.changes.length, 0);
    assert.equal(result.summary.unchanged, 0);
  });
});

describe('formatDiff', () => {
  it('returns "No differences" for identical schemas', () => {
    const result = diffSchemas({ blogPost: blogPostV1 }, { blogPost: blogPostV1 });
    const text = formatDiff(result, { color: false });
    assert.ok(text.includes('No differences'));
  });

  it('shows + for added, - for removed, ~ for changed', () => {
    const result = diffSchemas(
      { blogPost: blogPostV1 },
      { blogPost: blogPostV2, author: authorDef },
    );
    const text = formatDiff(result, { color: false });
    assert.ok(text.includes('+ author'));
    assert.ok(text.includes('~ blogPost'));
    assert.ok(text.includes('Summary:'));
  });

  it('includes summary counts', () => {
    const result = diffSchemas(
      { blogPost: blogPostV1, author: authorDef },
      { blogPost: blogPostV2 },
    );
    const text = formatDiff(result, { color: false });
    assert.ok(text.includes('-1'));
    assert.ok(text.includes('~1'));
  });
});
