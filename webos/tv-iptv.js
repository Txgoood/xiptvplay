/* XIPTV Play webOS 2: standalone Xtream live-TV prototype, ES5 compatible.
 * No credentials are persisted; all input goes through the user's connected Render API.
 */
(function () {
  var BASE='https://xiptvplay.onrender.com';
  var launcher=document.getElementById('iptv-open');
  var panel=document.getElementById('iptv-panel');
  var login=document.getElementById('iptv-login');
  var browser=document.getElementById('iptv-browser');
  var msg=document.getElementById('iptv-message');
  var categories=document.getElementById('iptv-categories');
  var channels=document.getElementById('iptv-channels');
  var categoryList=[], channelList=[], selectedCategory='all', mode='live';
  var catalogData=null, lastLive=null, connecting=false, startup=true, lastSeries=null, seriesCache={};
  var PAGE_SIZE=60, currentPage=0, searchTimer=null, sortedCache={};
  var server='',username='',password='';
  var SAVE_KEY='xiptv_webos2_xtream_local_v1';
  function savedCredentials(){try{return JSON.parse(localStorage.getItem(SAVE_KEY)||'null');}catch(e){return null;}}
  function persistCredentials(){try{
    if(document.getElementById('iptv-remember').checked){
      localStorage.setItem(SAVE_KEY,JSON.stringify({server:server,username:username,password:password}));
    }else{localStorage.removeItem(SAVE_KEY);}
  }catch(e){say('TV hafızasına kaydedilemedi: '+e.message);}}
  function hydrate(){
    var c=savedCredentials();if(!c)return false;
    document.getElementById('iptv-server').value=c.server||'';
    document.getElementById('iptv-user').value=c.username||'';
    document.getElementById('iptv-pass').value=c.password||'';
    document.getElementById('iptv-remember').checked=true;
    return !!(c.server&&c.username&&c.password);
  }

  var video=document.getElementById('video');
  function say(t){msg.textContent=t;}
  function show(el){el.style.display='block';}
  function hide(el){el.style.display='none';}
  function clear(el){while(el.firstChild)el.removeChild(el.firstChild);}
  function action(parent,label,cb){
    var b=document.createElement('button');b.type='button';b.appendChild(document.createTextNode(label));b.onclick=cb;parent.appendChild(b);return b;
  }
  function request(route,data,callback){
    var xhr=new XMLHttpRequest();
    try{
      xhr.open('POST',BASE+route,true);
      xhr.timeout=45000;
      xhr.setRequestHeader('Content-Type','application/json');
      xhr.onreadystatechange=function(){
        if(xhr.readyState!==4)return;
        var response=null;
        try{response=JSON.parse(xhr.responseText);}catch(err){}
        if(xhr.status<200||xhr.status>=300){callback(new Error(response&&response.error||'HTTP '+xhr.status));return;}
        if(!response){callback(new Error('Sunucu yanıtı okunamadı'));return;}
        callback(null,response);
      };
      xhr.onerror=function(){callback(new Error('Render sunucusuna bağlantı kurulamadı'));};
      xhr.ontimeout=function(){callback(new Error('Sunucu zaman aşımı'));};
      xhr.send(JSON.stringify(data));
    }catch(e){callback(e);}
  }
  function chooseMode(next){
    if(mode===next&&catalogData&&channels.childNodes.length&&selectedCategory==='all')return;
    mode=next;selectedCategory='all';currentPage=0;
    channels.className=mode==='live'?'tv-live-list':'tv-poster-list';
    var tabNames=['live','movie','series'];
    for(var t=0;t<tabNames.length;t++){
      document.getElementById('tv-tab-'+tabNames[t]).className=mode===tabNames[t]?'active':'';
    }
    if(!catalogData)return;
    categoryList=catalogData[mode==='live'?'liveCategories':mode==='movie'?'vodCategories':'seriesCategories']||[];
    channelList=catalogData[mode==='live'?'liveStreams':mode==='movie'?'vodStreams':'seriesList']||[];
    document.getElementById('tv-now-playing').textContent=mode==='live'?'Canlı TV':mode==='movie'?'Filmler':'Diziler';
    renderCategories();
  }
  function showSeries(item){
    var id=item.series_id;
    if(!id){say('Dizi bilgisi eksik');return;}
    window.XIPTVTV.setPlayingItem('series',item);
    say('Dizi bölümleri yükleniyor...');
    lastSeries=item;
    var cached=seriesCache[String(id)];
    function onSeries(err,data){
      if(err){say('Bölümler alınamadı: '+err.message);return;}
      seriesCache[String(id)]=data;
      var seasons=data.episodes||{}, episodes=[];
      for(var season in seasons){if(Object.prototype.hasOwnProperty.call(seasons,season)){
        var group=seasons[season];
        if(group&&group.length)for(var i=0;i<group.length;i++)episodes.push({season:season,item:group[i]});
      }}
      if(!episodes.length){say('Bu dizi için bölüm bulunamadı');return;}
      var popup=document.getElementById('tv-episodes'),list=document.getElementById('tv-episodes-list');
      clear(list);popup.style.display='block';
      document.getElementById('tv-episodes-title').textContent=item.name||'Dizi Bölümleri';
      for(var x=0;x<episodes.length&&x<250;x++){(function(ep){
        action(list,'Sezon '+ep.season+' • '+String(ep.item.title||ep.item.episode_num||'Bölüm'),function(){
          popup.style.display='none';
          var ext=String(ep.item.container_extension||'mp4').replace(/[^a-zA-Z0-9]/g,'');
          playStream('series',ep.item.id,ext,ep.item.title||'Dizi Bölümü');
        });
      })(episodes[x]);}
      say(episodes.length+' bölüm bulundu. Bölüm seç.');
    }
    if(cached)onSeries(null,cached);
    else request('/api/iptv/xtream/series_info',{serverUrl:server,username:username,password:password,seriesId:id},onSeries);
  }
  function playStream(kind,id,ext,name){
    if(id===null||typeof id==='undefined'){say('Yayın kimliği eksik');return;}
    var suffix=ext|| (kind==='live'?'m3u8':'mp4');
    var url=server.replace(/\/$/,'')+'/'+kind+'/'+encodeURIComponent(username)+'/'+encodeURIComponent(password)+'/'+encodeURIComponent(id)+'.'+suffix;
    document.getElementById('tv-now-playing').textContent=String(name||'Video');
    window.XIPTVTV.beforePlay(kind,id,url,name);
    try{
      video.pause();video.removeAttribute('src');
      while(video.firstChild)video.removeChild(video.firstChild);
      video.load();video.src=url;video.load();video.play();
      say('Oynatılıyor: '+String(name||'Video')+' | '+suffix.toUpperCase()+' • Görüntü/ses desteği yayına bağlıdır.');
    }catch(e){say('Oynatma hatası: '+e.message);}
  }
  function renderChannels(){
    clear(channels);
    var count=0;
    var query=(document.getElementById('tv-search').value||'').toLowerCase();
    var sorting=document.getElementById('tv-sort').value;
    var cacheKey=mode+'|'+sorting;
    var list=sortedCache[cacheKey];
    if(!list){list=channelList.slice(0);if(sorting==='az')list.sort(function(a,b){return String(a.name||'').localeCompare(String(b.name||''));});if(sorting==='za')list.sort(function(a,b){return String(b.name||'').localeCompare(String(a.name||''));});sortedCache[cacheKey]=list;}
    var matches=[];
    var categoryNames={};for(var ca=0;ca<categoryList.length;ca++)categoryNames[String(categoryList[ca].category_id)]=String(categoryList[ca].category_name||'');
    var batch=document.createDocumentFragment();
    for(var i=0;i<list.length;i++){
      var ch=list[i];
      if(selectedCategory!=='all' && String(ch.category_id)!==selectedCategory)continue;
      if(query&&String(ch.name||ch.title||'').toLowerCase().indexOf(query)<0)continue;
      if(!window.XIPTVTV.filterFavorite(mode,ch))continue;
      var catLabel=categoryNames[String(ch.category_id)]||'';
      if(document.getElementById('tv-tr-only').checked && catLabel.toUpperCase().indexOf('TR')!==0)continue;
      if(document.getElementById('tv-hide-adult').checked && /^(XXX|18\+|ADULT|🔞|❤)/i.test(catLabel))continue;
      matches.push(ch);
    }
    var totalPages=Math.max(1,Math.ceil(matches.length/PAGE_SIZE));
    if(currentPage>=totalPages)currentPage=totalPages-1;
    if(currentPage>0)action(channels,'◀ Önceki sayfa',function(){currentPage--;renderChannels();channels.scrollTop=0;});
    var first=currentPage*PAGE_SIZE,last=Math.min(first+PAGE_SIZE,matches.length);
    for(var j=first;j<last;j++){
      var ch=matches[j];
      (function(item){
        var line=action(channels,(count+1)+'. '+String(item.name||item.title||'İsimsiz'),function(){
          if(mode==='live')playChannel(item);
          else if(mode==='movie'){window.XIPTVTV.setPlayingItem('movie',item);playStream('movie',item.stream_id,String(item.container_extension||'mp4').replace(/[^a-zA-Z0-9]/g,''),item.name);}
          else showSeries(item);
        });
        if(mode!=='live'){
          var title=String(item.name||item.title||'İsimsiz');
          var picture=String(item.stream_icon||item.cover||item.cover_big||'');
          line.textContent='';
          if(/^https?:\/\//i.test(picture)){
            var img=document.createElement('img');img.src=picture;
            img.alt='';img.loading='lazy';
            img.onerror=function(){this.style.display='none';};
            line.appendChild(img);
          }else{
            var placeholder=document.createElement('span');
            placeholder.className='tv-poster-placeholder';
            placeholder.textContent=mode==='movie'?'FİLM':'DİZİ';
            line.appendChild(placeholder);
          }
          var caption=document.createElement('span');caption.className='tv-card-title';
          caption.textContent=title;line.appendChild(caption);
          line.title=title;
        }
        window.XIPTVTV.decorateItem(line,mode,item);
      })(ch);count++;
      if(channels.lastChild)batch.appendChild(channels.lastChild);
    }
    channels.appendChild(batch);
    if(currentPage+1<totalPages)action(channels,'Sonraki sayfa ▶ ('+(currentPage+2)+'/'+totalPages+')',function(){currentPage++;renderChannels();channels.scrollTop=0;});
    say(matches.length+' içerik bulundu. Sayfa '+(currentPage+1)+'/'+totalPages+'.');
  }
  function renderCategories(){
    clear(categories);
    action(categories,'Tümü',function(){selectedCategory='all';currentPage=0;renderChannels();});
    for(var i=0;i<categoryList.length;i++){
      (function(c){action(categories,String(c.category_name||'Kategori'),function(){selectedCategory=String(c.category_id);currentPage=0;renderChannels();});})(categoryList[i]);
    }
    renderChannels();
  }
  function playChannel(item){
    lastLive=item;
    window.XIPTVTV.setPlayingItem('live',item);
    playStream('live',item.stream_id,'m3u8',item.name);
  }
  document.getElementById('tv-try-ts').onclick=function(){
    if(!lastLive){say('Önce bir canlı kanal seç.');return;}
    playStream('live',lastLive.stream_id,'ts',lastLive.name);
    say('Alternatif MPEG-TS akışı deneniyor. Bu biçim de desteklenmeyebilir.');
  };
  document.getElementById('tv-try-hls').onclick=function(){
    if(!lastLive){say('Önce bir canlı kanal seç.');return;}
    playStream('live',lastLive.stream_id,'m3u8',lastLive.name);
  };
  document.getElementById('tv-search').onkeyup=function(){clearTimeout(searchTimer);searchTimer=setTimeout(function(){currentPage=0;renderChannels();},250);};
  document.getElementById('tv-sort').onchange=function(){currentPage=0;renderChannels();};
  document.getElementById('tv-tr-only').onchange=function(){currentPage=0;renderChannels();};
  document.getElementById('tv-hide-adult').onchange=function(){currentPage=0;renderChannels();};
  window.XIPTVTV.refresh=renderChannels;
  document.getElementById('tv-tab-live').onclick=function(){chooseMode('live');};
  document.getElementById('tv-tab-movie').onclick=function(){chooseMode('movie');};
  document.getElementById('tv-tab-series').onclick=function(){chooseMode('series');};
  document.getElementById('tv-episodes-close').onclick=function(){document.getElementById('tv-episodes').style.display='none';};
  var fullBtn=document.getElementById('tv-fullscreen');
  var aspectBtn=document.getElementById('tv-aspect');
  function hasClass(name){return (' '+document.body.className+' ').indexOf(' '+name+' ')>=0;}
  function setClass(name,enabled){
    var classes=(' '+document.body.className+' ').replace(' '+name+' ',' ');
    document.body.className=classes.replace(/^\s+|\s+$/g,'')+(enabled?' '+name:'');
  }
  function updatePlayerButtons(){
    fullBtn.textContent=hasClass('tv-fullscreen')?'Tam Ekrandan Çık':'Tam Ekran';
    aspectBtn.textContent=hasClass('tv-fill')?'Orijinal Oran':'Ekrana Doldur';
  }
  fullBtn.onclick=function(){setClass('tv-fullscreen',!hasClass('tv-fullscreen'));updatePlayerButtons();};
  aspectBtn.onclick=function(){setClass('tv-fill',!hasClass('tv-fill'));updatePlayerButtons();};
  // Catch D-pad before the legacy diagnostic menu handler; traverse visible controls.
  document.addEventListener('keydown',function(e){
    if(document.getElementById('iptv-keyboard').style.display!=='none')return;
    var key=e.keyCode||e.which;
    if(key!==37&&key!==38&&key!==39&&key!==40&&key!==13&&key!==461&&key!==27)return;
    if((key===461||key===27)&&hasClass('tv-fullscreen')){setClass('tv-fullscreen',false);updatePlayerButtons();fullBtn.focus();e.preventDefault();e.stopImmediatePropagation();return;}
    var list=[],nodes=document.getElementsByTagName('button'),i,el;
    for(i=0;i<nodes.length;i++){
      el=nodes[i];
      if(el.offsetWidth>0&&el.offsetHeight>0)list.push(el);
    }
    var inputs=document.getElementsByTagName('input');
    for(i=0;i<inputs.length;i++){
      el=inputs[i];
      if(el.offsetWidth>0&&el.offsetHeight>0)list.push(el);
    }
    var active=document.activeElement,idx=-1;
    for(i=0;i<list.length;i++)if(list[i]===active){idx=i;break;}
    if(key===461 && panel.style.display!=='none'){hide(panel);document.body.className='';updatePlayerButtons();launcher.focus();e.preventDefault();e.stopImmediatePropagation();return;}
    if(key===13 && active && active.tagName==='BUTTON'){
      active.click();e.preventDefault();e.stopImmediatePropagation();return;
    }
    if(key===37||key===38||key===39||key===40){
      // Keep text-field arrow navigation native while typing.
      if(active && active.tagName==='INPUT')return;
      if(list.length){list[(idx+(key===37||key===38?-1:1)+list.length)%list.length].focus();}
      e.preventDefault();e.stopImmediatePropagation();
    }
  },true);
  window.XIPTVTV.openSection=function(next){window.XIPTVTV.startMode=next;launcher.click();};
  window.XIPTVTV.openItem=function(kind,item){
    window.XIPTVTV.setPlayingItem(kind,item);
    if(kind==='series')showSeries(item);
    else if(kind==='movie')playStream('movie',item.stream_id,String(item.container_extension||'mp4').replace(/[^a-zA-Z0-9]/g,''),item.name);
    else playChannel(item);
  };
  window.XIPTVTV.showSeriesEpisodes=function(){if(lastSeries)showSeries(lastSeries);};
  launcher.onclick=function(){
    // Reuse the active catalogue when changing sections from Stitch navigation.
    // Do not reset to the login/transition screen for every menu selection.
    if((' '+document.body.className+' ').indexOf(' tv-catalog ')<0){
      document.body.className='tv-mode';
    }
    show(panel);
    if(catalogData){
      hide(login);
      show(browser);
      chooseMode(window.XIPTVTV.startMode||mode||'live');
      return;
    }
    show(login);hide(browser);
    if(hydrate()){say('Kayıtlı Xtream bağlantısı bulundu. Otomatik bağlanılıyor...');document.getElementById('iptv-connect').click();}
    else{document.getElementById('iptv-server').focus();}
  };
  document.getElementById('iptv-forget').onclick=function(){
    try{localStorage.removeItem(SAVE_KEY);}catch(e){}
    document.getElementById('iptv-server').value='';
    document.getElementById('iptv-user').value='';
    document.getElementById('iptv-pass').value='';
    document.getElementById('iptv-remember').checked=false;
    server='';username='';password='';categoryList=[];channelList=[];
    hide(browser);show(login);say('Bu TV’deki kayıtlı giriş bilgileri temizlendi.');
  };
  document.getElementById('iptv-hide').onclick=function(){hide(panel);document.body.className='';updatePlayerButtons();launcher.focus();};
  document.getElementById('iptv-connect').onclick=function(){
    server=document.getElementById('iptv-server').value.trim().replace(/\/+$/,'');
    username=document.getElementById('iptv-user').value.trim();
    password=document.getElementById('iptv-pass').value;
    if(!server||!username||!password){say('Sunucu, kullanıcı ve şifre zorunludur');show(login);hide(browser);return;}
    if(connecting)return;
    connecting=true;
    if(server.indexOf('http://')!==0 && server.indexOf('https://')!==0)server='http://'+server;
    say('Xtream bağlantısı doğrulanıyor...');
    request('/api/iptv/xtream/verify',{serverUrl:server,username:username,password:password},function(err,data){
      if(err||!data.success){connecting=false;show(panel);show(login);hide(browser);document.getElementById('tv-home').style.display='none';say('Doğrulama başarısız: '+(err?err.message:data.error||'Hesap reddedildi'));return;}
      server=data.effectiveServerUrl||server;
      persistCredentials();
      say('Bağlantı başarılı, canlı TV kataloğu alınıyor...');
      request('/api/iptv/xtream/catalog',{serverUrl:server,username:username,password:password},function(error,catalog){
        connecting=false;
        if(error){show(panel);show(login);hide(browser);document.getElementById('tv-home').style.display='none';say('Katalog hatası: '+error.message);return;}
        catalogData=catalog;sortedCache={};currentPage=0;
        if(window.XIPTVTVHome&&window.XIPTVTVHome.render)window.XIPTVTVHome.render(catalog);
        window.XIPTVTV.catalogReady();
        hide(login);show(browser);
        if(startup){startup=false;hide(panel);document.body.className='';document.getElementById('tv-home').style.display='block';document.getElementById('tv-nav-home').focus();}
        else chooseMode(window.XIPTVTV.startMode||'live');
      });
    });
  };
  // Startup: connect silently with saved credentials; show login only on failure.
  if(hydrate()){
    show(panel);hide(login);hide(browser);say('Katalog otomatik yükleniyor...');document.getElementById('iptv-connect').click();
  }else startup=false;
})();
