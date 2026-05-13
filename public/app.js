let currentUser = null;
let users = [];
let creatures = [];

const loginEl = document.getElementById('login');
const appEl = document.getElementById('app');
const currentUserEl = document.getElementById('currentUser');
const listEl = document.getElementById('creatureList');
const errorEl = document.getElementById('loginError');
const accountCardEl = document.getElementById('accountCard');
const accountMessageEl = document.getElementById('accountMessage');
const accountListEl = document.getElementById('accountList');

function pad(n) { return String(n).padStart(2, '0'); }
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
function toInputValue(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
async function request(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'content-type': 'application/json' },
    credentials: 'same-origin',
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Bir sorun oldu');
  return data;
}
function showLogin(message = '') {
  appEl.classList.add('hidden');
  loginEl.classList.remove('hidden');
  errorEl.textContent = message;
}
function showApp() {
  loginEl.classList.add('hidden');
  appEl.classList.remove('hidden');
  currentUserEl.textContent = currentUser.name;
  accountCardEl.classList.toggle('hidden', !currentUser.isAdmin);
  renderAccounts();
  render();
}
async function loadState() {
  const data = await request('/api/state');
  currentUser = data.user;
  users = data.users;
  creatures = data.creatures;
  showApp();
}
async function login() {
  try {
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const data = await request('/api/login', { method: 'POST', body: { username, password } });
    currentUser = data.user;
    errorEl.textContent = '';
    await loadState();
  } catch (error) {
    errorEl.textContent = 'Giriş olmadı.';
  }
}
async function logout() {
  await request('/api/logout', { method: 'POST' });
  currentUser = null;
  showLogin();
}
async function createAccount() {
  try {
    const nameInput = document.getElementById('newAccountName');
    const usernameInput = document.getElementById('newAccountUsername');
    const passwordInput = document.getElementById('newAccountPassword');
    const data = await request('/api/users', { method: 'POST', body: { name: nameInput.value, username: usernameInput.value, password: passwordInput.value } });
    users = data.users;
    nameInput.value = '';
    usernameInput.value = '';
    passwordInput.value = '';
    accountMessageEl.textContent = 'Hesap oluşturuldu.';
    renderAccounts();
  } catch (error) {
    accountMessageEl.textContent = error.message;
  }
}
async function addCreature() {
  const input = document.getElementById('newCreature');
  const name = input.value.trim();
  if (!name) return;
  const data = await request('/api/creatures', { method: 'POST', body: { name } });
  creatures = data.creatures;
  input.value = '';
  render();
}
async function markKilled(index) {
  await request(`/api/creatures/${index}/mark`, { method: 'POST' });
  await loadState();
}
async function updateTime(index, value) {
  await request(`/api/creatures/${index}/time`, { method: 'POST', body: { value } });
  await loadState();
}
async function deleteCreatureItem(index) {
  if (!currentUser?.isAdmin) return;
  if (!confirm('Bunu silmek istiyor musun?')) return;
  const data = await request(`/api/creatures/${index}`, { method: 'DELETE' });
  creatures = data.creatures;
  render();
}
async function deleteUserItem(username) {
  if (!currentUser?.isAdmin) return;
  if (!confirm('Bu kullanıcı silinsin mi?')) return;
  const data = await request(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
  users = data.users;
  renderAccounts();
}
function renderAccounts() {
  accountListEl.innerHTML = '';
  users.forEach(user => {
    const item = document.createElement('div');
    item.className = 'account-row';
    const text = document.createElement('span');
    text.textContent = `${user.name} — ${user.username}${user.isAdmin ? ' — Yetkili' : ''}`;
    item.appendChild(text);
    if (currentUser?.isAdmin && user.username !== 'goksel') {
      const btn = document.createElement('button');
      btn.className = 'danger small';
      btn.textContent = 'Sil';
      btn.addEventListener('click', () => deleteUserItem(user.username));
      item.appendChild(btn);
    }
    accountListEl.appendChild(item);
  });
}
function render() {
  listEl.innerHTML = '';
  let lastGroup = '';
  creatures.forEach((creature, index) => {
    if (creature.group !== lastGroup) {
      const title = document.createElement('h2');
      title.className = 'group-title';
      title.textContent = creature.group;
      listEl.appendChild(title);
      lastGroup = creature.group;
    }
    const status = getStatus(creature.lastTime, new Date(), creature.group);
    const item = document.createElement('div');
    item.className = `creature ${status.color}`;
    const lastValue = creature.lastTime ? toInputValue(creature.lastTime) : '';
    const killedBy = creature.killedBy ? `Öldüren: ${creature.killedBy}` : 'Öldüren: -';
    item.innerHTML = `<div class="dot"></div><div class="info"><h3>${creature.name} — ${status.label}</h3><p>${status.detail}</p><p>${killedBy}</p><input type="datetime-local" value="${lastValue}" aria-label="Zaman seç" /></div><div class="actions"><button class="kill">Kesildi</button>${currentUser?.isAdmin ? '<button class="delete danger">Sil</button>' : ''}</div>`;
    item.querySelector('.kill').addEventListener('click', () => markKilled(index));
    item.querySelector('.delete')?.addEventListener('click', () => deleteCreatureItem(index));
    item.querySelector('input').addEventListener('change', e => updateTime(index, e.target.value));
    listEl.appendChild(item);
  });
}

document.getElementById('loginBtn').addEventListener('click', login);
document.getElementById('logoutBtn').addEventListener('click', logout);
document.getElementById('addBtn').addEventListener('click', addCreature);
document.getElementById('createAccountBtn').addEventListener('click', createAccount);
document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

request('/api/me').then(data => {
  if (!data.user) return showLogin();
  currentUser = data.user;
  loadState();
}).catch(() => showLogin());
setInterval(() => { if (currentUser) loadState(); }, 30000);
