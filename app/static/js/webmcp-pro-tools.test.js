import { describe, it } from "mocha";
import assert from "assert";

import { createProTools } from "./webmcp-pro-tools.js";
import { validateInput } from "./webmcp-tools.js";

function fixture(results = {}, { isAdmin = true, view = {} } = {}) {
  const calls = [];
  const api = Object.fromEntries(
    Object.entries(results).map(([name, result]) => [
      name,
      async (...args) => {
        calls.push({ name, args });
        return typeof result === "function" ? result(...args) : result;
      },
    ])
  );
  const tools = createProTools({ api, view, context: { isAdmin } });
  const find = (name) => tools.find((tool) => tool.name === name);
  const run = (name, input = {}, options = {}) => {
    const tool = find(name);
    assert.ok(tool, `${name} is registered`);
    validateInput(input, tool.inputSchema);
    return tool.run(input, options);
  };
  return { calls, tools, find, run };
}

describe("optional Pro WebMCP capabilities", () => {
  it("registers nothing without the actual installed controllers", () => {
    assert.deepStrictEqual(
      createProTools({ api: {}, context: { isAdmin: true } }),
      []
    );
    const missingReadback = fixture({ toggleSsh: undefined });
    assert.strictEqual(missingReadback.find("set_ssh_enabled"), undefined);
  });

  it("keeps administrator operations out of an operator session", () => {
    const { tools } = fixture(
      {
        getAllUserScripts: [],
        runUserScript: {},
        getStaticIp: {},
        updateUserRole: {},
      },
      { isAdmin: false }
    );
    assert.deepStrictEqual(
      tools.map((tool) => tool.name),
      ["list_user_scripts", "run_user_script"]
    );
    assert.strictEqual(tools[1].destructive, true);
  });

  it("does not expose file selection unless the browser adapter exists", () => {
    const { tools } = fixture({ uploadMassStorageBackingFile: {} });
    assert.strictEqual(tools.length, 0);
  });

  it("withholds unsafe server-side URL fetches even when Pro exports them", () => {
    const { tools } = fixture({
      fetchMassStorageBackFileFromUrl: {},
      retrieveMassStorageFileNameFromUrl: {},
    });
    assert.deepStrictEqual(tools, []);
  });

  it("uploads only the file selected by the person", async () => {
    const selectedFile = { name: "rescue.iso", size: 1234 };
    let selections = 0;
    const test = fixture(
      { uploadMassStorageBackingFile: {} },
      {
        view: {
          pickFile: async () => {
            selections++;
            return selectedFile;
          },
        },
      }
    );
    assert.strictEqual(test.find("upload_virtual_media").destructive, true);
    assert.throws(() =>
      validateInput(
        { path: "/private/file" },
        test.find("upload_virtual_media").inputSchema
      )
    );
    const result = await test.run("upload_virtual_media");
    assert.strictEqual(selections, 1);
    assert.strictEqual(test.calls[0].args[0], selectedFile);
    assert.deepStrictEqual(
      { fileName: result.fileName, bytes: result.bytes },
      { fileName: "rescue.iso", bytes: 1234 }
    );
  });

  it("does not upload anything when file selection is cancelled", async () => {
    const test = fixture(
      { uploadMassStorageBackingFile: {} },
      {
        view: {
          pickFile: async () => {
            throw new DOMException("Cancelled", "AbortError");
          },
        },
      }
    );
    await assert.rejects(test.run("upload_virtual_media"), {
      name: "AbortError",
    });
    assert.strictEqual(test.calls.length, 0);
  });

  it("rejects conflicting selected file names before building media", async () => {
    const files = [
      { name: "config.txt", size: 1 },
      { name: "config.txt", size: 2 },
    ];
    const test = fixture(
      { createMassStorageBackFileFromFiles: {} },
      { view: { pickFiles: async () => files } }
    );
    await assert.rejects(
      test.run("create_virtual_media_from_files", { fileName: "config.img" }),
      /distinct name/
    );
    assert.strictEqual(test.calls.length, 0);
  });

  it("requires an image to exist before returning its authenticated download path", async () => {
    const test = fixture({
      listMassStorageBackingFiles: {
        backingFiles: [{ name: "rescue image.iso", totalBytes: 10 }],
        intermediateFiles: [],
      },
    });
    assert.strictEqual(
      (
        await test.run("get_virtual_media_download", {
          fileName: "rescue image.iso",
        })
      ).downloadPath,
      "/api/massStorage/backingFiles/rescue%20image.iso"
    );
    await assert.rejects(
      test.run("get_virtual_media_download", { fileName: "missing.iso" }),
      /No stored/
    );
  });

  it("only invokes a script still present in the fresh installed list", async () => {
    const test = fixture({
      getAllUserScripts: ["reset-display"],
      runUserScript: {},
    });
    await assert.rejects(
      test.run("run_user_script", { scriptName: "uninstalled" }),
      /not installed/
    );
    assert.strictEqual(
      test.calls.some((call) => call.name === "runUserScript"),
      false
    );
    await test.run("run_user_script", { scriptName: "reset-display" });
    assert.deepStrictEqual(test.calls.at(-1).args, ["reset-display", {}]);
    assert.throws(() =>
      validateInput(
        { scriptName: "reset-display", arguments: "anything" },
        test.find("run_user_script").inputSchema
      )
    );
  });

  it("checks serial discovery before saving settings and uses exact controller argument order", async () => {
    const test = fixture({
      getSerialDevices: [{ port: "ttyACM0", description: "Console" }],
      getSerialTerminalConnection: { port: "ttyACM0" },
      setSerialDeviceConnection: {},
    });
    const input = {
      port: "ttyACM0",
      baudRate: 115200,
      dataBits: 8,
      stopBits: 1,
      parity: "NONE",
      flowControl: "NONE",
    };
    await assert.rejects(
      test.run("configure_serial_connection", { ...input, port: "ttyUSB0" }),
      /not currently available/
    );
    assert.strictEqual(
      test.calls.some((call) => call.name === "setSerialDeviceConnection"),
      false
    );
    const result = await test.run("configure_serial_connection", input);
    const call = test.calls.find(
      (call) => call.name === "setSerialDeviceConnection"
    );
    assert.deepStrictEqual(call.args, [
      "ttyACM0",
      {
        baudRate: 115200,
        dataBits: 8,
        stopBits: 1,
        parity: "NONE",
        flowControl: "NONE",
      },
      {},
    ]);
    assert.strictEqual(result.consolePath, "/serial-terminal");
    assert.strictEqual(result.connected, undefined);
  });

  it("keeps invalid IPv4 octets away from the mutation controller", async () => {
    const test = fixture({ setTemporaryStaticIp: {} });
    await assert.rejects(
      test.run("try_static_ip", {
        ipAddress: "999.1.1.1",
        networkPrefixLength: 24,
        routerIpAddress: "192.0.2.1",
        networkInterfaceName: "eth0",
      }),
      /between 0 and 255/
    );
    assert.strictEqual(test.calls.length, 0);
  });

  it("does not return license keys or Tailscale authentication links", async () => {
    const test = fixture({
      getProLicense: {
        licenseCheckStatus: "VALID",
        license: { key: "private-license", expirationTime: "2027-01-01" },
      },
      getTailscaleStatus: {
        status: "NEEDS_LOGIN",
        authUrl: "https://login.example/secret-token",
        tailnet: null,
      },
      activateProLicense: {},
    });
    const license = await test.run("get_pro_license_status");
    assert.deepStrictEqual(license, {
      licenseCheckStatus: "VALID",
      hasLicense: true,
      expirationTime: "2027-01-01",
    });
    const tailscale = await test.run("get_tailscale_status");
    assert.strictEqual(tailscale.authenticationRequired, true);
    assert.strictEqual(
      JSON.stringify(tailscale).includes("secret-token"),
      false
    );
    assert.throws(() =>
      validateInput({}, test.find("attach_pro_license").inputSchema)
    );
    assert.strictEqual(
      test.find("attach_pro_license").inputSchema.properties.licenseKey
        .writeOnly,
      true
    );
    const attached = await test.run("attach_pro_license", {
      licenseKey: "owner-supplied-license",
    });
    assert.strictEqual(
      JSON.stringify(attached).includes("owner-supplied-license"),
      false
    );
    assert.strictEqual(test.find("attach_pro_license").secureOnly, true);
  });

  it("reports a missing license without hiding other licensing failures", async () => {
    const missing = fixture({
      getProLicense: () => {
        throw Object.assign(new Error("Not installed"), {
          code: "NO_LICENSE_STORED",
        });
      },
    });
    assert.deepStrictEqual(await missing.run("get_pro_license_status"), {
      licenseCheckStatus: "NOT_INSTALLED",
      hasLicense: false,
      expirationTime: null,
    });
    const failed = fixture({
      getProLicense: () => {
        throw Object.assign(new Error("Service unavailable"), {
          code: "LICENSE_CHECK_FAILED",
        });
      },
    });
    await assert.rejects(
      failed.run("get_pro_license_status"),
      /Service unavailable/
    );
  });
});
