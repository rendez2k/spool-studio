const name='upcitemdb-trial',windowMs=24*60*60*1000,gapMs=15000,dailyLimit=100;
export async function claimBarcodeBudget(database){
 if(!database?.currentMilliseconds)throw Error('Shared lookup budget unavailable.');
 await database.prepare("INSERT INTO service_limits (name, revision, payload) VALUES (?, 1, ?) ON CONFLICT(name) DO NOTHING").bind(name,'[]').run();
 for(let attempt=0;attempt<5;attempt++){
  const row=await database.prepare("SELECT revision, payload FROM service_limits WHERE name = ?").bind(name).first();
  const now=await database.currentMilliseconds();
  if(!row||!Number.isSafeInteger(now)||now<0||!Number.isSafeInteger(row.revision)||row.revision<1)throw Error('Invalid shared lookup budget.');
  const saved=JSON.parse(row.payload);
  if(!Array.isArray(saved)||saved.length>dailyLimit||saved.some(value=>!Number.isSafeInteger(value)||value<0))throw Error('Invalid shared lookup history.');
  const recent=saved.filter(value=>value>now-windowMs).sort((left,right)=>left-right);
  const availableAt=Math.max(recent.length?recent.at(-1)+gapMs:0,recent.length>=dailyLimit?recent[0]+windowMs:0);
  if(availableAt>now)return {allowed:false,retryAfter:Math.ceil((availableAt-now)/1000),daily:recent.length>=dailyLimit};
  const result=await database.prepare("UPDATE service_limits SET revision = revision + 1, payload = ? WHERE name = ? AND revision = ?").bind(JSON.stringify([...recent,now]),name,row.revision).run();
  if(result.meta.changes===1)return {allowed:true};
 }
 return {allowed:false,retryAfter:15,daily:false};
}
