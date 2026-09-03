# TinyPilot WebMCP submission proposal

Prepared September 3, 2026 from the final installed implementation and recorded
physical-device proof.

## Submission fields

**Project name:** TinyPilot WebMCP

**Tagline:** A person and an AI agent share the same physical computer console.

**One-sentence pitch:** TinyPilot WebMCP turns the normal browser dashboard for a
remote physical computer into 75 discoverable, typed WebMCP tools, so a person
can delegate console work while watching and retaining control.

**Demo video:** `submission/video/tinypilot-webmcp-demo.mp4` — 2:27.000,
1920×1080 H.264, mono AAC. Publish as a public YouTube video and replace this
line with the URL.

**Live app:** Pending a judge-accessible HTTPS URL. `https://tinypilot/` is the
verified physical appliance on the local network and is not sufficient for
remote judges. The repository includes `Dockerfile.webmcp-demo` and an isolated
demo server for a public deployment.

**Public source:** https://github.com/innoiso/tinypilot is a public GitHub fork
of `tiny-pilot/tinypilot`. Its default `master` branch contains the complete
submission and retains the upstream MIT license at the repository root.

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
appliance and connected computer. Given the goal of reaching *Family Matters*
from Wikipedia's *Common sunflower* page, the agent observes the same display as
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

| Criterion | Evidence |
| --- | --- |
| WebMCP leverage | 75 typed, browser-discovered tools map the dashboard's major supported controls and use the existing operator session. |
| Execution | Physical TinyPilot Pro 3.0.2 install, exact-hash deployment record, 84 JavaScript tests, and a recorded end-to-end task. |
| Potential impact | Remote support, lab administration, recovery, accessibility, and repetitive console work can be delegated while a person watches. |
| Creativity and ambition | WebMCP reaches through a website into a real remote KVM appliance and attached physical computer. |

## YouTube upload copy

**Title:** TinyPilot WebMCP — An AI Agent Controls a Physical Computer Through the Browser

**Description:**

> TinyPilot WebMCP exposes the normal TinyPilot dashboard as 75 browser-native
> WebMCP tools. This demo uses a physical TinyPilot Pro 3.0.2 appliance and an
> attached computer. The agent starts at Wikipedia's Common sunflower page and
> reaches Family Matters through TinyPilot while the person watches the same
> console. Narrated by the builder from a physical hardware test.
>
> Source: https://github.com/innoiso/tinypilot
> Live demo: [PUBLIC HTTPS URL]
> WebMCP Challenge: https://openai.com/webmcp-challenge/

## Final submission checklist

- [x] Working implementation uses `document.modelContext.registerTool`.
- [x] Major dashboard capabilities are mapped and documented.
- [x] Physical device proof recorded against the final WebMCP-enabled dashboard.
- [x] Public-demo container and operating instructions are present.
- [x] Open-source MIT license is detectable at repository root.
- [x] Demo video is under three minutes, has audio, and clearly shows WebMCP use.
- [x] Publish the final repository and verify anonymous access.
- [ ] Deploy an HTTPS demo and verify it in WebMCP-enabled Chrome or ChatGPT's in-app browser from outside the local network.
- [ ] Upload the final MP4 to YouTube as Public and verify playback without signing in.
- [ ] Replace the pending live-demo and YouTube URLs in this document and the
  Devpost form.
- [ ] Add judge credentials privately if the live app requires authentication.
- [ ] Complete entrant, eligibility, team, and contact fields.
- [ ] Submit on Devpost and retain the final confirmation page or receipt.

## Deadline note

The OpenAI challenge page states September 3, 2026 at 1:00 p.m. Pacific, while
the live Devpost overview currently displays September 4, 2026 at 1:00 a.m.
PDT. Treat the earlier time as the safe cutoff and submit immediately; do not
plan around the discrepancy.

## Recording sources

The final cut uses the 11:37:57 a.m. dashboard recording and the physical-device
phone footage from Downloads.
