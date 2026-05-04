export const DEFAULT_PROXIMITY_RADIUS = 2000;
export const DEFAULT_WHISPER_RADIUS = 800;
export const DEFAULT_SAY_RADIUS = DEFAULT_PROXIMITY_RADIUS;
export const DEFAULT_YELL_RADIUS = 3000;
export const MIN_PROXIMITY_RADIUS = 0;
export const MAX_PROXIMITY_RADIUS = 100000;
export const DEFAULT_PTT_KEY = "V";
export const DEFAULT_VOICE_MODE = "say" as const;
export const VOICE_MODE_CYCLE_ORDER = ["whisper", "say", "yell"] as const;
export const DEFAULT_AUDIO_STATE_UPDATE_INTERVAL_MS = 100;
export const DEFAULT_DISTANCE_ATTENUATION_ENABLED = true;
export const DEFAULT_DISTANCE_ATTENUATION_CURVE_EXPONENT = 2;
export const DEFAULT_MAX_VOIP_GAIN = 0.8;
export const DEFAULT_POSITIONAL_AUDIO_MODE = "off" as const;
export const DEFAULT_FULL_VOLUME_DISTANCE_RATIO = 0.1;
export const UNKNOWN_WORLD_OR_CELL = "unknown";

export const VOIP_CLIENT_STATE_PACKET_TYPE = "voip:client-state" as const;
export const VOIP_POLICY_STATE_PACKET_TYPE = "voip:policy-state" as const;

export const VOIP_BROWSER_COMMAND_EVENT = "skymp5-voip:command" as const;
export const VOIP_SET_PTT_EVENT = "skymp5-voip:set-ptt" as const;
export const VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT =
  "skymp5-voip:set-audible-participants" as const;
export const VOIP_SET_LOCAL_PLAYER_ID_EVENT =
  "skymp5-voip:set-local-player-id" as const;
export const VOIP_SET_DEBUG_STATE_EVENT = "skymp5-voip:set-debug-state" as const;
export const VOIP_SET_VOICE_MODE_EVENT = "skymp5-voip:set-voice-mode" as const;
export const VOIP_SET_AUDIO_STATE_EVENT = "skymp5-voip:set-audio-state" as const;

export const VOIP_COMMAND_PAYLOAD_ATTR = "data-skymp-voip-command-payload" as const;
export const VOIP_COMMAND_SEQUENCE_ATTR = "data-skymp-voip-command-seq" as const;

export const VOIP_PAGE_ERROR_MESSAGE = "skymp5-voip:page-error" as const;
export const VOIP_PAGE_LOADED_MESSAGE = "skymp5-voip:page-loaded" as const;
export const VOIP_PAGE_LOG_MESSAGE = "skymp5-voip:page-log" as const;
export const VOIP_PAGE_MEDIA_STATE_MESSAGE = "skymp5-voip:page-media-state" as const;

export type VoiceMode = typeof VOICE_MODE_CYCLE_ORDER[number];
export type VoipPageLogLevel = "info" | "warn" | "error";
export type VoipConnectionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "signalReconnecting"
  | "disconnected";
export type VoipIceTransportPolicy = "all" | "relay";
export type VoipLocalPublishState = "published" | "unpublished";
export type VoipMicPermissionStatus =
  | "unknown"
  | "pending"
  | "granted"
  | "denied"
  | "failed";
export type VoipPositionalAudioMode = "off" | "stereo";
export type VoipTokenFetchStatus = "idle" | "fetching" | "success" | "failed";
export type VoipTokenWarningState = "normal" | "near-expiry" | "expired";

export type VoipParticipantPosition = {
  x: number;
  y: number;
  z: number;
};

export type VoipParticipantAudioState = {
  audible: boolean;
  distance: number;
  gain: number;
  id: string;
  mode: VoiceMode;
  position: VoipParticipantPosition;
  sameWorldOrCell?: boolean;
};

export type VoipParticipantGraphMode =
  | "detached"
  | "html-volume"
  | "gain-only"
  | "local"
  | "panner"
  | "stereo";

export type VoipParticipantPolicyState = {
  audibleByPolicy: boolean;
  distance: number | null;
  gain: number | null;
  graphMode?: VoipParticipantGraphMode;
  identity: string;
  isLocal: boolean;
  joined: boolean;
  mode: VoiceMode;
  mutedByPolicy: boolean;
  pan: number | null;
  position: VoipParticipantPosition | null;
  sameWorldOrCell?: boolean | null;
  subscribed: boolean;
};

export type VoipPageLoadedPayload = {
  hasFocus: boolean;
  href: string;
  isSecureContext: boolean;
  mediaDevicesAvailable: boolean;
  page: string;
  visibilityState: string;
};

export type VoipPageMediaState = {
  audibleParticipantIds?: string[];
  connectionStatus?: VoipConnectionStatus;
  getUserMediaSucceeded?: boolean | null;
  iceTransportPolicy?: VoipIceTransportPolicy;
  localParticipantId?: string;
  localPublishState?: VoipLocalPublishState;
  localTrackCreated?: boolean;
  localTrackMuted?: boolean;
  localTrackPublished?: boolean;
  micPermissionStatus?: VoipMicPermissionStatus;
  participantCount?: number;
  participantIdentities?: string[];
  participantStates?: VoipParticipantPolicyState[];
  positionalAudioEnabled?: boolean;
  positionalAudioMode?: VoipPositionalAudioMode;
  proximityRadius?: number | null;
  pttActive?: boolean;
  remoteParticipantJoined?: boolean;
  remoteTrackSubscribed?: boolean;
  selectedInputDeviceLabel?: string;
  tokenFetchStatus?: VoipTokenFetchStatus;
  tokenWarningState?: VoipTokenWarningState;
  transmitting?: boolean;
  voiceMode?: VoiceMode;
  worldOrCell?: string;
  wsUrl?: string;
};

export type VoipSetPttDetail = {
  active?: boolean;
};

export type VoipSetAudibleParticipantsDetail = {
  participantIds?: string[];
};

export type VoipSetLocalPlayerIdDetail = {
  participantId?: string;
};

export type VoipSetVoiceModeDetail = {
  mode?: VoiceMode;
};

export type VoipSetAudioStateDetail = {
  participants?: VoipParticipantAudioState[];
};

export type VoipSetDebugStateDetail = {
  debugUiVisible?: boolean;
  participantCountInRange?: number;
  positionalAudioEnabled?: boolean;
  positionalAudioMode?: VoipPositionalAudioMode;
  proximityRadius?: number;
  pttKey?: string;
  worldOrCell?: string;
};

export type VoipBrowserCommandName =
  | typeof VOIP_SET_AUDIO_STATE_EVENT
  | typeof VOIP_SET_AUDIBLE_PARTICIPANTS_EVENT
  | typeof VOIP_SET_DEBUG_STATE_EVENT
  | typeof VOIP_SET_LOCAL_PLAYER_ID_EVENT
  | typeof VOIP_SET_PTT_EVENT
  | typeof VOIP_SET_VOICE_MODE_EVENT;

export type VoipClientState = {
  voiceMode: VoiceMode;
};

export type VoipClientStatePacket = VoipClientState & {
  customPacketType: typeof VOIP_CLIENT_STATE_PACKET_TYPE;
};

export type VoipPolicyState = {
  audibleParticipantIds: string[];
  identity: string;
  participantCountInRange: number;
  participants: VoipParticipantAudioState[];
  proximityRadius: number;
  voiceMode: VoiceMode;
  worldOrCell: string;
};

export type VoipPolicyStatePacket = VoipPolicyState & {
  customPacketType: typeof VOIP_POLICY_STATE_PACKET_TYPE;
};

export type VoipModeRadii = Record<VoiceMode, number>;

const isObjectRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

export const sanitizeRadius = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_PROXIMITY_RADIUS;
  }

  return Math.max(
    MIN_PROXIMITY_RADIUS,
    Math.min(MAX_PROXIMITY_RADIUS, Math.round(value)),
  );
};

export const sanitizeBoolean = (
  value: unknown,
  defaultValue: boolean,
): boolean => {
  return typeof value === "boolean" ? value : defaultValue;
};

export const sanitizeConnectionStatus = (
  value: unknown,
  fallback: VoipConnectionStatus = "disconnected",
): VoipConnectionStatus => {
  switch (value) {
    case "idle":
    case "connecting":
    case "connected":
    case "reconnecting":
    case "signalReconnecting":
    case "disconnected":
      return value;
    default:
      return fallback;
  }
};

export const sanitizePttKeyName = (value: unknown): string => {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : DEFAULT_PTT_KEY;
};

export const sanitizePositionalAudioMode = (
  value: unknown,
): VoipPositionalAudioMode => {
  return value === "stereo" ? "stereo" : DEFAULT_POSITIONAL_AUDIO_MODE;
};

export const isPositionalAudioModeEnabled = (
  mode: VoipPositionalAudioMode,
): boolean => {
  return mode !== "off";
};

export const resolvePositionalAudioMode = (
  value: {
    positionalAudioEnabled?: unknown;
    positionalAudioMode?: unknown;
  },
  fallback: VoipPositionalAudioMode = DEFAULT_POSITIONAL_AUDIO_MODE,
): VoipPositionalAudioMode => {
  if (value.positionalAudioMode !== undefined) {
    return sanitizePositionalAudioMode(value.positionalAudioMode);
  }

  if (typeof value.positionalAudioEnabled === "boolean") {
    return value.positionalAudioEnabled ? "stereo" : "off";
  }

  return fallback;
};

export const createVoipSetDebugStateDetail = ({
  debugUiVisible,
  participantCountInRange,
  positionalAudioMode,
  proximityRadius,
  pttKey,
  worldOrCell,
}: {
  debugUiVisible?: boolean;
  participantCountInRange?: number;
  positionalAudioMode: VoipPositionalAudioMode;
  proximityRadius?: number | null;
  pttKey?: string;
  worldOrCell?: string;
}): VoipSetDebugStateDetail => {
  return {
    ...(debugUiVisible !== undefined ? { debugUiVisible } : {}),
    ...(participantCountInRange !== undefined ? { participantCountInRange } : {}),
    positionalAudioEnabled: isPositionalAudioModeEnabled(positionalAudioMode),
    positionalAudioMode,
    ...(typeof proximityRadius === "number" ? { proximityRadius } : {}),
    ...(pttKey !== undefined ? { pttKey } : {}),
    ...(worldOrCell !== undefined ? { worldOrCell } : {}),
  };
};

export const sanitizeVoiceMode = (value: unknown): VoiceMode => {
  return typeof value === "string" &&
      (VOICE_MODE_CYCLE_ORDER as readonly string[]).includes(value)
    ? value as VoiceMode
    : DEFAULT_VOICE_MODE;
};

export const cycleVoiceMode = (mode: VoiceMode): VoiceMode => {
  const currentIndex = VOICE_MODE_CYCLE_ORDER.indexOf(mode);
  const nextIndex =
    currentIndex < 0 ? 0 : (currentIndex + 1) % VOICE_MODE_CYCLE_ORDER.length;
  return VOICE_MODE_CYCLE_ORDER[nextIndex];
};

export const toSortedUniqueStrings = (values: string[]): string[] => {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort();
};

export const toWorldOrCellString = (value: number): string => {
  return `0x${value.toString(16)}`;
};

const sanitizeFiniteNumber = (value: unknown, fallback: number): number => {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const sanitizeParticipantPosition = (
  value: unknown,
): VoipParticipantPosition => {
  const position = isObjectRecord(value) ? value : {};

  return {
    x: sanitizeFiniteNumber(position.x, 0),
    y: sanitizeFiniteNumber(position.y, 0),
    z: sanitizeFiniteNumber(position.z, 0),
  };
};

const sanitizeParticipantAudioState = (
  value: unknown,
): VoipParticipantAudioState | null => {
  if (!isObjectRecord(value)) {
    return null;
  }

  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) {
    return null;
  }

  return {
    audible: value.audible === true,
    distance: Math.max(0, sanitizeFiniteNumber(value.distance, 0)),
    gain: Math.max(0, Math.min(1, sanitizeFiniteNumber(value.gain, 0))),
    id,
    mode: sanitizeVoiceMode(value.mode),
    position: sanitizeParticipantPosition(value.position),
    sameWorldOrCell:
      typeof value.sameWorldOrCell === "boolean"
        ? value.sameWorldOrCell
        : undefined,
  };
};

export const sanitizeParticipantAudioStates = (
  values: unknown,
): VoipParticipantAudioState[] => {
  if (!Array.isArray(values)) {
    return [];
  }

  const byId = new Map<string, VoipParticipantAudioState>();
  for (const value of values) {
    const participant = sanitizeParticipantAudioState(value);
    if (!participant) {
      continue;
    }
    byId.set(participant.id, participant);
  }

  return Array.from(byId.values()).sort((left, right) => left.id.localeCompare(right.id));
};

export const createVoipClientStatePacket = (
  voiceMode: VoiceMode,
): VoipClientStatePacket => {
  return {
    customPacketType: VOIP_CLIENT_STATE_PACKET_TYPE,
    voiceMode: sanitizeVoiceMode(voiceMode),
  };
};

export const parseVoipClientStatePacket = (
  payload: Record<string, unknown>,
): VoipClientState | null => {
  if (payload.customPacketType !== VOIP_CLIENT_STATE_PACKET_TYPE) {
    return null;
  }

  return {
    voiceMode: sanitizeVoiceMode(payload.voiceMode),
  };
};

export const createVoipPolicyStatePacket = (
  state: VoipPolicyState,
): VoipPolicyStatePacket => {
  return {
    customPacketType: VOIP_POLICY_STATE_PACKET_TYPE,
    ...state,
    participants: sanitizeParticipantAudioStates(state.participants),
    voiceMode: sanitizeVoiceMode(state.voiceMode),
  };
};

export const parseVoipPolicyStatePacket = (
  payload: Record<string, unknown>,
  fallbackIdentity: string = "",
): VoipPolicyState | null => {
  if (payload.customPacketType !== VOIP_POLICY_STATE_PACKET_TYPE) {
    return null;
  }

  const identity =
    typeof payload.identity === "string"
      ? payload.identity
      : fallbackIdentity;
  const participants = sanitizeParticipantAudioStates(payload.participants);
  const derivedAudibleParticipantIds = participants
    .filter((participant) => participant.audible)
    .map((participant) => participant.id);
  const audibleParticipantIds = Array.isArray(payload.audibleParticipantIds)
    ? toSortedUniqueStrings(
      payload.audibleParticipantIds.filter(
        (value): value is string => typeof value === "string",
      ),
    )
    : derivedAudibleParticipantIds;

  return {
    audibleParticipantIds,
    identity,
    participantCountInRange:
      typeof payload.participantCountInRange === "number"
        ? payload.participantCountInRange
        : derivedAudibleParticipantIds.length,
    participants,
    proximityRadius: sanitizeRadius(payload.proximityRadius),
    voiceMode: sanitizeVoiceMode(payload.voiceMode),
    worldOrCell:
      typeof payload.worldOrCell === "string" && payload.worldOrCell
        ? payload.worldOrCell
        : UNKNOWN_WORLD_OR_CELL,
  };
};
