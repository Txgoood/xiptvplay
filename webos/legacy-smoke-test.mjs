// Node smoke checks for the ES5 webOS 2 diagnostic view.
// No browser dependency: verifies handler wiring and remote/local source selection.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const html=fs.readFileSync('webos-package/index.html','utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert(match,'inline ES5 app script missing');
assert(!html.includes('type="module"'),'webOS 2 entry point must not use JavaScript modules');
const elements={},handlers={},ids=['system','local','remote','network','stop','video','status','events'];
const document={
  activeElement:null,
  getElementById(id){return elements[id];},
  addEventListener(event,callback){handlers[event]=callback;}
};
for(const id of ids){
  elements[id]={id,innerHTML:id,className:'',focus(){document.activeElement=this;this.onfocus?.();}};
}
let playCount=0;
Object.assign(elements.video,{
  readyState:0,networkState:0,
  canPlayType:()=> 'maybe',
  pause(){},load(){},
  play(){playCount++;return {catch(){}};},
  removeAttribute(name){if(name==='src')this.src='';}
});
const context=vm.createContext({document,window:{XMLHttpRequest:function(){}},Date,Math});
new vm.Script(match[1],{filename:'webos-legacy-inline.js'}).runInContext(context);
assert.match(elements.status.innerHTML,/Sistem çalışıyor/);
elements.local.onclick();
assert.equal(elements.video.src,'./sample.mp4');
assert.equal(playCount,1);
handlers.keydown({keyCode:39,preventDefault(){}});
handlers.keydown({keyCode:13,preventDefault(){}});
assert.match(elements.video.src,/^https:\/\//);
assert.equal(playCount,2);
console.log('PASS: legacy script syntax, startup, local selection, remote selection, keydown OK');
