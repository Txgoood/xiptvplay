import test from 'node:test';
import assert from 'node:assert/strict';
import {durationMinutes,normalizeSearch,eligibleDecisions,pickDecisions,similarMedia,type DecisionFilters} from '../src/services/discoveryTools';
import {episodeSnapshot,compareEpisodes,readFollowing,toggleFollowing,updateFollowing,acknowledgeFollowing} from '../src/services/seriesFollowing';
import {castMediaRequest} from '../src/services/nativeCast';
import type {MediaItem,SeriesDetail} from '../src/types';
const media=(id:string,patch:Partial<MediaItem>={}):MediaItem=>({id,title:id,type:'movie',category:'Aksiyon',resolution:'HD',poster:'',streamUrl:'https://example.invalid/'+id+'.mp4',audioTracks:[],subtitles:[],...patch});
const filters:DecisionFilters={type:'movie',tag:'',maxMinutes:120,minRating:7,hideWatched:true};
test('süre ve puan eksikse dar filtrede içerik uydurulmaz; canlı ve dizi elenir',()=>{
 const items=[media('yes',{duration:'01:40:00',rating:'7.5'}),media('long',{duration:'169 dk',rating:'9'}),media('missing',{rating:'9'}),media('unrated',{duration:'90'}),media('live',{type:'live',duration:'60',rating:'8'}),media('tv',{type:'series',duration:'50',rating:'8'})];
 assert.deepEqual(eligibleDecisions(items,filters,[]).map(i=>i.id),['yes']);
 assert.deepEqual(eligibleDecisions(items,{...filters,maxMinutes:0,minRating:0},[]).map(i=>i.id),['yes','long','missing','unrated']);
});
test('izlenenler ve izinli katalog dışındaki içerikler önerilmez; yayın adresi korunur',()=>{
 const allowed=[media('watched',{rating:'8',duration:'90'}),media('allowed',{rating:'8',duration:'90'})];
 const history:any=[{media:allowed[0],completed:true,positionSeconds:120}];
 const result=eligibleDecisions(allowed,filters,history);assert.equal(result[0],allowed[1]);assert.equal(result.length,1);
});
test('başka öner düğmesi kullanılmamış seçenekleri sunar; kaynak dizi değişmez',()=>{
 const source=Array.from({length:8},(_,n)=>media(String(n)));
 const first=pickDecisions(source,new Set(),()=>0);const next=pickDecisions(source,new Set(first.map(i=>i.id)),()=>0);
 assert.equal(first.length,3);assert.equal(next.length,3);assert.ok(next.every(i=>!first.includes(i)));assert.equal(source[0].id,'0');
 assert.equal(pickDecisions([source[0]],new Set(['0']),()=>0)[0],source[0]);
});
test('Türkçe arama ve süre biçimleri çözülür; bilinmeyen süre tahmin edilmez',()=>{
 assert.equal(normalizeSearch('Çılgın Şehir'),'cilgin sehir');assert.equal(durationMinutes('02:06:01'),126+1/60);assert.equal(durationMinutes('1 saat 30 dk'),90);assert.equal(durationMinutes('bilinmiyor'),undefined);
});
test('benzer içerik aynı kayıt / canlı / ilgisiz tür olmaz; ortak tür veya kategori gerekçesi taşır',()=>{
 const current=media('current',{genres:['Bilim-Kurgu']});const same=media('same',{genres:['Bilim-Kurgu'],category:'Başka'});const other=media('other',{genres:['Romantik'],category:'Romantik'});
 const rows=similarMedia(current,[current,same,other,media('live',{type:'live'})]);assert.deepEqual(rows.map(r=>r.item.id),['same']);assert.match(rows[0].reason,/bilim-kurgu/);
});
const detail=(codes:number[][]):SeriesDetail=>({seasons:[],episodes:{all:codes.map(([seasonNum,episodeNum],n)=>({id:n,title:String(n),seasonNum,episodeNum,containerExtension:'mp4',streamUrl:'secret-url'}))}});
test('ilk takip başlangıçtır; tekrar ve silinen bölüm yeni bildirim üretmez',()=>{
 const baseline=compareEpisodes({id:'x',title:'x',poster:''},episodeSnapshot(detail([[1,1],[1,2],[1,2]])),100);
 assert.equal(baseline.notice,undefined);assert.deepEqual(baseline.baseline,['1:1','1:2']);
 assert.equal(compareEpisodes(baseline,['1:1'],200).notice,undefined);assert.equal(compareEpisodes(baseline,[],300).baseline,baseline.baseline);
});
test('yeni bölüm ve yeni sezon ayrılır; boş veya başarısız kontrol eski bölümleri korur',()=>{
 const first={id:'x',title:'x',poster:'',baseline:['1:1']};
 const episode=compareEpisodes(first,['1:1','1:2']);assert.equal(episode.notice,'episode');assert.equal(episode.targetEpisode,2);
 const season=compareEpisodes(first,['1:1','2:1']);assert.equal(season.notice,'season');assert.equal(season.targetSeason,2);
 assert.ok(compareEpisodes(first,[]).error);assert.deepEqual(first.baseline,['1:1']);
});
test('takip profillere ayrılır; adres kaydedilmez; kaldırılan kayıt geç yanıtla geri gelmez',()=>{
 const values=new Map<string,string>();(globalThis as any).localStorage={getItem:(k:string)=>values.get(k)||null,setItem:(k:string,v:string)=>values.set(k,v)};
 (globalThis as any).window={dispatchEvent:()=>{}};(globalThis as any).CustomEvent=class{};
 const item=media('show',{type:'series'});toggleFollowing('parent',item,detail([[1,1]]));assert.equal(readFollowing('child').length,0);
 updateFollowing('parent','show',detail([[1,1],[1,2]]));assert.equal(readFollowing('parent')[0].notice,'episode');
 acknowledgeFollowing('parent','show');assert.equal(readFollowing('parent')[0].notice,undefined);
 assert.ok(!JSON.stringify([...values.values()]).includes('secret-url'));
 toggleFollowing('parent',item);updateFollowing('parent','show',detail([[1,1],[2,1]]));assert.equal(readFollowing('parent').length,0);
});
test('TV gönderiminde ham sağlayıcı URL korunur; HLS/TS/MKV türü ayrılır, yerel dosya reddedilir',()=>{
 const item=media('stream',{rawStreamUrl:'https://example.invalid/live/u/p/1.ts',streamUrl:'https://proxy.invalid'});
 assert.equal(castMediaRequest(item).url,item.rawStreamUrl);assert.equal(castMediaRequest(item).mime,'video/mp2t');
 assert.equal(castMediaRequest(media('hls',{streamUrl:'https://example.invalid/a.m3u8?token=1'})).mime,'application/x-mpegURL');
 assert.throws(()=>castMediaRequest(media('local',{streamUrl:'file:///secret.mp4'})),/yerel dosya/);
});
