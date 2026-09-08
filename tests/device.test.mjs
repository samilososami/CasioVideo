import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Calculator, CAPACITY, RESERVE, sha256, newerVersion } from '../web/src/device.js';
import { updateMetadata } from '../web/src/format.js';

const demo = new Uint8Array(await readFile(new URL('../samples/COLORES.cvid', import.meta.url)));
const missing = () => new DOMException('Missing', 'NotFoundError');
class MemoryFile {
  constructor(name, bytes) { this.kind='file';this.name=name;this.bytes=bytes.slice();this.commits=0; }
  async getFile() { return new File([this.bytes], this.name); }
  async createWritable() {
    const pieces=[];let aborted=false;
    return {
      write:async chunk=>{if(aborted)throw Error('aborted');pieces.push(chunk.slice());},
      close:async()=>{this.commits++;this.bytes=new Uint8Array(await new Blob(pieces).arrayBuffer());this.afterCommit?.();},
      abort:async()=>{aborted=true;},
    };
  }
}
class MemoryDirectory {
  constructor(name='CG50') { this.kind='directory';this.name=name;this.entries=new Map(); }
  async *values() { yield* this.entries.values(); }
  async getFileHandle(name, {create=false}={}) {
    if(!this.entries.has(name)){if(!create)throw missing();this.entries.set(name,new MemoryFile(name,new Uint8Array()));}
    return this.entries.get(name);
  }
  async removeEntry(name) { if(!this.entries.delete(name))throw missing(); }
}
function fixture() {
  const root=new MemoryDirectory();
  root.entries.set('@MainMem',new MemoryDirectory('@MainMem'));
  root.entries.set('notes.txt',new MemoryFile('notes.txt',new TextEncoder().encode('leave this alone')));
  root.entries.set('COLORES.cvid',new MemoryFile('COLORES.cvid',demo));
  return {root,calculator:new Calculator(root)};
}
test('inventory is read-only and reserves space in decimal MB inputs',async()=>{
  const {root,calculator}=fixture();
  const snap=await calculator.scan();
  assert.equal(snap.videos.length,1);
  assert.equal(snap.videos[0].title.length>0,true);
  assert.equal(snap.free,CAPACITY-snap.allocated-RESERVE);
  assert.equal(root.entries.get('COLORES.cvid').commits,0);
});
test('upload is reread, hash verified and does not touch unrelated files',async()=>{
  const {root,calculator}=fixture();
  const progress=[];
  const file=await calculator.upload(demo,p=>progress.push(p));
  assert.match(file.name,/^CV[0-9A-F]{6}\.cvid$/);
  assert.equal(file.commits,1);
  assert.equal(await sha256(file.bytes),await sha256(demo));
  assert.equal(progress.at(-1),100);
  assert.equal(await (await root.entries.get('notes.txt').getFile()).text(),'leave this alone');
  assert.equal(calculator.snapshot.videos.length,2);
});
test('manually named compatible videos can be edited and deleted',async()=>{
  const {root,calculator}=fixture();
  root.entries.set('My video.cvid',new MemoryFile('My video.cvid',demo));
  const video=(await calculator.scan()).videos.find(v=>v.name==='My video.cvid');
  await calculator.update(video,updateMetadata(demo,'Nuevo título',null),()=>{});
  assert.equal(calculator.snapshot.videos.find(v=>v.name===video.name).title,'Nuevo título');
  await calculator.remove(video,()=>{});
  assert.equal(root.entries.has('My video.cvid'),false);
  assert.equal(root.entries.has('COLORES.cvid'),true);
});
test('low free space fails before opening a writable file',async()=>{
  const {root,calculator}=fixture();
  const blocker=new MemoryFile('full.bin',new Uint8Array());
  blocker.getFile=async()=>({size:CAPACITY-RESERVE-8192});
  root.entries.set('full.bin',blocker);
  await assert.rejects(calculator.upload(demo,()=>{}),/Falta espacio/);
  assert.equal(root.entries.size,4);
  assert.equal(root.entries.get('COLORES.cvid').commits,0);
});
test('failed readback gives one original backup and never retries writing',async()=>{
  const {root,calculator}=fixture();
  const video=(await calculator.scan()).videos[0],file=root.entries.get(video.name);
  file.afterCommit=()=>{file.bytes[file.bytes.length-1]^=1;};
  try { await calculator.update(video,updateMetadata(demo,'Cambio',null),()=>{});assert.fail('must fail'); }
  catch(e) { assert.match(e.message,/verificación/);assert.equal(await sha256(await e.recovery.arrayBuffer()),await sha256(demo)); }
  assert.equal(file.commits,1);
  assert.equal(calculator.busy,false);
});
test('reject unrelated files, paths, damaged CVID and changed identities',async()=>{
  const {root,calculator}=fixture();
  await assert.rejects(calculator.writeVerified('../CasioLLM.g3a',demo),/no autorizado/);
  await assert.rejects(calculator.remove({name:'notes.txt'},()=>{}),/no pertenece/);
  const video=(await calculator.scan()).videos[0];
  root.entries.get(video.name).bytes=new Uint8Array(300);
  await assert.rejects(calculator.update(video,demo,()=>{}));
  assert.equal(root.entries.get(video.name).commits,0);
  const corrupt=demo.slice();corrupt[corrupt.length-1]^=1;
  await assert.rejects(calculator.upload(corrupt,()=>{}),/CRC/);
});
test('installed newer versions are not offered a downgrade',()=>{
  assert.equal(newerVersion('v0.1.1','00.01.0001'),false);
  assert.equal(newerVersion('0.1.2','00.01.0001'),true);
  assert.equal(newerVersion('0.1.1','0.2.0'),false);
});
