const Koa = require("koa");
const Router = require("koa-router");
const serve = require("koa-static");

import * as fs from "fs";
import { IncomingMessage } from "http";
import * as https from "https";
import * as net from "net";
import { AccessToken } from "livekit-server-sdk";
import { AddressInfo } from "net";
import * as path from "path";
import { Duplex } from "stream";
import { RawData, WebSocket, WebSocketServer } from "ws";

type KoaContext = {
  body?: unknown;
  path: string;
  query: Record<string, unknown>;
  redirect: (destination: string) => void;
  response: {
    type?: string;
  };
  set: (name: string, value: string) => void;
  status: number;
  throw: (status: number, message: string) => never;
};

type VoipConfig = {
  apiKey: string;
  apiSecret: string;
  bindHost: string;
  certPath: string;
  keyPath: string;
  liveKitHost: string;
  liveKitPort: number;
  publicHost: string;
  roomName: string;
  signalPort: number;
  tokenTtlSeconds: number;
  uiDir: string;
  uiPort: number;
};

const LIVEKIT_CONNECT_TIMEOUT_MS = 1000;
const DEFAULT_DOTENV_FILENAME = ".env";

const decodeDoubleQuotedDotEnvValue = (value: string): string => {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, "\"")
    .replace(/\\\\/g, "\\");
};

const parseDotEnvEntry = (
  line: string,
  lineNumber: number,
): { key: string; value: string } | null => {
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

const getDotEnvPath = (): string => {
  return path.resolve(process.cwd(), DEFAULT_DOTENV_FILENAME);
};

const loadDotEnv = (): void => {
  const envPath = getDotEnvPath();
  if (!fs.existsSync(envPath)) {
    return;
  }

  const contents = fs.readFileSync(envPath, "utf8");
  const lines = contents.split(/\r?\n/);
  let loadedCount = 0;

  lines.forEach((line, index) => {
    const entry = parseDotEnvEntry(line, index + 1);
    if (!entry) {
      return;
    }

    if (process.env[entry.key] === undefined) {
      process.env[entry.key] = entry.value;
      loadedCount += 1;
    }
  });

  console.log(`[voip-dev-server] loaded ${loadedCount} environment value(s) from ${envPath}`);
};

const parseRequiredString = (value: string | undefined, name: string): string => {
  const trimmed = value?.trim();
  if (!trimmed) {
    throw new Error(`Missing required ${name}`);
  }
  return trimmed;
};

const parseNumber = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid numeric value '${value}'`);
  }
  return parsed;
};

const assertFileExists = (filePath: string, label: string): void => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`${label} not found: ${filePath}`);
  }
};

const assertDirectoryExists = (directoryPath: string, label: string): void => {
  if (!fs.existsSync(directoryPath)) {
    throw new Error(`${label} not found: ${directoryPath}`);
  }
};

const sanitizeIdentity = (identityValue: unknown): string => {
  const identity = typeof identityValue === "string" ? identityValue.trim() : "";
  if (!identity) {
    throw new Error("identity is required");
  }
  if (identity.length > 64) {
    throw new Error("identity must be 64 characters or fewer");
  }
  return identity;
};

const getDefaultUiDir = (): string => {
  return path.resolve(__dirname, "ui");
};

const getSuggestedLiveKitCommand = (liveKitPort: number): string => {
  const args = ["--dev", "--bind", "0.0.0.0"];
  if (liveKitPort !== 7880) {
    args.push("--port", String(liveKitPort));
  }
  return `livekit-server ${args.join(" ")}`;
};

const loadConfig = (): VoipConfig => {
  const certPath = parseRequiredString(
    process.env.VOIP_TLS_CERT_PATH,
    "VOIP_TLS_CERT_PATH",
  );
  const keyPath = parseRequiredString(
    process.env.VOIP_TLS_KEY_PATH,
    "VOIP_TLS_KEY_PATH",
  );

  assertFileExists(certPath, "VoIP TLS certificate");
  assertFileExists(keyPath, "VoIP TLS private key");

  const uiDir = process.env.VOIP_UI_DIR
    ? path.resolve(process.env.VOIP_UI_DIR)
    : getDefaultUiDir();
  assertDirectoryExists(uiDir, "VoIP UI directory");

  const liveKitPort = parseNumber(process.env.VOIP_LIVEKIT_PORT, 7880);

  return {
    apiKey: process.env.VOIP_API_KEY?.trim() || "devkey",
    apiSecret: process.env.VOIP_API_SECRET?.trim() || "secret",
    bindHost: process.env.VOIP_BIND_HOST?.trim() || "0.0.0.0",
    certPath,
    keyPath,
    liveKitHost: process.env.VOIP_LIVEKIT_HOST?.trim() || "127.0.0.1",
    liveKitPort,
    publicHost: process.env.VOIP_PUBLIC_HOST?.trim() || "localhost",
    roomName: process.env.VOIP_ROOM_NAME?.trim() || "whiterun-test",
    signalPort: parseNumber(process.env.VOIP_SIGNAL_PORT, 7443),
    tokenTtlSeconds: parseNumber(process.env.VOIP_TOKEN_TTL_SECONDS, 900),
    uiDir,
    uiPort: parseNumber(process.env.VOIP_UI_PORT, 3443),
  };
};

const withNoStore = (ctx: KoaContext): void => {
  ctx.set("Cache-Control", "no-store, no-cache, must-revalidate");
};

const serializeError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.stack || error.message;
  }
  return String(error);
};

const isValidCloseCode = (code: unknown): boolean => {
  if (typeof code !== "number" || !Number.isInteger(code)) {
    return false;
  }

  if (code >= 3000 && code <= 4999) {
    return true;
  }

  return [
    1000,
    1001,
    1002,
    1003,
    1007,
    1008,
    1009,
    1010,
    1011,
    1012,
    1013,
    1014,
  ].includes(code);
};

const normalizeCloseReason = (reason: unknown): string | undefined => {
  const text =
    typeof reason === "string"
      ? reason
      : Buffer.isBuffer(reason) || reason instanceof Uint8Array
        ? Buffer.from(reason).toString("utf8")
        : "";

  if (!text) {
    return undefined;
  }

  let trimmed = text;
  while (Buffer.byteLength(trimmed, "utf8") > 123) {
    trimmed = trimmed.slice(0, -1);
  }

  return trimmed || undefined;
};

const closeSocketSafely = (
  socket: WebSocket,
  label: string,
  code?: unknown,
  reason?: unknown,
): void => {
  if (socket.readyState !== WebSocket.OPEN && socket.readyState !== WebSocket.CONNECTING) {
    return;
  }

  const normalizedReason = normalizeCloseReason(reason);

  try {
    if (typeof code === "number" && isValidCloseCode(code)) {
      socket.close(code, normalizedReason);
      return;
    }

    if (code !== undefined) {
      console.warn(
        `[voip-dev-server] ignoring invalid close code from ${label}: ${String(code)}`,
      );
    }
    socket.close();
  } catch (error) {
    console.error(
      `[voip-dev-server] failed to close ${label} socket cleanly`,
      serializeError(error),
    );
    socket.terminate();
  }
};

const createTokenPayload = async (
  config: VoipConfig,
  identity: string,
): Promise<Record<string, string>> => {
  const serverTime = new Date();
  const expiresAt = new Date(serverTime.getTime() + config.tokenTtlSeconds * 1000);

  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity,
    ttl: `${config.tokenTtlSeconds}s`,
  });
  token.addGrant({
    room: config.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return {
    token: await token.toJwt(),
    identity,
    roomName: config.roomName,
    wsUrl: `wss://${config.publicHost}:${config.signalPort}/rtc`,
    serverTime: serverTime.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };
};

const serveHtmlFile = (ctx: KoaContext, absolutePath: string): void => {
  withNoStore(ctx);
  ctx.response.type = "text/html";
  ctx.body = fs.createReadStream(absolutePath);
};

const normalizeProbeHost = (host: string): string => {
  switch (host) {
    case "0.0.0.0":
    case "::":
    case "[::]":
      return "127.0.0.1";
    default:
      return host;
  }
};

const isTcpServiceReachable = async (
  host: string,
  port: number,
  timeoutMs: number = LIVEKIT_CONNECT_TIMEOUT_MS,
): Promise<boolean> => {
  return await new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (result: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.once("close", () => finish(false));
    socket.connect(port, host);
  });
};

const ensureLiveKitBackend = async (config: VoipConfig): Promise<void> => {
  const probeHost = normalizeProbeHost(config.liveKitHost);
  if (await isTcpServiceReachable(probeHost, config.liveKitPort)) {
    console.log(
      `[voip-dev-server] LiveKit backend already reachable at ws://${config.liveKitHost}:${config.liveKitPort}/rtc`,
    );
    return;
  }

  throw new Error(
    [
      `LiveKit backend is not reachable at ws://${config.liveKitHost}:${config.liveKitPort}/rtc.`,
      `Start it first, for example: ${getSuggestedLiveKitCommand(config.liveKitPort)}`,
    ].join(" "),
  );
};

const createUiApp = (config: VoipConfig): InstanceType<typeof Koa> => {
  const app = new Koa();
  const router = new Router();

  router.get("/health", (ctx: KoaContext) => {
    withNoStore(ctx);
    ctx.body = {
      ok: true,
      roomName: config.roomName,
      serverTime: new Date().toISOString(),
      uiUrl: `https://${config.publicHost}:${config.uiPort}/voip-test/`,
      wsUrl: `wss://${config.publicHost}:${config.signalPort}/rtc`,
    };
  });

  router.get("/token", async (ctx: KoaContext) => {
    withNoStore(ctx);
    const identity = sanitizeIdentity(ctx.query.identity);
    ctx.body = await createTokenPayload(config, identity);
  });

  router.get("/voip-test/", (ctx: KoaContext) => {
    serveHtmlFile(ctx, path.join(config.uiDir, "voip-test.html"));
  });

  router.get("/voip-test", (ctx: KoaContext) => {
    serveHtmlFile(ctx, path.join(config.uiDir, "voip-test.html"));
  });

  router.get("/voip-raw.html", (ctx: KoaContext) => {
    serveHtmlFile(ctx, path.join(config.uiDir, "voip-raw.html"));
  });

  router.get("/favicon.ico", (ctx: KoaContext) => {
    ctx.status = 204;
  });

  app.use(async (ctx: KoaContext, next: () => Promise<void>) => {
    try {
      await next();
    } catch (error) {
      ctx.status = 500;
      withNoStore(ctx);
      ctx.body = {
        ok: false,
        error: serializeError(error),
      };
      console.error("[voip-dev-server] request failed", ctx.path, serializeError(error));
    }
  });
  app.use(router.routes()).use(router.allowedMethods());
  app.use(serve(config.uiDir));

  return app;
};

const createSignalProxy = (config: VoipConfig): https.Server => {
  const tlsOptions = {
    cert: fs.readFileSync(config.certPath),
    key: fs.readFileSync(config.keyPath),
  };

  const server = https.createServer(tlsOptions, (_req, res) => {
    res.statusCode = 404;
    res.end("LiveKit WSS proxy");
  });

  const wss = new WebSocketServer({ noServer: true });

  wss.on("connection", (clientSocket: WebSocket, request: IncomingMessage) => {
    const backendUrl = `ws://${config.liveKitHost}:${config.liveKitPort}${request.url || "/rtc"}`;
    const backendSocket = new WebSocket(backendUrl);

    const closePair = (code?: number, reason?: string) => {
      closeSocketSafely(clientSocket, "client", code, reason);
      closeSocketSafely(backendSocket, "backend", code, reason);
    };

    backendSocket.on("open", () => {
      console.log(`[voip-dev-server] proxied signaling connection ${backendUrl}`);
    });

    clientSocket.on("message", (data: RawData, isBinary: boolean) => {
      if (backendSocket.readyState === WebSocket.OPEN) {
        backendSocket.send(data, { binary: isBinary });
      }
    });

    backendSocket.on("message", (data: RawData, isBinary: boolean) => {
      if (clientSocket.readyState === WebSocket.OPEN) {
        clientSocket.send(data, { binary: isBinary });
      }
    });

    clientSocket.on("close", (code: number, reason: Buffer) => {
      closeSocketSafely(backendSocket, "backend", code, reason);
    });

    backendSocket.on("close", (code: number, reason: Buffer) => {
      closeSocketSafely(clientSocket, "client", code, reason);
    });

    clientSocket.on("error", (error: Error) => {
      console.error("[voip-dev-server] client signaling socket error", serializeError(error));
      closePair(1011, "client socket error");
    });

    backendSocket.on("error", (error: Error) => {
      console.error("[voip-dev-server] backend signaling socket error", serializeError(error));
      closePair(1011, "backend socket error");
    });
  });

  server.on("upgrade", (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!request.url?.startsWith("/rtc")) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (clientSocket: WebSocket) => {
      wss.emit("connection", clientSocket, request);
    });
  });

  return server;
};

const start = async (): Promise<void> => {
  loadDotEnv();
  const config = loadConfig();
  await ensureLiveKitBackend(config);

  const tlsOptions = {
    cert: fs.readFileSync(config.certPath),
    key: fs.readFileSync(config.keyPath),
  };

  const app = createUiApp(config);
  const uiServer = https.createServer(tlsOptions, app.callback());
  const signalServer = createSignalProxy(config);

  await new Promise<void>((resolve) => {
    uiServer.listen(config.uiPort, config.bindHost, () => resolve());
  });
  await new Promise<void>((resolve) => {
    signalServer.listen(config.signalPort, config.bindHost, () => resolve());
  });

  const uiAddress = uiServer.address() as AddressInfo;
  const signalAddress = signalServer.address() as AddressInfo;

  console.log("[voip-dev-server] ready");
  console.log(`[voip-dev-server] UI/token https://${config.publicHost}:${uiAddress.port}/voip-test/`);
  console.log(`[voip-dev-server] raw fallback https://${config.publicHost}:${uiAddress.port}/voip-raw.html`);
  console.log(`[voip-dev-server] signaling wss://${config.publicHost}:${signalAddress.port}/rtc`);
  console.log(`[voip-dev-server] LiveKit backend ws://${config.liveKitHost}:${config.liveKitPort}/rtc`);
  console.log(`[voip-dev-server] room ${config.roomName}`);
}

start().catch((error) => {
  console.error("[voip-dev-server] fatal startup error", serializeError(error));
  process.exitCode = 1;
});
