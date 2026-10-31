import React,{useEffect,useState} from 'react';
import {Bell,BellRing,RefreshCw} from 'lucide-react';
import type {MediaItem,Playlist,SeriesDetail} from '../../types';
import {readFollowing,toggleFollowing,updateFollowing,acknowledgeFollowing,type FollowRecord} from '../../services/seriesFollowing';
import {IptvService} from '../../services/iptvService';
import {StorageService} from '../../services/storage';
function useFollowing(profile:string) {
 const [rows,setRows]=useState(()=>readFollowing(profile));
 useEffect(()=>{setRows(readFollowing(profile));const refresh=(event:Event)=>{if((event as CustomEvent).detail===profile)setRows(readFollowing(profile));};window.addEventListener('xiptv-following',refresh);return()=>window.removeEventListener('xiptv-following',refresh);},[profile]);
 return rows;
}
export function FollowButton({profile,item,detail}:{profile:string;item:MediaItem;detail?:SeriesDetail}) {
 const rows=useFollowing(profile),followed=rows.some(row=>row.id===item.id),[error,setError]=useState('');
 return <div><button aria-pressed={followed} onClick={()=>{try{toggleFollowing(profile,item,detail);setError('');}catch(e){setError(String((e as Error).message));}}} className="inline-flex min-h-11 items-center gap-2 px-4 py-2 rounded-full border border-[#00f0ff]/40 text-[#00f0ff] text-sm">{followed?<BellRing size={16}/>:<Bell size={16}/>} {followed?'Takip ediliyor':'Takip et'}</button>{error&&<p role="alert" className="text-xs text-amber-200">{error}</p>}<p className="text-[10px] text-[#849495] mt-1">Kataloğa yeni bölüm / sezon eklendiğinde burada haber verilir.</p></div>;
}
// Profil başına tek kontrol; ekran değişince ağ kuyruğu çoğalmaz.
const checking=new Set<string>();
export function FollowingShelf({profile,catalog,playlist,onOpen}:{profile:string;catalog:MediaItem[];playlist:Playlist|null;onOpen:(item:MediaItem,season?:number,episode?:number)=>void}) {
 const rows=useFollowing(profile),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const lookup=React.useMemo(()=>new Map(catalog.filter(item=>item.type==='series').map(item=>[item.id,item])),[catalog]);
 const visible=rows.filter(row=>lookup.has(row.id));
 const check=async(force=false)=>{
  if(checking.has(profile))return;
  const queue=readFollowing(profile).filter(row=>lookup.has(row.id)&&(force||!row.checkedAt||Date.now()-row.checkedAt>15*60000));
  if(!queue.length)return;
  checking.add(profile);setBusy(true);setMessage('');
  let cursor=0;
  const worker=async()=>{while(cursor<queue.length){const row=queue[cursor++],item=lookup.get(row.id)!;
    const source=StorageService.getPlaylists().find(p=>p.id===item.playlistId)||(playlist?.id===item.playlistId||!item.playlistId?playlist:null);
    try{const result=await IptvService.fetchSeriesDetail(item,source);if(!result.success||result.isFallback)updateFollowing(profile,row.id,undefined,'Sağlayıcı bölüm listesi doğrulanamadı');else updateFollowing(profile,row.id,result.seriesDetail);}
    catch{updateFollowing(profile,row.id,undefined,'Bağlantı kurulamadı; tekrar deneyebilirsin');}
  }};
  try{await Promise.all([worker(),worker()]);setMessage('Kontrol tamamlandı');}finally{checking.delete(profile);setBusy(false);}
 };
 useEffect(()=>{void check();},[profile,catalog,rows.length]);
 if(!visible.length)return null;
 return <section aria-label="Takip ettiklerin" className="min-w-0"><div className="flex justify-between items-center gap-2"><h2 className="font-bold text-base text-[#00f0ff] flex gap-2 items-center"><Bell size={17}/>Takip ettiklerin</h2><button disabled={busy} onClick={()=>void check(true)} className="min-h-11 text-xs flex gap-1 items-center text-[#b9cacb]"><RefreshCw size={14} className={busy?'animate-spin':''}/>{busy?'Kontrol ediliyor':'Kontrol et'}</button></div>
 <div className="flex gap-3 overflow-x-auto pb-2">{visible.map(row=><FollowingCard key={row.id} row={row} onOpen={()=>{onOpen(lookup.get(row.id)!,row.targetSeason,row.targetEpisode);acknowledgeFollowing(profile,row.id);}}/>)}</div>{message&&<p role="status" className="text-[10px] text-[#849495]">{message}</p>}</section>;
}
function FollowingCard({row,onOpen}:{row:FollowRecord;onOpen:()=>void}) {return <button onClick={onOpen} className="w-28 shrink-0 text-left"><div className="relative"><img src={row.poster} alt="" loading="lazy" className="w-full aspect-[2/3] object-cover rounded-xl"/>{row.notice&&<span className="absolute top-1 left-1 right-1 text-center bg-amber-300 text-black text-[10px] rounded-full py-1 font-bold">{row.notice==='season'?'Yeni sezon':'Yeni bölüm'}{row.newCount?` · ${row.newCount}`:''}</span>}</div><span className="block text-xs font-bold mt-1 line-clamp-2">{row.title}</span><span className="block text-[10px] text-[#b9cacb]">{row.error||(!row.baseline?'İlk kontrol bekleniyor':row.notice?`S${row.targetSeason} · B${row.targetEpisode}`:'Güncel')}</span></button>;}
