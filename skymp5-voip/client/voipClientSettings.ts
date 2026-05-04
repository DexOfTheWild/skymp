import {
  sanitizePttKeyName,
  sanitizePositionalAudioMode,
  VoipPositionalAudioMode,
} from "../shared/voipProtocol";
import { ClientPluginApi } from "../../skymp5-plugin-api/clientPluginHost";

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
  api: Pick<ClientPluginApi, "getSettingsScope">,
): VoipClientSettings => {
  const pluginSettings = readSettingsGroup(api.getSettingsScope("skymp5-voip"));

  const readString = (key: string): string => {
    const pluginValue = pluginSettings[key];
    if (typeof pluginValue === "string" && pluginValue.trim()) {
      return pluginValue.trim();
    }

    return "";
  };

  return {
    enabled: pluginSettings.enabled === true,
    positionalAudioMode: sanitizePositionalAudioMode(pluginSettings.positionalAudioMode),
    pttKey: sanitizePttKeyName(pluginSettings.pttKey),
    rawUiUrl: readString("rawUiUrl"),
    uiUrl: readString("uiUrl"),
  };
};
