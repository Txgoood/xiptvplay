/* Optional LG media companion for webOS 2 (ES5 only). Native TS playback remains default.
   Configured only after a separate media service has been approved/deployed. */
(function(){
 var video=document.getElementById('video'),url=String(window.XIPTV_LG_MEDIA_URL||'').replace(/\/+$/,'');
 var ctx=null,session=null,busy=false,manual=false,started=false,offset=0;
 var playerOverlay=document.getElementById('tv-lg-subtitle-overlay'),cues=[],lastCue=-1,sourceKey='';
 var scanButton=document.getElementById('tv-lg-media-scan'),summary=document.getElementById('tv-lg-media-status'),returnButton=document.getElementById('tv-lg-native-return');
 function say(s){summary.textContent=String(s||'');}
 function request(method,path,data,cb){
  var x=new XMLHttpRequest();
  try{x.open(method,url+path,true);x.timeout=28000;
    if(data)x.setRequestHeader('Content-Type','application/json');
    x.onreadystatechange=function(){if(x.readyState!==4)return;var result=null;try{result=JSON.parse(x.responseText);}catch(e){}
      if(x.status<200||x.status>=300){cb(new Error(result&&result.error||'HTTP '+x.status));return;}
      cb(null,result);
    };x.onerror=function(){cb(new Error('LG medya sunucusuna bağlantı kurulamadı.'));};
    x.ontimeout=function(){cb(new Error('Parça listesi zaman aşımı.'));};
    x.send(data?JSON.stringify(data):null);
  }catch(e){cb(e);}
 }
 function isTr(track){var v=String(track.language||'').toLowerCase()+' '+String(track.title||'').toLowerCase();return /(^|[^a-z])(tr|tur|turkish|türkçe)([^a-z]|$)/i.test(v);}
 function addOption(sel,label,value){var o=document.createElement('option');o.value=value;o.textContent=label;sel.appendChild(o);}
 function extendMenus(sub,aud){
  if(!session)return;
  for(var i=0;i<session.tracks.length;i++){
   var t=session.tracks[i],label=(t.language==='und'?'Bilinmeyen dil':t.language)+(t.title?' · '+t.title:'')+' ('+t.codec+')';
   if(t.type==='audio')addOption(aud,'LG: '+label,'lg:a:'+t.index);
   if(t.type==='subtitle')addOption(sub,(t.externalVtt?'LG: ':'LG (yalnız bilgi): ')+label,'lg:s:'+t.index);
  }
 }
 function paintSubtitles(){
  if(!cues.length||video.paused){playerOverlay.style.display='none';return;}
  var now=(video.currentTime||0)+offset,chosen=-1;
  for(var i=0;i<cues.length;i++)if(now>=cues[i].start&&now<cues[i].end){chosen=i;break;}
  if(chosen===lastCue)return;
  lastCue=chosen;playerOverlay.textContent=chosen<0?'':cues[chosen].text;
  playerOverlay.style.display=chosen<0?'none':'block';
 }
 function timing(t){
  var p=t.trim().replace(',','.').split(':');if(p.length!==3&&p.length!==2)return NaN;
  var v=0;for(var i=0;i<p.length;i++)v=v*60+Number(p[i]);return v;
 }
 function parseVtt(vtt){
  var lines=String(vtt||'').replace(/\r/g,'').split('\n'),out=[];
  for(var i=0;i<lines.length;i++){
   var m=lines[i].match(/^\s*(\d{2}:)?\d{2}:\d{2}[.,]\d{3}\s*-->\s*(\d{2}:)?\d{2}:\d{2}[.,]\d{3}/);
   if(!m)continue;
   var t=lines[i].split('-->');var st=timing(t[0]),en=timing(t[1].trim().split(/\s+/)[0]),words=[];
   while(i+1<lines.length&&lines[i+1].trim()){words.push(lines[++i]);}
   if(isFinite(st)&&isFinite(en)&&en>st&&words.length)out.push({start:st,end:en,text:words.join('\n').replace(/<[^>]*>/g,'')});
  }
  return out;
 }
 function subtitle(index){
  if(!session)return;
  var t=track('subtitle',index);if(!t)return;
  if(!t.externalVtt){say('Bu altyazı görüntü tabanlı ('+t.codec+'). Metne dönüştürme desteklenmiyor.');return;}
  var x=new XMLHttpRequest();
  cues=[];lastCue=-1;playerOverlay.style.display='none';say('Seçilen altyazı dosyası hazırlanıyor…');
  try{x.open('GET',url+'/subtitle/'+session.token+'/'+index+'.vtt',true);x.timeout=110000;
   x.onreadystatechange=function(){if(x.readyState!==4)return;
     if(x.status!==200){say('Altyazı açılamadı. HTTP '+x.status);return;}
     cues=parseVtt(x.responseText);
     say(cues.length?cues.length+' altyazı satırı yüklendi.':'Altyazı dosyasından kullanılabilir satır okunamadı.');
     paintSubtitles();
   };
   x.onerror=function(){say('Harici altyazı indirilmedi.');};
   x.ontimeout=function(){say('Altyazı hazırlama zaman aşımı.');};
   x.send();
  }catch(e){say(e.message);}
 }
 function track(type,index){if(!session)return null;for(var i=0;i<session.tracks.length;i++)if(session.tracks[i].type===type&&session.tracks[i].index===index)return session.tracks[i];return null;}
 function revert(oldSrc,oldPosition){
  try{
   video.pause();video.src=oldSrc;video.load();
   var once=function(){video.removeEventListener('loadedmetadata',once,false);try{video.currentTime=oldPosition;}catch(e){}video.play();};
   video.addEventListener('loadedmetadata',once,false);
  }catch(e){}
  offset=0;returnButton.style.display='none';
  say('Alternatif ses oynatılamadı. Önceki çalışan oynatıcıya geri dönüldü.');
 }
 function audio(index){
  var t=track('audio',index);
  if(!t||!ctx){say('Ses parçası bulunamadı.');return;}
  var oldSrc=ctx.originalUrl||video.currentSrc||video.src,oldPosition=(video.currentTime||0)+offset;
  returnButton.style.display='inline-block';
  var next=url+'/stream/'+session.token+'/'+index+'?start='+Math.floor(oldPosition);
  var failed=false,ok=false;
  var timer=setTimeout(function(){if(!ok&&!failed){failed=true;video.removeEventListener('error',failure,false);revert(oldSrc,oldPosition);}},16000);
  function failure(){if(failed||ok)return;failed=true;clearTimeout(timer);video.removeEventListener('error',failure,false);revert(oldSrc,oldPosition);}
  var playing=function(){ok=true;clearTimeout(timer);video.removeEventListener('error',failure,false);video.removeEventListener('playing',playing,false);say('Seçili ses: '+(t.language||'Bilinmiyor')+'. Video kopyalama yöntemi etkin.');};
  try{
   video.addEventListener('error',failure,false);
   video.addEventListener('playing',playing,false);
   video.pause();video.src=next;video.load();
   offset=oldPosition;
   var p=video.play();if(p&&p.catch)p.catch(failure);
   say('Alternatif '+(t.language||'ses')+' akışı deneniyor…');
  }catch(e){failure();}
 }
 function autoSelect(){
  if(manual||!session)return;
  var turAudio=null,turSub=null;
  for(var i=0;i<session.tracks.length;i++){
   var t=session.tracks[i];if(!isTr(t))continue;
   if(t.type==='audio'&&!turAudio)turAudio=t;
   if(t.type==='subtitle'&&t.externalVtt&&!turSub)turSub=t;
  }
  if(turAudio){audio(turAudio.index);cues=[];playerOverlay.style.display='none';}
  else if(turSub)subtitle(turSub.index);
 }
 function scan(){
  if(busy||!ctx)return;
  if(!url){say('LG alternatif medya hizmeti henüz Render üzerinde yapılandırılmadı. Mevcut TV oynatıcı kullanılmaya devam ediyor.');return;}
  busy=true;scanButton.disabled=true;say('Ses ve altyazı parçaları analiz ediliyor…');
  request('POST','/tracks',{serverUrl:ctx.serverUrl,username:ctx.username,password:ctx.password,kind:ctx.kind,id:ctx.id,extension:ctx.extension},function(err,data){
   busy=false;scanButton.disabled=false;
   if(err){say('Analiz başarısız: '+err.message);return;}
   if(!data||!data.tracks){say('Parça listesi alınamadı.');return;}
   session=data;say(data.tracks.length+' parça bulundu: '+data.tracks.filter(function(t){return t.type==='audio';}).length+' ses, '+data.tracks.filter(function(t){return t.type==='subtitle';}).length+' altyazı. Desteklenmeyen altyazılar yalnızca bilgi amaçlıdır.');
   if(window.XIPTVTV&&window.XIPTVTV.refreshTracks)window.XIPTVTV.refreshTracks();
   autoSelect();
  });
 }
 scanButton.onclick=function(){manual=true;scan();};
 returnButton.onclick=function(){if(ctx&&ctx.originalUrl){var pos=(video.currentTime||0)+offset;revert(ctx.originalUrl,pos);say('Önceki çalışan TV oynatıcısı geri açıldı.');}};
 video.addEventListener('timeupdate',paintSubtitles,false);
 video.addEventListener('pause',paintSubtitles,false);
 document.getElementById('tv-subtitles').addEventListener('change',function(){
  if(this.value==='off'){cues=[];lastCue=-1;playerOverlay.style.display='none';return;}
  if(this.value.indexOf('lg:s:')===0){manual=true;subtitle(Number(this.value.split(':')[2]));}
 },false);
 document.getElementById('tv-audio').addEventListener('change',function(){
  if(this.value.indexOf('lg:a:')===0){manual=true;audio(Number(this.value.split(':')[2]));}
 },false);
 window.XIPTVLGMedia={
  setSource:function(data){ctx=data;session=null;manual=false;busy=false;started=false;offset=0;cues=[];lastCue=-1;playerOverlay.style.display='none';scanButton.disabled=false;returnButton.style.display='none';summary.textContent='';},
  extendMenus:extendMenus,
  scan:scan
 };
})();