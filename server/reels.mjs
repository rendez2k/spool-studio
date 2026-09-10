export const maxReels = 5000;
export function addReels(data, item, count = item.spools) {
  if (!Array.isArray(data.reels) || !Number.isInteger(count)) return;
  if (data.reels.length + count > maxReels) throw Error('Permanent-ID tracking supports up to 5000 physical reels.');
  for (let index = 0; index < count; index++) {
    const number = data.nextReelNumber || 1;
    data.reels.push({ id: crypto.randomUUID(), number, itemId: item.id, used: Boolean(item.used), remainingGrams: null, location: '', spoolmanId: null });
    data.nextReelNumber = number + 1;
  }
}
export function initialiseReels(data) {
  if (Array.isArray(data.reels)) return;
  const total = data.items.reduce((sum, item) => sum + (Number.isInteger(item.spools) ? item.spools : 0), 0);
  if (total > maxReels) throw Error('This library exceeds the 5000 physical-reel limit.');
  data.reels = []; data.nextReelNumber = data.nextReelNumber || 1;
  for (const item of data.items) addReels(data, item);
}
export function updateReel(data, input) {
  const reel = data.reels?.find(reel => reel.id === input.id);
  if (!reel) throw Error('Physical spool not found in your library.');
  if (typeof input.used !== 'boolean') throw Error('Choose the spool status.');
  if (typeof input.location !== 'string' || input.location.length > 80 || /[\u0000-\u001f]/.test(input.location)) throw Error('Use a storage location up to 80 characters.');
  if (input.remainingGrams !== null && (!Number.isFinite(input.remainingGrams) || input.remainingGrams < 0 || input.remainingGrams > 10000)) throw Error('Enter 0–10000 grams of filament, or leave unknown.');
  if (input.spoolmanId !== null && (!Number.isSafeInteger(input.spoolmanId) || input.spoolmanId < 1)) throw Error('Use a positive Spoolman spool ID, or leave blank.');
  if (input.spoolmanId !== null && data.reels.some(other => other.id !== reel.id && other.spoolmanId === input.spoolmanId)) throw Error('That Spoolman ID is already assigned to another physical reel.');
  if (input.spoolmanId !== null && input.remainingGrams !== reel.remainingGrams) throw Error('Unlink Spoolman before entering a manual weight.');
  Object.assign(reel, { used: input.used, remainingGrams: input.remainingGrams, location: input.location.trim(), spoolmanId: input.spoolmanId, updatedAt: new Date().toISOString() });
  if (input.spoolmanId === null) { reel.weightSource = input.remainingGrams === null ? 'unknown' : 'manual'; delete reel.syncedAt; }
  updateItemStatus(data, reel.itemId);
}
export function updateItemStatus(data, itemId) {
  const owned = data.reels.filter(reel => reel.itemId === itemId);
  const item = data.items.find(item => item.id === itemId);
  if (item && owned.length) item.used = owned.every(reel => reel.used);
}
export async function tokenHash(token) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(value => value.toString(16).padStart(2, '0')).join('');
}
