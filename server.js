const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
const sessions = new Map();

function cleanText(value = '') {
  return String(value).trim().toLocaleLowerCase('tr-TR').replaceAll('ö', 'o');
}
function formatDuration(totalMinutes) {
  const mins = Math.max(0, Math.floor(totalMinutes));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} saat ${m} dk`;
  if (h > 0) return `${h} saat`;
  return `${m} dk`;
}
function getStatus(lastTimeIso, nowDate = new Date(), group = 'Dungeon') {
  if (!lastTimeIso) return { label: 'Bilgi yok', color: 'unknown', detail: 'Zaman girilmedi' };
  const last = new Date(lastTimeIso);
  const passed = Math.max(0, Math.floor((nowDate - last) / 60000));
  const firstWait = group === 'Golem' ? 120 : 60;
  const randomEnd = firstWait + 60;
  if (passed < firstWait) return { label: 'Çıkmaz', color: 'safe', detail: `${firstWait - passed} dk sonra aralığa girer` };
  if (passed < randomEnd) return { label: 'Aralıkta', color: 'random', detail: `${randomEnd - passed} dk içinde çıkabilir` };
  return { label: 'Çıkmış olabilir', color: 'ready', detail: `${formatDuration(passed)} önce` };
}
function getDefaultCreatures() {
  return [
    { name: 'Wrong Chest', group: 'Sandıklar' },
    { name: 'Deceit Chest', group: 'Sandıklar' },
    { name: 'Shame Chest', group: 'Sandıklar' },
    { name: 'Despise Chest', group: 'Sandıklar' },
    { name: 'Destard', group: 'Dungeon' },
    { name: 'Deceit', group: 'Dungeon' },
    { name: 'Shame', group: 'Dungeon' },
    { name: 'Fire', group: 'Dungeon' },
    { name: 'Hythloth', group: 'Dungeon' },
    { name: 'Terathan', group: 'Dungeon' },
    { name: 'Despise', group: 'Dungeon' },
    { name: 'Wrong', group: 'Dungeon' },
    { name: 'Ice Dungeon', group: 'Dungeon' },
    { name: 'Covetous', group: 'Dungeon' },
    { name: 'Golem 1', group: 'Golem' },
    { name: 'Golem 2', group: 'Golem' },
    { name: 'Golem 3', group: 'Golem' }
  ];
}
function getDefaultQuests() {
  return ['Britain', 'Moonglow', 'Trinsic', 'Vesper', 'Yew', 'Jhelom', 'Minoc', 'Skara', 'Occlo', 'Bucs']
    .map(city => ({ city, startedBy: null, startedAt: null, result: '', resultBy: null }));
}
function getQuestWeekStart(nowDate = new Date()) {
  const date = new Date(nowDate);
  const day = date.getDay();
  const daysSinceTuesday = (day + 5) % 7;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysSinceTuesday);
  return date.toISOString().slice(0, 10);
}
function resetWeeklyQuests(data, nowDate = new Date()) {
  const week = getQuestWeekStart(nowDate);
  if (data.questWeekStart !== week) {
    data.questWeekStart = week;
    data.quests = getDefaultQuests();
  }
  return data.quests;
}
function createInitialData() {
  return {
    users: [{ name: 'Göksel', username: 'goksel', password: '1234' }],
    creatures: getDefaultCreatures().map(item => ({ ...item, lastTime: null, killedBy: null })),
    deletedNames: [],
    questWeekStart: getQuestWeekStart(),
    quests: getDefaultQuests()
  };
}
function ensureDataShape(data) {
  const initial = createInitialData();
  const users = Array.isArray(data.users) ? data.users : initial.users;
  const creatures = Array.isArray(data.creatures) ? data.creatures : [];
  const deletedNames = Array.isArray(data.deletedNames) ? data.deletedNames : [];
  const byName = new Map(creatures.map(item => [item.name, item]));
  const ordered = getDefaultCreatures()
    .filter(base => !deletedNames.includes(base.name))
    .map(base => ({
      ...base,
      lastTime: byName.get(base.name)?.lastTime || null,
      killedBy: byName.get(base.name)?.killedBy || null
    }));
  creatures.forEach(item => {
    if (!ordered.some(base => base.name === item.name) && !deletedNames.includes(item.name)) ordered.push({ ...item, group: item.group || 'Dungeon' });
  });
  const questWeekStart = data.questWeekStart || getQuestWeekStart();
  const savedQuests = Array.isArray(data.quests) ? data.quests : [];
  const questByCity = new Map(savedQuests.map(item => [item.city, item]));
  const quests = getDefaultQuests().map(base => ({ ...base, ...(questByCity.get(base.city) || {}) }));
  const shaped = { users, creatures: ordered, deletedNames, questWeekStart, quests };
  resetWeeklyQuests(shaped);
  return shaped;
}
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return createInitialData();
  try { return ensureDataShape(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))); }
  catch { return createInitialData(); }
}
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(ensureDataShape(data), null, 2));
}
function canCreateAccount(user) {
  return !!user && cleanText(user.username) === 'goksel';
}
function addUser(data, user, currentUser) {
  if (!canCreateAccount(currentUser)) throw new Error('Yetki yok');
  const name = String(user.name || '').trim();
  const username = String(user.username || '').trim();
  const password = String(user.password || '').trim();
  if (!name || !username || !password) throw new Error('Eksik bilgi var');
  if (data.users.some(item => cleanText(item.username) === cleanText(username))) throw new Error('Bu kullanıcı adı zaten var');
  data.users.push({ name, username, password });
  return { name, username };
}
function getGroupForName(name) {
  const clean = cleanText(name);
  if (clean.includes('chest')) return 'Sandıklar';
  if (clean.includes('golem')) return 'Golem';
  return 'Dungeon';
}
function deleteCreature(data, index, currentUser) {
  if (!canCreateAccount(currentUser)) throw new Error('Yetki yok');
  if (!data.creatures[index]) throw new Error('Bulunamadı');
  const [removed] = data.creatures.splice(index, 1);
  if (getDefaultCreatures().some(item => item.name === removed.name)) {
    data.deletedNames = Array.isArray(data.deletedNames) ? data.deletedNames : [];
    if (!data.deletedNames.includes(removed.name)) data.deletedNames.push(removed.name);
  }
  return removed;
}
function deleteUser(data, username, currentUser) {
  if (!canCreateAccount(currentUser)) throw new Error('Yetki yok');
  const target = String(username || '').trim();
  if (!target) throw new Error('Kullanıcı yok');
  if (cleanText(target) === 'goksel') throw new Error('Göksel hesabı silinemez');
  const index = data.users.findIndex(user => cleanText(user.username) === cleanText(target));
  if (index === -1) throw new Error('Kullanıcı bulunamadı');
  const [removed] = data.users.splice(index, 1);
  return publicUser(removed);
}
function updateUser(data, username, changes, currentUser) {
  if (!canCreateAccount(currentUser)) throw new Error('Yetki yok');
  const target = String(username || '').trim();
  const index = data.users.findIndex(user => cleanText(user.username) === cleanText(target));
  if (index === -1) throw new Error('Kullanıcı bulunamadı');
  const user = data.users[index];
  const nextName = String(changes.name ?? user.name).trim();
  const nextUsername = String(changes.username ?? user.username).trim();
  const nextPassword = String(changes.password ?? '').trim();
  if (!nextName || !nextUsername) throw new Error('Eksik bilgi var');
  if (cleanText(user.username) === 'goksel' && cleanText(nextUsername) !== 'goksel') throw new Error('Göksel kullanıcı adı değişemez');
  if (data.users.some((item, itemIndex) => itemIndex !== index && cleanText(item.username) === cleanText(nextUsername))) throw new Error('Bu kullanıcı adı zaten var');
  user.name = nextName;
  user.username = nextUsername;
  if (nextPassword) user.password = nextPassword;
  return publicUser(user);
}
function getOnlineUsers(sessionUsers) {
  const seen = new Set();
  const list = [];
  for (const user of sessionUsers) {
    if (!user || seen.has(cleanText(user.username))) continue;
    seen.add(cleanText(user.username));
    list.push(publicUser(user));
  }
  return list;
}
function parseTimeValue(value, nowDate = new Date()) {
  if (!value) return null;
  const text = String(value).trim();
  const hourOnly = text.match(/^\d{1,2}$/);
  if (hourOnly) {
    const hours = Number(text);
    if (hours > 23) throw new Error('Saat hatalı');
    const date = new Date(nowDate);
    date.setHours(hours, 0, 0, 0);
    if (date > nowDate) date.setDate(date.getDate() - 1);
    return date;
  }
  const timeOnly = text.match(/^(\d{1,2}):(\d{2})$/);
  if (timeOnly) {
    const hours = Number(timeOnly[1]);
    const minutes = Number(timeOnly[2]);
    if (hours > 23 || minutes > 59) throw new Error('Saat hatalı');
    const date = new Date(nowDate);
    date.setHours(hours, minutes, 0, 0);
    if (date > nowDate) date.setDate(date.getDate() - 1);
    return date;
  }
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) throw new Error('Saat hatalı');
  return date;
}
function setCreatureTime(data, index, value, currentUser, nowDate = new Date()) {
  if (!data.creatures[index]) throw new Error('Bulunamadı');
  const parsed = parseTimeValue(value, nowDate);
  data.creatures[index].lastTime = parsed ? parsed.toISOString() : null;
  data.creatures[index].killedBy = parsed ? currentUser.name : null;
  return data.creatures[index];
}
function findQuest(data, city) {
  resetWeeklyQuests(data);
  const cleanCity = String(city || '').trim().toLocaleLowerCase('tr-TR');
  const quest = data.quests.find(item => item.city.toLocaleLowerCase('tr-TR') === cleanCity);
  if (!quest) throw new Error('Şehir bulunamadı');
  return quest;
}
function startQuest(data, city, currentUser, nowDate = new Date()) {
  resetWeeklyQuests(data, nowDate);
  const quest = findQuest(data, city);
  quest.startedBy = currentUser.name;
  quest.startedAt = nowDate.toISOString();
  quest.result = quest.result || '';
  quest.resultBy = quest.resultBy || null;
  return quest;
}
function setQuestResult(data, city, result, currentUser) {
  const value = String(result || '').trim();
  if (!['', 'Tek map', 'Çift map'].includes(value)) throw new Error('Sonuç hatalı');
  const quest = findQuest(data, city);
  quest.result = value;
  quest.resultBy = value ? currentUser.name : null;
  return quest;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; if (body.length > 1_000_000) req.destroy(); });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch (e) { reject(e); } });
  });
}
function sendJson(res, status, data) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}
function getToken(req) {
  const cookie = req.headers.cookie || '';
  const match = cookie.match(/(?:^|; )token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}
function getSessionUser(req) {
  const token = getToken(req);
  const user = sessions.get(token) || null;
  if (user) user.lastSeen = Date.now();
  return user;
}
function publicUser(user) {
  return user ? { name: user.name, username: user.username, isAdmin: canCreateAccount(user) } : null;
}
function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rawPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = path.normalize(path.join(PUBLIC_DIR, rawPath));
  if (!filePath.startsWith(PUBLIC_DIR)) return sendJson(res, 403, { error: 'Yok' });
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(res, 404, { error: 'Bulunamadı' });
  const ext = path.extname(filePath);
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8' };
  res.writeHead(200, { 'content-type': types[ext] || 'application/octet-stream' });
  fs.createReadStream(filePath).pipe(res);
}
async function handleApi(req, res) {
  const data = loadData();
  const user = getSessionUser(req);
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (req.method === 'POST' && url.pathname === '/api/login') {
      const body = await readBody(req);
      const found = data.users.find(item => cleanText(item.username) === cleanText(body.username) && item.password === String(body.password || '').trim());
      if (!found) return sendJson(res, 401, { error: 'Giriş olmadı' });
      const token = crypto.randomBytes(24).toString('hex');
      sessions.set(token, { name: found.name, username: found.username, lastSeen: Date.now() });
      res.setHeader('set-cookie', `token=${token}; Path=/; HttpOnly; SameSite=Lax`);
      return sendJson(res, 200, { user: publicUser(found) });
    }
    if (req.method === 'POST' && url.pathname === '/api/logout') {
      sessions.delete(getToken(req));
      res.setHeader('set-cookie', 'token=; Path=/; Max-Age=0');
      return sendJson(res, 200, { ok: true });
    }
    if (url.pathname === '/api/me') return sendJson(res, 200, { user: publicUser(user) });
    if (!user) return sendJson(res, 401, { error: 'Giriş gerekli' });
    if (req.method === 'GET' && url.pathname === '/api/state') {
      return sendJson(res, 200, { user: publicUser(user), users: data.users.map(publicUser), creatures: data.creatures, quests: data.quests });
    }
    if (req.method === 'POST' && url.pathname === '/api/users') {
      const body = await readBody(req);
      const created = addUser(data, body, user);
      saveData(data);
      return sendJson(res, 200, { user: created, users: data.users.map(publicUser) });
    }
    if (req.method === 'GET' && url.pathname === '/api/online') {
      if (!canCreateAccount(user)) throw new Error('Yetki yok');
      const fresh = [...sessions.values()].filter(item => Date.now() - (item.lastSeen || 0) < 5 * 60 * 1000);
      return sendJson(res, 200, { users: getOnlineUsers(fresh) });
    }
    if (req.method === 'POST' && url.pathname === '/api/creatures') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: 'İsim yaz' });
      data.creatures.push({ name, group: getGroupForName(name), lastTime: null, killedBy: null });
      saveData(data);
      return sendJson(res, 200, { creatures: data.creatures });
    }
    const markMatch = url.pathname.match(/^\/api\/creatures\/(\d+)\/mark$/);
    if (req.method === 'POST' && markMatch) {
      const index = Number(markMatch[1]);
      if (!data.creatures[index]) return sendJson(res, 404, { error: 'Bulunamadı' });
      data.creatures[index].lastTime = new Date().toISOString();
      data.creatures[index].killedBy = user.name;
      saveData(data);
      return sendJson(res, 200, { creature: data.creatures[index] });
    }
    const userUpdateMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (req.method === 'PUT' && userUpdateMatch) {
      const oldUsername = decodeURIComponent(userUpdateMatch[1]);
      const body = await readBody(req);
      const updated = updateUser(data, oldUsername, body, user);
      for (const sessionUser of sessions.values()) {
        if (cleanText(sessionUser.username) === cleanText(oldUsername)) {
          sessionUser.name = updated.name;
          sessionUser.username = updated.username;
        }
      }
      saveData(data);
      return sendJson(res, 200, { user: updated, users: data.users.map(publicUser) });
    }
    const userDeleteMatch = url.pathname.match(/^\/api\/users\/([^/]+)$/);
    if (req.method === 'DELETE' && userDeleteMatch) {
      const removed = deleteUser(data, decodeURIComponent(userDeleteMatch[1]), user);
      saveData(data);
      return sendJson(res, 200, { removed, users: data.users.map(publicUser) });
    }
    const deleteMatch = url.pathname.match(/^\/api\/creatures\/(\d+)$/);
    if (req.method === 'DELETE' && deleteMatch) {
      const index = Number(deleteMatch[1]);
      const removed = deleteCreature(data, index, user);
      saveData(data);
      return sendJson(res, 200, { removed, creatures: data.creatures });
    }
    const timeMatch = url.pathname.match(/^\/api\/creatures\/(\d+)\/time$/);
    if (req.method === 'POST' && timeMatch) {
      const body = await readBody(req);
      const index = Number(timeMatch[1]);
      if (!data.creatures[index]) return sendJson(res, 404, { error: 'Bulunamadı' });
      const creature = setCreatureTime(data, index, body.value, user);
      saveData(data);
      return sendJson(res, 200, { creature });
    }
    const questStartMatch = url.pathname.match(/^\/api\/quests\/([^/]+)\/start$/);
    if (req.method === 'POST' && questStartMatch) {
      const quest = startQuest(data, decodeURIComponent(questStartMatch[1]), user);
      saveData(data);
      return sendJson(res, 200, { quest, quests: data.quests });
    }
    const questResultMatch = url.pathname.match(/^\/api\/quests\/([^/]+)\/result$/);
    if (req.method === 'POST' && questResultMatch) {
      const body = await readBody(req);
      const quest = setQuestResult(data, decodeURIComponent(questResultMatch[1]), body.result, user);
      saveData(data);
      return sendJson(res, 200, { quest, quests: data.quests });
    }
    return sendJson(res, 404, { error: 'Bulunamadı' });
  } catch (error) {
    return sendJson(res, 400, { error: error.message || 'Bir sorun oldu' });
  }
}
function startServer(port = PORT) {
  saveData(loadData());
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/api/')) return handleApi(req, res);
    return serveStatic(req, res);
  });
  server.listen(port, () => console.log(`Site hazır: http://localhost:${port}`));
  return server;
}
if (require.main === module) startServer();
module.exports = { createInitialData, getDefaultCreatures, getStatus, addUser, canCreateAccount, deleteCreature, setCreatureTime, deleteUser, updateUser, getOnlineUsers, getDefaultQuests, startQuest, setQuestResult, resetWeeklyQuests, startServer };
