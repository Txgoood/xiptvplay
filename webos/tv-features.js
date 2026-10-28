/* XIPTV TV companion controls, ES5-safe. User data stays on this television. */
(function(){
var video=document.getElementById('video'),currentKey='',scope='default',playingItem=null,playingMode='live';
var favButton=document.getElementById('tv-video-favorite');
var prefix='xiptv_webos2_media_v1_',favoriteCache=null;
function read(k,fallback){try{return JSON.parse(localStorage.getItem(prefix+scope+'_'+k))||fallback;}catch(e){return fallback;}}
function save(k,value){try{localStorage.setItem(prefix+scope+'_'+k,JSON.stringify(value));}catch(e){}}
function key(mode,item){return mode+':'+String(item.stream_id||item.series_id||item.id||'');}
function favs(){if(!favoriteCache)favoriteCache=read('favorites',{});return favoriteCache;}
function isFavorite(mode,item){return !!favs()[key(mode,item)];}
function toggleFavorite(mode,item){
 var f=favs(),k=key(mode,item);if(f[k])delete f[k];else f[k]={name:String(item.name||''),type:mode};save('favorites',f);
 if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();
 if(window.XIPTVTVHome&&window.XIPTVTVHome.refresh)window.XIPTVTVHome.refresh();
}
function decorateItem(button,mode,item){
 var wrapper=document.createElement('div');wrapper.className='tv-item-wrap';
 button.parentNode.insertBefore(wrapper,button);wrapper.appendChild(button);
 var star=document.createElement('button');star.type='button';star.className='tv-card-favorite';star.setAttribute('aria-label','Favorilere ekle veya çıkar');
 star.textContent=isFavorite(mode,item)?'★':'☆';
 star.title='Favori değiştir';
 star.onclick=function(e){if(e&&e.stopPropagation)e.stopPropagation();toggleFavorite(mode,item);};
 wrapper.appendChild(star);
}
function updateHeart(){
 if(!playingItem){favButton.style.display='none';return;}
 favButton.style.display='block';favButton.textContent=isFavorite(playingMode,playingItem)?'♥':'♡';
 favButton.title=isFavorite(playingMode,playingItem)?'Favorilerden çıkar':'Favorilere ekle';
}
favButton.onclick=function(){if(!playingItem)return;toggleFavorite(playingMode,playingItem);updateHeart();};
/* webOS 2 may decode embedded MKV/TS tracks without exposing them as HTML5 track lists. */
var trackNotice=null;
var trackPolicyKey='xiptv_webos2_language_policy_v1';
function isTurkish(lang){lang=String(lang||'').toLowerCase();return lang==='tr'||lang==='tur'||lang==='tr-tr'||lang.indexOf('turkish')>=0||lang.indexOf('türk')>=0;}
function languagePolicy(){try{return localStorage.getItem(trackPolicyKey)!=='off';}catch(e){return true;}}
function applyLanguagePolicy(){
 if(!languagePolicy())return;
 var aud=trackList('audioTracks'),subs=trackList('textTracks'),trAudio=-1,trSub=-1,i;
 for(i=0;i<aud.length;i++)if(isTurkish(aud[i].language)||isTurkish(aud[i].label)){trAudio=i;break;}
 for(i=0;i<subs.length;i++)if(isTurkish(subs[i].language)||isTurkish(subs[i].label)){trSub=i;break;}
 if(trAudio>=0){for(i=0;i<aud.length;i++)try{aud[i].enabled=i===trAudio;}catch(e){}
  for(i=0;i<subs.length;i++)try{subs[i].mode='disabled';}catch(e){}
 }else if(trSub>=0){for(i=0;i<subs.length;i++)try{subs[i].mode=i===trSub?'showing':'disabled';}catch(e){}}
}

function trackList(name){
 try{return video[name]||[];}catch(e){return [];}
}
function tracksMenu(){
 var sub=document.getElementById('tv-subtitles'),audio=document.getElementById('tv-audio');
 var texts=trackList('textTracks'),audios=trackList('audioTracks'),i,opt,enabled=false;
 while(sub.options.length>1)sub.remove(1);
 while(audio.options.length>1)audio.remove(1);
 for(i=0;i<texts.length;i++){
   opt=document.createElement('option');opt.value=String(i);
   opt.text='Altyazı '+(i+1)+(texts[i].label?' · '+texts[i].label:'')+(texts[i].language?' ('+texts[i].language+')':'');
   sub.appendChild(opt);
   if(texts[i].mode==='showing')sub.value=String(i);
 }
 for(i=0;i<audios.length;i++){
   opt=document.createElement('option');opt.value=String(i);
   opt.text='Ses '+(i+1)+(audios[i].label?' · '+audios[i].label:'')+(audios[i].language?' ('+audios[i].language+')':'');
   audio.appendChild(opt);if(audios[i].enabled){audio.value=String(i);enabled=true;}
 }
 var help=document.getElementById('tv-track-notice');
 if(help)help.textContent=(!audios.length||!texts.length)?
   'TV oynatıcısı '+(!audios.length?'gömülü ses kanallarını': 'ses kanallarını')+
   (!audios.length&&!texts.length?' ve ':'')+
   (!texts.length?'altyazı kanallarını':'')+
   ' uygulamaya bildirmiyor. Kaynakta parça bulunsa bile burada listelenmeyebilir. Bu durumda otomatik dil tercihi de uygulanamaz.':'';
}
function applyTracks(){applyLanguagePolicy();tracksMenu();}
var ctrl=document.getElementById('tv-controls');
document.getElementById('tv-controls-toggle').onclick=function(){
 ctrl.style.display=ctrl.style.display==='none'?'block':'none';tracksMenu();
};
document.getElementById('tv-language-auto').checked=languagePolicy();
document.getElementById('tv-language-auto').onchange=function(){try{localStorage.setItem(trackPolicyKey,this.checked?'on':'off');}catch(e){}if(this.checked)applyTracks();};
document.getElementById('tv-subtitles').onchange=function(){
 var n=this.value,tracks=trackList('textTracks');
 for(var i=0;i<tracks.length;i++)try{tracks[i].mode=String(i)===n?'showing':'disabled';}catch(e){}
 tracksMenu();
};
document.getElementById('tv-audio').onchange=function(){
 var n=this.value,tracks=trackList('audioTracks');
 if(n==='auto'){tracksMenu();return;}
 for(var i=0;i<tracks.length;i++)try{tracks[i].enabled=String(i)===n;}catch(e){}
 tracksMenu();
};
video.addEventListener('loadedmetadata',function(){applyTracks();},false);
video.addEventListener('loadeddata',function(){applyTracks();},false);
video.addEventListener('canplay',function(){applyTracks();},false);
try{if(video.audioTracks&&video.audioTracks.addEventListener)video.audioTracks.addEventListener('addtrack',tracksMenu,false);}catch(e){}
try{if(video.textTracks&&video.textTracks.addEventListener)video.textTracks.addEventListener('addtrack',tracksMenu,false);}catch(e){}
document.getElementById('tv-speed').onchange=function(){try{video.playbackRate=Number(this.value);}catch(e){}};
document.getElementById('tv-seek-back').onclick=function(){try{video.currentTime=Math.max(0,video.currentTime-10);}catch(e){}};
document.getElementById('tv-seek-forward').onclick=function(){try{video.currentTime+=10;}catch(e){}};
var playerbar=document.getElementById('tv-player-controls'),hideTimer=null;
function showPlayerBar(){
 playerbar.style.opacity='1';playerbar.style.pointerEvents='auto';
 if(hideTimer)clearTimeout(hideTimer);
 hideTimer=setTimeout(function(){if(document.getElementById('tv-controls').style.display==='none'&&document.getElementById('tv-media-info').style.display==='none'){playerbar.style.opacity='0';playerbar.style.pointerEvents='none';}},6000);
}
document.getElementById('tv-player-rewind').onclick=function(){try{video.currentTime=Math.max(0,video.currentTime-10);}catch(e){}showPlayerBar();};
document.getElementById('tv-player-forward').onclick=function(){try{video.currentTime=video.currentTime+10;}catch(e){}showPlayerBar();};
document.getElementById('tv-player-tracks').onclick=function(){document.getElementById('tv-controls-toggle').click();showPlayerBar();};

var infoButton=document.getElementById('tv-player-info');if(infoButton)infoButton.onclick=function(){document.getElementById('tv-media-info').style.display='block';showPlayerBar();};
document.getElementById('tv-media-info-close').onclick=function(){document.getElementById('tv-media-info').style.display='none';showPlayerBar();};
video.addEventListener('click',showPlayerBar,false);
document.addEventListener('keydown',function(){if(document.body.className.indexOf('tv-mode')>=0)showPlayerBar();},false);
showPlayerBar();
document.getElementById('tv-favorite-only').onchange=function(){if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();};
window.XIPTVTV={
 refresh:null,
 catalogReady:function(){if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();},
 setPlayingItem:function(mode,item){playingMode=mode;playingItem=item;updateHeart();

 var info=document.getElementById('tv-media-info-text');
 var text=String(item.name||item.title||'İçerik');var plot=item.plot||item.description||item.storyline||item.info&&item.info.plot||'';
 info.textContent=text+(plot?' — '+String(plot):' — Kaynakta açıklama bulunmuyor.');
 document.getElementById('tv-detail-summary').textContent=info.textContent;
 if(mode!=='series')document.getElementById('tv-season-tools').style.display='none';
 },
 setProfile:function(id,child){scope=id||'default';favoriteCache=null;document.getElementById('tv-hide-adult').checked=!!child;updateHeart();if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();if(window.XIPTVTVHome&&window.XIPTVTVHome.refresh)window.XIPTVTVHome.refresh();},
 isFavorite:isFavorite,
 getResume:function(){return read('positions',{});},
 decorateItem:decorateItem,
 beforePlay:function(kind,id,url,name){
   currentKey=kind+':'+String(id);
   applyTracks();tracksMenu();
   document.getElementById('tv-current-media').textContent=name||'';
   if(kind==='live')currentKey='';
 },
 filterFavorite:function(mode,item){return !document.getElementById('tv-favorite-only').checked||isFavorite(mode,item);}
};
video.addEventListener('loadedmetadata',function(){
 applyTracks();tracksMenu();
 if(!currentKey)return;
 var positions=read('positions',{}),last=Number(positions[currentKey]||0);
 if(last>20&&video.duration&&video.duration-last>30){try{video.currentTime=last;}catch(e){}}
},false);
video.addEventListener('timeupdate',function(){
 if(!currentKey||!video.duration||video.currentTime<5)return;
 var now=Date.now();if(now-(window.XIPTVTV.lastSave||0)<10000)return;
 window.XIPTVTV.lastSave=now;
 var positions=read('positions',{});positions[currentKey]=Math.floor(video.currentTime);save('positions',positions);
},false);
video.addEventListener('ended',function(){
 if(!currentKey)return;var positions=read('positions',{});delete positions[currentKey];save('positions',positions);
},false);
})();
