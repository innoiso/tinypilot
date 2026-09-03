// Loaded exclusively by dev-scripts/serve-webmcp-demo, never by the device UI.
if (window.TINYPILOT_WEBMCP_DEMO === true) {
  const banner = document.createElement("div");
  banner.id = "webmcp-demo-banner";
  banner.setAttribute("role", "note");
  banner.style.cssText =
    "display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:18px;" +
    "min-height:30px;padding:4px 12px;box-sizing:border-box;" +
    "background:#fff2d7;color:#684611;font:13px system-ui,sans-serif;";
  const label = document.createElement("span");
  label.textContent = "Demo device — no physical hardware connected";
  banner.append(label);
  const screen = document.getElementById("remote-screen");
  if (screen) {
    const reset = document.createElement("button");
    reset.textContent = "Reset sample screen";
    reset.type = "button";
    reset.style.cssText =
      "background:transparent;border:1px solid #b09159;border-radius:4px;" +
      "padding:3px 8px;color:inherit;font:inherit;cursor:pointer;";
    reset.addEventListener("click", async () => {
      reset.disabled = true;
      try {
        const response = await fetch("/webmcp-demo/reset", {
          method: "POST",
          headers: {
            "X-CSRFToken": document.querySelector('meta[name="csrf-token"]')
              .content,
          },
          credentials: "same-origin",
        });
        if (!response.ok) throw new Error("Reset failed");
        refresh();
      } catch {
        label.textContent = "Demo reset failed. Reload to check the session.";
      } finally {
        reset.disabled = false;
      }
    });
    banner.append(reset);
  }
  const header = document.querySelector(".header-bar");
  if (header) header.append(banner);
  else document.body.prepend(banner);
  const refresh = () => {
    const image = screen?.shadowRoot?.getElementById("mjpeg-output");
    if (!image || document.hidden) return;
    // H.264 configuration is retained, but the demo has no encoder or Janus.
    screen.removeAttribute("webrtc-enabled");
    image.src = `/stream?demoFrame=${Date.now()}`;
  };
  if (screen) {
    customElements.whenDefined("remote-screen").then(refresh);
    window.setInterval(refresh, 750);
  }
}
