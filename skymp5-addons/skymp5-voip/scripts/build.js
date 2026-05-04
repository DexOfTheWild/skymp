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
const defaultDotEnvPath = path.join(packageRoot, ".env");
const defaultVoipClientSettingsPath = path.join(
  clientPluginsDistRoot,
  "skymp5-voip-settings.txt",
);

const DEFAULT_VOIP_CLIENT_ENABLED = true;
const DEFAULT_VOIP_CLIENT_POSITIONAL_AUDIO_MODE = "stereo";
const DEFAULT_VOIP_CLIENT_PTT_KEY = "V";
const DEFAULT_VOIP_PUBLIC_HOST = "localhost";
const DEFAULT_VOIP_UI_PORT = 3443;

const ensureDirectory = (directoryPath) => {
  fs.mkdirSync(directoryPath, { recursive: true });
};

const copyUiPublicFiles = () => {
  fs.cpSync(path.join(uiSourceRoot, "public"), uiDistRoot, { recursive: true });
};

const decodeDoubleQuotedDotEnvValue = (value) => {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
};

const parseDotEnvEntry = (line, lineNumber) => {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const withoutExport = trimmed.startsWith("export ")
    ? trimmed.slice("export ".length).trim()
    : trimmed;
  const separatorIndex = withoutExport.indexOf("=");
  if (separatorIndex <= 0) {
    throw new Error(`Invalid .env entry on line ${lineNumber}`);
  }

  const key = withoutExport.slice(0, separatorIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
    throw new Error(`Invalid .env key '${key}' on line ${lineNumber}`);
  }

  let rawValue = withoutExport.slice(separatorIndex + 1).trim();
  if (rawValue.startsWith("\"")) {
    if (!rawValue.endsWith("\"") || rawValue.length === 1) {
      throw new Error(`Unterminated double-quoted .env value for '${key}' on line ${lineNumber}`);
    }
    rawValue = decodeDoubleQuotedDotEnvValue(rawValue.slice(1, -1));
  } else if (rawValue.startsWith("'")) {
    if (!rawValue.endsWith("'") || rawValue.length === 1) {
      throw new Error(`Unterminated single-quoted .env value for '${key}' on line ${lineNumber}`);
    }
    rawValue = rawValue.slice(1, -1);
  } else {
    rawValue = rawValue.replace(/\s+#.*$/, "").trim();
  }

  return { key, value: rawValue };
};

const loadDotEnv = (envPath) => {
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  const lines = contents.split(/\r?\n/);
  lines.forEach((line, index) => {
    const entry = parseDotEnvEntry(line, index + 1);
    if (!entry) {
      return;
    }

    if (process.env[entry.key] === undefined) {
      process.env[entry.key] = entry.value;
    }
  });
};

const readOptionalEnvString = (name) => {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : "";
};

const parsePositiveInteger = (name, fallback) => {
  const value = readOptionalEnvString(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric value for ${name}: '${value}'`);
  }

  return parsed;
};

const parseBoolean = (name, fallback) => {
  const value = readOptionalEnvString(name);
  if (!value) {
    return fallback;
  }

  const normalized = value.toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value for ${name}: '${value}'`);
};

const createDefaultUiOrigin = () => {
  const publicHost = readOptionalEnvString("VOIP_PUBLIC_HOST") || DEFAULT_VOIP_PUBLIC_HOST;
  const uiPort = parsePositiveInteger("VOIP_UI_PORT", DEFAULT_VOIP_UI_PORT);
  return `https://${publicHost}:${uiPort}`;
};

const createVoipClientSettings = () => {
  const defaultUiOrigin = createDefaultUiOrigin();

  return {
    enabled: parseBoolean("VOIP_CLIENT_ENABLED", DEFAULT_VOIP_CLIENT_ENABLED),
    positionalAudioMode:
      readOptionalEnvString("VOIP_CLIENT_POSITIONAL_AUDIO_MODE") ||
      DEFAULT_VOIP_CLIENT_POSITIONAL_AUDIO_MODE,
    pttKey: readOptionalEnvString("VOIP_CLIENT_PTT_KEY") || DEFAULT_VOIP_CLIENT_PTT_KEY,
    rawUiUrl:
      readOptionalEnvString("VOIP_CLIENT_RAW_UI_URL") || `${defaultUiOrigin}/voip-raw.html`,
    uiUrl: readOptionalEnvString("VOIP_CLIENT_UI_URL") || `${defaultUiOrigin}/voip-test/`,
  };
};

const writeVoipClientSettings = () => {
  const contents = `${JSON.stringify(createVoipClientSettings(), null, 2)}\n`;
  fs.writeFileSync(defaultVoipClientSettingsPath, contents, "utf8");
};

const build = async () => {
  loadDotEnv(defaultDotEnvPath);
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

  copyUiPublicFiles();
  writeVoipClientSettings();
};

build().catch((error) => {
  console.error("[skymp5-voip build] failed", error);
  process.exitCode = 1;
});
