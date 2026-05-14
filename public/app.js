let currentUser = null;
let users = [];
let creatures = [];
let quests = [];

const loginEl = document.getElementById('login');
const appEl = document.getElementById('app');
const currentUserEl = document.getElementById('currentUser');
const listEl = document.getElementById('creatureList');
const errorEl = document.getElementById('loginError');
const accountCardEl = document.getElementById('accountCard');
const accountMessageEl = document.getElementById('accountMessage');
const accountListEl = document.getElementById('accountList');
const onlineListEl = document.getElementById('onlineList');
const listPageEl = document.getElementById('listPage');
const usersPageEl = document.getElementById('usersPage');
const onlinePageEl = document.getElementById('onlinePage');
const listTabEl = document.getElementById('listTab');
const usersTabEl = document.getElementById('usersTab');
const onlineTabEl = document.getElementById('onlineTab');
const questTabEl = document.getElementById('questTab');
const questPageEl = document.getElementById('questPage');
const questListEl = document.getElementById('questList');

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
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  usersTabEl.classList.toggle('hidden', !currentUser.isAdmin);
  onlineTabEl.classList.toggle('hidden', !currentUser.isAdmin);
  renderAccounts();
  render();
  renderQuests();
}
function setPage(page) {
  listPageEl.classList.toggle('hidden', page !== 'list');
  usersPageEl.classList.toggle('hidden', page !== 'users');
  onlinePageEl.classList.toggle('hidden', page !== 'online');
  questPageEl.classList.toggle('hidden', page !== 'quest');
  listTabEl.classList.toggle('active', page === 'list');
  usersTabEl.classList.toggle('active', page === 'users');
  onlineTabEl.classList.toggle('active', page === 'online');
  questTabEl.classList.toggle('active', page === 'quest');
  if (page === 'online') loadOnline();
  if (page === 'quest') renderQuests();
}
async function loadState() {
  const data = await request('/api/state');
  currentUser = data.user;
  users = data.users;
  creatures = data.creatures;
  quests = data.quests || [];
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
  quests = data.quests || [];
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
  quests = data.quests || [];
  render();
}
async function deleteUserItem(username) {
  if (!currentUser?.isAdmin) return;
  if (!confirm('Bu kullanıcı silinsin mi?')) return;
  const data = await request(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
  users = data.users;
  renderAccounts();
}
async function updateUserItem(oldUsername, item) {
  if (!currentUser?.isAdmin) return;
  const name = item.querySelector('.edit-name').value;
  const username = item.querySelector('.edit-username').value;
  const password = item.querySelector('.edit-password').value;
  const data = await request(`/api/users/${encodeURIComponent(oldUsername)}`, { method: 'PUT', body: { name, username, password } });
  users = data.users;
  accountMessageEl.textContent = 'Bilgiler değiştirildi.';
  renderAccounts();
}
async function loadOnline() {
  if (!currentUser?.isAdmin) return;
  const data = await request('/api/online');
  onlineListEl.innerHTML = '';
  if (!data.users.length) {
    onlineListEl.innerHTML = '<p>Online kullanıcı yok.</p>';
    return;
  }
  data.users.forEach(user => {
    const item = document.createElement('p');
    item.textContent = `${user.name} — ${user.username}`;
    onlineListEl.appendChild(item);
  });
}
function renderAccounts() {
  accountListEl.innerHTML = '';
  users.forEach(user => {
    const item = document.createElement('div');
    item.className = 'account-edit';
    item.innerHTML = `<input class="edit-name" value="${user.name}" placeholder="İsim" />
      <input class="edit-username" value="${user.username}" placeholder="Kullanıcı adı" ${user.username === 'goksel' ? 'readonly' : ''} />
      <input class="edit-password" type="password" placeholder="Yeni parola" />
      <button class="save small">Kaydet</button>
      ${user.username !== 'goksel' ? '<button class="delete-user danger small">Sil</button>' : '<span class="admin-label">Yetkili</span>'}`;
    item.querySelector('.save').addEventListener('click', () => updateUserItem(user.username, item));
    item.querySelector('.delete-user')?.addEventListener('click', () => deleteUserItem(user.username));
    accountListEl.appendChild(item);
  });
}
async function startQuestItem(city) {
  const data = await request(`/api/quests/${encodeURIComponent(city)}/start`, { method: 'POST' });
  quests = data.quests;
  renderQuests();
}
async function updateQuestResult(city, result) {
  const data = await request(`/api/quests/${encodeURIComponent(city)}/result`, { method: 'POST', body: { result } });
  quests = data.quests;
  renderQuests();
}
function renderQuests() {
  if (!questListEl) return;
  questListEl.innerHTML = '';
  quests.forEach(quest => {
    const item = document.createElement('div');
    item.className = 'quest-row';
    const started = quest.startedBy ? `Başlayan: ${quest.startedBy}` : 'Başlayan: -';
    const result = quest.result || '';
    item.innerHTML = `<div><h3>${quest.city}</h3><p>${started}</p><p>Sonuç: ${result || '-'}</p></div>
      <div class="quest-actions">
        <button class="start-quest">Queste başladım</button>
        <select class="quest-result">
          <option value="">Sonuç yok</option>
          <option value="Tek map" ${result === 'Tek map' ? 'selected' : ''}>Tek map</option>
          <option value="Çift map" ${result === 'Çift map' ? 'selected' : ''}>Çift map</option>
        </select>
      </div>`;
    item.querySelector('.start-quest').addEventListener('click', () => startQuestItem(quest.city));
    item.querySelector('.quest-result').addEventListener('change', e => updateQuestResult(quest.city, e.target.value));
    questListEl.appendChild(item);
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
    item.innerHTML = `<div class="dot"></div><div class="info"><h3>${creature.name} — ${status.label}</h3><p>${status.detail}</p><p>${killedBy}</p><input type="text" inputmode="numeric" pattern="[0-9:]*" placeholder="15 veya 15:30" value="${lastValue}" aria-label="Saat yaz" /></div><div class="actions"><button class="kill">Kesildi</button>${currentUser?.isAdmin ? '<button class="delete danger">Sil</button>' : ''}</div>`;
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
listTabEl.addEventListener('click', () => setPage('list'));
usersTabEl.addEventListener('click', () => setPage('users'));
onlineTabEl.addEventListener('click', () => setPage('online'));
questTabEl.addEventListener('click', () => setPage('quest'));
document.getElementById('password').addEventListener('keydown', e => { if (e.key === 'Enter') login(); });

request('/api/me').then(data => {
  if (!data.user) return showLogin();
  currentUser = data.user;
  loadState();
}).catch(() => showLogin());
setInterval(() => { if (currentUser) { loadState(); if (!onlinePageEl.classList.contains('hidden')) loadOnline(); } }, 30000);
