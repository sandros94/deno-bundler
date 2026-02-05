# @sandros94/deno-bundler

> A powerful Deno bundler wrapper that provides external package resolution and
> string replacements for seamless module bundling.

[![JSR Badge](https://jsr.io/badges/@sandros94/deno-bundler)](https://jsr.io/@sandros94/deno-bundler)
[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://demo-deno-bundler-45xes.bunny.run)

## ✨ Features

- 📦 **External package resolution**: Automatically rewrites bare specifiers to
  their resolved Deno specifiers (`npm:`, `jsr:`, `https:`)
- 🔄 **String replacements**: Apply arbitrary string replacements to bundled
  output
- 🖥️ **CLI support**: Use as a command-line tool with flexible argument parsing
- 🚀 **ESM output**: Generates ES modules with minification support

## 🔗 Quick Links

- **Live Demo**:
  [https://demo-deno-bundler-45xes.bunny.run](https://demo-deno-bundler-45xes.bunny.run)
- **Demo Repository**:
  [https://github.com/sandros94/demo-deno-bundler](https://github.com/sandros94/demo-deno-bundler)
- **JSR Package**:
  [https://jsr.io/@sandros94/deno-bundler](https://jsr.io/@sandros94/deno-bundler)

## Installation

```bash
deno add jsr:@sandros94/deno-bundler
```

## Programmatic Usage

### Basic Example

```ts
import { build } from "@sandros94/deno-bundler";

const result = await build({
  entrypoints: ["./main.ts"],
  external: ["h3", "rendu"],
  minify: true,
});

console.log(`Bundled in ${result.duration}ms`);
console.log(`Output files: ${result.outputFiles.join(", ")}`);
```

### With String Replacements

Use the `replace` option to perform string replacements on the bundled output.
This is useful for adapting code to different runtimes:

```ts
import { build } from "@sandros94/deno-bundler";

await build({
  entrypoints: ["./main.ts"],
  replace: {
    "Deno.serve": "Bunny.v1.serve",
    "Deno.env": "Bun.env",
  },
});
```

### Options

| Option        | Type                     | Default         | Description                                     |
| ------------- | ------------------------ | --------------- | ----------------------------------------------- |
| `entrypoints` | `string[]`               | `["./main.ts"]` | Entry point files to bundle                     |
| `external`    | `string[]`               | `[]`            | Packages to mark as external (won't be bundled) |
| `outputDir`   | `string`                 | `"dist"`        | Output directory for bundled files              |
| `outputPath`  | `string`                 | -               | Output path for single file bundle              |
| `minify`      | `boolean`                | `true`          | Whether to minify the output                    |
| `replace`     | `Record<string, string>` | `{}`            | String replacements to apply to bundled output  |

## CLI Usage

Run the bundler directly from JSR:

```bash
deno run -A jsr:@sandros94/deno-bundler
```

### CLI Options

| Flag            | Alias | Description                              |
| --------------- | ----- | ---------------------------------------- |
| `--entrypoints` | `-i`  | Entry point files (comma-separated)      |
| `--external`    | `-e`  | External packages (comma-separated)      |
| `--outputDir`   | `-o`  | Output directory                         |
| `--outputPath`  |       | Output path for single file              |
| `--minify`      | `-m`  | Enable minification (default: true)      |
| `--no-minify`   |       | Disable minification                     |
| `--replace`     | `-r`  | String replacement in `key=value` format |

### CLI Examples

```bash
# Basic usage with defaults
deno run -A jsr:@sandros94/deno-bundler

# Specify entrypoints and external packages
deno run -A jsr:@sandros94/deno-bundler \
  --entrypoints="./main.ts" \
  --external="h3,rendu"

# Multiple external packages (alternative syntax)
deno run -A jsr:@sandros94/deno-bundler \
  -e h3 \
  -e rendu \
  -i ./main.ts

# With string replacements
deno run -A jsr:@sandros94/deno-bundler \
  --replace="Deno.serve=Bunny.v1.serve" \
  --replace="Deno.env=Bun.env"

# Disable minification
deno run -A jsr:@sandros94/deno-bundler --no-minify

# Custom output directory
deno run -A jsr:@sandros94/deno-bundler --outputDir=build
```

## How It Works

1. **Bundling**: Uses Deno's built-in `Deno.bundle()` API to bundle your
   entrypoints
2. **External Resolution**: Analyzes the module graph using `@deno/loader` to
   map bare specifiers (like `"h3"`) to their resolved Deno specifiers (like
   `"jsr:@hono/h3@1.0.0"`)
3. **Post-processing**: Applies string replacements and rewrites import
   statements in the bundled output
4. **Output**: Writes the processed files to the output directory

## Requirements

- Deno >=2.4 with `Deno.bundle()` API (unstable)

The `Deno.bundle()` API requires the unstable bundle feature. Add this to your
`deno.json`:

```json
{
  "unstable": ["bundle"]
}
```

Or run with the `--unstable-bundle` flag:

```bash
deno run -A --unstable-bundle jsr:@sandros94/deno-bundler
```

## License

MIT
