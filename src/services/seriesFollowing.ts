import type { MediaItem, SeriesDetail } from '../types';
export interface FollowRecord { id: string; playlistId?: string; title: string; poster: string; baseline?: string[]; checkedAt?: number; targetSeason?: number; targetEpisode?: number; notice?: 'episode'|'season'; newCount?: number; error?: string }
const key = (profile: string) => 'xiptvplay_following_v1_' + profile;
export function readFollowing(profile: string): FollowRecord[] {
  try { const rows = JSON.parse(localStorage.getItem(key(profile)) || '[]'); return Array.isArray(rows) ? rows.filter(r => typeof r.id === 'string').slice(0,50) : []; } catch { return []; }
}
function save(profile: string, rows: FollowRecord[]) { try { localStorage.setItem(key(profile), JSON.stringify(rows.slice(0,50))); } catch {} window.dispatchEvent(new CustomEvent('xiptv-following', {detail: profile})); }
export function episodeSnapshot(detail: SeriesDetail): string[] {
  return [...new Set(Object.values(detail.episodes).flat().filter(ep => ep.seasonNum >= 0 && ep.episodeNum > 0).map(ep => `${ep.seasonNum}:${ep.episodeNum}`))].sort((a,b) => {
    const [sa,ea]=a.split(':').map(Number),[sb,eb]=b.split(':').map(Number); return sa-sb || ea-eb;
  });
}
export function compareEpisodes(record: FollowRecord, snapshot: string[], now = Date.now()): FollowRecord {
  if (!snapshot.length) return {...record, checkedAt:now, error:'Bölüm listesi doğrulanamadı'};
  if (!record.baseline) return {...record, baseline:snapshot, checkedAt:now, error:undefined};
  const previous = new Set(record.baseline), added = snapshot.filter(code => !previous.has(code));
  const oldMax = Math.max(0, ...record.baseline.map(code=>Number(code.split(':')[0])));
  const target = added[0]?.split(':').map(Number);
  // Eksilen bölüm ve geçici boş yanıt eski bilgiyi silmez; ilk takip bildirim üretmez.
  return {...record, baseline:[...new Set([...record.baseline,...snapshot])], checkedAt:now, error:undefined,
    ...(added.length ? {notice:added.some(code=>Number(code.split(':')[0])>oldMax)?'season' as const:'episode' as const, newCount:(record.newCount||0)+added.length, targetSeason:target![0],targetEpisode:target![1]} : {})};
}
export function toggleFollowing(profile: string, item: MediaItem, detail?: SeriesDetail): boolean {
  const rows=readFollowing(profile), index=rows.findIndex(r=>r.id===item.id);
  if(index>=0) { rows.splice(index,1); save(profile,rows); return false; }
  if(rows.length>=50) throw new Error('En fazla 50 dizi takip edebilirsin.');
  const snapshot=detail?episodeSnapshot(detail):[];
  rows.push({id:item.id,playlistId:item.playlistId,title:item.title,poster:item.poster,...(snapshot.length?{baseline:snapshot,checkedAt:Date.now()}:{})}); save(profile,rows); return true;
}
export function updateFollowing(profile: string,id:string,detail?:SeriesDetail,error?:string) {
  const current=readFollowing(profile);if(!current.some(row=>row.id===id))return;
  save(profile,current.map(row=>row.id!==id?row:detail?compareEpisodes(row,episodeSnapshot(detail)):{...row,error:error||'Kontrol edilemedi',checkedAt:Date.now()}));
}
export function acknowledgeFollowing(profile: string,id:string) { save(profile,readFollowing(profile).map(row=>row.id===id?{...row,notice:undefined,newCount:undefined}:row)); }
