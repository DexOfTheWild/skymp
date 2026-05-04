import { VoipClientPolicyController } from "../shared/voipClientPolicyController";
import {
  DEFAULT_PTT_KEY,
  parseVoipPolicyStatePacket,
  VOIP_BROWSER_COMMAND_EVENT,
  VOIP_CLIENT_STATE_PACKET_TYPE,
  VOIP_PAGE_ERROR_MESSAGE,
  VOIP_PAGE_LOADED_MESSAGE,
  VOIP_PAGE_LOG_MESSAGE,
  VOIP_PAGE_MEDIA_STATE_MESSAGE,
  VOIP_POLICY_STATE_PACKET_TYPE,
  VoipBrowserCommandName,
  VoipPageLoadedPayload,
  VoipPageLogLevel,
  VoipPageMediaState,
} from "../shared/voipProtocol";
import { ClientPluginApi, ClientPluginInputState } from "../../skymp5-plugin-api/clientPluginHost";
import {
  isVoipDebugUiVisible,
  setVoipDebugUiVisible,
  toggleVoipDebugUiVisible,
} from "../../skymp5-plugin-api/voipDebugUiState";
import {
  blurVoipBrowser,
  createVoipBrowserHostStateDetail,
  focusVoipBrowser,
  syncVoipBrowserVisibilitySuppression,
} from "./voipBrowserHost";
import {
  VOIP_SET_HOST_STATE_EVENT,
  VoipSetHostStateDetail,
} from "./voipBrowserHostProtocol";
import { readVoipClientSettings, VoipClientSettings } from "./voipClientSettings";

type VoipClientBrowserCommandName =
  | VoipBrowserCommandName
  | typeof VOIP_SET_HOST_STATE_EVENT;

class VoipClientPlugin {
  private static readonly VOICE_MODE_CYCLE_KEY = "X";

  public constructor(private api: ClientPluginApi) {
    this.policyController = new VoipClientPolicyController({
      dispatchBrowserCommand: (eventName, detail) => this.dispatchCommand(eventName, detail),
      sendClientStatePacket: (packet) => {
        this.api.sendCustomPacket(
          VOIP_CLIENT_STATE_PACKET_TYPE,
          { voiceMode: packet.voiceMode },
          "reliable",
        );
      },
    });

    this.api.registerConsoleCommand("voipui", (args, context) => {
      return this.onVoipUiConsoleCommand(args, context.printConsole);
    });
    this.api.onLocalSpawn(() => this.onLocalSpawn());
    this.api.onCustomPacket(VOIP_POLICY_STATE_PACKET_TYPE, (payload) => this.onVoipPolicyState(payload));
    this.api.onInputState((inputState) => this.onInputState(inputState));
    this.api.onBrowserMessage(VOIP_PAGE_LOADED_MESSAGE, (args) => {
      this.api.log("VoIP page loaded", args[0] as VoipPageLoadedPayload | undefined);
      this.syncHostState("voip-page-loaded");
      this.syncBrowserState("voip-page-loaded");
    });
    this.api.onBrowserMessage(VOIP_PAGE_LOG_MESSAGE, (args) => this.onBrowserLog(args));
    this.api.onBrowserMessage(VOIP_PAGE_ERROR_MESSAGE, (args) => {
      this.api.logError("VoIP page error", args[0], args[1]);
    });
    this.api.onBrowserMessage(VOIP_PAGE_MEDIA_STATE_MESSAGE, (args) => {
      this.onMediaState(args[0] as VoipPageMediaState | undefined);
    });

    this.api.onTick(() => this.onTick());
  }

  private onLocalSpawn(): void {
    const settings = this.readSettings();
    if (!settings.enabled) {
      this.hasLocalPlayer = false;
      this.voipForegroundBootstrapPending = false;
      this.syncHostState("local-spawn-disabled", settings);
      this.syncBrowserVisibilitySuppression(settings);
      this.wasVoiceModeCycleKeyDown = false;
      return;
    }

    const profileId = this.api.getLocalProfileId();
    if (!Number.isInteger(profileId)) {
      this.hasLocalPlayer = false;
      this.voipForegroundBootstrapPending = false;
      this.syncHostState("local-spawn-missing-profile-id", settings);
      this.api.logError("VoIP is enabled but no local profileId is available for voice identity");
      return;
    }

    if (!settings.uiUrl) {
      this.hasLocalPlayer = false;
      this.voipForegroundBootstrapPending = false;
      this.syncHostState("local-spawn-missing-ui-url", settings);
      this.api.logError("VoIP is enabled but uiUrl is empty");
      return;
    }

    const browserApi = this.api.browser as typeof this.api.browser & {
      setMediaPermissionPolicy?: (policy: "default" | "secureOriginAudioCapture") => void;
    };
    if (typeof browserApi.setMediaPermissionPolicy === "function") {
      browserApi.setMediaPermissionPolicy("secureOriginAudioCapture");
    } else {
      this.api.log(
        "VoIP browser host does not expose media permission policy control; continuing without secure-origin mic bootstrap",
        {
          browserBackend: this.getBrowserBackendName(),
        },
      );
    }

    const identity = String(profileId);
    const browserBackend = this.getBrowserBackendName();
    const debugUiVisible = isVoipDebugUiVisible();
    const shouldFocusBrowserForMicBootstrap = this.shouldKeepBrowserVisibleForMicBootstrap(browserBackend);

    this.updateControllerRuntimeConfig(settings);
    this.policyController.setLocalIdentity(identity);
    this.policyController.resetVoiceMode();
    this.hasLocalPlayer = true;
    this.lastDebugUiVisible = debugUiVisible;
    this.voipForegroundBootstrapPending = shouldFocusBrowserForMicBootstrap;
    this.syncBrowserVisibilitySuppression(settings);
    this.wasVoiceModeCycleKeyDown = false;

    this.syncHostState("createActorMessage", settings);
    this.sendClientState();
    this.syncBrowserState("createActorMessage");

    this.api.log("VoIP shell module activated", {
      browserBackend,
      debugUiVisible,
      foregroundBootstrap: shouldFocusBrowserForMicBootstrap,
      identity,
      rawUiUrl: settings.rawUiUrl,
      uiUrl: settings.uiUrl,
    });

    if (shouldFocusBrowserForMicBootstrap || debugUiVisible) {
      this.focusBrowser(
        shouldFocusBrowserForMicBootstrap
          ? "voip foreground mic bootstrap"
          : "voip debug ui enabled",
      );
      return;
    }

    this.blurBrowser("voip shell activated without foreground bootstrap");
  }

  private onVoipPolicyState(payload: Record<string, unknown>): void {
    const policyState = parseVoipPolicyStatePacket(
      {
        ...payload,
        customPacketType: VOIP_POLICY_STATE_PACKET_TYPE,
      },
      this.policyController.getLocalIdentity() || "",
    );
    if (!policyState) {
      return;
    }

    this.policyController.handlePolicyState(policyState);
    this.api.log("Received VoIP policy state", policyState);
    this.syncBrowserState("voipPolicyState");
  }

  private onInputState(inputState: ClientPluginInputState): void {
    if (!this.hasLocalPlayer || !this.readSettings().enabled) {
      this.wasVoiceModeCycleKeyDown = false;
      return;
    }

    this.updateControllerRuntimeConfig();
    const pttKeyDown = inputState.isDown([this.getPttScanCode()]);
    const configuredPttKeyName = this.policyController.getConfiguredPttKeyName();
    if (this.policyController.setPttActive(pttKeyDown)) {
      this.api.log("VoIP PTT state changed", {
        active: pttKeyDown,
        mode: "hold",
        pttKey: configuredPttKeyName,
      });
    }

    const cycleKeyDown = inputState.isDown([this.getVoiceModeCycleScanCode()]);
    if (cycleKeyDown && !this.wasVoiceModeCycleKeyDown) {
      const voiceMode = this.policyController.cycleVoiceMode();
      this.api.log("VoIP voice mode changed", {
        key: VoipClientPlugin.VOICE_MODE_CYCLE_KEY,
        localIdentity: this.policyController.getLocalIdentity(),
        voiceMode,
      });
      this.syncBrowserState("voiceModeCycle", false);
    }
    this.wasVoiceModeCycleKeyDown = cycleKeyDown;
  }

  private onTick(): void {
    const settings = this.readSettings();
    if (!this.hasLocalPlayer || !settings.enabled) {
      this.syncHostState("tick-disabled", settings);
      this.syncBrowserVisibilitySuppression(settings);
      return;
    }

    this.syncBrowserVisibilitySuppression(settings);
    this.syncDebugUiVisibility();
    this.syncHostState("tick", settings);
    this.updateControllerRuntimeConfig(settings);
    this.policyController.maybeHeartbeat();
  }

  private onBrowserLog(args: unknown[]): void {
    const level = String(args[0] || "info") as VoipPageLogLevel;
    const message = String(args[1] || "");
    const details = args[2];

    if (level === "error") {
      this.api.logError(`VoIP page error log: ${message}`, details);
      return;
    }

    this.api.log(`VoIP page ${level}: ${message}`, details);
  }

  private onMediaState(payload: VoipPageMediaState | undefined): void {
    if (!payload) {
      return;
    }

    const fingerprint = JSON.stringify(payload);
    if (fingerprint === this.lastMediaStateFingerprint) {
      return;
    }
    this.lastMediaStateFingerprint = fingerprint;

    this.api.log("VoIP page media state", payload);

    if (payload.getUserMediaSucceeded !== undefined || payload.selectedInputDeviceLabel) {
      this.api.log("VoIP getUserMedia", {
        selectedInputDeviceLabel: payload.selectedInputDeviceLabel || "(unknown device)",
        succeeded: payload.getUserMediaSucceeded,
      });
    }

    if (
      payload.pttActive !== undefined ||
      payload.transmitting !== undefined ||
      payload.audibleParticipantIds !== undefined ||
      payload.iceTransportPolicy !== undefined
    ) {
      this.api.log("VoIP voice policy state", {
        audibleParticipantIds: payload.audibleParticipantIds || [],
        iceTransportPolicy: payload.iceTransportPolicy || "all",
        localParticipantId: payload.localParticipantId || "(unknown)",
        participantStates: payload.participantStates || [],
        positionalAudioEnabled: payload.positionalAudioEnabled,
        positionalAudioMode: payload.positionalAudioMode || "off",
        proximityRadius: payload.proximityRadius,
        pttActive: payload.pttActive,
        transmitting: payload.transmitting,
        voiceMode: payload.voiceMode,
        worldOrCell: payload.worldOrCell,
      });
    }

    this.maybeCompleteForegroundBootstrap(payload);
  }

  private sendClientState(): void {
    this.updateControllerRuntimeConfig();
    const voiceMode = this.policyController.getVoiceMode();
    this.api.log("Sending VoIP client state", {
      localIdentity: this.policyController.getLocalIdentity(),
      voiceMode,
    });
    this.policyController.sendClientState();
  }

  private syncHostState(
    reason: string,
    settings: VoipClientSettings = this.readSettings(),
  ): void {
    const identity = this.policyController.getLocalIdentity() || "";
    const detail: VoipSetHostStateDetail = createVoipBrowserHostStateDetail({
      foregroundBootstrap: this.voipForegroundBootstrapPending,
      hasLocalPlayer: this.hasLocalPlayer,
      identity,
      settings,
    });
    const fingerprint = JSON.stringify(detail);
    if (fingerprint === this.lastShellStateFingerprint) {
      return;
    }

    this.lastShellStateFingerprint = fingerprint;
    this.dispatchCommand(
      VOIP_SET_HOST_STATE_EVENT,
      detail as Record<string, unknown>,
    );
    this.api.log("Syncing VoIP host state", {
      ...detail,
      reason,
    });
  }

  private syncBrowserState(reason: string, shouldLog: boolean = true): void {
    const snapshot = this.policyController.syncBrowserState(reason);
    if (!snapshot) {
      return;
    }

    this.dispatchCommand("skymp5-voip:set-debug-state", {
      debugUiVisible: isVoipDebugUiVisible(),
    });

    if (shouldLog) {
      this.api.log("Syncing VoIP browser state", {
        audibleParticipantIds: snapshot.audibleParticipantIds,
        localIdentity: snapshot.localIdentity,
        positionalAudioMode: snapshot.positionalAudioMode,
        pttActive: snapshot.pttActive,
        reason: snapshot.reason,
        voiceMode: snapshot.voiceMode,
        worldOrCell: snapshot.worldOrCell,
      });
    }
  }

  private dispatchCommand(
    eventName: VoipClientBrowserCommandName,
    detail: Record<string, unknown>,
  ): void {
    this.api.browser.emitEvent(
      VOIP_BROWSER_COMMAND_EVENT,
      JSON.stringify({ detail, eventName }),
    );
  }

  private updateControllerRuntimeConfig(
    settings: VoipClientSettings = this.readSettings(),
  ): void {
    this.policyController.setRuntimeConfig({
      positionalAudioMode: settings.positionalAudioMode,
      pttKey: settings.pttKey,
    });
  }

  private getPttScanCode(): number {
    const keyName = this.policyController.getConfiguredPttKeyName();
    const scanCode = this.api.resolveScanCode(keyName);
    if (scanCode !== null) {
      return scanCode;
    }

    this.api.logError(`Unknown voip pttKey '${keyName}', falling back to ${DEFAULT_PTT_KEY}`);
    const fallbackScanCode = this.api.resolveScanCode(DEFAULT_PTT_KEY);
    if (fallbackScanCode !== null) {
      return fallbackScanCode;
    }

    this.api.logError(`Default voip pttKey '${DEFAULT_PTT_KEY}' is unavailable in the host runtime`);
    return -1;
  }

  private getVoiceModeCycleScanCode(): number {
    const scanCode = this.api.resolveScanCode(VoipClientPlugin.VOICE_MODE_CYCLE_KEY);
    if (scanCode !== null) {
      return scanCode;
    }

    this.api.logError(
      `VoIP voice mode cycle key '${VoipClientPlugin.VOICE_MODE_CYCLE_KEY}' is unavailable in the host runtime`,
    );
    return -1;
  }

  private onVoipUiConsoleCommand(
    args: string[],
    printConsole: (...args: unknown[]) => void,
  ): boolean {
    const action = (args[0] || "toggle").trim().toLowerCase();

    if (action === "status") {
      printConsole(`[mp voipui] ${isVoipDebugUiVisible() ? "on" : "off"}`);
      return true;
    }

    if (action === "toggle") {
      const nextState = toggleVoipDebugUiVisible();
      this.syncBrowserVisibilitySuppression();
      this.syncDebugUiVisibility();
      printConsole(`[mp voipui] ${nextState ? "on" : "off"}`);
      return true;
    }

    if (action === "on" || action === "1") {
      setVoipDebugUiVisible(true);
      this.syncBrowserVisibilitySuppression();
      this.syncDebugUiVisibility();
      printConsole("[mp voipui] on");
      return true;
    }

    if (action === "off" || action === "0") {
      setVoipDebugUiVisible(false);
      this.syncBrowserVisibilitySuppression();
      this.syncDebugUiVisibility();
      printConsole("[mp voipui] off");
      return true;
    }

    printConsole("[mp voipui] usage: mp voipui [on|off|toggle|status]");
    return true;
  }

  private getBrowserBackendName(): string {
    return this.api.browser.getBackendName();
  }

  private shouldKeepBrowserVisibleForMicBootstrap(browserBackend: string): boolean {
    return browserBackend === "nirnlab";
  }

  private syncBrowserVisibilitySuppression(
    settings: VoipClientSettings = this.readSettings(),
  ): void {
    syncVoipBrowserVisibilitySuppression(this.hasLocalPlayer, settings);
  }

  private syncDebugUiVisibility(): void {
    const debugUiVisible = isVoipDebugUiVisible();
    if (debugUiVisible !== this.lastDebugUiVisible) {
      this.lastDebugUiVisible = debugUiVisible;
      this.api.log(`VoIP debug UI ${debugUiVisible ? "enabled" : "disabled"}`);
      this.dispatchCommand("skymp5-voip:set-debug-state", {
        debugUiVisible,
      });

      this.syncHostState("debug-ui-visibility-changed");

      if (debugUiVisible) {
        this.focusBrowser("voip debug ui enabled");
      } else if (!this.voipForegroundBootstrapPending) {
        this.blurBrowser("voip debug ui disabled");
      }
    }
  }

  private maybeCompleteForegroundBootstrap(payload: VoipPageMediaState): void {
    if (
      !this.voipForegroundBootstrapPending ||
      payload.getUserMediaSucceeded === undefined ||
      payload.getUserMediaSucceeded === null
    ) {
      return;
    }

    this.voipForegroundBootstrapPending = false;
    this.syncHostState("mic-bootstrap-complete");

    if (payload.getUserMediaSucceeded) {
      if (isVoipDebugUiVisible()) {
        this.api.log("VoIP mic bootstrap succeeded with debug UI enabled, leaving browser focused", {
          browserBackend: this.getBrowserBackendName(),
        });
        return;
      }

      this.api.log("VoIP mic bootstrap succeeded, returning browser focus to gameplay", {
        browserBackend: this.getBrowserBackendName(),
      });
      this.blurBrowser("voip mic bootstrap succeeded");
      return;
    }

    if (!isVoipDebugUiVisible()) {
      this.api.logError("VoIP mic bootstrap failed while debug UI was hidden", {
        browserBackend: this.getBrowserBackendName(),
        micPermissionStatus: payload.micPermissionStatus || "unknown",
      });
      this.blurBrowser("voip mic bootstrap failed while debug ui hidden");
      return;
    }

    this.api.logError("VoIP mic bootstrap failed, leaving debug UI focused", {
      browserBackend: this.getBrowserBackendName(),
      micPermissionStatus: payload.micPermissionStatus || "unknown",
    });
  }

  private focusBrowser(reason: string): void {
    focusVoipBrowser(this.api, reason);
  }

  private blurBrowser(reason: string): void {
    blurVoipBrowser(this.api, reason);
  }

  private readSettings(): VoipClientSettings {
    return readVoipClientSettings(this.api);
  }

  private hasLocalPlayer = false;
  private lastShellStateFingerprint = "";
  private lastMediaStateFingerprint = "";
  private lastDebugUiVisible = isVoipDebugUiVisible();
  private readonly policyController: VoipClientPolicyController;
  private voipForegroundBootstrapPending = false;
  private wasVoiceModeCycleKeyDown = false;
}

export const registerVoipClientPlugin = (api: ClientPluginApi): void => {
  new VoipClientPlugin(api);
};
