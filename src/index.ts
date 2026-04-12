/**
 * content-model-simulator — Public API
 *
 * Everything users need when requiring the package programmatically.
 */

// ── Types ────────────────────────────────────────────────────────
export type {
  ContentfulFieldType,
  LinkType,
  ContentTypeFieldItems,
  Validation,
  ContentTypeField,
  ContentTypeDefinition,
  Document,
  ContentLink,
  EntryFields,
  Entry,
  Asset,
  ReportContentType,
  PageEntry,
  SimulationReport,
  ReportIssue,
  ReportStats,
  TransformFunction,
  TransformOptions,
  TransformedEntry,
  SimulateConfig,
  SimulateOptions,
  FieldGroupConfig,
  SchemaLike,
  TransformerLike,
  PullOptions,
  PullResult,
  MockDataOptions,
  MockDataResult,
  AppConfig,
  ReadOptions,
  WriteOptions,
  WriteResult,
  ExtractAssetsOptions,
  ExtractAssetsResult,
  ExtractNestedOptions,
  ExtractNestedResult,
  TerminalColors,
} from './types.js';

// ── Core ─────────────────────────────────────────────────────────
export { simulate } from './core/simulator.js';
export { readDocuments, readDocumentsSync, filterByContentType, filterByLocale, filterByPath, getDocumentStats } from './core/reader.js';
export { SchemaRegistry } from './core/schema-registry.js';
export { validateEntry, validateAll } from './core/validator.js';
export { generateMockData } from './core/mock-generator.js';

// ── Transform ────────────────────────────────────────────────────
export { transformGeneric, TransformerRegistry } from './transform/transformer.js';
export { generateEntryId, simpleHash, extractSelectKey, isImageObject, extractImageUrl, createLink, isLink } from './transform/helpers.js';

// ── Extract ──────────────────────────────────────────────────────
export { extractAssets, linkAssets } from './extract/assets.js';
export { extractNestedObjects } from './extract/nested-objects.js';

// ── Output ───────────────────────────────────────────────────────
export { generateContentBrowserHTML } from './output/content-browser.js';
export { generateModelGraphHTML } from './output/model-graph.js';
export { writeReport } from './output/json-writer.js';

// ── Contentful ───────────────────────────────────────────────────
export { pull } from './contentful/pull.js';
