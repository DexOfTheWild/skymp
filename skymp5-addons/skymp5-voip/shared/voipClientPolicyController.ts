import {
  createVoipSetDebugStateDetail,
  createVoipClientStatePacket,
  cycleVoiceMode,
  DEFAULT_POSITIONAL_AUDIO_MODE,
  DEFAULT_PTT_KEY,
  DEFAULT_VOICE_MODE,
  sanitizePttKeyName,
  sanitizePositionalAudioMode,
  sanitizeVoiceMode,
  UNKNOWN_WORLD_OR_CELL,
  VOIP_SET_AUDIO_STATE_EVENT,
  VOIP_SET_DEBUG_STATE_EVENT,
  VOIP_SET_LOCAL_PLAYER_ID_EVENT,
  VOIP_SET_PTT_EVENT,
  VOIP_SET_VOICE_MODE_EVENT,
  VoiceMode,
  VoipBrowserCommandName,
  VoipClientStatePacket,
  VoipParticipantAudioState,
  VoipPositionalAudioMode,
  VoipPolicyState,
} from "./voipProtocol";

export type VoipClientPolicyRuntimeConfig = {
  positionalAudioMode?: VoipPositionalAudioMode;
  pttKey?: string;
};

export type VoipClientPolicyControllerDeps = {
  dispatchBrowserCommand: (eventName: VoipBrowserCommandName, detail: Record<string, unknown>) => void;
  now?: () => number;
  sendClientStatePacket: (packet: VoipClientStatePacket) => void;
};

export type VoipClientPolicySyncSnapshot = {
  audibleParticipantIds: string[];
  localIdentity: string;
  participantCountInRange: number;
  participants: VoipParticipantAudioState[];
  positionalAudioMode: VoipPositionalAudioMode;
  proximityRadius: number | null;
  pttActive: boolean;
  pttKey: string;
  reason: string;
  voiceMode: VoiceMode;
  worldOrCell: string;
};

export class VoipClientPolicyController {
  public constructor(
    private deps: VoipClientPolicyControllerDeps,
    config: VoipClientPolicyRuntimeConfig = {},
    private heartbeatIntervalMs: number = 1000,
  ) {
    this.setRuntimeConfig(config);
  }

  public setRuntimeConfig(config: VoipClientPolicyRuntimeConfig): void {
    this.positionalAudioMode = sanitizePositionalAudioMode(
      config.positionalAudioMode ?? DEFAULT_POSITIONAL_AUDIO_MODE,
    );
    this.pttKey = sanitizePttKeyName(config.pttKey ?? DEFAULT_PTT_KEY);
  }

  public setLocalIdentity(identity: string): boolean {
    if (!identity || identity === this.localIdentity) {
      return false;
    }

    this.localIdentity = identity;
    return true;
  }

  public resetVoiceMode(): boolean {
    return this.setVoiceMode(DEFAULT_VOICE_MODE);
  }

  public cycleVoiceMode(): VoiceMode {
    const nextMode = cycleVoiceMode(this.voiceMode);
    this.setVoiceMode(nextMode);
    return nextMode;
  }

  public setVoiceMode(mode: VoiceMode): boolean {
    const nextMode = sanitizeVoiceMode(mode);
    if (nextMode === this.voiceMode) {
      return false;
    }

    this.voiceMode = nextMode;
    this.deps.dispatchBrowserCommand(VOIP_SET_VOICE_MODE_EVENT, {
      mode: this.voiceMode,
    });
    this.sendClientState();
    return true;
  }

  public sendClientState(): VoipClientStatePacket | null {
    if (!this.localIdentity) {
      return null;
    }

    const packet = createVoipClientStatePacket(this.voiceMode);
    this.deps.sendClientStatePacket(packet);
    return packet;
  }

  public setPttActive(active: boolean): boolean {
    if (active === this.pttActive) {
      return false;
    }

    this.pttActive = active;
    this.deps.dispatchBrowserCommand(VOIP_SET_PTT_EVENT, { active });
    return true;
  }

  public handlePolicyState(state: VoipPolicyState): void {
    this.lastPolicyState = state;

    const serverVoiceMode = sanitizeVoiceMode(state.voiceMode);
    if (serverVoiceMode !== this.voiceMode) {
      this.voiceMode = serverVoiceMode;
      this.deps.dispatchBrowserCommand(VOIP_SET_VOICE_MODE_EVENT, {
        mode: this.voiceMode,
      });
    }
  }

  public syncBrowserState(reason: string): VoipClientPolicySyncSnapshot | null {
    if (!this.localIdentity) {
      return null;
    }

    const policy = this.lastPolicyState;
    const proximityRadius = policy?.proximityRadius ?? null;
    const worldOrCell = policy?.worldOrCell ?? UNKNOWN_WORLD_OR_CELL;
    const participants = policy?.participants ?? [];
    const audibleParticipantIds =
      policy?.audibleParticipantIds ??
      participants.filter((participant) => participant.audible).map((participant) => participant.id);
    const participantCountInRange =
      policy?.participantCountInRange ??
      participants.filter((participant) => participant.audible).length;

    this.deps.dispatchBrowserCommand(VOIP_SET_LOCAL_PLAYER_ID_EVENT, {
      participantId: this.localIdentity,
    });
    this.deps.dispatchBrowserCommand(VOIP_SET_PTT_EVENT, {
      active: this.pttActive,
    });
    this.deps.dispatchBrowserCommand(VOIP_SET_VOICE_MODE_EVENT, {
      mode: this.voiceMode,
    });
    this.deps.dispatchBrowserCommand(VOIP_SET_AUDIO_STATE_EVENT, {
      participants,
    });
    this.deps.dispatchBrowserCommand(VOIP_SET_DEBUG_STATE_EVENT, createVoipSetDebugStateDetail({
      participantCountInRange,
      positionalAudioMode: this.positionalAudioMode,
      proximityRadius,
      pttKey: this.pttKey,
      worldOrCell,
    }));

    return {
      audibleParticipantIds,
      localIdentity: this.localIdentity,
      participantCountInRange,
      participants,
      positionalAudioMode: this.positionalAudioMode,
      proximityRadius,
      pttActive: this.pttActive,
      pttKey: this.pttKey,
      reason,
      voiceMode: this.voiceMode,
      worldOrCell,
    };
  }

  public maybeHeartbeat(): VoipClientPolicySyncSnapshot | null {
    if (!this.localIdentity) {
      return null;
    }

    const now = this.deps.now ? this.deps.now() : Date.now();
    if (now < this.nextHeartbeatAt) {
      return null;
    }

    this.nextHeartbeatAt = now + this.heartbeatIntervalMs;
    return this.syncBrowserState("heartbeat");
  }

  public getConfiguredPttKeyName(): string {
    return this.pttKey;
  }

  public getLocalIdentity(): string | null {
    return this.localIdentity;
  }

  public getPttActive(): boolean {
    return this.pttActive;
  }

  public getVoiceMode(): VoiceMode {
    return this.voiceMode;
  }

  private lastPolicyState: VoipPolicyState | null = null;
  private localIdentity: string | null = null;
  private nextHeartbeatAt = 0;
  private positionalAudioMode: VoipPositionalAudioMode = DEFAULT_POSITIONAL_AUDIO_MODE;
  private pttActive = false;
  private pttKey = DEFAULT_PTT_KEY;
  private voiceMode: VoiceMode = DEFAULT_VOICE_MODE;
}
