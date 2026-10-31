import {useMemo} from 'react';
import type {MediaItem} from '../../types';
import {similarMedia} from '../../services/discoveryTools';
export function SimilarMediaSection({media,catalog,genres,onInfo}:{media:MediaItem;catalog:MediaItem[];genres?:string[];onInfo:(item:MediaItem)=>void}) {
 const rows=useMemo(()=>similarMedia(media,catalog,genres),[media,catalog,genres]);
 if(!rows.length)return null;
 return <section aria-label="Benzerlerini keşfet"><h3 className="font-bold text-sm text-[#00f0ff]">Benzerlerini keşfet</h3><p className="text-xs text-[#849495] my-1">Kataloğunda bulunan öneriler</p><div className="flex gap-3 overflow-x-auto py-2">{rows.map(({item,reason})=><button onClick={()=>onInfo(item)} key={item.id} className="w-28 shrink-0 text-left"><img src={item.poster} alt="" loading="lazy" decoding="async" className="w-full aspect-[2/3] object-cover rounded-xl"/><span className="block text-xs font-bold mt-1 line-clamp-2">{item.title}</span><span className="block text-[10px] text-[#b9cacb] mt-1">{reason}</span></button>)}</div></section>;
}
