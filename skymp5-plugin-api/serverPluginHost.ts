export type ServerPluginContent = Record<string, any>;

export type ServerPluginApi = {
  error: (...args: unknown[]) => void;
  getActorAngleZ: (actorId: number) => number | null;
  getActorCellOrWorld: (actorId: number) => number | null;
  getActorPos: (actorId: number) => number[] | null;
  getConfig: <T = unknown>() => T | undefined;
  getUserActor: (userId: number) => number | null;
  isConnected: (userId: number) => boolean;
  log: (...args: unknown[]) => void;
  onSpawnAllowed: (
    handler: (userId: number, profileId: number) => void,
  ) => (() => void);
  pluginId: string;
  sendCustomPacket: (userId: number, payload: Record<string, unknown>) => void;
  version: number;
};

export type ServerPlugin = {
  connect?: (userId: number) => void | Promise<void>;
  customPacket?: (
    userId: number,
    type: string,
    content: ServerPluginContent,
  ) => void | Promise<void>;
  disconnect?: (userId: number) => void | Promise<void>;
  init?: () => void | Promise<void>;
  systemName?: string;
  update?: () => void | Promise<void>;
};

export type ServerPluginModule = {
  createServerPlugin: (api: ServerPluginApi, config: unknown) => ServerPlugin;
  pluginId?: string;
};

export const SKYMP_SERVER_PLUGIN_API_VERSION = 2 as const;
