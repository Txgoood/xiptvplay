import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const html=fs.readFileSync('webos-package/index.html','utf8');
const match=html.match(/<script>([\s\S]*?)<\/script>/);
assert(match,'inline legacy script is missing');
assert(!html.includes('type="module"'),'webOS 2 must not use JS modules');
assert(html.includes('v0.4.2'),'wrong TV build version');
const metadata=JSON.parse(fs.readFileSync('webos-package/appinfo.json','utf8'));
assert.equal(metadata.trustLevel,'netcast');
assert.equal(metadata.vendorExtension?.allowCrossDomain,true);
const iptvScript=fs.readFileSync('webos-package/tv-iptv.js','utf8');
new vm.Script(iptvScript,{filename:'webos-tv-iptv.js'});
assert(html.includes('id="iptv-open"'));
assert(html.includes('src="./tv-iptv.js"'));
assert(iptvScript.includes('/api/iptv/xtream/verify'));
assert(iptvScript.includes('/api/iptv/xtream/catalog'));
assert(iptvScript.includes('xiptv_webos2_xtream_local_v1'));
assert(iptvScript.includes('localStorage.removeItem(SAVE_KEY)'));
assert(html.includes('id="iptv-remember"'));
assert(html.includes('id="iptv-forget"'));
const keyboard=fs.readFileSync('webos-package/tv-keyboard.js','utf8');
new vm.Script(keyboard,{filename:'tv-keyboard.js'});
assert(html.includes('id="iptv-server-keyboard"'));
assert(html.includes('id="iptv-user-keyboard"'));
assert(html.includes('id="iptv-pass-keyboard"'));
assert(html.includes('src="./tv-keyboard.js"'));
const elements={},handlers={};
const ids=['system','local','remote','network','stop','proxy','hls','mp4src','blob','mdn','w3','aac','video','status','events'];
const document={
  activeElement:null,
  getElementById(id){return elements[id];},
  createElement(tag){
    assert.equal(tag,'source');
    return {tag,attrs:{},setAttribute(key,value){this.attrs[key]=value;}};
  },
  addEventListener(name,fn){handlers[name]=fn;}
};
for(const id of ids){
  elements[id]={id,innerHTML:id,className:'',focus(){document.activeElement=this;this.onfocus?.();}};
}
let playCount=0;
const sources=[],videoEvents={};
Object.assign(elements.video,{
  readyState:0,networkState:0,canPlayType:()=> 'maybe',
  appendChild(node){sources.push(node);},
  removeChild(node){assert.equal(sources.shift(),node);},
  addEventListener(name,fn){videoEvents[name]=fn;},
  pause(){},load(){},play(){playCount++;return {catch(){}};},
  removeAttribute(key){if(key==='src')this.src='';}
});
Object.defineProperty(elements.video,'firstChild',{get(){return sources[0]||null;}});
let xhrCount=0,blobRequest=null;
function FakeXHR(){xhrCount++;blobRequest=this;this.status=206;}
FakeXHR.prototype.open=function(method,url){this.requestURL=url;};
FakeXHR.prototype.setRequestHeader=function(){};
FakeXHR.prototype.send=function(){};
const urlApi={createObjectURL(){return 'blob:fake-local';},revokeObjectURL(){}};
const context=vm.createContext({document,window:{XMLHttpRequest:FakeXHR,URL:urlApi},XMLHttpRequest:FakeXHR,Date,Math,encodeURIComponent});
new vm.Script(match[1],{filename:'legacy-index-script.js'}).runInContext(context);

assert.match(elements.status.innerHTML,/Sistem çalışıyor/);
assert.equal(typeof videoEvents.error,'function');
assert.equal(typeof videoEvents.playing,'function');

// Same packaged offline video must still work.
elements.local.onclick();
assert.equal(elements.video.src,'./sample.mp4');
assert.equal(playCount,1);
// Magic Remote D-pad followed by OK must select remote video.
handlers.keydown({keyCode:39,preventDefault(){}});
handlers.keydown({keyCode:13,preventDefault(){}});
assert.match(elements.video.src,/^https:\/\//);
assert.equal(playCount,2);
// Render proxy route must remain in place.
elements.proxy.onclick();
assert.match(elements.video.src,/^https:\/\/xiptvplay\.onrender\.com\/api\/iptv\/proxy\?url=/);
assert.equal(playCount,3);
// Legacy HLS must use the source element with explicit MIME.
elements.hls.onclick();
assert.equal(sources.length,1);
assert.match(sources[0].attrs.src,/\.m3u8$/);
assert.equal(sources[0].attrs.type,'application/x-mpegurl');
assert.equal(playCount,4);
// Legacy MP4 must use the source element with explicit MIME.
elements.mp4src.onclick();
assert.equal(sources.length,1);
assert.match(sources[0].attrs.src,/\.mp4$/);
assert.equal(sources[0].attrs.type,'video/mp4');
assert.equal(playCount,5);
// Only fetch a tiny test file into memory on explicit click.
elements.blob.onclick();
assert.equal(xhrCount,1);
assert.equal(blobRequest.responseType,'blob');
assert.match(blobRequest.requestURL,/\.mp4$/);
blobRequest.response={size:123456,type:'video/mp4'};
blobRequest.onload();
assert.equal(elements.video.src,'blob:fake-local');
assert.equal(playCount,6);
elements.mdn.onclick();assert(elements.video.src.includes('mozilla.net/media/'));assert.equal(playCount,7);
elements.w3.onclick();assert(elements.video.src.includes('w3schools.com/html/'));assert.equal(playCount,8);
elements.aac.onclick();assert(elements.video.src.includes('assets.testfiles.dev/video/sample-3s.mp4'));assert.equal(playCount,9);
elements.stop.onclick();
assert.equal(sources.length,0);
assert.equal(elements.video.src,'');
console.log('PASS: ES5 script startup, Magic Remote, local MP4, proxy, HLS MIME, MP4 MIME, blob test, stop');
