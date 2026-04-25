import * as path from "path";
import { System, SystemContext } from "../systems/system";
import {
  ServerPlugin,
  ServerPluginApi,
  ServerPluginCapabilities,
  ServerPluginCustomPacketHandler,
  ServerPluginModule,
  SKYMP_SERVER_PLUGIN_API_VERSION,
} from "../../../skymp5-plugin-api/serverPluginHost";

type SettingsObject = Record<string, unknown> | null;
type ServerPluginApiInternal = ServerPluginApi & {
  __dispose: () => Promise<void>;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const getServerPluginModulePaths = (settings: SettingsObject): string[] => {
  const pluginModules = isRecord(settings?.pluginModules)
    ? settings.pluginModules
    : null;
  const serverModules = pluginModules?.server;
  if (!Array.isArray(serverModules)) {
    return [];
  }

  return serverModules.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0,
  );
};

const getPluginConfig = (
  settings: SettingsObject,
  pluginId: string,
): unknown => {
  const plugins = isRecord(settings?.plugins) ? settings.plugins : null;
  return plugins?.[pluginId];
};

const toAbsoluteModulePath = (modulePath: string): string => {
  if (path.isAbsolute(modulePath)) {
    return modulePath;
  }
  return path.resolve(process.cwd(), modulePath);
};

const getPluginId = (
  modulePath: string,
  pluginModule: Partial<ServerPluginModule>,
): string => {
  if (typeof pluginModule.pluginId === "string" && pluginModule.pluginId.trim()) {
    return pluginModule.pluginId.trim();
  }

  return path.basename(modulePath, path.extname(modulePath));
};

const getServerPluginCapabilities = (ctx: SystemContext): ServerPluginCapabilities => {
  return {
    actorAngleZ: typeof (ctx.svr as Partial<{
      getActorAngleZ: (actorId: number) => number;
    }>).getActorAngleZ === "function",
    customPacketSubscriptions: true,
    dispose: true,
  };
};

const createServerPluginApi = (
  pluginId: string,
  settings: SettingsObject,
  ctx: SystemContext,
  log: (...args: any[]) => void,
  packetSubscriptionsByPluginId: Map<string, Map<string, Set<ServerPluginCustomPacketHandler>>>,
): ServerPluginApiInternal => {
  const cleanupCallbacks = new Set<() => void>();
  const capabilities = getServerPluginCapabilities(ctx);

  const registerCleanup = (cleanup: () => void): (() => void) => {
    cleanupCallbacks.add(cleanup);
    return () => {
      if (!cleanupCallbacks.delete(cleanup)) {
        return;
      }

      cleanup();
    };
  };

  const dispose = async (): Promise<void> => {
    const pendingCleanups = Array.from(cleanupCallbacks);
    cleanupCallbacks.clear();

    for (const cleanup of pendingCleanups) {
      try {
        cleanup();
      } catch (error) {
        console.error(`[plugin:${pluginId}] cleanup failed`, error);
        log(`[plugin:${pluginId}] cleanup failed`, error);
      }
    }
  };

  return {
    capabilities,
    error: (...args: unknown[]) => log(`[plugin:${pluginId}]`, ...args),
    getActorAngleZ: (actorId: number): number | null => {
      const actorAngleGetter = (ctx.svr as Partial<{
        getActorAngleZ: (id: number) => number;
      }>).getActorAngleZ;
      if (typeof actorAngleGetter !== "function") {
        return null;
      }

      try {
        const angleZ = actorAngleGetter.call(ctx.svr, actorId);
        return typeof angleZ === "number" && Number.isFinite(angleZ) ? angleZ : null;
      } catch (_error) {
        return null;
      }
    },
    getActorCellOrWorld: (actorId: number): number | null => {
      try {
        const worldOrCell = ctx.svr.getActorCellOrWorld(actorId);
        return typeof worldOrCell === "number" ? worldOrCell : null;
      } catch (_error) {
        return null;
      }
    },
    getActorPos: (actorId: number): number[] | null => {
      try {
        const position = ctx.svr.getActorPos(actorId);
        return Array.isArray(position) && position.length >= 3 ? position : null;
      } catch (_error) {
        return null;
      }
    },
    getConfig: <T = unknown>(): T | undefined => {
      return getPluginConfig(settings, pluginId) as T | undefined;
    },
    getUserActor: (userId: number): number | null => {
      try {
        const actorId = ctx.svr.getUserActor(userId);
        return typeof actorId === "number" && actorId > 0 ? actorId : null;
      } catch (_error) {
        return null;
      }
    },
    isConnected: (userId: number): boolean => {
      try {
        return !!ctx.svr.isConnected(userId);
      } catch (_error) {
        return false;
      }
    },
    log: (...args: unknown[]) => log(`[plugin:${pluginId}]`, ...args),
    onCustomPacket: (type, handler) => {
      const normalizedType = `${type}`.trim();
      if (!normalizedType) {
        return () => undefined;
      }

      let pluginSubscriptions = packetSubscriptionsByPluginId.get(pluginId);
      if (!pluginSubscriptions) {
        pluginSubscriptions = new Map<string, Set<ServerPluginCustomPacketHandler>>();
        packetSubscriptionsByPluginId.set(pluginId, pluginSubscriptions);
      }

      let handlers = pluginSubscriptions.get(normalizedType);
      if (!handlers) {
        handlers = new Set<ServerPluginCustomPacketHandler>();
        pluginSubscriptions.set(normalizedType, handlers);
      }

      handlers.add(handler);
      return registerCleanup(() => {
        const currentPluginSubscriptions = packetSubscriptionsByPluginId.get(pluginId);
        const currentHandlers = currentPluginSubscriptions?.get(normalizedType);
        if (!currentHandlers) {
          return;
        }

        currentHandlers.delete(handler);
        if (currentHandlers.size === 0) {
          currentPluginSubscriptions?.delete(normalizedType);
        }
        if (currentPluginSubscriptions && currentPluginSubscriptions.size === 0) {
          packetSubscriptionsByPluginId.delete(pluginId);
        }
      });
    },
    onSpawnAllowed: (handler) => {
      const wrappedHandler = (userId: number, profileId: number) => {
        handler(userId, profileId);
      };

      ctx.gm.on("spawnAllowed", wrappedHandler);
      return registerCleanup(() => {
        ctx.gm.off("spawnAllowed", wrappedHandler);
      });
    },
    pluginId,
    sendCustomPacket: (userId: number, payload: Record<string, unknown>) => {
      ctx.svr.sendCustomPacket(userId, JSON.stringify(payload));
    },
    version: SKYMP_SERVER_PLUGIN_API_VERSION,
    __dispose: dispose,
  };
};

const wrapPlugin = (
  pluginId: string,
  plugin: ServerPlugin,
  log: (...args: any[]) => void,
  api: ServerPluginApiInternal,
  packetSubscriptionsByPluginId: Map<string, Map<string, Set<ServerPluginCustomPacketHandler>>>,
): System => {
  const callPluginHook = async (
    hookName: string,
    hook: (() => void | Promise<void>) | undefined,
  ): Promise<void> => {
    if (!hook) {
      return;
    }

    try {
      await hook();
    } catch (error) {
      console.error(`[plugin:${pluginId}] ${hookName} failed`, error);
      log(`[plugin:${pluginId}] ${hookName} failed`, error);
    }
  };

  return {
    connect: plugin.connect
      ? (userId: number) => {
        void callPluginHook("connect", () => plugin.connect?.(userId));
      }
      : undefined,
    customPacket: plugin.customPacket
      ? (userId, type, content) => {
        const pluginSubscriptions = packetSubscriptionsByPluginId.get(pluginId);
        const packetHandlers = pluginSubscriptions?.get(type);

        packetHandlers?.forEach((handler) => {
          void callPluginHook(`onCustomPacket(${type})`, () => handler(userId, content));
        });
        void callPluginHook("customPacket", () => plugin.customPacket?.(userId, type, content));
      }
      : (userId, type, content) => {
        const pluginSubscriptions = packetSubscriptionsByPluginId.get(pluginId);
        const packetHandlers = pluginSubscriptions?.get(type);
        packetHandlers?.forEach((handler) => {
          void callPluginHook(`onCustomPacket(${type})`, () => handler(userId, content));
        });
      },
    disconnect: plugin.disconnect
      ? (userId: number) => {
        void callPluginHook("disconnect", () => plugin.disconnect?.(userId));
      }
      : undefined,
    disposeAsync: async () => {
      await callPluginHook("dispose", () => plugin.dispose?.());
      await api.__dispose();
      packetSubscriptionsByPluginId.delete(pluginId);
    },
    initAsync: plugin.init
      ? async () => {
        await callPluginHook("init", () => plugin.init?.());
      }
      : undefined,
    systemName: plugin.systemName || `Plugin(${pluginId})`,
    updateAsync: plugin.update
      ? async () => {
        await callPluginHook("update", () => plugin.update?.());
      }
      : undefined,
  };
};

export const loadServerPluginSystems = async ({
  ctx,
  log,
  settings,
}: {
  ctx: SystemContext;
  log: (...args: any[]) => void;
  settings: SettingsObject;
}): Promise<System[]> => {
  const systems: System[] = [];
  const loadedPluginIds = new Set<string>();
  const packetSubscriptionsByPluginId =
    new Map<string, Map<string, Set<ServerPluginCustomPacketHandler>>>();

  for (const configuredModulePath of getServerPluginModulePaths(settings)) {
    const resolvedModulePath = toAbsoluteModulePath(configuredModulePath);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pluginModule = require(resolvedModulePath) as Partial<ServerPluginModule>;
      if (typeof pluginModule.createServerPlugin !== "function") {
        throw new Error("Expected module to export createServerPlugin(api, config)");
      }

      const pluginId = getPluginId(configuredModulePath, pluginModule);
      if (loadedPluginIds.has(pluginId)) {
        throw new Error(`Duplicate server pluginId '${pluginId}' in module '${configuredModulePath}'`);
      }

      const api = createServerPluginApi(
        pluginId,
        settings,
        ctx,
        log,
        packetSubscriptionsByPluginId,
      );
      const plugin = pluginModule.createServerPlugin(api, api.getConfig());

      log(`[plugin:${pluginId}] loaded from "${resolvedModulePath}"`);
      systems.push(wrapPlugin(pluginId, plugin, log, api, packetSubscriptionsByPluginId));
      loadedPluginIds.add(pluginId);
    } catch (error) {
      console.error(`[plugin-loader] failed to load "${configuredModulePath}"`, error);
      log(`[plugin-loader] failed to load "${configuredModulePath}"`, error);
    }
  }

  return systems;
};
