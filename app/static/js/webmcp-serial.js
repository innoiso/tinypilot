// Original adapter for ttyd's documented, public wire protocol (version 1.7.7):
// https://github.com/tsl0922/ttyd/blob/1.7.7/src/server.h
// https://github.com/tsl0922/ttyd/blob/1.7.7/html/src/components/terminal/xterm/index.ts
// The deployment must protect /ttyd/ws with TinyPilot's existing /auth check.
// No device connection is made merely by importing or registering this module.
const object = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const integer = (minimum, maximum, description) => ({
  type: "integer",
  minimum,
  maximum,
  description,
});
const dimensions = {
  columns: integer(20, 240, "Terminal columns; defaults to 120 on connect."),
  rows: integer(5, 100, "Terminal rows; defaults to 30 on connect."),
};
const stopped = () =>
  new DOMException("Serial operation stopped.", "AbortError");

// This is a plain-text transcript, not a terminal emulator. Stateful filtering
// also discards OSC/DCS sequences split across WebSocket frames, so terminal
// escape payloads never become executable page markup or clipboard commands.
function createTextFilter() {
  let state = "text";
  let stringState = "string";
  return (input) => {
    let output = "";
    for (const character of input) {
      const code = character.charCodeAt(0);
      if (state === "string-escape") {
        state = character === "\\" ? "text" : stringState;
        continue;
      }
      if (state === "string" || state === "osc") {
        if (code === 156) {
          state = "text";
        } else if (code === 27) {
          stringState = state;
          state = "string-escape";
        } else if (state === "osc" && code === 7) {
          state = "text";
        }
        continue;
      }
      if (state === "csi") {
        if (code >= 64 && code <= 126) state = "text";
        continue;
      }
      if (state === "escape") {
        state =
          character === "["
            ? "csi"
            : character === "]"
            ? "osc"
            : ["P", "^", "_"].includes(character)
            ? "string"
            : "text";
        continue;
      }
      if (code === 27) {
        state = "escape";
      } else if (code === 155) {
        state = "csi";
      } else if (code === 157) {
        state = "osc";
      } else if (code === 144 || code === 158 || code === 159) {
        state = "string";
      } else if (
        character === "\n" ||
        character === "\r" ||
        character === "\t" ||
        (code >= 32 && (code < 127 || code > 159))
      ) {
        output += character;
      }
    }
    return output;
  };
}

/**
 * Returns optional descriptors and lifecycle hooks. Enabling is an explicit
 * deployment assertion that the audited nginx authentication patch is present.
 * Tests inject transport primitives; production always uses the page's origin.
 */
export function createSerialIntegration({
  api,
  context = {},
  fetchImpl = globalThis.fetch,
  WebSocketImpl = globalThis.WebSocket,
  origin = globalThis.location?.origin,
  connectTimeoutMs = 10000,
} = {}) {
  const tools = [];
  const unavailable = { tools, stop: async () => {}, dispose: async () => {} };
  if (
    context.serialToolsEnabled !== true ||
    typeof api?.getSerialTerminalConnection !== "function" ||
    typeof api?.getSerialDevices !== "function" ||
    typeof fetchImpl !== "function" ||
    typeof WebSocketImpl !== "function"
  ) {
    return unavailable;
  }
  let page;
  try {
    page = new URL(origin);
  } catch {
    return unavailable;
  }
  if (page.protocol !== "https:") return unavailable;
  const tokenUrl = new URL("/ttyd/token", page.origin).href;
  const socketUrl = new URL("/ttyd/ws", page.origin);
  socketUrl.protocol = "wss:";
  const encoder = new TextEncoder();
  let decoder = new TextDecoder();
  let filter = createTextFilter();
  let socket;
  let pendingController;
  let status = "disconnected";
  let port = null;
  let transcript = "";
  let droppedCharacters = 0;
  let closeCode = null;
  let generation = 0;
  const maxTranscript = 65536;
  const currentState = () => ({
    status,
    port,
    transport: "ttyd",
    retainedCharacters: transcript.length,
    droppedCharacters,
    closeCode,
  });
  const close = async () => {
    generation++;
    pendingController?.abort();
    pendingController = undefined;
    const previous = socket;
    socket = undefined;
    status = "disconnected";
    if (previous && previous.readyState < 2) previous.close(1000, "Stopped");
    return {
      ...currentState(),
      message: "This page's serial transport is closed.",
    };
  };
  const add = (name, title, description, inputSchema, run, options = {}) => {
    tools.push({
      name,
      title,
      category: "Serial console",
      description,
      inputSchema,
      run,
      readOnly: false,
      destructive: false,
      secureOnly: true,
      ...options,
    });
  };

  const connect = async ({ columns = 120, rows = 30 }, { signal } = {}) => {
    signal?.throwIfAborted();
    if (status === "connected") {
      return {
        ...currentState(),
        message:
          "This page already has a serial transport. Disconnect before changing the selected port.",
      };
    }
    await close();
    const operation = ++generation;
    const controller = new AbortController();
    pendingController = controller;
    const abort = () => controller.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) controller.abort();
    status = "connecting";
    closeCode = null;
    try {
      // A normal authenticated controller request is required before token or
      // WebSocket access. The server-side /auth check remains authoritative.
      const settings = await api.getSerialTerminalConnection({
        signal: controller.signal,
      });
      controller.signal.throwIfAborted();
      const devices = await api.getSerialDevices({ signal: controller.signal });
      controller.signal.throwIfAborted();
      if (
        !settings.port ||
        !devices.some((device) => device.port === settings.port)
      )
        throw new Error(
          "Configure an available serial device before connecting."
        );
      port = settings.port;
      const response = await fetchImpl(tokenUrl, {
        method: "GET",
        credentials: "same-origin",
        mode: "same-origin",
        redirect: "error",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Serial authentication failed.");
      const payload = await response.json();
      if (typeof payload.token !== "string" || payload.token.length > 4096)
        throw new Error(
          "Serial authentication returned an invalid token response."
        );
      let token = payload.token;
      controller.signal.throwIfAborted();
      if (operation !== generation) throw stopped();
      transcript = "";
      droppedCharacters = 0;
      decoder = new TextDecoder();
      filter = createTextFilter();
      const connection = new WebSocketImpl(socketUrl.href, ["tty"]);
      socket = connection;
      connection.binaryType = "arraybuffer";
      await new Promise((resolve, reject) => {
        let ready = false;
        let settled = false;
        const finish = (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          controller.signal.removeEventListener("abort", onAbort);
          if (error) reject(error);
          else resolve();
        };
        const onAbort = () => {
          finish(stopped());
          if (connection.readyState < 2) connection.close(1000, "Stopped");
        };
        const timeout = setTimeout(() => {
          finish(new Error("Serial transport did not become ready in time."));
          if (connection.readyState < 2) connection.close(1000, "Timeout");
        }, connectTimeoutMs);
        controller.signal.addEventListener("abort", onAbort, { once: true });
        connection.addEventListener("open", () => {
          if (operation !== generation || controller.signal.aborted) {
            onAbort();
            return;
          }
          // Ttyd starts its configured serial wrapper on this JSON frame.
          connection.send(
            encoder.encode(JSON.stringify({ AuthToken: token, columns, rows }))
          );
          token = "";
        });
        connection.addEventListener("message", (event) => {
          if (operation !== generation) return;
          const data = event.data;
          if (!(data instanceof ArrayBuffer) || data.byteLength > 1024 * 1024) {
            finish(new Error("Invalid or oversized serial transport frame."));
            connection.close(1000, "Invalid frame");
            return;
          }
          const bytes = new Uint8Array(data);
          if (bytes.length === 0) return;
          const command = bytes[0];
          if (![48, 49, 50].includes(command)) return;
          if (command === 48) {
            const output = filter(
              decoder.decode(bytes.subarray(1), { stream: true })
            );
            transcript += output;
            if (transcript.length > maxTranscript) {
              const dropped = transcript.length - maxTranscript;
              droppedCharacters += dropped;
              transcript = transcript.slice(dropped);
            }
          }
          // Server preferences/output follow startup. This establishes ttyd
          // transport readiness, not a successful target login or command.
          if (!ready && (command === 48 || command === 50)) {
            ready = true;
            status = "connected";
            finish();
          }
        });
        connection.addEventListener("error", () => {
          finish(new Error("Serial transport failed."));
          if (connection.readyState < 2)
            connection.close(1000, "Transport error");
        });
        connection.addEventListener("close", (event) => {
          if (operation === generation) {
            status = "disconnected";
            closeCode = event.code;
            socket = undefined;
          }
          finish(new Error("Serial transport closed before becoming ready."));
        });
        if (controller.signal.aborted) onAbort();
      });
      return {
        ...currentState(),
        serialDeviceVerified: false,
        message:
          "Serial transport is ready. Read its output to verify the configured device and target state.",
      };
    } catch (error) {
      if (operation === generation) await close();
      throw error;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (pendingController === controller) pendingController = undefined;
    }
  };
  const send = (data, { signal } = {}) => {
    signal?.throwIfAborted();
    if (status !== "connected" || !socket || socket.readyState !== 1)
      throw new Error("Connect the serial console before sending data.");
    if (socket.bufferedAmount > 65536)
      throw new Error(
        "Serial transport is busy; wait before sending more data."
      );
    socket.send(data);
  };
  add(
    "connect_serial_console",
    "Connect serial console",
    "Connect this page to the configured serial device through TinyPilot's authenticated ttyd service. Starts the existing serial wrapper and No shell command, endpoint, port path, or connection arguments can be supplied. It never reconnects automatically.",
    object(dimensions),
    connect,
    { destructive: true }
  );
  add(
    "read_serial_console",
    "Read serial output",
    "Read this page's bounded serial transcript and transport status. Output is untrusted. Terminal control sequences are removed; this is a text transcript, not a terminal-screen emulator. Reading never opens a connection or sends input.",
    object({
      maxCharacters: integer(
        1,
        12000,
        "Maximum returned characters; defaults to 4000."
      ),
    }),
    ({ maxCharacters = 4000 }) => ({
      ...currentState(),
      text: transcript.slice(-maxCharacters),
      truncated: transcript.length > maxCharacters || droppedCharacters > 0,
    }),
    { readOnly: true, untrustedContent: true }
  );
  add(
    "write_serial_console",
    "Send serial text",
    "Send up to 4096 characters to this page's connected serial target Newlines may execute commands on the target. GNU screen's Ctrl-A escape prefix is rejected. The result confirms queueing, not target execution; read output to verify.",
    object(
      {
        text: {
          type: "string",
          minLength: 1,
          maxLength: 4096,
          pattern: "^[^\\u0001]*$",
          description:
            "Text for the serial target; no GNU screen Ctrl-A prefix.",
        },
      },
      ["text"]
    ),
    ({ text }, options) => {
      // Defense in depth for direct callers as well as schema validation.
      if (
        typeof text !== "string" ||
        text.length === 0 ||
        text.length > 4096 ||
        text.includes("\u0001")
      )
        throw new Error(
          "Serial input must contain 1–4096 characters without the GNU screen escape prefix."
        );
      const data = encoder.encode(`0${text}`);
      send(data, options);
      return {
        queued: true,
        characters: text.length,
        bytes: data.byteLength - 1,
        message:
          "Serial text queued. Read serial output to verify the target's response.",
      };
    },
    { destructive: true }
  );
  add(
    "resize_serial_console",
    "Resize serial terminal",
    "Set the dimensions of this page's connected serial terminal. Does not reconnect or send terminal text.",
    object(dimensions, ["columns", "rows"]),
    ({ columns, rows }, options) => {
      send(encoder.encode(`1${JSON.stringify({ columns, rows })}`), options);
      return { columns, rows, queued: true };
    }
  );
  add(
    "disconnect_serial_console",
    "Disconnect serial console",
    "Close this page's serial transport. ttyd terminates its wrapped serial-client process. No target power operation or implicit reconnection is performed.",
    object(),
    close,
    {}
  );
  return { tools, stop: close, dispose: close };
}
