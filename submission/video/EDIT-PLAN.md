# Demo video edit plan

Target: a public YouTube upload under three minutes with an audio track.

## Source selection

- `PXL_20260903_183528145.mp4`: physical appliance and two-computer proof.
- `Screen Recording 2026-09-03 at 11.37.57 AM.mov`: clean dashboard and the
  completed Common sunflower to Family Matters run.
- `human-voiceover-original-5.m4a`: locally retained human narration source;
  the video uses the normalized lossless edit.

## Timeline

| Output time | Source | Treatment |
| --- | --- | --- |
| 0:00-0:05 | Generated title | Project name and one-line value proposition |
| 0:05-0:17 | Phone video 0:00-0:12 | Physical appliance and both computers |
| 0:17-0:26 | Phone video 0:33-0:42 | Close view of TinyPilot and the target display |
| 0:26-0:36 | Screen recording 0:00-0:10 | Normal dashboard and the user's WebMCP task |
| 0:36-2:17.5 | Screen recording 2:25-4:42 | Completed run at 1.35x, with chapter labels only |
| 2:17.5-2:27 | Screen recording 4:42-4:46.5 and generated card | Hold the Family Matters result, then show repository call to action |

The screen recording remains continuous during the successful run. Speed is
increased to remove waiting time; chapter labels identify observed milestones
and do not represent synthetic tool results.

Rebuild from the repository root by supplying the two original source paths:

```sh
PHONE_SOURCE='/path/to/PXL_20260903_183528145.mp4' \
SCREEN_SOURCE='/path/to/Screen Recording 2026-09-03 at 11.37.57 AM.mov' \
submission/video/build-demo-video.sh
```
