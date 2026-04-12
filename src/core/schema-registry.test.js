import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { SchemaRegistry } from './schema-registry.js';

const blogPostDef = {
  id: 'blogPost',
  name: 'Blog Post',
  displayField: 'title',
  fields: [
    { id: 'title', name: 'Title', type: 'Symbol', required: true },
    { id: 'body', name: 'Body', type: 'RichText' },
    { id: 'slug', name: 'Slug', type: 'Symbol' },
  ],
};

const authorDef = {
  id: 'author',
  name: 'Author',
  fields: [
    { id: 'name', name: 'Name', type: 'Symbol', required: true },
    { id: 'bio', name: 'Bio', type: 'Text' },
  ],
};

describe('SchemaRegistry', () => {
  let registry;

  beforeEach(() => {
    registry = new SchemaRegistry();
  });

  describe('register', () => {
    it('registers a definition', () => {
      registry.register(blogPostDef);
      assert.deepEqual(registry.get('blogPost'), blogPostDef);
    });

    it('throws on missing id', () => {
      assert.throws(() => registry.register({}), /must have an "id"/);
    });

    it('throws on null definition', () => {
      assert.throws(() => registry.register(null), /must have an "id"/);
    });

    it('overwrites existing definitions silently', () => {
      registry.register(blogPostDef);
      const updated = { ...blogPostDef, name: 'Updated Post' };
      registry.register(updated);
      assert.equal(registry.get('blogPost').name, 'Updated Post');
    });
  });

  describe('registerAll', () => {
    it('accepts an array of definitions', () => {
      registry.registerAll([blogPostDef, authorDef]);
      assert.ok(registry.has('blogPost'));
      assert.ok(registry.has('author'));
    });

    it('accepts an object keyed by CT id', () => {
      registry.registerAll({ blogPost: blogPostDef, author: authorDef });
      assert.ok(registry.has('blogPost'));
      assert.ok(registry.has('author'));
    });

    it('auto-assigns id from object key if missing', () => {
      registry.registerAll({
        myType: { name: 'My Type', fields: [{ id: 'f1', name: 'F1', type: 'Symbol' }] }
      });
      assert.ok(registry.has('myType'));
    });
  });

  describe('get', () => {
    it('returns null for unregistered types', () => {
      assert.equal(registry.get('nonexistent'), null);
    });
  });

  describe('getAll', () => {
    it('returns a plain object of all definitions', () => {
      registry.register(blogPostDef);
      registry.register(authorDef);
      const all = registry.getAll();
      assert.equal(typeof all, 'object');
      assert.ok(!Array.isArray(all));
      assert.equal(Object.keys(all).length, 2);
      assert.deepEqual(all.blogPost, blogPostDef);
    });

    it('returns empty object when empty', () => {
      assert.deepEqual(registry.getAll(), {});
    });
  });

  describe('getAllIds', () => {
    it('returns array of all registered IDs', () => {
      registry.register(blogPostDef);
      registry.register(authorDef);
      const ids = registry.getAllIds();
      assert.equal(ids.length, 2);
      assert.ok(ids.includes('blogPost'));
      assert.ok(ids.includes('author'));
    });
  });

  describe('has', () => {
    it('returns true for registered types', () => {
      registry.register(blogPostDef);
      assert.ok(registry.has('blogPost'));
    });

    it('returns false for unregistered types', () => {
      assert.ok(!registry.has('nonexistent'));
    });
  });

  describe('size', () => {
    it('returns 0 for empty registry', () => {
      assert.equal(registry.size, 0);
    });

    it('returns count of registered definitions', () => {
      registry.register(blogPostDef);
      registry.register(authorDef);
      assert.equal(registry.size, 2);
    });
  });

  describe('clear', () => {
    it('removes all definitions', () => {
      registry.register(blogPostDef);
      registry.register(authorDef);
      registry.clear();
      assert.equal(registry.size, 0);
      assert.equal(registry.get('blogPost'), null);
    });
  });

  describe('loadFromDirectory', () => {
    it('loads .json schema files', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-sim-test-'));
      try {
        fs.writeFileSync(
          path.join(tmpDir, 'blogPost.json'),
          JSON.stringify(blogPostDef)
        );
        await registry.loadFromDirectory(tmpDir);
        assert.ok(registry.has('blogPost'));
        assert.equal(registry.get('blogPost').name, 'Blog Post');
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('loads .js schema files with export default', async () => {
      const fs = await import('fs');
      const path = await import('path');
      const os = await import('os');

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cms-sim-test-'));
      try {
        fs.writeFileSync(
          path.join(tmpDir, 'author.js'),
          `export default ${JSON.stringify(authorDef)};`
        );
        await registry.loadFromDirectory(tmpDir);
        assert.ok(registry.has('author'));
      } finally {
        fs.rmSync(tmpDir, { recursive: true });
      }
    });

    it('throws on nonexistent directory', async () => {
      await assert.rejects(
        () => registry.loadFromDirectory('/nonexistent/path'),
        /does not exist/
      );
    });
  });
});
