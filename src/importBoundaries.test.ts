/**
 * Enforces the architecture rules from CLAUDE.md §4, so a future edit cannot
 * quietly couple the pure core to React, the DOM, audio, the network or the
 * clock:
 *
 *   model/  imports nothing from parser/, input/ or ui/
 *   parser/ may import from model/ only
 *   input/  may import from parser/ and model/
 *   ui/     may import from anything
 *
 * Directories are walked recursively, so nested modules like
 * parser/transforms/ are covered too.
 */

import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL(".", import.meta.url));

/** Every non-test .ts/.tsx file under `directory`, recursively. */
function sourceFilesIn(directory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(join(SRC, directory), { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...sourceFilesIn(entryPath));
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    if (!/\.tsx?$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) {
      continue;
    }
    files.push(join(SRC, entryPath));
  }

  return files;
}

/** Every module specifier imported by a file. */
function importsOf(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*(?:import|export)[^;\n]*?from\s+["']([^"']+)["']/g;
  let match = pattern.exec(source);
  while (match !== null) {
    if (match[1] !== undefined) {
      specifiers.push(match[1]);
    }
    match = pattern.exec(source);
  }
  return specifiers;
}

/**
 * Only the imports that survive to runtime.
 *
 * `import type { … } from "x"` is erased at build time, so it cannot take part
 * in a runtime cycle. The check has to be per statement: a file may import
 * types from a module on one line and values from it on another.
 */
function valueImportsOf(path: string): string[] {
  const source = readFileSync(path, "utf8");
  const specifiers: string[] = [];
  const pattern = /(?:^|\n)\s*import\s+(type\s+)?[^;\n]*?from\s+["']([^"']+)["']/g;

  let match = pattern.exec(source);
  while (match !== null) {
    if (match[1] === undefined && match[2] !== undefined) {
      specifiers.push(match[2]);
    }
    match = pattern.exec(source);
  }
  return specifiers;
}

/**
 * Which top-level src/ directory an import resolves into: "model", "parser",
 * "input", "ui", or "external" for a bare package specifier.
 */
function layerOf(fromFile: string, specifier: string): string {
  if (!specifier.startsWith(".")) {
    return "external";
  }
  const target = resolve(dirname(fromFile), specifier);
  const fromSrc = relative(SRC, target);
  const layer = fromSrc.split(sep)[0];
  return layer ?? "unknown";
}

/** Source with comments stripped, so prose may mention what code may not use. */
function codeOf(path: string): string {
  return readFileSync(path, "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
}

describe("import boundaries", () => {
  it("model/ imports nothing outside model/", () => {
    for (const file of sourceFilesIn("model")) {
      for (const specifier of importsOf(file)) {
        expect(layerOf(file, specifier), `${file} imports ${specifier}`).toBe("model");
      }
    }
  });

  it("parser/ imports only from model/ and parser/", () => {
    for (const file of sourceFilesIn("parser")) {
      for (const specifier of importsOf(file)) {
        expect(["model", "parser"], `${file} imports ${specifier}`).toContain(
          layerOf(file, specifier),
        );
      }
    }
  });

  it("input/ imports only from model/, parser/ and input/", () => {
    for (const file of sourceFilesIn("input")) {
      for (const specifier of importsOf(file)) {
        expect(["model", "parser", "input"], `${file} imports ${specifier}`).toContain(
          layerOf(file, specifier),
        );
      }
    }
  });

  it("model/ and parser/ import no external packages at all", () => {
    // The pure core has zero runtime dependencies, which is what lets it be
    // extracted as a standalone package later.
    for (const directory of ["model", "parser"]) {
      for (const file of sourceFilesIn(directory)) {
        for (const specifier of importsOf(file)) {
          expect(layerOf(file, specifier), `${file} imports ${specifier}`).not.toBe("external");
        }
      }
    }
  });

  it("model/ and parser/ reference no browser globals", () => {
    // A stray `document.querySelector` or `navigator.clipboard` would compile
    // fine but break the "pure core" guarantee, so check the text directly.
    const browserGlobals = /\b(window|navigator|localStorage|fetch|WebSocket|AudioContext)\s*[.(]/;
    for (const directory of ["model", "parser"]) {
      for (const file of sourceFilesIn(directory)) {
        expect(codeOf(file), `${file} touches a browser global`).not.toMatch(browserGlobals);
      }
    }
  });

  it("the transforms never read the clock", () => {
    // Determinism: `now` is injected into resolveDate. If a transform ever
    // called new Date() or Date.now() itself, the same input would stop
    // producing the same output.
    for (const file of sourceFilesIn("parser/transforms")) {
      const code = codeOf(file);
      expect(code, `${file} calls new Date()`).not.toMatch(/new\s+Date\s*\(\s*\)/);
      expect(code, `${file} calls Date.now()`).not.toMatch(/\bDate\s*\.\s*now\s*\(/);
      expect(code, `${file} uses randomness`).not.toMatch(/\bMath\s*\.\s*random\s*\(/);
    }
  });

  it("no module imports another that imports it back", () => {
    /*
     * Type-only imports are erased, so they cannot cycle at runtime; a cycle
     * of real values can leave a module half-initialized, which is the kind of
     * bug that only shows up in production. Walk the value-import graph and
     * fail on any loop.
     */
    const graph = new Map<string, string[]>();
    for (const directory of ["model", "parser", "input", "ui"]) {
      for (const file of sourceFilesIn(directory)) {
        const targets: string[] = [];
        for (const specifier of valueImportsOf(file)) {
          if (!specifier.startsWith(".")) {
            continue;
          }
          targets.push(resolve(dirname(file), specifier).replace(/\.js$/, ""));
        }
        graph.set(file.replace(/\.tsx?$/, ""), targets);
      }
    }

    const visiting = new Set<string>();
    const done = new Set<string>();
    const trail: string[] = [];

    function walk(node: string): void {
      if (done.has(node)) {
        return;
      }
      if (visiting.has(node)) {
        const loop = [...trail.slice(trail.indexOf(node)), node]
          .map((p) => relative(SRC, p))
          .join(" -> ");
        throw new Error(`Import cycle: ${loop}`);
      }
      visiting.add(node);
      trail.push(node);
      for (const next of graph.get(node) ?? []) {
        walk(next);
      }
      trail.pop();
      visiting.delete(node);
      done.add(node);
    }

    expect(() => {
      for (const node of graph.keys()) {
        walk(node);
      }
    }).not.toThrow();
  });

  it("the transforms are actually covered by these checks", () => {
    // Guards the guard: if transforms/ moves, the purity tests above must not
    // silently start passing over an empty file list.
    expect(sourceFilesIn("parser/transforms").length).toBeGreaterThanOrEqual(4);
  });
});
