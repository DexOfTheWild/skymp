export const SKYMP_CLIENT_PLUGIN_HOST_NAME = "__skympClientPluginHost" as const;
export const SKYMP_CLIENT_PLUGIN_HOST_VERSION = 2 as const;

export type ClientPluginBrowserApi = {
  emitEvent: (eventName: string, dataJson: string) => void;
  getBackendName: () => string;
  isFocused: () => boolean;
  isVisible: () => boolean;
  loadUrl: (url: string) => void;
  setFocused: (focused: boolean) => void;
  setVisible: (visible: boolean) => void;
};

export type ClientPluginInputState = {
  isDown: (binding: number[]) => boolean;
};

export type ClientPluginLocalSpawnEvent = {
  profileId: number | null;
};

export type ClientPluginBrowserMessageHandler = (args: unknown[]) => void;
export type ClientPluginCustomPacketHandler = (payload: Record<string, unknown>) => void;
export type ClientPluginInputHandler = (inputState: ClientPluginInputState) => void;
export type ClientPluginLocalSpawnHandler = (event: ClientPluginLocalSpawnEvent) => void;
export type ClientPluginTickHandler = () => void;
export type ClientPluginUnsubscribe = () => void;

export type ClientPluginApi = {
  browser: ClientPluginBrowserApi;
  getLocalProfileId: () => number | null;
  getSettingsScope: <T = Record<string, unknown>>(scope: string) => T | undefined;
  log: (...args: unknown[]) => void;
  logError: (...args: unknown[]) => void;
  onBrowserMessage: (
    key: string,
    handler: ClientPluginBrowserMessageHandler,
  ) => ClientPluginUnsubscribe;
  onCustomPacket: (
    type: string,
    handler: ClientPluginCustomPacketHandler,
  ) => ClientPluginUnsubscribe;
  onInputState: (handler: ClientPluginInputHandler) => ClientPluginUnsubscribe;
  onLocalSpawn: (
    handler: ClientPluginLocalSpawnHandler,
  ) => ClientPluginUnsubscribe;
  onTick: (handler: ClientPluginTickHandler) => ClientPluginUnsubscribe;
  resolveScanCode: (keyName: string) => number | null;
  sendCustomPacket: (
    type: string,
    payload: Record<string, unknown>,
    reliability?: "reliable" | "unreliable",
  ) => void;
  version: number;
};

export type ClientPluginInit = (api: ClientPluginApi) => void | Promise<void>;

export type ClientPluginRuntimeRegistrar = (
  pluginId: string,
  init: ClientPluginInit,
) => void;

export type QueuedClientPluginRegistration = {
  init: ClientPluginInit;
  pluginId: string;
};

export type ClientPluginHostGlobal = {
  registerClientPlugin: (pluginId: string, init: ClientPluginInit) => void;
  version: number | null;
};

type ClientPluginHostGlobalInternal = ClientPluginHostGlobal & {
  __pendingRegistrations: QueuedClientPluginRegistration[];
  __runtimeRegistrar: ClientPluginRuntimeRegistrar | null;
};

declare global {
  // eslint-disable-next-line no-var
  var __skympClientPluginHost: ClientPluginHostGlobalInternal | undefined;
}

export const ensureClientPluginHostGlobal = (): ClientPluginHostGlobal => {
  if (!globalThis.__skympClientPluginHost) {
    globalThis.__skympClientPluginHost = {
      __pendingRegistrations: [],
      __runtimeRegistrar: null,
      registerClientPlugin: (pluginId, init) => {
        const host = ensureClientPluginHostGlobalInternal();
        if (host.__runtimeRegistrar) {
          host.__runtimeRegistrar(pluginId, init);
          return;
        }

        host.__pendingRegistrations.push({ init, pluginId });
      },
      version: null,
    };
  }

  return globalThis.__skympClientPluginHost;
};

export const activateClientPluginHostGlobal = (
  runtimeRegistrar: ClientPluginRuntimeRegistrar,
): ClientPluginHostGlobal => {
  const host = ensureClientPluginHostGlobalInternal();
  host.__runtimeRegistrar = runtimeRegistrar;
  host.version = SKYMP_CLIENT_PLUGIN_HOST_VERSION;

  const pending = host.__pendingRegistrations.splice(0);
  for (const registration of pending) {
    runtimeRegistrar(registration.pluginId, registration.init);
  }

  return host;
};

const ensureClientPluginHostGlobalInternal = (): ClientPluginHostGlobalInternal => {
  return ensureClientPluginHostGlobal() as ClientPluginHostGlobalInternal;
};
