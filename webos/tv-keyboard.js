/* webOS 2 Magic Remote fallback: app-operated keyboard when LG keyboard does not appear. */
(function(){
var box=document.getElementById('iptv-keyboard'),keys=document.getElementById('iptv-keys'),display=document.getElementById('iptv-keyboard-title');
var target=null,upper=false,selection=0,buttons=[];
var alphabet='1234567890qwertyuiopasdfghjklzxcvbnm';
var special=['.',':','/','-','_','@','?','&','=','%','+','!'];
function visible(){return box.style.display!=='none';}
function paint(){
 while(keys.firstChild)keys.removeChild(keys.firstChild);buttons=[];
 var seq=alphabet.split('').concat(special).concat(['BOŞLUK','SİL','TEMİZLE','BÜYÜK/küçük','TAMAM']);
 for(var i=0;i<seq.length;i++){
  (function(t){var b=document.createElement('button');b.type='button';
   b.textContent=(upper&&t.length===1?t.toUpperCase():t);
   b.onclick=function(){press(t);};keys.appendChild(b);buttons.push(b);
  })(seq[i]);
 }
 selection=0;choose(0);
}
function choose(i){if(!buttons.length)return;selection=(i+buttons.length)%buttons.length;for(var n=0;n<buttons.length;n++)buttons[n].className=n===selection?'active':'';buttons[selection].focus();}
function press(c){
 if(!target)return;
 if(c==='TAMAM'){box.style.display='none';target.focus();return;}
 if(c==='BÜYÜK/küçük'){upper=!upper;paint();return;}
 if(c==='SİL'){target.value=target.value.slice(0,-1);}
 else if(c==='TEMİZLE'){target.value='';}
 else{target.value+=(c==='BOŞLUK'?' ':upper?c.toUpperCase():c);}
 display.textContent='Yazılıyor: '+(target.id==='iptv-pass'?new Array(target.value.length+1).join('*'):target.value);
 choose(selection);
}
function open(id){
 target=document.getElementById(id);if(!target)return;
 box.style.display='block';upper=false;
 display.textContent='Yazılıyor: '+(id==='iptv-pass'?new Array(target.value.length+1).join('*'):target.value);
 paint();
}
var names=['iptv-server','iptv-user','iptv-pass'];
for(var i=0;i<names.length;i++){
 (function(id){var trigger=document.getElementById(id+'-keyboard');trigger.onclick=function(){open(id);};})(names[i]);
}
document.addEventListener('keydown',function(e){
 if(!visible())return;
 var k=e.keyCode||e.which;
 if(k===37||k===38||k===39||k===40){
  var step=k===37?-1:k===39?1:k===38?-9:9;choose(selection+step);
 }else if(k===13){buttons[selection].click();}
 else if(k===461||k===27){box.style.display='none';}
 else{return;}
 e.preventDefault();if(e.stopImmediatePropagation)e.stopImmediatePropagation();
},true);
})();
