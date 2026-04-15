# Changelog

All notable changes to `content-model-simulator` are documented here.

## [0.2.1] — 2026-04-14

### Added
- **`--management-token` for `cms-sim pull`**: fetches content type schemas via the Contentful Management API (CMA) so that **all field validations** are included — `in` (allowed values), `regexp`, `size`, `range`, `unique`, and `linkContentType`. Without this flag, `pull` uses the Content Delivery API (CDA), which may omit editor-only validations. Accepts `CONTENTFUL_MANAGEMENT_TOKEN` env var and `managementToken` in config files.

### Fixed
- **Missing field validations on pull** — `cms-sim pull` previously used only the CDA, which strips some validation rules from content type responses. Schemas pulled without `--management-token` now display a tip suggesting its use.

## [0.2.0] — 2026-04-14

### Added
- **Field-level validation enforcement**: `validateEntry()` and `validateAll()` now check `in` (allowed values), `regexp` (pattern match), `size` (string/array length), `range` (numeric min/max), `dateRange` (date bounds), and `unique` (cross-entry duplicate detection). Issues are reported as `VALIDATION_IN`, `VALIDATION_REGEXP`, `VALIDATION_SIZE`, `VALIDATION_RANGE`, `VALIDATION_DATE_RANGE`, and `VALIDATION_UNIQUE` warnings.
- **`--config` for `cms-sim pull`**: the pull subcommand now accepts `--config=<file>` to load `spaceId`, `accessToken`, `environment`, `output`, and other pull options from a JSON config file.

## [0.1.1] — 2026-04-13

### Fixed
- **`cms-sim init .`**: allow scaffolding in the current directory instead of erroring with "Directory already exists". Only blocks if `schemas/` already exists inside the target. Output adapts: shows `.` as name and omits the `cd` step.
- **Init generates `.mjs` schemas**: `cms-sim init` now writes `blogPost.mjs` and `author.mjs` instead of `.js`. Node.js treats `.mjs` as ESM regardless of `package.json`, eliminating the `MODULE_TYPELESS_PACKAGE_JSON` warning users hit when their project has no `"type": "module"`.
- **Init help text**: added `cms-sim init .` example to `--help` output.

## [0.1.0] — 2026-04-12

### Added
- **Core simulation engine**: 10-step pipeline (load → detect → validate → extract → transform → link → nest → convert → validate → report)
- **`simulate()` API**: config object and positional overload `simulate(documents, schemas, options?)`
- **`cms-sim` CLI**: simulate and pull subcommands with interactive HTML output
- **`cms-sim pull`**: download content model + entries from Contentful (read-only CDA)
  - `--content-type=<id>` filter for pulling only specific content types
  - `--max-entries`, `--include-entries`, `--environment` options
  - `--preview` flag for Content Preview API (drafts instead of published)
  - Pagination progress indicator (`Fetching entries… 300/5200`)
- **`cms-sim diff`**: compare two schema directories — shows added/removed/changed CTs and fields
- **Watch mode** (`--watch`, `-w`): re-run simulation automatically on schema or input file changes (debounced, Ctrl+C to stop)
- **Locale inheritance**: non-localized fields (`localized: false`) are automatically copied from base-locale entry to other-locale entries
- **Schema Registry**: load from directory, plain objects, or arrays
- **Streaming NDJSON reader**: `readDocumentsStream()` async generator for files >100MB without loading into memory
- **Transformer Registry**: custom transforms per content type with skip/rename support
- **Content Browser HTML**: interactive entry viewer with linked entry resolution, RichText rendering, search
- **Content Model Graph HTML**: SVG visualization with horizontal hierarchical layout, linked entry resolution
- **Mock data generation**: `generateMockData()` for from-scratch content model design
- **Entry validation**: field-level checks against content type definitions
- **`writeReport()`**: write simulation report to JSON
- **TypeScript**: full migration to `.ts` with strict mode, declarations, and source maps
- **Test suite**: 362 tests (unit + e2e), zero `as any` casts
- **Duplicate field detection**: `DUPLICATE_FIELD` warning for schemas with repeated field IDs
- **Deterministic entry IDs**: IDs are now based on `path+locale` (most stable across runs), with fallback to `id+locale`
- **`MISSING_CONTENT_TYPE` warning**: for documents without a `contentType` property
- **Security**: documented that `--schemas`/`--transforms` dirs execute JS via dynamic `import()`
- **`cms-sim validate`**: standalone validation subcommand for CI/CD — runs the simulation pipeline and outputs errors/warnings only (no HTML). Supports `--json` for machine-readable output and exits with code 1 on validation errors.
- **`cms-sim init`**: scaffold a new content model project with example schemas (`blogPost`, `author`), a README with quick-start guide, and all supported field types documented.
- **Watch mode fixed output dir**: `--watch` now uses a stable output directory (`output/<name>/`) instead of timestamped dirs, so the browser URL stays valid and F5 refreshes work.
- **Pull preview 401 warning**: when `--preview` is used and the API returns 401, the error message now suggests using a Content Preview API (CPA) token instead of a CDA token.
- **`MISSING_BASE_LOCALE_ENTRY` warning**: emitted during locale inheritance when an entry exists only in a non-base locale but has no corresponding base-locale entry.
- **`FIELD_REORDERED` change kind in schema diff**: `diffSchemas()` now detects field reordering (position changes) in addition to added/removed/changed fields. Shown with `↕` icon in formatted output.
- **Watch auto-reload**: when `--watch` is active, injected HTML includes a polling script that auto-refreshes the browser when the simulation re-runs (monitors `manifest.json` timestamp every 1.5s).
- **`cms-sim pull --include-assets`**: download asset files (images, documents, etc.) alongside entries. Writes `assets/assets.json` index and individual files with URL-based deduplication.
- **Report-level diff** (`cms-sim diff`): auto-detects simulation output directories (via `manifest.json`) and compares schemas, entry counts, errors/warnings, and stats between two simulation runs. Falls back to schema-only diff for plain schema directories.
- **Entry deduplication**: automatically removes duplicate entries with same `id+locale` composite key. Emits `DUPLICATE_ENTRY_REMOVED` warning with count. Runs as post-processing step before locale inheritance.
- **Plugin system** (`--plugins=<dir>`): auto-discovers `schemas/` and `transforms/` subdirectories, and loads root-level `.js` files with `setup({ schemas, transformers })` function. Works in both `simulate` and `validate` subcommands.
- **Custom HTML templates** (`--template-css`, `--template-head`): inject custom CSS and `<head>` content into content browser and model graph HTML output. Enables branding, custom fonts, and styling overrides.
- **`SECURITY.md`**: consolidated security documentation covering threat model, resolved vulnerabilities, accepted risks, and supply chain.
- **Rich Text support** (`htmlToRichText`): zero-dependency HTML → Contentful Rich Text JSON converter. Auto-converts HTML strings in RichText fields during simulation. Supports headings, lists, marks, links, images, tables, blockquotes. Exported as public API with `looksLikeHTML()` and `isRichTextDocument()` helpers.
- **WordPress WXR reader** (`readWXR`): zero-dependency parser for WordPress eXtended RSS (WXR 1.2) export files. Auto-detected from `.xml` extension or `<?xml`/`<rss` content. Extracts posts, pages, attachments, authors, categories, and tags as `Document[]`. Strips Gutenberg block comments (`<!-- wp:* -->`) from HTML content. Exports `readWXR()`, `parseWXR()`, `parseWXRString()`, `stripGutenbergComments()` plus types `WXRReadOptions`, `WXRSite`, `WXRResult`.
- **WordPress example** (`examples/wordpress/`): end-to-end migration example using real Gutenberg test data XML with schemas (blogPost, author, category, tag), transforms, and programmatic runner.
- **`cms-sim scaffold`**: auto-generate Contentful schemas and transforms from a WordPress XML export. Analyzes post types, fields, taxonomies, and relationships to produce editable `.js` schema files and a `TransformerRegistry`.
- **Multi-locale entry model**: entries now contain all locales in a single object (`Entry.locales: string[]`) matching the real Contentful model, instead of duplicating entries per locale. Merge pipeline groups intermediate entries by content type + source ID.
- **Content Browser per-locale field display**: localized fields show one card per locale with a locale indicator badge (e.g., "English (United States)"), matching the Contentful dashboard experience.
- **Base locale auto-correction**: when `--base-locale=en` is set but data uses `en-US`, the simulator auto-detects and corrects to the matching locale code.

### Fixed
- **CLI format auto-detection**: default `--format` changed from `'ndjson'` to `'auto'`, enabling proper detection of XML, JSON array, and JSON directory inputs without explicit `--format` flag.
- **Dynamic `import()` path containment** (CWE-94): `realpathSync()` check ensures schema, transform, and plugin files resolve within the specified directory (prevents symlink escape)
- **JSON.parse file size warning** (CWE-400): emits warning for JSON array files >100 MB recommending NDJSON streaming format
- Skip `internalName` in validator (false positive warnings)
- Pull duplicate `limit` param, early exit on `maxEntries`, double-slash in CLI next steps
- Auto-detect locales from data when `--locales` not specified
- Missing `src/output/` files and Content Model Graph 404 link
- Resolve relationships in model graph using source IDs
- Remove hardcoded "Draft" status from content browser
- `renderLinkedEntry` escape corruption (`\\'` → `\\\\'`)- `baseLocale` auto-correction scope bug: `const` → `let` to propagate corrected locale to downstream pipeline
- Model Graph relationship detection: fallback to first available locale key when `baseLocale` doesn't match field wrapper keys
- Entry IDs now locale-independent in both simulator and `TransformerRegistry` (enables proper multi-locale merge)
- XSS: escape all user data values in Model Graph SVG render and detail panel innerHTML
- XSS: escape `value` attributes in Content Browser `<option>` elements- README examples: `schemas.all()` → `schemas`, missing asset destructuring, misleading `writeReport()` usage
- `--max-entries` and `--content-type` warn when used without `--include-entries`

### Infrastructure
- Zero runtime dependencies, Node.js >= 22, ESM (`"type": "module"`)
- TypeScript 6.0.2, `@types/node` 25.6.0
- 3 example projects (from-scratch, with-data, wordpress)
