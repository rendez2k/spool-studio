import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,copyFile,readFile,rm} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('container check accepts arguments, fails closed and never logs malformed credentials',async()=>{
 const dockerfile=await readFile('bridge-desktop/Dockerfile','utf8');
 assert(dockerfile.includes('ENTRYPOINT ["node", "container.mjs"]'));
 const directory=await mkdtemp(path.join(tmpdir(),'studio-container-'));
 try{
  await copyFile('bridge-desktop/container.mjs',path.join(directory,'container.mjs'));
  await writeFile(path.join(directory,'bridge.cjs'),"exports.configuration=value=>value;exports.inspectPrinter=async()=>({supported:false});exports.bridgeOnce=async()=>{throw Error('Must not execute requests during check')};");
  const filename=path.join(directory,'config.json');
  const run=()=>spawnSync(process.execPath,[path.join(directory,'container.mjs'),'--check'],{encoding:'utf8',env:{...process.env,BRIDGE_CONFIG:filename}});
  await writeFile(filename,'{"token":"secret-fixture-not-for-output",broken');
  const malformed=run();assert.equal(malformed.status,1);assert(!malformed.stderr.includes('secret-fixture-not-for-output'));assert(malformed.stderr.includes('Could not load a valid'));
  await writeFile(filename,JSON.stringify({origin:'https://spool-studio.uk'}));
  const unsupported=run();assert.equal(unsupported.status,1);assert(unsupported.stdout.includes('"supported": false'));
 }finally{assert.equal(path.dirname(directory),path.resolve(tmpdir()));await rm(directory,{recursive:true,force:true})}
});
