import {
  sanitizePttKeyName,
  sanitizePositionalAudioMode,
  VoipPositionalAudioMode,
} from "../shared/voipProtocol";
import { ClientAddonApi } from "../../../skymp5-addons-api/clientAddonHost";

export type VoipClientSettings = {
  enabled: boolean;
  positionalAudioMode: VoipPositionalAudioMode;
  pttKey: string;
  rawUiUrl: string;
  uiUrl: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const readSettingsGroup = (settingsGroup: unknown): Record<string, unknown> => {
  return isRecord(settingsGroup) ? settingsGroup as Record<string, unknown> : {};
};

export const readVoipClientSettings = (
  api: Pick<ClientAddonApi, "getSettingsScope">,
): VoipClientSettings => {
  const addonSettings = readSettingsGroup(api.getSettingsScope("skymp5-voip"));

  const readString = (key: string): string => {
    const addonValue = addonSettings[key];
    if (typeof addonValue === "string" && addonValue.trim()) {
      return addonValue.trim();
    }

    return "";
  };

  return {
    enabled: addonSettings.enabled === true,
    positionalAudioMode: sanitizePositionalAudioMode(addonSettings.positionalAudioMode),
    pttKey: sanitizePttKeyName(addonSettings.pttKey),
    rawUiUrl: readString("rawUiUrl"),
    uiUrl: readString("uiUrl"),
  };
};
