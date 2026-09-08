import { readFile, mkdir, copyFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
const g3a=await readFile(resolve(root,'firmware/CasioVideo.g3a'));
const version=g3a.subarray(0x130,0x13a).toString().replace(/\0/g,'').trim();
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error(`Invalid G3A version: ${version}`);
const folder=resolve(root,'work/releases',`v${version}`);
await mkdir(folder,{recursive:true});
await copyFile(resolve(root,'firmware/CasioVideo.g3a'),resolve(folder,'CasioVideo.g3a'));
await copyFile(resolve(root,'samples/COLORES.cvid'),resolve(folder,'COLORES.cvid'));
const hashes=[];
for(const name of ['CasioVideo.g3a','COLORES.cvid']) {
  const bytes=await readFile(resolve(folder,name));
  hashes.push({name,size:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
}
await writeFile(resolve(folder,'release.json'),JSON.stringify({version,format:1,verifiedHardware:['Casio fx-CG50'],files:hashes},null,2)+'\n');
hashes.push({name:'release.json',sha256:createHash('sha256').update(await readFile(resolve(folder,'release.json'))).digest('hex')});
await writeFile(resolve(folder,'SHA256SUMS'),hashes.map(f=>`${f.sha256}  ${f.name}`).join('\n')+'\n');
execFileSync('zip',['-j','-q',resolve(folder,`CasioVideo-v${version}.zip`),...['CasioVideo.g3a','COLORES.cvid','release.json','SHA256SUMS'].map(n=>resolve(folder,n))]);
process.stdout.write(`${folder}\n${hashes.map(f=>`${f.name}: ${f.sha256}`).join('\n')}\n`);
