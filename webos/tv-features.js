/* XIPTV TV companion controls, ES5-safe. User data stays on this television. */
(function(){
var video=document.getElementById('video'),currentKey='',scope='default';
var prefix='xiptv_webos2_media_v1_';
function read(k,fallback){try{return JSON.parse(localStorage.getItem(prefix+scope+'_'+k))||fallback;}catch(e){return fallback;}}
function save(k,value){try{localStorage.setItem(prefix+scope+'_'+k,JSON.stringify(value));}catch(e){}}
function key(mode,item){return mode+':'+String(item.stream_id||item.series_id||item.id||'');}
function favs(){return read('favorites',{});}
function isFavorite(mode,item){return !!favs()[key(mode,item)];}
function toggleFavorite(mode,item){
 var f=favs(),k=key(mode,item);if(f[k])delete f[k];else f[k]={name:String(item.name||''),type:mode};save('favorites',f);
 if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();
}
function decorateItem(button,mode,item){
 var star=document.createElement('button');star.type='button';star.style.cssText='font-size:16px;padding:6px;float:right;margin:1px';
 star.textContent=isFavorite(mode,item)?'★':'☆';
 star.title='Favori değiştir';
 star.onclick=function(e){if(e&&e.stopPropagation)e.stopPropagation();toggleFavorite(mode,item);};
 button.parentNode.appendChild(star);
}
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
document.getElementById('tv-favorite-only').onchange=function(){if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();};
window.XIPTVTV={
 refresh:null,
 catalogReady:function(){scope='default';},
 isFavorite:isFavorite,
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
