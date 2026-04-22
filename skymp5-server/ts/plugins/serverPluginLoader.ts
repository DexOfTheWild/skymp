import * as path from "path";
import { System, SystemContext } from "../systems/system";
import {
  ServerPlugin,
  ServerPluginApi,
  ServerPluginModule,
  SKYMP_SERVER_PLUGIN_API_VERSION,
} from "../../../skymp5-plugin-api/serverPluginHost";

type SettingsObject = Record<string, unknown> | null;

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

const createServerPluginApi = (
  pluginId: string,
  settings: SettingsObject,
  ctx: SystemContext,
  log: (...args: any[]) => void,
): ServerPluginApi => {
  return {
    error: (...args: unknown[]) => log(`[plugin:${pluginId}]`, ...args),
    getActorAngleZ: (actorId: number): number | null => {
      try {
        const angleZ = ctx.svr.getActorAngleZ(actorId);
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
    onSpawnAllowed: (handler) => {
      const wrappedHandler = (userId: number, profileId: number) => {
        handler(userId, profileId);
      };

      ctx.gm.on("spawnAllowed", wrappedHandler);
      return () => {
        ctx.gm.off("spawnAllowed", wrappedHandler);
      };
    },
    pluginId,
    sendCustomPacket: (userId: number, payload: Record<string, unknown>) => {
      ctx.svr.sendCustomPacket(userId, JSON.stringify(payload));
    },
    version: SKYMP_SERVER_PLUGIN_API_VERSION,
  };
};

const wrapPlugin = (
  pluginId: string,
  plugin: ServerPlugin,
  log: (...args: any[]) => void,
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
        void callPluginHook("customPacket", () => plugin.customPacket?.(userId, type, content));
      }
      : undefined,
    disconnect: plugin.disconnect
      ? (userId: number) => {
        void callPluginHook("disconnect", () => plugin.disconnect?.(userId));
      }
      : undefined,
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

  for (const configuredModulePath of getServerPluginModulePaths(settings)) {
    const resolvedModulePath = toAbsoluteModulePath(configuredModulePath);

    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pluginModule = require(resolvedModulePath) as Partial<ServerPluginModule>;
      if (typeof pluginModule.createServerPlugin !== "function") {
        throw new Error("Expected module to export createServerPlugin(api, config)");
      }

      const pluginId = getPluginId(configuredModulePath, pluginModule);
      const api = createServerPluginApi(pluginId, settings, ctx, log);
      const plugin = pluginModule.createServerPlugin(api, api.getConfig());

      log(`[plugin:${pluginId}] loaded from "${resolvedModulePath}"`);
      systems.push(wrapPlugin(pluginId, plugin, log));
    } catch (error) {
      console.error(`[plugin-loader] failed to load "${configuredModulePath}"`, error);
      log(`[plugin-loader] failed to load "${configuredModulePath}"`, error);
    }
  }

  return systems;
};
