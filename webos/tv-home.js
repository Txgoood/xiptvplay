/* Modern TV launcher; ES5 for LG webOS 2. Diagnostic panel is opt-in. */
(function(){
var home=document.getElementById('tv-home'),diag=document.getElementById('tv-diagnostics');
var live=document.getElementById('tv-home-live'),films=document.getElementById('tv-home-films'),series=document.getElementById('tv-home-series');
function open(section){
 home.style.display='none';
 window.XIPTVTV.startMode=section==='films'?'movie':section==='series'?'series':'live';
 document.getElementById('iptv-open').click();
 if(section!=='live'){
   var tab=document.getElementById('tv-tab-'+(section==='films'?'movie':'series'));
   if(tab)tab.click();
 }
}
live.onclick=function(){open('live');};
films.onclick=function(){open('films');};
series.onclick=function(){open('series');};
document.getElementById('tv-show-diagnostics').onclick=function(){
 diag.style.display='block';home.style.display='none';
 document.getElementById('system').focus();
};
document.getElementById('iptv-hide').addEventListener('click',function(){
 home.style.display='block';live.focus();
},false);
document.addEventListener('keydown',function(e){
 if(home.style.display==='none')return;
 var key=e.keyCode||e.which;
 if(key!==37&&key!==38&&key!==39&&key!==40&&key!==13)return;
 var list=[live,films,series,document.getElementById('tv-show-diagnostics')],idx=0;
 for(var i=0;i<list.length;i++)if(document.activeElement===list[i])idx=i;
 if(key===13){list[idx].click();}else{list[(idx+(key===37||key===38?-1:1)+list.length)%list.length].focus();}
 if(e.preventDefault)e.preventDefault();
 if(e.stopImmediatePropagation)e.stopImmediatePropagation();
},true);
live.focus();
})();
