/**
 * Configuration loader
 *
 * Loads a JSON config file for cms-sim and merges with CLI args.
 * Config files are optional — all settings can be provided via CLI.
 *
 * Example config (cms-sim.config.json):
 * {
 *   "name": "my-project",
 *   "input": "./data/export.ndjson",
 *   "schemas": "./schemas",
 *   "transforms": "./transforms",
 *   "baseLocale": "en",
 *   "locales": ["en", "es", "fr"],
 *   "localeMap": { "en_US": "en", "es_MX": "es" },
 *   "fieldGroupMap": { "heroSlider": { "items": "heroSliderItem" } },
 *   "output": "./output"
 * }
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const CONFIG_FILENAMES = [
  'cms-sim.config.json',
  '.cms-sim.json',
  'content-model-simulator.config.json',
];

/**
 * Auto-discover and load a config file from the given directory.
 *
 * @param {string} [dir=process.cwd()] - Directory to search
 * @returns {object|null} Parsed config or null if not found
 */
export function loadConfig(dir = process.cwd()) {
  for (const name of CONFIG_FILENAMES) {
    const filePath = resolve(dir, name);
    if (existsSync(filePath)) {
      const raw = readFileSync(filePath, 'utf-8');
      const config = JSON.parse(raw);
      config._configPath = filePath;
      config._configDir = dirname(filePath);
      return config;
    }
  }
  return null;
}

/**
 * Load a specific config file by path.
 *
 * @param {string} filePath - Absolute or relative path to config file
 * @returns {object} Parsed config
 */
export function loadConfigFile(filePath) {
  const abs = resolve(filePath);
  if (!existsSync(abs)) throw new Error(`Config file not found: ${abs}`);
  const raw = readFileSync(abs, 'utf-8');
  const config = JSON.parse(raw);
  config._configPath = abs;
  config._configDir = dirname(abs);
  return config;
}

/**
 * Merge CLI args over config file values (CLI takes precedence).
 *
 * @param {object} config - Config from file
 * @param {object} cliArgs - Parsed CLI arguments
 * @returns {object} Merged options
 */
export function mergeConfig(config, cliArgs) {
  return {
    input:       cliArgs.input ?? config.input ?? null,
    schemas:     cliArgs.schemas ?? config.schemas ?? null,
    transforms:  cliArgs.transforms ?? config.transforms ?? null,
    output:      cliArgs.output ?? config.output ?? null,
    name:        cliArgs.name ?? config.name ?? null,
    baseLocale:  cliArgs.baseLocale ?? config.baseLocale ?? 'en',
    locales:     config.locales ?? null,
    localeMap:   config.localeMap ?? null,
    fieldGroupMap: config.fieldGroupMap ?? null,
    verbose:     cliArgs.verbose ?? false,
    open:        cliArgs.open ?? false,
    json:        cliArgs.json ?? false,
  };
}
