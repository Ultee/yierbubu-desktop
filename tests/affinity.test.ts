import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, daysKnown, festivalFor, levelFor, normalizeAffinity, publicAffinity, startupAffinity, DAILY_CAPS } from '../src/affinity.ts';

const today = '2026-11-02';
const day = (value: string, time = '10:00:00') => new Date(`${value}T${time}`);

test('defaults are safe and broken records are rejected', () => {
  const state = normalizeAffinity(undefined, today);
  assert.equal(state.points, 0); assert.equal(state.firstMetAt, today); assert.equal(state.counters.activeDays, 1); assert.equal(state.birthday, null);
  assert.throws(() => normalizeAffinity({ version: 2 }, today));
  assert.throws(() => normalizeAffinity({ version: 1 }, today));
  assert.throws(() => normalizeAffinity({ ...state, points: -3 }, today));
  assert.throws(() => normalizeAffinity({ ...state, birthday: '13-40' }, today));
});

test('levels follow thresholds and top level has no next', () => {
  assert.equal(levelFor(0).name, '陌生');
  assert.equal(levelFor(29).name, '陌生');
  assert.equal(levelFor(30).name, '眼熟');
  assert.equal(levelFor(100).name, '搭子');
  assert.equal(levelFor(300).name, '挚友');
  assert.equal(levelFor(800).name, '离不开');
  assert.equal(levelFor(800).nextAt, null);
});

test('days known counts the first day as day one across months and years', () => {
  assert.equal(daysKnown('2026-11-02', '2026-11-02'), 1);
  assert.equal(daysKnown('2026-10-30', '2026-11-02'), 4);
  assert.equal(daysKnown('2025-11-02', '2026-11-02'), 366);
});

test('click points are capped per day and reset on a new day', () => {
  let state = normalizeAffinity(undefined, today);
  for (let i = 0; i < 40; i++) state = applyEvent(state, 'click', { action: 'heart' }, day(today)).state;
  assert.equal(state.points, DAILY_CAPS.click);
  assert.equal(state.counters.clicks, 40);
  assert.equal(state.achievements.includes('actions_all'), false);
  state = applyEvent(state, 'click', {}, day('2026-11-03')).state;
  assert.equal(state.daily.date, '2026-11-03');
  assert.equal(state.points, DAILY_CAPS.click + 1);
  assert.equal(state.daily.click, 1);
});

test('pat ticks and chats are capped while counters keep counting', () => {
  let state = normalizeAffinity(undefined, today);
  for (let i = 0; i < 30; i++) state = applyEvent(state, 'pat-tick', {}, day(today)).state;
  assert.equal(state.daily.pat, DAILY_CAPS.pat);
  assert.equal(state.counters.pats, 30);
  assert.ok(state.achievements.includes('first_pat'));
  for (let i = 0; i < 15; i++) state = applyEvent(state, 'chat', {}, day(today)).state;
  assert.equal(state.daily.chat, DAILY_CAPS.chat);
  assert.equal(state.counters.chats, 15);
  assert.ok(state.achievements.includes('chat_first'));
});

test('egg limits, rare cooldown and unknown eggs', () => {
  let state = normalizeAffinity(undefined, today);
  const first = applyEvent(state, 'egg', { egg: 'purr' }, day(today));
  assert.equal(first.accepted, true); assert.equal(first.gained, 5);
  const again = applyEvent(first.state, 'egg', { egg: 'purr' }, day(today));
  assert.equal(again.accepted, false);
  assert.equal(applyEvent(again.state, 'egg', { egg: 'unknown' }, day(today)).accepted, false);
  const rare = applyEvent(again.state, 'egg', { egg: 'daze' }, day(today, '10:05:00'));
  assert.equal(rare.accepted, true);
  const tooSoon = applyEvent(rare.state, 'egg', { egg: 'tail' }, day(today, '10:06:00'));
  assert.equal(tooSoon.accepted, false);
  const later = applyEvent(tooSoon.state, 'egg', { egg: 'tail' }, day(today, '10:20:00'));
  assert.equal(later.accepted, true);
});

test('startup awards the daily bonus once and unlocks day milestones', () => {
  const created = normalizeAffinity(undefined, '2026-10-27');
  const sameDay = startupAffinity(created, day('2026-10-27'));
  assert.equal(sameDay.gained, 0);
  const nextWeek = startupAffinity(sameDay.state, day('2026-11-02'));
  assert.equal(nextWeek.gained, 5);
  assert.equal(nextWeek.state.counters.activeDays, 2);
  assert.ok(nextWeek.achievements.includes('days_7'));
  const repeat = startupAffinity(nextWeek.state, day('2026-11-02', '18:00:00'));
  assert.equal(repeat.gained, 0);
  assert.deepEqual(repeat.achievements, []);
});

test('feeding grants points up to the daily limit and resets next day', () => {
  let state = normalizeAffinity(undefined, today);
  for (let i = 0; i < 3; i++) state = applyEvent(state, 'feed', {}, day(today)).state;
  assert.equal(state.daily.feeds, 3);
  assert.equal(state.points, 9);
  assert.equal(state.counters.feeds, 3);
  const fourth = applyEvent(state, 'feed', {}, day(today));
  assert.equal(fourth.accepted, true);
  const fifth = applyEvent(fourth.state, 'feed', {}, day(today));
  assert.equal(fifth.accepted, true);
  const sixth = applyEvent(fifth.state, 'feed', {}, day(today));
  assert.equal(sixth.accepted, false);
  assert.equal(sixth.gained, 0);
  assert.equal(sixth.state.daily.feeds, DAILY_CAPS.feeds);
  const nextDay = applyEvent(sixth.state, 'feed', {}, day('2026-11-03'));
  assert.equal(nextDay.accepted, true);
  assert.equal(nextDay.state.daily.feeds, 1);
});

test('affinity files from older versions gain feeding defaults', () => {
  const legacy = normalizeAffinity(undefined, today);
  const raw = JSON.parse(JSON.stringify(legacy));
  delete raw.daily.feeds;
  delete raw.counters.feeds;
  const restored = normalizeAffinity(raw, today);
  assert.equal(restored.daily.feeds, 0);
  assert.equal(restored.counters.feeds, 0);
});

test('birthday and festival detection', () => {
  const base = normalizeAffinity(undefined, today);
  assert.equal(festivalFor(base, '2026-11-02'), null);
  assert.equal(festivalFor({ ...base, birthday: '11-02' }, '2026-11-02'), 'birthday');
  assert.equal(festivalFor(base, '2026-01-01'), 'festival');
  assert.equal(festivalFor(base, '2026-02-17'), 'festival');
});

test('public state exposes level, days, progress and achievements', () => {
  const state = applyEvent(normalizeAffinity(undefined, '2026-10-27'), 'pat-tick', {}, day(today)).state;
  const pub = publicAffinity(state, '', day(today));
  assert.equal(pub.level, 1); assert.equal(pub.days, 7); assert.equal(pub.todayGained, 1);
  assert.equal(pub.achievements.length, 12);
  assert.equal(pub.achievements.find(item => item.id === 'first_pat')?.unlocked, true);
  assert.equal(pub.achievements.find(item => item.id === 'days_7')?.unlocked, true);
});
