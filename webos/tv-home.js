/* Stitch-inspired webOS 2 launcher, ES5 only. No credentials or streams embedded. */
(function(){
var home=document.getElementById('tv-home'),diag=document.getElementById('tv-diagnostics');
var ids=['tv-nav-home','tv-home-live','tv-home-films','tv-home-series','tv-nav-fav','tv-nav-search','tv-nav-profile','tv-feature-play','tv-feature-detail','tv-show-diagnostics'];
var nodes=[],i;
for(i=0;i<ids.length;i++)nodes.push(document.getElementById(ids[i]));
function open(section){
 home.style.display='none';
 window.XIPTVTV.startMode=section==='films'?'movie':section==='series'?'series':'live';
 document.getElementById('iptv-open').click();
 if(section==='films'||section==='series'){
  var tab=document.getElementById('tv-tab-'+(section==='films'?'movie':'series'));if(tab)tab.click();
 }
}
document.getElementById('tv-nav-home').onclick=function(){home.style.display='block';};
document.getElementById('tv-home-live').onclick=function(){open('live');};
document.getElementById('tv-home-films').onclick=function(){open('films');};
document.getElementById('tv-home-series').onclick=function(){open('series');};
document.getElementById('tv-feature-play').onclick=function(){open('live');};
document.getElementById('tv-feature-detail').onclick=function(){open('films');};
document.getElementById('tv-nav-fav').onclick=function(){open('live');document.getElementById('tv-favorite-only').checked=true;if(window.XIPTVTV.refresh)window.XIPTVTV.refresh();};
document.getElementById('tv-nav-search').onclick=function(){open('films');document.getElementById('tv-search').click();};
document.getElementById('tv-nav-profile').onclick=function(){open('live');document.getElementById('tv-profile-switch').click();};
document.getElementById('tv-show-diagnostics').onclick=function(){diag.style.display='block';home.style.display='none';document.getElementById('system').focus();};
document.getElementById('iptv-hide').addEventListener('click',function(){home.style.display='block';document.getElementById('tv-nav-home').focus();},false);
document.addEventListener('keydown',function(e){
 if(home.style.display==='none')return;
 var k=e.keyCode||e.which;
 if(k!==37&&k!==38&&k!==39&&k!==40&&k!==13)return;
 var current=0;for(var p=0;p<nodes.length;p++)if(nodes[p]===document.activeElement)current=p;
 if(k===13)nodes[current].click();
 else{var delta=(k===37||k===38)?-1:1;nodes[(current+delta+nodes.length)%nodes.length].focus();}
 e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
},true);
document.getElementById('tv-nav-home').focus();
})();
