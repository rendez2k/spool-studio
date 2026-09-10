export function linkSpoolman(data, mappings) {
  if (!Array.isArray(data.reels) || !Array.isArray(mappings) || !mappings.length || mappings.length > 5000) throw Error('Import 1–5000 physical spool mappings after assigning permanent IDs.');
  const ids = new Set(), spoolmanIds = new Set();
  for (const mapping of mappings) {
    if (!mapping || typeof mapping.id !== 'string' || !Number.isSafeInteger(mapping.spoolmanId) || mapping.spoolmanId < 1 || ids.has(mapping.id) || spoolmanIds.has(mapping.spoolmanId)) throw Error('The mapping file has invalid or duplicate IDs.');
    const reel = data.reels.find(value => value.id === mapping.id);
    if (!reel) throw Error('A physical spool does not belong to this library.');
    if (reel.spoolmanId !== null && reel.spoolmanId !== mapping.spoolmanId) throw Error('An existing Spoolman link would change. Unlink that reel manually first.');
    if (data.reels.some(value => value.id !== mapping.id && value.spoolmanId === mapping.spoolmanId)) throw Error('A Spoolman ID is already linked to another reel.');
    ids.add(mapping.id); spoolmanIds.add(mapping.spoolmanId);
  }
  for (const mapping of mappings) data.reels.find(value => value.id === mapping.id).spoolmanId = mapping.spoolmanId;
}
