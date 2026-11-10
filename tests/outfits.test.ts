import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_OUTFITS, OUTFIT_CATALOG, OUTFIT_SLOTS, normalizeOutfits } from '../src/outfits.ts';

test('outfit catalog covers the five slots with a dozen unique, previewable items', () => {
  assert.deepEqual(OUTFIT_SLOTS.map(slot => slot.id), ['head', 'face', 'neck', 'body', 'hand']);
  for (const slot of OUTFIT_SLOTS) {
    const ids = OUTFIT_CATALOG[slot.id].map(item => item.id);
    assert.ok(ids.length >= 12, `${slot.id} should offer at least a dozen items`);
    assert.equal(new Set(ids).size, ids.length, slot.id);
    for (const item of OUTFIT_CATALOG[slot.id]) {
      assert.ok(item.name.length > 0);
      assert.ok(item.art.length > 0);
      assert.ok(item.thumb.includes('<svg') && item.thumb.includes(item.art));
    }
  }
});

test('outfits normalize per pet and slot, rejecting unknown ids', () => {
  assert.deepEqual(normalizeOutfits(undefined), EMPTY_OUTFITS());
  assert.deepEqual(normalizeOutfits('bad'), EMPTY_OUTFITS());
  assert.deepEqual(normalizeOutfits({ yier: 'bad' }), EMPTY_OUTFITS());
  const normalized = normalizeOutfits({
    yier: { head: 'beanie', face: 'laser', neck: 'scarf', body: null, hand: 'coffee' },
    bubu: { head: 'cap', body: 'tee' },
    other: { head: 'cap' },
  });
  assert.deepEqual(normalized.yier, { head: 'beanie', face: null, neck: 'scarf', body: null, hand: 'coffee' });
  assert.deepEqual(normalized.bubu, { head: 'cap', face: null, neck: null, body: 'tee', hand: null });
});

test('each slot keeps a single item and null clears it', () => {
  const swapped = normalizeOutfits({ yier: { body: 'hoodie' } });
  assert.equal(swapped.yier.body, 'hoodie');
  const cleared = normalizeOutfits({ yier: { ...swapped.yier, body: null } });
  assert.equal(cleared.yier.body, null);
});
