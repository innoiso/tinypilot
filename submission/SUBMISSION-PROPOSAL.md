# TinyPilot WebMCP submission proposal

Prepared September 3, 2026 from the final installed implementation and recorded
physical-device proof.

## Submission fields

**Project name:** TinyPilot WebMCP

**Tagline:** A person and an AI agent share the same physical computer console.

**One-sentence pitch:** TinyPilot WebMCP turns the normal browser dashboard for a
remote physical computer into 75 discoverable, typed WebMCP tools, so a person
can delegate console work while watching and retaining control.

**Demo video:** https://youtu.be/4qRk221pgPc — public YouTube video, 2:27.000,
1920×1080 H.264, mono AAC.

**Live app:** https://tinypilot-webmcp-demo.innoiso.workers.dev/ — verified in
ChatGPT's in-app browser with native WebMCP discovery, screen capture, and
pointer calls. Supply the judge credentials privately in the Devpost form. Each
signed-in browser receives session-private TinyDesk state.

**Public source:**
https://github.com/innoiso/tinypilot/tree/codex/tinypilot-webmcp-submission is a
public challenge branch in the `tiny-pilot/tinypilot` fork. It contains the
complete submission and retains the upstream MIT license at the repository
root.

## Description for Devpost

### Inspiration

Remote support often becomes a conversation between someone who can see a
problem and an expert explaining which keys to press. TinyPilot already brings a
remote computer's display, keyboard, and mouse into a browser. We extended that
shared console so an AI agent can take precise, inspectable actions while the
person watches and can intervene at any time.

### What it does

TinyPilot WebMCP exposes the dashboard's major operations as 75 browser-native
tools. They cover console status and screenshots, keyboard and mouse input,
display and video controls, diagnostics, networking, security, updates, power,
and installed TinyPilot Pro capabilities. The tools register as soon as the
normal dashboard loads and are discovered by the WebMCP host.

The demo proves the integration against a physical TinyPilot Pro 3.0.2
appliance and connected computer. Given the goal of reaching _Family Matters_
from Wikipedia's _Common sunflower_ page, the agent observes the same display as
the person and sends its navigation through TinyPilot's WebMCP controls. The
visible result reaches the requested page on the attached computer.

### Why WebMCP fits

TinyPilot connects to the target's physical video output and USB input, so the
target only needs to accept a monitor, keyboard, and mouse. It does not need a
custom agent, browser extension, or remote-control service. That makes agentic
computer use possible for operating-system installers, recovery consoles,
locked-down devices, legacy systems, and remote servers where target-side
software is difficult or impossible to install.

The relevant context already exists in the TinyPilot page: the target computer's
current display, the operator's authenticated session, and the controls the
person is using. WebMCP exposes those capabilities at the moment they are useful.
The person and agent share one dashboard and see the same outcome. A browser
without WebMCP keeps the ordinary TinyPilot dashboard; a WebMCP-capable browser
discovers the additional tools while the person continues to use the same
interface.

### How we built it

The top-level dashboard registers tools with
`document.modelContext.registerTool`. Each tool has a JSON schema and runtime
validation. Execution reuses TinyPilot's existing authenticated frontend actions
and backend interfaces, supports cancellation where applicable, and returns
structured results. Sensitive values are write-only and omitted from adapter
logs. Optional Pro adapters discover installed controllers at runtime without
redistributing TinyPilot's licensed implementation.

The repository includes the implementation, 84 JavaScript tests, the full
capability map, a restricted-container demo, deployment and rollback tooling,
and the upstream MIT license. The physical install was verified by exact source
hashes, active service checks, native browser discovery, and a safe live status
call.

### What is new

TinyPilot Community is the open-source foundation, with its existing authorship
and license retained. The public challenge branch starts at upstream commit
`5f34d8a66d05fb8ca3625e7458915e55cfb7fac7`. Commit
`c6d90c78be56714d18602ae0343171033e7cd8d1` adds the final WebMCP integration,
validation, tests, documentation, demo runtime, and deployment tooling.

## Judging alignment

| Criterion               | Evidence                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| WebMCP leverage         | 75 typed, browser-discovered tools map the dashboard's major supported controls and use the existing operator session.            |
| Execution               | Physical TinyPilot Pro 3.0.2 install, exact-hash deployment record, 84 JavaScript tests, and a recorded end-to-end task.          |
| Potential impact        | Remote support, lab administration, recovery, accessibility, and repetitive console work can be delegated while a person watches. |
| Creativity and ambition | WebMCP reaches through a website into a real remote KVM appliance and attached physical computer.                                 |

## YouTube upload copy

**Title:** TinyPilot WebMCP — AI Computer Control Without Installed Software

**Description:**

> TinyPilot WebMCP exposes the normal TinyPilot dashboard as 75 browser-native
> WebMCP tools. An AI agent can inspect and operate a remote computer through
> TinyPilot without installing agent software on the controlled computer. This
> demonstration uses a physical TinyPilot Pro 3.0.2 appliance and its attached
> computer while the person watches the same console.
>
> Source: https://github.com/innoiso/tinypilot/tree/codex/tinypilot-webmcp-submission
> Live demo: https://tinypilot-webmcp-demo.innoiso.workers.dev/
> WebMCP Challenge: https://openai.com/webmcp-challenge/

## Final submission checklist

- [x] Working implementation uses `document.modelContext.registerTool`.
- [x] Major dashboard capabilities are mapped and documented.
- [x] Physical device proof recorded against the final WebMCP-enabled dashboard.
- [x] Public-demo container and operating instructions are present.
- [x] Open-source MIT license is detectable at repository root.
- [x] Demo video is under three minutes, has audio, and clearly shows WebMCP use.
- [x] Publish the final repository and verify anonymous access.
- [x] Deploy an HTTPS demo and verify it in ChatGPT's in-app browser from
      outside the local network.
- [x] Upload the final MP4 publicly to YouTube and verify anonymous metadata.
- [x] Replace the pending live-demo and YouTube URLs in this document.
- [x] Prepare judge credentials for the private Devpost credential field.
- [ ] Add the live URL, source branch, YouTube URL, and judge credentials to the
      Devpost form.
- [ ] Complete entrant, eligibility, team, and contact fields.
- [ ] Submit on Devpost and retain the final confirmation page or receipt.

## Deadline note

The live Devpost overview displays September 4, 2026 at 1:00 a.m. PDT. Submit
before that deadline and retain the confirmation page or receipt.

## Recording sources

The final cut uses the 11:37:57 a.m. dashboard recording and the physical-device
phone footage from Downloads.
