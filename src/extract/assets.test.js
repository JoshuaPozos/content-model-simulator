import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAssets, linkAssets } from '../../dist/extract/assets.js';

describe('extractAssets', () => {
  it('extracts assets from documents with image objects', () => {
    const docs = [
      {
        id: 'doc1',
        path: '/blog/hello',
        fields: {
          hero: { links: { resource: { href: 'https://images.example.com/hero.jpg' } } },
          title: 'Hello',
        },
      },
    ];
    const { assets, urlToAssetId } = extractAssets(docs);
    assert.equal(assets.length, 1);
    assert.ok(assets[0].id.startsWith('asset_'));
    assert.equal(assets[0].url, 'https://images.example.com/hero.jpg');
    assert.equal(assets[0].title, 'hero.jpg');
    assert.deepEqual(assets[0].referencedBy, ['/blog/hello']);
    assert.ok(urlToAssetId.has('https://images.example.com/hero.jpg'));
  });

  it('deduplicates assets by URL', () => {
    const url = 'https://images.example.com/shared.jpg';
    const docs = [
      { id: '1', path: '/a', fields: { img: { links: { resource: { href: url } } } } },
      { id: '2', path: '/b', fields: { img: { links: { resource: { href: url } } } } },
    ];
    const { assets } = extractAssets(docs);
    assert.equal(assets.length, 1);
    assert.equal(assets[0].referencedBy.length, 2);
  });

  it('ignores non-HTTP URLs', () => {
    const docs = [
      { id: '1', fields: { img: { links: { resource: { href: 'data:image/png;base64,xxx' } } } } },
    ];
    const { assets } = extractAssets(docs);
    assert.equal(assets.length, 0);
  });

  it('walks nested arrays', () => {
    const docs = [
      {
        id: '1',
        path: '/x',
        fields: {
          gallery: [
            { links: { resource: { href: 'https://img.example.com/a.jpg' } } },
            { links: { resource: { href: 'https://img.example.com/b.jpg' } } },
          ],
        },
      },
    ];
    const { assets } = extractAssets(docs);
    assert.equal(assets.length, 2);
  });

  it('returns empty for documents with no assets', () => {
    const docs = [{ id: '1', fields: { title: 'Hello', count: 42 } }];
    const { assets, urlToAssetId } = extractAssets(docs);
    assert.equal(assets.length, 0);
    assert.equal(urlToAssetId.size, 0);
  });

  it('handles null/undefined field values', () => {
    const docs = [{ id: '1', fields: { x: null, y: undefined } }];
    const { assets } = extractAssets(docs);
    assert.equal(assets.length, 0);
  });

  it('supports custom isAsset detector', () => {
    const docs = [
      { id: '1', fields: { media: { type: 'image', src: 'https://cdn.example.com/pic.jpg' } } },
    ];
    const { assets } = extractAssets(docs, {
      isAsset: (obj) => obj?.type === 'image' && obj?.src,
      getAssetUrl: (obj) => obj.src,
    });
    assert.equal(assets.length, 1);
    assert.equal(assets[0].url, 'https://cdn.example.com/pic.jpg');
  });

  it('uses doc.id as fallback for doc.path', () => {
    const docs = [
      {
        id: 'fallback-id',
        fields: { img: { links: { resource: { href: 'https://img.example.com/x.jpg' } } } },
      },
    ];
    const { assets } = extractAssets(docs);
    assert.deepEqual(assets[0].referencedBy, ['fallback-id']);
  });
});

describe('linkAssets', () => {
  it('replaces image objects with Asset link references', () => {
    const url = 'https://images.example.com/hero.jpg';
    const urlToAssetId = new Map([[url, 'asset_hero_xyz']]);
    const fields = {
      hero: { en: { links: { resource: { href: url } } } },
    };

    linkAssets(fields, urlToAssetId, 'en');

    assert.deepEqual(fields.hero, {
      en: { sys: { type: 'Link', linkType: 'Asset', id: 'asset_hero_xyz' } }
    });
  });

  it('does not modify non-asset fields', () => {
    const urlToAssetId = new Map();
    const fields = {
      title: { en: 'Hello World' },
      count: { en: 42 },
    };
    const originalFields = JSON.parse(JSON.stringify(fields));

    linkAssets(fields, urlToAssetId, 'en');

    assert.deepEqual(fields, originalFields);
  });

  it('does not modify asset fields with unknown URLs', () => {
    const urlToAssetId = new Map();
    const url = 'https://images.example.com/unknown.jpg';
    const fields = {
      hero: { en: { links: { resource: { href: url } } } },
    };

    linkAssets(fields, urlToAssetId, 'en');

    // Not replaced — URL not in map
    assert.ok(fields.hero.en.links?.resource?.href);
  });

  it('handles null field values', () => {
    const urlToAssetId = new Map();
    const fields = { x: { en: null } };
    linkAssets(fields, urlToAssetId, 'en');
    assert.equal(fields.x.en, null);
  });
});
