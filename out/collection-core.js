'use strict';
(function(root){
 function members(row){return row.members||[row]}
 function timestamp(row,order){
  const values=members(row).map(member=>Date.parse(member[order.startsWith('added')?'addedAt':'date']||'')).filter(Number.isFinite);
  return values.length?(order.endsWith('asc')?Math.min(...values):Math.max(...values)):null;
 }
 function sort(rows,order){
  if(!['purchased-desc','purchased-asc','added-desc','added-asc'].includes(order))return rows;
  return rows.slice().sort((left,right)=>{
   const first=timestamp(left,order),second=timestamp(right,order);
   if(first===null||second===null)return Number(first===null)-Number(second===null)||String(left.id).localeCompare(String(right.id));
   return (order.endsWith('asc')?first-second:second-first)||String(left.id).localeCompare(String(right.id));
  });
 }
 function reconcile(selected,rows){const available=new Set(rows.flatMap(row=>members(row).map(member=>member.id)));return new Set([...selected].filter(id=>available.has(id)))}
 const api={members,timestamp,sort,reconcile};
 if(typeof module==='object'&&module.exports)module.exports=api;else root.SpoolCollection=api;
})(typeof globalThis==='object'?globalThis:this);
