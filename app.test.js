const test = require('node:test');
const assert = require('node:assert/strict');
const { createInitialData, getStatus, addUser, canCreateAccount, getDefaultCreatures, deleteCreature, setCreatureTime, deleteUser, updateUser, getOnlineUsers } = require('./server');

test('golemler 2 saat sabit, 1 saat aralikta, 3 saat sonra hazir', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  assert.equal(getStatus(new Date(now - 90 * 60000).toISOString(), now, 'Golem').label, 'Çıkmaz');
  assert.equal(getStatus(new Date(now - 150 * 60000).toISOString(), now, 'Golem').label, 'Aralıkta');
  assert.equal(getStatus(new Date(now - 190 * 60000).toISOString(), now, 'Golem').label, 'Çıkmış olabilir');
});

test('digerleri 1 saat sabit, 1 saat aralikta, 2 saat sonra hazir', () => {
  const now = new Date('2026-01-01T12:00:00Z');
  assert.equal(getStatus(new Date(now - 30 * 60000).toISOString(), now, 'Dungeon').label, 'Çıkmaz');
  assert.equal(getStatus(new Date(now - 90 * 60000).toISOString(), now, 'Dungeon').label, 'Aralıkta');
  assert.equal(getStatus(new Date(now - 130 * 60000).toISOString(), now, 'Dungeon').label, 'Çıkmış olabilir');
});

test('sadece goksel hesap olusturabilir', () => {
  assert.equal(canCreateAccount({ username: 'goksel' }), true);
  assert.equal(canCreateAccount({ username: 'deneme' }), false);
});

test('yeni kullanici eklenir ve ayni kullanici tekrar eklenemez', () => {
  const data = createInitialData();
  addUser(data, { name: 'Deneme', username: 'deneme', password: '1111' }, { username: 'goksel' });
  assert.equal(data.users.some(u => u.username === 'deneme'), true);
  assert.throws(() => addUser(data, { name: 'Deneme 2', username: 'deneme', password: '2222' }, { username: 'goksel' }));
});

test('varsayilan listede golem satiri vardir', () => {
  const names = getDefaultCreatures().map(c => c.name);
  assert.deepEqual(names.slice(-3), ['Golem 1', 'Golem 2', 'Golem 3']);
});

test('sadece goksel yaratık silebilir', () => {
  const data = createInitialData();
  data.creatures.push({ name: 'Test Yaratık', group: 'Dungeon', lastTime: null, killedBy: null });
  assert.throws(() => deleteCreature(data, data.creatures.length - 1, { username: 'deneme' }));
  deleteCreature(data, data.creatures.length - 1, { username: 'goksel' });
  assert.equal(data.creatures.some(item => item.name === 'Test Yaratık'), false);
});

test('herkes sadece saat girerek zamanı elle girebilir', () => {
  const data = createInitialData();
  setCreatureTime(data, 0, '10:30', { name: 'Deneme', username: 'deneme' }, new Date('2026-01-01T12:00:00'));
  assert.equal(data.creatures[0].lastTime, new Date('2026-01-01T10:30:00').toISOString());
  assert.equal(data.creatures[0].killedBy, 'Deneme');
});

test('sadece saat sayısı girilirse dakika sıfır kabul edilir', () => {
  const data = createInitialData();
  setCreatureTime(data, 0, '15', { name: 'Deneme', username: 'deneme' }, new Date('2026-01-01T16:00:00'));
  assert.equal(data.creatures[0].lastTime, new Date('2026-01-01T15:00:00').toISOString());
});


test('sadece goksel kullanıcı silebilir ama kendini silemez', () => {
  const data = createInitialData();
  addUser(data, { name: 'Deneme', username: 'deneme', password: '1111' }, { username: 'goksel' });
  assert.throws(() => deleteUser(data, 'deneme', { username: 'deneme' }));
  deleteUser(data, 'deneme', { username: 'goksel' });
  assert.equal(data.users.some(user => user.username === 'deneme'), false);
  assert.throws(() => deleteUser(data, 'goksel', { username: 'goksel' }));
});


test('goksel kullanıcı bilgilerini değiştirebilir', () => {
  const data = createInitialData();
  addUser(data, { name: 'Deneme', username: 'deneme', password: '1111' }, { username: 'goksel' });
  const updated = updateUser(data, 'deneme', { name: 'Ali', username: 'ali', password: '2222' }, { username: 'goksel' });
  assert.equal(updated.name, 'Ali');
  assert.equal(updated.username, 'ali');
  assert.equal(data.users.some(user => user.username === 'deneme'), false);
  assert.equal(data.users.find(user => user.username === 'ali').password, '2222');
});

test('normal kullanıcı başkasının bilgilerini değiştiremez', () => {
  const data = createInitialData();
  addUser(data, { name: 'Deneme', username: 'deneme', password: '1111' }, { username: 'goksel' });
  assert.throws(() => updateUser(data, 'goksel', { name: 'Başka' }, { username: 'deneme' }));
});

test('online kullanıcılar tekil listelenir', () => {
  const list = getOnlineUsers([
    { name: 'Göksel', username: 'goksel' },
    { name: 'Göksel', username: 'goksel' },
    { name: 'Deneme', username: 'deneme' }
  ]);
  assert.deepEqual(list.map(user => user.username), ['goksel', 'deneme']);
});
