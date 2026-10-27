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
  var categoryList=[], channelList=[], selectedCategory='all';
  var server='',username='',password='';
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
  function renderChannels(){
    clear(channels);
    var count=0;
    for(var i=0;i<channelList.length;i++){
      var ch=channelList[i];
      if(selectedCategory!=='all' && String(ch.category_id)!==selectedCategory)continue;
      (function(item){
        action(channels,(count+1)+'. '+String(item.name||'İsimsiz Kanal'),function(){playChannel(item);});
      })(ch);count++;
      if(count>=350)break;
    }
    say(count+' kanal listelendi'+(count===350?' (ilk 350)':'')+'. Kumandayla veya işaretçiyle seçim yap.');
  }
  function renderCategories(){
    clear(categories);
    action(categories,'Tümü',function(){selectedCategory='all';renderChannels();});
    for(var i=0;i<categoryList.length;i++){
      (function(c){action(categories,String(c.category_name||'Kategori'),function(){selectedCategory=String(c.category_id);renderChannels();});})(categoryList[i]);
    }
    renderChannels();
  }
  function playChannel(item){
    var id=item.stream_id;
    if(id===null||typeof id==='undefined'){say('Bu kanalın stream ID bilgisi eksik');return;}
    var raw=server.replace(/\/$/,'')+'/live/'+encodeURIComponent(username)+'/'+encodeURIComponent(password)+'/'+encodeURIComponent(id)+'.m3u8';
    // Native first for webOS 2. Do not proxy HLS manifest without rewriting segment URLs.
    var source=raw;
    try{
      video.pause();video.removeAttribute('src');
      while(video.firstChild)video.removeChild(video.firstChild);
      video.load();video.src=source;video.load();video.play();
      say('Kanal oynatılıyor: '+(item.name||id)+' | Akış: HLS (uyumsuz yayınlarda oynatıcı hata gösterebilir)');
    }catch(e){say('Oynatma başlatılamadı: '+e.message);}
  }
  launcher.onclick=function(){show(panel);show(login);hide(browser);document.getElementById('iptv-server').focus();};
  document.getElementById('iptv-hide').onclick=function(){hide(panel);launcher.focus();};
  document.getElementById('iptv-connect').onclick=function(){
    server=document.getElementById('iptv-server').value.trim().replace(/\/+$/,'');
    username=document.getElementById('iptv-user').value.replace(/^\\s+|\\s+$/g,'');
    password=document.getElementById('iptv-pass').value;
    if(!server||!username||!password){say('Sunucu, kullanıcı ve şifre zorunludur');return;}
    if(server.indexOf('http://')!==0 && server.indexOf('https://')!==0)server='http://'+server;
    say('Xtream bağlantısı doğrulanıyor...');
    request('/api/iptv/xtream/verify',{serverUrl:server,username:username,password:password},function(err,data){
      if(err||!data.success){say('Doğrulama başarısız: '+(err?err.message:data.error||'Hesap reddedildi'));return;}
      server=data.effectiveServerUrl||server;
      say('Bağlantı başarılı, canlı TV kataloğu alınıyor...');
      request('/api/iptv/xtream/catalog',{serverUrl:server,username:username,password:password},function(error,catalog){
        if(error){say('Katalog hatası: '+error.message);return;}
        categoryList=catalog.liveCategories||[];
        channelList=catalog.liveStreams||[];
        hide(login);show(browser);
        renderCategories();
      });
    });
  };
})();
