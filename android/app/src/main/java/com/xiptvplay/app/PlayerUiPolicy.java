package com.xiptvplay.app;

/** UI yenileme ve ilerleme kaydı oynatma motorundan bağımsız tutulur. */
final class PlayerUiPolicy {
    static final long CHECKPOINT_MS=10000L;
    static long tickDelay(boolean controlsVisible, boolean playWhenReady, boolean pictureInPicture) {
        return controlsVisible && playWhenReady && !pictureInPicture ? 1000L : 5000L;
    }
    static boolean shouldCheckpoint(long now,long lastCheckpoint,boolean force) {
        return force || now-lastCheckpoint>=CHECKPOINT_MS;
    }
}
