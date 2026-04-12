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
import type { ContentTypeDefinition } from '../types.js';

export class SchemaRegistry {
  #definitions = new Map<string, ContentTypeDefinition>();

  register(definition: ContentTypeDefinition): void {
    if (!definition?.id) {
      throw new Error('Content type definition must have an "id" property');
    }
    this.#definitions.set(definition.id, definition);
  }

  registerAll(definitions: ContentTypeDefinition[] | Record<string, ContentTypeDefinition>): void {
    if (Array.isArray(definitions)) {
      for (const def of definitions) {
        this.register(def);
      }
    } else if (typeof definitions === 'object') {
      for (const [id, def] of Object.entries(definitions)) {
        this.register({ ...def, id: def.id || id } as ContentTypeDefinition);
      }
    }
  }

  async loadFromDirectory(dirPath: string): Promise<void> {
    const resolvedDir = path.resolve(dirPath);
    if (!fs.existsSync(resolvedDir)) {
      throw new Error(`Schema directory does not exist: ${resolvedDir}`);
    }

    const files = fs.readdirSync(resolvedDir).filter((f: string) =>
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
          const mod = await import(`file://${filePath}`) as Record<string, unknown>;
          const exported = (mod.default || mod) as Record<string, unknown>;
          if (Array.isArray(exported)) {
            this.registerAll(exported as unknown as ContentTypeDefinition[]);
          } else if ((exported as any).id && (exported as any).fields) {
            this.register(exported as unknown as ContentTypeDefinition);
          } else {
            // Object with named exports — each value is a definition
            for (const val of Object.values(exported)) {
              if ((val as any)?.id && (val as any)?.fields) {
                this.register(val as ContentTypeDefinition);
              }
            }
          }
        }
      } catch (e) {
        throw new Error(`Failed to load schema from ${filePath}: ${(e as Error).message}`);
      }
    }
  }

  get(ctId: string): ContentTypeDefinition | null {
    return this.#definitions.get(ctId) || null;
  }

  getAll(): Record<string, ContentTypeDefinition> {
    return Object.fromEntries(this.#definitions);
  }

  getAllIds(): string[] {
    return [...this.#definitions.keys()];
  }

  has(ctId: string): boolean {
    return this.#definitions.has(ctId);
  }

  get size(): number {
    return this.#definitions.size;
  }

  clear(): void {
    this.#definitions.clear();
  }
}
