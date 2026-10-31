#!/usr/bin/env bash
set -euo pipefail
PACKAGE=com.xiptvplay.app
TEST_APK="$(find emulator-player-tests -type f -name '*.apk' | head -n 1)"
test -n "$TEST_APK"
adb install -r "$TEST_APK"
adb shell am instrument -w -r -e class com.xiptvplay.app.NativePlayerControlsTest com.xiptvplay.app.test/androidx.test.runner.AndroidJUnitRunner | tee emulator-test-results/player-controls-instrumentation.txt
for NAME in player-controls-portrait player-controls-landscape player-controls-restored; do
  adb exec-out run-as "$PACKAGE" cat "files/$NAME.png" > "emulator-test-results/$NAME.png" || true
done
if ! grep -Eq 'OK \([0-9]+ test' emulator-test-results/player-controls-instrumentation.txt; then
  echo 'FAIL: native player controls instrumentation'; exit 1
fi
echo 'PASS: real local video pause/play, auto-hide, controls order, rotation, paused background restore and next episode'
