import { describe, it } from "mocha";
import assert from "node:assert/strict";
import { WebMcpRegistry, createTarget } from "./webmcp.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function fixture(overrides = {}) {
  const calls = [];
  const tool = {
    name: "test_action",
    title: "Test action",
    description: "Test",
    category: "Device",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    readOnly: false,
    destructive: false,
    run: async () => ({ acknowledged: true }),
    ...overrides,
  };
  const modelContext = {
    async registerTool(descriptor, options) {
      calls.push({ descriptor, options });
    },
    async unregisterTool(name) {
      calls.push({ unregistered: name });
    },
  };
  const registry = new WebMcpRegistry({ modelContext, tools: [tool] });
  return { registry, tool, calls };
}

describe("WebMCP registration and execution", () => {
  it("registers native tools immediately with lifecycle and safety annotations", async () => {
    const { registry, calls } = fixture({
      readOnly: true,
      destructive: true,
      untrustedContent: true,
    });
    assert.equal((await registry.register()).registered, 1);
    assert.deepEqual(calls[0].descriptor.annotations, {
      readOnlyHint: true,
      destructiveHint: true,
      untrustedContentHint: true,
    });
    assert.ok(calls[0].options.signal instanceof AbortSignal);
    assert.deepEqual(await calls[0].descriptor.execute({}), {
      ok: true,
      acknowledged: true,
    });
    await registry.dispose();
    assert.equal(calls[0].options.signal.aborted, true);
    assert.deepEqual(calls[1], { unregistered: "test_action" });
  });

  it("preserves ordinary browsers with no WebMCP API", async () => {
    const registry = new WebMcpRegistry({ tools: [] });
    assert.deepEqual(await registry.register(), { registered: 0, errors: [] });
  });

  it("reports registration failures", async () => {
    const { registry } = fixture();
    registry.modelContext.registerTool = async () => {
      throw new Error("unsupported schema");
    };
    const result = await registry.register();
    assert.equal(result.registered, 0);
    assert.equal(result.errors.length, 1);
  });

  it("validates before side effects", async () => {
    let executed = false;
    const { registry, tool } = fixture({
      run: async () => {
        executed = true;
      },
    });
    const result = await registry.execute(tool, { unexpected: true });
    assert.equal(result.error.code, "INVALID_INPUT");
    assert.equal(executed, false);
  });

  it("rejects insecure security operations before side effects", async () => {
    let executed = false;
    const { registry, tool } = fixture({
      secureOnly: true,
      run: async () => {
        executed = true;
      },
    });
    registry.isSecureContext = false;
    assert.equal(
      (await registry.execute(tool, {})).error.code,
      "HTTPS_REQUIRED"
    );
    assert.equal(executed, false);
  });

  it("passes cancellation through and never starts a pre-aborted request", async () => {
    const controller = new AbortController();
    controller.abort();
    let executed = false;
    const { registry, tool } = fixture({
      run: async () => {
        executed = true;
      },
    });
    assert.equal(
      (await registry.execute(tool, {}, { signal: controller.signal })).error
        .code,
      "STOPPED"
    );
    assert.equal(executed, false);
  });

  it("logs only tool identity, status, and duration", async () => {
    const previousInfo = console.info;
    const entries = [];
    console.info = (...args) => entries.push(args);
    try {
      const { registry, tool } = fixture({
        inputSchema: {
          type: "object",
          properties: {
            password: { type: "string", writeOnly: true },
          },
          required: ["password"],
          additionalProperties: false,
        },
        run: async () => ({ detail: "private-result" }),
      });
      await registry.execute(tool, { password: "private-password" });
    } finally {
      console.info = previousInfo;
    }
    const encoded = JSON.stringify(entries);
    assert.equal(encoded.includes("private-password"), false);
    assert.equal(encoded.includes("private-result"), false);
    assert.match(encoded, /test_action/);
    assert.match(encoded, /succeeded/);
  });

  it("aborts the registration lifetime before awaiting input cleanup", async () => {
    const cleanup = deferred();
    const { registry, calls } = fixture();
    registry.tools.push({
      name: "release_input",
      title: "Release input",
      description: "Release input",
      category: "Control",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      readOnly: false,
      destructive: false,
      run: () => cleanup.promise,
    });
    await registry.register();

    const lifetimeSignal = calls[0].options.signal;
    const disposal = registry.dispose();
    assert.equal(lifetimeSignal.aborted, true);
    cleanup.resolve();
    await disposal;
  });

  it("disposes optional transport integrations with the registry", async () => {
    const lifecycleCalls = [];
    const { registry } = fixture();
    registry.lifecycle.push({
      dispose: async () => lifecycleCalls.push("dispose"),
    });

    await registry.dispose();

    assert.deepStrictEqual(lifecycleCalls, ["dispose"]);
  });
});

describe("WebMCP input transport", () => {
  it("uses the current Socket.IO connection and waits for acknowledgment", async () => {
    const emitted = [];
    const socket = {
      connected: true,
      emit(name, payload, ack) {
        emitted.push({ name, payload });
        ack?.({ success: true });
      },
    };
    const target = createTarget(socket);
    await target.key({ code: "F2" });
    await target.mouse({ x: 0.4, y: 0.6, buttons: 2 });
    await target.releasePointer();
    assert.equal(emitted[0].name, "keystroke");
    assert.equal(emitted[1].payload.buttons, 2);
    assert.deepEqual(emitted[2].payload, {
      buttons: 0,
      relativeX: 0.4,
      relativeY: 0.6,
      verticalWheelDelta: 0,
      horizontalWheelDelta: 0,
    });
  });

  it("rejects disconnected input instead of queueing it for reconnection", async () => {
    let emitted = false;
    const target = createTarget({
      connected: false,
      emit() {
        emitted = true;
      },
    });
    await assert.rejects(target.key({ code: "Enter" }), /disconnected/);
    assert.equal(emitted, false);
  });

  it("rejects device failures and aborts pending acknowledgments", async () => {
    const failing = createTarget({
      connected: true,
      emit(_, __, ack) {
        ack({ success: false });
      },
    });
    await assert.rejects(failing.key({ code: "Enter" }), /rejected/);
    const controller = new AbortController();
    const target = createTarget({ connected: true, emit() {} });
    const result = target.key({ code: "Enter" }, { signal: controller.signal });
    controller.abort();
    await assert.rejects(result, { name: "AbortError" });
  });

  it("removes disconnect listeners after acknowledgment and cancellation", async () => {
    const listeners = new Set();
    let acknowledge;
    const socket = {
      connected: true,
      on(name, listener) {
        assert.equal(name, "disconnect");
        listeners.add(listener);
      },
      off(name, listener) {
        assert.equal(name, "disconnect");
        listeners.delete(listener);
      },
      emit(_, __, ack) {
        acknowledge = ack;
      },
    };
    const target = createTarget(socket);

    const acknowledged = target.key({ code: "Enter" });
    assert.equal(listeners.size, 1);
    acknowledge({ success: true });
    await acknowledged;
    assert.equal(listeners.size, 0);

    const controller = new AbortController();
    const cancelled = target.key(
      { code: "Escape" },
      { signal: controller.signal }
    );
    assert.equal(listeners.size, 1);
    controller.abort();
    await assert.rejects(cancelled, { name: "AbortError" });
    assert.equal(listeners.size, 0);
  });

  it("rejects a pending input immediately when its socket disconnects", async () => {
    const listeners = new Set();
    const socket = {
      connected: true,
      on(_, listener) {
        listeners.add(listener);
      },
      off(_, listener) {
        listeners.delete(listener);
      },
      emit() {},
    };
    const target = createTarget(socket);
    const result = target.key({ code: "Enter" });
    assert.equal(listeners.size, 1);

    [...listeners][0]();
    await assert.rejects(result, /disconnected before acknowledging/);
    assert.equal(listeners.size, 0);
  });

  it("captures the active stream and reports output and source dimensions", async () => {
    const previousDocument = globalThis.document;
    const image = { naturalWidth: 1600, naturalHeight: 1200 };
    const video = { videoWidth: 1920, videoHeight: 1080 };
    const drawnSources = [];
    let useWebrtc = false;
    const remote = {
      hasAttribute: (name) => name === "webrtc-enabled" && useWebrtc,
      shadowRoot: {
        getElementById: (id) =>
          id === "webrtc-output" ? video : id === "mjpeg-output" ? image : null,
      },
    };
    globalThis.document = {
      getElementById: (id) => (id === "remote-screen" ? remote : null),
      createElement: (tagName) => {
        assert.equal(tagName, "canvas");
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: (source) => drawnSources.push(source),
          }),
          toDataURL: () => "data:image/jpeg;base64,c2NyZWVu",
        };
      },
    };

    try {
      const target = createTarget({ connected: false });
      const mjpeg = await target.capture();
      assert.equal(drawnSources[0], image);
      assert.deepEqual(
        {
          width: mjpeg.width,
          height: mjpeg.height,
          sourceWidth: mjpeg.sourceWidth,
          sourceHeight: mjpeg.sourceHeight,
        },
        { width: 1280, height: 960, sourceWidth: 1600, sourceHeight: 1200 }
      );

      useWebrtc = true;
      const webrtc = await target.capture();
      assert.equal(drawnSources[1], video);
      assert.deepEqual(
        {
          width: webrtc.width,
          height: webrtc.height,
          sourceWidth: webrtc.sourceWidth,
          sourceHeight: webrtc.sourceHeight,
        },
        { width: 1280, height: 720, sourceWidth: 1920, sourceHeight: 1080 }
      );
    } finally {
      if (previousDocument === undefined) delete globalThis.document;
      else globalThis.document = previousDocument;
    }
  });
});
