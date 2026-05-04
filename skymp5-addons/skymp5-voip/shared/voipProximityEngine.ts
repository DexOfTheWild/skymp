import {
  DEFAULT_DISTANCE_ATTENUATION_CURVE_EXPONENT,
  DEFAULT_DISTANCE_ATTENUATION_ENABLED,
  DEFAULT_FULL_VOLUME_DISTANCE_RATIO,
  DEFAULT_MAX_VOIP_GAIN,
  DEFAULT_SAY_RADIUS,
  DEFAULT_VOICE_MODE,
  DEFAULT_WHISPER_RADIUS,
  DEFAULT_YELL_RADIUS,
  sanitizeRadius,
  toSortedUniqueStrings,
  toWorldOrCellString,
  VoiceMode,
  VoipModeRadii,
  VoipParticipantAudioState,
  VoipParticipantPosition,
  VoipPolicyState,
} from "./voipProtocol";

export type VoipActorSnapshot = {
  identity: string;
  position: number[];
  radius?: number;
  voiceMode?: VoiceMode;
  worldOrCell: number | string;
};

export type VoipSpatialAudioConfig = {
  distanceAttenuationEnabled?: boolean;
  fullVolumeDistanceRatio?: number;
  modeRadii: VoipModeRadii;
};

const ZERO_POSITION: VoipParticipantPosition = { x: 0, y: 0, z: 0 };

const normalizeWorldOrCell = (value: number | string): string => {
  return typeof value === "number" ? toWorldOrCellString(value) : value;
};

const clamp01 = (value: number): number => {
  return Math.max(0, Math.min(1, value));
};

const roundToStep = (value: number, step: number): number => {
  if (!Number.isFinite(value) || !Number.isFinite(step) || step <= 0) {
    return 0;
  }
  return Math.round(value / step) * step;
};

const quantizeDistance = (distance: number): number => {
  return Math.max(0, roundToStep(distance, 0.01));
};

const quantizeGain = (gain: number): number => {
  return clamp01(roundToStep(gain, 0.001));
};

const quantizePosition = (position: VoipParticipantPosition): VoipParticipantPosition => {
  return {
    x: roundToStep(position.x, 0.1),
    y: roundToStep(position.y, 0.1),
    z: roundToStep(position.z, 0.1),
  };
};

export const normalizeYawRadians = (angleZ: number): number => {
  return Number.isFinite(angleZ) ? angleZ : 0;
};

export const distance3d = (left: number[], right: number[]): number => {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  const dz = left[2] - right[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
};

export const createDefaultVoipModeRadii = (
  sayRadius: number = DEFAULT_SAY_RADIUS,
): VoipModeRadii => {
  return {
    say: sanitizeRadius(sayRadius),
    whisper: sanitizeRadius(DEFAULT_WHISPER_RADIUS),
    yell: sanitizeRadius(DEFAULT_YELL_RADIUS),
  };
};

export const computeVoiceModeRadius = (
  mode: VoiceMode,
  modeRadii: VoipModeRadii,
): number => {
  return sanitizeRadius(modeRadii[mode]);
};

export const computeListenerRelativePosition = ({
  listenerAngleZ,
  listenerPosition,
  sourcePosition,
}: {
  listenerAngleZ: number;
  listenerPosition: number[];
  sourcePosition: number[];
}): VoipParticipantPosition => {
  const deltaX = sourcePosition[0] - listenerPosition[0];
  const deltaY = sourcePosition[1] - listenerPosition[1];
  const deltaZ = sourcePosition[2] - listenerPosition[2];

  const yaw = normalizeYawRadians(listenerAngleZ);
  const sinYaw = Math.sin(yaw);
  const cosYaw = Math.cos(yaw);

  const rightX = cosYaw;
  const rightY = -sinYaw;
  const forwardX = sinYaw;
  const forwardY = cosYaw;

  return {
    x: deltaX * rightX + deltaY * rightY,
    y: deltaX * forwardX + deltaY * forwardY,
    z: deltaZ,
  };
};

export const computeDistanceAttenuationGain = ({
  distance,
  distanceAttenuationEnabled = DEFAULT_DISTANCE_ATTENUATION_ENABLED,
  fullVolumeDistanceRatio = DEFAULT_FULL_VOLUME_DISTANCE_RATIO,
  radius,
}: {
  distance: number;
  distanceAttenuationEnabled?: boolean;
  fullVolumeDistanceRatio?: number;
  radius: number;
}): number => {
  const sanitizedRadius = sanitizeRadius(radius);
  if (sanitizedRadius <= 0 || distance > sanitizedRadius) {
    return 0;
  }

  if (!distanceAttenuationEnabled) {
    return DEFAULT_MAX_VOIP_GAIN;
  }

  const innerRatio = clamp01(fullVolumeDistanceRatio);
  const innerRadius = sanitizedRadius * innerRatio;
  if (distance <= innerRadius || sanitizedRadius === innerRadius) {
    return DEFAULT_MAX_VOIP_GAIN;
  }

  const normalizedDistance = clamp01(
    (distance - innerRadius) / (sanitizedRadius - innerRadius),
  );
  const smooth = normalizedDistance * normalizedDistance * (3 - 2 * normalizedDistance);
  const baseGain = clamp01(1 - smooth);
  return clamp01(
    Math.min(
      DEFAULT_MAX_VOIP_GAIN,
      Math.pow(baseGain, DEFAULT_DISTANCE_ATTENUATION_CURVE_EXPONENT),
    ),
  );
};

const createParticipantAudioState = ({
  distanceAttenuationEnabled,
  fullVolumeDistanceRatio,
  listenerAngleZ,
  listenerPosition,
  listenerWorldOrCell,
  modeRadii,
  speaker,
}: {
  distanceAttenuationEnabled?: boolean;
  fullVolumeDistanceRatio?: number;
  listenerAngleZ: number;
  listenerPosition: number[];
  listenerWorldOrCell: number | string;
  modeRadii: VoipModeRadii;
  speaker: VoipActorSnapshot;
}): VoipParticipantAudioState => {
  const sameWorldOrCell =
    normalizeWorldOrCell(speaker.worldOrCell) === normalizeWorldOrCell(listenerWorldOrCell);
  const mode = speaker.voiceMode ?? DEFAULT_VOICE_MODE;

  if (!sameWorldOrCell) {
    return {
      audible: false,
      distance: 0,
      gain: 0,
      id: speaker.identity,
      mode,
      position: ZERO_POSITION,
      sameWorldOrCell: false,
    };
  }

  const position = computeListenerRelativePosition({
    listenerAngleZ,
    listenerPosition,
    sourcePosition: speaker.position,
  });
  const distance = distance3d(listenerPosition, speaker.position);
  const radius = computeVoiceModeRadius(mode, modeRadii);
  const effectiveRadius = typeof speaker.radius === "number"
    ? sanitizeRadius(speaker.radius)
    : radius;
  const rawGain = computeDistanceAttenuationGain({
    distance,
    distanceAttenuationEnabled,
    fullVolumeDistanceRatio,
    radius: effectiveRadius,
  });
  const gain = quantizeGain(rawGain);

  return {
    audible: gain > 0,
    distance: quantizeDistance(distance),
    gain,
    id: speaker.identity,
    mode,
    position: quantizePosition(position),
    sameWorldOrCell: true,
  };
};

export const computeParticipantAudioStates = ({
  distanceAttenuationEnabled,
  fullVolumeDistanceRatio,
  listenerAngleZ,
  listenerPosition,
  listenerWorldOrCell,
  modeRadii,
  remoteActors,
}: {
  distanceAttenuationEnabled?: boolean;
  fullVolumeDistanceRatio?: number;
  listenerAngleZ: number;
  listenerPosition: number[];
  listenerWorldOrCell: number | string;
  modeRadii: VoipModeRadii;
  remoteActors: VoipActorSnapshot[];
}): VoipParticipantAudioState[] => {
  return remoteActors
    .filter((actor) => typeof actor.identity === "string" && actor.identity.length > 0)
    .map((speaker) => {
      return createParticipantAudioState({
        distanceAttenuationEnabled,
        fullVolumeDistanceRatio,
        listenerAngleZ,
        listenerPosition,
        listenerWorldOrCell,
        modeRadii,
        speaker,
      });
    })
    .sort((left, right) => left.id.localeCompare(right.id));
};

export const computeAudibleParticipantIds = ({
  distanceAttenuationEnabled,
  fullVolumeDistanceRatio,
  listenerAngleZ,
  localPosition,
  localWorldOrCell,
  modeRadii,
  remoteActors,
}: {
  distanceAttenuationEnabled?: boolean;
  fullVolumeDistanceRatio?: number;
  listenerAngleZ: number;
  localPosition: number[];
  localWorldOrCell: number | string;
  modeRadii: VoipModeRadii;
  remoteActors: VoipActorSnapshot[];
}): string[] => {
  const participants = computeParticipantAudioStates({
    distanceAttenuationEnabled,
    fullVolumeDistanceRatio,
    listenerAngleZ,
    listenerPosition: localPosition,
    listenerWorldOrCell: localWorldOrCell,
    modeRadii,
    remoteActors,
  });

  return toSortedUniqueStrings(
    participants
      .filter((participant) => participant.audible)
      .map((participant) => participant.id),
  );
};

export const createVoipPolicyState = ({
  distanceAttenuationEnabled,
  fullVolumeDistanceRatio,
  identity,
  listenerAngleZ,
  localPosition,
  localVoiceMode = DEFAULT_VOICE_MODE,
  localWorldOrCell,
  modeRadii,
  remoteActors,
}: {
  distanceAttenuationEnabled?: boolean;
  fullVolumeDistanceRatio?: number;
  identity: string;
  listenerAngleZ: number;
  localPosition: number[];
  localVoiceMode?: VoiceMode;
  localWorldOrCell: number | string;
  modeRadii: VoipModeRadii;
  remoteActors: VoipActorSnapshot[];
}): VoipPolicyState => {
  const participants = computeParticipantAudioStates({
    distanceAttenuationEnabled,
    fullVolumeDistanceRatio,
    listenerAngleZ,
    listenerPosition: localPosition,
    listenerWorldOrCell: localWorldOrCell,
    modeRadii,
    remoteActors,
  });
  const audibleParticipantIds = toSortedUniqueStrings(
    participants
      .filter((participant) => participant.audible)
      .map((participant) => participant.id),
  );

  return {
    audibleParticipantIds,
    identity,
    participantCountInRange: audibleParticipantIds.length,
    participants,
    proximityRadius: computeVoiceModeRadius(localVoiceMode, modeRadii),
    voiceMode: localVoiceMode,
    worldOrCell: normalizeWorldOrCell(localWorldOrCell),
  };
};

export const areVoipPolicyStatesEqual = (
  left: VoipPolicyState | undefined | null,
  right: VoipPolicyState,
): boolean => {
  if (!left) {
    return false;
  }

  return (
    left.identity === right.identity &&
    left.participantCountInRange === right.participantCountInRange &&
    left.proximityRadius === right.proximityRadius &&
    left.voiceMode === right.voiceMode &&
    left.worldOrCell === right.worldOrCell &&
    JSON.stringify(left.audibleParticipantIds) === JSON.stringify(right.audibleParticipantIds) &&
    JSON.stringify(left.participants) === JSON.stringify(right.participants)
  );
};
