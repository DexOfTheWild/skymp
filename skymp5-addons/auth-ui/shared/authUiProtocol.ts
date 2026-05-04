export const AUTH_UI_PLUGIN_ID = "auth-ui";

export const AUTH_UI_BROWSER_MESSAGE_KEYS = {
  authAttempt: "skymp5-auth-ui:authAttempt",
  backToLogin: "skymp5-auth-ui:backToLogin",
  joinDiscord: "skymp5-auth-ui:joinDiscord",
  openDiscordOauth: "skymp5-auth-ui:openDiscordOauth",
  updateRequired: "skymp5-auth-ui:updateRequired",
} as const;

export const AUTH_UI_LOGIN_FAILURE_TYPES = {
  banned: "loginFailedBanned",
  ipMismatch: "loginFailedIpMismatch",
  notInDiscordServer: "loginFailedNotInTheDiscordServer",
  notLoggedViaDiscord: "loginFailedNotLoggedViaDiscord",
} as const;
