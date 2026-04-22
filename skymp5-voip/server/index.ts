import {
  areVoipPolicyStatesEqual,
  createDefaultVoipModeRadii,
  createVoipPolicyState,
  VoipActorSnapshot,
} from "../shared/voipProximityEngine";
import {
  createVoipPolicyStatePacket,
  DEFAULT_AUDIO_STATE_UPDATE_INTERVAL_MS,
  DEFAULT_DISTANCE_ATTENUATION_ENABLED,
  DEFAULT_SAY_RADIUS,
  DEFAULT_VOICE_MODE,
  parseVoipClientStatePacket,
  sanitizeBoolean,
  sanitizeRadius,
  sanitizeVoiceMode,
  VoiceMode,
  VoipModeRadii,
  VoipPolicyState,
  VOIP_CLIENT_STATE_PACKET_TYPE,
} from "../shared/voipProtocol";
import {
  ServerPlugin,
  ServerPluginApi,
  ServerPluginModule,
} from "../../skymp5-plugin-api/serverPluginHost";

type VoipServerPluginConfig = {
  audioStateUpdateIntervalMs?: unknown;
  defaultProximityRadius?: unknown;
  distanceAttenuationEnabled?: unknown;
  modeRadii?: unknown;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const sanitizeUpdateIntervalMs = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return DEFAULT_AUDIO_STATE_UPDATE_INTERVAL_MS;
  }

  return Math.max(20, Math.min(5000, Math.round(value)));
};

const readConfiguredRadius = (
  value: unknown,
): number | null => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return sanitizeRadius(value);
};

class VoipServerPlugin implements ServerPlugin {
  public constructor(
    private api: ServerPluginApi,
    config: VoipServerPluginConfig,
  ) {
    const configuredModeRadii = isRecord(config.modeRadii) ? config.modeRadii : {};

    this.defaultProximityRadius = sanitizeRadius(
      config.defaultProximityRadius ?? DEFAULT_SAY_RADIUS,
    );
    this.distanceAttenuationEnabled = sanitizeBoolean(
      config.distanceAttenuationEnabled,
      DEFAULT_DISTANCE_ATTENUATION_ENABLED,
    );
    this.updateIntervalMs = sanitizeUpdateIntervalMs(config.audioStateUpdateIntervalMs);
    this.configuredModeRadii = {
      say: readConfiguredRadius(configuredModeRadii.say),
      whisper: readConfiguredRadius(configuredModeRadii.whisper),
      yell: readConfiguredRadius(configuredModeRadii.yell),
    };

    this.unsubscribeSpawnAllowed = this.api.onSpawnAllowed((userId, profileId) => {
      this.profileIdByUserId.set(userId, profileId);
      this.voiceModeByUserId.set(userId, DEFAULT_VOICE_MODE);
      this.api.log(`registered user ${userId} with voice identity ${profileId}`);
    });
  }

  public systemName = "VoipServerPlugin";

  public disconnect(userId: number): void {
    this.profileIdByUserId.delete(userId);
    this.lastSentStateByUserId.delete(userId);
    this.voiceModeByUserId.delete(userId);
  }

  public customPacket(
    userId: number,
    type: string,
    content: Record<string, unknown>,
  ): void {
    if (type === VOIP_CLIENT_STATE_PACKET_TYPE) {
      const clientState = parseVoipClientStatePacket({
        ...content,
        customPacketType: VOIP_CLIENT_STATE_PACKET_TYPE,
      });
      if (!clientState) {
        return;
      }

      const voiceMode = sanitizeVoiceMode(clientState.voiceMode);
      this.voiceModeByUserId.set(userId, voiceMode);
      this.api.log(`received client state for user ${userId}: voiceMode=${voiceMode}`);
    }
  }

  public async update(): Promise<void> {
    const now = Date.now();
    if (now < this.nextUpdateAt) {
      return;
    }
    this.nextUpdateAt = now + this.updateIntervalMs;

    for (const [userId, profileId] of this.profileIdByUserId.entries()) {
      if (!this.api.isConnected(userId)) {
        this.disconnect(userId);
        continue;
      }

      const actorId = this.api.getUserActor(userId);
      if (!actorId) {
        continue;
      }

      const localPos = this.api.getActorPos(actorId);
      const localWorldOrCell = this.api.getActorCellOrWorld(actorId);
      const localAngleZ = this.api.getActorAngleZ(actorId);
      if (!localPos || localWorldOrCell === null || localAngleZ === null) {
        continue;
      }

      const localVoiceMode = this.getVoiceModeForUser(userId);
      const localModeRadii = this.getModeRadii();
      const remoteActors = new Array<VoipActorSnapshot>();

      for (const [otherUserId, otherProfileId] of this.profileIdByUserId.entries()) {
        if (otherUserId === userId || !this.api.isConnected(otherUserId)) {
          continue;
        }

        const otherActorId = this.api.getUserActor(otherUserId);
        if (!otherActorId) {
          continue;
        }

        const otherPos = this.api.getActorPos(otherActorId);
        const otherWorldOrCell = this.api.getActorCellOrWorld(otherActorId);
        if (!otherPos || otherWorldOrCell === null) {
          continue;
        }

        const otherVoiceMode = this.getVoiceModeForUser(otherUserId);
        remoteActors.push({
          identity: String(otherProfileId),
          position: otherPos,
          radius: this.getModeRadius(otherVoiceMode),
          voiceMode: otherVoiceMode,
          worldOrCell: otherWorldOrCell,
        });
      }

      const nextState: VoipPolicyState = createVoipPolicyState({
        distanceAttenuationEnabled: this.distanceAttenuationEnabled,
        identity: String(profileId),
        listenerAngleZ: localAngleZ,
        localPosition: localPos,
        localVoiceMode,
        localWorldOrCell,
        modeRadii: localModeRadii,
        remoteActors,
      });

      const lastState = this.lastSentStateByUserId.get(userId);
      if (areVoipPolicyStatesEqual(lastState, nextState)) {
        continue;
      }

      this.lastSentStateByUserId.set(userId, nextState);
      const audibleFingerprint = nextState.audibleParticipantIds.join(",");
      const lastAudibleFingerprint = lastState?.audibleParticipantIds?.join(",") ?? "";
      const shouldLog =
        !lastState ||
        lastState.identity !== nextState.identity ||
        lastState.voiceMode !== nextState.voiceMode ||
        lastState.worldOrCell !== nextState.worldOrCell ||
        lastState.proximityRadius !== nextState.proximityRadius ||
        lastAudibleFingerprint !== audibleFingerprint;

      if (shouldLog) {
        this.api.log(
          `sending policy to user ${userId}: identity=${nextState.identity} mode=${nextState.voiceMode} audible=${JSON.stringify(nextState.audibleParticipantIds)} worldOrCell=${nextState.worldOrCell} radius=${nextState.proximityRadius}`,
        );
      }
      this.api.sendCustomPacket(userId, createVoipPolicyStatePacket(nextState));
    }
  }

  private getVoiceModeForUser(userId: number): VoiceMode {
    return this.voiceModeByUserId.get(userId) ?? DEFAULT_VOICE_MODE;
  }

  private getModeRadii(): VoipModeRadii {
    const defaults = createDefaultVoipModeRadii(this.defaultProximityRadius);

    return {
      say: this.configuredModeRadii.say ?? defaults.say,
      whisper: this.configuredModeRadii.whisper ?? defaults.whisper,
      yell: this.configuredModeRadii.yell ?? defaults.yell,
    };
  }

  private getModeRadius(voiceMode: VoiceMode): number {
    return this.getModeRadii()[voiceMode];
  }

  private readonly configuredModeRadii: Partial<VoipModeRadii>;
  private readonly defaultProximityRadius: number;
  private readonly distanceAttenuationEnabled: boolean;
  private readonly lastSentStateByUserId = new Map<number, VoipPolicyState>();
  private nextUpdateAt = 0;
  private readonly profileIdByUserId = new Map<number, number>();
  private readonly unsubscribeSpawnAllowed: (() => void) | null;
  private readonly updateIntervalMs: number;
  private readonly voiceModeByUserId = new Map<number, VoiceMode>();
}

export const pluginId = "voip";

export const createServerPlugin: ServerPluginModule["createServerPlugin"] = (
  api,
  config,
) => {
  return new VoipServerPlugin(api, (config || {}) as VoipServerPluginConfig);
};
