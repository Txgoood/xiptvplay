export type InterfaceMode = 'phone' | 'tv';
const KEY = 'xiptv_interface_mode_v1';
export function detectInterfaceMode(): InterfaceMode {
  return /XIPTV-TV|Android TV|Google TV/i.test(navigator.userAgent) ? 'tv' : 'phone';
}
export function readInterfaceMode(): InterfaceMode | null {
  try { const value=localStorage.getItem(KEY); return value==='tv'||value==='phone'?value:null; } catch { return null; }
}
let cachedMode:InterfaceMode|undefined;
export function getInterfaceMode(): InterfaceMode { return cachedMode ?? (cachedMode=readInterfaceMode() || detectInterfaceMode()); }
export function saveInterfaceMode(mode:InterfaceMode):void { localStorage.setItem(KEY,mode); cachedMode=mode; }
