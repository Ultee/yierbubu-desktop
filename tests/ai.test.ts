import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCipheriv, createDecipheriv } from 'node:crypto';
import { normalizeAIConfig, PROVIDERS } from '../src/ai-config.ts';
import { AiService } from '../src/ai-service.ts';
import { snapshot } from '../src/core.ts';

// A real reversible cipher substitute exercises the encryption boundary without Electron.
const cipher = {
  available: () => true,
  encrypt(text: string) { const c = createCipheriv('aes-256-cbc', Buffer.alloc(32, 7), Buffer.alloc(16, 3)); return Buffer.concat([c.update(text), c.final()]); },
  decrypt(data: Buffer) { const c = createDecipheriv('aes-256-cbc', Buffer.alloc(32, 7), Buffer.alloc(16, 3)); return Buffer.concat([c.update(data), c.final()]).toString(); },
};
const wage = { version: 1 as const, salaryCents: 87654321, weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '18:00', lunch: null, overrides: {} };
const context = { config: wage, snapshot: snapshot(wage, new Date(2026, 9, 30, 12)) };
const temporary = () => mkdtempSync(join(tmpdir(), 'salary-pet-ai-'));
async function server(handler: (req: IncomingMessage, res: ServerResponse, body: any) => void) {
  const instance = createServer(async (req, res) => { let body = ''; for await (const part of req) body += part; handler(req, res, body ? JSON.parse(body) : null); });
  await new Promise<void>(resolve => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  if (!address || typeof address === 'string') throw new Error('address');
  return { url: `http://127.0.0.1:${address.port}/v1`, close: async () => { instance.closeAllConnections(); await new Promise<void>(resolve => instance.close(() => resolve())); } };
}
const reply = (res: ServerResponse, text = '我在这里陪着你。') => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: text } }] })); };
const draft = (baseUrl: string, extra: object = {}) => ({ enabled: true, provider: 'custom', baseUrl, model: 'local-test', ...extra });

test('configuration defaults are private and provider/persona choices normalize safely', () => {
  const c = normalizeAIConfig(undefined);
  assert.equal(c.enabled, false); assert.equal(c.memory, false); assert.equal(c.shareIncome, false); assert.equal(c.proactive, 'off'); assert.equal(c.persona, 'gentle');
  assert.deepEqual(PROVIDERS.map(p => p.id), ['openai', 'deepseek', 'qwen', 'custom']);
  assert.equal(normalizeAIConfig({ provider: 'deepseek' }).model, 'deepseek-chat');
  assert.equal(normalizeAIConfig({ provider: 'qwen' }).baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
  for (const persona of ['gentle', 'cute', 'snarky', 'worker']) assert.equal(normalizeAIConfig({ persona }).persona, persona);
  assert.equal(normalizeAIConfig({ nickname: '  小雨  ', personaMode: 'custom', customPrompt: ' 陪我聊天 ' }).customPrompt, '陪我聊天');
  assert.equal(normalizeAIConfig({ nickname: '😀'.repeat(30) }).nickname.length, 60);
});

test('configuration rejects malformed input, unsafe endpoints and excessive or mistyped fields', () => {
  for (const input of [null, [], 'x', { enabled: 'false' }, { memory: 1 }, { provider: 'other' }, { persona: 'other' }, { proactive: 'often' }, { personaMode: 'other' }, { nickname: '啊'.repeat(31) }, { customPrompt: 'x'.repeat(4001) }, { model: '' }, { model: 'x\ny' }, { baseUrl: 'http://example.com/v1' }, { baseUrl: 'ftp://127.0.0.1' }, { baseUrl: 'https://user:secret@example.com' }, { baseUrl: 'https://example.com?key=secret' }, { baseUrl: 'https://example.com/#secret' }, { baseUrl: 123 }]) assert.throws(() => normalizeAIConfig(input));
  for (const baseUrl of ['https://api.example.com/v1/', 'http://127.0.0.1:8080/v1', 'http://localhost:8080', 'http://[::1]:8080/v1']) assert.ok(normalizeAIConfig({ baseUrl }).baseUrl);
});

test('key is encrypted on disk, absent from public state and retained by empty input across restart', () => {
  const dir = temporary();
  try {
    writeFileSync(join(dir, 'settings.json'), '{"legacy":true}');
    const service = new AiService(dir, cipher);
    assert.equal(service.getState().hasKey, false);
    service.save(draft('http://127.0.0.1:9999/v1'), 'fake-secret-key');
    const disk = readdirSync(dir).map(file => readFileSync(join(dir, file), 'utf8')).join('');
    assert.equal(disk.includes('fake-secret-key'), false);
    assert.equal(JSON.stringify(service.getState()).includes('key'), false);
    service.save(service.getState().config, '');
    const restarted = new AiService(dir, cipher);
    assert.equal(restarted.getState().hasKey, true);
    assert.equal(readFileSync(join(dir, 'settings.json'), 'utf8'), '{"legacy":true}');
    restarted.save(restarted.getState().config, '', true);
    assert.equal(new AiService(dir, cipher).getState().hasKey, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('encryption unavailable refuses plaintext persistence and unreadable storage gives a safe warning', () => {
  const dir = temporary();
  try {
    const service = new AiService(dir, { ...cipher, available: () => false });
    assert.throws(() => service.save(draft('http://127.0.0.1:9999'), 'fake-secret-key'), /加密|安全/);
    assert.equal(service.getState().hasKey, false);
    assert.equal(readdirSync(dir).length, 0);
    writeFileSync(join(dir, 'ai-settings.json'), '{broken fake-secret-key');
    const corrupt = new AiService(dir, cipher);
    assert.match(corrupt.getState().warning, /读取|损坏/);
    assert.equal(JSON.stringify(corrupt.getState()).includes('fake-secret-key'), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('retained key cannot be sent to an edited endpoint without explicit reentry', async () => {
  const dir = temporary(); let calls = 0;
  const fake = await server((_req, res) => { calls++; reply(res); });
  try {
    const service = new AiService(dir, cipher);
    service.save(draft('http://127.0.0.1:9999/v1'), 'fake-secret-key');
    assert.throws(() => service.save(draft(fake.url)), /密钥|接口/);
    assert.equal((await service.test(draft(fake.url))).ok, false); assert.equal(calls, 0);
    assert.equal((await service.test(draft(fake.url), 'fake-reentered-key')).ok, true);
    assert.equal(service.getState().config.baseUrl, 'http://127.0.0.1:9999/v1');
    service.save(draft(fake.url), 'fake-reentered-key');
    assert.equal((await service.send('你好', context)).ok, true);
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('real HTTP request uses bearer auth, selected model/persona and only status without income consent', async () => {
  const dir = temporary(); const requests: { req: IncomingMessage; body: any }[] = [];
  const fake = await server((req, res, body) => { requests.push({ req, body }); reply(res); });
  try {
    const service = new AiService(dir, cipher);
    service.save(draft(fake.url, { nickname: '小雨', personaMode: 'custom', customPrompt: '请温柔地陪伴。' }), 'fake-local-key');
    assert.deepEqual(await service.send('今天有点累', context), { ok: true, text: '我在这里陪着你。' });
    const { req, body } = requests[0];
    assert.equal(req.method, 'POST'); assert.equal(req.url, '/v1/chat/completions'); assert.equal(req.headers.authorization, 'Bearer fake-local-key');
    assert.equal(body.model, 'local-test'); assert.equal(body.stream, false);
    assert.match(body.messages[0].content, /小雨/); assert.match(body.messages[0].content, /请温柔地陪伴/); assert.match(body.messages[0].content, /working/);
    assert.equal(JSON.stringify(body).includes('87654321'), false);
    for (const forbidden of ['salaryCents', 'earnedCents', 'remainingSeconds', 'monthSeconds', 'start', 'weekdays', '09:00']) assert.equal(JSON.stringify(body).includes(forbidden), false, forbidden);
    assert.deepEqual(body.messages.at(-1), { role: 'user', content: '今天有点累' });
    assert.equal(service.getHistory().length, 2);
    service.save({ ...service.getState().config, shareIncome: true });
    await service.send('现在呢', context);
    assert.match(JSON.stringify(requests[1].body), /87654321/);
    assert.match(JSON.stringify(requests[1].body), /earnedCents/);
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('memory-off transcript is visible locally but never sent again or persisted', async () => {
  const dir = temporary(); const payloads: any[] = [];
  const fake = await server((_req, res, body) => { payloads.push(body); reply(res); });
  try {
    const service = new AiService(dir, cipher); service.save(draft(fake.url), 'fake-local-key');
    await service.send('记住这句临时话', context); await service.send('第二句', context);
    assert.equal(service.getHistory().length, 4);
    assert.equal(JSON.stringify(payloads[1]).includes('记住这句临时话'), false);
    assert.equal(readdirSync(dir).map(file => readFileSync(join(dir, file), 'utf8')).join('').includes('记住这句临时话'), false);
    assert.deepEqual(new AiService(dir, cipher).getHistory(), []);
    const copy = service.getHistory(); copy[0].content = '篡改'; assert.equal(service.getHistory()[0].content, '记住这句临时话');
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('memory keeps forty messages, sends recent twenty and clears on revoke, disable or clear', async () => {
  const dir = temporary(); const payloads: any[] = [];
  const fake = await server((_req, res, body) => { payloads.push(body); reply(res, '回复'); });
  try {
    let service = new AiService(dir, cipher); service.save(draft(fake.url, { memory: true, shareIncome: true }), 'fake-local-key');
    for (let i = 0; i < 22; i++) assert.equal((await service.send(`消息${i}`, context)).ok, true);
    assert.equal(service.getHistory().length, 40); assert.equal(service.getHistory()[0].content, '消息2');
    assert.equal(payloads[21].messages.length, 22); assert.equal(payloads[21].messages[1].content, '消息11');
    service = new AiService(dir, cipher); assert.equal(service.getHistory().length, 40);
    service.save({ ...service.getState().config, shareIncome: false });
    assert.deepEqual(service.getHistory(), []); assert.deepEqual(new AiService(dir, cipher).getHistory(), []);
    await service.send('会被清理', context); service.save({ ...service.getState().config, memory: false });
    assert.deepEqual(service.getHistory(), []); assert.deepEqual(new AiService(dir, cipher).getHistory(), []);
    service.save({ ...service.getState().config, memory: true }); await service.send('也会清理', context); service.clearHistory();
    assert.deepEqual(new AiService(dir, cipher).getHistory(), []);
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('connection test uses draft without conversation or real context and preserves saved state', async () => {
  const dir = temporary(); const payloads: any[] = [];
  const fake = await server((_req, res, body) => { payloads.push(body); reply(res); });
  try {
    const service = new AiService(dir, cipher); service.save(draft(fake.url, { memory: true }), 'fake-saved-key');
    await service.send('私密历史', context);
    const before = service.getState();
    assert.equal((await service.test(draft(fake.url, { model: 'draft-model', enabled: false }), 'fake-draft-key')).ok, true);
    assert.equal(payloads[1].model, 'draft-model'); assert.equal(JSON.stringify(payloads[1]).includes('私密历史'), false); assert.equal(JSON.stringify(payloads[1]).includes('87654321'), false);
    assert.deepEqual(service.getState(), before); assert.equal(service.getHistory().length, 2);
    assert.equal((await service.send('主动提示', context, 'proactive')).ok, true); assert.equal(service.getHistory().length, 3); assert.equal(service.getHistory().at(-1)?.role, 'assistant');
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('disabled, missing key and invalid user text cause no network calls', async () => {
  const dir = temporary(); let calls = 0;
  const fake = await server((_req, res) => { calls++; reply(res); });
  try {
    const service = new AiService(dir, cipher);
    assert.equal((await service.send('你好', context)).ok, false);
    service.save(draft(fake.url)); assert.equal((await service.send('你好', context)).ok, false);
    service.save(draft(fake.url), 'fake-key');
    for (const text of ['', ' ', 'x'.repeat(4001)]) assert.equal((await service.send(text, context)).ok, false);
    assert.equal(calls, 0);
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('HTTP errors, malformed/huge responses and redirects are redacted and never append history', async () => {
  const dir = temporary(); let mode = 'error'; let redirectCalls = 0;
  const target = await server((_req, res) => { redirectCalls++; reply(res); });
  const fake = await server((_req, res) => {
    if (mode === 'error') { res.statusCode = 401; res.end('fake-secret-key server private diagnostic'); }
    if (mode === 'redirect') { res.statusCode = 302; res.setHeader('Location', `${target.url}/chat/completions`); res.end(); }
    if (mode === 'malformed') res.end('{fake-secret-key');
    if (mode === 'empty') res.end(JSON.stringify({ choices: [{ message: { content: '' } }] }));
    if (mode === 'large') res.end('x'.repeat(1024 * 1024 + 1));
    if (mode === 'long-text') reply(res, 'x'.repeat(16001));
  });
  try {
    const service = new AiService(dir, cipher); service.save(draft(fake.url, { memory: true }), 'fake-secret-key');
    for (mode of ['error', 'redirect', 'malformed', 'empty', 'large', 'long-text']) {
      const result = await service.send('你好', context);
      assert.equal(result.ok, false, mode); assert.ok(result.error);
      assert.equal(JSON.stringify(result).includes('fake-secret-key'), false); assert.equal(JSON.stringify(result).includes('private diagnostic'), false);
      assert.deepEqual(service.getHistory(), []);
    }
    assert.equal(redirectCalls, 0);
  } finally { await fake.close(); await target.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('cancel, clear and settings changes invalidate outstanding requests; overlap is rejected', async () => {
  const dir = temporary(); let received!: () => void; let accepted = new Promise<void>(resolve => { received = resolve; });
  const fake = await server((_req, _res) => received());
  try {
    const service = new AiService(dir, cipher); service.save(draft(fake.url, { memory: true }), 'fake-key');
    for (const action of [() => service.cancel(), () => service.clearHistory(), () => service.save({ ...service.getState().config, nickname: '新称呼' })]) {
      const pending = service.send('等待', context); await accepted;
      assert.equal((await service.send('不应重叠', context)).ok, false);
      action(); const result = await pending; assert.equal(result.ok, false); assert.match(result.error!, /取消/); assert.deepEqual(service.getHistory(), []);
      accepted = new Promise<void>(resolve => { received = resolve; });
    }
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('request aborts after thirty seconds without retry or history', async t => {
  const dir = temporary(); let received!: () => void; const accepted = new Promise<void>(resolve => { received = resolve; }); let calls = 0;
  const fake = await server((_req, _res) => { calls++; received(); });
  try {
    const service = new AiService(dir, cipher); service.save(draft(fake.url), 'fake-key');
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const pending = service.send('超时', context); await accepted;
    t.mock.timers.tick(30001);
    const result = await pending; assert.equal(result.ok, false); assert.match(result.error!, /超时/); assert.equal(calls, 1); assert.deepEqual(service.getHistory(), []);
    t.mock.timers.reset();
  } finally { t.mock.timers.reset(); await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('failed atomic settings write preserves saved endpoint and credential', () => {
  const dir = temporary();
  try {
    const service = new AiService(dir, cipher);
    service.save(draft('http://127.0.0.1:9999/v1'), 'fake-original-key');
    mkdirSync(join(dir, 'ai-settings.json.tmp'));
    assert.throws(() => service.save(draft('http://127.0.0.1:9998/v1'), 'fake-replacement-key'), /保存/);
    assert.equal(service.getState().config.baseUrl, 'http://127.0.0.1:9999/v1');
    assert.equal(new AiService(dir, cipher).getState().hasKey, true);
    assert.equal(new AiService(dir, cipher).getState().config.baseUrl, 'http://127.0.0.1:9999/v1');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('preset personas reach the request and enabling memory does not adopt private temporary chat', async () => {
  const dir = temporary(); const payloads: any[] = [];
  const fake = await server((_req, res, body) => { payloads.push(body); reply(res); });
  try {
    const service = new AiService(dir, cipher); service.save(draft(fake.url), 'fake-key');
    for (const [persona, label] of [['gentle', '温柔陪伴'], ['cute', '活泼可爱'], ['snarky', '毒舌'], ['worker', '打工人嘴替']]) {
      service.save({ ...service.getState().config, persona }); await service.send('临时对话', context);
      assert.ok(payloads.at(-1).messages[0].content.includes(label));
    }
    assert.equal(service.getHistory().length, 8);
    service.save({ ...service.getState().config, memory: true });
    assert.deepEqual(service.getHistory(), []);
    await service.send('我自愿输入月薪123元', context);
    assert.equal(payloads.at(-1).messages.length, 2);
    assert.equal(payloads.at(-1).messages.at(-1).content, '我自愿输入月薪123元');
    assert.equal(readdirSync(dir).map(file => readFileSync(join(dir, file), 'utf8')).join('').includes('临时对话'), false);
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('maximum-size Chinese history remains readable after restart', async () => {
  const dir = temporary();
  const fake = await server((_req, res) => reply(res, '陪'.repeat(16000)));
  try {
    const service = new AiService(dir, cipher); service.save(draft(fake.url, { memory: true }), 'fake-key');
    for (let i = 0; i < 20; i++) assert.equal((await service.send('聊'.repeat(4000), context)).ok, true);
    assert.equal(service.getHistory().length, 40);
    const restarted = new AiService(dir, cipher);
    assert.equal(restarted.getHistory().length, 40);
    assert.equal(restarted.getState().warning, '');
  } finally { await fake.close(); rmSync(dir, { recursive: true, force: true }); }
});
