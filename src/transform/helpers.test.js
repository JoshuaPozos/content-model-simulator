import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateEntryId,
  simpleHash,
  extractSelectKey,
  isImageObject,
  extractImageUrl,
  createLink,
  isLink,
} from '../../dist/transform/helpers.js';

describe('simpleHash', () => {
  it('returns a deterministic hash string', () => {
    assert.equal(simpleHash('hello'), simpleHash('hello'));
  });

  it('returns different hashes for different inputs', () => {
    assert.notEqual(simpleHash('hello'), simpleHash('world'));
  });

  it('returns a base36 string', () => {
    const hash = simpleHash('test');
    assert.match(hash, /^[a-z0-9]+$/);
  });

  it('handles empty string', () => {
    const hash = simpleHash('');
    assert.equal(typeof hash, 'string');
    assert.ok(hash.length > 0);
  });
});

describe('generateEntryId', () => {
  it('returns a string <= 64 characters', () => {
    const id = generateEntryId('blogPost', 'some-seed-value');
    assert.ok(id.length <= 64);
  });

  it('is deterministic', () => {
    const a = generateEntryId('blogPost', 'seed1');
    const b = generateEntryId('blogPost', 'seed1');
    assert.equal(a, b);
  });

  it('strips non-alphanumeric chars from prefix', () => {
    const id = generateEntryId('my-content-type!', 'seed');
    assert.ok(!id.startsWith('my-'));
    assert.ok(id.startsWith('mycontenttype'));
  });

  it('truncates long combinations to 64 chars', () => {
    const id = generateEntryId('a'.repeat(100), 'b'.repeat(100));
    assert.ok(id.length <= 64);
  });

  it('produces different IDs for different seeds', () => {
    const a = generateEntryId('ct', 'seed-a');
    const b = generateEntryId('ct', 'seed-b');
    assert.notEqual(a, b);
  });
});

describe('extractSelectKey', () => {
  it('returns null for null/undefined', () => {
    assert.equal(extractSelectKey(null), null);
    assert.equal(extractSelectKey(undefined), null);
  });

  it('returns string values as-is', () => {
    assert.equal(extractSelectKey('hello'), 'hello');
  });

  it('extracts the first key from { key: "Label" } objects', () => {
    assert.equal(extractSelectKey({ active: 'Active' }), 'active');
  });

  it('trims whitespace from keys', () => {
    assert.equal(extractSelectKey({ '  spaced  ': 'Label' }), 'spaced');
  });

  it('returns null for empty objects', () => {
    assert.equal(extractSelectKey({}), null);
  });

  it('returns null for arrays', () => {
    assert.equal(extractSelectKey([1, 2]), null);
  });

  it('returns null for objects with sys (links)', () => {
    assert.equal(extractSelectKey({ sys: { type: 'Link' } }), null);
  });
});

describe('isImageObject', () => {
  it('returns true for objects with links.resource.href', () => {
    assert.ok(isImageObject({ links: { resource: { href: 'https://example.com/img.jpg' } } }));
  });

  it('returns false for null', () => {
    assert.ok(!isImageObject(null));
  });

  it('returns false for plain objects', () => {
    assert.ok(!isImageObject({ key: 'value' }));
  });

  it('returns false for strings', () => {
    assert.ok(!isImageObject('string'));
  });

  it('returns false for partial structure', () => {
    assert.ok(!isImageObject({ links: {} }));
    assert.ok(!isImageObject({ links: { resource: {} } }));
  });
});

describe('extractImageUrl', () => {
  it('extracts href from image objects', () => {
    assert.equal(
      extractImageUrl({ links: { resource: { href: 'https://example.com/img.jpg' } } }),
      'https://example.com/img.jpg'
    );
  });

  it('returns null for non-image objects', () => {
    assert.equal(extractImageUrl({ key: 'value' }), null);
  });

  it('returns null for null', () => {
    assert.equal(extractImageUrl(null), null);
  });
});

describe('createLink', () => {
  it('creates an Entry link', () => {
    const link = createLink('Entry', 'abc123');
    assert.deepEqual(link, { sys: { type: 'Link', linkType: 'Entry', id: 'abc123' } });
  });

  it('creates an Asset link', () => {
    const link = createLink('Asset', 'img1');
    assert.deepEqual(link, { sys: { type: 'Link', linkType: 'Asset', id: 'img1' } });
  });
});

describe('isLink', () => {
  it('returns true for link objects', () => {
    assert.ok(isLink({ sys: { type: 'Link', linkType: 'Entry', id: 'x' } }));
  });

  it('returns true for matching linkType', () => {
    assert.ok(isLink({ sys: { type: 'Link', linkType: 'Asset', id: 'x' } }, 'Asset'));
  });

  it('returns false for non-matching linkType', () => {
    assert.ok(!isLink({ sys: { type: 'Link', linkType: 'Entry', id: 'x' } }, 'Asset'));
  });

  it('returns false for null', () => {
    assert.ok(!isLink(null));
  });

  it('returns false for plain objects', () => {
    assert.ok(!isLink({ key: 'value' }));
  });
});
