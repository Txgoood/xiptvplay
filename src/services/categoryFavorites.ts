export type CategoryFavorite={playlistId:string;tab:'all'|'live'|'movie'|'series';name:string};
const key=(profile:string)=>'xiptv_category_favorites_'+profile;
export function readCategoryFavorites(profile:string):CategoryFavorite[]{try{const data=JSON.parse(localStorage.getItem(key(profile))||'[]');return Array.isArray(data)?data:[];}catch{return [];}}
export function toggleCategoryFavorite(profile:string,item:CategoryFavorite){const rows=readCategoryFavorites(profile);const same=(r:CategoryFavorite)=>r.playlistId===item.playlistId&&r.tab===item.tab&&r.name===item.name;const next=rows.some(same)?rows.filter(r=>!same(r)):[...rows,item];localStorage.setItem(key(profile),JSON.stringify(next));return next;}
