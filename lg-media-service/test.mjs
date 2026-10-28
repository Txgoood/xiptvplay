import test from 'node:test';
import assert from 'node:assert/strict';
process.env.NODE_ENV='test';
const {safeIp,normalizeStreams,sourcePath,probeArgs}=await import('./server.mjs');
test('blocks loopback, RFC1918 and link-local addresses',()=>{
 for(const ip of ['127.0.0.1','10.0.0.1','172.16.1.1','192.168.2.4','169.254.169.254','::1','fc00::2'])assert.equal(safeIp(ip),false,ip);
 assert.equal(safeIp('1.1.1.1'),true);
});
test('normalizes complete audio and subtitle stream indexes',()=>{
 const streams=normalizeStreams({streams:[{index:0,codec_type:'video'},{index:1,codec_type:'audio',codec_name:'aac',tags:{language:'tur'}},{index:2,codec_type:'audio',codec_name:'ac3',tags:{language:'eng'}},{index:3,codec_type:'subtitle',codec_name:'subrip',tags:{language:'tur'}},{index:4,codec_type:'subtitle',codec_name:'hdmv_pgs_subtitle',tags:{language:'eng'}}]});
 assert.deepEqual(streams.map(x=>x.index),[1,2,3,4]);
 assert.equal(streams[2].externalVtt,true);
 assert.equal(streams[3].externalVtt,false);
});
test('only permitted Xtream paths',()=>{
 assert.match(sourcePath({kind:'series',id:'1234',username:'user',password:'pass',extension:'mkv'},'https://iptv.example'),/\/series\/user\/pass\/1234\.mkv$/);
 for(const type of ['live','../../etc'])assert.throws(()=>sourcePath({kind:type,id:'123',username:'u',password:'p'},'https://iptv.example'));
 assert.throws(()=>sourcePath({kind:'movie',id:'../a',username:'u',password:'p'},'https://iptv.example'));
});
test('probe uses bounded analysis and JSON metadata',()=>{
 let args=probeArgs('https://host.invalid/movie/u/p/1.mkv');
 assert.ok(args.includes('-probesize'));assert.ok(args.includes('-analyzeduration'));
 assert.equal(args.at(-1),'https://host.invalid/movie/u/p/1.mkv');
});
