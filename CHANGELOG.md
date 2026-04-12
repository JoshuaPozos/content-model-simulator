# Changelog

All notable changes to `content-model-simulator` are documented here.

## [0.1.0] — Unreleased

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
- **Test suite**: 209 tests (unit + e2e), zero `as any` casts
- **Duplicate field detection**: `DUPLICATE_FIELD` warning for schemas with repeated field IDs
- **Deterministic entry IDs**: IDs are now based on `path+locale` (most stable across runs), with fallback to `id+locale`
- **`MISSING_CONTENT_TYPE` warning**: for documents without a `contentType` property
- **Security**: documented that `--schemas`/`--transforms` dirs execute JS via dynamic `import()`

### Fixed
- Skip `internalName` in validator (false positive warnings)
- Pull duplicate `limit` param, early exit on `maxEntries`, double-slash in CLI next steps
- Auto-detect locales from data when `--locales` not specified
- Missing `src/output/` files and Content Model Graph 404 link
- Resolve relationships in model graph using source IDs
- Remove hardcoded "Draft" status from content browser
- `renderLinkedEntry` escape corruption (`\\'` → `\\\\'`)
- README examples: `schemas.all()` → `schemas`, missing asset destructuring, misleading `writeReport()` usage
- `--max-entries` and `--content-type` warn when used without `--include-entries`

### Infrastructure
- Zero runtime dependencies, Node.js >= 18, ESM (`"type": "module"`)
- TypeScript 6.0.2, `@types/node` 25.6.0
- 3 example projects (from-scratch, pull-contentful, wp-migration)
