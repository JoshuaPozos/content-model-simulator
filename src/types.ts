/**
 * Content Model Simulator — Shared Type Definitions
 */

// ── Field & Schema Types ─────────────────────────────────────────

export type ContentfulFieldType =
  | 'Symbol' | 'Text' | 'Integer' | 'Number' | 'Boolean'
  | 'Date' | 'Object' | 'RichText' | 'Link' | 'Array' | 'Location';

export type LinkType = 'Entry' | 'Asset';

export interface ContentTypeFieldItems {
  type: string;
  linkType?: LinkType;
  validations?: Validation[];
}

export interface Validation {
  in?: string[];
  linkContentType?: string[];
  [key: string]: unknown;
}

export interface ContentTypeField {
  id: string;
  name: string;
  type: ContentfulFieldType;
  linkType?: LinkType;
  items?: ContentTypeFieldItems;
  required?: boolean;
  localized?: boolean;
  disabled?: boolean;
  omitted?: boolean;
  validations?: Validation[];
  defaultValue?: unknown;
}

export interface ContentTypeDefinition {
  id: string;
  name: string;
  description?: string;
  displayField?: string;
  fields: ContentTypeField[];
}

// ── Document & Entry Types ───────────────────────────────────────

export interface Document {
  id?: string;
  contentType: string;
  fields?: Record<string, unknown>;
  data?: Record<string, unknown>;
  locale?: string;
  path?: string;
  name?: string;
}

export interface ContentLink {
  sys: {
    type: 'Link';
    linkType: LinkType;
    id: string;
  };
}

export interface EntryFields {
  [fieldId: string]: { [locale: string]: unknown };
}

export interface Entry {
  id: string;
  contentType: string;
  locale: string;
  sourceId?: string | null;
  sourcePath?: string | null;
  sourceType: string;
  fields: EntryFields;
  linkedEntryIds: string[];
  linkedAssetIds: string[];
}

export interface Asset {
  id: string;
  title: string;
  url?: string;
  file?: {
    url: string;
    contentType: string;
    fileName: string;
  };
  referencedBy?: string[];
}

// ── Report Types ─────────────────────────────────────────────────

export interface ReportContentType {
  id: string;
  name: string;
  defined: boolean;
  entryCount: number;
  displayField?: string;
  fields: Array<{
    id: string;
    name: string;
    type: string;
    linkType: string | null;
    required: boolean;
    localized: boolean;
    items?: ContentTypeFieldItems | null;
  }>;
}

export interface PageEntry {
  id: string;
  title: string;
  slug: string;
  sections: Record<string, string[]>;
}

export interface SimulationReport {
  page: string;
  timestamp: string;
  baseLocale: string;
  locales: string[];
  contentTypes: Record<string, ReportContentType>;
  entries: Entry[];
  assets: Asset[];
  pageEntry: PageEntry | null;
  errors: ReportIssue[];
  warnings: ReportIssue[];
  stats: ReportStats;
}

export interface ReportIssue {
  type: string;
  contentType?: string;
  field?: string;
  entryId?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ReportStats {
  totalEntries: number;
  totalComponents: number;
  totalAssets: number;
  totalCTs: number;
  totalLocales: number;
  totalErrors: number;
  totalWarnings: number;
}

// ── Transformer Types ────────────────────────────────────────────

export type TransformFunction = (
  doc: Document,
  locale: string,
  options?: TransformOptions,
) => TransformedEntry | TransformedEntry[];

export interface TransformOptions {
  mapLocale?: (locale: string) => string;
  isImageObject?: (obj: unknown) => boolean;
  schemas?: Record<string, ContentTypeDefinition>;
  [key: string]: unknown;
}

export interface TransformedEntry {
  _metadata?: {
    contentType: string;
    entryId: string;
    sourceId?: string;
    sourcePath?: string | null;
    sourceType: string;
  };
  fields: Record<string, unknown>;
}

// ── Simulate Types ───────────────────────────────────────────────

export interface SimulateConfig {
  documents: Document[];
  schemas: SchemaInput;
  transformers?: TransformerLike;
  assets?: Asset[];
  options?: SimulateOptions;
}

export interface SimulateOptions {
  baseLocale?: string;
  locales?: string[] | null;
  name?: string;
  localeMap?: Record<string, string> | null;
  fieldGroupMap?: Record<string, Record<string, FieldGroupConfig>> | null;
  isAsset?: (obj: unknown) => boolean;
  getAssetUrl?: (obj: unknown) => string | null;
  verbose?: boolean;
}

export interface FieldGroupConfig {
  contentType: string;
  multiple?: boolean;
}

export interface SchemaLike {
  get?: (id: string) => ContentTypeDefinition | null | undefined;
  getAll?: () => Record<string, ContentTypeDefinition>;
}

export type SchemaInput = SchemaLike | Record<string, ContentTypeDefinition>;

export interface TransformerLike {
  get: (ct: string) => TransformFunction | null;
  getTargetType: (ct: string) => string | null;
  isSkipped: (ct: string) => boolean;
}

// ── Pull Types ───────────────────────────────────────────────────

export interface PullOptions {
  spaceId: string;
  accessToken: string;
  environment?: string;
  outputDir?: string;
  includeEntries?: boolean;
  includeAssets?: boolean;
  maxEntries?: number;
  contentType?: string;
  useCMA?: boolean;
  usePreview?: boolean;
  verbose?: boolean;
}

export interface PullResult {
  schemas: ContentTypeDefinition[];
  locales: string[];
  defaultLocale: string;
  documents: Document[] | null;
  assets: PulledAsset[] | null;
}

export interface PulledAsset {
  id: string;
  title: string;
  fileName: string;
  contentType: string;
  url: string;
  size: number;
  locale: string;
}

// ── Mock Data Types ──────────────────────────────────────────────

export interface MockDataOptions {
  entriesPerType?: number;
  baseLocale?: string;
  locales?: string[];
  name?: string;
}

export interface MockDataResult {
  documents: Document[];
  assets: Asset[];
}

// ── Config Types ─────────────────────────────────────────────────

export interface AppConfig {
  input?: string | null;
  schemas?: string | null;
  transforms?: string | null;
  output?: string | null;
  name?: string | null;
  baseLocale?: string;
  locales?: string[] | null;
  localeMap?: Record<string, string> | null;
  fieldGroupMap?: Record<string, Record<string, FieldGroupConfig>> | null;
  verbose?: boolean;
  open?: boolean;
  json?: boolean;
  _configPath?: string;
  _configDir?: string;
}

// ── Reader Types ─────────────────────────────────────────────────

export interface ReadOptions {
  format?: 'ndjson' | 'json-array' | 'json-dir' | 'auto';
  transform?: (doc: unknown) => Document;
}

// ── Writer Types ─────────────────────────────────────────────────

export interface WriteOptions {
  pretty?: boolean;
  splitEntries?: boolean;
}

export interface WriteResult {
  outputDir: string;
  filesWritten: number;
}

// ── Extract Types ────────────────────────────────────────────────

export interface ExtractAssetsOptions {
  isAsset?: (obj: unknown) => boolean;
  getAssetUrl?: (obj: unknown) => string | null;
}

export interface ExtractAssetsResult {
  assets: Asset[];
  urlToAssetId: Map<string, string>;
}

export interface ExtractNestedOptions {
  locale: string;
  baseLocale: string;
  parentEntryId: string;
  parentPath?: string;
  urlToAssetId?: Map<string, string>;
  fieldGroupMap?: Record<string, Record<string, FieldGroupConfig>>;
  schemas?: SchemaInput;
}

export interface ExtractNestedResult {
  entries: Entry[];
  stats: { extracted: number; fields: number };
}

// ── Terminal Colors ──────────────────────────────────────────────

export interface TerminalColors {
  reset: string;
  green: string;
  yellow: string;
  cyan: string;
  red: string;
  bold: string;
  dim: string;
  magenta: string;
  blue: string;
  underline: string;
}
