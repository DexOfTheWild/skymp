import { BrowserMessageEvent } from "skyrimPlatform";
import { AuthGameData, authGameDataStorageKey } from "../../features/authModel";
import { FunctionInfo } from "../../lib/functionInfo";
import { logError, logTrace } from "../../logging";
import { MsgType } from "../../messages";
import { QueryKeyCodeBindings } from "../events/queryKeyCodeBindings";
import { ConnectionMessage } from "../events/connectionMessage";
import { SendMessageEvent } from "../events/sendMessageEvent";
import { CreateActorMessage } from "../messages/createActorMessage";
import { CustomPacketMessage } from "../messages/customPacketMessage";
import { ClientListener, CombinedController, Sp } from "./clientListener";
import {
  activateClientPluginHostGlobal,
  ClientPluginApi,
  ClientPluginBrowserApi,
  ClientPluginBrowserMessageHandler,
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

declare const window: any;

type BrowserApiWithEmitEvent = Sp["browser"] & {
  emitEvent?: (eventName: string, dataJson: string) => void;
  getBackend?: () => {
    name?: string;
  };
};

const dispatchBrowserEventFallback = ({
  dataJson,
  eventName,
}: {
  dataJson: string;
  eventName: string;
}) => {
  const CustomEventCtor = window.CustomEvent;
  window.dispatchEvent(new CustomEventCtor("skymp-browser-event", {
    detail: {
      data: dataJson,
      eventName,
    },
  }));
};

export class ClientPluginHostService extends ClientListener {
  public constructor(private sp: Sp, private controller: CombinedController) {
    super();

    activateClientPluginHostGlobal((pluginId, init) => {
      this.registerPlugin(pluginId, init);
    });

    this.controller.emitter.on("createActorMessage", (event) => {
      this.onCreateActorMessage(event);
    });
    this.controller.emitter.on("customPacketMessage", (event) => {
      this.onCustomPacketMessage(event);
    });
    this.controller.emitter.on("queryKeyCodeBindings", (event) => {
      this.onQueryKeyCodeBindings(event);
    });
    this.controller.on("browserMessage", (event) => this.onBrowserMessage(event));
    this.controller.on("tick", () => this.onTick());
  }

  private registerPlugin(pluginId: string, init: ClientPluginInit): void {
    const normalizedPluginId = pluginId.trim();
    if (!normalizedPluginId) {
      logError(this, "Rejected client plugin registration with empty pluginId");
      return;
    }

    if (this.pluginApis.has(normalizedPluginId)) {
      logError(this, `Rejected duplicate client plugin registration for '${normalizedPluginId}'`);
      return;
    }

    const api = this.createPluginApi(normalizedPluginId);
    this.pluginApis.set(normalizedPluginId, api);
    logTrace(this, "Registered client plugin", {
      pluginId: normalizedPluginId,
    });

    Promise.resolve(init(api)).catch((error) => {
      logError(this, `Client plugin '${normalizedPluginId}' initialization failed`, error);
    });
  }

  private createPluginApi(pluginId: string): ClientPluginApi {
    const browser: ClientPluginBrowserApi = {
      emitEvent: (eventName: string, dataJson: string) => {
        const browserApi = this.sp.browser as BrowserApiWithEmitEvent;
        if (typeof browserApi.emitEvent === "function") {
          browserApi.emitEvent(eventName, dataJson);
          return;
        }

        this.sp.browser.executeJavaScript(
          new FunctionInfo(dispatchBrowserEventFallback).getText({
            dataJson,
            eventName,
          }),
        );
      },
      getBackendName: () => this.getBrowserBackendName(),
      isFocused: () => this.sp.browser.isFocused(),
      isVisible: () => this.sp.browser.isVisible(),
      loadUrl: (url: string) => this.sp.browser.loadUrl(url),
      setFocused: (focused: boolean) => this.sp.browser.setFocused(focused),
      setVisible: (visible: boolean) => this.sp.browser.setVisible(visible),
    };

    return {
      browser,
      getLocalProfileId: () => this.resolveLocalProfileId(),
      getSettingsScope: <T = Record<string, unknown>>(scope: string) => {
        const settingsRoot = this.sp.settings as Record<string, unknown>;
        return settingsRoot[scope] as T | undefined;
      },
      log: (...args: unknown[]) => logTrace(`ClientPlugin(${pluginId})`, ...args),
      logError: (...args: unknown[]) => logError(`ClientPlugin(${pluginId})`, ...args),
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
        this.inputHandlers.add(handler);
        return () => this.inputHandlers.delete(handler);
      },
      onLocalSpawn: (
        handler: ClientPluginLocalSpawnHandler,
      ): ClientPluginUnsubscribe => {
        this.localSpawnHandlers.add(handler);

        if (this.hasLocalSpawned) {
          handler(this.createLocalSpawnEvent());
        }

        return () => this.localSpawnHandlers.delete(handler);
      },
      onTick: (handler: ClientPluginTickHandler): ClientPluginUnsubscribe => {
        this.tickHandlers.add(handler);
        return () => this.tickHandlers.delete(handler);
      },
      resolveScanCode: (keyName: string): number | null => {
        const runtimeMap = (this.sp as unknown as {
          DxScanCode?: Record<string, number>;
        }).DxScanCode;
        const scanCode = runtimeMap?.[keyName];
        return typeof scanCode === "number" ? scanCode : null;
      },
      sendCustomPacket: (
        type: string,
        payload: Record<string, unknown>,
        reliability: "reliable" | "unreliable" = "reliable",
      ) => {
        const event: SendMessageEvent<CustomPacketMessage> = {
          message: {
            t: MsgType.CustomPacket,
            contentJsonDump: JSON.stringify({
              ...payload,
              customPacketType: type,
            }),
          },
          reliability,
        };
        this.controller.emitter.emit("sendMessage", event);
      },
      version: SKYMP_CLIENT_PLUGIN_HOST_VERSION,
    };
  }

  private onCreateActorMessage(event: ConnectionMessage<CreateActorMessage>): void {
    if (!event.message.isMe) {
      return;
    }

    this.hasLocalSpawned = true;
    const payload = this.createLocalSpawnEvent();
    this.localSpawnHandlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        logError(this, "Client plugin local spawn handler failed", error);
      }
    });
  }

  private onCustomPacketMessage(event: ConnectionMessage<CustomPacketMessage>): void {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(event.message.contentJsonDump);
    } catch (error) {
      logError(this, "Failed to parse custom packet JSON in plugin host", error);
      return;
    }

    const type = typeof payload.customPacketType === "string"
      ? payload.customPacketType
      : "";
    if (!type) {
      return;
    }

    delete payload.customPacketType;

    const handlers = this.customPacketHandlers.get(type);
    if (!handlers || handlers.size === 0) {
      return;
    }

    handlers.forEach((handler) => {
      try {
        handler(payload);
      } catch (error) {
        logError(this, `Client plugin custom packet handler failed for '${type}'`, error);
      }
    });
  }

  private onQueryKeyCodeBindings(event: QueryKeyCodeBindings): void {
    if (this.inputHandlers.size === 0) {
      return;
    }

    const inputState: ClientPluginInputState = {
      isDown: (binding) => event.isDown(binding),
    };

    this.inputHandlers.forEach((handler) => {
      try {
        handler(inputState);
      } catch (error) {
        logError(this, "Client plugin input handler failed", error);
      }
    });
  }

  private onBrowserMessage(event: BrowserMessageEvent): void {
    const eventArguments = Array.from(event.arguments || []);
    const key = typeof eventArguments[0] === "string"
      ? eventArguments[0]
      : "";
    if (!key) {
      return;
    }

    const handlers = this.browserMessageHandlers.get(key);
    if (!handlers || handlers.size === 0) {
      return;
    }

    const args = eventArguments.slice(1);
    handlers.forEach((handler) => {
      try {
        handler(args);
      } catch (error) {
        logError(this, `Client plugin browser handler failed for '${key}'`, error);
      }
    });
  }

  private onTick(): void {
    if (this.tickHandlers.size === 0) {
      return;
    }

    this.tickHandlers.forEach((handler) => {
      try {
        handler();
      } catch (error) {
        logError(this, "Client plugin tick handler failed", error);
      }
    });
  }

  private createLocalSpawnEvent(): ClientPluginLocalSpawnEvent {
    return {
      profileId: this.resolveLocalProfileId(),
    };
  }

  private resolveLocalProfileId(): number | null {
    const authGameData = this.sp.storage[authGameDataStorageKey] as AuthGameData | undefined;
    const authProfileId = authGameData?.local?.profileId as unknown;
    if (Number.isInteger(authProfileId)) {
      return authProfileId as number;
    }

    const settingsGameData = this.sp.settings["skymp5-client"]["gameData"] as
      | { profileId?: unknown }
      | undefined;
    const settingsProfileId = settingsGameData?.profileId as unknown;
    if (Number.isInteger(settingsProfileId)) {
      return settingsProfileId as number;
    }

    return null;
  }

  private getBrowserBackendName(): string {
    const browserApi = this.sp.browser as BrowserApiWithEmitEvent;
    if (typeof browserApi.getBackend !== "function") {
      return "unknown";
    }

    try {
      return String(browserApi.getBackend()?.name || "unknown");
    } catch (error) {
      logError(this, "Failed to read browser backend in plugin host", error);
      return "error";
    }
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

  private readonly browserMessageHandlers =
    new Map<string, Set<ClientPluginBrowserMessageHandler>>();
  private readonly customPacketHandlers =
    new Map<string, Set<ClientPluginCustomPacketHandler>>();
  private hasLocalSpawned = false;
  private readonly inputHandlers = new Set<ClientPluginInputHandler>();
  private readonly localSpawnHandlers = new Set<ClientPluginLocalSpawnHandler>();
  private readonly pluginApis = new Map<string, ClientPluginApi>();
  private readonly tickHandlers = new Set<ClientPluginTickHandler>();
}
