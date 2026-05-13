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
function createInitialData() {
  return {
    users: [{ name: 'Göksel', username: 'goksel', password: '1234' }],
    creatures: getDefaultCreatures().map(item => ({ ...item, lastTime: null, killedBy: null }))
  };
}
function ensureDataShape(data) {
  const initial = createInitialData();
  const users = Array.isArray(data.users) ? data.users : initial.users;
  const creatures = Array.isArray(data.creatures) ? data.creatures : [];
  const byName = new Map(creatures.map(item => [item.name, item]));
  const ordered = getDefaultCreatures().map(base => ({
    ...base,
    lastTime: byName.get(base.name)?.lastTime || null,
    killedBy: byName.get(base.name)?.killedBy || null
  }));
  creatures.forEach(item => {
    if (!ordered.some(base => base.name === item.name)) ordered.push({ ...item, group: item.group || 'Dungeon' });
  });
  return { users, creatures: ordered };
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
  return sessions.get(getToken(req)) || null;
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
      sessions.set(token, { name: found.name, username: found.username });
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
      return sendJson(res, 200, { user: publicUser(user), users: data.users.map(publicUser), creatures: data.creatures });
    }
    if (req.method === 'POST' && url.pathname === '/api/users') {
      const body = await readBody(req);
      const created = addUser(data, body, user);
      saveData(data);
      return sendJson(res, 200, { user: created, users: data.users.map(publicUser) });
    }
    if (req.method === 'POST' && url.pathname === '/api/creatures') {
      const body = await readBody(req);
      const name = String(body.name || '').trim();
      if (!name) return sendJson(res, 400, { error: 'İsim yaz' });
      data.creatures.push({ name, group: cleanText(name).includes('chest') ? 'Sandıklar' : 'Dungeon', lastTime: null, killedBy: null });
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
    const timeMatch = url.pathname.match(/^\/api\/creatures\/(\d+)\/time$/);
    if (req.method === 'POST' && timeMatch) {
      const body = await readBody(req);
      const index = Number(timeMatch[1]);
      if (!data.creatures[index]) return sendJson(res, 404, { error: 'Bulunamadı' });
      data.creatures[index].lastTime = body.value ? new Date(body.value).toISOString() : null;
      data.creatures[index].killedBy = body.value ? data.creatures[index].killedBy : null;
      saveData(data);
      return sendJson(res, 200, { creature: data.creatures[index] });
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
module.exports = { createInitialData, getDefaultCreatures, getStatus, addUser, canCreateAccount, startServer };
