const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const tempDir = path.join(rootDir, ".tmp-tests");
const testsDir = path.join(rootDir, "tests");

fs.mkdirSync(tempDir, { recursive: true });

try {
  const testFiles = fs.readdirSync(testsDir)
    .filter((fileName) => fileName.endsWith(".test.ts"))
    .sort();

  for (const testFile of testFiles) {
    const outFile = path.join(tempDir, `${path.basename(testFile, ".ts")}.cjs`);
    esbuild.buildSync({
      bundle: true,
      entryPoints: [path.join(testsDir, testFile)],
      format: "cjs",
      outfile: outFile,
      platform: "node",
      sourcemap: "inline",
      target: ["node20"],
    });

    require(outFile);
  }

  console.log("Phase 3 VOIP tests passed");
} finally {
  try {
    fs.rmSync(tempDir, { force: true, recursive: true });
  } catch (_error) {
    // Ignore temp cleanup errors.
  }
}
