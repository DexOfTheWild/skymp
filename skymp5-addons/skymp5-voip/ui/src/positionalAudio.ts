import {
  VoipParticipantGraphMode,
  VoipParticipantPosition,
  VoipPositionalAudioMode,
} from "../../shared/voipProtocol";

export type StereoGraphSupport = {
  hasAudioContext: boolean;
  hasCreateGain: boolean;
  hasCreateMediaElementSource: boolean;
  hasCreateStereoPanner: boolean;
};

export type StereoGraphSelection = {
  fallbackReason: string | null;
  graphMode: Extract<VoipParticipantGraphMode, "html-volume" | "stereo">;
};

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(max, value));
};

export const computeStereoPan = (
  position: VoipParticipantPosition | null | undefined,
  distance: number | null | undefined,
): number => {
  if (!position) {
    return 0;
  }

  const effectiveDistance = distance && distance > 0
    ? distance
    : Math.sqrt(position.x * position.x + position.y * position.y + position.z * position.z);
  if (effectiveDistance <= 0) {
    return 0;
  }

  return clamp(position.x / Math.max(effectiveDistance, 0.001), -1, 1);
};

export const getStereoGraphSupport = (
  audioContext:
    | {
      createGain?: () => unknown;
      createMediaElementSource?: (element: HTMLMediaElement) => unknown;
      createStereoPanner?: () => unknown;
    }
    | null
    | undefined,
): StereoGraphSupport => {
  return {
    hasAudioContext: !!audioContext,
    hasCreateGain: typeof audioContext?.createGain === "function",
    hasCreateMediaElementSource: typeof audioContext?.createMediaElementSource === "function",
    hasCreateStereoPanner: typeof audioContext?.createStereoPanner === "function",
  };
};

export const selectRemoteAudioGraphMode = ({
  requestedMode,
  support,
}: {
  requestedMode: VoipPositionalAudioMode;
  support: StereoGraphSupport;
}): StereoGraphSelection => {
  if (requestedMode === "off") {
    return {
      fallbackReason: null,
      graphMode: "html-volume",
    };
  }

  if (!support.hasAudioContext) {
    return {
      fallbackReason: "AudioContext unavailable",
      graphMode: "html-volume",
    };
  }

  if (!support.hasCreateMediaElementSource) {
    return {
      fallbackReason: "AudioContext.createMediaElementSource unavailable",
      graphMode: "html-volume",
    };
  }

  if (!support.hasCreateGain) {
    return {
      fallbackReason: "AudioContext.createGain unavailable",
      graphMode: "html-volume",
    };
  }

  if (!support.hasCreateStereoPanner) {
    return {
      fallbackReason: "AudioContext.createStereoPanner unavailable",
      graphMode: "html-volume",
    };
  }

  return {
    fallbackReason: null,
    graphMode: "stereo",
  };
};
