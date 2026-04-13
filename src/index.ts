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
  SchemaInput,
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

export type {
  ChangeKind,
  FieldChange,
  ContentTypeChange,
  SchemaDiffResult,
} from './core/schema-diff.js';

export type {
  EntryCountChange,
  IssueDiff,
  StatDelta,
  ReportDiffResult,
} from './core/report-diff.js';

// ── Core ─────────────────────────────────────────────────────────
export { simulate } from './core/simulator.js';
export { readDocuments, readDocumentsSync, readDocumentsStream, filterByContentType, filterByLocale, filterByPath, getDocumentStats } from './core/reader.js';
export { SchemaRegistry } from './core/schema-registry.js';
export { validateEntry, validateAll } from './core/validator.js';
export { generateMockData } from './core/mock-generator.js';
export { diffSchemas, formatDiff } from './core/schema-diff.js';
export { diffReports, formatReportDiff } from './core/report-diff.js';

// ── Transform ────────────────────────────────────────────────────
export { transformGeneric, TransformerRegistry } from './transform/transformer.js';
export { generateEntryId, simpleHash, extractSelectKey, isImageObject, extractImageUrl, createLink, isLink } from './transform/helpers.js';
export { htmlToRichText, looksLikeHTML, isRichTextDocument } from './transform/rich-text.js';
export type { RichTextDocument, RichTextNode } from './transform/rich-text.js';

// ── Extract ──────────────────────────────────────────────────────
export { extractAssets, linkAssets } from './extract/assets.js';
export { extractNestedObjects } from './extract/nested-objects.js';

// ── Output ───────────────────────────────────────────────────────
export { generateContentBrowserHTML } from './output/content-browser.js';
export type { BrowserHTMLOptions } from './output/content-browser.js';
export { generateModelGraphHTML } from './output/model-graph.js';
export type { GraphHTMLOptions } from './output/model-graph.js';
export { writeReport } from './output/json-writer.js';

// ── Contentful ───────────────────────────────────────────────────
export { pull } from './contentful/pull.js';

// ── WordPress ────────────────────────────────────────────────────
export { readWXR, parseWXR, parseWXRString, stripGutenbergComments } from './wordpress/wxr-reader.js';
export type { WXRReadOptions, WXRSite, WXRResult } from './wordpress/wxr-reader.js';
export { analyzeWXR, generateScaffold, scaffoldFromWXR } from './wordpress/wxr-scaffold.js';
export type { ScaffoldAnalysis, AnalyzedContentType, AnalyzedField, ScaffoldOptions, ScaffoldOutput } from './wordpress/wxr-scaffold.js';

// ── Sanity ───────────────────────────────────────────────────────
export { readSanity, parseSanity, parseSanityString, portableTextToHTML, isSanityNDJSON } from './sanity/sanity-reader.js';
export type { SanityReadOptions, SanityImageAsset, SanityResult } from './sanity/sanity-reader.js';
