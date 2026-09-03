// Original WebMCP adapters for optional dashboard capabilities. No licensed
// controller implementation is bundled here: each tool calls a controller that
// the installed TinyPilot edition already provides, under its existing session.
const object = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});
const string = (description, maxLength = 255) => ({
  type: "string",
  minLength: 1,
  maxLength,
  description,
});
const integer = (minimum, maximum, description) => ({
  type: "integer",
  minimum,
  maximum,
  description,
});
const choice = (values, description) => ({
  type: "string",
  enum: values,
  description,
});
const boolean = (description) => ({ type: "boolean", description });
const fileName = {
  ...string("A single file name, without a path or URL encoding."),
  pattern: "^[A-Za-z0-9][A-Za-z0-9._ -]*$",
};
const macAddress = {
  ...string("Target MAC address, such as 02:00:00:00:00:01.", 17),
  minLength: 17,
  pattern: "^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$",
};
const ipAddress = {
  ...string("IPv4 address.", 15),
  pattern: "^([0-9]{1,3}\\.){3}[0-9]{1,3}$",
};
const receipt = (message, fields = {}) => ({ message, ...fields });
const write = { destructive: true };
const adminWrite = { admin: true, destructive: true };

function validateIpv4(value) {
  if (value.split(".").some((part) => Number(part) > 255))
    throw new Error("IPv4 address octets must be between 0 and 255.");
}

/** The provider registers only capabilities supplied by the installed edition. */
export function createProTools({ api, view = {}, context = {} }) {
  const tools = [];
  const add = (
    requiredControllers,
    name,
    title,
    category,
    description,
    inputSchema,
    run,
    options = {}
  ) => {
    if (options.admin && !context.isAdmin) return;
    if (!requiredControllers.every((name) => typeof api[name] === "function"))
      return;
    tools.push({
      name,
      title,
      category,
      description,
      inputSchema,
      run,
      readOnly: false,
      destructive: false,
      ...options,
    });
  };
  const read = { readOnly: true };
  const adminRead = { admin: true, readOnly: true };
  const mediaState = async (options) => {
    const value = await api.listMassStorageBackingFiles(options);
    return {
      backingFiles: value.backingFiles.slice(0, 100),
      intermediateFiles: value.intermediateFiles.slice(0, 100),
      mountMode: value.mountMode,
      totalBackingFiles: value.backingFiles.length,
      totalIntermediateFiles: value.intermediateFiles.length,
    };
  };

  add(
    ["listMassStorageBackingFiles"],
    "list_virtual_media",
    "Inspect virtual media",
    "Virtual media",
    "List stored virtual-media images, mounted state, mount mode, sizes, and in-progress transfers. Returns at most 100 files of each kind. File names are untrusted device data.",
    object(),
    (_, options) => mediaState(options),
    { ...adminRead, untrustedContent: true }
  );
  add(
    ["listMassStorageBackingFiles"],
    "get_virtual_media_download",
    "Get image download link",
    "Virtual media",
    "Return the authenticated same-origin download path for an existing virtual-media image. Does not read or transmit the image contents to the agent.",
    object({ fileName }, ["fileName"]),
    async ({ fileName: name }, options) => {
      const state = await api.listMassStorageBackingFiles(options);
      const file = state.backingFiles.find((file) => file.name === name);
      if (!file)
        throw new Error("No stored virtual-media image has that name.");
      return {
        fileName: name,
        totalBytes: file.totalBytes,
        downloadPath: `/api/massStorage/backingFiles/${encodeURIComponent(
          name
        )}`,
      };
    },
    adminRead
  );
  add(
    ["mountMassStorage", "listMassStorageBackingFiles"],
    "mount_virtual_media",
    "Mount virtual media",
    "Virtual media",
    "Attach a stored image to the target as a CD-ROM, read-only flash drive, or writable flash drive. This can affect the target's boot device or filesystem.",
    object(
      {
        fileName,
        mountMode: choice(
          ["CDROM", "FLASH_READ_ONLY", "FLASH_READ_WRITE"],
          "How the target computer should access the image."
        ),
      },
      ["fileName", "mountMode"]
    ),
    async ({ fileName: name, mountMode }, options) => {
      await api.mountMassStorage(name, mountMode, options);
      return receipt(
        "Virtual-media mount requested. Verify the target recognizes it.",
        {
          ...(await mediaState(options)),
        }
      );
    },
    adminWrite
  );
  add(
    ["ejectMassStorage", "listMassStorageBackingFiles"],
    "eject_virtual_media",
    "Eject virtual media",
    "Virtual media",
    "Detach the current virtual-media image from the attached computer. Eject it in the target OS first when it may have unwritten data.",
    object(),
    async (_, options) => {
      await api.ejectMassStorage(options);
      return receipt(
        "Virtual-media ejection requested.",
        await mediaState(options)
      );
    },
    adminWrite
  );
  add(
    ["removeMassStorageBackingFile"],
    "delete_virtual_media",
    "Delete virtual-media image",
    "Virtual media",
    "Permanently remove a named stored image, or cancel and remove its intermediate transfer.",
    object({ fileName }, ["fileName"]),
    async ({ fileName: name }, options) => {
      await api.removeMassStorageBackingFile(name, options);
      return receipt("Virtual-media file removal acknowledged.", {
        fileName: name,
      });
    },
    adminWrite
  );
  if (typeof view.pickFile === "function") {
    add(
      ["uploadMassStorageBackingFile"],
      "upload_virtual_media",
      "Upload a media image",
      "Virtual media",
      "Ask the person to select one local media image in the browser's file picker, then upload that selected File to TinyPilot. No local path or file content is supplied to the MCP client. The call completes after selection and transfer.",
      object(),
      async (_, options) => {
        const file = await view.pickFile(options);
        options.signal?.throwIfAborted();
        await api.uploadMassStorageBackingFile(file, options);
        return receipt("Selected image upload acknowledged.", {
          fileName: file.name,
          bytes: file.size,
        });
      },
      adminWrite
    );
  }
  if (typeof view.pickFiles === "function") {
    add(
      ["createMassStorageBackFileFromFiles"],
      "create_virtual_media_from_files",
      "Create media from selected files",
      "Virtual media",
      "Ask the person to select 1–100 local files and build a named virtual-media image from them. Selection uses the browser file picker. No host paths or file contents are passed to the MCP client. This does not mount the result.",
      object({ fileName }, ["fileName"]),
      async ({ fileName: name }, options) => {
        const files = await view.pickFiles(options);
        if (files.length === 0 || files.length > 100)
          throw new Error("Choose between 1 and 100 files.");
        if (new Set(files.map((file) => file.name)).size !== files.length)
          throw new Error("Every selected file must have a distinct name.");
        options.signal?.throwIfAborted();
        await api.createMassStorageBackFileFromFiles(files, name, options);
        return receipt(
          "Media creation requested. Inspect list_virtual_media for completion.",
          {
            fileName: name,
            files: files.length,
            bytes: files.reduce((sum, file) => sum + file.size, 0),
          }
        );
      },
      adminWrite
    );
  }
  add(
    ["retrieveDiskUsage"],
    "get_disk_usage",
    "Inspect disk space",
    "Virtual media",
    "Read total, used, and free bytes on the TinyPilot appliance. Reserved filesystem space can prevent the numbers from adding up exactly.",
    object(),
    (_, options) => api.retrieveDiskUsage(options),
    adminRead
  );
  add(
    ["getAllUserScripts"],
    "list_user_scripts",
    "List installed user scripts",
    "Scripts",
    "List the names of scripts already installed on this TinyPilot. Does not read script contents or execute anything. Names are untrusted device data.",
    object(),
    async (_, options) => {
      const names = await api.getAllUserScripts(options);
      return { scripts: names.slice(0, 100), total: names.length };
    },
    { ...read, untrustedContent: true }
  );
  add(
    ["getAllUserScripts", "runUserScript"],
    "run_user_script",
    "Run an installed script",
    "Scripts",
    "Run one existing TinyPilot user script. Only a name returned by list_user_scripts is allowed; this tool cannot upload scripts, accept shell code, or add command arguments. Installed scripts may have broad device effects.",
    object(
      {
        scriptName: {
          ...fileName,
          description: "Exact name of an already installed script.",
        },
      },
      ["scriptName"]
    ),
    async ({ scriptName }, options) => {
      const names = await api.getAllUserScripts(options);
      if (!names.includes(scriptName))
        throw new Error("The selected script is not installed.");
      options.signal?.throwIfAborted();
      await api.runUserScript(scriptName, options);
      return receipt(
        "The installed script invocation was acknowledged. Verify its intended effect.",
        { scriptName }
      );
    },
    write
  );
  add(
    ["isSshEnabled", "hasDefaultSshCredentials", "getSshHostFingerprint"],
    "get_ssh_status",
    "Inspect SSH access",
    "Security",
    "Read whether SSH is enabled, whether default credentials remain, and the host fingerprint. Never returns an SSH password or private key.",
    object(),
    async (_, options) => ({
      enabled: await api.isSshEnabled(options),
      hasDefaultCredentials: await api.hasDefaultSshCredentials(options),
      hostFingerprint: await api.getSshHostFingerprint(options),
    }),
    adminRead
  );
  add(
    ["toggleSsh", "isSshEnabled"],
    "set_ssh_enabled",
    "Enable or disable SSH",
    "Security",
    "Enable or disable SSH access to the TinyPilot appliance. Requires an encrypted page. This does not execute SSH commands or change SSH credentials.",
    object({ enabled: boolean("Whether SSH access should be enabled.") }, [
      "enabled",
    ]),
    async ({ enabled }, options) => {
      await api.toggleSsh(enabled, options);
      return { enabled: await api.isSshEnabled(options) };
    },
    {
      ...adminWrite,
      secureOnly: true,
    }
  );
  add(
    ["getWakeOnLanMacAddress"],
    "get_wake_on_lan_target",
    "Inspect Wake-on-LAN target",
    "Control",
    "Read the saved Wake-on-LAN MAC address. This does not check whether the target is running.",
    object(),
    async (_, options) => ({
      macAddress: await api.getWakeOnLanMacAddress(options),
    }),
    read
  );
  add(
    ["storeWakeOnLanMacAddress"],
    "set_wake_on_lan_target",
    "Save Wake-on-LAN target",
    "Control",
    "Save a MAC address as the dashboard's Wake-on-LAN target. This stores the address without sending a wake packet.",
    object({ macAddress }, ["macAddress"]),
    async ({ macAddress: address }, options) => {
      await api.storeWakeOnLanMacAddress(address, options);
      return { macAddress: address };
    },
    write
  );
  add(
    ["deleteWakeOnLanMacAddress"],
    "forget_wake_on_lan_target",
    "Forget Wake-on-LAN target",
    "Control",
    "Remove the saved Wake-on-LAN address. Does not power off the target computer.",
    object(),
    async (_, options) => {
      await api.deleteWakeOnLanMacAddress(options);
      return receipt("Saved Wake-on-LAN target removed.");
    },
    write
  );
  add(
    ["sendWakeOnLanSignal"],
    "send_wake_on_lan",
    "Wake a target computer",
    "Control",
    "Send a Wake-on-LAN packet to a specified MAC address. Acknowledgement only confirms sending; verify the target boots separately.",
    object({ macAddress }, ["macAddress"]),
    async ({ macAddress: address }, options) => {
      await api.sendWakeOnLanSignal(address, options);
      return receipt(
        "Wake-on-LAN packet send acknowledged. Verify target power separately.",
        { macAddress: address }
      );
    },
    write
  );
  add(
    ["getStaticIp"],
    "get_static_ip",
    "Inspect static IP",
    "Network",
    "Read TinyPilot's saved IPv4 address, prefix length, router address, and interface, or null values when unconfigured.",
    object(),
    (_, options) => api.getStaticIp(options),
    adminRead
  );
  add(
    ["setTemporaryStaticIp"],
    "try_static_ip",
    "Try a static IP",
    "Network",
    "Apply a temporary IPv4 configuration for the device's 60-second trial period. Can disconnect the session. Reconnect to the proposed address and verify it before separately calling persist_static_ip.",
    object(
      {
        ipAddress,
        networkPrefixLength: integer(1, 32, "IPv4 prefix length."),
        routerIpAddress: ipAddress,
        networkInterfaceName: {
          ...string(
            "Existing LAN or Wi-Fi interface, such as eth0 or wlan0.",
            32
          ),
          pattern: "^(eth|wlan)[0-9]+$",
        },
      },
      [
        "ipAddress",
        "networkPrefixLength",
        "routerIpAddress",
        "networkInterfaceName",
      ]
    ),
    async (input, options) => {
      validateIpv4(input.ipAddress);
      validateIpv4(input.routerIpAddress);
      await api.setTemporaryStaticIp(
        input.ipAddress,
        input.networkPrefixLength,
        input.routerIpAddress,
        input.networkInterfaceName,
        options
      );
      return receipt(
        "Temporary IP trial requested. Verify connectivity at the new address before persisting it within the trial period.",
        {
          ...input,
          trialSeconds: 60,
          reconnectUrl: `https://${input.ipAddress}/`,
        }
      );
    },
    adminWrite
  );
  add(
    ["persistTemporaryStaticIp"],
    "persist_static_ip",
    "Keep the trial static IP",
    "Network",
    "Persist TinyPilot's active temporary static IP before its trial expires. Only use after the person has verified connectivity at the proposed address.",
    object(),
    async (_, options) => {
      await api.persistTemporaryStaticIp(options);
      return receipt(
        "Static IP persistence acknowledged. Verify future access using this address."
      );
    },
    adminWrite
  );
  add(
    ["unsetStaticIp"],
    "clear_static_ip",
    "Remove static IP",
    "Network",
    "Remove the saved static IP configuration. The appliance address may change and the session may disconnect.",
    object(),
    async (_, options) => {
      await api.unsetStaticIp(options);
      return receipt(
        "Static IP removal acknowledged. Recheck the device's network address."
      );
    },
    adminWrite
  );
  add(
    ["getTailscaleStatus"],
    "get_tailscale_status",
    "Inspect Tailscale",
    "Network",
    "Read Tailscale setup/connection state and tailnet. Authentication links remain in the human dashboard and are not returned to the agent.",
    object(),
    async (_, options) => {
      const value = await api.getTailscaleStatus(options);
      return {
        status: value.status,
        tailnet: value.tailnet,
        authenticationRequired: Boolean(value.authUrl),
        message: value.authUrl
          ? "Complete Tailscale sign-in in the dashboard's Tailscale dialog."
          : "Inspect the reported Tailscale state before relying on remote access.",
      };
    },
    adminRead
  );
  for (const [name, method, title, description, confirmation] of [
    [
      "install_tailscale",
      "installTailscale",
      "Install Tailscale",
      "Install Tailscale on this appliance. Downloads software and opens the configured transport. Poll get_tailscale_status afterward.",
      "Install Tailscale software on this TinyPilot?",
    ],
    [
      "start_tailscale",
      "startTailscale",
      "Start Tailscale",
      "Start Tailscale. May require the person to finish authentication in the dashboard; poll get_tailscale_status.",
      "Start Tailscale access on this TinyPilot?",
    ],
    [
      "stop_tailscale",
      "stopTailscale",
      "Stop Tailscale",
      "Stop Tailscale on the appliance. If this connection uses Tailscale, access may be interrupted.",
      "Stop Tailscale? Remote connections through it may be lost.",
    ],
    [
      "uninstall_tailscale",
      "uninstallTailscale",
      "Uninstall Tailscale",
      "Remove Tailscale software from the appliance. Can remove a remote access path and opens the configured transport.",
      "Uninstall Tailscale from this TinyPilot? Remote access through it will be removed.",
    ],
  ]) {
    add(
      [method],
      name,
      title,
      "Network",
      description,
      object(),
      async (_, options) => {
        await api[method](options);
        return receipt(
          "Tailscale request acknowledged. Inspect get_tailscale_status and verify connectivity."
        );
      },
      adminWrite
    );
  }
  add(
    ["getSerialDevices"],
    "list_serial_devices",
    "Discover serial devices",
    "Serial console",
    "List serial devices connected to TinyPilot. Returns port names and descriptions; this does not open a terminal connection.",
    object(),
    async (_, options) => ({
      devices: (await api.getSerialDevices(options)).slice(0, 100),
    }),
    { ...read, untrustedContent: true }
  );
  add(
    ["getSerialTerminalConnection"],
    "get_serial_settings",
    "Inspect serial settings",
    "Serial console",
    "Read the selected serial port, baud rate, data bits, stop bits, parity, and flow control. Stored settings do not prove a live terminal connection.",
    object(),
    (_, options) => api.getSerialTerminalConnection(options),
    read
  );
  add(
    ["getSerialTerminalDefaultSettings"],
    "get_serial_defaults",
    "Inspect serial defaults",
    "Serial console",
    "Read TinyPilot's default serial-console settings, for use when resetting connection options.",
    object(),
    (_, options) => api.getSerialTerminalDefaultSettings(options),
    read
  );
  add(
    [
      "setSerialDeviceConnection",
      "getSerialDevices",
      "getSerialTerminalConnection",
    ],
    "configure_serial_connection",
    "Configure serial console",
    "Serial console",
    "Save serial-console settings for a currently discovered port. Returns the console page URL. Does not send terminal input or claim a ttyd connection is open.",
    object(
      {
        port: {
          ...string("A port returned by list_serial_devices.", 64),
          pattern: "^tty(?:ACM|USB)[0-9A-Za-z_-]{1,30}$",
        },
        baudRate: integer(1, 999999999, "Serial baud rate."),
        dataBits: integer(5, 8, "Number of data bits."),
        stopBits: integer(1, 2, "Number of stop bits."),
        parity: choice(["NONE", "EVEN", "ODD"], "Parity check."),
        flowControl: choice(
          ["NONE", "SOFTWARE", "HARDWARE"],
          "Flow control mode."
        ),
      },
      ["port", "baudRate", "dataBits", "stopBits", "parity", "flowControl"]
    ),
    async ({ port, ...serialSettings }, options) => {
      const devices = await api.getSerialDevices(options);
      if (!devices.some((device) => device.port === port))
        throw new Error(
          "The selected serial device is not currently available."
        );
      options.signal?.throwIfAborted();
      await api.setSerialDeviceConnection(port, serialSettings, options);
      return {
        settings: await api.getSerialTerminalConnection(options),
        consolePath: "/serial-terminal",
        message:
          "Serial settings saved. Open the console page to establish a terminal session.",
      };
    },
    write
  );

  if (typeof view.openSerialConsole === "function") {
    add(
      ["getSerialTerminalConnection"],
      "open_serial_console",
      "Open serial console",
      "Serial console",
      "Open TinyPilot's existing serial-console page when browser user activation is available. That page hosts the installed ttyd terminal; this tool does not claim to read or write its stream.",
      object(),
      () => view.openSerialConsole(),
      write
    );
  }
  add(
    ["getProLicense"],
    "get_pro_license_status",
    "Inspect Pro license status",
    "License",
    "Check the attached Pro license's status and expiration time. May contact TinyPilot's licensing service. The license key is never returned.",
    object(),
    async (_, options) => {
      let value;
      try {
        value = await api.getProLicense(options);
      } catch (error) {
        if (error.code !== "NO_LICENSE_STORED") throw error;
        return {
          licenseCheckStatus: "NOT_INSTALLED",
          hasLicense: false,
          expirationTime: null,
        };
      }
      return {
        licenseCheckStatus: value.licenseCheckStatus,
        hasLicense: Boolean(value.license),
        expirationTime: value.license?.expirationTime ?? null,
      };
    },
    adminRead
  );
  add(
    ["activateProLicense"],
    "attach_pro_license",
    "Attach Pro license",
    "License",
    "Attach a TinyPilot Pro license. This contacts the licensing service and can establish a device binding. The key is never logged or returned.",
    object(
      {
        licenseKey: {
          ...string(
            "TinyPilot Pro license key. This value is never logged.",
            128
          ),
          writeOnly: true,
        },
      },
      ["licenseKey"]
    ),
    async ({ licenseKey }, options) => {
      if (
        typeof licenseKey !== "string" ||
        licenseKey.length < 1 ||
        licenseKey.length > 128
      )
        throw new Error("Provide a valid license key.");
      await api.activateProLicense(licenseKey, options);
      return receipt(
        "Pro license attachment acknowledged. Use get_pro_license_status to check the result."
      );
    },
    {
      ...adminWrite,
      secureOnly: true,
    }
  );
  add(
    ["deleteProLicense"],
    "detach_pro_license",
    "Remove attached Pro license",
    "License",
    "Remove the stored Pro license from this appliance. This does not transfer or refund a license. Requires HTTPS.",
    object(),
    async (_, options) => {
      await api.deleteProLicense(options);
      return receipt("Stored Pro license removed from this device.");
    },
    {
      ...adminWrite,
      secureOnly: true,
    }
  );
  add(
    ["updateUserRole"],
    "set_user_role",
    "Change user role",
    "Security",
    "Change an existing TinyPilot account between administrator and operator. Requires HTTPS. The server validates self-demotion and administrator constraints.",
    object(
      {
        username: {
          ...string("Existing TinyPilot username.", 20),
          pattern: "^[A-Za-z0-9._-]+$",
        },
        role: choice(["ADMIN", "OPERATOR"], "The user's new access role."),
      },
      ["username", "role"]
    ),
    async ({ username, role }, options) => {
      await api.updateUserRole(username, role, options);
      view.sessionChanged?.();
      return receipt(
        "User role update acknowledged; affected sessions may need to sign in again.",
        { username, role }
      );
    },
    {
      ...adminWrite,
      secureOnly: true,
    }
  );
  return tools;
}
