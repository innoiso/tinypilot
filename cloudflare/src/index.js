import { Container, getContainer } from "@cloudflare/containers";
import { env } from "cloudflare:workers";

export class TinyPilotContainer extends Container {
  defaultPort = 8000;
  sleepAfter = "10m";
  envVars = {
    TINYPILOT_DEMO_PASSWORD: env.TINYPILOT_DEMO_PASSWORD,
    TINYPILOT_DEMO_FLASK_SECRET: env.TINYPILOT_DEMO_FLASK_SECRET,
  };
}

export default {
  fetch(request, workerEnv) {
    return getContainer(workerEnv.TINYPILOT_CONTAINER, "demo").fetch(request);
  },
};
