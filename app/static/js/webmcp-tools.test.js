import { describe, it } from "mocha";
import assert from "assert";

import { shutdown as requestShutdown } from "./controllers.js";
import * as communityControllers from "./controllers.js";
import { createTools, validateInput } from "./webmcp-tools.js";

const VIDEO_SETTINGS = {
  streamingMode: "MJPEG",
  mjpegFrameRate: 30,
  defaultMjpegFrameRate: 30,
  mjpegQuality: 80,
  defaultMjpegQuality: 80,
  h264Bitrate: 5000,
  defaultH264Bitrate: 5000,
  h264StunServer: null,
  defaultH264StunServer: null,
  h264StunPort: null,
  defaultH264StunPort: null,
};

function createDependencies({
  context = {
    isAdmin: true,
    username: "admin",
    isDemo: false,
  },
  apiResults = {},
  targetMethods = {},
  isPro = false,
} = {}) {
  const apiCalls = [];
  const targetCalls = [];
  const viewCalls = [];
  const defaultApiResults = {
    getVersion: { version: "2.6.3" },
    getLatestRelease: { version: "2.6.4", kind: "automatic", data: null },
    getVideoSettings: VIDEO_SETTINGS,
    getNetworkStatus: [],
    getWifiSettings: { countryCode: "US", ssid: "test-network" },
    determineHostname: "tinypilot",
    requiresHttps: true,
    getUsers: { users: [], currentUsername: context.username },
    getDebugLogs: "ordinary log line\n",
    getUpdateStatus: { status: "NOT_RUNNING", updateError: null },
    shutdown: { acknowledgment: "confirmed" },
  };
  const api = new Proxy(
    {},
    {
      get: (_target, method) => {
        if (!isPro && !Object.hasOwn(communityControllers, method))
          return undefined;
        return async (...args) => {
          apiCalls.push({ method, args });
          return Object.hasOwn(apiResults, method)
            ? apiResults[method]
            : defaultApiResults[method];
        };
      },
    }
  );
  const target = new Proxy(
    {},
    {
      get:
        (_target, method) =>
        async (...args) => {
          targetCalls.push({ method, args });
          if (Object.hasOwn(targetMethods, method)) {
            return targetMethods[method](...args);
          }
          if (method === "capture") {
            return { type: "image", data: "jpeg-data" };
          }
          return undefined;
        },
    }
  );
  const view = {
    getState: () => ({ connected: true }),
    setPreferences: (...args) =>
      viewCalls.push({
        method: "setPreferences",
        args,
      }),
    sessionChanged: (...args) =>
      viewCalls.push({
        method: "sessionChanged",
        args,
      }),
  };
  const tools = createTools({ api, target, view, context });
  return {
    apiCalls,
    targetCalls,
    tools,
    toolsByName: new Map(tools.map((tool) => [tool.name, tool])),
    viewCalls,
  };
}

const VALID_INPUTS = {
  get_tinypilot_status: {},
  get_about: {},
  request_display_mode: { mode: "fullscreen" },
  capture_screen: {},
  type_text: { text: "hello", language: "en-US" },
  send_key: { code: "Enter", modifiers: ["Control"] },
  send_keyboard_shortcut: { shortcut: "Ctrl+Alt+Delete" },
  move_pointer: { x: 0.25, y: 0.75 },
  click_pointer: { x: 0.25, y: 0.75, button: "left", count: 2 },
  drag_pointer: { fromX: 0.1, fromY: 0.2, toX: 0.8, toY: 0.9 },
  scroll_target: { x: 0.25, y: 0.75, direction: "down", steps: 3 },
  release_input: {},
  set_view_preferences: {
    cursor: "dot",
    keyboardVisible: true,
    keyHistoryVisible: false,
    pasteMasked: true,
  },
  get_video_settings: {},
  set_video_settings: { mjpegQuality: 75 },
  get_network_status: {},
  get_wifi_settings: {},
  configure_wifi: {
    ssid: "test-network",
    countryCode: "US",
    password: "test-password",
  },
  configure_open_wifi: {
    ssid: "guest-network",
    countryCode: "US",
  },
  forget_wifi: {},
  get_hostname: {},
  change_hostname: { hostname: "lab-tinypilot" },
  get_https_requirement: {},
  set_https_requirement: { required: true },
  list_users: {},
  add_user: { username: "new-admin", password: "test-password" },
  set_user_password: { username: "admin", password: "test-password" },
  change_my_password: { password: "test-password" },
  remove_user: { username: "old-admin" },
  disable_user_authentication: {},
  get_diagnostic_logs: { maxCharacters: 12000 },
  share_diagnostic_logs: {},
  check_for_updates: {},
  get_update_status: {},
  start_update: {},
  restart_tinypilot: {},
  shutdown_tinypilot: {},
  logout: {},
};

describe("WebMCP tool contracts", () => {
  it("defines unique, closed object schemas with a valid example for every tool", () => {
    const { tools } = createDependencies();
    assert.strictEqual(
      new Set(tools.map((tool) => tool.name)).size,
      tools.length
    );
    assert.deepStrictEqual(
      new Set(tools.map((tool) => tool.name)),
      new Set(Object.keys(VALID_INPUTS))
    );

    for (const tool of tools) {
      assert.strictEqual(typeof tool.title, "string", tool.name);
      assert.strictEqual(typeof tool.description, "string", tool.name);
      assert.strictEqual(typeof tool.category, "string", tool.name);
      assert.strictEqual(typeof tool.run, "function", tool.name);
      assert.strictEqual(tool.inputSchema.type, "object", tool.name);
      assert.strictEqual(
        tool.inputSchema.additionalProperties,
        false,
        tool.name
      );
      assert.doesNotThrow(
        () => validateInput(VALID_INPUTS[tool.name], tool.inputSchema),
        tool.name
      );
    }
  });

  it("enforces required, enum, range, uniqueness, and additional-property rules", () => {
    const { toolsByName } = createDependencies();
    const schema = (name) => toolsByName.get(name).inputSchema;

    assert.throws(
      () => validateInput({}, schema("send_key")),
      /input\.code is required/
    );
    assert.throws(
      () => validateInput({ code: "Power" }, schema("send_key")),
      /must be one of/
    );
    assert.throws(
      () =>
        validateInput(
          { code: "Enter", modifiers: ["Alt", "Alt"] },
          schema("send_key")
        ),
      /contains duplicates/
    );
    assert.throws(
      () => validateInput({ x: 1.1, y: 0.5 }, schema("move_pointer")),
      /outside the allowed range/
    );
    assert.throws(
      () =>
        validateInput(
          { x: 0.5, y: 0.5, unexpected: true },
          schema("move_pointer")
        ),
      /input\.unexpected is not allowed/
    );
  });

  it("marks credential inputs as write-only and enforces backend limits", () => {
    const { toolsByName } = createDependencies();
    const schema = (name) => toolsByName.get(name).inputSchema;

    assert.throws(
      () =>
        validateInput(
          { username: "a".repeat(21), password: "test-password" },
          schema("add_user")
        ),
      /invalid length/
    );
    for (const name of [
      "configure_wifi",
      "add_user",
      "set_user_password",
      "change_my_password",
    ]) {
      assert.strictEqual(
        schema(name).properties.password.writeOnly,
        true,
        name
      );
      assert.doesNotThrow(() =>
        validateInput(VALID_INPUTS[name], schema(name))
      );
    }
    assert.throws(
      () =>
        validateInput(
          { ssid: "guest", countryCode: "GB", password: "short" },
          schema("configure_wifi")
        ),
      /invalid length/
    );
    assert.doesNotThrow(() =>
      validateInput({ hostname: "rack-2" }, schema("change_hostname"))
    );
    assert.throws(
      () => validateInput({ hostname: "-invalid" }, schema("change_hostname")),
      /invalid format/
    );
    assert.throws(
      () =>
        validateInput({ hostname: "rack-2.lab" }, schema("change_hostname")),
      /invalid format/
    );
  });

  it("hides administrator and account tools when the page context lacks access", () => {
    const admin = createDependencies().tools;
    const operator = createDependencies({
      context: { isAdmin: false, username: "operator", isDemo: false },
    }).tools;
    const anonymous = createDependencies({
      context: { isAdmin: false, username: null, isDemo: false },
    }).tools;

    assert.deepStrictEqual(
      new Set(operator.map((tool) => tool.name)),
      new Set(admin.filter((tool) => !tool.admin).map((tool) => tool.name))
    );
    assert(operator.some((tool) => tool.name === "change_my_password"));
    assert(operator.some((tool) => tool.name === "logout"));
    assert(!operator.some((tool) => tool.admin));
    assert(!anonymous.some((tool) => tool.account));
    assert(!anonymous.some((tool) => tool.admin));
  });

  it("marks device-changing operations as destructive and security operations for HTTPS", () => {
    const { toolsByName } = createDependencies();
    const consequentialTools = [
      "configure_wifi",
      "configure_open_wifi",
      "forget_wifi",
      "change_hostname",
      "set_https_requirement",
      "add_user",
      "set_user_password",
      "change_my_password",
      "remove_user",
      "disable_user_authentication",
      "share_diagnostic_logs",
      "start_update",
      "restart_tinypilot",
      "shutdown_tinypilot",
    ];
    for (const name of consequentialTools) {
      const tool = toolsByName.get(name);
      assert.strictEqual(tool.destructive, true, name);
    }
    for (const name of [
      "configure_wifi",
      "set_https_requirement",
      "add_user",
      "set_user_password",
      "change_my_password",
      "remove_user",
      "disable_user_authentication",
    ]) {
      assert.strictEqual(toolsByName.get(name).secureOnly, true, name);
    }
  });
});

describe("WebMCP tool execution", () => {
  it("adapts Pro updates and account roles without passing options as license parameters", async () => {
    const { toolsByName, apiCalls } = createDependencies({ isPro: true });
    const options = {
      signal: new AbortController().signal,
    };
    await toolsByName.get("check_for_updates").run({}, options);
    assert.deepStrictEqual(
      apiCalls.find((call) => call.method === "getLatestRelease").args,
      [undefined, options]
    );
    const update = toolsByName.get("start_update");
    assert.throws(
      () => validateInput({}, update.inputSchema),
      /version is required/
    );
    validateInput({ version: "3.0.2" }, update.inputSchema);
    await update.run({ version: "3.0.2" }, options);
    assert.deepStrictEqual(
      apiCalls.find((call) => call.method === "update").args,
      ["3.0.2", options]
    );
    const addUser = toolsByName.get("add_user");
    const input = {
      username: "operator",
      password: "test-password",
      role: "OPERATOR",
    };
    validateInput(input, addUser.inputSchema);
    await addUser.run(input, options);
    assert.deepStrictEqual(
      apiCalls.find((call) => call.method === "addUser").args,
      ["operator", "test-password", "OPERATOR", options]
    );
  });

  it("reports the Pro URL-import capability withheld at the security boundary", async () => {
    const { toolsByName } = createDependencies({ isPro: true });
    const status = await toolsByName.get("get_tinypilot_status").run({}, {});
    assert.strictEqual(status.edition, "Pro");
    assert.strictEqual(status.withheldFeatures.length, 1);
    assert.match(status.withheldFeatures[0], /URL import/);
  });

  it("passes exact text, account, Wi-Fi, and shutdown arguments to controllers", async () => {
    const options = {
      signal: new AbortController().signal,
    };
    const { apiCalls, toolsByName, viewCalls } = createDependencies();

    await toolsByName
      .get("type_text")
      .run({ text: "hello", language: "en-GB" }, options);
    await toolsByName
      .get("add_user")
      .run({ username: "new-admin", password: "password123" }, options);
    await toolsByName
      .get("configure_wifi")
      .run(
        { countryCode: "FI", ssid: "office", password: "password123" },
        options
      );
    await toolsByName
      .get("configure_open_wifi")
      .run({ countryCode: "FI", ssid: "guest" }, options);
    await toolsByName.get("restart_tinypilot").run({}, options);
    await toolsByName.get("shutdown_tinypilot").run({}, options);

    assert.deepStrictEqual(apiCalls, [
      { method: "pasteText", args: ["hello", "en-GB", options] },
      {
        method: "addUser",
        args: ["new-admin", "password123", "ADMIN", options],
      },
      {
        method: "enableWifi",
        args: ["FI", "office", "password123", options],
      },
      {
        method: "enableWifi",
        args: ["FI", "guest", null, options],
      },
      { method: "shutdown", args: [true, options] },
      { method: "shutdown", args: [false, options] },
    ]);
    assert.deepStrictEqual(viewCalls, [{ method: "sessionChanged", args: [] }]);
  });

  it("translates keyboard and pointer calls and always releases held input", async () => {
    const options = { signal: new AbortController().signal };
    const { targetCalls, toolsByName } = createDependencies();

    await toolsByName
      .get("send_key")
      .run({ code: "KeyA", modifiers: ["Control", "Shift"] }, options);
    await toolsByName
      .get("click_pointer")
      .run({ x: 0.25, y: 0.75, button: "right", count: 1 }, options);

    assert.deepStrictEqual(targetCalls, [
      {
        method: "key",
        args: [
          {
            code: "KeyA",
            key: "KeyA",
            ctrlLeft: true,
            shiftLeft: true,
            altLeft: false,
            metaLeft: false,
          },
          options,
        ],
      },
      { method: "releaseKeys", args: [] },
      {
        method: "mouse",
        args: [{ x: 0.25, y: 0.75, buttons: 2 }, options],
      },
      {
        method: "mouse",
        args: [{ x: 0.25, y: 0.75, buttons: 0 }, options],
      },
      { method: "releasePointer", args: [] },
    ]);
  });

  it("retains omitted video settings, applies them, and returns refreshed state", async () => {
    const options = { signal: new AbortController().signal };
    const { apiCalls, toolsByName } = createDependencies();

    const result = await toolsByName
      .get("set_video_settings")
      .run({ mjpegQuality: 75 }, options);

    assert.deepStrictEqual(
      apiCalls.map(({ method }) => method),
      [
        "getVideoSettings",
        "saveVideoSettings",
        "applyVideoSettings",
        "getVideoSettings",
      ]
    );
    assert.deepStrictEqual(apiCalls[1].args, [
      { ...VIDEO_SETTINGS, mjpegQuality: 75 },
      options,
    ]);
    assert.deepStrictEqual(apiCalls[2].args, [options]);
    assert.strictEqual(result.saved, true);
    assert.strictEqual(result.applyRequested, true);
  });

  it("rejects empty or half-configured video settings before saving", async () => {
    const empty = createDependencies();
    await assert.rejects(
      empty.toolsByName.get("set_video_settings").run({}, {}),
      /at least one video setting/
    );
    assert.deepStrictEqual(empty.apiCalls, []);

    const halfConfigured = createDependencies();
    await assert.rejects(
      halfConfigured.toolsByName
        .get("set_video_settings")
        .run({ h264StunServer: "stun.example.com" }, {}),
      /STUN server and port must both be set/
    );
    assert.deepStrictEqual(
      halfConfigured.apiCalls.map(({ method }) => method),
      ["getVideoSettings"]
    );
  });

  it("honors aborts between multi-step actions and still releases pointer state", async () => {
    const controller = new AbortController();
    controller.abort();
    const { targetCalls, toolsByName } = createDependencies();

    await assert.rejects(
      toolsByName
        .get("click_pointer")
        .run(
          { x: 0.5, y: 0.5, button: "left", count: 1 },
          { signal: controller.signal }
        ),
      (error) => error.name === "AbortError"
    );
    assert.deepStrictEqual(targetCalls, [
      { method: "releasePointer", args: [] },
    ]);
  });

  it("does not upload diagnostic logs after an abort", async () => {
    const controller = new AbortController();
    controller.abort();
    const { apiCalls, toolsByName } = createDependencies({
      apiResults: {
        getDebugLogs: "[SENSITIVE] secret [/SENSITIVE]\n",
      },
    });

    await assert.rejects(
      toolsByName
        .get("share_diagnostic_logs")
        .run({}, { signal: controller.signal }),
      (error) => error.name === "AbortError"
    );
    assert.deepStrictEqual(
      apiCalls.map(({ method }) => method),
      ["getDebugLogs"]
    );
  });

  it("distinguishes acknowledged and uncertain appliance restarts", async () => {
    const confirmed = createDependencies();
    const confirmedResult = await confirmed.toolsByName
      .get("restart_tinypilot")
      .run({}, {});
    assert.strictEqual(confirmedResult.acknowledgment, "confirmed");
    assert.match(confirmedResult.message, /acknowledged/);

    const uncertain = createDependencies({
      apiResults: { shutdown: { acknowledgment: "uncertain" } },
    });
    const uncertainResult = await uncertain.toolsByName
      .get("shutdown_tinypilot")
      .run({}, {});
    assert.strictEqual(uncertainResult.acknowledgment, "uncertain");
    assert.match(uncertainResult.message, /connection closed/i);

    const hostnameResult = await uncertain.toolsByName
      .get("change_hostname")
      .run({ hostname: "rack-2" }, {});
    assert.strictEqual(hostnameResult.acknowledgment, "uncertain");
    assert.strictEqual(hostnameResult.hostname, "rack-2");
  });
});

describe("WebMCP power controller receipt", () => {
  it("reports HTTP acknowledgment separately from expected connection loss", async () => {
    const previousDocument = globalThis.document;
    const previousFetch = globalThis.fetch;
    globalThis.document = {
      querySelector: () => ({
        getAttribute: (name) => (name === "content" ? "csrf-token" : null),
      }),
    };
    try {
      globalThis.fetch = async () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      assert.deepStrictEqual(await requestShutdown(true), {
        acknowledgment: "confirmed",
      });

      globalThis.fetch = async () => new Response("", { status: 502 });
      assert.deepStrictEqual(await requestShutdown(false), {
        acknowledgment: "uncertain",
      });

      globalThis.fetch = async () => {
        throw new Error("NetworkError when attempting to fetch resource.");
      };
      assert.deepStrictEqual(await requestShutdown(true), {
        acknowledgment: "uncertain",
      });
    } finally {
      globalThis.fetch = previousFetch;
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  });
});
