import assert from "assert";
import { EventEmitter } from "events";
import * as path from "path";
import {
  activateClientPluginHostGlobal,
  ClientPluginApi,
  ClientPluginCapabilities,
  ClientPluginConsoleCommandContext,
  ClientPluginInit,
} from "../../../skymp5-plugin-api/clientPluginHost";
import { loadServerPluginSystems } from "../plugins/serverPluginLoader";
import { SystemContext } from "../systems/system";

type RegisteredClientPlugin = {
  init: ClientPluginInit;
  pluginId: string;
};

type FakeClientHarness = {
  browserEvents: Array<{
    dataJson: string;
    eventName: string;
  }>;
  consoleHandler: ((args: string[], context: ClientPluginConsoleCommandContext) => boolean | void) | null;
  consoleOutput: unknown[][];
  customPacketHandlers: Map<string, (payload: Record<string, unknown>) => void>;
  localSpawnHandler: ((event: { profileId: number | null }) => void) | null;
  logs: unknown[][];
};

const createFakeClientApi = (harness: FakeClientHarness): ClientPluginApi => {
  const capabilities: ClientPluginCapabilities = {
    browser: {
      mediaPermissionPolicies: ["default", "secureOriginAudioCapture"],
    },
    consoleCommands: true,
  };

  return {
    browser: {
      emitEvent: (eventName: string, dataJson: string) => {
        harness.browserEvents.push({
          dataJson,
          eventName,
        });
      },
      getBackendName: () => "nirnlab",
      isFocused: () => false,
      isVisible: () => false,
      loadUrl: () => undefined,
      setFocused: () => undefined,
      setMediaPermissionPolicy: () => undefined,
      setVisible: () => undefined,
    },
    capabilities,
    getLocalProfileId: () => 999,
    getSettingsScope: () => undefined,
    log: (...args: unknown[]) => {
      harness.logs.push(args);
    },
    logError: (...args: unknown[]) => {
      harness.logs.push(args);
    },
    onBrowserMessage: () => () => undefined,
    onCustomPacket: (type, handler) => {
      harness.customPacketHandlers.set(type, handler);
      return () => {
        harness.customPacketHandlers.delete(type);
      };
    },
    onInputState: () => () => undefined,
    onLocalSpawn: (handler) => {
      harness.localSpawnHandler = handler;
      return () => {
        if (harness.localSpawnHandler === handler) {
          harness.localSpawnHandler = null;
        }
      };
    },
    onTick: () => () => undefined,
    registerConsoleCommand: (_commandName, handler) => {
      harness.consoleHandler = handler;
      return () => {
        if (harness.consoleHandler === handler) {
          harness.consoleHandler = null;
        }
      };
    },
    resolveScanCode: () => 0,
    sendCustomPacket: () => undefined,
    version: 4,
  };
};

const createServerContext = (
  sentPackets: Record<string, unknown>[],
): SystemContext => {
  return {
    gm: new EventEmitter(),
    svr: {
      getActorCellOrWorld: () => 0,
      getActorPos: () => [0, 0, 0],
      getUserActor: () => 1,
      isConnected: () => true,
      sendCustomPacket: (_userId: number, jsonContent: string) => {
        sentPackets.push(JSON.parse(jsonContent));
      },
    } as unknown as SystemContext["svr"],
  };
};

const repoRoot = path.resolve(__dirname, "../../../../../../../");
const exampleClientEntryPath = path.resolve(
  repoRoot,
  "skymp5-example-plugin/dist/skymp5-example-plugin/client/index.js",
);
const exampleServerEntryPath = path.resolve(
  repoRoot,
  "skymp5-example-plugin/dist/skymp5-example-plugin/server/index.js",
);

void (async () => {
  delete (globalThis as Record<string, unknown>).__skympClientPluginHost;
  delete require.cache[exampleClientEntryPath];
  require(exampleClientEntryPath);

  let registeredClientPlugin: RegisteredClientPlugin | null = null;
  activateClientPluginHostGlobal((pluginId, init) => {
    registeredClientPlugin = {
      init,
      pluginId,
    };
  });

  assert.equal(registeredClientPlugin?.pluginId, "example");

  const clientHarness: FakeClientHarness = {
    browserEvents: [],
    consoleHandler: null,
    consoleOutput: [],
    customPacketHandlers: new Map<string, (payload: Record<string, unknown>) => void>(),
    localSpawnHandler: null,
    logs: [],
  };
  await registeredClientPlugin?.init(createFakeClientApi(clientHarness));

  assert.ok(clientHarness.localSpawnHandler);
  clientHarness.localSpawnHandler?.({
    profileId: 999,
  });
  assert.ok(clientHarness.consoleHandler);
  assert.equal(
    clientHarness.consoleHandler?.([], {
      commandName: "exampleplugin",
      pluginId: "example",
      printConsole: (...args: unknown[]) => {
        clientHarness.consoleOutput.push(args);
      },
      rawArgs: ["mp", "exampleplugin"],
      tokens: ["mp", "exampleplugin"],
    }),
    true,
  );
  assert.ok(clientHarness.browserEvents.some((event) => event.eventName === "skymp5-example:state"));

  const sentPackets: Record<string, unknown>[] = [];
  const ctx = createServerContext(sentPackets);
  const systems = await loadServerPluginSystems({
    ctx,
    log: () => undefined,
    settings: {
      pluginModules: {
        server: [exampleServerEntryPath],
      },
      plugins: {
        example: {
          greeting: "hello smoke",
        },
      },
    },
  });

  assert.equal(systems.length, 1);
  await systems[0].initAsync?.(ctx);
  ctx.gm.emit("spawnAllowed", 1, 321);

  const welcomePacket = sentPackets.shift() || {};
  assert.equal(welcomePacket.customPacketType, "example:welcome");
  clientHarness.customPacketHandlers.get("example:welcome")?.({
    ...welcomePacket,
    customPacketType: undefined,
  });

  systems[0].customPacket?.(1, "example:ping", { source: "smoke" }, ctx);
  const pongPacket = sentPackets.shift() || {};
  assert.equal(pongPacket.customPacketType, "example:pong");
  clientHarness.customPacketHandlers.get("example:pong")?.({
    ...pongPacket,
    customPacketType: undefined,
  });

  await systems[0].disposeAsync?.(ctx);

  console.log("examplePluginSmoke.test.ts passed");
})();
