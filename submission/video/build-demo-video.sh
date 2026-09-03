#!/bin/zsh
set -euo pipefail

repo_root="${0:A:h:h:h}"
phone_source="${PHONE_SOURCE:-}"
screen_source="${SCREEN_SOURCE:-}"
voiceover="${VOICEOVER_SOURCE:-${repo_root}/submission/video/human-voiceover-edited.flac}"
output="${1:-${repo_root}/submission/video/tinypilot-webmcp-demo.mp4}"

if [[ -z "${phone_source}" || -z "${screen_source}" ]]; then
  print -u2 -- 'Set PHONE_SOURCE and SCREEN_SOURCE to the original recording paths.'
  exit 2
fi

for source in "${phone_source}" "${screen_source}" "${voiceover}"; do
  if [[ ! -f "${source}" ]]; then
    print -u2 -- "Missing source: ${source}"
    exit 2
  fi
done

cd "${repo_root}"
python3 submission/video/generate-cards.py

ffmpeg -hide_banner -y \
  -i "${phone_source}" \
  -i "${screen_source}" \
  -i "${voiceover}" \
  -filter_complex_script submission/video/filter-complex.txt \
  -map '[vout]' -map '[aout]' \
  -map_metadata -1 -r 30 \
  -c:v libx264 -preset medium -crf 20 -profile:v high -level 4.2 \
  -c:a aac -b:a 192k -ar 48000 \
  -movflags +faststart -shortest "${output}"

ffprobe -v error \
  -show_entries format=duration,size:stream=index,codec_name,width,height,sample_rate,channels \
  -of json "${output}"
