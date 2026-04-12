# Security — content-model-simulator

This document describes the security model, known risks, and mitigations for `content-model-simulator`.

## Threat Model

`content-model-simulator` is a **local CLI tool** that runs on the developer's machine. It reads files from disk, optionally fetches data from the Contentful CDA, and writes HTML/JSON output locally. It is **not a server** and does not accept network input except the explicit `cms-sim pull` command.

**Trust boundary**: the user's local filesystem and the Contentful CDA API.

## Resolved Vulnerabilities

| Severity | CWE | Issue | Fix |
|----------|-----|-------|-----|
| Critical | CWE-94 | `new Function('return ' + config.isAsset)()` — arbitrary code execution via JSON config | Removed `new Function()`. `isAsset`/`getAssetUrl` only available via programmatic API. |
| Critical | CWE-78 | `exec()` with unsanitized path for `--open` — command injection | Replaced with `execFile()` (no shell invocation). |
| High | CWE-79 | Content Browser: `renderFieldValue` injected raw HTML from user data | All user values escaped via `esc()` function. |
| High | CWE-79 | Model Graph: 4 uses of `innerHTML` with unescaped data | Added `esc()` function; applied to all interpolated values. |
| Medium | CWE-22 | Content type IDs used directly as filenames | Sanitized with `ctId.replace(/[^a-zA-Z0-9_-]/g, '_')`. |
| Low | CWE-1333 | `new RegExp(pattern)` without validation in `filterByPath` | Wrapped in `try/catch` with descriptive error. |
| Low | CWE-94 | Dynamic `import()` of schemas/transforms could escape directory via symlinks | Path containment: `realpathSync()` check ensures resolved paths stay within the specified directory. |
| Low | CWE-400 | `JSON.parse` on large JSON array files could cause OOM | File size warning (>100 MB) recommending NDJSON streaming format. |

## Accepted Risks

### Dynamic `import()` of schemas and transforms (CWE-94 by design)

Schema files (`.js`, `.mjs`) and transform files in user-specified directories are loaded via `import()`. This is **intentional** — the tool's core purpose is to execute user-defined schemas and transformers.

**Mitigations:**
- Only files within the specified `--schemas`, `--transforms`, or `--plugins` directories are loaded.
- Path containment validation prevents symlink-based directory escape.
- Only files with `.js` or `.mjs` extensions are loaded (`.json` files are parsed, not executed).
- The tool runs with the same privileges as the user — no privilege escalation.

**Recommendation:** Do not point `--schemas`, `--transforms`, or `--plugins` at untrusted directories.

### JSON.parse without hard size limit (CWE-400)

JSON array files are read entirely into memory. For files over 100 MB, a warning is emitted suggesting NDJSON format instead.

**Mitigations:**
- The NDJSON streaming reader (`readDocumentsStream()`) is available for large files and processes data line-by-line.
- A warning is emitted for files >100 MB.
- This is acceptable for a local CLI tool where the user controls the input files.

**Recommendation:** Use NDJSON format (`.ndjson`) for data files larger than 50 MB.

## Supply Chain

- **Zero runtime dependencies** — no `node_modules` at runtime.
- **No `preinstall`/`postinstall` scripts** — safe to install.
- **No telemetry** — no data collection or analytics.
- **Network access** — `fetch()` is only used in `cms-sim pull` (explicit user command to the Contentful CDA). Zero network calls during simulation.
- **npm audit**: 0 vulnerabilities.

## Reporting

If you discover a security vulnerability, please open a GitHub issue or contact the maintainer directly.
