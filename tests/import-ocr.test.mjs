import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from 'tesseract.js';
import {Resvg} from '@resvg/resvg-js';
import {fileURLToPath} from 'node:url';
test('real OCR reads a synthetic label without an external language download',{timeout:60000},async()=>{
 const png=new Resvg('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="300"><rect width="1000" height="300" fill="white"/><g fill="black" font-family="Arial" font-size="48"><text x="30" y="70">SUNLU PLA MATTE</text><text x="30" y="145">Orange 1 kg refill</text><text x="30" y="220">Quantity: 2</text></g></svg>').render().asPng();
 const worker=await createWorker('eng',1,{langPath:fileURLToPath(new URL('../out/vendor/ocr',import.meta.url)),gzip:true,cacheMethod:'none'});
 try{const {data}=await worker.recognize(png);assert.match(data.text,/SUNLU PLA MATTE/i);assert.match(data.text,/Orange/i);assert.match(data.text,/Quantity:\s*2/i)}
 finally{await worker.terminate()}
});
