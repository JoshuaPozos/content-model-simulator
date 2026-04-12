import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractNestedObjects } from './nested-objects.js';
import type { ContentTypeDefinition, SchemaLike } from '../types.js';

const parentCtDef: ContentTypeDefinition = {
  id: 'page',
  name: 'Page',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol' },
    { id: 'slides', name: 'Slides', type: 'Array', items: { type: 'Link', linkType: 'Entry' } },
    { id: 'hero', name: 'Hero', type: 'Link', linkType: 'Entry' },
  ],
};

const slideDef: ContentTypeDefinition = {
  id: 'slide',
  name: 'Slide',
  fields: [
    { id: 'heading', name: 'Heading', type: 'Symbol' },
    { id: 'image', name: 'Image', type: 'Link', linkType: 'Asset' },
    { id: 'active', name: 'Active', type: 'Boolean' },
  ],
};

const heroDef: ContentTypeDefinition = {
  id: 'hero',
  name: 'Hero',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol' },
    { id: 'subtitle', name: 'Subtitle', type: 'Text' },
  ],
};

const fieldGroupMap = {
  page: {
    slides: { contentType: 'slide', multiple: true },
    hero: { contentType: 'hero', multiple: false },
  },
};

const schemas: SchemaLike = {
  get(id: string) {
    if (id === 'slide') return slideDef;
    if (id === 'hero') return heroDef;
    return null;
  }
};

describe('extractNestedObjects', () => {
  it('extracts multiple (array) nested objects', () => {
    const fields = {
      title: { en: 'Home Page' },
      slides: {
        en: [
          { heading: 'Slide 1', active: true },
          { heading: 'Slide 2', active: false },
        ]
      },
    };

    const result = extractNestedObjects(fields, 'page', {
      locale: 'en',
      baseLocale: 'en',
      parentEntryId: 'page_home_xyz',
      parentPath: '/home',
      urlToAssetId: new Map(),
      fieldGroupMap,
      schemas,
    });

    assert.equal(result.entries.length, 2);
    assert.equal(result.stats.extracted, 2);
    assert.equal(result.entries[0].contentType, 'slide');
    assert.equal(result.entries[0].fields.heading.en, 'Slide 1');
    assert.equal(result.entries[1].fields.heading.en, 'Slide 2');

    // Parent field should be replaced with links (mutated by extractNestedObjects)
    const linkedSlides = fields.slides.en as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(linkedSlides));
    assert.ok((linkedSlides[0].sys as Record<string, string>)?.linkType === 'Entry');
    assert.ok((linkedSlides[1].sys as Record<string, string>)?.linkType === 'Entry');
  });

  it('extracts single (non-array) nested object', () => {
    const fields = {
      title: { en: 'Home Page' },
      hero: {
        en: { title: 'Welcome', subtitle: 'Hello world' }
      },
    };

    const result = extractNestedObjects(fields, 'page', {
      locale: 'en',
      baseLocale: 'en',
      parentEntryId: 'page_home_xyz',
      parentPath: '/home',
      urlToAssetId: new Map(),
      fieldGroupMap,
      schemas,
    });

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].contentType, 'hero');
    assert.equal(result.entries[0].fields.title.en, 'Welcome');

    // Parent field replaced with link (mutated by extractNestedObjects)
    const linkedHero = fields.hero.en as Record<string, unknown>;
    assert.ok((linkedHero.sys as Record<string, string>)?.linkType === 'Entry');
  });

  it('returns empty when no config for parentContentType', () => {
    const fields = { title: { en: 'Hello' } };
    const result = extractNestedObjects(fields, 'unknownCT', {
      locale: 'en',
      baseLocale: 'en',
      parentEntryId: 'p1',
      fieldGroupMap,
      schemas,
    });

    assert.equal(result.entries.length, 0);
    assert.equal(result.stats.extracted, 0);
  });

  it('skips null field values', () => {
    const fields = {
      slides: { en: null },
      hero: { en: null },
    };

    const result = extractNestedObjects(fields, 'page', {
      locale: 'en',
      baseLocale: 'en',
      parentEntryId: 'p1',
      fieldGroupMap,
      schemas,
    });

    assert.equal(result.entries.length, 0);
  });

  it('preserves existing entry links in arrays', () => {
    const fields = {
      slides: {
        en: [
          { sys: { type: 'Link', linkType: 'Entry', id: 'existing-link' } },
          { heading: 'New Slide' },
        ]
      },
    };

    const result = extractNestedObjects(fields, 'page', {
      locale: 'en',
      baseLocale: 'en',
      parentEntryId: 'p1',
      urlToAssetId: new Map(),
      fieldGroupMap,
      schemas,
    });

    // Only the non-link item should be extracted
    assert.equal(result.entries.length, 1);
  });

  it('resolves image assets in nested objects', () => {
    const url = 'https://img.example.com/slide-bg.jpg';
    const urlToAssetId = new Map([[url, 'asset_slidebg_abc']]);

    const fields = {
      slides: {
        en: [
          { heading: 'Slide 1', image: { links: { resource: { href: url } } } },
        ]
      },
    };

    const result = extractNestedObjects(fields, 'page', {
      locale: 'en',
      baseLocale: 'en',
      parentEntryId: 'p1',
      parentPath: '/home',
      urlToAssetId,
      fieldGroupMap,
      schemas,
    });

    assert.equal(result.entries.length, 1);
    const imageField = result.entries[0].fields.image?.en as Record<string, Record<string, string>>;
    assert.equal(imageField.sys.linkType, 'Asset');
    assert.equal(imageField.sys.id, 'asset_slidebg_abc');
  });

  it('handles missing CT definition by copying fields as-is', () => {
    const noDefSchemas: SchemaLike = { get() { return null; } };
    const fields = {
      slides: { en: [{ heading: 'Slide', extra: 'data' }] },
    };

    const result = extractNestedObjects(fields, 'page', {
      locale: 'en',
      baseLocale: 'en',
      parentEntryId: 'p1',
      urlToAssetId: new Map(),
      fieldGroupMap,
      schemas: noDefSchemas,
    });

    assert.equal(result.entries.length, 1);
    assert.equal(result.entries[0].fields.heading.en, 'Slide');
    assert.equal(result.entries[0].fields.extra.en, 'data');
  });

  it('generates unique entry IDs', () => {
    const fields = {
      slides: {
        en: [
          { heading: 'A' },
          { heading: 'B' },
          { heading: 'C' },
        ]
      },
    };

    const result = extractNestedObjects(fields, 'page', {
      locale: 'en',
      baseLocale: 'en',
      parentEntryId: 'page_home',
      urlToAssetId: new Map(),
      fieldGroupMap,
      schemas,
    });

    const ids = result.entries.map(e => e.id);
    assert.equal(new Set(ids).size, ids.length, 'IDs should be unique');
  });
});
