/**
 * Tests for src/contentful/migration-adapter.ts
 *
 * Tests the MigrationMock, FieldMock, ContentTypeMock classes,
 * fromMigrations/fromMigration API, writeMigrationSchemas, and
 * discoverMigrationFiles.
 */
import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  MigrationMock,
  fromMigrations,
  fromMigration,
  writeMigrationSchemas,
  discoverMigrationFiles,
} from './migration-adapter.js';

// ── Helper ───────────────────────────────────────────────────────

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cms-mig-test-'));
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

// ── MigrationMock ────────────────────────────────────────────────

describe('MigrationMock', () => {
  // ── createContentType ────────────────────────────────────────

  describe('createContentType', () => {
    it('creates a CT with prop-style', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('blogPost', {
        name: 'Blog Post',
        displayField: 'title',
        description: 'A blog post',
      });
      ct.createField('title', { name: 'Title', type: 'Symbol', required: true, localized: true });
      ct.createField('body', { name: 'Body', type: 'RichText' });

      const schemas = mock.getSchemas();
      assert.equal(schemas.length, 1);
      assert.equal(schemas[0].id, 'blogPost');
      assert.equal(schemas[0].name, 'Blog Post');
      assert.equal(schemas[0].displayField, 'title');
      assert.equal(schemas[0].description, 'A blog post');
      assert.equal(schemas[0].fields.length, 2);
      assert.equal(schemas[0].fields[0].id, 'title');
      assert.equal(schemas[0].fields[0].type, 'Symbol');
      assert.equal(schemas[0].fields[0].required, true);
      assert.equal(schemas[0].fields[0].localized, true);
      assert.equal(schemas[0].fields[1].type, 'RichText');
    });

    it('creates a CT with fluent chaining', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('author');
      ct.name('Author');
      ct.displayField('name');
      ct.description('An author');
      ct.createField('name').name('Name').type('Symbol').required(true);
      ct.createField('bio').name('Bio').type('Text').localized(true);

      const schemas = mock.getSchemas();
      assert.equal(schemas.length, 1);
      assert.equal(schemas[0].name, 'Author');
      assert.equal(schemas[0].displayField, 'name');
      assert.equal(schemas[0].description, 'An author');
      assert.equal(schemas[0].fields[0].id, 'name');
      assert.equal(schemas[0].fields[0].required, true);
      assert.equal(schemas[0].fields[1].localized, true);
    });

    it('defaults name to id when not provided', () => {
      const mock = new MigrationMock();
      mock.createContentType('myType');
      const schemas = mock.getSchemas();
      assert.equal(schemas[0].name, 'myType');
    });

    it('merges props when createContentType is called twice for same id', () => {
      const mock = new MigrationMock();
      mock.createContentType('page', { name: 'Page' });
      mock.createContentType('page', { displayField: 'title' });
      const schemas = mock.getSchemas();
      assert.equal(schemas.length, 1);
      assert.equal(schemas[0].name, 'Page');
      assert.equal(schemas[0].displayField, 'title');
    });
  });

  // ── editContentType ──────────────────────────────────────────

  describe('editContentType', () => {
    it('edits an existing CT', () => {
      const mock = new MigrationMock();
      mock.createContentType('blogPost', { name: 'Blog Post' });
      mock.editContentType('blogPost', { name: 'Blog Article' });
      const schemas = mock.getSchemas();
      assert.equal(schemas[0].name, 'Blog Article');
    });

    it('creates a new CT if it does not exist', () => {
      const mock = new MigrationMock();
      const ct = mock.editContentType('newType', { name: 'New Type' });
      ct.createField('title', { name: 'Title', type: 'Symbol' });
      const schemas = mock.getSchemas();
      assert.equal(schemas.length, 1);
      assert.equal(schemas[0].name, 'New Type');
      assert.equal(schemas[0].fields.length, 1);
    });
  });

  // ── deleteContentType ────────────────────────────────────────

  describe('deleteContentType', () => {
    it('removes a CT', () => {
      const mock = new MigrationMock();
      mock.createContentType('a');
      mock.createContentType('b');
      mock.deleteContentType('a');
      const schemas = mock.getSchemas();
      assert.equal(schemas.length, 1);
      assert.equal(schemas[0].id, 'b');
    });

    it('does nothing for unknown id', () => {
      const mock = new MigrationMock();
      mock.createContentType('a');
      mock.deleteContentType('nonexistent');
      assert.equal(mock.getSchemas().length, 1);
    });
  });

  // ── Field operations ─────────────────────────────────────────

  describe('field operations', () => {
    it('editField updates existing field props', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('title', { name: 'Title', type: 'Symbol' });
      ct.editField('title', { required: true });
      const f = mock.getSchemas()[0].fields[0];
      assert.equal(f.name, 'Title');
      assert.equal(f.required, true);
    });

    it('editField creates field if it does not exist', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.editField('newField', { name: 'New', type: 'Text' });
      assert.equal(mock.getSchemas()[0].fields.length, 1);
      assert.equal(mock.getSchemas()[0].fields[0].id, 'newField');
    });

    it('editField with fluent chaining on existing field', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('title', { name: 'Title', type: 'Symbol' });
      ct.editField('title').required(true).localized(true);
      const f = mock.getSchemas()[0].fields[0];
      assert.equal(f.required, true);
      assert.equal(f.localized, true);
    });

    it('deleteField removes a field', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('title', { name: 'Title', type: 'Symbol' });
      ct.createField('body', { name: 'Body', type: 'Text' });
      ct.deleteField('title');
      const fields = mock.getSchemas()[0].fields;
      assert.equal(fields.length, 1);
      assert.equal(fields[0].id, 'body');
    });

    it('changeFieldId renames a field', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('oldName', { name: 'Old', type: 'Symbol' });
      ct.changeFieldId('oldName', 'newName');
      const fields = mock.getSchemas()[0].fields;
      assert.equal(fields.length, 1);
      assert.equal(fields[0].id, 'newName');
      assert.equal(fields[0].name, 'Old'); // name preserved
    });

    it('changeFieldId does nothing for unknown field', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('title', { type: 'Symbol' });
      ct.changeFieldId('nonexistent', 'whatever');
      assert.equal(mock.getSchemas()[0].fields.length, 1);
      assert.equal(mock.getSchemas()[0].fields[0].id, 'title');
    });

    it('moveField returns chainable no-op', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('a', { type: 'Symbol' });
      ct.createField('b', { type: 'Symbol' });
      // Should not throw
      ct.moveField('a').afterField();
      ct.moveField('b').beforeField();
      ct.moveField('a').toTheTop();
      ct.moveField('b').toTheBottom();
      assert.equal(mock.getSchemas()[0].fields.length, 2);
    });
  });

  // ── Field types ──────────────────────────────────────────────

  describe('field types and props', () => {
    it('captures Link field with linkType', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('hero', { name: 'Hero', type: 'Link', linkType: 'Asset' });
      ct.createField('author').name('Author').type('Link').linkType('Entry');
      const fields = mock.getSchemas()[0].fields;
      assert.equal(fields[0].linkType, 'Asset');
      assert.equal(fields[1].linkType, 'Entry');
    });

    it('captures Array field with items', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('tags', {
        name: 'Tags', type: 'Array',
        items: { type: 'Symbol', validations: [{ in: ['a', 'b'] }] },
      });
      ct.createField('related').name('Related').type('Array').items({
        type: 'Link', linkType: 'Entry',
      });
      const fields = mock.getSchemas()[0].fields;
      assert.equal(fields[0].items?.type, 'Symbol');
      assert.equal(fields[1].items?.linkType, 'Entry');
    });

    it('captures validations', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('status', {
        name: 'Status', type: 'Symbol',
        validations: [{ in: ['draft', 'published', 'archived'] }],
      });
      ct.createField('url').name('URL').type('Symbol').validations([
        { regexp: { pattern: '^https://' } },
      ]);
      const fields = mock.getSchemas()[0].fields;
      assert.ok(fields[0].validations);
      assert.equal(fields[0].validations![0].in![0], 'draft');
      assert.ok(fields[1].validations);
    });

    it('captures disabled and omitted', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('hidden').type('Symbol').disabled(true).omitted(true);
      const f = mock.getSchemas()[0].fields[0];
      assert.equal(f.disabled, true);
      assert.equal(f.omitted, true);
    });

    it('defaults field name to id and type to Symbol', () => {
      const mock = new MigrationMock();
      const ct = mock.createContentType('page');
      ct.createField('myField');
      const f = mock.getSchemas()[0].fields[0];
      assert.equal(f.name, 'myField');
      assert.equal(f.type, 'Symbol');
    });
  });

  // ── No-ops ───────────────────────────────────────────────────

  describe('no-op data transforms', () => {
    it('transformEntries does not throw', () => {
      const mock = new MigrationMock();
      assert.doesNotThrow(() => mock.transformEntries());
    });

    it('transformEntriesToType does not throw', () => {
      const mock = new MigrationMock();
      assert.doesNotThrow(() => mock.transformEntriesToType());
    });

    it('deriveLinkedEntries does not throw', () => {
      const mock = new MigrationMock();
      assert.doesNotThrow(() => mock.deriveLinkedEntries());
    });
  });

  // ── Multi-CT accumulation ────────────────────────────────────

  describe('multi-CT accumulation', () => {
    it('accumulates multiple CTs', () => {
      const mock = new MigrationMock();
      mock.createContentType('blogPost', { name: 'Blog Post' });
      mock.createContentType('author', { name: 'Author' });
      mock.createContentType('category', { name: 'Category' });
      assert.equal(mock.getSchemas().length, 3);
    });

    it('simulates a multi-file migration flow', () => {
      const mock = new MigrationMock();

      // File 1: create content types
      const blog = mock.createContentType('blogPost', { name: 'Blog Post', displayField: 'title' });
      blog.createField('title', { name: 'Title', type: 'Symbol', required: true });
      const author = mock.createContentType('author', { name: 'Author' });
      author.createField('name', { name: 'Name', type: 'Symbol', required: true });

      // File 2: add more fields
      mock.editContentType('blogPost').createField('body', { name: 'Body', type: 'RichText' });
      mock.editContentType('blogPost').createField('author', { name: 'Author', type: 'Link', linkType: 'Entry' });
      mock.editContentType('author').createField('bio', { name: 'Bio', type: 'Text' });

      // File 3: add validations, rename, delete
      mock.editContentType('blogPost').editField('title').localized(true);
      mock.editContentType('blogPost').deleteField('body');
      mock.editContentType('blogPost').createField('content', { name: 'Content', type: 'RichText', localized: true });

      const schemas = mock.getSchemas();
      assert.equal(schemas.length, 2);

      const blogSchema = schemas.find(s => s.id === 'blogPost')!;
      assert.equal(blogSchema.fields.length, 3); // title, author, content (body deleted)
      assert.equal(blogSchema.fields[0].localized, true); // title got localized
      assert.equal(blogSchema.fields.find(f => f.id === 'body'), undefined); // body deleted
      assert.equal(blogSchema.fields.find(f => f.id === 'content')!.type, 'RichText');

      const authorSchema = schemas.find(s => s.id === 'author')!;
      assert.equal(authorSchema.fields.length, 2);
    });
  });
});

// ── fromMigrations / fromMigration ───────────────────────────────

describe('fromMigrations', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { cleanup(dir); });

  it('loads and executes a migration .js file', async () => {
    const migFile = path.join(dir, '001-create.mjs');
    fs.writeFileSync(migFile, `
      export default function(migration) {
        const ct = migration.createContentType('blogPost', { name: 'Blog Post', displayField: 'title' });
        ct.createField('title', { name: 'Title', type: 'Symbol', required: true });
        ct.createField('body', { name: 'Body', type: 'RichText' });
      }
    `);

    const result = await fromMigrations({ files: [migFile] });
    assert.equal(result.schemas.length, 1);
    assert.equal(result.schemas[0].id, 'blogPost');
    assert.equal(result.schemas[0].fields.length, 2);
    assert.equal(result.filesProcessed.length, 1);
    assert.equal(result.warnings.length, 0);
  });

  it('loads multiple files accumulating state', async () => {
    const file1 = path.join(dir, '001-create.mjs');
    fs.writeFileSync(file1, `
      export default function(migration) {
        const ct = migration.createContentType('blogPost', { name: 'Blog Post' });
        ct.createField('title', { name: 'Title', type: 'Symbol' });
      }
    `);
    const file2 = path.join(dir, '002-add-fields.mjs');
    fs.writeFileSync(file2, `
      export default function(migration) {
        migration.editContentType('blogPost').createField('body', { name: 'Body', type: 'RichText' });
        migration.createContentType('author', { name: 'Author' });
      }
    `);

    const result = await fromMigrations({ files: [file1, file2] });
    assert.equal(result.schemas.length, 2);
    assert.equal(result.schemas[0].fields.length, 2); // title + body
    assert.equal(result.filesProcessed.length, 2);
  });

  it('continues on error and reports warning', async () => {
    const goodFile = path.join(dir, '001.mjs');
    fs.writeFileSync(goodFile, `
      export default function(migration) {
        migration.createContentType('page', { name: 'Page' });
      }
    `);
    const badFile = path.join(dir, '002-bad.mjs');
    fs.writeFileSync(badFile, `
      export default function(migration) {
        throw new Error('intentional test error');
      }
    `);

    const result = await fromMigrations({ files: [goodFile, badFile] });
    assert.equal(result.schemas.length, 1);
    assert.equal(result.filesProcessed.length, 1);
    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('intentional test error'));
  });

  it('warns when file does not export a function', async () => {
    const badFile = path.join(dir, '001.mjs');
    fs.writeFileSync(badFile, `export default { notAFunction: true };\n`);

    const result = await fromMigrations({ files: [badFile] });
    assert.equal(result.schemas.length, 0);
    assert.equal(result.warnings.length, 1);
    assert.ok(result.warnings[0].includes('does not export a function'));
  });

  it('returns empty result for empty files array', async () => {
    const result = await fromMigrations({ files: [] });
    assert.equal(result.schemas.length, 0);
    assert.equal(result.filesProcessed.length, 0);
    assert.equal(result.warnings.length, 0);
  });

  it('handles async migration functions', async () => {
    const migFile = path.join(dir, '001.mjs');
    fs.writeFileSync(migFile, `
      export default async function(migration) {
        await Promise.resolve();
        migration.createContentType('asyncType', { name: 'Async' });
      }
    `);

    const result = await fromMigrations({ files: [migFile] });
    assert.equal(result.schemas.length, 1);
    assert.equal(result.schemas[0].id, 'asyncType');
  });

  it('handles CJS-style module.exports', async () => {
    const migFile = path.join(dir, '001.cjs');
    fs.writeFileSync(migFile, `
      module.exports = function(migration) {
        migration.createContentType('cjsType', { name: 'CJS Type' });
      };
    `);

    const result = await fromMigrations({ files: [migFile] });
    assert.equal(result.schemas.length, 1);
    assert.equal(result.schemas[0].id, 'cjsType');
  });
});

describe('fromMigration (single file)', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { cleanup(dir); });

  it('returns schemas from a single file', async () => {
    const migFile = path.join(dir, 'migrate.mjs');
    fs.writeFileSync(migFile, `
      export default function(migration) {
        migration.createContentType('singleType', { name: 'Single' });
      }
    `);

    const schemas = await fromMigration(migFile);
    assert.equal(schemas.length, 1);
    assert.equal(schemas[0].id, 'singleType');
  });

  it('throws on error', async () => {
    const badFile = path.join(dir, 'bad.mjs');
    fs.writeFileSync(badFile, `export default { notAFunction: true };\n`);

    await assert.rejects(() => fromMigration(badFile), /does not export a function/);
  });
});

// ── writeMigrationSchemas ────────────────────────────────────────

describe('writeMigrationSchemas', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { cleanup(dir); });

  it('writes schema files to disk', () => {
    const schemas = [
      { id: 'blogPost', name: 'Blog Post', fields: [{ id: 'title', name: 'Title', type: 'Symbol' as const }] },
      { id: 'author', name: 'Author', fields: [{ id: 'name', name: 'Name', type: 'Symbol' as const }] },
    ];

    const outDir = path.join(dir, 'schemas');
    const written = writeMigrationSchemas(schemas, outDir);

    assert.equal(written.length, 2);
    assert.ok(fs.existsSync(path.join(outDir, 'blogPost.js')));
    assert.ok(fs.existsSync(path.join(outDir, 'author.js')));

    const content = fs.readFileSync(path.join(outDir, 'blogPost.js'), 'utf-8');
    assert.ok(content.includes('export default'));
    assert.ok(content.includes('"blogPost"'));
    assert.ok(content.includes('ContentTypeDefinition'));
  });

  it('sanitizes content type IDs in filenames', () => {
    const schemas = [
      { id: '../evil/path', name: 'Evil', fields: [] },
      { id: 'normal-type', name: 'Normal', fields: [] },
    ];

    const outDir = path.join(dir, 'schemas');
    const written = writeMigrationSchemas(schemas, outDir);
    assert.equal(written.length, 2);
    // Path traversal characters replaced with _
    assert.ok(fs.existsSync(path.join(outDir, '___evil_path.js')));
    assert.ok(fs.existsSync(path.join(outDir, 'normal-type.js')));
  });

  it('creates output directory if it does not exist', () => {
    const outDir = path.join(dir, 'deep', 'nested', 'schemas');
    writeMigrationSchemas([{ id: 'a', name: 'A', fields: [] }], outDir);
    assert.ok(fs.existsSync(path.join(outDir, 'a.js')));
  });
});

// ── discoverMigrationFiles ───────────────────────────────────────

describe('discoverMigrationFiles', () => {
  let dir: string;

  beforeEach(() => { dir = tmpDir(); });
  afterEach(() => { cleanup(dir); });

  it('finds .js, .mjs, .cjs, .ts files sorted by name', () => {
    fs.writeFileSync(path.join(dir, '003-third.ts'), '');
    fs.writeFileSync(path.join(dir, '001-first.js'), '');
    fs.writeFileSync(path.join(dir, '002-second.mjs'), '');
    fs.writeFileSync(path.join(dir, 'ignored.txt'), '');
    fs.writeFileSync(path.join(dir, 'README.md'), '');
    fs.writeFileSync(path.join(dir, '004-fourth.cjs'), '');

    const files = discoverMigrationFiles(dir);
    assert.equal(files.length, 4);
    assert.ok(files[0].endsWith('001-first.js'));
    assert.ok(files[1].endsWith('002-second.mjs'));
    assert.ok(files[2].endsWith('003-third.ts'));
    assert.ok(files[3].endsWith('004-fourth.cjs'));
  });

  it('returns empty array for directory with no migration files', () => {
    fs.writeFileSync(path.join(dir, 'readme.md'), '');
    fs.writeFileSync(path.join(dir, 'data.json'), '');
    const files = discoverMigrationFiles(dir);
    assert.equal(files.length, 0);
  });

  it('returns empty array for empty directory', () => {
    const files = discoverMigrationFiles(dir);
    assert.equal(files.length, 0);
  });
});
