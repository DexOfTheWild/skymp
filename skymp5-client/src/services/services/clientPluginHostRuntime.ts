import {
  ClientPluginApi,
  ClientPluginBrowserApi,
  ClientPluginBrowserMessageHandler,
  ClientPluginCapabilities,
  ClientPluginConsoleCommandHandler,
  ClientPluginCustomPacketHandler,
  ClientPluginInit,
  ClientPluginInputHandler,
  ClientPluginInputState,
  ClientPluginLocalSpawnEvent,
  ClientPluginLocalSpawnHandler,
  ClientPluginTickHandler,
  ClientPluginUnsubscribe,
  SKYMP_CLIENT_PLUGIN_HOST_VERSION,
} from "../../../../skymp5-plugin-api/clientPluginHost";

type ClientPluginRuntimeEnvironment = {
  browser: ClientPluginBrowserApi;
  capabilities: ClientPluginCapabilities;
  getLocalProfileId: () => number | null;
  getSettingsScope: <T = Record<string, unknown>>(scope: string) => T | undefined;
  log: (pluginId: string, ...args: unknown[]) => void;
  logError: (pluginId: string, ...args: unknown[]) => void;
  registerConsoleCommand: (
    pluginId: string,
    commandName: string,
    handler: ClientPluginConsoleCommandHandler,
  ) => ClientPluginUnsubscribe;
  resolveScanCode: (keyName: string) => number | null;
  sendCustomPacket: (
    type: string,
    payload: Record<string, unknown>,
    reliability: "reliable" | "unreliable",
  ) => void;
};

export class ClientPluginHostRuntime {
  public constructor(private environment: ClientPluginRuntimeEnvironment) {}

  public registerPlugin(pluginId: string, init: ClientPluginInit): void {
    const normalizedPluginId = pluginId.trim();
    if (!normalizedPluginId) {
      this.environment.logError("ClientPluginHost", "Rejected client plugin registration with empty pluginId");
      return;
    }

    if (this.pluginApis.has(normalizedPluginId)) {
      this.environment.logError(
        "ClientPluginHost",
        `Rejected duplicate client plugin registration for '${normalizedPluginId}'`,
      );
      return;
    }

    const api = this.createPluginApi(normalizedPluginId);
    this.pluginApis.set(normalizedPluginId, api);
    this.environment.log("ClientPluginHost", "Registered client plugin", {
      pluginId: normalizedPluginId,
    });

    Promise.resolve(init(api)).catch((error) => {
      this.environment.logError(
        "ClientPluginHost",
        `Client plugin '${normalizedPluginId}' initialization failed`,
        error,
      );
    });
  }

  public dispatchBrowserMessage(key: string, args: unknown[]): void {
    this.invokeMapHandlers(
      this.browserMessageHandlers,
      key,
      (handler) => {
        handler(args);
      },
      `browser handler failed for '${key}'`,
    );
  }

  public dispatchCustomPacket(type: string, payload: Record<string, unknown>): void {
    this.invokeMapHandlers(
      this.customPacketHandlers,
      type,
      (handler) => {
        handler(payload);
      },
      `custom packet handler failed for '${type}'`,
    );
  }

  public dispatchInputState(inputState: ClientPluginInputState): void {
    this.invokeSetHandlers(
      this.inputHandlers,
      (handler) => {
        handler(inputState);
      },
      "input handler failed",
    );
  }

  public dispatchLocalSpawn(payload: ClientPluginLocalSpawnEvent): void {
    this.hasLocalSpawned = true;
    this.lastLocalSpawnEvent = payload;
    this.invokeSetHandlers(
      this.localSpawnHandlers,
      (handler) => {
        handler(payload);
      },
      "local spawn handler failed",
    );
  }

  public dispatchTick(): void {
    this.invokeSetHandlers(
      this.tickHandlers,
      (handler) => {
        handler();
      },
      "tick handler failed",
    );
  }

  private createPluginApi(pluginId: string): ClientPluginApi {
    return {
      browser: this.environment.browser,
      capabilities: this.environment.capabilities,
      getLocalProfileId: () => this.environment.getLocalProfileId(),
      getSettingsScope: <T = Record<string, unknown>>(scope: string) => {
        return this.environment.getSettingsScope<T>(scope);
      },
      log: (...args: unknown[]) => this.environment.log(`ClientPlugin(${pluginId})`, ...args),
      logError: (...args: unknown[]) => this.environment.logError(`ClientPlugin(${pluginId})`, ...args),
      onBrowserMessage: (
        key: string,
        handler: ClientPluginBrowserMessageHandler,
      ): ClientPluginUnsubscribe => {
        return this.subscribeMapValue(this.browserMessageHandlers, key, handler);
      },
      onCustomPacket: (
        type: string,
        handler: ClientPluginCustomPacketHandler,
      ): ClientPluginUnsubscribe => {
        return this.subscribeMapValue(this.customPacketHandlers, type, handler);
      },
      onInputState: (handler: ClientPluginInputHandler): ClientPluginUnsubscribe => {
        return this.subscribeSetValue(this.inputHandlers, handler);
      },
      onLocalSpawn: (
        handler: ClientPluginLocalSpawnHandler,
      ): ClientPluginUnsubscribe => {
        const unsubscribe = this.subscribeSetValue(this.localSpawnHandlers, handler);
        if (this.hasLocalSpawned && this.lastLocalSpawnEvent) {
          this.invokePluginHandler(
            pluginId,
            "local spawn handler failed",
            () => {
              handler(this.lastLocalSpawnEvent as ClientPluginLocalSpawnEvent);
            },
          );
        }

        return unsubscribe;
      },
      onTick: (handler: ClientPluginTickHandler): ClientPluginUnsubscribe => {
        return this.subscribeSetValue(this.tickHandlers, handler);
      },
      registerConsoleCommand: (
        commandName: string,
        handler: ClientPluginConsoleCommandHandler,
      ): ClientPluginUnsubscribe => {
        return this.environment.registerConsoleCommand(pluginId, commandName, handler);
      },
      resolveScanCode: (keyName: string): number | null => {
        return this.environment.resolveScanCode(keyName);
      },
      sendCustomPacket: (
        type: string,
        payload: Record<string, unknown>,
        reliability: "reliable" | "unreliable" = "reliable",
      ) => {
        this.environment.sendCustomPacket(type, payload, reliability);
      },
      version: SKYMP_CLIENT_PLUGIN_HOST_VERSION,
    };
  }

  private invokeMapHandlers<THandler>(
    target: Map<string, Set<THandler>>,
    key: string,
    invoke: (handler: THandler) => void,
    messageSuffix: string,
  ): void {
    const handlers = target.get(key);
    if (!handlers || handlers.size === 0) {
      return;
    }

    this.invokeSetHandlers(handlers, invoke, messageSuffix);
  }

  private invokePluginHandler(
    pluginId: string,
    messageSuffix: string,
    invoke: () => void,
  ): void {
    try {
      invoke();
    } catch (error) {
      this.environment.logError(`ClientPlugin(${pluginId})`, messageSuffix, error);
    }
  }

  private invokeSetHandlers<THandler>(
    handlers: Set<THandler>,
    invoke: (handler: THandler) => void,
    messageSuffix: string,
  ): void {
    handlers.forEach((handler) => {
      try {
        invoke(handler);
      } catch (error) {
        this.environment.logError("ClientPluginHost", messageSuffix, error);
      }
    });
  }

  private subscribeMapValue<THandler>(
    target: Map<string, Set<THandler>>,
    key: string,
    handler: THandler,
  ): ClientPluginUnsubscribe {
    let handlers = target.get(key);
    if (!handlers) {
      handlers = new Set<THandler>();
      target.set(key, handlers);
    }

    handlers.add(handler);
    return () => {
      const currentHandlers = target.get(key);
      if (!currentHandlers) {
        return;
      }

      currentHandlers.delete(handler);
      if (currentHandlers.size === 0) {
        target.delete(key);
      }
    };
  }

  private subscribeSetValue<THandler>(
    target: Set<THandler>,
    handler: THandler,
  ): ClientPluginUnsubscribe {
    target.add(handler);
    return () => {
      target.delete(handler);
    };
  }

  private readonly browserMessageHandlers =
    new Map<string, Set<ClientPluginBrowserMessageHandler>>();
  private readonly customPacketHandlers =
    new Map<string, Set<ClientPluginCustomPacketHandler>>();
  private hasLocalSpawned = false;
  private readonly inputHandlers = new Set<ClientPluginInputHandler>();
  private lastLocalSpawnEvent: ClientPluginLocalSpawnEvent | null = null;
  private readonly localSpawnHandlers = new Set<ClientPluginLocalSpawnHandler>();
  private readonly pluginApis = new Map<string, ClientPluginApi>();
  private readonly tickHandlers = new Set<ClientPluginTickHandler>();
}
