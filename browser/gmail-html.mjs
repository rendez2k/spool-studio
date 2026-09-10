import {parseFragment} from 'parse5';

export function text(html) {
 if(typeof html!=='string'||html.length>150000)throw Error('Email HTML is too large. Paste only the product lines.');
 const tree=parseFragment(html),chunks=[];let nodes=0;
 const ignored=new Set(['script','style','head','title','iframe','object','embed','svg','math','template','noscript','img','video','audio','input','button']);
 const blocks=new Set(['div','p','section','article','header','footer','h1','h2','h3','h4','h5','h6','table','tr','ul','ol','li','blockquote','br','hr']);
 function visit(node,depth){
  if(++nodes>20000||depth>80)throw Error('Email structure is too large. Paste only the product lines.');
  if(ignored.has(node.tagName))return;
  const attrs=new Map((node.attrs||[]).map(attribute=>[attribute.name,attribute.value]));
  if(attrs.has('hidden')||attrs.get('aria-hidden')==='true'||/(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attrs.get('style')||''))return;
  if(node.nodeName==='#text'){chunks.push(node.value);return}
  if(blocks.has(node.tagName))chunks.push('\n');
  for(const child of node.childNodes||[])visit(child,depth+1);
  if(blocks.has(node.tagName))chunks.push('\n');else if(['td','th'].includes(node.tagName))chunks.push('\t');
 }
 visit(tree,0);
 const result=chunks.join('').replace(/\r/g,'').replace(/[ \t\u00a0]+/g,' ').replace(/ *\n */g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 if(result.length>60000)throw Error('Email text exceeds 60000 characters.');
 return result;
}
