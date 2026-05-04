import {
  bridgeError,
  bridgePageLoaded,
  readIdentityFromQuery,
  VoipHarness,
  VoipLogEntry,
  VoipState,
} from "./shared";

const root = document.getElementById("root");
if (!root) {
  throw new Error("VoIP test root element was not found");
}

document.body.style.margin = "0";
document.body.style.fontFamily = "\"Segoe UI\", Tahoma, sans-serif";
document.body.style.color = "#eef5ff";
document.body.style.background = "transparent";
document.documentElement.style.background = "transparent";
document.documentElement.style.setProperty("--voip-transmit-level", "0");

root.innerHTML = `
  <style>
    html, body {
      width: 100%;
      min-height: 100%;
      background: transparent;
      overflow: hidden;
    }
    body[data-voip-debug-ui="true"] {
      background: rgba(7, 12, 21, 0.92);
    }
    .voip-hud {
      position: fixed;
      inset: 0;
      pointer-events: none;
    }
    .voip-transmit-indicator {
      position: fixed;
      left: 50%;
      bottom: max(32px, env(safe-area-inset-bottom, 0px) + 16px);
      width: 72px;
      height: 72px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
      background:
        radial-gradient(circle at center, rgba(56, 189, 248, 0.22), rgba(8, 18, 31, 0.88));
      border: 1px solid rgba(147, 197, 253, 0.34);
      box-shadow:
        0 10px 30px rgba(2, 8, 23, 0.45),
        0 0 32px rgba(56, 189, 248, 0.28);
      opacity: 0;
      transform: translate(-50%, 16px) scale(0.92);
      transition:
        opacity 120ms ease,
        transform 160ms ease,
        box-shadow 160ms ease;
      visibility: hidden;
      overflow: hidden;
      isolation: isolate;
    }
    .voip-transmit-fill {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background:
        linear-gradient(180deg, rgba(186, 230, 253, 0.95), rgba(56, 189, 248, 0.92) 46%, rgba(14, 165, 233, 0.88));
      transform: translateY(calc(100% - (var(--voip-transmit-level, 0) * 100%)));
      transition: transform 80ms linear;
      z-index: 0;
    }
    .voip-transmit-fill::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background:
        radial-gradient(circle at 50% 18%, rgba(255, 255, 255, 0.34), transparent 38%),
        linear-gradient(180deg, rgba(255, 255, 255, 0.1), transparent 28%);
      opacity: 0.55;
    }
    .voip-transmit-indicator::before {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: inherit;
      box-shadow:
        inset 0 1px 0 rgba(255, 255, 255, 0.08),
        inset 0 -10px 24px rgba(2, 8, 23, 0.18);
      z-index: 1;
    }
    body[data-voip-debug-ui="false"][data-voip-transmitting="true"] .voip-transmit-indicator {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
      visibility: visible;
    }
    .voip-transmit-indicator img {
      width: 34px;
      height: 34px;
      display: block;
      position: relative;
      z-index: 2;
      filter:
        brightness(0)
        saturate(100%)
        invert(90%)
        sepia(16%)
        saturate(1390%)
        hue-rotate(161deg)
        brightness(101%)
        contrast(101%);
    }
    .voip-shell {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
      opacity: 0;
      pointer-events: none;
      visibility: hidden;
      background:
        radial-gradient(circle at top left, rgba(66, 153, 225, 0.18), transparent 42%),
        radial-gradient(circle at bottom right, rgba(56, 189, 248, 0.18), transparent 45%),
        linear-gradient(180deg, rgba(10, 16, 29, 0.98), rgba(4, 8, 16, 0.98));
      transition: opacity 140ms ease;
    }
    body[data-voip-debug-ui="true"] .voip-shell {
      opacity: 1;
      pointer-events: auto;
      visibility: visible;
    }
    .voip-panel {
      width: min(1220px, 100%);
      display: grid;
      gap: 14px;
      grid-template-columns: 1.08fr 0.92fr;
      background: rgba(12, 18, 31, 0.88);
      border: 1px solid rgba(147, 197, 253, 0.25);
      border-radius: 18px;
      box-shadow: 0 20px 80px rgba(0, 0, 0, 0.35);
      padding: 18px;
      box-sizing: border-box;
    }
    .voip-column {
      display: grid;
      gap: 14px;
      align-content: start;
    }
    .voip-card {
      border: 1px solid rgba(148, 163, 184, 0.18);
      border-radius: 14px;
      background: rgba(15, 23, 42, 0.72);
      padding: 14px;
    }
    .voip-card h2 {
      margin: 0 0 10px;
      font-size: 15px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #93c5fd;
    }
    .voip-grid {
      display: grid;
      grid-template-columns: 190px 1fr;
      gap: 8px 12px;
      font-size: 13px;
      line-height: 1.4;
    }
    .voip-grid dt {
      color: #93a4bf;
    }
    .voip-grid dd {
      margin: 0;
      word-break: break-word;
      color: #f8fafc;
    }
    .pill {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.03em;
      background: rgba(59, 130, 246, 0.18);
      color: #bfdbfe;
    }
    .pill.warn {
      background: rgba(245, 158, 11, 0.2);
      color: #fde68a;
    }
    .pill.error {
      background: rgba(239, 68, 68, 0.2);
      color: #fecaca;
    }
    .pill.voice-whisper {
      background: rgba(125, 211, 252, 0.16);
      color: #bae6fd;
    }
    .pill.voice-say {
      background: rgba(74, 222, 128, 0.18);
      color: #bbf7d0;
    }
    .pill.voice-yell {
      background: rgba(248, 113, 113, 0.18);
      color: #fecaca;
    }
    .meter-track {
      height: 12px;
      background: rgba(30, 41, 59, 0.9);
      border-radius: 999px;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .meter-fill {
      height: 100%;
      width: 0%;
      border-radius: 999px;
      background: linear-gradient(90deg, #22c55e, #38bdf8, #f59e0b);
      transition: width 80ms linear;
    }
    .controls {
      display: flex;
      gap: 10px;
      flex-wrap: wrap;
      align-items: center;
    }
    .voip-button {
      appearance: none;
      border: 1px solid rgba(125, 211, 252, 0.25);
      background: linear-gradient(180deg, rgba(14, 116, 144, 0.95), rgba(2, 132, 199, 0.95));
      color: #f8fafc;
      border-radius: 999px;
      padding: 10px 16px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
    }
    .voip-button[disabled] {
      cursor: not-allowed;
      opacity: 0.45;
    }
    .voip-log {
      margin: 0;
      min-height: 540px;
      max-height: 540px;
      overflow: auto;
      white-space: pre-wrap;
      word-break: break-word;
      font-family: Consolas, "Courier New", monospace;
      font-size: 12px;
      line-height: 1.5;
      color: #dbeafe;
    }
    .tag-list {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 20px;
      align-items: center;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      border-radius: 999px;
      padding: 4px 10px;
      background: rgba(30, 41, 59, 0.88);
      border: 1px solid rgba(96, 165, 250, 0.16);
      font-size: 12px;
      color: #e2e8f0;
    }
    .participant-list {
      margin: 0;
      padding-left: 0;
      list-style: none;
      display: grid;
      gap: 10px;
      font-size: 13px;
      line-height: 1.45;
    }
    .participant-card {
      border-radius: 12px;
      border: 1px solid rgba(96, 165, 250, 0.12);
      background: rgba(15, 23, 42, 0.6);
      padding: 10px 12px;
      display: grid;
      gap: 8px;
    }
    .participant-line {
      display: inline-flex;
      gap: 6px;
      flex-wrap: wrap;
      align-items: center;
    }
    .participant-meta {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 6px 12px;
      font-size: 12px;
      color: #cbd5e1;
    }
    .participant-id {
      font-weight: 700;
      color: #f8fafc;
    }
    .muted-note {
      color: #fca5a5;
    }
    @media (max-width: 860px) {
      .voip-panel {
        grid-template-columns: 1fr;
      }
      .voip-grid,
      .participant-meta {
        grid-template-columns: 1fr;
      }
    }
  </style>
  <div class="voip-hud" aria-hidden="true">
    <div class="voip-transmit-indicator">
      <div class="voip-transmit-fill"></div>
      <img src="/voice-on.svg" alt="" />
    </div>
  </div>
  <div class="voip-shell">
    <div class="voip-panel">
      <div class="voip-column">
        <section class="voip-card">
          <h2>Session</h2>
          <dl class="voip-grid">
            <dt>Identity</dt><dd id="identity">pending</dd>
            <dt>Local Participant ID</dt><dd id="local-participant-id">pending</dd>
            <dt>Room</dt><dd id="room">pending</dd>
            <dt>Signal URL</dt><dd id="ws-url">pending</dd>
            <dt>ICE Policy</dt><dd id="ice-policy">all</dd>
            <dt>Token</dt><dd><span id="token-status" class="pill">idle</span></dd>
            <dt>Server Time</dt><dd id="server-time">pending</dd>
            <dt>Valid For</dt><dd><span id="token-validity" class="pill">pending</span></dd>
            <dt>Connection</dt><dd><span id="connection-status" class="pill">idle</span></dd>
          </dl>
        </section>
        <section class="voip-card">
          <h2>Voice Policy</h2>
          <dl class="voip-grid">
            <dt>Voice Mode</dt><dd><span id="voice-mode" class="pill voice-say">VOICE: SAY</span></dd>
            <dt>PTT Key</dt><dd id="ptt-key">V</dd>
            <dt>PTT State</dt><dd><span id="ptt-state" class="pill warn">released</span></dd>
            <dt>Transmit State</dt><dd><span id="transmit-state" class="pill warn">silent</span></dd>
            <dt>Effective Radius</dt><dd id="proximity-radius">pending</dd>
            <dt>Positional Mode</dt><dd id="positional-audio">off</dd>
            <dt>World / Cell</dt><dd id="world-or-cell">pending</dd>
            <dt>Remote In Range</dt><dd id="participant-count-in-range">0</dd>
          </dl>
          <div style="margin-top: 10px; display: grid; gap: 6px;">
            <div style="font-size: 12px; color: #93a4bf;">Current audible set</div>
            <div id="audible-set" class="tag-list"></div>
          </div>
        </section>
        <section class="voip-card">
          <h2>Local Audio</h2>
          <dl class="voip-grid">
            <dt>Mic Permission</dt><dd id="mic-permission">unknown</dd>
            <dt>getUserMedia</dt><dd id="gum-status">pending</dd>
            <dt>Input Device</dt><dd id="device-label">pending</dd>
            <dt>Track Created</dt><dd id="track-created">no</dd>
            <dt>Track Published</dt><dd id="track-published">no</dd>
            <dt>Track Muted</dt><dd id="track-muted">no</dd>
            <dt>Publish State</dt><dd id="publish-state">unpublished</dd>
          </dl>
          <div class="controls">
            <button id="toggle-publish" class="voip-button" type="button" disabled>Force Publish Track</button>
          </div>
          <div style="margin-top: 12px; display: grid; gap: 6px;">
            <div style="font-size: 12px; color: #93a4bf;">Local speaking meter</div>
            <div class="meter-track"><div id="meter-fill" class="meter-fill"></div></div>
          </div>
        </section>
        <section class="voip-card">
          <h2>Participants</h2>
          <dl class="voip-grid">
            <dt>Participant Count</dt><dd id="participant-count">0</dd>
            <dt>Remote Joined</dt><dd id="remote-joined">no</dd>
            <dt>Remote Audio</dt><dd id="remote-subscribed">no</dd>
          </dl>
          <ul id="participant-list" class="participant-list"></ul>
        </section>
      </div>
      <div class="voip-column">
        <section class="voip-card">
          <h2>Rolling Log</h2>
          <pre id="log-output" class="voip-log"></pre>
        </section>
      </div>
    </div>
  </div>
`;

const elements = {
  audibleSet: document.getElementById("audible-set") as HTMLDivElement,
  connectionStatus: document.getElementById("connection-status") as HTMLSpanElement,
  deviceLabel: document.getElementById("device-label") as HTMLDivElement,
  gumStatus: document.getElementById("gum-status") as HTMLDivElement,
  icePolicy: document.getElementById("ice-policy") as HTMLDivElement,
  identity: document.getElementById("identity") as HTMLDivElement,
  localParticipantId: document.getElementById("local-participant-id") as HTMLDivElement,
  logOutput: document.getElementById("log-output") as HTMLPreElement,
  meterFill: document.getElementById("meter-fill") as HTMLDivElement,
  micPermission: document.getElementById("mic-permission") as HTMLDivElement,
  participantCount: document.getElementById("participant-count") as HTMLDivElement,
  participantCountInRange: document.getElementById("participant-count-in-range") as HTMLDivElement,
  participantList: document.getElementById("participant-list") as HTMLUListElement,
  positionalAudio: document.getElementById("positional-audio") as HTMLDivElement,
  proximityRadius: document.getElementById("proximity-radius") as HTMLDivElement,
  pttKey: document.getElementById("ptt-key") as HTMLDivElement,
  pttState: document.getElementById("ptt-state") as HTMLSpanElement,
  publishState: document.getElementById("publish-state") as HTMLDivElement,
  remoteJoined: document.getElementById("remote-joined") as HTMLDivElement,
  remoteSubscribed: document.getElementById("remote-subscribed") as HTMLDivElement,
  room: document.getElementById("room") as HTMLDivElement,
  serverTime: document.getElementById("server-time") as HTMLDivElement,
  tokenStatus: document.getElementById("token-status") as HTMLSpanElement,
  tokenValidity: document.getElementById("token-validity") as HTMLSpanElement,
  togglePublish: document.getElementById("toggle-publish") as HTMLButtonElement,
  trackCreated: document.getElementById("track-created") as HTMLDivElement,
  trackMuted: document.getElementById("track-muted") as HTMLDivElement,
  trackPublished: document.getElementById("track-published") as HTMLDivElement,
  transmitState: document.getElementById("transmit-state") as HTMLSpanElement,
  voiceMode: document.getElementById("voice-mode") as HTMLSpanElement,
  worldOrCell: document.getElementById("world-or-cell") as HTMLDivElement,
  wsUrl: document.getElementById("ws-url") as HTMLDivElement,
};

const setPillState = (
  element: HTMLSpanElement,
  label: string,
  tone: "normal" | "warn" | "error",
) => {
  element.textContent = label;
  element.className = tone === "normal" ? "pill" : `pill ${tone}`;
};

const setVoiceModePill = (mode: string) => {
  const normalized = mode.toLowerCase();
  elements.voiceMode.textContent = `VOICE: ${normalized.toUpperCase()}`;
  elements.voiceMode.className = `pill voice-${normalized}`;
};

const logLines: string[] = [];

const appendLog = (entry: VoipLogEntry) => {
  const detailSuffix = entry.details ? ` ${entry.details}` : "";
  logLines.push(`${entry.timestamp} [${entry.level}] ${entry.message}${detailSuffix}`);
  if (logLines.length > 160) {
    logLines.shift();
  }
  elements.logOutput.textContent = logLines.join("\n");
  elements.logOutput.scrollTop = elements.logOutput.scrollHeight;
};

const renderTagList = (container: HTMLElement, values: string[], emptyLabel: string) => {
  container.innerHTML = "";
  if (values.length === 0) {
    const empty = document.createElement("span");
    empty.className = "tag";
    empty.textContent = emptyLabel;
    container.appendChild(empty);
    return;
  }

  for (const value of values) {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = value;
    container.appendChild(tag);
  }
};

const formatNumber = (value: number | null | undefined, digits: number = 2) => {
  if (value === null || value === undefined) {
    return "n/a";
  }
  return value.toFixed(digits);
};

const formatPosition = (position: { x: number; y: number; z: number } | null) => {
  if (!position) {
    return "n/a";
  }
  return `x=${formatNumber(position.x)} y=${formatNumber(position.y)} z=${formatNumber(position.z)}`;
};

const renderParticipants = (state: VoipState) => {
  elements.participantList.innerHTML = "";
  if (state.participantStates.length === 0) {
    const item = document.createElement("li");
    item.textContent = "No participants yet";
    elements.participantList.appendChild(item);
    return;
  }

  for (const participant of state.participantStates) {
    const item = document.createElement("li");
    item.className = "participant-card";

    const line = document.createElement("div");
    line.className = "participant-line";

    const identity = document.createElement("span");
    identity.className = "participant-id";
    identity.textContent = participant.identity;
    line.appendChild(identity);

    const tags = [
      participant.isLocal ? "local" : "remote",
      participant.mode,
      participant.joined ? "joined" : "not joined",
      participant.subscribed ? "subscribed" : "not subscribed",
      participant.audibleByPolicy ? "audible" : "muted by policy",
      participant.sameWorldOrCell === false ? "other world/cell" : "same world/cell",
      participant.graphMode || "detached",
    ];

    for (const value of tags) {
      const tag = document.createElement("span");
      tag.className = value === "muted by policy" ? "tag muted-note" : "tag";
      tag.textContent = value;
      line.appendChild(tag);
    }

    const meta = document.createElement("div");
    meta.className = "participant-meta";
    meta.innerHTML = `
      <div>Gain: ${formatNumber(participant.gain)}</div>
      <div>Distance: ${formatNumber(participant.distance)}</div>
      <div>Pan: ${formatNumber(participant.pan)}</div>
      <div>Position: ${formatPosition(participant.position)}</div>
    `;

    item.appendChild(line);
    item.appendChild(meta);
    elements.participantList.appendChild(item);
  }
};

const render = (state: VoipState) => {
  document.body.dataset.voipDebugUi = state.debugUiVisible ? "true" : "false";
  document.body.dataset.voipTransmitting = state.transmitting ? "true" : "false";
  document.documentElement.style.setProperty(
    "--voip-transmit-level",
    String(Math.max(0, Math.min(1, state.localSpeakingLevel))),
  );
  elements.identity.textContent = state.identity || "missing";
  elements.localParticipantId.textContent = state.localParticipantId || "pending";
  elements.room.textContent = state.roomName || "pending";
  elements.wsUrl.textContent = state.wsUrl || "pending";
  elements.icePolicy.textContent = state.iceTransportPolicy;
  elements.serverTime.textContent = state.serverTime || "pending";
  elements.micPermission.textContent = state.micPermissionStatus;
  elements.gumStatus.textContent =
    state.getUserMediaSucceeded === null
      ? "pending"
      : state.getUserMediaSucceeded
        ? "succeeded"
        : "failed";
  elements.deviceLabel.textContent = state.selectedInputDeviceLabel || "(unknown device)";
  elements.trackCreated.textContent = state.localTrackCreated ? "yes" : "no";
  elements.trackPublished.textContent = state.localTrackPublished ? "yes" : "no";
  elements.trackMuted.textContent = state.localTrackMuted ? "yes" : "no";
  elements.publishState.textContent = state.localPublishState;
  elements.participantCount.textContent = String(state.participantCount);
  elements.participantCountInRange.textContent = String(state.participantCountInRange);
  elements.remoteJoined.textContent = state.remoteParticipantJoined ? "yes" : "no";
  elements.remoteSubscribed.textContent = state.remoteTrackSubscribed ? "yes" : "no";
  elements.positionalAudio.textContent = state.positionalAudioMode;
  elements.pttKey.textContent = state.pttKey || "V";
  elements.proximityRadius.textContent =
    state.proximityRadius === null ? "pending" : String(state.proximityRadius);
  elements.worldOrCell.textContent = state.worldOrCell || "pending";
  elements.meterFill.style.width = `${Math.round(state.localSpeakingLevel * 100)}%`;

  setVoiceModePill(state.voiceMode);
  setPillState(
    elements.tokenStatus,
    state.tokenFetchStatus,
    state.tokenFetchStatus === "failed" ? "error" : state.tokenFetchStatus === "fetching" ? "warn" : "normal",
  );
  setPillState(
    elements.connectionStatus,
    state.connectionStatus,
    state.connectionStatus === "disconnected" ? "warn" : state.connectionStatus === "connected" ? "normal" : "warn",
  );
  setPillState(
    elements.tokenValidity,
    state.tokenValidForSeconds === null ? "pending" : `valid for ${state.tokenValidForSeconds}s`,
    state.tokenWarningState === "expired" ? "error" : state.tokenWarningState === "near-expiry" ? "warn" : "normal",
  );
  setPillState(elements.pttState, state.pttActive ? "held" : "released", state.pttActive ? "normal" : "warn");
  setPillState(
    elements.transmitState,
    state.transmitting ? "transmitting" : "silent",
    state.transmitting ? "normal" : "warn",
  );

  renderTagList(elements.audibleSet, state.audibleParticipantIds, "nobody audible");
  renderParticipants(state);

  elements.togglePublish.disabled = !state.localTrackCreated;
  elements.togglePublish.textContent =
    state.localTrackPublished ? "Force Unpublish Track" : "Republish Track";
};

const harness = new VoipHarness({
  onLog: appendLog,
  onStateChange: render,
});

bridgePageLoaded("voip-test");

elements.togglePublish.addEventListener("click", () => {
  void harness.togglePublish().catch((error) => {
    appendLog({
      details: error instanceof Error ? error.stack || error.message : String(error),
      level: "error",
      message: "publish toggle failed",
      timestamp: new Date().toISOString(),
    });
    bridgeError("publish toggle failed", error);
  });
});

window.addEventListener("error", (event) => {
  bridgeError("voip-test page error", {
    colno: event.colno,
    filename: event.filename,
    lineno: event.lineno,
    message: event.message,
    stack: event.error instanceof Error ? event.error.stack || event.error.message : String(event.error),
  });
});

window.addEventListener("unhandledrejection", (event) => {
  bridgeError("voip-test unhandled rejection", event.reason);
});

void harness.start(readIdentityFromQuery()).catch((error) => {
  appendLog({
    details: error instanceof Error ? error.stack || error.message : String(error),
    level: "error",
    message: "VoIP bootstrap failed",
    timestamp: new Date().toISOString(),
  });
  bridgeError("VoIP bootstrap failed", error);
});

window.addEventListener("beforeunload", () => {
  harness.dispose();
});
