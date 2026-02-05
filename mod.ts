/**
 * @module
 *
 * A Deno bundler wrapper that provides external package resolution and string replacements.
 *
 * This module wraps Deno's built-in bundler with additional features:
 * - **External package resolution**: Automatically rewrites bare specifiers to their
 *   resolved Deno specifiers (npm:, jsr:, https:)
 * - **String replacements**: Apply arbitrary string replacements to bundled output
 * - **CLI support**: Use as a command-line tool with flexible argument parsing
 *
 * @example Basic programmatic usage
 * ```ts
 * import { build } from "@sandros94/deno-bundler";
 *
 * const result = await build({
 *   entrypoints: ["./main.ts"],
 *   external: ["h3", "rendu"],
 *   minify: true,
 * });
 *
 * console.log(`Bundled in ${result.duration}ms`);
 * ```
 *
 * @example With string replacements
 * ```ts
 * import { build } from "@sandros94/deno-bundler";
 *
 * await build({
 *   entrypoints: ["./main.ts"],
 *   replace: {
 *     "Deno.serve": "Bunny.v1.serve",
 *     "Deno.env": "Bun.env",
 *   },
 * });
 * ```
 *
 * @example CLI usage
 * ```bash
 * # Basic usage
 * deno run -A jsr:@sandros94/deno-bundler
 *
 * # With options
 * deno run -A jsr:@sandros94/deno-bundler \
 *   --entrypoints="./main.ts" \
 *   --external="h3,rendu" \
 *   --replace="Deno.serve=Bunny.v1.serve"
 * ```
 */

import { dirname } from "@std/path";
import { parseArgs } from "@std/cli/parse-args";
import { Workspace } from "@deno/loader";

// #region Types

/**
 * Build options for the bundler.
 *
 * @property external - List of packages to mark as external (won't be bundled)
 * @property entrypoints - Entry point files to bundle
 * @property outputDir - Output directory for bundled files
 * @property outputPath - Output path for a single file bundle
 * @property minify - Whether to minify the output
 * @property replace - String replacements to apply to the bundled output
 */
export interface BuildOptions {
  /**
   * List of packages to mark as external (won't be bundled).
   * These will be rewritten to their resolved Deno specifiers.
   */
  external?: string[];
  /**
   * Entry point files to bundle.
   * @default ["./main.ts"]
   */
  entrypoints?: string[];
  /**
   * Output directory for bundled files.
   * @default "dist"
   */
  outputDir?: string;
  /**
   * Output path for a single file bundle.
   */
  outputPath?: string;
  /**
   * Whether to minify the output.
   * @default true
   */
  minify?: boolean;
  /**
   * String replacements to apply to the bundled output.
   * Keys are the strings to find, values are the replacements.
   * @example { "Deno.serve": "Bunny.v1.serve" }
   */
  replace?: Record<string, string>;
}

/**
 * Result of the build process.
 *
 * @property duration - Time taken to bundle in milliseconds
 * @property outputFiles - Output files that were written
 */
export interface BuildResult {
  /** Time taken to bundle in milliseconds */
  duration: number;
  /** Output files that were written */
  outputFiles: string[];
}

// #endregion Types

// #region Build Function

/**
 * Bundle a Deno project using Deno's built-in bundler.
 *
 * @param options - Build configuration options
 * @returns Build result with duration and output files
 *
 * @example
 * ```ts
 * import { build } from "@sandros94/deno-bundler";
 *
 * await build({
 *   entrypoints: ["./main.ts"],
 *   external: ["h3", "rendu"],
 *   minify: true,
 *   replace: { "Deno.serve": "Bunny.v1.serve" },
 * });
 * ```
 */
export async function build(options: BuildOptions = {}): Promise<BuildResult> {
  const {
    external = [],
    entrypoints = ["./main.ts"],
    outputDir = "dist",
    outputPath,
    minify = true,
    replace = {},
  } = options;

  const start = Date.now();
  console.log("Bundling project...");

  const mappings = await buildExternalMappings(external, entrypoints);

  const result = await Deno.bundle({
    entrypoints,
    external,
    packages: mappings !== null ? "external" : "bundle",
    outputDir: outputPath ? undefined : outputDir,
    outputPath,
    format: "esm",
    minify,
    write: false,
  });

  const outputFiles: string[] = [];

  for (const file of result.outputFiles!) {
    let code = file.text();

    // Apply string replacements
    for (const [search, replacement] of Object.entries(replace)) {
      code = code.replaceAll(search, replacement);
    }

    // Replace import/export statements with Deno specifiers
    if (mappings) {
      for (const [bareSpecifier, denoSpecifier] of mappings) {
        // Match: import ... from "bareSpecifier" or import ... from 'bareSpecifier'
        // Also match: export ... from "bareSpecifier"
        const importRegex = new RegExp(
          `((?:import|export)(?:[^"']*?)from\\s*["'])${
            escapeRegExp(bareSpecifier)
          }(["'])`,
          "g",
        );
        const dynamicImportRegex = new RegExp(
          `(import\\s*\\(\\s*["'])${escapeRegExp(bareSpecifier)}(["']\\s*\\))`,
          "g",
        );

        code = code.replace(importRegex, `$1${denoSpecifier}$2`);
        code = code.replace(dynamicImportRegex, `$1${denoSpecifier}$2`);
      }
    }

    try {
      // Ensure output directory exists
      Deno.mkdirSync(dirname(file.path), { recursive: true });
    } catch { /* ignore */ }
    Deno.writeTextFileSync(file.path, code);

    outputFiles.push(file.path);
  }

  const duration = Date.now() - start;
  console.log(`Bundle completed in ${duration}ms`);

  return { duration, outputFiles };
}

// #endregion Build Function

// #region Internal

interface LoaderGraph {
  roots: string[];
  modules: {
    kind: string;
    dependencies: {
      specifier: string;
      code: {
        specifier: string;
        resolutionMode: string;
        span: {
          start: { line: number; character: number };
          end: { line: number; character: number };
        };
      };
    }[];
    size: number;
    mediaType: string;
    specifier: string;
  }[];
  redirects: Record<string, string>;
  packages: Record<string, string>;
}

async function buildExternalMappings(
  external: string[],
  entrypoints: string[],
): Promise<Map<string, string> | null> {
  if (!external || external.length === 0) {
    return null;
  }

  const workspace = new Workspace();
  const loader = await workspace.createLoader();
  await loader.addEntrypoints(entrypoints);
  const graph = loader.getGraphUnstable() as LoaderGraph;

  const mappings = new Map<string, string>();

  for (const module of graph.modules) {
    if (module.kind !== "esm" || !module.dependencies) continue;

    for (const dep of module.dependencies) {
      if (!dep.code) continue;

      const bareSpecifier = dep.specifier;
      const denoSpecifier = dep.code.specifier;
      const resolvedSpecifier = graph.redirects[denoSpecifier] ?? denoSpecifier;

      // Skip if resolvedSpecifier is not a string (importing an unknown package)
      if (!resolvedSpecifier || typeof resolvedSpecifier !== "string") continue;

      // Deno's loader returns specifiers as canonical URLs
      const normalizedSpecifier = resolvedSpecifier
        .replace(/^npm:\//, "npm:")
        .replace(/^jsr:\//, "jsr:");

      // Only add if it's an npm/jsr/https import AND matches external list
      const isExternalProtocol = normalizedSpecifier.startsWith("npm:") ||
        normalizedSpecifier.startsWith("jsr:") ||
        normalizedSpecifier.startsWith("https:");

      if (
        isExternalProtocol &&
        external.some((ext) => bareSpecifier.startsWith(ext))
      ) {
        mappings.set(bareSpecifier, normalizedSpecifier);
      }
    }
  }

  if (mappings.size > 0) {
    console.error(
      [
        "External mappings:",
        ...Array.from(
          mappings.entries().map(([key, value]) => `${key} => ${value}`),
        ),
      ].join("\n\t"),
    );
  }

  return mappings;
}

/**
 * Escapes special regex characters in a string.
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// #endregion Internal

// #region CLI

/**
 * Parse CLI arguments into BuildOptions.
 *
 * Supports both formats for array arguments:
 * - Comma-separated: `--external="lib1,lib2,lib3"`
 * - Multiple flags: `--external=lib1 --external=lib2 --external=lib3`
 *
 * For replace, use `key=value` format:
 * - `--replace="Deno.serve=Bunny.v1.serve"`
 * - `--replace="old1=new1" --replace="old2=new2"`
 *
 * @param args - Command line arguments array (typically `Deno.args`)
 * @returns Parsed build options
 *
 * @example
 * ```ts
 * import { parseCliArgs } from "@sandros94/deno-bundler";
 *
 * const options = parseCliArgs([
 *   "--external=h3,rendu",
 *   "--entrypoints=./main.ts",
 *   "--replace=Deno.serve=Bunny.v1.serve",
 * ]);
 * ```
 */
export function parseCliArgs(args: string[]): BuildOptions {
  const parsed = parseArgs(args, {
    string: ["external", "entrypoints", "outputDir", "outputPath", "replace"],
    boolean: ["minify", "no-minify"],
    collect: ["external", "entrypoints", "replace"],
    alias: {
      e: "external",
      i: "entrypoints",
      o: "outputDir",
      m: "minify",
      r: "replace",
    },
    default: {
      minify: true,
    },
  });

  // Handle external: support both comma-separated and multiple flags
  const external = normalizeArrayArg(parsed.external);

  // Handle entrypoints: support both comma-separated and multiple flags
  const entrypoints = [
    ...normalizeArrayArg(parsed.entrypoints),
    ...normalizeArrayArg(parsed._),
  ];

  // Handle replace: parse "key=value" format
  const replaceArgs = normalizeArrayArg(parsed.replace);
  const replace: Record<string, string> = {};
  for (const arg of replaceArgs) {
    const eqIndex = arg.indexOf("=");
    if (eqIndex > 0) {
      const key = arg.slice(0, eqIndex);
      const value = arg.slice(eqIndex + 1);
      replace[key] = value;
    }
  }

  return {
    external: external.length > 0 ? external : undefined,
    entrypoints: entrypoints.length > 0 ? entrypoints : undefined,
    outputDir: parsed.outputDir as string | undefined,
    outputPath: parsed.outputPath as string | undefined,
    minify: parsed["no-minify"] ? false : parsed.minify,
    replace: Object.keys(replace).length > 0 ? replace : undefined,
  };
}

/**
 * Normalize array arguments - handles both comma-separated strings and arrays.
 */
function normalizeArrayArg(arg: Array<string | number> | undefined): string[] {
  if (!arg) return [];
  const items = Array.isArray(arg) ? arg : [arg];
  return items.flatMap((item) => String(item).split(",")).filter(Boolean);
}

// CLI entry point
if (import.meta.main) {
  const options = parseCliArgs(Deno.args);

  await build({
    external: options.external,
    entrypoints: options.entrypoints,
    outputDir: options.outputDir,
    outputPath: options.outputPath,
    minify: options.minify,
    replace: options.replace,
  });
}

// #endregion CLI
