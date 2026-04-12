/**
 * Content Model Simulator — Schema Registry
 *
 * Manages content type definitions. Users provide their own schemas
 * matching the standard content type definition format:
 *
 * {
 *   id: string,
 *   name: string,
 *   displayField?: string,
 *   fields: Array<{
 *     id: string,
 *     name: string,
 *     type: 'Symbol' | 'Text' | 'Integer' | 'Number' | 'Boolean' | 'Date' |
 *           'Object' | 'RichText' | 'Link' | 'Array',
 *     linkType?: 'Entry' | 'Asset',
 *     items?: { type: string, linkType?: string },
 *     required?: boolean,
 *     localized?: boolean,
 *     validations?: Array<{ in?: string[] }>
 *   }>
 * }
 */

import fs from 'fs';
import path from 'path';

export class SchemaRegistry {
  /** @type {Map<string, object>} */
  #definitions = new Map();

  /**
   * Register a single content type definition.
   * @param {object} definition
   */
  register(definition) {
    if (!definition?.id) {
      throw new Error('Content type definition must have an "id" property');
    }
    this.#definitions.set(definition.id, definition);
  }

  /**
   * Register multiple content type definitions.
   * @param {Array<object>|object} definitions - Array of defs, or object keyed by CT id
   */
  registerAll(definitions) {
    if (Array.isArray(definitions)) {
      for (const def of definitions) {
        this.register(def);
      }
    } else if (typeof definitions === 'object') {
      for (const [id, def] of Object.entries(definitions)) {
        this.register({ ...def, id: def.id || id });
      }
    }
  }

  /**
   * Load content type definitions from a directory of JS/JSON files.
   * Each file should export a single definition or an object of definitions.
   * @param {string} dirPath
   */
  async loadFromDirectory(dirPath) {
    const resolvedDir = path.resolve(dirPath);
    if (!fs.existsSync(resolvedDir)) {
      throw new Error(`Schema directory does not exist: ${resolvedDir}`);
    }

    const files = fs.readdirSync(resolvedDir).filter(f =>
      f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.json')
    );

    for (const file of files.sort()) {
      const filePath = path.join(resolvedDir, file);
      try {
        if (file.endsWith('.json')) {
          const content = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
          if (Array.isArray(content)) {
            this.registerAll(content);
          } else if (content.id) {
            this.register(content);
          } else {
            this.registerAll(content);
          }
        } else {
          const mod = await import(`file://${filePath}`);
          const exported = mod.default || mod;
          if (Array.isArray(exported)) {
            this.registerAll(exported);
          } else if (exported.id && exported.fields) {
            this.register(exported);
          } else {
            // Object with named exports — each value is a definition
            for (const val of Object.values(exported)) {
              if (val?.id && val?.fields) {
                this.register(val);
              }
            }
          }
        }
      } catch (e) {
        throw new Error(`Failed to load schema from ${filePath}: ${e.message}`);
      }
    }
  }

  /**
   * Get a definition by content type ID.
   * @param {string} ctId
   * @returns {object|null}
   */
  get(ctId) {
    return this.#definitions.get(ctId) || null;
  }

  /**
   * Get all definitions as a plain object.
   * @returns {object}
   */
  getAll() {
    return Object.fromEntries(this.#definitions);
  }

  /**
   * Get all registered content type IDs.
   * @returns {string[]}
   */
  getAllIds() {
    return [...this.#definitions.keys()];
  }

  /**
   * Check if a content type is registered.
   * @param {string} ctId
   * @returns {boolean}
   */
  has(ctId) {
    return this.#definitions.has(ctId);
  }

  /**
   * Get the number of registered definitions.
   * @returns {number}
   */
  get size() {
    return this.#definitions.size;
  }

  /**
   * Clear all definitions.
   */
  clear() {
    this.#definitions.clear();
  }
}
