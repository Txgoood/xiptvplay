(function(){'use strict';var frame=document.getElementById('tv'),stage=document.getElementById('stage');var W=1280,H=720;
function resize(){var width=stage.clientWidth,height=stage.clientHeight;var scale=Math.min(width/W,height/H);var holder=document.getElementById('frame-holder');holder.style.left=Math.max(0,(width-W*scale)/2)+'px';holder.style.top=Math.max(0,(height-H*scale)/2)+'px';holder.style.transform='scale('+scale+')';}
function documentOfTV(){try{return frame.contentDocument||frame.contentWindow.document;}catch(e){return null;}}
function key(code){var d=documentOfTV();if(!d)return;try{var ev=d.createEvent('Event');ev.initEvent('keydown',true,true);ev.keyCode=code;ev.which=code;d.dispatchEvent(ev);}catch(e){}}
function click(id){document.getElementById(id).addEventListener('click',function(){key({up:38,down:40,left:37,right:39,ok:13,back:461}[id]);});}
['up','down','left','right','ok','back'].forEach(click);
document.getElementById('home').onclick=function(){var d=documentOfTV(),b=d&&d.getElementById('tv-nav-home');if(b)b.click();};
document.getElementById('refresh').onclick=function(){frame.contentWindow.location.reload();};
document.getElementById('fit').onclick=function(){document.body.classList.remove('wide');resize();};
document.getElementById('wide').onclick=function(){document.body.classList.toggle('wide');if(screen.orientation&&screen.orientation.lock){screen.orientation.lock('landscape').catch(function(){});}resize();};
window.addEventListener('resize',resize);window.addEventListener('orientationchange',resize);resize();
})();