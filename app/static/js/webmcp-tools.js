import { redactSensitiveData } from "./logs.js";

// These contracts describe application operations, not DOM selectors. The
// dashboard and WebMCP share the same controllers and authenticated transport.
const object = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const string = (description, maxLength = 128) => ({
  type: "string",
  description,
  minLength: 1,
  maxLength,
});
const boolean = (description) => ({ type: "boolean", description });
const secret = (description, minLength, maxLength) => ({
  type: "string",
  description,
  minLength,
  maxLength,
  writeOnly: true,
});
const choice = (values, description) => ({
  type: "string",
  enum: values,
  description,
});
const integer = (minimum, maximum, description) => ({
  type: "integer",
  minimum,
  maximum,
  description,
});
const coordinate = (axis) => ({
  type: "number",
  minimum: 0,
  maximum: 1,
  description: `${axis} position on the target screen, normalized from 0 to 1.`,
});
const xy = { x: coordinate("Horizontal"), y: coordinate("Vertical") };
const usernameSchema = {
  ...string("TinyPilot username.", 20),
  pattern: "^[A-Za-z0-9._-]+$",
};
const modifiers = {
  type: "array",
  items: choice(["Control", "Shift", "Alt", "Meta"], "Modifier key."),
  maxItems: 4,
  uniqueItems: true,
  description: "Modifier keys held with the key; all are released afterward.",
};
const shortcutKeys = {
  "Ctrl+Alt+Delete": { code: "Delete", ctrlLeft: true, altLeft: true },
  "Ctrl+Alt+Backspace": { code: "Backspace", ctrlLeft: true, altLeft: true },
  "Meta+Alt+Escape": { code: "Escape", metaLeft: true, altLeft: true },
  "Alt+Tab": { code: "Tab", altLeft: true },
};
const keyCodes = [
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((key) => `Key${key}`),
  ..."0123456789".split("").map((key) => `Digit${key}`),
  ...Array.from({ length: 12 }, (_, index) => `F${index + 1}`),
  ..."0123456789".split("").map((key) => `Numpad${key}`),
  "Escape",
  "Tab",
  "CapsLock",
  "Space",
  "Enter",
  "Backspace",
  "Delete",
  "Insert",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PrintScreen",
  "ScrollLock",
  "Pause",
  "Backquote",
  "Minus",
  "Equal",
  "BracketLeft",
  "BracketRight",
  "Backslash",
  "Semicolon",
  "Quote",
  "Comma",
  "Period",
  "Slash",
  "ContextMenu",
  "NumLock",
  "NumpadAdd",
  "NumpadSubtract",
  "NumpadMultiply",
  "NumpadDivide",
  "NumpadDecimal",
  "NumpadEnter",
  "ControlLeft",
  "ControlRight",
  "ShiftLeft",
  "ShiftRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
];

export const UNAVAILABLE_FEATURES = [
  "Virtual Media",
  "Wake on LAN",
  "Serial Console",
  "SSH management",
  "Static IP management",
  "Tailscale",
  "User scripts",
  "Relative mouse mode",
  "Two-factor authentication",
  "Automation License management",
];

/** Validate the deliberately small JSON Schema vocabulary used by our tools. */
export function validateInput(value, schema, path = "input") {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const matches = types.some((type) => {
    if (type === "null") return value === null;
    if (type === "array") return Array.isArray(value);
    if (type === "object") {
      return (
        value !== null && typeof value === "object" && !Array.isArray(value)
      );
    }
    if (type === "integer") return Number.isSafeInteger(value);
    if (type === "number")
      return typeof value === "number" && Number.isFinite(value);
    return typeof value === type;
  });
  if (!matches) throw new Error(`${path} must be ${types.join(" or ")}.`);
  if (schema.enum && !schema.enum.includes(value)) {
    throw new Error(`${path} must be one of: ${schema.enum.join(", ")}.`);
  }
  if (value === null) return;
  if (typeof value === "string") {
    if (
      value.length < (schema.minLength || 0) ||
      value.length > (schema.maxLength ?? Infinity)
    ) {
      throw new Error(`${path} has an invalid length.`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      throw new Error(`${path} has an invalid format.`);
    }
  }
  if (
    typeof value === "number" &&
    (value < (schema.minimum ?? -Infinity) ||
      value > (schema.maximum ?? Infinity))
  ) {
    throw new Error(`${path} is outside the allowed range.`);
  }
  if (Array.isArray(value)) {
    if (value.length > (schema.maxItems ?? Infinity))
      throw new Error(`${path} has too many items.`);
    if (schema.uniqueItems && new Set(value).size !== value.length)
      throw new Error(`${path} contains duplicates.`);
    value.forEach((item, index) =>
      validateInput(item, schema.items, `${path}[${index}]`)
    );
  } else if (typeof value === "object") {
    for (const required of schema.required || []) {
      if (!Object.hasOwn(value, required))
        throw new Error(`${path}.${required} is required.`);
    }
    for (const [key, item] of Object.entries(value)) {
      if (!Object.hasOwn(schema.properties || {}, key))
        throw new Error(`${path}.${key} is not allowed.`);
      validateInput(item, schema.properties[key], `${path}.${key}`);
    }
  }
}

/** All dependencies are injected so contracts can be tested without a device. */
export function createTools({ api, target, view, context }) {
  const isPro = typeof api.getProLicense === "function";
  const proFeatures = {
    "Virtual Media": "listMassStorageBackingFiles",
    "Wake on LAN": "sendWakeOnLanSignal",
    "Serial Console": "getSerialDevices",
    "SSH management": "toggleSsh",
    "Static IP management": "getStaticIp",
    Tailscale: "getTailscaleStatus",
    "User scripts": "getAllUserScripts",
  };
  const tools = [];
  const add = (
    name,
    title,
    category,
    description,
    schema,
    run,
    options = {}
  ) => {
    if (options.admin && !context.isAdmin) return;
    if (options.account && !context.username) return;
    tools.push({
      name,
      title,
      category,
      description,
      inputSchema: schema,
      run,
      readOnly: false,
      destructive: false,
      ...options,
    });
  };
  const read = { readOnly: true };
  const adminRead = { admin: true, readOnly: true };
  const adminWrite = () => ({ admin: true, destructive: true });
  const receipt = (message, data = {}) => ({ message, ...data });
  const key = async (input, options) => {
    try {
      await target.key(input, options);
      return receipt(
        "Keystroke acknowledged by TinyPilot. Inspect the target screen to verify its effect."
      );
    } finally {
      await target.releaseKeys();
    }
  };

  add(
    "get_tinypilot_status",
    "Inspect device",
    "Observe",
    "Read the device version, current browser session permissions, target connection and display state. This does not infer what is running on the attached computer.",
    object(),
    async (_, options) => ({
      ...(await api.getVersion(options)),
      ...view.getState(),
      edition: isPro ? "Pro" : "Community",
      isAdmin: context.isAdmin,
      signedIn: Boolean(context.username),
      demo: Boolean(context.isDemo),
      unavailableFeatures: UNAVAILABLE_FEATURES.filter(
        (feature) => typeof api[proFeatures[feature]] !== "function"
      ),
      withheldFeatures: isPro
        ? [
            "Virtual Media URL import: backend request-target hardening is required before WebMCP exposure.",
          ]
        : [],
    }),
    read
  );
  add(
    "get_about",
    "About TinyPilot",
    "Observe",
    "Read TinyPilot version and bundled open-source licensing metadata, as shown in Help > About. Does not return a Pro license key.",
    object(),
    async (_, options) => ({
      ...(await api.getVersion(options)),
      licensing: await api.getLicensingMetadata(options),
    }),
    read
  );
  add(
    "capture_screen",
    "Capture target screen",
    "Observe",
    "Capture the attached computer's current video frame. Returns an image content block and dimensions, and displays the captured frame in the dashboard. Screen contents may contain sensitive information.",
    object(),
    (_, options) => target.capture(options),
    { ...read, untrustedContent: true }
  );
  add(
    "type_text",
    "Type text",
    "Control",
    "Type text into the attached computer's currently focused field using USB keyboard input. This is not clipboard synchronization. Newlines can execute commands or submit forms. Use only for text the user intends to send to this target.",
    object(
      {
        text: string("Text to type into the target computer.", 10000),
        language: choice(
          ["en-US", "en-GB", "de-DE"],
          "Target keyboard layout; defaults to en-US."
        ),
      },
      ["text"]
    ),
    async ({ text, language = "en-US" }, options) => {
      await api.pasteText(text, language, options);
      return receipt(
        "Text was forwarded to the target. Inspect its screen to verify the result.",
        { charactersSent: text.length }
      );
    }
  );
  add(
    "send_key",
    "Press a key or chord",
    "Control",
    "Send a keyboard key or modifier chord to the attached computer, including function keys for BIOS/UEFI. Uses physical key codes (KeyA, Enter, F2). Modifiers are released afterward. May trigger an OS action.",
    object({ code: choice(keyCodes, "Physical keyboard code."), modifiers }, [
      "code",
    ]),
    ({ code, modifiers: held = [] }, options) =>
      key(
        {
          code,
          key: code,
          ctrlLeft: held.includes("Control"),
          shiftLeft: held.includes("Shift"),
          altLeft: held.includes("Alt"),
          metaLeft: held.includes("Meta"),
        },
        options
      )
  );
  add(
    "send_keyboard_shortcut",
    "Send system shortcut",
    "Control",
    "Send one of TinyPilot's four built-in shortcuts to the attached computer. These can open security or force-quit screens, restart a Linux desktop, or switch windows.",
    object(
      {
        shortcut: choice(
          Object.keys(shortcutKeys),
          "Shortcut to send to the target."
        ),
      },
      ["shortcut"]
    ),
    ({ shortcut }, options) =>
      key({ ...shortcutKeys[shortcut], key: shortcut }, options)
  );
  add(
    "move_pointer",
    "Move pointer",
    "Control",
    "Move the attached computer's pointer to normalized target-screen coordinates. Use a current screenshot to choose the location.",
    object(xy, ["x", "y"]),
    async ({ x, y }, options) => {
      await target.mouse({ x, y }, options);
      return { x, y, acknowledged: true };
    }
  );
  add(
    "click_pointer",
    "Click target",
    "Control",
    "Click at normalized target-screen coordinates. Supports left, right, middle, back, forward and double clicks. The clicked application can have its own side effects.",
    object(
      {
        ...xy,
        button: choice(
          ["left", "right", "middle", "back", "forward"],
          "Mouse button; defaults to left."
        ),
        count: integer(1, 2, "Single or double click; defaults to 1."),
      },
      ["x", "y"]
    ),
    async ({ x, y, button = "left", count = 1 }, options) => {
      try {
        for (let index = 0; index < count; index++) {
          options.signal?.throwIfAborted();
          await target.mouse(
            {
              x,
              y,
              buttons: { left: 1, right: 2, middle: 4, back: 8, forward: 16 }[
                button
              ],
            },
            options
          );
          await target.mouse({ x, y, buttons: 0 }, options);
        }
      } finally {
        await target.releasePointer();
      }
      return receipt(
        "Click acknowledged. Inspect the target screen to verify its effect.",
        { x, y, button, count }
      );
    }
  );
  add(
    "drag_pointer",
    "Drag on target",
    "Control",
    "Hold the left mouse button while moving between normalized screen coordinates, then release it. This can move or select items on the target computer.",
    object(
      {
        fromX: coordinate("Start horizontal"),
        fromY: coordinate("Start vertical"),
        toX: coordinate("End horizontal"),
        toY: coordinate("End vertical"),
      },
      ["fromX", "fromY", "toX", "toY"]
    ),
    async ({ fromX, fromY, toX, toY }, options) => {
      try {
        await target.mouse({ x: fromX, y: fromY, buttons: 1 }, options);
        for (let step = 1; step <= 8; step++) {
          options.signal?.throwIfAborted();
          await target.mouse(
            {
              x: fromX + ((toX - fromX) * step) / 8,
              y: fromY + ((toY - fromY) * step) / 8,
              buttons: 1,
            },
            options
          );
        }
      } finally {
        await target.releasePointer();
      }
      return receipt("Drag acknowledged and mouse button released.");
    }
  );
  add(
    "scroll_target",
    "Scroll target",
    "Control",
    "Scroll the target computer at normalized screen coordinates, vertically or horizontally, for a bounded number of wheel steps.",
    object(
      {
        ...xy,
        direction: choice(["up", "down", "left", "right"], "Scroll direction."),
        steps: integer(1, 20, "Number of wheel events; defaults to 3."),
      },
      ["x", "y", "direction"]
    ),
    async ({ x, y, direction, steps = 3 }, options) => {
      for (let step = 0; step < steps; step++) {
        options.signal?.throwIfAborted();
        await target.mouse(
          {
            x,
            y,
            vertical: { up: -1, down: 1 }[direction] || 0,
            horizontal: { left: -1, right: 1 }[direction] || 0,
          },
          options
        );
      }
      return { direction, steps, acknowledged: true };
    }
  );
  add(
    "release_input",
    "Release keyboard and mouse",
    "Control",
    "Release all held keyboard modifiers and mouse buttons on the attached computer. Useful after an interrupted interaction.",
    object(),
    async () => {
      await target.releaseKeys();
      await target.releasePointer();
      return receipt("Input release sent.");
    },
    {}
  );
  add(
    "set_view_preferences",
    "Adjust dashboard view",
    "View",
    "Set this browser's cursor, on-screen keyboard, key-history visibility, and paste masking. The normal View menu reflects the change. Does not change target OS preferences.",
    object({
      cursor: choice(
        ["default", "none", "crosshair", "dot", "pointer"],
        "Cursor style."
      ),
      keyboardVisible: boolean("Show the virtual keyboard."),
      keyHistoryVisible: boolean("Show recent keys in the status bar."),
      pasteMasked: boolean("Hide typed text in the paste dialog."),
      fullscreen: {
        type: "boolean",
        enum: [false],
        description:
          "Exit fullscreen. Use request_display_mode to enter with a person's click.",
      },
    }),
    async (input) => {
      await view.setPreferences(input);
      return view.getState();
    }
  );
  add(
    "request_display_mode",
    "Open fullscreen or dedicated window",
    "View",
    "Ask the person to enter fullscreen or open the existing dedicated console view. Browser user activation is required. Dedicated mode moves this console to a new window and ends this page's tool session; popup blocking is reported.",
    object(
      {
        mode: choice(
          ["fullscreen", "dedicated"],
          "Display mode to open after the person's click."
        ),
      },
      ["mode"]
    ),
    ({ mode }, options) => view.requestDisplayMode(mode, options),
    { destructive: true }
  );
  add(
    "get_video_settings",
    "Inspect video settings",
    "Video",
    "Read MJPEG/H.264 streaming settings and their defaults from TinyPilot.",
    object(),
    (_, options) => api.getVideoSettings(options),
    adminRead
  );
  add(
    "set_video_settings",
    "Tune video stream",
    "Video",
    "Update and apply only the specified video settings; omitted values are preserved. Applying restarts video services and may briefly interrupt the picture. MJPEG frame rate 1–30, quality 1–100, H.264 bitrate in kbps 50–20000. Return distinguishes saved settings from apply completion.",
    object({
      streamingMode: choice(["MJPEG", "H264"], "Streaming codec."),
      mjpegFrameRate: integer(1, 30, "MJPEG frames per second."),
      mjpegQuality: integer(1, 100, "MJPEG quality."),
      h264Bitrate: integer(50, 20000, "H.264 bitrate in kbps."),
      h264StunServer: {
        type: ["string", "null"],
        maxLength: 253,
        description:
          "STUN hostname or IP; null disables STUN. Set port with server.",
      },
      h264StunPort: {
        type: ["integer", "null"],
        minimum: 1,
        maximum: 65535,
        description: "STUN port, or null to disable STUN.",
      },
    }),
    async (input, options) => {
      if (Object.keys(input).length === 0)
        throw new Error("Specify at least one video setting.");
      const current = await api.getVideoSettings(options);
      const next = { ...current, ...input };
      if (Boolean(next.h264StunServer) !== Boolean(next.h264StunPort))
        throw new Error(
          "STUN server and port must both be set or both be null."
        );
      await api.saveVideoSettings(next, options);
      options.signal?.throwIfAborted();
      await api.applyVideoSettings(options);
      return receipt(
        "Settings saved; video service restart requested. Verify the live stream after reconnection.",
        {
          saved: true,
          applyRequested: true,
          settings: await api.getVideoSettings(options),
        }
      );
    },
    { admin: true }
  );
  add(
    "get_network_status",
    "Inspect network",
    "Network",
    "Read interface connection status, IP addresses and MAC addresses from TinyPilot.",
    object(),
    async (_, options) => ({ interfaces: await api.getNetworkStatus(options) }),
    adminRead
  );
  add(
    "get_wifi_settings",
    "Inspect Wi-Fi",
    "Network",
    "Read configured Wi-Fi network name and country. Never returns the password.",
    object(),
    (_, options) => api.getWifiSettings(options),
    adminRead
  );
  add(
    "configure_wifi",
    "Configure Wi-Fi",
    "Network",
    "Save TinyPilot's Wi-Fi network credentials. Can disconnect the current session. The password is never logged.",
    object(
      {
        ssid: string("Wireless network name.", 32),
        countryCode: {
          ...string("Two-letter country code.", 2),
          minLength: 2,
          pattern: "^[A-Za-z]{2}$",
        },
        password: secret("Wi-Fi password. This value is never logged.", 8, 63),
      },
      ["ssid", "countryCode", "password"]
    ),
    async ({ countryCode, ssid, password }, options) => {
      await api.enableWifi(countryCode, ssid, password, options);
      return receipt(
        "Wi-Fi configuration saved. The network connection may change."
      );
    },
    {
      ...adminWrite(
        "Change this TinyPilot's Wi-Fi connection? Your current connection may be interrupted."
      ),
      secureOnly: true,
    }
  );
  add(
    "configure_open_wifi",
    "Configure open Wi-Fi",
    "Network",
    "Save an open Wi-Fi network with no password. This can disconnect the current session and sends null to the same backend used by the dashboard. ",
    object(
      {
        ssid: string("Open wireless network name.", 32),
        countryCode: {
          ...string("Two-letter country code.", 2),
          minLength: 2,
          pattern: "^[A-Za-z]{2}$",
        },
      },
      ["ssid", "countryCode"]
    ),
    async ({ countryCode, ssid }, options) => {
      await api.enableWifi(countryCode, ssid, null, options);
      return receipt(
        "Open Wi-Fi configuration saved. The network connection may change."
      );
    },
    adminWrite(
      "Connect this TinyPilot to an open Wi-Fi network with no password? Network traffic may be exposed and your current connection may be interrupted."
    )
  );
  add(
    "forget_wifi",
    "Remove Wi-Fi credentials",
    "Network",
    "Remove TinyPilot's saved Wi-Fi network and password. Can disconnect the current session. ",
    object(),
    async (_, options) => {
      await api.disableWifi(options);
      return receipt("Wi-Fi credentials removed.");
    },
    adminWrite(
      "Remove saved Wi-Fi credentials? A Wi-Fi connection to this TinyPilot will be lost."
    )
  );
  add(
    "get_hostname",
    "Inspect hostname",
    "Network",
    "Read the TinyPilot appliance hostname.",
    object(),
    async (_, options) => ({ hostname: await api.determineHostname(options) }),
    adminRead
  );
  add(
    "change_hostname",
    "Change hostname",
    "Network",
    "Change the TinyPilot appliance hostname and request a restart, matching the dashboard.  Interrupts access; reconnect using the returned URL.",
    object(
      {
        hostname: {
          ...string("New appliance hostname, without .local.", 63),
          pattern: "^[a-z0-9][a-z0-9-]*$",
        },
      },
      ["hostname"]
    ),
    async ({ hostname }, options) => {
      if (hostname === "localhost")
        throw new Error("localhost is not a valid TinyPilot hostname.");
      await api.changeHostname(hostname, options);
      options.signal?.throwIfAborted();
      const restart = await api.shutdown(true, options);
      const acknowledgment = restart?.acknowledgment || "confirmed";
      return {
        hostname,
        reconnectUrl: `https://${hostname}.local/`,
        restartRequested: true,
        acknowledgment,
        message:
          acknowledgment === "confirmed"
            ? "Hostname changed and the restart request was acknowledged. Verify the device using its new address."
            : "Hostname changed, but the connection closed before the restart request was acknowledged. Verify the device before retrying.",
      };
    },
    adminWrite(
      "Change the hostname and restart this TinyPilot? Its network address will change and remote access will be interrupted."
    )
  );
  add(
    "get_https_requirement",
    "Inspect HTTPS policy",
    "Security",
    "Read whether TinyPilot requires encrypted connections.",
    object(),
    async (_, options) => ({ requiresHttps: await api.requiresHttps(options) }),
    adminRead
  );
  add(
    "set_https_requirement",
    "Set HTTPS policy",
    "Security",
    "Require or stop requiring HTTPS for this TinyPilot. Disabling weakens connection protection. Requires an HTTPS page.",
    object({ required: boolean("Whether all clients must use HTTPS.") }, [
      "required",
    ]),
    async ({ required }, options) => {
      await api.setRequiresHttps(required, options);
      return { requiresHttps: await api.requiresHttps(options) };
    },
    {
      ...adminWrite(
        "Change the encrypted-connection requirement for this TinyPilot? Disabling allows unencrypted access."
      ),
      secureOnly: true,
    }
  );
  add(
    "list_users",
    "List users",
    "Security",
    "List authorized TinyPilot users and the signed-in user, without credentials.",
    object(),
    (_, options) => api.getUsers(options),
    adminRead
  );
  add(
    "add_user",
    "Add user",
    "Security",
    `Create a TinyPilot account and enable authentication if this is the first user. ${
      isPro
        ? "Pro supports ADMIN and OPERATOR roles."
        : "Community supports administrator accounts."
    } Requires HTTPS. The password is never logged.`,
    object(
      {
        username: usernameSchema,
        password: secret("New password. This value is never logged.", 6, 60),
        ...(isPro
          ? {
              role: choice(
                ["ADMIN", "OPERATOR"],
                "Account role; defaults to ADMIN."
              ),
            }
          : {}),
      },
      ["username", "password"]
    ),
    async ({ username, password, role = "ADMIN" }, options) => {
      const result = await api.addUser(username, password, role, options);
      view.sessionChanged();
      return result;
    },
    {
      ...adminWrite(
        "Create this account with access to this TinyPilot and its attached computer?"
      ),
      secureOnly: true,
    }
  );
  add(
    "set_user_password",
    "Change user password",
    "Security",
    "Replace a TinyPilot user's password. Requires HTTPS. The password is never logged.",
    object(
      {
        username: usernameSchema,
        password: secret("New password. This value is never logged.", 6, 60),
      },
      ["username", "password"]
    ),
    async ({ username, password }, options) => {
      await api.updateUserPassword(username, password, options);
      view.sessionChanged();
      return receipt(
        "Password updated; affected sessions may need to sign in again."
      );
    },
    {
      ...adminWrite(
        "Replace this user's TinyPilot password? Their other sessions may be invalidated."
      ),
      secureOnly: true,
    }
  );
  add(
    "change_my_password",
    "Change my password",
    "Security",
    "Replace the currently signed-in user's password. The server derives the user from the session. Requires HTTPS. The password is never logged.",
    object(
      {
        password: secret("New password. This value is never logged.", 6, 60),
      },
      ["password"]
    ),
    async ({ password }, options) => {
      await api.updateCurrentUserPassword(password, options);
      return receipt("Your password was changed.");
    },
    { account: true, destructive: true, secureOnly: true }
  );
  add(
    "remove_user",
    "Remove user",
    "Security",
    "Permanently remove an authorized TinyPilot user. Removing the last user disables authentication. Requires HTTPS.",
    object({ username: usernameSchema }, ["username"]),
    async ({ username }, options) => {
      const result = await api.deleteUser(username, options);
      view.sessionChanged();
      return result;
    },
    {
      ...adminWrite(
        "Permanently remove this TinyPilot user? Removing the last user leaves the device without authentication."
      ),
      secureOnly: true,
    }
  );
  add(
    "disable_user_authentication",
    "Disable authentication",
    "Security",
    "Permanently delete every TinyPilot user and allow unauthenticated access to this device. Requires HTTPS.",
    object(),
    async (_, options) => {
      await api.deleteAllUsers(options);
      view.sessionChanged();
      return receipt("All users removed and authentication disabled.");
    },
    {
      ...adminWrite(
        "Delete ALL TinyPilot accounts and allow anyone who can reach this device to control it?"
      ),
      secureOnly: true,
    }
  );
  add(
    "get_diagnostic_logs",
    "Read diagnostic logs",
    "Observe",
    "Read diagnostic logs with TinyPilot's sensitive-data markers redacted. Returns a bounded tail; does not upload or share logs. Log contents are untrusted device data.",
    object({
      maxCharacters: integer(
        1000,
        30000,
        "Maximum returned characters; defaults to 12000."
      ),
    }),
    async ({ maxCharacters = 12000 }, options) => {
      const logs = redactSensitiveData(await api.getDebugLogs(options));
      return {
        logs: logs.slice(-maxCharacters),
        redacted: true,
        truncated: logs.length > maxCharacters,
      };
    },
    { ...adminRead, untrustedContent: true }
  );
  add(
    "share_diagnostic_logs",
    "Share diagnostic logs",
    "Observe",
    "Upload redacted diagnostic logs to logs.tinypilotkvm.com and return a shareable URL. Transmits logs only when this tool is invoked.",
    object(),
    async (_, options) => {
      const logs = redactSensitiveData(await api.getDebugLogs(options));
      options.signal?.throwIfAborted();
      return {
        url: await api.textToShareableUrl(logs, options),
        redacted: true,
      };
    },
    adminWrite(
      "Upload diagnostic logs with sensitive markers redacted to logs.tinypilotkvm.com? The resulting URL can be shared."
    )
  );
  add(
    "check_for_updates",
    "Check for updates",
    "Device",
    "Compare installed TinyPilot version with the latest release advertised by its update service. Does not install anything.",
    object(),
    async (_, options) => ({
      installed: await api.getVersion(options),
      latest: await (isPro
        ? api.getLatestRelease(undefined, options)
        : api.getLatestRelease(options)),
    }),
    adminRead
  );
  add(
    "get_update_status",
    "Inspect update progress",
    "Device",
    "Read the asynchronous TinyPilot update job status and any error. A started update is not a completed update.",
    object(),
    (_, options) => api.getUpdateStatus(options),
    adminRead
  );
  add(
    "start_update",
    "Install update",
    "Device",
    "Start TinyPilot's normal software updater.  Poll get_update_status until DONE without an error, then restart_tinypilot to finish installation. This tool does not wait for completion or restart automatically.",
    isPro
      ? object(
          {
            version: {
              ...string(
                "Exact release version returned by check_for_updates.",
                80
              ),
              pattern: "^[0-9]+\\.[0-9]+\\.[0-9]+(?:[-+][A-Za-z0-9.-]+)?$",
            },
          },
          ["version"]
        )
      : object(),
    async ({ version }, options) => {
      await (isPro ? api.update(version, options) : api.update(options));
      return receipt(
        "Update requested. Poll get_update_status; when DONE without an error, restart TinyPilot to complete installation.",
        { status: "requested", restartRequiredAfterUpdate: true }
      );
    },
    adminWrite(
      "Start the TinyPilot update? Wait for it to finish before requesting a restart to complete installation."
    )
  );
  for (const restart of [true, false]) {
    const action = restart ? "Restart" : "Shut down";
    add(
      restart ? "restart_tinypilot" : "shutdown_tinypilot",
      `${action} TinyPilot`,
      "Device",
      `${action} the TinyPilot appliance itself, not the attached computer.  Acknowledgment is not proof that the appliance completed the operation.`,
      object(),
      async (_, options) => {
        const result = await api.shutdown(restart, options);
        const acknowledgment = result?.acknowledgment || "confirmed";
        return receipt(
          acknowledgment === "confirmed"
            ? `${action} request acknowledged by TinyPilot. Completion must be verified after disconnection.`
            : `The connection closed before TinyPilot acknowledged the ${action.toLowerCase()} request. Inspect the appliance before retrying.`,
          {
            status: "requested",
            target: "tinypilot-appliance",
            acknowledgment,
          }
        );
      },
      adminWrite(
        `${action} this TinyPilot appliance? Remote video and control will be disconnected.${
          restart ? "" : " Physical access may be needed to power it on again."
        }`
      )
    );
  }
  add(
    "logout",
    "Sign out",
    "Security",
    "End the current TinyPilot browser session. Tools become unavailable after signing out.",
    object(),
    async (_, options) => {
      await api.logout(options);
      view.sessionChanged();
      return receipt("Signed out.");
    },
    { account: true }
  );
  return tools;
}
