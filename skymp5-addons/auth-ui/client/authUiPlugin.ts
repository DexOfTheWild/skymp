import * as crypto from "crypto";
import * as fs from "fs";
import * as sp from "@skyrim-platform/skyrim-platform";
import {
  getPluginSourceCode,
  HttpHeaders,
  HttpResponse,
  writePlugin,
} from "@skyrim-platform/skyrim-platform";
import {
  ClientAddonApi,
  ClientAddonAuthGameData,
  ClientAddonRemoteAuthGameData,
} from "../../../skymp5-addons-api/clientAddonHost";
import {
  AUTH_UI_BROWSER_MESSAGE_KEYS,
  AUTH_UI_LOGIN_FAILURE_TYPES,
} from "../shared/authUiProtocol";

declare const window: any;

interface IHttpClientWithCallback {
  get(path: string, options?: { headers?: HttpHeaders }): Promise<HttpResponse>;
  post(
    path: string,
    options: { body: string; contentType: string; headers?: HttpHeaders },
  ): Promise<HttpResponse>;

  get(
    path: string,
    options: { headers?: HttpHeaders } | undefined,
    callback: (response: HttpResponse) => void,
  ): void;
  post(
    path: string,
    options: { body: string; contentType: string; headers?: HttpHeaders },
    callback: (response: HttpResponse) => void,
  ): void;
}

type ClientSettings = Record<string, unknown> & {
  gameData?: {
    profileId?: unknown;
  };
};

const translations = {
  ru: {
    authorization: "Авторизация",
    back: "назад",
    banned: "вы забанены",
    changeAccount: "сменить аккаунт",
    connectToServer: "Подключиться к игровому серверу",
    connecting: "подключение",
    join: "вступить",
    joinDiscordServer: "вступите в discord сервер",
    linkedSuccessfully: "привязан успешно",
    loginFirst: "сначала войдите",
    loginOrChangeHint: "Вы можете войти или поменять аккаунт",
    loginViaDiscord: "войдите через discord",
    loginViaSkymp: "войти через skymp",
    notAuthorized: "не авторизирован",
    oops: "упс",
    openSkympNet: "открыть skymp.net",
    openingBrowser: "открываем браузер...",
    play: "Играть",
    updateAvailable: "ура! вышло обновление",
    updateCaption: "новинка",
    updateDownloadHint: "Перейти на страницу скачивания обновления",
    whatWasThat: "что это было?",
  },
  en: {
    authorization: "Authorization",
    back: "back",
    banned: "you are banned",
    changeAccount: "change account",
    connectToServer: "Connect to game server",
    connecting: "connecting",
    join: "join",
    joinDiscordServer: "join the Discord server",
    linkedSuccessfully: "linked successfully",
    loginFirst: "log in first",
    loginOrChangeHint: "You can log in or change your account",
    loginViaDiscord: "log in via Discord",
    loginViaSkymp: "log in via skymp",
    notAuthorized: "not authorized",
    oops: "oops",
    openSkympNet: "open skymp.net",
    openingBrowser: "opening browser...",
    play: "Play",
    updateAvailable: "a new update is available!",
    updateCaption: "Update",
    updateDownloadHint: "Go to the update download page",
    whatWasThat: "what was that?",
  },
} as const;

type TranslationStrings = { [K in keyof typeof translations.en]: string };

class BrowserFunctionInfo<F extends { toString: () => string }> {
  public constructor(private f: F) {}

  public getText(args?: Record<string, unknown>): string {
    const text = this.getTextWithoutErrorHandling();
    if (!args) {
      return text;
    }

    return `(function(){const {${Object.keys(args).join(",")}} = ${JSON.stringify(args)};${text}})()`;
  }

  private getTextWithoutErrorHandling(): string {
    const funcString = this.f.toString().substring(0, this.f.toString().length - 1);
    return funcString.replace(new RegExp("^.+?{", "m"), "").trim();
  }
}

const authDataNoLoadPluginName = "auth-data-no-load";

const getPluginSourceCodeWithOverride = getPluginSourceCode as unknown as (
  pluginName: string,
  overrideFolder?: string,
) => string;

const writePluginWithOverride = writePlugin as unknown as (
  pluginName: string,
  newSources: string,
  overrideFolder?: string,
) => string;

const getLocalizedStrings = (): TranslationStrings => {
  try {
    const lang = fs.readFileSync("./Data/Platform/Distribution/locale", "utf8").trim();
    if (lang in translations) {
      return translations[lang as keyof typeof translations];
    }
  } catch {
    // Fall back to English when the locale file is unavailable.
  }

  return translations.en;
};

const readRememberedAuthData = (): ClientAddonRemoteAuthGameData | null => {
  try {
    const data = getPluginSourceCodeWithOverride(
      authDataNoLoadPluginName,
      "PluginsNoLoad",
    );
    if (!data) {
      return null;
    }

    return JSON.parse(data.slice(2)) || null;
  } catch {
    return null;
  }
};

const writeRememberedAuthData = (data: ClientAddonRemoteAuthGameData | null): void => {
  const content = `//${data ? JSON.stringify(data) : "null"}`;
  try {
    writePluginWithOverride(authDataNoLoadPluginName, content, "PluginsNoLoad");
  } catch {
    // Ignore persistence failures and continue without remembered auth.
  }
};

declare const authData: ClientAddonRemoteAuthGameData | null;
declare const authState: {
  displayText: string;
  showLoginButton: boolean;
};
declare const browserState: {
  comment: string;
  loginFailedReason: string;
};
declare const keys: typeof AUTH_UI_BROWSER_MESSAGE_KEYS;
declare const strings: TranslationStrings;

export const registerAuthUiPlugin = (api: ClientAddonApi): void => {
  new AuthUiPlugin(api).init();
};

class AuthUiPlugin {
  public constructor(private api: ClientAddonApi) {}

  public init(): void {
    this.api.auth.onAuthNeeded(() => this.onAuthNeeded());
    this.api.auth.onConnectionAccepted(() => this.onConnectionAccepted());
    this.api.auth.onConnectionDenied((event) => this.onConnectionDenied(event.error));
    this.api.auth.onConnectionDisconnect(() => this.stopConnectingIndicator());
    this.api.auth.onConnectionFailed(() => this.stopConnectingIndicator());

    this.api.onBrowserMessage("front-loaded", () => this.onBrowserWindowLoaded());
    this.api.onBrowserMessage(
      AUTH_UI_BROWSER_MESSAGE_KEYS.authAttempt,
      () => this.onBrowserAuthAttempt(),
    );
    this.api.onBrowserMessage(
      AUTH_UI_BROWSER_MESSAGE_KEYS.backToLogin,
      () => this.renderLoginWidget(),
    );
    this.api.onBrowserMessage(
      AUTH_UI_BROWSER_MESSAGE_KEYS.joinDiscord,
      () => sp.win32.loadUrl(this.discordInviteUrl),
    );
    this.api.onBrowserMessage(
      AUTH_UI_BROWSER_MESSAGE_KEYS.openDiscordOauth,
      () => this.openDiscordOauth(),
    );
    this.api.onBrowserMessage(
      AUTH_UI_BROWSER_MESSAGE_KEYS.updateRequired,
      () => sp.win32.loadUrl(this.updateUrl),
    );

    this.api.onCustomPacket(
      AUTH_UI_LOGIN_FAILURE_TYPES.notLoggedViaDiscord,
      () => this.showLoginFailed(this.strings.loginViaDiscord),
    );
    this.api.onCustomPacket(
      AUTH_UI_LOGIN_FAILURE_TYPES.notInDiscordServer,
      () => this.showLoginFailed(this.strings.joinDiscordServer),
    );
    this.api.onCustomPacket(
      AUTH_UI_LOGIN_FAILURE_TYPES.banned,
      () => this.showLoginFailed(this.strings.banned),
    );
    this.api.onCustomPacket(
      AUTH_UI_LOGIN_FAILURE_TYPES.ipMismatch,
      () => this.showLoginFailed(this.strings.whatWasThat),
    );

    this.api.onLocalSpawn(() => this.onLocalSpawn());
    this.api.onTick(() => this.onTick());
  }

  private onAuthNeeded(): void {
    const profileId = this.resolveOfflineProfileId();
    if (profileId !== null) {
      this.currentAuthGameData = {
        local: {
          profileId,
        },
      };
    } else {
      this.currentAuthGameData = null;
    }

    this.listenBrowserMessages = true;
    this.authNeeded = true;

    if (this.browserWindowLoaded) {
      this.showLoginWindow();
    }
  }

  private onBrowserWindowLoaded(): void {
    this.browserWindowLoaded = true;
    if (this.authNeeded) {
      this.showLoginWindow();
    }
  }

  private showLoginWindow(): void {
    this.currentRemoteAuthData = this.canUseRemoteAuth()
      ? readRememberedAuthData()
      : null;
    if (this.currentRemoteAuthData) {
      this.currentAuthGameData = {
        remote: this.currentRemoteAuthData,
      };
    }

    this.listenBrowserMessages = true;
    this.browserState.comment = "";
    this.renderLoginWidget();
    this.api.browser.setVisible(true);
    this.api.browser.setFocused(true);
  }

  private onBrowserAuthAttempt(): void {
    if (!this.listenBrowserMessages) {
      return;
    }

    if (this.currentRemoteAuthData !== null) {
      writeRememberedAuthData(this.currentRemoteAuthData);
      this.submitAuthAttempt({
        remote: this.currentRemoteAuthData,
      });
      this.authAttemptProgressIndicator = true;
      return;
    }

    if (this.currentAuthGameData?.local) {
      this.submitAuthAttempt({
        local: {
          profileId: this.currentAuthGameData.local.profileId,
        },
      });
      this.authAttemptProgressIndicator = true;
      return;
    }

    if (!this.canUseRemoteAuth()) {
      this.browserState.comment = this.getOfflineProfileDisplayText();
      this.renderLoginWidget();
      return;
    }

    if (this.currentRemoteAuthData === null) {
      this.browserState.comment = this.strings.loginFirst;
      this.renderLoginWidget();
      return;
    }
  }

  private openDiscordOauth(): void {
    if (!this.listenBrowserMessages) {
      return;
    }

    if (!this.canUseRemoteAuth()) {
      this.browserState.comment = this.getOfflineProfileDisplayText();
      this.renderLoginWidget();
      return;
    }

    this.browserState.comment = this.strings.openingBrowser;
    this.renderLoginWidget();
    sp.win32.loadUrl(
      `${this.getMasterUrl()}/api/users/login-discord?state=${this.discordAuthState}`,
    );
    this.scheduleLoginStateCheck(0);
  }

  private scheduleLoginStateCheck(delayMs: number): void {
    this.nextLoginStateCheckAt = Date.now() + delayMs;
  }

  private clearScheduledLoginStateCheck(): void {
    this.nextLoginStateCheckAt = null;
  }

  private checkLoginState(): void {
    if (!this.listenBrowserMessages || this.loginStateCheckInFlight) {
      return;
    }

    this.loginStateCheckInFlight = true;

    const client = new sp.HttpClient(this.getMasterUrl()) as IHttpClientWithCallback;
    client.get(
      `/api/users/login-discord/status?state=${this.discordAuthState}`,
      undefined,
      (response) => {
        if (!this.listenBrowserMessages) {
          this.loginStateCheckInFlight = false;
          return;
        }

        switch (response.status) {
          case 200: {
            const parsedResponse = JSON.parse(response.body) as {
              token: string;
              masterApiId: number;
              discordUsername: string | null;
              discordDiscriminator: string | null;
              discordAvatar: string | null;
            };

            this.createPlaySession(parsedResponse.token, (playSession, error) => {
              this.loginStateCheckInFlight = false;
              if (!this.listenBrowserMessages) {
                return;
              }

              if (error) {
                this.browserState.comment = error;
                this.renderLoginWidget();
                this.scheduleLoginStateCheck(this.getLoginPollDelayMs());
                return;
              }

              this.currentRemoteAuthData = {
                session: playSession,
                masterApiId: parsedResponse.masterApiId,
                discordUsername: parsedResponse.discordUsername,
                discordDiscriminator: parsedResponse.discordDiscriminator,
                discordAvatar: parsedResponse.discordAvatar,
              };
              this.browserState.comment = this.strings.linkedSuccessfully;
              this.renderLoginWidget();
            });
            return;
          }
          case 401:
            this.browserState.comment = "";
            this.loginStateCheckInFlight = false;
            this.scheduleLoginStateCheck(this.getLoginPollDelayMs());
            return;
          case 403:
          case 404:
            this.browserState.comment = `Fail: ${response.body}`;
            this.loginStateCheckInFlight = false;
            this.renderLoginWidget();
            return;
          default:
            this.browserState.comment = `Server returned ${response.status} "${response.body || response.error}"`;
            this.loginStateCheckInFlight = false;
            this.renderLoginWidget();
            this.scheduleLoginStateCheck(this.getLoginPollDelayMs());
        }
      },
    );
  }

  private createPlaySession(
    token: string,
    callback: (session: string, error: string) => void,
  ): void {
    const client = new sp.HttpClient(this.getMasterUrl()) as IHttpClientWithCallback;
    client.post(
      `/api/users/me/play/${this.getServerMasterKey()}`,
      {
        body: "{}",
        contentType: "application/json",
        headers: {
          authorization: token,
        },
      },
      (response) => {
        if (response.status !== 200) {
          callback("", `status code ${response.status}`);
          return;
        }

        callback(JSON.parse(response.body).session, "");
      },
    );
  }

  private submitAuthAttempt(authGameData: ClientAddonAuthGameData): void {
    this.currentAuthGameData = authGameData;
    this.api.auth.submitAuthAttempt(authGameData);
  }

  private onConnectionAccepted(): void {
    this.listenBrowserMessages = false;

    const authGameData = this.resolveActiveAuthGameData();
    if (authGameData?.local) {
      this.api.sendCustomPacket("loginWithSkympIo", {
        gameData: {
          profileId: authGameData.local.profileId,
        },
      });
      return;
    }

    if (authGameData?.remote) {
      this.api.sendCustomPacket("loginWithSkympIo", {
        gameData: {
          session: authGameData.remote.session,
        },
      });
      return;
    }

    this.api.logError("No auth data available for loginWithSkympIo");
  }

  private onConnectionDenied(error: string): void {
    this.stopConnectingIndicator();

    if (!error.toLowerCase().includes("invalid password")) {
      return;
    }

    this.listenBrowserMessages = true;
    this.renderDeniedWidget();
    this.api.browser.setVisible(true);
    this.api.browser.setFocused(true);
  }

  private onLocalSpawn(): void {
    this.stopConnectingIndicator();

    if (!this.authDialogOpen) {
      return;
    }

    this.executeInBrowser("window.skyrimPlatform.widgets.set([]);");
    this.authDialogOpen = false;
    this.api.browser.setFocused(false);
  }

  private stopConnectingIndicator(): void {
    this.authAttemptProgressIndicator = false;
    this.authAttemptProgressIndicatorCounter = 0;
    this.clearScheduledLoginStateCheck();
  }

  private showLoginFailed(reason: string): void {
    this.stopConnectingIndicator();
    this.listenBrowserMessages = true;
    this.browserState.comment = "";
    this.browserState.loginFailedReason = reason;
    this.renderLoginFailedWidget();
    this.api.browser.setVisible(true);
    this.api.browser.setFocused(true);
  }

  private renderDeniedWidget(): void {
    this.executeInBrowser(
      new BrowserFunctionInfo(this.deniedWidgetSetter).getText({
        keys: AUTH_UI_BROWSER_MESSAGE_KEYS,
        strings: this.strings,
      }),
    );
    this.authDialogOpen = true;
  }

  private renderLoginFailedWidget(): void {
    this.executeInBrowser(
      new BrowserFunctionInfo(this.loginFailedWidgetSetter).getText({
        keys: AUTH_UI_BROWSER_MESSAGE_KEYS,
        browserState: this.browserState,
        strings: this.strings,
      }),
    );
    this.authDialogOpen = true;
  }

  private renderLoginWidget(): void {
    this.executeInBrowser(
      new BrowserFunctionInfo(this.loginWidgetSetter).getText({
        authData: this.currentRemoteAuthData,
        authState: this.createLoginWidgetState(),
        browserState: this.browserState,
        keys: AUTH_UI_BROWSER_MESSAGE_KEYS,
        strings: this.strings,
      }),
    );
    this.authDialogOpen = true;
  }

  private executeInBrowser(source: string): void {
    sp.browser.executeJavaScript(source);
  }

  private onTick(): void {
    if (
      this.nextLoginStateCheckAt !== null &&
      Date.now() >= this.nextLoginStateCheckAt &&
      !this.loginStateCheckInFlight
    ) {
      this.nextLoginStateCheckAt = null;
      this.checkLoginState();
    }

    if (!this.authAttemptProgressIndicator) {
      return;
    }

    this.authAttemptProgressIndicatorCounter += 1;
    if (this.authAttemptProgressIndicatorCounter === 1_000_000) {
      this.authAttemptProgressIndicatorCounter = 0;
    }

    const slowCounter = Math.floor(this.authAttemptProgressIndicatorCounter / 15);
    const dot = slowCounter % 3 === 0 ? "." : slowCounter % 3 === 1 ? ".." : "...";
    this.browserState.comment = `${this.strings.connecting}${dot}`;
    this.renderLoginWidget();
  }

  private resolveActiveAuthGameData(): ClientAddonAuthGameData | null {
    if (this.currentAuthGameData?.local || this.currentAuthGameData?.remote) {
      return this.currentAuthGameData;
    }

    const profileId = this.resolveOfflineProfileId();
    if (profileId !== null) {
      return {
        local: {
          profileId,
        },
      };
    }

    const rememberedAuthData = readRememberedAuthData();
    if (rememberedAuthData) {
      return {
        remote: rememberedAuthData,
      };
    }

    return null;
  }

  private createLoginWidgetState(): {
    displayText: string;
    showLoginButton: boolean;
  } {
    if (this.currentRemoteAuthData) {
      return {
        displayText: this.currentRemoteAuthData.discordUsername
          || `id: ${this.currentRemoteAuthData.masterApiId}`,
        showLoginButton: this.canUseRemoteAuth(),
      };
    }

    const offlineProfileId = this.currentAuthGameData?.local?.profileId;
    if (Number.isInteger(offlineProfileId)) {
      return {
        displayText: `id: ${offlineProfileId as number}`,
        showLoginButton: this.canUseRemoteAuth(),
      };
    }

    return {
      displayText: this.strings.notAuthorized,
      showLoginButton: this.canUseRemoteAuth(),
    };
  }

  private getOfflineProfileDisplayText(): string {
    const offlineProfileId = this.currentAuthGameData?.local?.profileId;
    return Number.isInteger(offlineProfileId)
      ? `id: ${offlineProfileId as number}`
      : this.strings.notAuthorized;
  }

  private resolveOfflineProfileId(): number | null {
    const settings = this.getClientSettings();
    const profileId = settings.gameData?.profileId;
    return Number.isInteger(profileId) ? (profileId as number) : null;
  }

  private getClientSettings(): ClientSettings {
    return this.api.getSettingsScope<ClientSettings>("skymp5-client") || {};
  }

  private getMasterUrl(): string {
    const settings = this.getClientSettings();
    const masterUrl = typeof settings.master === "string"
      ? settings.master
      : "https://gateway.skymp.net";
    return masterUrl.endsWith("/") ? masterUrl.slice(0, -1) : masterUrl;
  }

  private getServerMasterKey(): string {
    const settings = this.getClientSettings();
    const serverMasterKey = settings["server-master-key"];
    if (typeof serverMasterKey === "string" && serverMasterKey) {
      return serverMasterKey;
    }

    const legacyMasterKey = settings["master-key"];
    if (typeof legacyMasterKey === "string" && legacyMasterKey) {
      return legacyMasterKey;
    }

    return `${settings["server-ip"]}:${settings["server-port"]}`;
  }

  private getLoginPollDelayMs(): number {
    return Math.floor((1.5 + Math.random() * 2) * 1000);
  }

  private canUseRemoteAuth(): boolean {
    return this.getMasterUrl() !== "";
  }

  private deniedWidgetSetter = () => {
    const widget = {
      type: "form",
      id: 2,
      caption: strings.updateCaption,
      elements: [
        {
          type: "text",
          text: strings.updateAvailable,
          tags: [],
        },
        {
          type: "button",
          text: strings.openSkympNet,
          tags: ["ELEMENT_STYLE_MARGIN_EXTENDED"],
          click: () => window.skyrimPlatform.sendMessage(keys.updateRequired),
          hint: strings.updateDownloadHint,
        },
      ],
    };

    window.skyrimPlatform.widgets.set([widget]);
  };

  private loginFailedWidgetSetter = () => {
    const splitParts = browserState.loginFailedReason.split("\n");
    const textElements = splitParts.map((part: string) => ({
      type: "text",
      text: part,
      tags: [],
    }));

    const widget = {
      type: "form",
      id: 2,
      caption: strings.oops,
      elements: new Array<any>(),
    };

    textElements.forEach((element: { type: string; text: string; tags: string[] }) => {
      widget.elements.push(element);
    });

    if (browserState.loginFailedReason === strings.joinDiscordServer) {
      widget.elements.push({
        type: "button",
        text: strings.join,
        tags: ["ELEMENT_STYLE_MARGIN_EXTENDED"],
        click: () => window.skyrimPlatform.sendMessage(keys.joinDiscord),
        hint: null,
      });
    }

    widget.elements.push({
      type: "button",
      text: strings.back,
      tags: ["ELEMENT_STYLE_MARGIN_EXTENDED"],
      click: () => window.skyrimPlatform.sendMessage(keys.backToLogin),
      hint: undefined,
    });

    window.skyrimPlatform.widgets.set([widget]);
  };

  private loginWidgetSetter = () => {
    const widget = {
      type: "form",
      id: 1,
      caption: strings.authorization,
      elements: [
        {
          type: "text",
          text: authState.displayText,
          tags: [],
        },
        {
          type: "button",
          text: strings.play,
          tags: ["BUTTON_STYLE_FRAME", "ELEMENT_STYLE_MARGIN_EXTENDED"],
          click: () => window.skyrimPlatform.sendMessage(keys.authAttempt),
          hint: strings.connectToServer,
        },
        {
          type: "text",
          text: browserState.comment,
          tags: [],
        },
      ],
    };

    if (authState.showLoginButton) {
      widget.elements.splice(1, 0, {
        type: "button",
        text: authData ? strings.changeAccount : strings.loginViaSkymp,
        tags: [],
        click: () => window.skyrimPlatform.sendMessage(keys.openDiscordOauth),
        hint: strings.loginOrChangeHint,
      });
    }

    window.skyrimPlatform.widgets.set([widget]);
  };

  private readonly browserState = {
    comment: "",
    loginFailedReason: "",
  };
  private browserWindowLoaded = false;
  private authNeeded = false;
  private listenBrowserMessages = false;
  private authDialogOpen = false;
  private authAttemptProgressIndicator = false;
  private authAttemptProgressIndicatorCounter = 0;
  private loginStateCheckInFlight = false;
  private nextLoginStateCheckAt: number | null = null;
  private currentAuthGameData: ClientAddonAuthGameData | null = null;
  private currentRemoteAuthData: ClientAddonRemoteAuthGameData | null = null;
  private readonly discordAuthState = crypto.randomBytes(32).toString("hex");
  private readonly strings = getLocalizedStrings();
  private readonly discordInviteUrl = "https://discord.gg/9KhSZ6zjGT";
  private readonly updateUrl = "https://skymp.net/UpdInstall";
}
