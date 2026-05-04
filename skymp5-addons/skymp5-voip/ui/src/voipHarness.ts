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
  DEFAULT_POSITIONAL_AUDIO_MODE,
  DEFAULT_PTT_KEY,
  DEFAULT_VOICE_MODE,
  isPositionalAudioModeEnabled,
  sanitizeConnectionStatus,
  VoipConnectionStatus,
  VoipIceTransportPolicy,
  VoipLocalPublishState,
  VoipMicPermissionStatus,
  sanitizeParticipantAudioStates,
  resolvePositionalAudioMode,
  sanitizeVoiceMode,
  VoipTokenFetchStatus,
  VoipTokenWarningState,
  VOIP_SET_AUDIO_STATE_EVENT,
  VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT,
  VOIP_SET_DEBUG_STATE_EVENT,
  VOIP_SET_LOCAL_PLAYER_ID_EVENT,
  VOIP_SET_PTT_EVENT,
  VOIP_SET_VOICE_MODE_EVENT,
  VoiceMode,
  VoipPageLogLevel,
  VoipPageMediaState,
  VoipParticipantAudioState,
  VoipParticipantGraphMode,
  VoipParticipantPolicyState,
  VoipParticipantPosition,
  VoipPositionalAudioMode,
  VoipSetAudioStateDetail,
  VoipSetAudibleParticipantsDetail,
  VoipSetDebugStateDetail,
  VoipSetLocalPlayerIdDetail,
  VoipSetPttDetail,
  VoipSetVoiceModeDetail,
} from "../../shared/voipProtocol";
import {
  computeStereoPan,
  getStereoGraphSupport,
  selectRemoteAudioGraphMode,
} from "./positionalAudio";
import {
  bridgeError,
  bridgeLog,
  bridgeMediaState,
  PendingVoipCommand,
  readIceTransportPolicyFromQuery,
  registerVoipPageCommandBridge,
} from "./voipPageBridge";

declare global {
  interface Window {
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

type VoipHarnessOptions = {
  forceAudibleParticipants?: boolean;
};

type RemoteAudioEntry = {
  audioElement: HTMLAudioElement | null;
  gainNode: GainNode | null;
  graphMode: VoipParticipantGraphMode;
  participantIdentity: string;
  sourceNode: MediaElementAudioSourceNode | null;
  stereoPannerNode: StereoPannerNode | null;
  track: RemoteAudioTrack;
};

export type VoipState = {
  audibleParticipantIds: string[];
  connectionStatus: VoipConnectionStatus;
  debugUiVisible: boolean;
  expiresAt: string;
  getUserMediaSucceeded: boolean | null;
  iceTransportPolicy: VoipIceTransportPolicy;
  identity: string;
  localParticipantId: string;
  localPublishState: VoipLocalPublishState;
  localSpeakingLevel: number;
  localTrackCreated: boolean;
  localTrackMuted: boolean;
  localTrackPublished: boolean;
  micPermissionStatus: VoipMicPermissionStatus;
  participantCount: number;
  participantCountInRange: number;
  participantIdentities: string[];
  participantStates: ParticipantState[];
  positionalAudioMode: VoipPositionalAudioMode;
  proximityRadius: number | null;
  pttActive: boolean;
  pttKey: string;
  remoteParticipantJoined: boolean;
  remoteTrackSubscribed: boolean;
  roomName: string;
  selectedInputDeviceLabel: string;
  serverTime: string;
  tokenFetchStatus: VoipTokenFetchStatus;
  tokenValidForSeconds: number | null;
  tokenWarningState: VoipTokenWarningState;
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
  debugUiVisible: false,
  expiresAt: "",
  getUserMediaSucceeded: null,
  iceTransportPolicy: "all",
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
  positionalAudioMode: DEFAULT_POSITIONAL_AUDIO_MODE,
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

const toSortedUniqueStrings = (values: string[]): string[] => {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort();
};

const areStringListsEqual = (left: string[], right: string[]): boolean => {
  if (left.length !== right.length) {
    return false;
  }

  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }

  return true;
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
  return position ? computeStereoPan(position, distance) : null;
};

const buildBridgeMediaState = (state: VoipState): VoipPageMediaState => {
  return {
    audibleParticipantIds: state.audibleParticipantIds,
    connectionStatus: state.connectionStatus,
    getUserMediaSucceeded: state.getUserMediaSucceeded,
    iceTransportPolicy: state.iceTransportPolicy,
    localParticipantId: state.localParticipantId,
    localPublishState: state.localPublishState,
    localTrackCreated: state.localTrackCreated,
    localTrackMuted: state.localTrackMuted,
    localTrackPublished: state.localTrackPublished,
    micPermissionStatus: state.micPermissionStatus,
    participantCount: state.participantCount,
    participantIdentities: state.participantIdentities,
    participantStates: state.participantStates,
    positionalAudioEnabled: isPositionalAudioModeEnabled(state.positionalAudioMode),
    positionalAudioMode: state.positionalAudioMode,
    proximityRadius: state.proximityRadius,
    pttActive: state.pttActive,
    remoteParticipantJoined: state.remoteParticipantJoined,
    remoteTrackSubscribed: state.remoteTrackSubscribed,
    selectedInputDeviceLabel: state.selectedInputDeviceLabel,
    tokenFetchStatus: state.tokenFetchStatus,
    tokenWarningState: state.tokenWarningState,
    transmitting: state.transmitting,
    voiceMode: state.voiceMode,
    worldOrCell: state.worldOrCell,
    wsUrl: state.wsUrl,
  };
};

export class VoipHarness {
  public constructor(
    private callbacks: VoipCallbacks,
    private options: VoipHarnessOptions = {},
  ) {
    this.commandBridgeDispose = registerVoipPageCommandBridge({
      onCommand: (command) => this.handleIncomingCommand(command),
      onParseError: (message, details) => this.log("error", message, details),
    });
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

  public async setDebugPttActive(active: boolean): Promise<void> {
    await this.setPttActive(active);
  }

  public dispose(): void {
    if (this.commandBridgeDispose) {
      this.commandBridgeDispose();
      this.commandBridgeDispose = null;
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

    const iceTransportPolicy = readIceTransportPolicyFromQuery();
    this.patchState({
      iceTransportPolicy,
      identity,
      tokenFetchStatus: "fetching",
    });
    this.log("info", "fetching token", {
      iceTransportPolicy,
      identity,
    });

    const tokenResponse = await this.fetchToken(identity);
    this.startTokenCountdown(tokenResponse.serverTime, tokenResponse.expiresAt);

    this.room = new Room({
      webAudioMix: false,
    });
    this.bindRoomEvents(this.room);

    const connectOptions =
      iceTransportPolicy === "relay"
        ? {
          rtcConfig: {
            iceTransportPolicy: "relay" as RTCIceTransportPolicy,
          },
        }
        : undefined;
    this.patchState({ connectionStatus: "connecting" });
    this.log("info", "connecting to LiveKit room", {
      connectOptions,
      iceTransportPolicy,
      roomName: tokenResponse.roomName,
      wsUrl: tokenResponse.wsUrl,
    });

    await this.room.connect(tokenResponse.wsUrl, tokenResponse.token, connectOptions);
    this.log("info", "LiveKit connected", {
      iceTransportPolicy,
      roomName: tokenResponse.roomName,
      wsUrl: tokenResponse.wsUrl,
    });

    await this.bootstrapLocalAudio();
    await this.ensureRoomAudioStarted("local audio bootstrap");
    await this.publishLocalTrack();
  }

  private handleIncomingCommand(command: PendingVoipCommand): void {
    if (
      typeof command.sequence === "number" &&
      Number.isFinite(command.sequence)
    ) {
      if (command.sequence <= this.lastProcessedCommandSequence) {
        return;
      }
      this.lastProcessedCommandSequence = command.sequence;
    }

    switch (command.eventName) {
      case VOIP_SET_PTT_EVENT:
        void this.setPttActive((command.detail as VoipSetPttDetail | undefined)?.active === true);
        break;
      case VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT:
        this.setAudibleParticipantIds(
          Array.isArray((command.detail as VoipSetAudibleParticipantsDetail | undefined)?.participantIds)
            ? (command.detail as VoipSetAudibleParticipantsDetail).participantIds!.filter(
              (value): value is string => typeof value === "string",
            )
            : [],
        );
        break;
      case VOIP_SET_LOCAL_PLAYER_ID_EVENT:
        this.setLocalParticipantId(
          typeof (command.detail as VoipSetLocalPlayerIdDetail | undefined)?.participantId === "string"
            ? (command.detail as VoipSetLocalPlayerIdDetail).participantId || ""
            : "",
        );
        break;
      case VOIP_SET_VOICE_MODE_EVENT:
        this.setVoiceMode((command.detail as VoipSetVoiceModeDetail | undefined)?.mode);
        break;
      case VOIP_SET_AUDIO_STATE_EVENT:
        this.setAudioState(
          sanitizeParticipantAudioStates(
            (command.detail as VoipSetAudioStateDetail | undefined)?.participants,
          ),
        );
        break;
      case VOIP_SET_DEBUG_STATE_EVENT:
        this.setDebugState((command.detail as VoipSetDebugStateDetail | undefined) || {});
        break;
      default:
        this.log("warn", "received unknown VoIP command", {
          eventName: command.eventName,
        });
        break;
    }
  }

  private async fetchToken(identity: string): Promise<TokenResponse> {
    try {
      const tokenUrl = new URL("/token", window.location.origin);
      tokenUrl.searchParams.set("identity", identity);

        const response = await fetch(tokenUrl.toString(), {
          cache: "no-store",
          credentials: "same-origin",
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
    if (areStringListsEqual(normalized, this.policyAudibleParticipantIds)) {
      return;
    }

    this.policyAudibleParticipantIds = normalized;
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
    this.policyAudibleParticipantIds = normalized
      .filter((participant) => participant.audible)
      .map((participant) => participant.id);

    this.patchState({
      audibleParticipantIds: this.policyAudibleParticipantIds,
      participantCountInRange: this.policyAudibleParticipantIds.length,
    });
    this.log("info", "participant audio state updated", {
      participants: normalized,
    });

    this.applyRemoteAudioPolicy();
    this.updateParticipantState();
  }

  private setDebugState(detail: VoipSetDebugStateDetail): void {
    const nextPositionalAudioMode = resolvePositionalAudioMode(
      detail,
      this.state.positionalAudioMode,
    );
    const positionalAudioChanged = nextPositionalAudioMode !== this.state.positionalAudioMode;

    this.patchState({
      debugUiVisible:
        typeof detail.debugUiVisible === "boolean"
          ? detail.debugUiVisible
          : this.state.debugUiVisible,
      participantCountInRange:
        typeof detail.participantCountInRange === "number"
          ? detail.participantCountInRange
          : this.state.participantCountInRange,
      positionalAudioMode: nextPositionalAudioMode,
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
      const connectionStatus = sanitizeConnectionStatus(String(state), this.state.connectionStatus);
      this.patchState({ connectionStatus });
      this.log("info", "LiveKit connection state changed", { state: connectionStatus });
    });

    room.on(RoomEvent.Reconnecting, () => {
      this.log("warn", "LiveKit reconnecting");
    });

    room.on(RoomEvent.Reconnected, () => {
      this.log("info", "LiveKit reconnected");
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
    if (!this.room) {
      return;
    }

    if (!this.room.canPlaybackAudio) {
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

    await this.ensurePlaybackAudioContextStarted(reason);
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

    const effectiveAudibleParticipantIds = this.options.forceAudibleParticipants
      ? toSortedUniqueStrings(remoteIdentities)
      : this.state.audibleParticipantIds;

    this.patchState({
      audibleParticipantIds: effectiveAudibleParticipantIds,
      participantCount: participantIdentities.length,
      participantCountInRange: effectiveAudibleParticipantIds.length,
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
    if (this.options.forceAudibleParticipants) {
      return createFallbackParticipantAudioState(identity, true);
    }

    const audioState = this.participantAudioStateById.get(identity);
    if (audioState) {
      return audioState;
    }

    return this.policyAudibleParticipantIds.includes(identity)
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

    const audioElement = this.replaceRemoteAudioElement(remoteEntry);

    this.configureRemoteAudioGraph(remoteEntry);
    this.applyRemoteAudioState(
      remoteEntry,
      this.getEffectiveAudioStateForParticipant(remoteEntry.participantIdentity),
    );

    this.log("info", "remote participant audio policy updated", {
      action: "attached",
      graphMode: remoteEntry.graphMode,
      identity: remoteEntry.participantIdentity,
      positionalAudioMode: this.state.positionalAudioMode,
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

  private createRemoteAudioElement(): HTMLAudioElement {
    const audioElement = document.createElement("audio");
    audioElement.autoplay = true;
    audioElement.controls = false;
    audioElement.hidden = true;
    audioElement.setAttribute("playsinline", "true");
    return audioElement;
  }

  private replaceRemoteAudioElement(remoteEntry: RemoteAudioEntry): HTMLAudioElement {
    this.teardownRemoteAudioGraph(remoteEntry);

    const detachedElements = remoteEntry.track.detach();
    for (const detachedElement of Array.isArray(detachedElements) ? detachedElements : [detachedElements]) {
      detachedElement.remove();
    }

    remoteEntry.audioElement?.remove();

    const audioElement = this.createRemoteAudioElement();
    remoteEntry.track.attach(audioElement);
    remoteEntry.audioElement = audioElement;
    document.body.appendChild(audioElement);
    return audioElement;
  }

  private configureRemoteAudioGraph(remoteEntry: RemoteAudioEntry): void {
    const requestedMode = this.state.positionalAudioMode;
    if (requestedMode === "off") {
      this.applyHtmlVolumeMode(remoteEntry);
      return;
    }

    const audioContext = this.getPlaybackAudioContext();
    const selection = selectRemoteAudioGraphMode({
      requestedMode,
      support: getStereoGraphSupport(audioContext),
    });
    if (selection.graphMode !== "stereo" || !audioContext) {
      this.applyHtmlVolumeMode(remoteEntry, selection.fallbackReason || undefined);
      return;
    }

    this.applyStereoPositionalMode(remoteEntry, audioContext);
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

  private applyStereoPositionalMode(
    remoteEntry: RemoteAudioEntry,
    audioContext: AudioContext,
  ): void {
    if (!remoteEntry.audioElement) {
      return;
    }

    const alreadyUsingStereo =
      remoteEntry.graphMode === "stereo" &&
      !!remoteEntry.sourceNode &&
      !!remoteEntry.gainNode &&
      !!remoteEntry.stereoPannerNode;

    if (!alreadyUsingStereo) {
      this.teardownRemoteAudioGraph(remoteEntry);

      try {
        const sourceNode = audioContext.createMediaElementSource(remoteEntry.audioElement);
        const gainNode = audioContext.createGain();
        const stereoPannerNode = audioContext.createStereoPanner();

        sourceNode.connect(gainNode);
        gainNode.connect(stereoPannerNode);
        stereoPannerNode.connect(audioContext.destination);

        remoteEntry.sourceNode = sourceNode;
        remoteEntry.gainNode = gainNode;
        remoteEntry.stereoPannerNode = stereoPannerNode;
      } catch (error) {
        this.fallbackRemoteAudioEntryToHtmlVolume(
          remoteEntry,
          `stereo graph setup failed: ${stringifyDetails(error) || "unknown error"}`,
        );
        return;
      }
    }

    remoteEntry.graphMode = "stereo";
    remoteEntry.audioElement.muted = false;
    remoteEntry.audioElement.volume = 1;
    remoteEntry.track.setVolume(1);
  }

  private fallbackRemoteAudioEntryToHtmlVolume(
    remoteEntry: RemoteAudioEntry,
    reason: string,
  ): void {
    this.replaceRemoteAudioElement(remoteEntry);
    this.applyHtmlVolumeMode(remoteEntry, reason);
    void remoteEntry.audioElement?.play().catch((error) => {
      this.log("warn", "remote audio fallback playback start failed", {
        error: stringifyDetails(error),
        identity: remoteEntry.participantIdentity,
        reason,
      });
    });
  }

  private applyRemoteAudioState(
    remoteEntry: RemoteAudioEntry,
    participantAudioState: VoipParticipantAudioState | null,
  ): void {
    if (!remoteEntry.audioElement) {
      return;
    }

    const gain = participantAudioState?.audible ? participantAudioState.gain : 0;
    if (
      remoteEntry.graphMode === "stereo" &&
      remoteEntry.gainNode &&
      remoteEntry.stereoPannerNode
    ) {
      remoteEntry.audioElement.muted = false;
      remoteEntry.audioElement.volume = 1;
      remoteEntry.track.setVolume(1);
      remoteEntry.gainNode.gain.value = gain;
      remoteEntry.stereoPannerNode.pan.value = computeStereoPan(
        participantAudioState?.position,
        participantAudioState?.distance,
      );
      return;
    }

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
    remoteEntry.stereoPannerNode?.disconnect();
    remoteEntry.gainNode?.disconnect();
    remoteEntry.sourceNode = null;
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

    if (!this.playbackAudioContext || this.playbackAudioContext.state === "closed") {
      try {
        this.playbackAudioContext = new AudioContextCtor();
      } catch (error) {
        this.log("warn", "failed to create positional audio context", {
          error: stringifyDetails(error),
        });
        return null;
      }
    }

    return this.playbackAudioContext;
  }

  private async ensurePlaybackAudioContextStarted(reason: string): Promise<void> {
    const audioContext = this.playbackAudioContext;
    if (!audioContext || audioContext.state !== "suspended") {
      return;
    }

    try {
      await audioContext.resume();
    } catch (error) {
      const fallbackReason = `AudioContext resume failed: ${stringifyDetails(error) || "unknown error"}`;
      this.log("warn", "positional audio context resume failed", {
        error: stringifyDetails(error),
        reason,
        state: audioContext.state,
      });

      for (const remoteEntry of this.remoteAudioElements.values()) {
        if (remoteEntry.graphMode === "stereo" && remoteEntry.audioElement) {
          this.fallbackRemoteAudioEntryToHtmlVolume(remoteEntry, fallbackReason);
          this.applyRemoteAudioState(
            remoteEntry,
            this.getEffectiveAudioStateForParticipant(remoteEntry.participantIdentity),
          );
        }
      }
      this.updateParticipantState();
    }
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
    const bridgePayload = buildBridgeMediaState(this.state);
    const bridgePayloadJson = JSON.stringify(bridgePayload);
    if (bridgePayloadJson !== this.lastBridgePayloadJson) {
      this.lastBridgePayloadJson = bridgePayloadJson;
      bridgeMediaState(bridgePayload);
    }
  }

  private commandBridgeDispose: (() => void) | null = null;
  private countdownIntervalId: number | null = null;
  private policyAudibleParticipantIds: string[] = [];
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
