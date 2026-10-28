/* XIPTV Play TV: Stitch-inspired home, ES5 / webOS 2 compatible. */
(function(){
var home=document.getElementById('tv-home'),diag=document.getElementById('tv-diagnostics');
/* Keep Stitch navigation visible in every catalog view, not just launcher. */
var side=document.getElementById('stitch-side');home.parentNode.insertBefore(side,home);
var ids=['tv-nav-home','tv-home-live','tv-home-films','tv-home-series','tv-nav-fav','tv-nav-search','tv-nav-profile','tv-nav-settings','tv-feature-play','tv-feature-detail','tv-show-diagnostics'];
var nodes=[],i;for(i=0;i<ids.length;i++)nodes.push(document.getElementById(ids[i]));
function open(section){
 home.style.display='none';
 document.body.className='tv-mode tv-catalog';
 window.XIPTVTV.startMode=section==='films'?'movie':section==='series'?'series':'live';
 document.getElementById('tv-favorite-only').checked=false;
 window.XIPTVTV.openSection(window.XIPTVTV.startMode);
}
function clear(node){while(node.firstChild)node.removeChild(node.firstChild);}
function shelf(node,items,type,limit){
 clear(node);
 if(!items.length){var empty=document.createElement('div');empty.className='stitch-empty';empty.textContent='Henüz içerik bulunamadı.';node.appendChild(empty);return;}
 for(var n=0;n<items.length&&n<limit;n++){(function(item){
  var b=document.createElement('button');b.type='button';b.className='stitch-movie-tile';
  var cover=String(item.stream_icon||item.cover_big||item.cover||'');
  if(/^https?:\/\//i.test(cover)){var img=document.createElement('img');img.src=cover;img.alt='';img.onerror=function(){this.style.display='none';};b.appendChild(img);}
  var title=document.createElement('span');title.textContent=String(item.name||item.title||'İçerik');b.appendChild(title);
  b.onclick=function(){open(type==='films'?'films':type==='series'?'series':'live');window.XIPTVTV.openItem(type==='films'?'movie':type==='series'?'series':'live',item);};
  node.appendChild(b);
 })(items[n]);}
}
window.XIPTVTVHome={catalog:null,refresh:function(){if(this.catalog)this.render(this.catalog);},render:function(catalog){
 this.catalog=catalog;
 var movies=catalog.vodStreams||[],series=catalog.seriesList||[],channels=catalog.liveStreams||[];
 shelf(document.getElementById('stitch-recent'),movies,'films',9);
 var favorites=[],recent=[];
 for(var c=0;c<channels.length&&favorites.length<8;c++)if(window.XIPTVTV.isFavorite('live',channels[c]))favorites.push(channels[c]);
 shelf(document.getElementById('stitch-favorites'),favorites,'live',8);
 var resume=window.XIPTVTV.getResume(),continuing=[];
 for(var r=0;r<movies.length&&continuing.length<8;r++)if(Number(resume['movie:'+String(movies[r].stream_id)]||0)>20)continuing.push(movies[r]);
 shelf(document.getElementById('stitch-continue'),continuing,'films',8);
 shelf(document.getElementById('stitch-series'),series,'series',8);
 shelf(document.getElementById('stitch-live'),channels,'live',8);
 window.XIPTVTVHome.data={movies:movies,series:series,channels:channels};
 var lead=movies[0];if(!lead)return;
 var cover=String(lead.stream_icon||lead.cover||'');
 var hero=document.getElementById('stitch-hero');
 if(/^https?:\/\//i.test(cover)){hero.style.backgroundImage='linear-gradient(90deg,#10151d 0%,rgba(16,21,29,.97) 28%,rgba(16,21,29,.55) 72%),url("'+cover.replace(/["'()\\]/g,'')+'")';}
 document.getElementById('stitch-feature-title').textContent=String(lead.name||'İçerikleri Keşfet');
 document.getElementById('stitch-feature-description').textContent='Film ve dizi koleksiyonun büyük ekranda. Kategorileri keşfet, oynatmaya başla.';
}};
document.getElementById('tv-nav-home').onclick=function(){window.XIPTVTVHome.refresh();document.getElementById('iptv-panel').style.display='none';document.body.className='';home.style.display='block';};
document.getElementById('tv-home-live').onclick=function(){open('live');};
document.getElementById('tv-home-films').onclick=function(){open('films');};
document.getElementById('tv-home-series').onclick=function(){open('series');};
document.getElementById('tv-feature-play').onclick=function(){open('films');var d=window.XIPTVTVHome.data;if(d&&d.movies.length)window.XIPTVTV.openItem('movie',d.movies[0]);};
document.getElementById('tv-feature-detail').onclick=function(){open('films');};
document.getElementById('tv-nav-fav').onclick=function(){open('live');document.getElementById('tv-favorite-only').checked=true;if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();};
document.getElementById('tv-nav-search').onclick=function(){open('films');document.getElementById('tv-search').click();};
document.getElementById('tv-nav-profile').onclick=function(){open('live');document.getElementById('tv-profile-switch').click();};
function settings(show){document.getElementById('tv-settings-panel').style.display=show?'block':'none';if(show)document.getElementById('tv-settings-close').focus();}
document.getElementById('tv-nav-settings').onclick=function(){settings(true);};
function syncFilters(){document.getElementById('tv-tr-only').checked=document.getElementById('tv-settings-tr').checked;document.getElementById('tv-hide-adult').checked=document.getElementById('tv-settings-adult').checked;if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();}
document.getElementById('tv-settings-tr').onchange=syncFilters;
document.getElementById('tv-settings-adult').onchange=syncFilters;
document.getElementById('tv-settings-close').onclick=function(){settings(false);document.getElementById('tv-nav-settings').focus();};
document.getElementById('tv-settings-player').onclick=function(){settings(false);open('live');document.getElementById('tv-controls-toggle').click();};
document.getElementById('tv-settings-profiles').onclick=function(){settings(false);open('live');document.getElementById('tv-profile-switch').click();};
document.getElementById('tv-settings-connection').onclick=function(){settings(false);open('live');document.getElementById('iptv-login').style.display='block';document.getElementById('iptv-browser').style.display='none';};
document.getElementById('tv-settings-diagnostics').onclick=function(){settings(false);document.getElementById('tv-show-diagnostics').click();};
document.getElementById('tv-show-diagnostics').onclick=function(){diag.style.display='block';home.style.display='none';document.getElementById('system').focus();};
document.getElementById('iptv-hide').addEventListener('click',function(){home.style.display='block';document.body.className='';document.getElementById('tv-nav-home').focus();},false);
document.addEventListener('keydown',function(e){
 if(document.getElementById('tv-settings-panel').style.display!=='none')return;
 if(home.style.display==='none')return;
 var k=e.keyCode||e.which;if(k!==37&&k!==38&&k!==39&&k!==40&&k!==13)return;
 var current=0;for(var p=0;p<nodes.length;p++)if(nodes[p]===document.activeElement)current=p;
 if(k===13)nodes[current].click();
 else{var delta=(k===37||k===38)?-1:1;nodes[(current+delta+nodes.length)%nodes.length].focus();}
 e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
},true);
document.getElementById('tv-nav-home').focus();
})();
