import {
  createLocalAudioTrack,
  LocalAudioTrack,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  TrackPublication,
} from "livekit-client";
import {
  DEFAULT_MAX_VOIP_GAIN,
  DEFAULT_POSITIONAL_AUDIO_ENABLED,
  DEFAULT_PTT_KEY,
  DEFAULT_VOICE_MODE,
  PendingVoipCommand,
  sanitizeParticipantAudioStates,
  sanitizeVoiceMode,
  VOIP_BROWSER_COMMAND_EVENT,
  VOIP_COMMAND_PAYLOAD_ATTR,
  VOIP_COMMAND_SEQUENCE_ATTR,
  VOIP_PAGE_ERROR_MESSAGE,
  VOIP_PAGE_LOADED_MESSAGE,
  VOIP_PAGE_LOG_MESSAGE,
  VOIP_PAGE_MEDIA_STATE_MESSAGE,
  VOIP_SET_AUDIO_STATE_EVENT,
  VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT,
  VOIP_SET_DEBUG_STATE_EVENT,
  VOIP_SET_LOCAL_PLAYER_ID_EVENT,
  VOIP_SET_PTT_EVENT,
  VOIP_SET_VOICE_MODE_EVENT,
  VoiceMode,
  VoipPageLoadedPayload,
  VoipPageLogLevel,
  VoipPageMediaState,
  VoipParticipantAudioState,
  VoipParticipantGraphMode,
  VoipParticipantPolicyState,
  VoipParticipantPosition,
  VoipSetAudioStateDetail,
  VoipSetAudibleParticipantsDetail,
  VoipSetDebugStateDetail,
  VoipSetLocalPlayerIdDetail,
  VoipSetPttDetail,
  VoipSetVoiceModeDetail,
} from "../../shared/voipProtocol";

declare global {
  interface Window {
    __skympDispatchVoipCommand?: (eventName: string, detail: unknown) => void;
    __skympVoipCommandQueue?: Array<{ detail: unknown; eventName: string }>;
    skyrimPlatform?: {
      addEventListener?: (eventName: string, callback: (data: string) => void) => void;
      sendMessage?: (...args: unknown[]) => void;
    };
    webkitAudioContext?: typeof AudioContext;
  }
}

type NavigatorWithPermissions = Navigator & {
  permissions?: {
    query?: (descriptor: PermissionDescriptor) => Promise<PermissionStatus>;
  };
};

export type LogLevel = VoipPageLogLevel;
export type ParticipantState = VoipParticipantPolicyState;

type TokenResponse = {
  expiresAt: string;
  identity: string;
  roomName: string;
  serverTime: string;
  token: string;
  wsUrl: string;
};

type VoipCallbacks = {
  onLog?: (entry: VoipLogEntry) => void;
  onStateChange: (state: VoipState) => void;
};

type RemoteAudioEntry = {
  audioElement: HTMLAudioElement | null;
  gainNode: GainNode | null;
  graphMode: VoipParticipantGraphMode;
  participantIdentity: string;
  pannerNode: PannerNode | null;
  sourceNode: MediaElementAudioSourceNode | null;
  stereoPannerNode: StereoPannerNode | null;
  track: RemoteAudioTrack;
};

export type VoipState = {
  audibleParticipantIds: string[];
  connectionStatus: string;
  expiresAt: string;
  getUserMediaSucceeded: boolean | null;
  identity: string;
  localParticipantId: string;
  localPublishState: "published" | "unpublished";
  localSpeakingLevel: number;
  localTrackCreated: boolean;
  localTrackMuted: boolean;
  localTrackPublished: boolean;
  micPermissionStatus: "unknown" | "pending" | "granted" | "denied" | "failed";
  participantCount: number;
  participantCountInRange: number;
  participantIdentities: string[];
  participantStates: ParticipantState[];
  positionalAudioEnabled: boolean;
  proximityRadius: number | null;
  pttActive: boolean;
  pttKey: string;
  remoteParticipantJoined: boolean;
  remoteTrackSubscribed: boolean;
  roomName: string;
  selectedInputDeviceLabel: string;
  serverTime: string;
  tokenFetchStatus: "idle" | "fetching" | "success" | "failed";
  tokenValidForSeconds: number | null;
  tokenWarningState: "normal" | "near-expiry" | "expired";
  transmitting: boolean;
  voiceMode: VoiceMode;
  worldOrCell: string;
  wsUrl: string;
};

export type VoipLogEntry = {
  details?: string;
  level: LogLevel;
  message: string;
  timestamp: string;
};

const MAX_LOG_ENTRIES = 200;

const createInitialState = (): VoipState => ({
  audibleParticipantIds: [],
  connectionStatus: "idle",
  expiresAt: "",
  getUserMediaSucceeded: null,
  identity: "",
  localParticipantId: "",
  localPublishState: "unpublished",
  localSpeakingLevel: 0,
  localTrackCreated: false,
  localTrackMuted: false,
  localTrackPublished: false,
  micPermissionStatus: "unknown",
  participantCount: 0,
  participantCountInRange: 0,
  participantIdentities: [],
  participantStates: [],
  positionalAudioEnabled: DEFAULT_POSITIONAL_AUDIO_ENABLED,
  proximityRadius: null,
  pttActive: false,
  pttKey: DEFAULT_PTT_KEY,
  remoteParticipantJoined: false,
  remoteTrackSubscribed: false,
  roomName: "",
  selectedInputDeviceLabel: "",
  serverTime: "",
  tokenFetchStatus: "idle",
  tokenValidForSeconds: null,
  tokenWarningState: "normal",
  transmitting: false,
  voiceMode: DEFAULT_VOICE_MODE,
  worldOrCell: "unknown",
  wsUrl: "",
});

const serializeDetails = (details: unknown): unknown => {
  if (details === undefined || details === null || typeof details === "string") {
    return details;
  }

  if (details instanceof Error) {
    return {
      message: details.message,
      name: details.name,
      stack: details.stack || details.message,
    };
  }

  if (typeof DOMException !== "undefined" && details instanceof DOMException) {
    return {
      message: details.message,
      name: details.name,
      stack: details.message,
    };
  }

  if (typeof details === "object") {
    const errorLike = details as {
      message?: unknown;
      name?: unknown;
      stack?: unknown;
    };
    if (
      typeof errorLike.message === "string" ||
      typeof errorLike.name === "string" ||
      typeof errorLike.stack === "string"
    ) {
      return {
        message:
          typeof errorLike.message === "string"
            ? errorLike.message
            : typeof errorLike.name === "string"
              ? errorLike.name
              : "unknown error",
        name: typeof errorLike.name === "string" ? errorLike.name : undefined,
        stack:
          typeof errorLike.stack === "string"
            ? errorLike.stack
            : typeof errorLike.message === "string"
              ? errorLike.message
              : undefined,
      };
    }
  }

  return details;
};

const stringifyDetails = (details: unknown): string | undefined => {
  const normalized = serializeDetails(details);
  if (normalized === undefined || normalized === null) {
    return undefined;
  }
  if (typeof normalized === "string") {
    return normalized;
  }
  try {
    return JSON.stringify(normalized);
  } catch (_error) {
    return String(normalized);
  }
};

const normalizeBridgeDetails = (details: unknown): unknown => {
  const normalized = serializeDetails(details);
  if (normalized === undefined) {
    return null;
  }
  return normalized;
};

const toSortedUniqueStrings = (values: string[]): string[] => {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort();
};

const bridgeSend = (...args: unknown[]): void => {
  try {
    if (typeof window.skyrimPlatform?.sendMessage === "function") {
      window.skyrimPlatform.sendMessage(...args);
    }
  } catch (error) {
    console.error("[voip-page bridge error]", error);
  }
};

export const bridgePageLoaded = (page: string): void => {
  const payload: VoipPageLoadedPayload = {
    hasFocus: document.hasFocus(),
    href: window.location.href,
    isSecureContext: window.isSecureContext,
    mediaDevicesAvailable: typeof navigator.mediaDevices?.getUserMedia === "function",
    page,
    visibilityState: document.visibilityState,
  };
  bridgeSend(VOIP_PAGE_LOADED_MESSAGE, payload);
};

export const bridgeLog = (level: LogLevel, message: string, details?: unknown): void => {
  bridgeSend(VOIP_PAGE_LOG_MESSAGE, level, message, normalizeBridgeDetails(details));
};

export const bridgeError = (message: string, details?: unknown): void => {
  bridgeSend(VOIP_PAGE_ERROR_MESSAGE, message, normalizeBridgeDetails(details));
};

export const readIdentityFromQuery = (): string => {
  return new URLSearchParams(window.location.search).get("identity")?.trim() || "";
};

const deriveConnectUrl = (wsUrl: string): string => {
  const url = new URL(wsUrl);
  if (url.pathname.endsWith("/rtc")) {
    url.pathname = url.pathname.slice(0, -4);
  }
  const normalized = url.toString();
  return normalized.endsWith("/") ? normalized.slice(0, normalized.length - 1) : normalized;
};

const collectAudioEnvironment = async (): Promise<Record<string, unknown>> => {
  const permissionsApi = (navigator as NavigatorWithPermissions).permissions;
  let microphonePermissionQuery = "unavailable";

  if (typeof permissionsApi?.query === "function") {
    try {
      const permissionStatus = await permissionsApi.query({
        name: "microphone",
      } as unknown as PermissionDescriptor);
      microphonePermissionQuery = permissionStatus.state;
    } catch (error) {
      microphonePermissionQuery = `error:${stringifyDetails(error) || "unknown"}`;
    }
  }

  return {
    hasFocus: document.hasFocus(),
    href: window.location.href,
    isSecureContext: window.isSecureContext,
    mediaDevicesAvailable: typeof navigator.mediaDevices?.getUserMedia === "function",
    microphonePermissionQuery,
    pageVisibility: document.visibilityState,
    permissionsApiAvailable: typeof permissionsApi?.query === "function",
    referrer: document.referrer || "",
    userAgent: navigator.userAgent,
  };
};

const createMeter = (
  mediaStreamTrack: MediaStreamTrack,
  onLevel: (level: number) => void,
): (() => void) => {
  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return () => undefined;
  }

  const audioContext = new AudioContextCtor();
  const analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  const source = audioContext.createMediaStreamSource(new MediaStream([mediaStreamTrack]));
  source.connect(analyser);

  const data = new Uint8Array(analyser.fftSize);
  let disposed = false;

  const tick = () => {
    if (disposed) {
      return;
    }
    analyser.getByteTimeDomainData(data);
    let sumSquares = 0;
    for (let index = 0; index < data.length; index += 1) {
      const normalized = (data[index] - 128) / 128;
      sumSquares += normalized * normalized;
    }
    const rms = Math.sqrt(sumSquares / data.length);
    onLevel(Math.max(0, Math.min(1, rms * 5)));
    window.setTimeout(tick, 100);
  };

  void audioContext.resume().catch((): undefined => undefined);
  tick();

  return () => {
    disposed = true;
    source.disconnect();
    analyser.disconnect();
    void audioContext.close().catch((): undefined => undefined);
  };
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

const createFallbackParticipantAudioState = (
  identity: string,
  audible: boolean,
): VoipParticipantAudioState => {
  return {
    audible,
    distance: 0,
    gain: audible ? DEFAULT_MAX_VOIP_GAIN : 0,
    id: identity,
    mode: DEFAULT_VOICE_MODE,
    position: { x: 0, y: 0, z: 0 },
    sameWorldOrCell: true,
  };
};

const computeDebugPan = (
  position: VoipParticipantPosition | null | undefined,
  distance: number | null | undefined,
): number | null => {
  if (!position) {
    return null;
  }

  const effectiveDistance = distance && distance > 0
    ? distance
    : Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
  if (effectiveDistance <= 0) {
    return 0;
  }

  return clamp(position.x / effectiveDistance, -1, 1);
};

const toWebAudioPannerPosition = (
  position: VoipParticipantPosition,
): VoipParticipantPosition => {
  return {
    x: position.x,
    y: position.z,
    z: -position.y,
  };
};

export class VoipHarness {
  public constructor(private callbacks: VoipCallbacks) {
    this.registerCommandListeners();
    this.emitState();
  }

  public getState(): VoipState {
    return {
      ...this.state,
      participantIdentities: [...this.state.participantIdentities],
      participantStates: this.state.participantStates.map((participant) => ({
        ...participant,
        position: participant.position ? { ...participant.position } : null,
      })),
    };
  }

  public async start(identity: string): Promise<void> {
    if (this.started) {
      return;
    }

    if (this.startPromise) {
      return this.startPromise;
    }

    this.startPromise = this.startInternal(identity)
      .then(() => {
        this.started = true;
      })
      .finally(() => {
        this.startPromise = null;
      });

    return this.startPromise;
  }

  public async togglePublish(): Promise<void> {
    if (!this.room || !this.localTrack) {
      this.log("warn", "publish toggle requested before local track was ready");
      return;
    }

    if (this.state.localTrackPublished) {
      await this.room.localParticipant.unpublishTrack(this.localTrack);
      this.patchState({
        localPublishState: "unpublished",
        localTrackPublished: false,
      });
      await this.applyLocalTransmitState("manual unpublish");
      this.log("info", "local track unpublished");
      return;
    }

    await this.room.localParticipant.publishTrack(this.localTrack);
    this.patchState({
      localPublishState: "published",
      localTrackPublished: true,
    });
    await this.applyLocalTransmitState("manual republish");
    this.log("info", "local track published");
    this.updateParticipantState();
  }

  public dispose(): void {
    if (this.domCommandObserver) {
      this.domCommandObserver.disconnect();
      this.domCommandObserver = null;
    }
    if (this.countdownIntervalId !== null) {
      window.clearInterval(this.countdownIntervalId);
      this.countdownIntervalId = null;
    }
    if (this.meterDispose) {
      this.meterDispose();
      this.meterDispose = null;
    }

    for (const remoteEntry of this.remoteAudioElements.values()) {
      this.detachRemoteAudioEntry(remoteEntry);
    }
    this.remoteAudioElements.clear();

    if (this.localTrack) {
      this.localTrack.stop();
      this.localTrack = null;
    }
    if (this.room) {
      void this.room.disconnect();
      this.room = null;
    }
    if (this.playbackAudioContext) {
      void this.playbackAudioContext.close().catch((): undefined => undefined);
      this.playbackAudioContext = null;
    }
  }

  private async startInternal(identity: string): Promise<void> {
    if (!identity) {
      const error = new Error("identity query parameter is required");
      this.log("error", "missing identity query parameter", { href: window.location.href });
      throw error;
    }

    this.patchState({ identity, tokenFetchStatus: "fetching" });
    this.log("info", "fetching token", { identity });

    const tokenResponse = await this.fetchToken(identity);
    this.startTokenCountdown(tokenResponse.serverTime, tokenResponse.expiresAt);

    this.room = new Room({
      webAudioMix: true,
    });
    this.bindRoomEvents(this.room);

    const connectUrl = deriveConnectUrl(tokenResponse.wsUrl);
    this.patchState({ connectionStatus: "connecting" });
    this.log("info", "connecting to LiveKit room", {
      connectUrl,
      roomName: tokenResponse.roomName,
      wsUrl: tokenResponse.wsUrl,
    });

    await this.room.connect(connectUrl, tokenResponse.token);
    this.log("info", "LiveKit connected", {
      roomName: tokenResponse.roomName,
      wsUrl: tokenResponse.wsUrl,
    });

    await this.bootstrapLocalAudio();
    await this.ensureRoomAudioStarted("local audio bootstrap");
    await this.publishLocalTrack();
  }

  private registerCommandListeners(): void {
    const handleCommand = (eventName: string, detail: unknown) => {
      switch (eventName) {
        case VOIP_SET_PTT_EVENT:
          void this.setPttActive((detail as VoipSetPttDetail | undefined)?.active === true);
          break;
        case VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT:
          this.setAudibleParticipantIds(
            Array.isArray((detail as VoipSetAudibleParticipantsDetail | undefined)?.participantIds)
              ? (detail as VoipSetAudibleParticipantsDetail).participantIds!.filter(
                (value): value is string => typeof value === "string",
              )
              : [],
          );
          break;
        case VOIP_SET_LOCAL_PLAYER_ID_EVENT:
          this.setLocalParticipantId(
            typeof (detail as VoipSetLocalPlayerIdDetail | undefined)?.participantId === "string"
              ? (detail as VoipSetLocalPlayerIdDetail).participantId || ""
              : "",
          );
          break;
        case VOIP_SET_VOICE_MODE_EVENT:
          this.setVoiceMode((detail as VoipSetVoiceModeDetail | undefined)?.mode);
          break;
        case VOIP_SET_AUDIO_STATE_EVENT:
          this.setAudioState(
            sanitizeParticipantAudioStates(
              (detail as VoipSetAudioStateDetail | undefined)?.participants,
            ),
          );
          break;
        case VOIP_SET_DEBUG_STATE_EVENT:
          this.setDebugState((detail as VoipSetDebugStateDetail | undefined) || {});
          break;
        default:
          this.log("warn", "received unknown VoIP command", { eventName });
          break;
      }
    };

    const parseNativeEventPayload = (payloadData: unknown): PendingVoipCommand | null => {
      const payload = typeof payloadData === "string"
        ? (() => {
          try {
            return JSON.parse(payloadData) as PendingVoipCommand;
          } catch (error) {
            this.log("error", "failed to parse native VoIP event payload", error);
            return null;
          }
        })()
        : payloadData as PendingVoipCommand | null;

      if (!payload || typeof payload.eventName !== "string") {
        this.log("warn", "ignored malformed native VoIP event payload", payloadData);
        return null;
      }

      return payload;
    };

    const handleNativeEventPayload = (payloadData: unknown) => {
      const payload = parseNativeEventPayload(payloadData);
      if (!payload) {
        return;
      }

      handleCommand(payload.eventName, payload.detail);
    };

    const applyPendingDomCommand = () => {
      const root = document.documentElement;
      if (!root) {
        return;
      }

      const sequence = Number.parseInt(
        root.getAttribute(VOIP_COMMAND_SEQUENCE_ATTR) || "0",
        10,
      );
      if (!Number.isFinite(sequence) || sequence <= this.lastProcessedCommandSequence) {
        return;
      }

      const payloadJson = root.getAttribute(VOIP_COMMAND_PAYLOAD_ATTR);
      if (!payloadJson) {
        return;
      }

      let payload: PendingVoipCommand;
      try {
        payload = JSON.parse(payloadJson) as PendingVoipCommand;
      } catch (error) {
        this.log("error", "failed to parse pending VoIP DOM command", error);
        return;
      }

      if (typeof payload.eventName !== "string" || payload.sequence !== sequence) {
        this.log("warn", "ignored malformed VoIP DOM command", {
          payload,
          sequence,
        });
        return;
      }

      this.lastProcessedCommandSequence = sequence;
      handleCommand(payload.eventName, payload.detail);
    };

    window.__skympDispatchVoipCommand = handleCommand;

    if (typeof window.skyrimPlatform?.addEventListener === "function") {
      window.skyrimPlatform.addEventListener(VOIP_BROWSER_COMMAND_EVENT, (payloadData: unknown) => {
        handleNativeEventPayload(payloadData);
      });
    }

    window.addEventListener("skymp-browser-event", (event: Event) => {
      const detail = (event as CustomEvent<{ data?: unknown; eventName?: unknown }>).detail;
      if (detail?.eventName !== VOIP_BROWSER_COMMAND_EVENT) {
        return;
      }
      handleNativeEventPayload(detail.data);
    });

    const root = document.documentElement;
    if (root && typeof MutationObserver !== "undefined") {
      this.domCommandObserver = new MutationObserver(() => {
        applyPendingDomCommand();
      });
      this.domCommandObserver.observe(root, {
        attributeFilter: [VOIP_COMMAND_PAYLOAD_ATTR, VOIP_COMMAND_SEQUENCE_ATTR],
        attributes: true,
      });
    }

    const pendingQueue = Array.isArray(window.__skympVoipCommandQueue)
      ? window.__skympVoipCommandQueue.splice(0)
      : [];

    for (const pendingCommand of pendingQueue as PendingVoipCommand[]) {
      handleCommand(pendingCommand.eventName, pendingCommand.detail);
      if (typeof pendingCommand.sequence === "number") {
        this.lastProcessedCommandSequence = Math.max(
          this.lastProcessedCommandSequence,
          pendingCommand.sequence,
        );
      }
    }

    applyPendingDomCommand();

    window.addEventListener(VOIP_SET_PTT_EVENT, (event: Event) => {
      handleCommand(VOIP_SET_PTT_EVENT, (event as CustomEvent<VoipSetPttDetail>).detail);
    });
    window.addEventListener(VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT, (event: Event) => {
      handleCommand(
        VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT,
        (event as CustomEvent<VoipSetAudibleParticipantsDetail>).detail,
      );
    });
    window.addEventListener(VOIP_SET_LOCAL_PLAYER_ID_EVENT, (event: Event) => {
      handleCommand(
        VOIP_SET_LOCAL_PLAYER_ID_EVENT,
        (event as CustomEvent<VoipSetLocalPlayerIdDetail>).detail,
      );
    });
    window.addEventListener(VOIP_SET_VOICE_MODE_EVENT, (event: Event) => {
      handleCommand(
        VOIP_SET_VOICE_MODE_EVENT,
        (event as CustomEvent<VoipSetVoiceModeDetail>).detail,
      );
    });
    window.addEventListener(VOIP_SET_AUDIO_STATE_EVENT, (event: Event) => {
      handleCommand(
        VOIP_SET_AUDIO_STATE_EVENT,
        (event as CustomEvent<VoipSetAudioStateDetail>).detail,
      );
    });
    window.addEventListener(VOIP_SET_DEBUG_STATE_EVENT, (event: Event) => {
      handleCommand(
        VOIP_SET_DEBUG_STATE_EVENT,
        (event as CustomEvent<VoipSetDebugStateDetail>).detail,
      );
    });
  }

  private async fetchToken(identity: string): Promise<TokenResponse> {
    try {
      const tokenUrl = new URL("/token", window.location.origin);
      tokenUrl.searchParams.set("identity", identity);

      const response = await fetch(tokenUrl.toString(), {
        cache: "no-store",
        credentials: "omit",
      });
      if (!response.ok) {
        throw new Error(`Token endpoint returned ${response.status}`);
      }

      const tokenResponse = await response.json() as TokenResponse;
      this.patchState({
        expiresAt: tokenResponse.expiresAt,
        roomName: tokenResponse.roomName,
        serverTime: tokenResponse.serverTime,
        tokenFetchStatus: "success",
        wsUrl: tokenResponse.wsUrl,
      });
      this.log("info", "token fetch succeeded", {
        expiresAt: tokenResponse.expiresAt,
        roomName: tokenResponse.roomName,
        serverTime: tokenResponse.serverTime,
        wsUrl: tokenResponse.wsUrl,
      });
      return tokenResponse;
    } catch (error) {
      this.patchState({ tokenFetchStatus: "failed" });
      this.log("error", "token fetch failed", error);
      throw error;
    }
  }

  private startTokenCountdown(serverTimeIso: string, expiresAtIso: string): void {
    if (this.countdownIntervalId !== null) {
      window.clearInterval(this.countdownIntervalId);
    }

    const serverNowMs = Date.parse(serverTimeIso);
    const expiresAtMs = Date.parse(expiresAtIso);
    if (Number.isNaN(serverNowMs) || Number.isNaN(expiresAtMs)) {
      return;
    }

    const serverOffsetMs = serverNowMs - Date.now();

    const updateCountdown = () => {
      const nowMs = Date.now() + serverOffsetMs;
      const remainingSeconds = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
      const warningState =
        remainingSeconds <= 0
          ? "expired"
          : remainingSeconds <= 60
            ? "near-expiry"
            : "normal";

      this.patchState({
        serverTime: new Date(nowMs).toISOString(),
        tokenValidForSeconds: remainingSeconds,
        tokenWarningState: warningState,
      });
    };

    updateCountdown();
    this.countdownIntervalId = window.setInterval(updateCountdown, 1000);
  }

  private async setPttActive(active: boolean): Promise<void> {
    if (active === this.state.pttActive) {
      return;
    }

    this.patchState({ pttActive: active });
    this.log("info", "PTT state changed", { active });
    await this.applyLocalTransmitState("ptt change");
  }

  private setAudibleParticipantIds(participantIds: string[]): void {
    const normalized = toSortedUniqueStrings(participantIds);
    if (JSON.stringify(normalized) === JSON.stringify(this.fallbackAudibleParticipantIds)) {
      return;
    }

    this.fallbackAudibleParticipantIds = normalized;
    this.patchState({
      audibleParticipantIds: normalized,
      participantCountInRange: normalized.length,
    });
    this.log("info", "audible participant set updated", { participantIds: normalized });
    this.applyRemoteAudioPolicy();
    this.updateParticipantState();
  }

  private setLocalParticipantId(participantId: string): void {
    if (!participantId || participantId === this.state.localParticipantId) {
      return;
    }

    if (this.state.identity && this.state.identity !== participantId) {
      this.log("warn", "local participant identity differs from token identity", {
        localParticipantId: participantId,
        tokenIdentity: this.state.identity,
      });
    }

    this.patchState({ localParticipantId: participantId });
    this.updateParticipantState();
  }

  private setVoiceMode(mode: VoiceMode | undefined): void {
    const nextMode = sanitizeVoiceMode(mode);
    if (nextMode === this.state.voiceMode) {
      return;
    }

    this.patchState({ voiceMode: nextMode });
    this.log("info", "voice mode changed", { mode: nextMode });
    this.updateParticipantState();
  }

  private setAudioState(participants: VoipParticipantAudioState[]): void {
    const normalized = sanitizeParticipantAudioStates(participants);
    const fingerprint = JSON.stringify(normalized);
    if (fingerprint === this.lastAudioStateFingerprint) {
      return;
    }
    this.lastAudioStateFingerprint = fingerprint;

    this.participantAudioStateById = new Map(
      normalized.map((participant) => [participant.id, participant] as const),
    );
    this.fallbackAudibleParticipantIds = normalized
      .filter((participant) => participant.audible)
      .map((participant) => participant.id);

    this.patchState({
      audibleParticipantIds: this.fallbackAudibleParticipantIds,
      participantCountInRange: this.fallbackAudibleParticipantIds.length,
    });
    this.log("info", "participant audio state updated", {
      participants: normalized,
    });

    this.applyRemoteAudioPolicy();
    this.updateParticipantState();
  }

  private setDebugState(detail: VoipSetDebugStateDetail): void {
    const nextPositionalAudioEnabled =
      typeof detail.positionalAudioEnabled === "boolean"
        ? detail.positionalAudioEnabled
        : this.state.positionalAudioEnabled;
    const positionalAudioChanged = nextPositionalAudioEnabled !== this.state.positionalAudioEnabled;

    this.patchState({
      participantCountInRange:
        typeof detail.participantCountInRange === "number"
          ? detail.participantCountInRange
          : this.state.participantCountInRange,
      positionalAudioEnabled: nextPositionalAudioEnabled,
      proximityRadius:
        typeof detail.proximityRadius === "number"
          ? detail.proximityRadius
          : this.state.proximityRadius,
      pttKey: typeof detail.pttKey === "string" && detail.pttKey ? detail.pttKey : this.state.pttKey,
      worldOrCell:
        typeof detail.worldOrCell === "string" && detail.worldOrCell
          ? detail.worldOrCell
          : this.state.worldOrCell,
    });

    if (positionalAudioChanged) {
      this.rebuildRemoteAudioGraphs();
      this.updateParticipantState();
    }
  }

  private bindRoomEvents(room: Room): void {
    room.on(RoomEvent.ConnectionStateChanged, (state) => {
      this.patchState({ connectionStatus: String(state) });
      this.log("info", "LiveKit connection state changed", { state: String(state) });
    });

    room.on(RoomEvent.Disconnected, (reason) => {
      this.patchState({ connectionStatus: "disconnected" });
      this.log("warn", "LiveKit disconnected", reason);
    });

    room.on(RoomEvent.ParticipantConnected, (participant) => {
      this.updateParticipantState();
      this.applyRemoteAudioPolicy();
      this.log("info", "remote participant joined", { identity: participant.identity });
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      this.updateParticipantState();
      this.applyRemoteAudioPolicy();
      this.log("info", "remote participant left", { identity: participant.identity });
    });

    room.on(RoomEvent.TrackPublished, (publication, participant) => {
      if (publication.kind !== "audio") {
        return;
      }

      this.applyRemoteAudioPolicy();
      this.updateParticipantState();
      this.log("info", "remote track published", {
        identity: participant.identity,
        trackSid: publication.trackSid,
      });
    });

    room.on(RoomEvent.TrackUnpublished, (publication, participant) => {
      if (publication.kind !== "audio") {
        return;
      }

      this.applyRemoteAudioPolicy();
      this.updateParticipantState();
      this.log("info", "remote track unpublished", {
        identity: participant.identity,
        trackSid: publication.trackSid,
      });
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind !== "audio") {
        return;
      }

      const remoteAudioTrack = track as RemoteAudioTrack;
      const trackKey = `${participant.sid}:${publication.trackSid}`;
      this.remoteAudioElements.set(trackKey, {
        audioElement: null,
        gainNode: null,
        graphMode: "detached",
        participantIdentity: participant.identity || "",
        pannerNode: null,
        sourceNode: null,
        stereoPannerNode: null,
        track: remoteAudioTrack,
      });
      this.patchState({ remoteTrackSubscribed: this.remoteAudioElements.size > 0 });
      this.applyRemoteAudioPolicy();
      this.updateParticipantState();
      this.log("info", "remote track subscribed", {
        identity: participant.identity,
        trackSid: publication.trackSid,
      });
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind !== "audio") {
        return;
      }

      const trackKey = `${participant.sid}:${publication.trackSid}`;
      const remoteEntry = this.remoteAudioElements.get(trackKey);
      if (remoteEntry) {
        this.detachRemoteAudioEntry(remoteEntry);
      } else {
        for (const attachedElement of track.detach()) {
          attachedElement.remove();
        }
      }
      this.remoteAudioElements.delete(trackKey);
      this.patchState({ remoteTrackSubscribed: this.remoteAudioElements.size > 0 });
      this.applyRemoteAudioPolicy();
      this.updateParticipantState();
      this.log("info", "remote track unsubscribed", {
        identity: participant.identity,
        trackSid: publication.trackSid,
      });
    });
  }

  private async bootstrapLocalAudio(): Promise<void> {
    this.patchState({
      getUserMediaSucceeded: null,
      micPermissionStatus: "pending",
    });
    this.log("info", "local audio bootstrap starting", await collectAudioEnvironment());

    let permissionStream: MediaStream | null = null;
    let permissionDeviceLabel = "";

    try {
      permissionStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      permissionDeviceLabel = permissionStream.getAudioTracks()[0]?.label || "";

      this.patchState({
        getUserMediaSucceeded: true,
        micPermissionStatus: "granted",
        selectedInputDeviceLabel: permissionDeviceLabel,
      });
      this.log("info", "getUserMedia succeeded", {
        selectedInputDeviceLabel: permissionDeviceLabel || "(unknown device)",
      });
    } catch (error) {
      const permissionStatus =
        error instanceof DOMException && error.name === "NotAllowedError"
          ? "denied"
          : "failed";
      this.patchState({
        getUserMediaSucceeded: false,
        micPermissionStatus: permissionStatus,
      });
      this.log("error", "getUserMedia failed", error);
      throw error;
    } finally {
      permissionStream?.getTracks().forEach((track) => track.stop());
    }

    this.localTrack = await createLocalAudioTrack();
    const selectedInputDeviceLabel =
      this.localTrack.mediaStreamTrack.label ||
      permissionDeviceLabel ||
      this.state.selectedInputDeviceLabel;

    this.patchState({
      localTrackCreated: true,
      selectedInputDeviceLabel,
    });
    this.log("info", "local track created", {
      selectedInputDeviceLabel: selectedInputDeviceLabel || "(unknown device)",
    });

    this.meterDispose = createMeter(this.localTrack.mediaStreamTrack, (level) => {
      this.patchState({ localSpeakingLevel: level });
    });
  }

  private async publishLocalTrack(): Promise<void> {
    if (!this.room || !this.localTrack) {
      throw new Error("Local track cannot be published before room/local track exist");
    }

    await this.room.localParticipant.publishTrack(this.localTrack);
    this.patchState({
      localPublishState: "published",
      localTrackPublished: true,
    });
    await this.applyLocalTransmitState("publishLocalTrack");
    this.log("info", "local track published");
    this.updateParticipantState();
  }

  private async ensureRoomAudioStarted(reason: string): Promise<void> {
    if (!this.room || this.room.canPlaybackAudio) {
      return;
    }

    try {
      await this.room.startAudio();
      this.log("info", "LiveKit audio playback started", {
        canPlaybackAudio: this.room.canPlaybackAudio,
        reason,
      });
    } catch (error) {
      this.log("warn", "LiveKit audio playback start failed", {
        canPlaybackAudio: this.room.canPlaybackAudio,
        error: stringifyDetails(error),
        reason,
      });
    }
  }

  private updateParticipantState(): void {
    const remoteIdentities = this.room
      ? Array.from(this.room.remoteParticipants.values())
        .map((participant) => participant.identity)
        .filter((identity) => !!identity)
      : [];
    const localIdentity = this.state.localParticipantId || this.state.identity;
    const participantIdentities = toSortedUniqueStrings([
      localIdentity,
      ...remoteIdentities,
      ...Array.from(this.participantAudioStateById.keys()),
    ].filter((identity) => !!identity));

    const subscribedRemoteIdentities = new Set<string>();
    if (this.room) {
      for (const participant of this.room.remoteParticipants.values()) {
        const identity = participant.identity || "";
        if (!identity) {
          continue;
        }

        for (const publication of participant.audioTrackPublications.values()) {
          if (publication.isSubscribed) {
            subscribedRemoteIdentities.add(identity);
            break;
          }
        }
      }
    }

    const participantStates: ParticipantState[] = participantIdentities.map((identity) => {
      const isLocal = identity === localIdentity;
      const audioState = isLocal
        ? null
        : this.getEffectiveAudioStateForParticipant(identity);
      const subscribed = isLocal
        ? this.state.localTrackPublished
        : subscribedRemoteIdentities.has(identity);
      const audibleByPolicy = isLocal
        ? this.state.transmitting
        : audioState?.audible === true;

      return {
        audibleByPolicy,
        distance: isLocal ? 0 : audioState?.distance ?? null,
        gain: isLocal ? (this.state.transmitting ? 1 : 0) : audioState?.gain ?? null,
        graphMode: isLocal ? "local" : this.getRemoteGraphMode(identity),
        identity,
        isLocal,
        joined: isLocal || remoteIdentities.includes(identity),
        mode: isLocal ? this.state.voiceMode : audioState?.mode ?? DEFAULT_VOICE_MODE,
        mutedByPolicy: isLocal ? !this.state.transmitting : !audibleByPolicy,
        pan: isLocal ? 0 : computeDebugPan(audioState?.position, audioState?.distance),
        position: isLocal ? { x: 0, y: 0, z: 0 } : audioState?.position ?? null,
        sameWorldOrCell: isLocal ? true : audioState?.sameWorldOrCell ?? null,
        subscribed,
      };
    });

    this.patchState({
      participantCount: participantIdentities.length,
      participantIdentities,
      participantStates,
      remoteParticipantJoined: remoteIdentities.length > 0,
    });
  }

  private async applyLocalTransmitState(reason: string): Promise<void> {
    if (!this.localTrack) {
      return;
    }

    const shouldTransmit = this.state.localTrackPublished && this.state.pttActive;
    const shouldBeMuted = !shouldTransmit;

    if (shouldBeMuted !== this.state.localTrackMuted) {
      if (shouldBeMuted) {
        await this.localTrack.mute();
      } else {
        await this.localTrack.unmute();
      }
    }

    const stateChanged =
      shouldBeMuted !== this.state.localTrackMuted || shouldTransmit !== this.state.transmitting;
    this.patchState({
      localTrackMuted: shouldBeMuted,
      transmitting: shouldTransmit,
    });
    this.updateParticipantState();

    if (stateChanged) {
      this.log("info", "local transmit state changed", {
        localTrackMuted: shouldBeMuted,
        pttActive: this.state.pttActive,
        reason,
        transmitting: shouldTransmit,
      });
    }
  }

  private applyRemoteAudioPolicy(): void {
    if (!this.room) {
      return;
    }

    for (const participant of this.room.remoteParticipants.values()) {
      const participantIdentity = participant.identity || "";
      if (!participantIdentity) {
        continue;
      }

      const participantAudioState = this.getEffectiveAudioStateForParticipant(participantIdentity);
      const shouldBeAudible = participantAudioState?.audible === true;

      for (const publication of participant.audioTrackPublications.values()) {
        const trackKey = this.getRemoteTrackKey(participant, publication);
        const remoteEntry = this.remoteAudioElements.get(trackKey);

        if (!shouldBeAudible && remoteEntry) {
          this.detachRemoteAudioEntry(remoteEntry);
        }

        const alreadyInDesiredState = shouldBeAudible
          ? publication.subscriptionStatus !== TrackPublication.SubscriptionStatus.Unsubscribed
          : publication.subscriptionStatus === TrackPublication.SubscriptionStatus.Unsubscribed;

        if (!alreadyInDesiredState) {
          publication.setSubscribed(shouldBeAudible);
          this.log("info", "remote participant audio subscription updated", {
            identity: participantIdentity,
            subscribed: shouldBeAudible,
            subscriptionStatus: publication.subscriptionStatus,
            trackSid: publication.trackSid,
          });
        }

        if (shouldBeAudible && remoteEntry) {
          this.attachRemoteAudioEntry(remoteEntry);
          this.applyRemoteAudioState(remoteEntry, participantAudioState);
        }
      }
    }

    this.updateParticipantState();
  }

  private getRemoteTrackKey(
    participant: RemoteParticipant,
    publication: RemoteTrackPublication,
  ): string {
    return `${participant.sid}:${publication.trackSid}`;
  }

  private getRemoteGraphMode(identity: string): VoipParticipantGraphMode {
    for (const remoteEntry of this.remoteAudioElements.values()) {
      if (remoteEntry.participantIdentity === identity) {
        return remoteEntry.graphMode;
      }
    }

    return "detached";
  }

  private getEffectiveAudioStateForParticipant(identity: string): VoipParticipantAudioState | null {
    const audioState = this.participantAudioStateById.get(identity);
    if (audioState) {
      return audioState;
    }

    return this.fallbackAudibleParticipantIds.includes(identity)
      ? createFallbackParticipantAudioState(identity, true)
      : null;
  }

  private attachRemoteAudioEntry(remoteEntry: RemoteAudioEntry): void {
    if (remoteEntry.audioElement && remoteEntry.audioElement.isConnected) {
      this.applyRemoteAudioState(
        remoteEntry,
        this.getEffectiveAudioStateForParticipant(remoteEntry.participantIdentity),
      );
      return;
    }

    const detachedElements = remoteEntry.track.detach();
    for (const detachedElement of Array.isArray(detachedElements) ? detachedElements : [detachedElements]) {
      detachedElement.remove();
    }

    const audioElement = document.createElement("audio");
    audioElement.autoplay = true;
    audioElement.controls = false;
    audioElement.hidden = true;
    audioElement.setAttribute("playsinline", "true");

    remoteEntry.track.attach(audioElement);
    remoteEntry.audioElement = audioElement;
    document.body.appendChild(audioElement);

    this.configureRemoteAudioGraph(remoteEntry);
    this.applyRemoteAudioState(
      remoteEntry,
      this.getEffectiveAudioStateForParticipant(remoteEntry.participantIdentity),
    );

    this.log("info", "remote participant audio policy updated", {
      action: "attached",
      graphMode: remoteEntry.graphMode,
      identity: remoteEntry.participantIdentity,
      positionalAudioEnabled: this.state.positionalAudioEnabled,
    });

    void this.ensureRoomAudioStarted("remote track attached");
    void audioElement.play().catch((error) => {
      this.log("warn", "remote audio autoplay failed", {
        error: stringifyDetails(error),
        identity: remoteEntry.participantIdentity,
      });
      void this.ensureRoomAudioStarted("remote audio autoplay failed");
    });
  }

  private configureRemoteAudioGraph(remoteEntry: RemoteAudioEntry): void {
    this.applyHtmlVolumeMode(remoteEntry);
  }

  private applyHtmlVolumeMode(
    remoteEntry: RemoteAudioEntry,
    reason?: string,
  ): void {
    if (!remoteEntry.audioElement) {
      return;
    }

    const alreadyUsingHtmlVolume =
      remoteEntry.graphMode === "html-volume" &&
      !remoteEntry.sourceNode &&
      !remoteEntry.pannerNode &&
      !remoteEntry.stereoPannerNode &&
      !remoteEntry.gainNode;

    this.teardownRemoteAudioGraph(remoteEntry);
    remoteEntry.graphMode = "html-volume";

    const participantAudioState = this.getEffectiveAudioStateForParticipant(
      remoteEntry.participantIdentity,
    );
    const gain = participantAudioState?.audible ? participantAudioState.gain : 0;
    remoteEntry.audioElement.muted = gain <= 0;
    remoteEntry.audioElement.volume = gain;
    remoteEntry.track.setVolume(gain);

    if (reason && !alreadyUsingHtmlVolume) {
      this.log("warn", "remote audio graph fallback engaged", {
        identity: remoteEntry.participantIdentity,
        playbackAudioContextState: this.playbackAudioContext?.state ?? "none",
        reason,
      });
    }
  }

  private applyRemoteAudioState(
    remoteEntry: RemoteAudioEntry,
    participantAudioState: VoipParticipantAudioState | null,
  ): void {
    if (!remoteEntry.audioElement) {
      return;
    }

    const gain = participantAudioState?.audible ? participantAudioState.gain : 0;
    remoteEntry.graphMode = "html-volume";
    remoteEntry.audioElement.muted = gain <= 0;
    remoteEntry.audioElement.volume = gain;
    remoteEntry.track.setVolume(gain);
  }

  private detachRemoteAudioEntry(remoteEntry: RemoteAudioEntry): void {
    const detachedElements = remoteEntry.track.detach();
    const detachedArray = Array.isArray(detachedElements) ? detachedElements : [detachedElements];
    if (detachedArray.length === 0 && !remoteEntry.audioElement) {
      return;
    }

    if (remoteEntry.audioElement) {
      remoteEntry.audioElement.muted = true;
      remoteEntry.audioElement.volume = 0;
    }
    remoteEntry.track.setVolume(0);
    this.teardownRemoteAudioGraph(remoteEntry);
    for (const detachedElement of detachedArray) {
      detachedElement.remove();
    }
    remoteEntry.audioElement?.remove();
    remoteEntry.audioElement = null;
    remoteEntry.graphMode = "detached";

    this.log("info", "remote participant audio policy updated", {
      action: "detached",
      detachedElements: detachedArray.length,
      identity: remoteEntry.participantIdentity,
    });
  }

  private teardownRemoteAudioGraph(remoteEntry: RemoteAudioEntry): void {
    remoteEntry.sourceNode?.disconnect();
    remoteEntry.pannerNode?.disconnect();
    remoteEntry.stereoPannerNode?.disconnect();
    remoteEntry.gainNode?.disconnect();
    remoteEntry.sourceNode = null;
    remoteEntry.pannerNode = null;
    remoteEntry.stereoPannerNode = null;
    remoteEntry.gainNode = null;
  }

  private rebuildRemoteAudioGraphs(): void {
    for (const remoteEntry of this.remoteAudioElements.values()) {
      const shouldRemainAudible =
        this.getEffectiveAudioStateForParticipant(remoteEntry.participantIdentity)?.audible === true;
      this.detachRemoteAudioEntry(remoteEntry);
      if (shouldRemainAudible) {
        this.attachRemoteAudioEntry(remoteEntry);
      }
    }
  }

  private getPlaybackAudioContext(): AudioContext | null {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    if (!this.playbackAudioContext) {
      this.playbackAudioContext = new AudioContextCtor();
      const listener = this.playbackAudioContext.listener as any;

      if (listener.positionX) {
        listener.positionX.setValueAtTime(0, this.playbackAudioContext.currentTime);
        listener.positionY?.setValueAtTime(0, this.playbackAudioContext.currentTime);
        listener.positionZ?.setValueAtTime(0, this.playbackAudioContext.currentTime);
      } else {
        listener.setPosition?.(0, 0, 0);
      }

      if (listener.forwardX) {
        listener.forwardX.setValueAtTime(0, this.playbackAudioContext.currentTime);
        listener.forwardY?.setValueAtTime(0, this.playbackAudioContext.currentTime);
        listener.forwardZ?.setValueAtTime(-1, this.playbackAudioContext.currentTime);
        listener.upX?.setValueAtTime(0, this.playbackAudioContext.currentTime);
        listener.upY?.setValueAtTime(1, this.playbackAudioContext.currentTime);
        listener.upZ?.setValueAtTime(0, this.playbackAudioContext.currentTime);
      } else {
        listener.setOrientation?.(0, 0, -1, 0, 1, 0);
      }
    }

    return this.playbackAudioContext;
  }

  private log(level: LogLevel, message: string, details?: unknown): void {
    const entry: VoipLogEntry = {
      details: stringifyDetails(details),
      level,
      message,
      timestamp: new Date().toISOString(),
    };

    this.logs.push(entry);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.shift();
    }

    this.callbacks.onLog?.(entry);
    bridgeLog(level, message, details);

    if (level === "error") {
      bridgeError(message, details);
      console.error("[voip-page]", message, details);
    } else if (level === "warn") {
      console.warn("[voip-page]", message, details);
    } else {
      console.log("[voip-page]", message, details);
    }
  }

  private patchState(patch: Partial<VoipState>): void {
    this.state = { ...this.state, ...patch };
    this.emitState();
  }

  private emitState(): void {
    this.callbacks.onStateChange({ ...this.state });
    const bridgePayload: VoipPageMediaState = {
      audibleParticipantIds: this.state.audibleParticipantIds,
      connectionStatus: this.state.connectionStatus,
      getUserMediaSucceeded: this.state.getUserMediaSucceeded,
      localParticipantId: this.state.localParticipantId,
      localPublishState: this.state.localPublishState,
      localTrackCreated: this.state.localTrackCreated,
      localTrackMuted: this.state.localTrackMuted,
      localTrackPublished: this.state.localTrackPublished,
      micPermissionStatus: this.state.micPermissionStatus,
      participantCount: this.state.participantCount,
      participantIdentities: this.state.participantIdentities,
      participantStates: this.state.participantStates,
      positionalAudioEnabled: this.state.positionalAudioEnabled,
      proximityRadius: this.state.proximityRadius,
      pttActive: this.state.pttActive,
      remoteParticipantJoined: this.state.remoteParticipantJoined,
      remoteTrackSubscribed: this.state.remoteTrackSubscribed,
      selectedInputDeviceLabel: this.state.selectedInputDeviceLabel,
      tokenFetchStatus: this.state.tokenFetchStatus,
      tokenWarningState: this.state.tokenWarningState,
      transmitting: this.state.transmitting,
      voiceMode: this.state.voiceMode,
      worldOrCell: this.state.worldOrCell,
      wsUrl: this.state.wsUrl,
    };
    const bridgePayloadJson = JSON.stringify(bridgePayload);
    if (bridgePayloadJson !== this.lastBridgePayloadJson) {
      this.lastBridgePayloadJson = bridgePayloadJson;
      bridgeSend(VOIP_PAGE_MEDIA_STATE_MESSAGE, bridgePayload);
    }
  }

  private countdownIntervalId: number | null = null;
  private domCommandObserver: MutationObserver | null = null;
  private fallbackAudibleParticipantIds: string[] = [];
  private lastAudioStateFingerprint = "";
  private lastBridgePayloadJson = "";
  private lastProcessedCommandSequence = 0;
  private localTrack: LocalAudioTrack | null = null;
  private logs: VoipLogEntry[] = [];
  private meterDispose: (() => void) | null = null;
  private participantAudioStateById = new Map<string, VoipParticipantAudioState>();
  private playbackAudioContext: AudioContext | null = null;
  private remoteAudioElements = new Map<string, RemoteAudioEntry>();
  private room: Room | null = null;
  private started = false;
  private startPromise: Promise<void> | null = null;
  private state = createInitialState();
}
