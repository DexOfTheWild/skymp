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
  ClientPluginBrowserApi,
  ClientPluginBrowserMediaPermissionPolicy,
  ClientPluginConsoleCommandHandler,
  ClientPluginCapabilities,
  ClientPluginInputState,
  ClientPluginLocalSpawnEvent,
  ClientPluginUnsubscribe,
} from "../../../../skymp5-plugin-api/clientPluginHost";
import { registerClientPluginConsoleCommand } from "./clientPluginConsoleCommandRegistry";
import { ClientPluginHostRuntime } from "./clientPluginHostRuntime";

declare const window: any;

type BrowserApiWithEmitEvent = Sp["browser"] & {
  emitEvent?: (eventName: string, dataJson: string) => void;
  getBackend?: () => {
    name?: string;
  };
  setMediaPermissionPolicy?: (policy: string) => void;
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
      this.runtime.registerPlugin(pluginId, init);
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

  private createBrowserApi(): ClientPluginBrowserApi {
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
      setMediaPermissionPolicy: (
        policy: ClientPluginBrowserMediaPermissionPolicy,
      ) => {
        const browserApi = this.sp.browser as BrowserApiWithEmitEvent;
        if (typeof browserApi.setMediaPermissionPolicy === "function") {
          browserApi.setMediaPermissionPolicy(policy);
          return;
        }

        logError(this, `Browser backend does not expose setMediaPermissionPolicy('${policy}')`);
      },
      setFocused: (focused: boolean) => this.sp.browser.setFocused(focused),
      setVisible: (visible: boolean) => this.sp.browser.setVisible(visible),
    };

    return browser;
  }

  private onCreateActorMessage(event: ConnectionMessage<CreateActorMessage>): void {
    if (!event.message.isMe) {
      return;
    }

    this.runtime.dispatchLocalSpawn(this.createLocalSpawnEvent());
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

    this.runtime.dispatchCustomPacket(type, payload);
  }

  private onQueryKeyCodeBindings(event: QueryKeyCodeBindings): void {
    const inputState: ClientPluginInputState = {
      isDown: (binding) => event.isDown(binding),
    };

    this.runtime.dispatchInputState(inputState);
  }

  private onBrowserMessage(event: BrowserMessageEvent): void {
    const eventArguments = Array.from(event.arguments || []);
    const key = typeof eventArguments[0] === "string"
      ? eventArguments[0]
      : "";
    if (!key) {
      return;
    }

    const args = eventArguments.slice(1);
    this.runtime.dispatchBrowserMessage(key, args);
  }

  private onTick(): void {
    this.runtime.dispatchTick();
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

  private createCapabilities(): ClientPluginCapabilities {
    const browserApi = this.sp.browser as BrowserApiWithEmitEvent;
    return {
      browser: {
        mediaPermissionPolicies: typeof browserApi.setMediaPermissionPolicy === "function"
          ? ["default", "secureOriginAudioCapture"]
          : [],
      },
      consoleCommands: true,
    };
  }

  private readonly runtime = new ClientPluginHostRuntime({
    browser: this.createBrowserApi(),
    capabilities: this.createCapabilities(),
    getLocalProfileId: () => this.resolveLocalProfileId(),
    getSettingsScope: <T = Record<string, unknown>>(scope: string) => {
      const settingsRoot = this.sp.settings as Record<string, unknown>;
      return settingsRoot[scope] as T | undefined;
    },
    log: (pluginId: string, ...args: unknown[]) => logTrace(pluginId, ...args),
    logError: (pluginId: string, ...args: unknown[]) => logError(pluginId, ...args),
    registerConsoleCommand: (
      pluginId: string,
      commandName: string,
      handler: ClientPluginConsoleCommandHandler,
    ): ClientPluginUnsubscribe => {
      const registration = registerClientPluginConsoleCommand({
        commandName,
        handler,
        pluginId,
      });
      if (!registration.ok) {
        logError(
          this,
          `Client plugin '${pluginId}' failed to register console command '${commandName}'`,
          registration.error,
        );
        return () => undefined;
      }

      logTrace(this, "Registered client plugin console command", {
        commandName: registration.normalizedCommandName,
        pluginId,
      });
      return registration.unregister;
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
      reliability: "reliable" | "unreliable",
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
  });
}
