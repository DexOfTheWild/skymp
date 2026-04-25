import assert from "assert";
import { EventEmitter } from "events";
import * as path from "path";
import { loadServerPluginSystems } from "../plugins/serverPluginLoader";
import { SystemContext } from "../systems/system";
import {
  getServerPluginLoaderTestEvents,
  resetServerPluginLoaderTestState,
} from "./fixtures/serverPluginLoaderTestState";

type MockServerOptions = {
  actorAngleZ?: number;
  actorAngleZThrows?: boolean;
};

const repoRoot = path.resolve(__dirname, "../../../../../../../");

const fixturePath = (filename: string): string => {
  return path.resolve(repoRoot, `build/dist/server/dist_back/skymp5-server/ts/tests/fixtures/${filename}`);
};

const createContext = (options: MockServerOptions = {}): SystemContext => {
  const server = {
    getActorAngleZ: (_actorId: number): number => {
      if (options.actorAngleZThrows) {
        throw new Error("actor angle unavailable");
      }

      return options.actorAngleZ ?? 0;
    },
    getActorCellOrWorld: (): number => 0,
    getActorPos: (): number[] => [0, 0, 0],
    getUserActor: (): number => 1,
    isConnected: (): boolean => true,
    sendCustomPacket: (): void => undefined,
  };

  return {
    gm: new EventEmitter(),
    svr: server as unknown as SystemContext["svr"],
  };
};

const testDuplicatePluginIdsAreRejected = async () => {
  resetServerPluginLoaderTestState();
  const ctx = createContext({
    actorAngleZ: 90,
  });
  const logs: unknown[][] = [];

  const systems = await loadServerPluginSystems({
    ctx,
    log: (...args: unknown[]) => {
      logs.push(args);
    },
    settings: {
      pluginModules: {
        server: [
          fixturePath("subscriptionsPlugin.js"),
          fixturePath("duplicatePlugin.js"),
        ],
      },
      plugins: {
        "loader-fixture": {
          greeting: "hello",
        },
      },
    },
  });

  assert.equal(systems.length, 1);
  assert.equal(
    getServerPluginLoaderTestEvents().filter((event) => event.kind === "duplicateCreateServerPlugin").length,
    0,
  );
  assert.ok(logs.some((entry) => String(entry[0]).includes("failed to load")));
};

const testCustomPacketSubscriptionsAndLegacyHandlers = async () => {
  resetServerPluginLoaderTestState();
  const ctx = createContext({
    actorAngleZ: 180,
  });

  const systems = await loadServerPluginSystems({
    ctx,
    log: () => undefined,
    settings: {
      pluginModules: {
        server: [
          fixturePath("subscriptionsPlugin.js"),
        ],
      },
      plugins: {
        "loader-fixture": {
          greeting: "hello",
        },
      },
    },
  });

  assert.equal(systems.length, 1);
  await systems[0].initAsync?.(ctx);
  ctx.gm.emit("spawnAllowed", 7, 11);
  systems[0].customPacket?.(7, "loader:test", { ok: true }, ctx);
  systems[0].customPacket?.(7, "loader:other", { ok: false }, ctx);
  await systems[0].disposeAsync?.(ctx);

  const events = getServerPluginLoaderTestEvents();
  assert.ok(events.some((event) => event.kind === "spawnAllowed"));
  assert.equal(events.filter((event) => event.kind === "typedCustomPacket").length, 1);
  assert.equal(events.filter((event) => event.kind === "legacyCustomPacket").length, 2);
  assert.ok(events.some((event) => event.kind === "dispose"));
};

const testActorAngleCapabilityFallsBackToNull = async () => {
  resetServerPluginLoaderTestState();
  const ctx = createContext({
    actorAngleZThrows: true,
  });

  const systems = await loadServerPluginSystems({
    ctx,
    log: () => undefined,
    settings: {
      pluginModules: {
        server: [
          fixturePath("subscriptionsPlugin.js"),
        ],
      },
    },
  });

  await systems[0].initAsync?.(ctx);

  const initEvent = getServerPluginLoaderTestEvents().find((event) => event.kind === "init");
  assert.deepEqual(initEvent?.payload, {
    actorAngleSnapshot: null,
    greeting: "hi",
  });
};

void (async () => {
  await testDuplicatePluginIdsAreRejected();
  await testCustomPacketSubscriptionsAndLegacyHandlers();
  await testActorAngleCapabilityFallsBackToNull();

  console.log("serverPluginLoader.test.ts passed");
})();
