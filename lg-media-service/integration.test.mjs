import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
process.env.NODE_ENV='test';
const {probeMedia,normalizeStreams}=await import('./server.mjs');
function pcmWav(){
 const samples=8000,buffer=Buffer.alloc(44+samples*2);
 buffer.write('RIFF',0);buffer.writeUInt32LE(buffer.length-8,4);
 buffer.write('WAVE',8);buffer.write('fmt ',12);buffer.writeUInt32LE(16,16);
 buffer.writeUInt16LE(1,20);buffer.writeUInt16LE(1,22);
 buffer.writeUInt32LE(8000,24);buffer.writeUInt32LE(16000,28);
 buffer.writeUInt16LE(2,32);buffer.writeUInt16LE(16,34);
 buffer.write('data',36);buffer.writeUInt32LE(samples*2,40);
 for(let i=0;i<samples;i++)buffer.writeInt16LE(Math.round(Math.sin(i*2*Math.PI*440/8000)*3000),44+i*2);
 return buffer;
}
test('production FFprobe binary reads real audio over HTTP as JSON',async()=>{
 const bytes=pcmWav();
 const srv=http.createServer((req,res)=>{
  res.writeHead(200,{'Content-Type':'audio/wav','Content-Length':String(bytes.length),'Accept-Ranges':'bytes'});
  res.end(bytes);
 });
 await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
 try{
  const address=srv.address();
  const data=await probeMedia('http://127.0.0.1:'+address.port+'/series/demo.wav');
  const audio=normalizeStreams(data).filter(t=>t.type==='audio');
  assert.ok(audio.length>=1,'FFprobe did not find PCM audio');
  assert.equal(audio[0].codec,'pcm_s16le');
 }finally{await new Promise(resolve=>srv.close(resolve));}
});
test('fallback retries invalid JSON with the alternate FFprobe arguments',async()=>{
 const calls=[];
 const fixture=JSON.stringify({streams:[{index:1,codec_type:'audio',codec_name:'aac',tags:{language:'tur'}}]});
 const result=await probeMedia('https://example.org/video.mkv',async(_bin,args)=>{
  calls.push(args);
  return calls.length===1?'not-json':fixture;
 });
 assert.equal(calls.length,2);
 assert.ok(calls[1].includes('-show_streams'));
 assert.equal(normalizeStreams(result)[0].language,'tur');
});
