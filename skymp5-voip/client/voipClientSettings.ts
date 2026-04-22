import {
  sanitizePttKeyName,
  sanitizeBoolean,
} from "../shared/voipProtocol";
import { ClientPluginApi } from "../../skymp5-plugin-api/clientPluginHost";

export type VoipClientSettings = {
  enabled: boolean;
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

// TODO: remove the legacy skymp5-client fallback after existing local setups
// migrate to the plugin-owned skymp5-voip scope.
// New plugin code should read only the plugin-owned keys.
export const readVoipClientSettings = (
  api: Pick<ClientPluginApi, "getSettingsScope">,
): VoipClientSettings => {
  const pluginSettings = readSettingsGroup(api.getSettingsScope("skymp5-voip"));
  const legacySettings = readSettingsGroup(api.getSettingsScope("skymp5-client"));

  const readBoolean = (
    key: string,
    legacyKey: string,
    defaultValue: boolean,
  ): boolean => {
    if (typeof pluginSettings[key] === "boolean") {
      return pluginSettings[key] as boolean;
    }

    return sanitizeBoolean(legacySettings[legacyKey], defaultValue);
  };

  const readString = (key: string, legacyKey: string): string => {
    const pluginValue = pluginSettings[key];
    if (typeof pluginValue === "string" && pluginValue.trim()) {
      return pluginValue.trim();
    }

    const legacyValue = legacySettings[legacyKey];
    if (typeof legacyValue === "string" && legacyValue.trim()) {
      return legacyValue.trim();
    }

    return "";
  };

  const readValue = (key: string, legacyKey: string): unknown => {
    if (pluginSettings[key] !== undefined) {
      return pluginSettings[key];
    }
    return legacySettings[legacyKey];
  };

  return {
    enabled: readBoolean("enabled", "voip-enabled", false),
    pttKey: sanitizePttKeyName(readValue("pttKey", "voip-ptt-key")),
    rawUiUrl: readString("rawUiUrl", "voip-raw-ui-url"),
    uiUrl: readString("uiUrl", "voip-ui-url"),
  };
};
