import { VoipClientPolicyController } from "../shared/voipClientPolicyController";
import {
  DEFAULT_PTT_KEY,
  DEFAULT_VOICE_MODE,
  parseVoipClientStatePacket,
  parseVoipPolicyStatePacket,
  VOIP_BROWSER_COMMAND_EVENT,
  VOIP_CLIENT_STATE_PACKET_TYPE,
  VOIP_PAGE_ERROR_MESSAGE,
  VOIP_PAGE_LOADED_MESSAGE,
  VOIP_PAGE_LOG_MESSAGE,
  VOIP_PAGE_MEDIA_STATE_MESSAGE,
  VOIP_POLICY_STATE_PACKET_TYPE,
  VoiceMode,
  VoipBrowserCommandName,
  VoipPageLoadedPayload,
  VoipPageLogLevel,
  VoipPageMediaState,
} from "../shared/voipProtocol";
import { ClientPluginApi, ClientPluginInputState } from "../../skymp5-plugin-api/clientPluginHost";
import { readVoipClientSettings, VoipClientSettings } from "./voipClientSettings";

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

    this.api.onLocalSpawn(() => this.onLocalSpawn());
    this.api.onCustomPacket(VOIP_POLICY_STATE_PACKET_TYPE, (payload) => this.onVoipPolicyState(payload));
    this.api.onInputState((inputState) => this.onInputState(inputState));
    this.api.onBrowserMessage(VOIP_PAGE_LOADED_MESSAGE, (args) => {
      this.api.log("VoIP page loaded", args[0] as VoipPageLoadedPayload | undefined);
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
      this.wasVoiceModeCycleKeyDown = false;
      return;
    }

    const profileId = this.api.getLocalProfileId();
    if (!Number.isInteger(profileId)) {
      this.api.logError("VoIP is enabled but no local profileId is available for voice identity");
      return;
    }

    if (!settings.uiUrl) {
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
    const browserFocused = this.api.browser.isFocused();
    const browserVisible = this.api.browser.isVisible();
    const shouldKeepBrowserVisible = this.shouldKeepBrowserVisibleForMicBootstrap(browserBackend);
    const finalUrl = this.appendIdentity(settings.uiUrl, identity);

    this.updateControllerRuntimeConfig(settings);
    this.policyController.setLocalIdentity(identity);
    this.policyController.resetVoiceMode();
    this.hasLocalPlayer = true;
    this.wasVoiceModeCycleKeyDown = false;

    this.sendClientState();
    this.syncBrowserState("createActorMessage");

    if (this.loadedVoipUrl === finalUrl) {
      this.api.log("VoIP page is already loaded for this session", {
        identity,
        url: finalUrl,
      });
      return;
    }

    this.api.log("VoIP page load start", {
      browserBackend,
      browserFocused,
      browserVisible,
      identity,
      rawUiUrl: settings.rawUiUrl,
      url: finalUrl,
    });

    let unsubscribeTick: (() => void) | null = null;
    unsubscribeTick = this.api.onTick(() => {
      unsubscribeTick?.();
      unsubscribeTick = null;

      const backendAtLoad = this.getBrowserBackendName();
      this.api.log("Loading VoIP URL", {
        browserBackend: backendAtLoad,
        focusedBeforeLoad: this.api.browser.isFocused(),
        foregroundBootstrap: shouldKeepBrowserVisible,
        url: finalUrl,
        visibleBeforeLoad: this.api.browser.isVisible(),
      });

      if (shouldKeepBrowserVisible) {
        this.voipForegroundBootstrapPending = true;
        this.api.log("Showing VoIP browser for mic bootstrap", {
          browserBackend: backendAtLoad,
          url: finalUrl,
        });
        this.api.browser.setVisible(true);
        this.api.browser.setFocused(true);
      } else {
        this.voipForegroundBootstrapPending = false;
        this.api.browser.setFocused(false);
        this.api.browser.setVisible(false);
      }

      this.api.browser.loadUrl(finalUrl);
      this.loadedVoipUrl = finalUrl;
    });
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
    if (!this.hasLocalPlayer || !this.readSettings().enabled) {
      return;
    }

    this.updateControllerRuntimeConfig();
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
      payload.audibleParticipantIds !== undefined
    ) {
      this.api.log("VoIP voice policy state", {
        audibleParticipantIds: payload.audibleParticipantIds || [],
        localParticipantId: payload.localParticipantId || "(unknown)",
        participantStates: payload.participantStates || [],
        positionalAudioEnabled: payload.positionalAudioEnabled,
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

  private syncBrowserState(reason: string, shouldLog: boolean = true): void {
    const snapshot = this.policyController.syncBrowserState(reason);
    if (!snapshot) {
      return;
    }

    if (shouldLog) {
      this.api.log("Syncing VoIP browser state", {
        audibleParticipantIds: snapshot.audibleParticipantIds,
        localIdentity: snapshot.localIdentity,
        positionalAudioEnabled: snapshot.positionalAudioEnabled,
        pttActive: snapshot.pttActive,
        reason: snapshot.reason,
        voiceMode: snapshot.voiceMode,
        worldOrCell: snapshot.worldOrCell,
      });
    }
  }

  private dispatchCommand(
    eventName: VoipBrowserCommandName,
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

  private appendIdentity(url: string, identity: string): string {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}identity=${encodeURIComponent(identity)}`;
  }

  private getBrowserBackendName(): string {
    return this.api.browser.getBackendName();
  }

  private shouldKeepBrowserVisibleForMicBootstrap(browserBackend: string): boolean {
    return browserBackend === "nirnlab";
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

    if (payload.getUserMediaSucceeded) {
      this.api.log("VoIP mic bootstrap succeeded, hiding browser", {
        browserBackend: this.getBrowserBackendName(),
      });
      this.api.browser.setFocused(false);
      this.api.browser.setVisible(false);
      return;
    }

    this.api.logError("VoIP mic bootstrap failed, leaving browser visible", {
      browserBackend: this.getBrowserBackendName(),
      micPermissionStatus: payload.micPermissionStatus || "unknown",
      url: this.loadedVoipUrl,
    });
  }

  private readSettings(): VoipClientSettings {
    return readVoipClientSettings(this.api);
  }

  private hasLocalPlayer = false;
  private lastMediaStateFingerprint = "";
  private loadedVoipUrl = "";
  private readonly policyController: VoipClientPolicyController;
  private voipForegroundBootstrapPending = false;
  private wasVoiceModeCycleKeyDown = false;
}

export const registerVoipClientPlugin = (api: ClientPluginApi): void => {
  new VoipClientPlugin(api);
};
