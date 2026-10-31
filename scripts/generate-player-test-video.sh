#!/usr/bin/env bash
set -euo pipefail
# Test videosu Android test APK'sına girer; kullanıcı APK'sına eklenmez.
if ! command -v ffmpeg >/dev/null; then
  sudo apt-get update -qq
  sudo apt-get install -y -qq ffmpeg
fi
mkdir -p android/app/src/androidTest/assets
ffmpeg -loglevel error -f lavfi -i 'testsrc2=size=320x180:rate=15' -f lavfi -i 'anullsrc=channel_layout=mono:sample_rate=22050' -t 30 -c:v libx264 -preset ultrafast -crf 35 -pix_fmt yuv420p -c:a aac -b:a 24k -movflags +faststart -y android/app/src/androidTest/assets/player-smoke.mp4
