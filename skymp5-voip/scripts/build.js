const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const packageRoot = path.resolve(__dirname, "..");
const rootDistDir = path.resolve(packageRoot, "..", "build", "dist");
const distRoot = path.join(rootDistDir, "voip");
const clientPluginsDistRoot = path.join(rootDistDir, "client", "Data", "Platform", "Plugins");
const serverPluginDistRoot = path.join(distRoot, "server");
const uiSourceRoot = path.join(packageRoot, "ui");
const uiDistRoot = path.join(distRoot, "ui");

const ensureDirectory = (directoryPath) => {
  fs.mkdirSync(directoryPath, { recursive: true });
};

const copyUiHtmlFiles = () => {
  const htmlFiles = ["voip-test.html", "voip-raw.html"];
  for (const fileName of htmlFiles) {
    fs.copyFileSync(
      path.join(uiSourceRoot, "public", fileName),
      path.join(uiDistRoot, fileName),
    );
  }
};

const build = async () => {
  ensureDirectory(distRoot);
  ensureDirectory(clientPluginsDistRoot);
  ensureDirectory(serverPluginDistRoot);
  fs.rmSync(uiDistRoot, { force: true, recursive: true });
  ensureDirectory(uiDistRoot);

  await esbuild.build({
    bundle: true,
    entryPoints: [path.join(packageRoot, "ts", "voipDevServer.ts")],
    keepNames: true,
    minify: true,
    outfile: path.join(distRoot, "voip-dev-server.js"),
    platform: "node",
    sourcemap: true,
    target: ["es2022"],
  });

  await esbuild.build({
    bundle: true,
    entryPoints: [path.join(packageRoot, "server", "index.ts")],
    keepNames: true,
    minify: true,
    outfile: path.join(serverPluginDistRoot, "skymp5-voip-server-plugin.js"),
    platform: "node",
    sourcemap: true,
    target: ["es2022"],
  });

  await esbuild.build({
    bundle: true,
    entryPoints: [path.join(packageRoot, "client", "index.ts")],
    format: "iife",
    keepNames: true,
    minify: false,
    outfile: path.join(clientPluginsDistRoot, "skymp5-voip.js"),
    platform: "browser",
    sourcemap: true,
    target: ["es2019"],
  });

  await esbuild.build({
    bundle: true,
    entryPoints: {
      "voip-raw": path.join(uiSourceRoot, "src", "voipRaw.ts"),
      "voip-test": path.join(uiSourceRoot, "src", "voipTest.ts"),
    },
    format: "iife",
    outdir: uiDistRoot,
    platform: "browser",
    sourcemap: true,
    target: ["chrome100"],
  });

  copyUiHtmlFiles();
};

build().catch((error) => {
  console.error("[skymp5-voip build] failed", error);
  process.exitCode = 1;
});
