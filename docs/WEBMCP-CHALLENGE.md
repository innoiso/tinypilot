# TinyPilot WebMCP — challenge entry package

This is the submission preparation document for the WebMCP extension to TinyPilot
Community. It is not a submission receipt or a claim of a competition result.
Requirements below were checked against primary sources on September 3, 2026.

## Official requirements

The [official rules](https://webmcp.devpost.com/rules) close registration and
submission on **September 3, 2026 at 1:00 p.m. Pacific Time**. Existing applications
qualify when meaningfully extended during the submission period; distinguish the
new work with dated commit evidence. Open-source foundations are permitted when
their licenses are respected. The entry must remain freely accessible to judges
through September 21 at 5:00 p.m. Pacific Time. Hardware access may be requested.
Entrants must satisfy age, location, representation, and conflict-of-interest
requirements. The representative should review the rules before submitting.

The [submission overview](https://webmcp.devpost.com/) requires:

- A working live URL usable in ChatGPT's in-app browser or WebMCP-enabled Chrome.
  Authentication is permitted; supply judge credentials in the submission form.
- A public GitHub, GitLab, or Bitbucket repository containing source, assets,
  operating instructions, and a detectable open-source license.
- A **public YouTube video under three minutes**, with audio demonstrating the
  working application and its use of WebMCP.
- A description explaining why WebMCP fits the use case, how it improves the
  experience, what people and agents can accomplish together, and implementation.

The judging dimensions are WebMCP use, execution, potential impact, and creativity
and ambition. [Judging criteria](https://webmcp.devpost.com/#judging-criteria)

## Entry positioning

**Proposed title:** TinyPilot WebMCP

**Tagline:** A person and an AI agent share the same remote computer console.

The distinctive demonstration should be an actual support task completed together:
observe the connected computer, make a precise input, verify the visible result,
adjust the console experience, and hand control back to the person. A long list
of tool definitions alone does not communicate the benefit.

TinyPilot Community's existing video, keyboard, mouse, authentication, settings,
and device-management implementation is prior work. The challenge contribution
is the WebMCP tool layer, schema validation, cancellation support, and
corresponding verification and documentation. Preserve
the upstream copyright and [MIT license](../LICENSE).

The starting checkout for this work was
`12648779a2790049bf7fa93e576d8d7d45b6d199`. Record the final challenge commit SHA,
commit dates, and comparison URL before submission. Do not present the upstream
TinyPilot code as newly created challenge work.

## Compatibility contract

OpenAI's current [site tools documentation](https://learn.chatgpt.com/docs/webmcp)
requires JavaScript registration in the top-level page. Its browser does not
discover declarative form tools or iframe tools. Feature-detect support and keep
the ordinary dashboard usable. Site tools use the existing page and signed-in
session; the browser reviews invocations. Use a supported model and app version
for the recorded test.

The current [WebMCP draft](https://webmachinelearning.github.io/webmcp/) uses
`document.modelContext`. Await `registerTool(tool, options)`. An execution callback
receives `(input, { signal })` and returns a JSON-serializable result or a promise.
An execution signal cancels work; a registration signal unregisters the tool.
The integration supplies read-only, destructive, and untrusted-content
annotations and leaves invocation policy to the browser MCP host.

```javascript
if (typeof document.modelContext?.registerTool === "function") {
  await document.modelContext.registerTool({
    name: "example_status",
    description: "Read the current console connection status.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true },
    execute: async (_input, options) => readStatus(options?.signal),
  });
}
```

The snippet explains the browser API; `readStatus` is an illustrative function,
not a TinyPilot endpoint. A `navigator.modelContext` fallback is compatibility
support for older implementations, not the current standard or proof of native
registration. Keep browser-discovery evidence for the `document` path.

Chrome's [imperative API guide](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
also documents registration and execution cancellation. Its manually invoked
`executeTool` example currently passes a JSON string, while the current draft
IDL accepts an object. Avoid depending on that consumer method in production
tool registration; use the actual target browser's discovery and invocation
surface for verification.

## Product and evidence plan

| Judging dimension       | What the entry should demonstrate                                                                                             | Evidence to keep                                         |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| WebMCP use              | A discoverable tool for each major supported Community or installed Pro operation, with precise parameters and useful results | Native browser tool inventory and representative calls   |
| Execution               | Tools call the existing dashboard logic and update the same interface a person sees                                           | One continuous task recording with visible results       |
| Potential impact        | A remote support operator delegates repetitive console work and retains control                                               | A concrete support scenario on a dedicated test computer |
| Creativity and ambition | An agent participates in a physical computer console through the browser, including recovery contexts                         | Actual device footage when available; label simulations  |

The implementation should cover observation, screenshot capture, text and key
input, mouse movement/click/drag/scroll, display preferences, video settings,
network inspection and configuration, account/security controls, diagnostics,
updates, and TinyPilot appliance power. Optional Pro adapters discover real
installed controllers for media, scripts, SSH, Wake-on-LAN, static IP, Tailscale,
serial, license, and role operations. They register nothing on Community when
those capabilities are absent. The serial byte-stream adapter is separately
enabled only with its server-side authentication patch. Label mocked transport
tests and the isolated Community demo separately from physical device evidence.

Tools should expose completed outcomes distinctly from started operations.
Changing TinyPilot settings and manipulating the attached computer are different
effects; the interface and tool descriptions should identify which device is
affected. A request acknowledged by TinyPilot does not prove the attached
computer received it or reached the desired state.

Use narrow runtime validation, bounded inputs, and cancellation.
Keep authentication and authorization in the existing application path. Secret
inputs are marked write-only and omitted from logs and results. These are
product controls; tool names and annotations do not establish trust. OpenAI describes website tool definitions and results as untrusted in its
[security guidance](https://learn.chatgpt.com/docs/webmcp#security-and-user-controls).

## Suggested demo: 2 minutes 40 seconds

Use the final deployed build, a dedicated demo account, and a non-sensitive test
computer. Keep the browser's native tool activity visible at least once. Record
actual calls and visible results; do not splice a mock response into hardware
footage as if it came from the device.

| Time      | On screen                                  | Narration or prompt                                                                                                                                                                        |
| --------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:15 | TinyPilot dashboard and connected computer | "TinyPilot lets people control a remote computer. This extension lets an agent work beside the person in the same console."                                                                |
| 0:15–0:35 | Native Site tools inventory                | "These are browser-discovered WebMCP tools using the dashboard's existing session and controls." Show a status read and the supported capability list.                                     |
| 0:35–1:20 | Connected test computer and tool activity  | Prompt: "Inspect this console. Open the test editor, type a short support note, and verify the result on screen." Show the actual input calls and resulting text.                          |
| 1:20–1:45 | Shared display settings                    | Prompt: "Show the on-screen keyboard and change the cursor to a crosshair." Show both changes occurring in the person's dashboard.                                                         |
| 1:45–2:10 | Native tool inventory and logs             | Reload the dashboard, show immediate native discovery, and show concise registration and call logs.                                                                                        |
| 2:10–2:30 | Human and MCP input                        | Use one reversible MCP input action, then show normal keyboard and mouse controls in the unchanged TinyPilot interface.                                                                    |
| 2:30–2:40 | Working result, source link, and scope     | "The WebMCP extension is open source. This demo runs [state actual runtime]. The same extension discovers real Pro capabilities when installed; unavailable features are never simulated." |

If the test editor is not available, choose another reversible action supported
by the actual target. If the runtime is a mock device, say so aloud and in the
video description. Only describe BIOS, pre-boot, or hardware recovery behavior
when the recorded runtime demonstrates it.

## Submission description draft

The following copy is a draft. Reconcile each assertion with the final build and
evidence before pasting it into Devpost.

### Inspiration and problem

Remote support is often a conversation between a person who can see a problem
and an expert explaining which keys to press. TinyPilot already brings a remote
computer's display, keyboard, and mouse into a browser. We extended that shared
console so an agent can take precise, inspectable actions while the person
watches and remains able to intervene.

### Why WebMCP fits

The relevant context is already on the page: the connected computer, the current
view, the operator's session, and the visible controls. WebMCP makes those
capabilities discoverable to the agent at that moment. The person and agent use
the same dashboard and observe the same outcome. The integration does not need a
separate connection setup for every console session.

### What we built

The extension maps TinyPilot's major controls to named WebMCP tools: console
observation and input, display preferences, device settings, diagnostics,
security, and administration. Optional adapters expose installed Pro media,
networking, license, role, script, and serial capabilities without bundling
licensed implementation code. The tools register immediately when the dashboard loads, without adding any
TinyPilot agent UI or task runtime. Tool results distinguish successful changes,
cancellation, unavailable features, and failures. Password and license-key
schemas mark those inputs write-only, and the adapter logs no arguments or
results. File transfers use a real browser file picker.

### Implementation

The top-level dashboard registers tools with `document.modelContext.registerTool`.
Inputs have explicit schemas and runtime validation. Execution reuses TinyPilot's
existing frontend actions and authenticated backend interfaces. The ordinary
dashboard remains available in browsers without WebMCP. The implementation also
accommodates older browser API placement without treating it as the canonical
standard.

### What is new

TinyPilot Community is the open-source foundation, with its upstream authorship
and license retained. Our challenge work adds the WebMCP integration, its tests and documentation. The final submission
links the dated changes against the starting commit. Original Pro adapters call
the licensed controllers already installed on the device. The serial transport
uses the public ttyd protocol and is enabled only with its server-side
authentication patch. The public source does not redistribute licensed
TinyPilot implementations.

### Demonstrated outcome

The final recording shows a physical TinyPilot Pro 3.0.2 appliance and its
connected computer, followed by the TinyPilot dashboard in Google Chrome 152 on
macOS. The agent uses the dashboard's native WebMCP controls to navigate
Wikipedia from Common sunflower to Family Matters. The final page is visible in
the TinyPilot console. The successful run is shown continuously at 1.35x
playback; on-screen labels identify observed milestones rather than synthetic
tool results.

## Submission values and proof record

| Item                                | Value                                                                                           |
| ----------------------------------- | ----------------------------------------------------------------------------------------------- |
| Entrant / authorized representative | Pending                                                                                         |
| Live URL                            | Pending deployment and judge-access verification                                                |
| Judge credentials                   | Supply privately in the Devpost form if required                                                |
| Public repository                   | Pending publication of final challenge changes                                                  |
| Installed implementation commit     | `aec290a32f224f5ddefd1b9896e112a11046ddc2`                                                      |
| Public YouTube URL                  | Final video built; pending publication                                                          |
| Video duration                      | 2:27.000; 1920×1080 H.264 with stereo AAC audio                                                 |
| Actual tested browser / version     | Google Chrome 152 on macOS                                                                      |
| Native registered tool count        | 75 unique; authentication-disabled Pro; 0 errors                                                |
| Verified local checks               | 77 JS tests; demo and restricted-container self-tests; install/rollback round trip              |
| Verified real device checks         | Pro 3.0.2; 11 exact hashes; services active; safe native status/about/disconnected-serial calls |
| Devpost submission receipt          | Pending; saving a draft is not submission                                                       |

This file alone does not prove native tool discovery, hardware input delivery,
public deployment, video publication, or challenge submission. Fill each entry
from its own observed result.
