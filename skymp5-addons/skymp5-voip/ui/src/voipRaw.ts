import {
  bridgeError,
  bridgePageLoaded,
  readIdentityFromQuery,
  VoipHarness,
  VoipLogEntry,
  VoipState,
} from "./shared";

const RAW_PAGE_FORCE_AUDIBLE = true;
const RAW_PAGE_PTT_KEYS = new Set(["KeyV", "Space"]);

const root = document.getElementById("root");
if (!root) {
  throw new Error("VoIP raw root element was not found");
}

document.body.style.margin = "0";
document.body.style.fontFamily = "Consolas, \"Courier New\", monospace";
document.body.style.background = "#05070b";
document.body.style.color = "#f8fafc";

root.innerHTML = `
  <style>
    .raw-shell {
      min-height: 100vh;
      padding: 18px;
      box-sizing: border-box;
      background: linear-gradient(180deg, rgba(3, 7, 18, 0.98), rgba(5, 9, 15, 0.98));
    }
    .raw-card {
      max-width: 980px;
      margin: 0 auto;
      border: 1px solid rgba(56, 189, 248, 0.2);
      background: rgba(9, 13, 21, 0.92);
      border-radius: 14px;
      padding: 16px;
      display: grid;
      gap: 14px;
    }
    .raw-card h1 {
      margin: 0;
      font-size: 18px;
      color: #93c5fd;
    }
    .raw-grid {
      display: grid;
      grid-template-columns: 170px 1fr;
      gap: 8px 10px;
      font-size: 13px;
      line-height: 1.4;
    }
    .raw-grid dt {
      color: #94a3b8;
    }
    .raw-grid dd {
      margin: 0;
      word-break: break-word;
    }
    .checklist {
      margin: 0;
      padding-left: 18px;
      display: grid;
      gap: 6px;
      font-size: 13px;
    }
    .ok {
      color: #4ade80;
    }
    .pending {
      color: #fbbf24;
    }
    .raw-meter {
      height: 10px;
      border-radius: 999px;
      background: #1e293b;
      overflow: hidden;
      border: 1px solid rgba(148, 163, 184, 0.2);
    }
    .raw-meter-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #22c55e, #38bdf8);
      transition: width 80ms linear;
    }
    .raw-button {
      appearance: none;
      border: 1px solid rgba(125, 211, 252, 0.25);
      background: #0f766e;
      color: #f8fafc;
      border-radius: 999px;
      padding: 9px 14px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      width: fit-content;
    }
    .raw-button[disabled] {
      opacity: 0.45;
      cursor: not-allowed;
    }
    .raw-log {
      margin: 0;
      max-height: 280px;
      overflow: auto;
      white-space: pre-wrap;
      font-size: 12px;
      line-height: 1.45;
    }
    .raw-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      min-height: 18px;
    }
    .raw-tag {
      display: inline-flex;
      gap: 4px;
      align-items: center;
      border-radius: 999px;
      padding: 3px 8px;
      background: rgba(30, 41, 59, 0.88);
      border: 1px solid rgba(96, 165, 250, 0.16);
      font-size: 12px;
    }
    .raw-participants {
      display: grid;
      gap: 8px;
      font-size: 12px;
    }
    .raw-participant {
      border: 1px solid rgba(56, 189, 248, 0.12);
      background: rgba(15, 23, 42, 0.55);
      border-radius: 10px;
      padding: 8px 10px;
      display: grid;
      gap: 4px;
    }
    @media (max-width: 720px) {
      .raw-grid {
        grid-template-columns: 1fr;
      }
    }
  </style>
  <div class="raw-shell">
    <div class="raw-card">
      <h1>SkyMP VoIP Raw Fallback</h1>
      <dl class="raw-grid">
        <dt>Identity</dt><dd id="raw-identity">pending</dd>
        <dt>Local Participant ID</dt><dd id="raw-local-id">pending</dd>
        <dt>Room</dt><dd id="raw-room">pending</dd>
        <dt>Signal URL</dt><dd id="raw-ws-url">pending</dd>
        <dt>ICE Policy</dt><dd id="raw-ice-policy">all</dd>
        <dt>Server Time</dt><dd id="raw-server-time">pending</dd>
        <dt>Valid For</dt><dd id="raw-validity">pending</dd>
        <dt>Connection</dt><dd id="raw-connection">idle</dd>
        <dt>Voice Mode</dt><dd id="raw-voice-mode">say</dd>
        <dt>PTT</dt><dd id="raw-ptt">released</dd>
        <dt>Transmitting</dt><dd id="raw-transmitting">silent</dd>
        <dt>Radius</dt><dd id="raw-radius">pending</dd>
        <dt>Positional Mode</dt><dd id="raw-positional">off</dd>
        <dt>World / Cell</dt><dd id="raw-world">pending</dd>
        <dt>Mic Permission</dt><dd id="raw-mic">unknown</dd>
        <dt>getUserMedia</dt><dd id="raw-gum">pending</dd>
        <dt>Input Device</dt><dd id="raw-device">(unknown device)</dd>
        <dt>Publish State</dt><dd id="raw-publish">unpublished</dd>
        <dt>Track Muted</dt><dd id="raw-muted">no</dd>
        <dt>Participant Count</dt><dd id="raw-count">0</dd>
      </dl>
      <div>
        <div style="margin-bottom: 6px; font-size: 12px; color: #94a3b8;">Current audible set</div>
        <div id="raw-audible" class="raw-tags"></div>
      </div>
      <div>
        <div style="margin-bottom: 6px; font-size: 12px; color: #94a3b8;">Local speaking meter</div>
        <div class="raw-meter"><div id="raw-meter-fill" class="raw-meter-fill"></div></div>
      </div>
      <div style="font-size: 12px; color: #94a3b8;">
        Raw page overrides proximity and subscribes to everyone in the room. Hold <strong>V</strong> or <strong>Space</strong> for PTT.
      </div>
      <button id="raw-toggle" type="button" class="raw-button" disabled>Force Publish Track</button>
      <div>
        <div style="margin-bottom: 8px; font-size: 13px; color: #93c5fd;">Self-test checklist</div>
        <ul id="raw-checklist" class="checklist"></ul>
      </div>
      <div>
        <div style="margin-bottom: 8px; font-size: 13px; color: #93c5fd;">Participant Debug</div>
        <div id="raw-participants" class="raw-participants"></div>
      </div>
      <pre id="raw-log" class="raw-log"></pre>
    </div>
  </div>
`;

const elements = {
  audible: document.getElementById("raw-audible") as HTMLDivElement,
  checklist: document.getElementById("raw-checklist") as HTMLUListElement,
  connection: document.getElementById("raw-connection") as HTMLDivElement,
  count: document.getElementById("raw-count") as HTMLDivElement,
  device: document.getElementById("raw-device") as HTMLDivElement,
  gum: document.getElementById("raw-gum") as HTMLDivElement,
  icePolicy: document.getElementById("raw-ice-policy") as HTMLDivElement,
  identity: document.getElementById("raw-identity") as HTMLDivElement,
  localId: document.getElementById("raw-local-id") as HTMLDivElement,
  log: document.getElementById("raw-log") as HTMLPreElement,
  meter: document.getElementById("raw-meter-fill") as HTMLDivElement,
  mic: document.getElementById("raw-mic") as HTMLDivElement,
  muted: document.getElementById("raw-muted") as HTMLDivElement,
  participants: document.getElementById("raw-participants") as HTMLDivElement,
  positional: document.getElementById("raw-positional") as HTMLDivElement,
  publish: document.getElementById("raw-publish") as HTMLDivElement,
  ptt: document.getElementById("raw-ptt") as HTMLDivElement,
  radius: document.getElementById("raw-radius") as HTMLDivElement,
  room: document.getElementById("raw-room") as HTMLDivElement,
  serverTime: document.getElementById("raw-server-time") as HTMLDivElement,
  toggle: document.getElementById("raw-toggle") as HTMLButtonElement,
  transmitting: document.getElementById("raw-transmitting") as HTMLDivElement,
  validity: document.getElementById("raw-validity") as HTMLDivElement,
  voiceMode: document.getElementById("raw-voice-mode") as HTMLDivElement,
  world: document.getElementById("raw-world") as HTMLDivElement,
  wsUrl: document.getElementById("raw-ws-url") as HTMLDivElement,
};

const logLines: string[] = [];
const stickyChecklist = {
  localSpeakingMeterMoved: false,
  localTrackCreated: false,
  micPermissionGranted: false,
  remoteParticipantJoined: false,
  remoteTrackSubscribed: false,
  voiceModeArrived: false,
};

const renderChecklist = () => {
  const entries = [
    ["mic permission granted", stickyChecklist.micPermissionGranted],
    ["local track created", stickyChecklist.localTrackCreated],
    ["local speaking meter moves", stickyChecklist.localSpeakingMeterMoved],
    ["voice mode arrived", stickyChecklist.voiceModeArrived],
    ["remote participant joined", stickyChecklist.remoteParticipantJoined],
    ["remote track subscribed", stickyChecklist.remoteTrackSubscribed],
  ];

  elements.checklist.innerHTML = "";
  for (const [label, passed] of entries) {
    const item = document.createElement("li");
    item.className = passed ? "ok" : "pending";
    item.textContent = `${passed ? "[x]" : "[ ]"} ${label}`;
    elements.checklist.appendChild(item);
  }
};

const renderAudibleSet = (values: string[]) => {
  elements.audible.innerHTML = "";
  if (values.length === 0) {
    const tag = document.createElement("span");
    tag.className = "raw-tag";
    tag.textContent = "nobody audible";
    elements.audible.appendChild(tag);
    return;
  }

  for (const value of values) {
    const tag = document.createElement("span");
    tag.className = "raw-tag";
    tag.textContent = value;
    elements.audible.appendChild(tag);
  }
};

const renderParticipants = (state: VoipState) => {
  elements.participants.innerHTML = "";
  if (state.participantStates.length === 0) {
    elements.participants.textContent = "No participant debug yet";
    return;
  }

  for (const participant of state.participantStates) {
    const block = document.createElement("div");
    block.className = "raw-participant";
    block.textContent =
      `${participant.identity} | ${participant.mode} | ` +
      `${participant.audibleByPolicy ? "audible" : "muted"} | ` +
      `gain=${participant.gain === null ? "n/a" : participant.gain.toFixed(2)} | ` +
      `distance=${participant.distance === null ? "n/a" : participant.distance.toFixed(2)} | ` +
      `pan=${participant.pan === null ? "n/a" : participant.pan.toFixed(2)} | ` +
      `graph=${participant.graphMode || "detached"} | ` +
      `pos=${participant.position ? `${participant.position.x.toFixed(1)},${participant.position.y.toFixed(1)},${participant.position.z.toFixed(1)}` : "n/a"}`;
    elements.participants.appendChild(block);
  }
};

const appendLog = (entry: VoipLogEntry) => {
  const suffix = entry.details ? ` ${entry.details}` : "";
  logLines.push(`${entry.timestamp} [${entry.level}] ${entry.message}${suffix}`);
  if (logLines.length > 120) {
    logLines.shift();
  }
  elements.log.textContent = logLines.join("\n");
  elements.log.scrollTop = elements.log.scrollHeight;
};

const render = (state: VoipState) => {
  stickyChecklist.micPermissionGranted ||= state.micPermissionStatus === "granted";
  stickyChecklist.localTrackCreated ||= state.localTrackCreated;
  stickyChecklist.localSpeakingMeterMoved ||= state.localSpeakingLevel > 0.06;
  stickyChecklist.remoteParticipantJoined ||= state.remoteParticipantJoined;
  stickyChecklist.remoteTrackSubscribed ||= state.remoteTrackSubscribed;
  stickyChecklist.voiceModeArrived ||= !!state.voiceMode;

  elements.identity.textContent = state.identity || "missing";
  elements.localId.textContent = state.localParticipantId || "pending";
  elements.room.textContent = state.roomName || "pending";
  elements.wsUrl.textContent = state.wsUrl || "pending";
  elements.icePolicy.textContent = state.iceTransportPolicy;
  elements.serverTime.textContent = state.serverTime || "pending";
  elements.validity.textContent =
    state.tokenValidForSeconds === null ? "pending" : `valid for ${state.tokenValidForSeconds}s`;
  elements.connection.textContent = state.connectionStatus;
  elements.voiceMode.textContent = state.voiceMode;
  elements.ptt.textContent = state.pttActive ? "held" : "released";
  elements.transmitting.textContent = state.transmitting ? "transmitting" : "silent";
  elements.radius.textContent = RAW_PAGE_FORCE_AUDIBLE
    ? "bypassed"
    : state.proximityRadius === null
      ? "pending"
      : String(state.proximityRadius);
  elements.positional.textContent = state.positionalAudioMode;
  elements.world.textContent = state.worldOrCell || "pending";
  elements.mic.textContent = state.micPermissionStatus;
  elements.gum.textContent =
    state.getUserMediaSucceeded === null
      ? "pending"
      : state.getUserMediaSucceeded
        ? "succeeded"
        : "failed";
  elements.device.textContent = state.selectedInputDeviceLabel || "(unknown device)";
  elements.publish.textContent = state.localPublishState;
  elements.muted.textContent = state.localTrackMuted ? "yes" : "no";
  elements.count.textContent = String(state.participantCount);
  elements.meter.style.width = `${Math.round(state.localSpeakingLevel * 100)}%`;
  elements.toggle.disabled = !state.localTrackCreated;
  elements.toggle.textContent =
    state.localTrackPublished ? "Force Unpublish Track" : "Republish Track";

  renderAudibleSet(state.audibleParticipantIds);
  renderParticipants(state);
  renderChecklist();
};

const harness = new VoipHarness(
  {
    onLog: appendLog,
    onStateChange: render,
  },
  {
    forceAudibleParticipants: RAW_PAGE_FORCE_AUDIBLE,
  },
);

bridgePageLoaded("voip-raw");

elements.toggle.addEventListener("click", () => {
  void harness.togglePublish().catch((error) => {
    appendLog({
      details: error instanceof Error ? error.stack || error.message : String(error),
      level: "error",
      message: "publish toggle failed",
      timestamp: new Date().toISOString(),
    });
    bridgeError("raw publish toggle failed", error);
  });
});

let rawPttHeld = false;
const setRawPttHeld = (active: boolean) => {
  if (rawPttHeld === active) {
    return;
  }

  rawPttHeld = active;
  void harness.setDebugPttActive(active).catch((error) => {
    appendLog({
      details: error instanceof Error ? error.stack || error.message : String(error),
      level: "error",
      message: "raw PTT update failed",
      timestamp: new Date().toISOString(),
    });
    bridgeError("raw PTT update failed", error);
  });
};

window.addEventListener("keydown", (event) => {
  if (event.repeat || !RAW_PAGE_PTT_KEYS.has(event.code)) {
    return;
  }

  event.preventDefault();
  setRawPttHeld(true);
});

window.addEventListener("keyup", (event) => {
  if (!RAW_PAGE_PTT_KEYS.has(event.code)) {
    return;
  }

  event.preventDefault();
  setRawPttHeld(false);
});

window.addEventListener("blur", () => {
  setRawPttHeld(false);
});

window.addEventListener("error", (event) => {
  bridgeError("raw page error", {
    message: event.message,
    stack: event.error instanceof Error ? event.error.stack || event.error.message : String(event.error),
  });
});

window.addEventListener("unhandledrejection", (event) => {
  bridgeError("raw unhandled rejection", event.reason);
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
  setRawPttHeld(false);
  harness.dispose();
});
