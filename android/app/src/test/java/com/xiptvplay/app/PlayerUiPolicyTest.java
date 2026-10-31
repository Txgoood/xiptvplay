package com.xiptvplay.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class PlayerUiPolicyTest {
 @Test public void hiddenPausedAndPipControlsDoNotRequestOneSecondUiTicks(){
  assertEquals(1000L,PlayerUiPolicy.tickDelay(true,true,false));
  assertEquals(5000L,PlayerUiPolicy.tickDelay(false,true,false));
  assertEquals(5000L,PlayerUiPolicy.tickDelay(true,false,false));
  assertEquals(5000L,PlayerUiPolicy.tickDelay(true,true,true));
 }
 @Test public void normalPlaybackWritesAtTenSecondsButPauseSeekAndExitCanCheckpointImmediately(){
  assertFalse(PlayerUiPolicy.shouldCheckpoint(19999L,10000L,false));
  assertTrue(PlayerUiPolicy.shouldCheckpoint(20000L,10000L,false));
  assertTrue(PlayerUiPolicy.shouldCheckpoint(10001L,10000L,true));
 }
}
