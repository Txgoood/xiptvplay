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
function applyTracks(){
 var tracks=video.textTracks||[];
 for(var i=0;i<tracks.length;i++)try{tracks[i].mode='disabled';}catch(e){}
 document.getElementById('tv-subtitles').value='off';
 var audios=video.audioTracks;
 if(audios&&audios.length){
   var preferred=-1;
   for(var j=0;j<audios.length;j++){var lang=String(audios[j].language||'').toLowerCase();if(lang==='tr'||lang.indexOf('tur')===0){preferred=j;break;}}
   if(preferred>=0)try{for(var k=0;k<audios.length;k++)audios[k].enabled=k===preferred;}catch(e){}
 }
}
function tracksMenu(){
 var sub=document.getElementById('tv-subtitles'),audio=document.getElementById('tv-audio');
 while(sub.options.length>1)sub.remove(1);
 while(audio.options.length>1)audio.remove(1);
 var i,opt;
 for(i=0;i<(video.textTracks||[]).length;i++){
   opt=document.createElement('option');opt.value=String(i);opt.text='Altyazı '+(i+1)+' / '+String(video.textTracks[i].language||'');sub.appendChild(opt);
 }
 for(i=0;i<(video.audioTracks||[]).length;i++){
   opt=document.createElement('option');opt.value=String(i);opt.text='Ses '+(i+1)+' / '+String(video.audioTracks[i].language||'');audio.appendChild(opt);
   if(video.audioTracks[i].enabled)audio.value=String(i);
 }
}
var ctrl=document.getElementById('tv-controls');
document.getElementById('tv-controls-toggle').onclick=function(){ctrl.style.display=ctrl.style.display==='none'?'block':'none';tracksMenu();};
document.getElementById('tv-subtitles').onchange=function(){
 var n=this.value,tracks=video.textTracks||[];
 for(var i=0;i<tracks.length;i++)try{tracks[i].mode=String(i)===n?'showing':'disabled';}catch(e){}
};
document.getElementById('tv-audio').onchange=function(){
 var n=this.value,tracks=video.audioTracks||[];
 for(var i=0;i<tracks.length;i++)try{tracks[i].enabled=(n==='auto'?tracks[i].enabled:String(i)===n);}catch(e){}
};
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
document.getElementById('tv-player-episodes').onclick=function(){if(window.XIPTVTV.showSeriesEpisodes)window.XIPTVTV.showSeriesEpisodes();showPlayerBar();};
document.getElementById('tv-player-info').onclick=function(){document.getElementById('tv-media-info').style.display='block';showPlayerBar();};
document.getElementById('tv-media-info-close').onclick=function(){document.getElementById('tv-media-info').style.display='none';showPlayerBar();};
video.addEventListener('click',showPlayerBar,false);
document.addEventListener('keydown',function(){if(document.body.className.indexOf('tv-mode')>=0)showPlayerBar();},false);
showPlayerBar();
document.getElementById('tv-favorite-only').onchange=function(){if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();};
window.XIPTVTV={
 refresh:null,
 catalogReady:function(){if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();},
 setPlayingItem:function(mode,item){playingMode=mode;playingItem=item;updateHeart();
 var e=document.getElementById('tv-player-episodes');e.style.display=mode==='series'?'inline-block':'none';
 var info=document.getElementById('tv-media-info-text');
 var text=String(item.name||item.title||'İçerik');var plot=item.plot||item.description||item.storyline||item.info&&item.info.plot||'';
 info.textContent=text+(plot?' — '+String(plot):' — Kaynakta açıklama bulunmuyor.');
 },
 setProfile:function(id,child){scope=id||'default';favoriteCache=null;document.getElementById('tv-hide-adult').checked=!!child;updateHeart();if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();},
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
