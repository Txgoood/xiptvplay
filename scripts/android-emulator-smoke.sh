#!/usr/bin/env bash
set -euo pipefail
mkdir -p emulator-test-results
PACKAGE=com.xiptvplay.app
APK="$(find emulator-apk -type f -name '*.apk' | head -n 1)"
test -n "$APK"
cleanup() {
  adb logcat -d -v time > emulator-test-results/logcat.txt 2>/dev/null || true
  adb shell dumpsys notification --noredact > emulator-test-results/notifications.txt 2>/dev/null || true
  adb shell dumpsys activity activities > emulator-test-results/activities.txt 2>/dev/null || true
  adb shell screencap -p /sdcard/xiptv-test.png >/dev/null 2>&1 || true
  adb pull /sdcard/xiptv-test.png emulator-test-results/final-screen.png >/dev/null 2>&1 || true
}
trap cleanup EXIT
adb wait-for-device
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
adb install -r "$APK"
adb shell pm grant "$PACKAGE" android.permission.POST_NOTIFICATIONS || true
adb logcat -c
adb shell am force-stop "$PACKAGE"
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1
sleep 12
adb shell pidof "$PACKAGE" > emulator-test-results/app-pid.txt
adb shell dumpsys activity activities > emulator-test-results/launch-activities.txt
if ! grep -q "$PACKAGE" emulator-test-results/launch-activities.txt; then
  echo "FAIL: App did not open"; exit 1
fi
adb shell screencap -p /sdcard/xiptv-foreground.png
adb pull /sdcard/xiptv-foreground.png emulator-test-results/foreground.png >/dev/null
adb shell input keyevent KEYCODE_HOME
sleep 6
adb shell pidof "$PACKAGE" > emulator-test-results/background-pid.txt
adb shell monkey -p "$PACKAGE" -c android.intent.category.LAUNCHER 1
sleep 5
adb shell pidof "$PACKAGE" > emulator-test-results/reopened-pid.txt
adb logcat -d -v brief > emulator-test-results/quick-logcat.txt
if grep -E 'FATAL EXCEPTION|Fatal signal' emulator-test-results/quick-logcat.txt | grep -E -A 10 -B 3 "$PACKAGE|com.xiptvplay" > emulator-test-results/crashes.txt; then
  echo "FAIL: App crash detected"; exit 1
fi
echo "PASS: APK install, launch, background, reopen and basic crash checks"
echo "NOTE: IPTV download queue and notifications require an authenticated test stream and are not exercised here."
