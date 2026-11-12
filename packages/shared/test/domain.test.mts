import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateOrder, ownershipState, parseVat, isValidIban, bankFromIban, dueDateFor, addMonths } from '../dist/index.js';

test('PRD example: 12 cartons for a Bulgarian customer', () => {
  const c = calculateOrder({ aloha: 4, gaia: 4, kyoto: 4 }, 'BG');
  assert.equal(c.totalUnits, 288);
  assert.equal(c.netCents, 148_320);
  assert.equal(c.vatCents, 29_664);
  assert.equal(c.totalCents, 177_984); // €1,779.84
  assert.equal(c.commission.netCents, 14_400); // €144.00
  assert.equal(c.commission.grossCents, 17_280); // €172.80 incl. VAT
  assert.equal(c.nextTier?.cartonsToGo, 198);
});

test('reverse charge for EU outside Bulgaria', () => {
  const c = calculateOrder({ santorini: 10 }, 'PT');
  assert.equal(c.vatCents, 0);
  assert.equal(c.reverseCharge, true);
  assert.equal(c.totalCents, c.netCents);
});

test('approved discount comes out of commission first, never below zero', () => {
  const c = calculateOrder({ aloha: 10 }, 'BG', 495); // €0.20 off per unit
  assert.equal(c.commission.netCents, 240 * 50 - 240 * 20);
  const deep = calculateOrder({ aloha: 10 }, 'BG', 400);
  assert.equal(deep.commission.netCents, 0);
  const higher = calculateOrder({ aloha: 10 }, 'BG', 600); // never raises the price
  assert.equal(higher.unitPriceCents, 515);
});

test('no cartons cannot continue', () => {
  assert.equal(calculateOrder({}, 'BG').canContinue, false);
  assert.equal(calculateOrder({ gaia: 0.7 as number }, 'BG').canContinue, false);
});

test('ownership: 6 months after last order, then free', () => {
  const now = new Date('2026-11-12T10:00:00Z');
  const recent = { ownerAgentId: 'a', lastOrderAt: '2026-08-01T00:00:00Z', ownedSince: null };
  assert.equal(ownershipState('a', recent, now), 'own');
  assert.equal(ownershipState('b', recent, now), 'other');
  const old = { ownerAgentId: 'a', lastOrderAt: '2026-03-01T00:00:00Z', ownedSince: null };
  assert.equal(ownershipState('b', old, now), 'free');
  assert.equal(ownershipState('b', { ownerAgentId: null, lastOrderAt: null, ownedSince: null }, now), 'free');
  assert.equal(addMonths(new Date('2026-05-12'), 6).toISOString().slice(0, 10), '2026-11-12');
});

test('VAT parsing', () => {
  assert.equal(parseVat('bg 203 145 882')?.full, 'BG203145882');
  assert.equal(parseVat('203145882')?.full, 'BG203145882');
  assert.equal(parseVat('GR094014201')?.full, 'EL094014201');
  assert.equal(parseVat('GR094014201')?.country, 'GR');
  assert.equal(parseVat('Sofia Rooftop Bar'), null);
  assert.equal(parseVat('US123456789'), null);
});

test('IBAN check and bank lookup', () => {
  assert.equal(isValidIban('BG80 BNBG 9661 1020 3456 78'), true);
  assert.equal(isValidIban('BG80 BNBG 9661 1020 3456 79'), false);
  assert.equal(bankFromIban('BG80BNBG96611020345678')?.bic, 'BNBGBGSD');
});

test('due on receipt waits for the 7-day stock hold', () => {
  assert.equal(dueDateFor(new Date('2026-11-02T10:00:00Z'), 0), '2026-11-09');
  assert.equal(dueDateFor(new Date('2026-09-26T10:00:00Z'), 30), '2026-10-26');
});
