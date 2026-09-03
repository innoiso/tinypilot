import { describe, it } from "mocha";
import assert from "assert";

import { createSerialIntegration } from "./webmcp-serial.js";
import { validateInput } from "./webmcp-tools.js";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function fixture({
  context = { serialToolsEnabled: true },
  origin = "https://tinypilot.test",
  authError = false,
  tokenOk = true,
  available = true,
  autoReady = true,
  connectTimeoutMs = 1000,
} = {}) {
  const calls = [];
  const sockets = [];
  class MockSocket extends EventTarget {
    constructor(url, protocols) {
      super();
      this.url = url;
      this.protocols = protocols;
      this.readyState = 0;
      this.bufferedAmount = 0;
      this.sent = [];
      sockets.push(this);
      if (autoReady) queueMicrotask(() => this.open());
    }
    open() {
      this.readyState = 1;
      this.dispatchEvent(new Event("open"));
    }
    send(data) {
      this.sent.push(data);
      if (autoReady && decoder.decode(data).startsWith("{")) {
        queueMicrotask(() => this.receive("2{}"));
      }
    }
    receive(data) {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      this.dispatchEvent(
        new MessageEvent("message", {
          data: bytes.buffer.slice(
            bytes.byteOffset,
            bytes.byteOffset + bytes.byteLength
          ),
        })
      );
    }
    close(code = 1000) {
      if (this.readyState === 3) return;
      this.readyState = 3;
      const event = new Event("close");
      event.code = code;
      this.dispatchEvent(event);
    }
  }
  const api = {
    getSerialTerminalConnection: async () => {
      calls.push("auth-controller");
      if (authError) throw new Error("Unauthorized");
      return { port: "ttyACM0" };
    },
    getSerialDevices: async () => {
      calls.push("devices-controller");
      return available ? [{ port: "ttyACM0" }] : [];
    },
  };
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return { ok: tokenOk, json: async () => ({ token: "private-token" }) };
  };
  const integration = createSerialIntegration({
    api,
    context,
    fetchImpl,
    WebSocketImpl: MockSocket,
    origin,
    connectTimeoutMs,
  });
  const find = (name) => integration.tools.find((tool) => tool.name === name);
  const run = (name, input = {}, options = {}) => {
    const tool = find(name);
    assert.ok(tool, `${name} is registered`);
    validateInput(input, tool.inputSchema);
    return tool.run(input, options);
  };
  return { ...integration, calls, sockets, find, run };
}

describe("authenticated ttyd serial integration", () => {
  it("requires explicit protected-route enablement and HTTPS", () => {
    assert.strictEqual(fixture({ context: {} }).tools.length, 0);
    assert.strictEqual(
      fixture({ origin: "http://tinypilot.test" }).tools.length,
      0
    );
    assert.strictEqual(fixture({ origin: "invalid" }).tools.length, 0);
    const test = fixture();
    assert.strictEqual(test.tools.length, 5);
    assert.strictEqual(test.sockets.length, 0);
    assert.strictEqual(test.calls.length, 0);
  });

  it("requires normal auth and currently discovered hardware before token access", async () => {
    const denied = fixture({ authError: true });
    await assert.rejects(denied.run("connect_serial_console"), /Unauthorized/);
    assert.deepStrictEqual(denied.calls, ["auth-controller"]);
    assert.strictEqual(denied.sockets.length, 0);
    const absent = fixture({ available: false });
    await assert.rejects(
      absent.run("connect_serial_console"),
      /available serial device/
    );
    assert.strictEqual(absent.sockets.length, 0);
    assert.deepStrictEqual(absent.calls, [
      "auth-controller",
      "devices-controller",
    ]);
  });

  it("does not open a socket when protected token access is denied", async () => {
    const test = fixture({ tokenOk: false });
    await assert.rejects(
      test.run("connect_serial_console"),
      /authentication failed/
    );
    assert.strictEqual(test.sockets.length, 0);
  });

  it("uses the fixed same-origin token and WebSocket protocol without exposing the token", async () => {
    const test = fixture();
    assert.strictEqual(test.find("connect_serial_console").destructive, true);
    const result = await test.run("connect_serial_console", {
      columns: 80,
      rows: 24,
    });
    assert.strictEqual(result.status, "connected");
    assert.strictEqual(result.serialDeviceVerified, false);
    assert.strictEqual(JSON.stringify(result).includes("private-token"), false);
    const request = test.calls[2];
    assert.strictEqual(request.url, "https://tinypilot.test/ttyd/token");
    assert.strictEqual(request.options.credentials, "same-origin");
    assert.strictEqual(request.options.mode, "same-origin");
    assert.strictEqual(request.options.redirect, "error");
    const socket = test.sockets[0];
    assert.strictEqual(socket.url, "wss://tinypilot.test/ttyd/ws");
    assert.deepStrictEqual(socket.protocols, ["tty"]);
    assert.strictEqual(socket.binaryType, "arraybuffer");
    assert.deepStrictEqual(JSON.parse(decoder.decode(socket.sent[0])), {
      AuthToken: "private-token",
      columns: 80,
      rows: 24,
    });
    assert.throws(() =>
      validateInput(
        { command: "sh" },
        test.find("connect_serial_console").inputSchema
      )
    );
    await test.dispose();
  });

  it("decodes split UTF-8 and strips split terminal control payloads", async () => {
    const test = fixture();
    await test.run("connect_serial_console");
    const socket = test.sockets[0];
    const unicode = encoder.encode("€");
    socket.receive(Uint8Array.from([48, unicode[0]]));
    socket.receive(Uint8Array.from([48, unicode[1], unicode[2]]));
    socket.receive("0\u001b[31m red\u001b[0m\u001b]52;c;PRIVATE");
    socket.receive("0_PAYLOAD\u0007 ready\n");
    const result = await test.run("read_serial_console");
    assert.strictEqual(result.text, "€ red ready\n");
    assert.strictEqual(result.text.includes("PRIVATE"), false);
    assert.strictEqual(test.find("read_serial_console").untrustedContent, true);
    await test.dispose();
  });

  it("bounds retained and returned output independently", async () => {
    const test = fixture();
    await test.run("connect_serial_console");
    test.sockets[0].receive(`0${"x".repeat(70000)}`);
    const result = await test.run("read_serial_console", {
      maxCharacters: 100,
    });
    assert.strictEqual(result.text.length, 100);
    assert.strictEqual(result.retainedCharacters, 65536);
    assert.strictEqual(result.droppedCharacters, 70000 - 65536);
    assert.strictEqual(result.truncated, true);
    await test.dispose();
  });

  it("rejects GNU screen escapes and never claims queued text was executed", async () => {
    const test = fixture();
    await test.run("connect_serial_console");
    const socket = test.sockets[0];
    assert.strictEqual(test.find("write_serial_console").destructive, true);
    assert.throws(() =>
      test.run("write_serial_console", { text: "\u0001:exec sh\n" })
    );
    assert.throws(() =>
      test.find("write_serial_console").run({ text: "\u0001a" }, {})
    );
    assert.strictEqual(socket.sent.length, 1);
    const result = await test.run("write_serial_console", { text: "status\n" });
    assert.strictEqual(decoder.decode(socket.sent[1]), "0status\n");
    assert.strictEqual(result.queued, true);
    assert.strictEqual(result.text, undefined);
    assert.strictEqual(result.executed, undefined);
    await test.dispose();
  });

  it("applies backpressure before queueing more serial input", async () => {
    const test = fixture();
    await test.run("connect_serial_console");
    test.sockets[0].bufferedAmount = 65537;
    assert.throws(
      () => test.run("write_serial_console", { text: "more" }),
      /busy/
    );
    assert.strictEqual(test.sockets[0].sent.length, 1);
    await test.dispose();
  });

  it("uses the separate resize command with closed bounded arguments", async () => {
    const test = fixture();
    await test.run("connect_serial_console");
    await test.run("resize_serial_console", { columns: 100, rows: 40 });
    assert.strictEqual(
      decoder.decode(test.sockets[0].sent[1]),
      '1{"columns":100,"rows":40}'
    );
    assert.throws(() =>
      test.run("resize_serial_console", { columns: 0, rows: 40 })
    );
    await test.dispose();
  });

  it("closes on stop, retains readable evidence, and does not reconnect", async () => {
    const test = fixture();
    await test.run("connect_serial_console");
    test.sockets[0].receive("0last output");
    await test.stop();
    assert.strictEqual(test.sockets[0].readyState, 3);
    assert.strictEqual(test.sockets.length, 1);
    const result = await test.run("read_serial_console");
    assert.strictEqual(result.status, "disconnected");
    assert.strictEqual(result.text, "last output");
    assert.throws(
      () => test.run("write_serial_console", { text: "more" }),
      /Connect the serial/
    );
  });

  it("aborts a pending connection without leaving a socket open", async () => {
    const test = fixture({ autoReady: false });
    const controller = new AbortController();
    const pending = test.run(
      "connect_serial_console",
      {},
      { signal: controller.signal }
    );
    while (!test.sockets.length) await Promise.resolve();
    controller.abort();
    await assert.rejects(pending, { name: "AbortError" });
    assert.strictEqual(test.sockets[0].readyState, 3);
    assert.strictEqual(
      (await test.run("read_serial_console")).status,
      "disconnected"
    );
  });

  it("times out a nonresponsive handshake and closes the transport", async () => {
    const test = fixture({ autoReady: false, connectTimeoutMs: 5 });
    await assert.rejects(test.run("connect_serial_console"), /ready in time/);
    assert.strictEqual(test.sockets[0].readyState, 3);
    assert.strictEqual(test.sockets.length, 1);
  });
});
