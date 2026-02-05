import { afterEach, beforeEach, describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { build, parseCliArgs } from "./mod.ts";

describe("parseCliArgs", () => {
  describe("external option", () => {
    it("should parse comma-separated external packages", () => {
      const result = parseCliArgs(["--external=h3,rendu,hono"]);

      expect(result.external).toEqual(["h3", "rendu", "hono"]);
    });

    it("should parse multiple --external flags", () => {
      const result = parseCliArgs([
        "--external=h3",
        "--external=rendu",
        "--external=hono",
      ]);

      expect(result.external).toEqual(["h3", "rendu", "hono"]);
    });

    it("should parse short -e flag", () => {
      const result = parseCliArgs(["-e", "h3", "-e", "rendu"]);

      expect(result.external).toEqual(["h3", "rendu"]);
    });

    it("should return undefined when no external packages specified", () => {
      const result = parseCliArgs([]);

      expect(result.external).toBeUndefined();
    });
  });

  describe("entrypoints option", () => {
    it("should parse comma-separated entrypoints", () => {
      const result = parseCliArgs([
        "--entrypoints=./src/main.ts,./src/worker.ts",
      ]);

      expect(result.entrypoints).toEqual(["./src/main.ts", "./src/worker.ts"]);
    });

    it("should parse multiple --entrypoints flags", () => {
      const result = parseCliArgs([
        "--entrypoints=./src/main.ts",
        "--entrypoints=./src/worker.ts",
      ]);

      expect(result.entrypoints).toEqual(["./src/main.ts", "./src/worker.ts"]);
    });

    it("should parse short -i flag", () => {
      const result = parseCliArgs(["-i", "./src/main.ts"]);

      expect(result.entrypoints).toEqual(["./src/main.ts"]);
    });

    it("should return undefined when no entrypoints specified", () => {
      const result = parseCliArgs([]);

      expect(result.entrypoints).toBeUndefined();
    });
  });

  describe("replace option", () => {
    it("should parse single replace argument", () => {
      const result = parseCliArgs(["--replace=Deno.serve=Bunny.v1.serve"]);

      expect(result.replace).toEqual({ "Deno.serve": "Bunny.v1.serve" });
    });

    it("should parse multiple replace arguments", () => {
      const result = parseCliArgs([
        "--replace=Deno.serve=Bunny.v1.serve",
        "--replace=Deno.env=Bun.env",
      ]);

      expect(result.replace).toEqual({
        "Deno.serve": "Bunny.v1.serve",
        "Deno.env": "Bun.env",
      });
    });

    it("should parse short -r flag", () => {
      const result = parseCliArgs(["-r", "old=new"]);

      expect(result.replace).toEqual({ old: "new" });
    });

    it("should handle values containing equals sign", () => {
      const result = parseCliArgs(["--replace=a=b=c"]);

      expect(result.replace).toEqual({ a: "b=c" });
    });

    it("should return undefined when no replace specified", () => {
      const result = parseCliArgs([]);

      expect(result.replace).toBeUndefined();
    });
  });

  describe("outputDir option", () => {
    it("should parse outputDir", () => {
      const result = parseCliArgs(["--outputDir=build"]);

      expect(result.outputDir).toBe("build");
    });

    it("should parse short -o flag", () => {
      const result = parseCliArgs(["-o", "build"]);

      expect(result.outputDir).toBe("build");
    });
  });

  describe("outputPath option", () => {
    it("should parse outputPath", () => {
      const result = parseCliArgs(["--outputPath=dist/bundle.js"]);

      expect(result.outputPath).toBe("dist/bundle.js");
    });
  });

  describe("minify option", () => {
    it("should default to true", () => {
      const result = parseCliArgs([]);

      expect(result.minify).toBe(true);
    });

    it("should be false when --no-minify is specified", () => {
      const result = parseCliArgs(["--no-minify"]);

      expect(result.minify).toBe(false);
    });

    it("should be true when --minify is explicitly specified", () => {
      const result = parseCliArgs(["--minify"]);

      expect(result.minify).toBe(true);
    });
  });

  describe("combined options", () => {
    it("should parse all options together", () => {
      const result = parseCliArgs([
        "--entrypoints=./src/main.ts",
        "--external=h3,rendu",
        "--outputDir=build",
        "--no-minify",
        "--replace=Deno.serve=Bunny.v1.serve",
      ]);

      expect(result).toEqual({
        entrypoints: ["./src/main.ts"],
        external: ["h3", "rendu"],
        outputDir: "build",
        outputPath: undefined,
        minify: false,
        replace: { "Deno.serve": "Bunny.v1.serve" },
      });
    });
  });
});

describe("build", () => {
  const testDir = "./test_fixtures";
  const outputDir = "./test_output";

  beforeEach(async () => {
    // Create test fixtures directory
    await Deno.mkdir(testDir, { recursive: true });

    // Create a simple test file
    await Deno.writeTextFile(
      `${testDir}/main.ts`,
      `export const message = "Hello, World!";\nconsole.log(message);`,
    );
  });

  afterEach(async () => {
    // Cleanup test directories
    try {
      await Deno.remove(testDir, { recursive: true });
    } catch { /* ignore */ }
    try {
      await Deno.remove(outputDir, { recursive: true });
    } catch { /* ignore */ }
  });

  it("should bundle a simple file", async () => {
    const result = await build({
      entrypoints: [`${testDir}/main.ts`],
      outputDir,
      minify: false,
    });

    expect(result.duration).toBeGreaterThan(0);
    expect(result.outputFiles.length).toBeGreaterThan(0);

    // Verify output file exists
    const outputFile = result.outputFiles[0];
    const stat = await Deno.stat(outputFile);
    expect(stat.isFile).toBe(true);
  });

  it("should apply string replacements", async () => {
    // Create a file with content to replace
    await Deno.writeTextFile(
      `${testDir}/replace.ts`,
      `const serve = Deno.serve;\nexport { serve };`,
    );

    const result = await build({
      entrypoints: [`${testDir}/replace.ts`],
      outputDir,
      minify: false,
      replace: { "Deno.serve": "Bunny.v1.serve" },
    });

    // Read the output and verify replacement
    const outputContent = await Deno.readTextFile(result.outputFiles[0]);
    expect(outputContent).toContain("Bunny.v1.serve");
    expect(outputContent).not.toContain("Deno.serve");
  });

  it("should create output directory if it doesn't exist", async () => {
    const nestedOutput = `${outputDir}/nested/deep`;

    const result = await build({
      entrypoints: [`${testDir}/main.ts`],
      outputDir: nestedOutput,
      minify: false,
    });

    expect(result.outputFiles.length).toBeGreaterThan(0);

    // Verify the nested directory was created
    const stat = await Deno.stat(nestedOutput);
    expect(stat.isDirectory).toBe(true);
  });

  it("should respect minify option", async () => {
    const [minifiedResult, unminifiedResult] = await Promise.all([
      build({
        entrypoints: [`${testDir}/main.ts`],
        outputDir: `${outputDir}/minified`,
        minify: true,
      }),
      build({
        entrypoints: [`${testDir}/main.ts`],
        outputDir: `${outputDir}/unminified`,
        minify: false,
      }),
    ]);

    const minifiedContent = await Deno.readTextFile(
      minifiedResult.outputFiles[0],
    );
    const unminifiedContent = await Deno.readTextFile(
      unminifiedResult.outputFiles[0],
    );

    // Minified should generally be shorter or equal
    expect(minifiedContent.length).toBeLessThanOrEqual(
      unminifiedContent.length,
    );
  });
});
