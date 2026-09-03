#!/bin/zsh
set -euo pipefail

repo_root="${0:A:h:h:h}"
source_audio="${1:-${repo_root}/submission/video/human-voiceover-original-5.m4a}"
lossless_output="${repo_root}/submission/video/human-voiceover-edited.flac"
review_output="${repo_root}/submission/video/human-voiceover-edited.m4a"

ffmpeg -hide_banner -y -i "${source_audio}" -filter_complex \
  "[0:a]highpass=f=70,lowpass=f=14000,loudnorm=I=-16:LRA=11:TP=-1.5,aresample=48000[clean]" \
  -map '[clean]' -map_metadata -1 -c:a flac "${lossless_output}"

ffmpeg -hide_banner -y -i "${lossless_output}" -map_metadata -1 \
  -c:a aac -b:a 128k \
  "${review_output}"
