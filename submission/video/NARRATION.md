# TinyPilot WebMCP demo narration

The final narration is the user's `New Recording 5` Voice Memos take. It is a
clean continuous recording, so no words or passages were removed. The untouched
source remains local and excluded from Git.

## Audio files

- `human-voiceover-original-5.m4a`: untouched local Voice Memos source, excluded
  from the public repository
- `human-voiceover-edited.flac`: lossless normalized edit used by the video
- `human-voiceover-edited.m4a`: standalone review copy
- `narration.txt`: transcript of the selected take

## Processing

The selected take receives a 70 Hz high-pass filter, 14 kHz low-pass filter,
48 kHz resampling, and loudness normalization to -16 LUFS with a -1.5 dB
true-peak target. No content edit or synthetic replacement is applied.
