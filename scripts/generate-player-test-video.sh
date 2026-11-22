#!/usr/bin/env bash
set -euo pipefail
# Test videosu Android test APK'sına girer; kullanıcı APK'sına eklenmez.
if command -v ffmpeg >/dev/null; then
  FFMPEG_BIN="$(command -v ffmpeg)"
else
  # Use an isolated CI-only environment if the runner apt mirror lacks ffmpeg.
  python3 -m venv "${RUNNER_TEMP:-/tmp}/xiptv-ffmpeg-venv"
  "${RUNNER_TEMP:-/tmp}/xiptv-ffmpeg-venv/bin/pip" install -q imageio-ffmpeg==0.6.0
  FFMPEG_BIN="$("${RUNNER_TEMP:-/tmp}/xiptv-ffmpeg-venv/bin/python" -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
fi
mkdir -p android/app/src/androidTest/assets
"$FFMPEG_BIN" -loglevel error -f lavfi -i 'testsrc2=size=320x180:rate=15' -f lavfi -i 'anullsrc=channel_layout=mono:sample_rate=22050' -t 30 -c:v libx264 -preset ultrafast -crf 35 -pix_fmt yuv420p -c:a aac -b:a 24k -movflags +faststart -y android/app/src/androidTest/assets/player-smoke.mp4
