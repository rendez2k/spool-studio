'use strict';
const fs=require('node:fs/promises');
function vault(filename,safeStorage){
 function encryption(){
  if(!safeStorage.isEncryptionAvailable()||safeStorage.getSelectedStorageBackend?.()==='basic_text')throw Error('Secure operating-system storage is unavailable. Configuration was not saved.');
 }
 return {
  async load(){
   try{encryption();const bytes=await fs.readFile(filename);if(bytes.length>32768)throw Error('Saved configuration is too large.');return JSON.parse(safeStorage.decryptString(bytes))}
   catch(error){if(error.code==='ENOENT')return null;throw error}
  },
  async save(value){
   encryption();const text=JSON.stringify(value);if(Buffer.byteLength(text)>16384)throw Error('Configuration is too large.');
   await fs.writeFile(filename+'.tmp',safeStorage.encryptString(text),{mode:0o600});
   await fs.rename(filename+'.tmp',filename);
  },
  async remove(){await fs.rm(filename,{force:true});await fs.rm(filename+'.tmp',{force:true})}
 };
}
module.exports={vault};
