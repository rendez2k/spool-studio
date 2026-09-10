export const communityRollsQuery = `
WITH inventory AS (
  SELECT user_id, payload::jsonb AS data FROM libraries
), tracked AS (
  SELECT user_id, reel->>'itemId' AS item_id, COUNT(*) AS tracked,
    COUNT(*) FILTER (WHERE COALESCE(reel->>'used', 'false') <> 'true') AS available
  FROM inventory CROSS JOIN LATERAL jsonb_array_elements(COALESCE(NULLIF(data->'reels', 'null'::jsonb), '[]'::jsonb)) AS reel
  GROUP BY user_id, reel->>'itemId'
)
SELECT COALESCE(SUM(CASE
  WHEN item->>'used' = 'true' THEN 0
  WHEN tracked.tracked > 0 THEN tracked.available
  WHEN jsonb_typeof(item->'spools') = 'number' AND item->>'spools' ~ '^[0-9]+$'
    THEN (item->>'spools')::numeric
  ELSE 0 END), 0)::text AS rolls
FROM inventory CROSS JOIN LATERAL jsonb_array_elements(data->'items') AS item
LEFT JOIN tracked ON tracked.user_id = inventory.user_id AND tracked.item_id = item->>'id'`;

export async function handleCommunityStats(request, {DB}) {
  const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
  const json=(value,status=200)=>Response.json(value,{status,headers});
  if(!request.headers.get('oai-authenticated-user-id'))return json({error:'Sign in to see the community total.'},401);
  if(request.method!=='GET')return json({error:'Method not allowed.'},405);
  if(new URL(request.url).search)return json({error:'This statistic does not support filters.'},400);
  try{
    const count=await DB.communityRollCount();
    if(!Number.isSafeInteger(count)||count<0)throw Error('Invalid aggregate.');
    return json({availableRolls:count,asOf:new Date().toISOString()});
  }catch{return json({error:'The community total is temporarily unavailable.'},503)}
}
