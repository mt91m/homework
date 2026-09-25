// ============================================================
//  مدیریت تکالیف مدرسه — نسخه ۳
// ============================================================

const K = {
  TASKS: 'sd_tasks', NOTE: 'sd_note', SCHEDULE: 'sd_schedule',
  THEME: 'sd_theme', ACTIVE_TAB: 'sd_active_tab', ACTIVE_GROUP: 'sd_active_group',
  TAGS: 'sd_tags', SETTINGS: 'sd_settings', EXPANDED: 'sd_expanded_tasks',
  SUBJECT_NOTES: 'sd_subject_notes', DAILY_PREFIX: 'sd_daily_'
};

const WEEKDAYS = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];
const WEEKDAYS_6 = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه'];
const PERIODS = 6;
const PRIORITY_ORDER = { 'زیاد':0, 'متوسط':1, 'کم':2 };

const THEMES = [
  { id: 'theme-light', label: 'روشن', color: '#1e6f9f', icon: '☀️' },
  { id: 'theme-dark', label: 'تاریک', color: '#0f1720', icon: '🌙' },
  { id: 'theme-rose', label: 'صورتی', color: '#d63384', icon: '🌸' },
  { id: 'theme-emerald', label: 'سبز', color: '#10b981', icon: '🌿' },
  { id: 'theme-purple', label: 'بنفش', color: '#8b5cf6', icon: '💜' },
  { id: 'theme-sunset', label: 'نارنجی', color: '#f97316', icon: '🌅' },
  { id: 'theme-sky', label: 'آبی', color: '#0ea5e9', icon: '☁️' },
  { id: 'theme-slate', label: 'خاکستری', color: '#475569', icon: '⚫' }
];

let tasks = [];
let subjectNotes = {};
let editingId = null;
let currentSubtab = 'all';
let currentCalYear = 0;
let currentCalMonth = 0;
let currentCalDay = null;
let currentFormStep = 1;
let formSubtasks = [];
let formTags = [];
let allTags = [];
let lastDeletedTask = null;
let expandedTasks = new Set();
let currentSubjectPage = null;
let currentDailyDate = null;

// ============================================================
//  تاریخ شمسی
// ============================================================
function gregorianToShamsi(gy, gm, gd) {
  const gdm = [0,31,59,90,120,151,181,212,243,273,304,334];
  let jy = (gy <= 1600) ? 0 : 979;
  gy -= (gy <= 1600) ? 621 : 1600;
  const gy2 = (gm > 2) ? (gy + 1) : gy;
  let days = (365*gy) + Math.floor((gy2+3)/4) - Math.floor((gy2+99)/100) + Math.floor((gy2+399)/400) - 80 + gd + gdm[gm-1];
  jy += 33 * Math.floor(days/12053); days %= 12053;
  jy += 4 * Math.floor(days/1461); days %= 1461;
  if (days > 365) { jy += Math.floor((days-1)/365); days = (days-1)%365; }
  const jm = (days < 186) ? 1 + Math.floor(days/31) : 7 + Math.floor((days-186)/30);
  const jd = 1 + ((days < 186) ? (days%31) : ((days-186)%30));
  return { year: jy, month: jm, day: jd };
}

function shamsiToGregorian(jy, jm, jd) {
  let gy = (jy <= 979) ? 621 : 1600;
  jy -= (jy <= 979) ? 0 : 979;
  let days = (365*jy) + (Math.floor(jy/33)*8) + Math.floor(((jy%33)+3)/4) + 78 + jd + ((jm<7) ? (jm-1)*31 : ((jm-7)*30)+186);
  gy += 400 * Math.floor(days/146097); days %= 146097;
  if (days > 36524) { gy += 100 * Math.floor(--days/36524); days %= 36524; if (days >= 365) days++; }
  gy += 4 * Math.floor(days/1461); days %= 1461;
  if (days > 365) { gy += Math.floor((days-1)/365); days = (days-1)%365; }
  let gd = days + 1;
  const sal_a = [0,31,(gy%4===0 && gy%100!==0)||(gy%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  let gm;
  for (gm = 0; gm < 13 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { year: gy, month: gm, day: gd };
}

function todayShamsi() { const d = new Date(); return gregorianToShamsi(d.getFullYear(), d.getMonth()+1, d.getDate()); }
function shamsiComparable(y, m, d) { return y*10000 + m*100 + d; }
function formatShamsi(y, m, d) { return `${y}/${String(m).padStart(2,'0')}/${String(d).padStart(2,'0')}`; }
function formatShamsiFull(y, m, d) {
  const months = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  return `${d} ${months[m-1]} ${y}`;
}
function dailyKey(y, m, d) { return K.DAILY_PREFIX + `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`; }

function isLeapShamsi(y) {
  try { const g = shamsiToGregorian(y, 12, 30); return g.month === 12 && g.day === 30; }
  catch(e) { return false; }
}

function isValidShamsi(y, m, d) {
  if (!y || !m || !d) return false;
  if (y < 1300 || y > 1500) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  if (m <= 6 && d > 31) return false;
  if (m >= 7 && m <= 11 && d > 30) return false;
  if (m === 12) { const maxDay = isLeapShamsi(y) ? 30 : 29; if (d > maxDay) return false; }
  return true;
}

function getWeekdayFromShamsi(y, m, d) {
  if (!isValidShamsi(y, m, d)) return '—';
  try {
    const g = shamsiToGregorian(y, m, d);
    const date = new Date(g.year, g.month-1, g.day);
    const map = { 6:0, 0:1, 1:2, 2:3, 3:4, 4:5, 5:6 };
    return WEEKDAYS[map[date.getDay()]];
  } catch(e) { return '—'; }
}

function daysBetween(y1,m1,d1,y2,m2,d2) {
  try {
    const g1 = shamsiToGregorian(y1,m1,d1);
    const g2 = shamsiToGregorian(y2,m2,d2);
    const date1 = new Date(g1.year, g1.month-1, g1.day);
    const date2 = new Date(g2.year, g2.month-1, g2.day);
    return Math.round((date2 - date1) / (1000*60*60*24));
  } catch(e) { return 0; }
}

function addDaysToShamsi(y, m, d, days) {
  const g = shamsiToGregorian(y, m, d);
  const date = new Date(g.year, g.month-1, g.day);
  date.setDate(date.getDate() + days);
  return gregorianToShamsi(date.getFullYear(), date.getMonth()+1, date.getDate());
}

// ============================================================
//  ذخیره‌سازی
// ============================================================
function loadTasks() {
  try { tasks = JSON.parse(localStorage.getItem(K.TASKS)) || []; }
  catch(e) { tasks = []; }
  tasks.forEach(t => {
    if (!t.subtasks) t.subtasks = [];
    if (!t.tags) t.tags = [];
    if (t.estTime === undefined) t.estTime = 0;
  });
}

function saveTasks() {
  const s = loadSettings();
  if (s.autoSave === false) return;
  try { localStorage.setItem(K.TASKS, JSON.stringify(tasks)); showSaveStatus('saved'); }
  catch(e) { showSaveStatus('error'); }
  if (SupaClient.isLoggedIn()) {
  syncToCloud().catch(() => {});
}
}


function forceSaveTasks() {
  try { localStorage.setItem(K.TASKS, JSON.stringify(tasks)); showSaveStatus('saved'); return true; }
  catch(e) { showSaveStatus('error'); return false; }
}

function loadNote() { return localStorage.getItem(K.NOTE) || ''; }
function saveNote(t) { localStorage.setItem(K.NOTE, t); }

function loadTags() { try { allTags = JSON.parse(localStorage.getItem(K.TAGS)) || []; } catch(e) { allTags = []; } }
function saveTags() { localStorage.setItem(K.TAGS, JSON.stringify(allTags)); }

function loadSettings() { try { return JSON.parse(localStorage.getItem(K.SETTINGS)) || {}; } catch(e) { return {}; } }
function saveSettings(s) { localStorage.setItem(K.SETTINGS, JSON.stringify(s)); }

function loadExpanded() {
  try { const arr = JSON.parse(localStorage.getItem(K.EXPANDED)) || []; expandedTasks = new Set(arr); }
  catch(e) { expandedTasks = new Set(); }
}
function saveExpanded() { localStorage.setItem(K.EXPANDED, JSON.stringify([...expandedTasks])); }

function loadSubjectNotes() {
  try { subjectNotes = JSON.parse(localStorage.getItem(K.SUBJECT_NOTES)) || {}; }
  catch(e) { subjectNotes = {}; }
}
function saveSubjectNotes() { localStorage.setItem(K.SUBJECT_NOTES, JSON.stringify(subjectNotes)); }

function loadDailyPlan(y, m, d) {
  const key = dailyKey(y, m, d);
  try { return JSON.parse(localStorage.getItem(key)) || []; }
  catch(e) { return []; }
}
function saveDailyPlan(y, m, d, items) {
  const key = dailyKey(y, m, d);
  localStorage.setItem(key, JSON.stringify(items));
}

function defaultSchedule() {
  const periods = [];
  const times = [['07:30','08:15'],['08:15','09:00'],['09:00','09:45'],['10:00','10:45'],['10:45','11:30'],['11:30','12:15']];
  for (let p=0; p<PERIODS; p++) {
    periods.push({ startTime: times[p][0], endTime: times[p][1], days: WEEKDAYS_6.map(()=>({ subject: '' })) });
  }
  return { periods };
}

function loadSchedule() {
  try {
    const s = JSON.parse(localStorage.getItem(K.SCHEDULE));
    if (s && s.periods && Array.isArray(s.periods)) {
      for (let p=0; p<PERIODS; p++) {
        if (!s.periods[p]) s.periods[p] = { startTime:'', endTime:'', days:[] };
        if (!s.periods[p].days) s.periods[p].days = [];
        for (let d=0; d<6; d++) {
          if (!s.periods[p].days[d]) s.periods[p].days[d] = { subject: '' };
        }
      }
      return s;
    }
  } catch(e) {}
  return defaultSchedule();
}
function saveSchedule(s) { localStorage.setItem(K.SCHEDULE, JSON.stringify(s)); }

function showSaveStatus(type) {
  const el = document.getElementById('saveStatus');
  if (!el) return;
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
  el.className = 'save-status show ' + type;
  if (type === 'saving') el.textContent = 'در حال ذخیره...';
  else if (type === 'saved') el.textContent = `ذخیره شد ✓ — ${time}`;
  else if (type === 'error') el.textContent = 'خطا در ذخیره';
  setTimeout(() => el.classList.remove('show'), 2000);
}

// ============================================================
//  وضعیت‌ها
// ============================================================
function isOverdue(t) {
  if (t.done) return false;
  const today = todayShamsi();
  return shamsiComparable(t.year, t.month, t.day) < shamsiComparable(today.year, today.month, today.day);
}
function isToday(t) {
  const today = todayShamsi();
  return t.year === today.year && t.month === today.month && t.day === today.day;
}
function isTomorrow(t) {
  const g = shamsiToGregorian(todayShamsi().year, todayShamsi().month, todayShamsi().day);
  const d = new Date(g.year, g.month-1, g.day);
  d.setDate(d.getDate()+1);
  const tom = gregorianToShamsi(d.getFullYear(), d.getMonth()+1, d.getDate());
  return t.year === tom.year && t.month === tom.month && t.day === tom.day;
}
function isThisWeek(t) {
  const today = todayShamsi();
  const g = shamsiToGregorian(today.year, today.month, today.day);
  const d = new Date(g.year, g.month-1, g.day);
  const dow = d.getDay();
  let diff;
  if (dow === 6) diff = 0; else if (dow === 0) diff = 1; else if (dow === 1) diff = 2;
  else if (dow === 2) diff = 3; else if (dow === 3) diff = 4; else if (dow === 4) diff = 5; else diff = 6;
  const sat = new Date(d); sat.setDate(d.getDate()-diff);
  const fri = new Date(sat); fri.setDate(sat.getDate()+6);
  const satS = gregorianToShamsi(sat.getFullYear(), sat.getMonth()+1, sat.getDate());
  const friS = gregorianToShamsi(fri.getFullYear(), fri.getMonth()+1, fri.getDate());
  const tc = shamsiComparable(t.year, t.month, t.day);
  return tc >= shamsiComparable(satS.year, satS.month, satS.day) && tc <= shamsiComparable(friS.year, friS.month, friS.day);
}
function isThisMonth(t) {
  const today = todayShamsi();
  return t.year === today.year && t.month === today.month;
}
function isOldDone(t) {
  if (!t.done) return false;
  return daysBetween(t.year, t.month, t.day, todayShamsi().year, todayShamsi().month, todayShamsi().day) > 30;
}

function esc(s) {
  if (s === undefined || s === null) return '';
  const d = document.createElement('div'); d.textContent = s; return d.innerHTML;
}

function getAutoTags(t) {
  const tags = new Set();
  if (t.type) tags.add(t.type);
  if (t.workType) tags.add(t.workType);
  if (t.priority) tags.add(t.priority);
  if (t.done) tags.add('انجام‌شده');
  else if (isOverdue(t)) tags.add('عقب‌افتاده');
  else tags.add('در انتظار');
  return [...tags];
}

// ============================================================
//  Toast
// ============================================================
function toast(message, type = 'info', action = null) {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  const icons = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' };
  let actionHtml = '';
  if (action) actionHtml = `<button class="toast-action">${esc(action.label)}</button>`;
  el.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${esc(message)}</span>${actionHtml}<span class="toast-close">✖</span>`;
  container.appendChild(el);
  const close = () => { el.classList.add('hiding'); setTimeout(()=>el.remove(), 300); };
  el.querySelector('.toast-close').onclick = close;
  if (action) el.querySelector('.toast-action').onclick = () => { action.callback(); close(); };
  setTimeout(close, action ? 5000 : 3000);
}

// ============================================================
//  تم‌ها
// ============================================================
function applyTheme(themeId) {
  const fontClasses = ['font-large','font-small'].filter(c => document.body.classList.contains(c));
  document.body.className = '';
  fontClasses.forEach(c => document.body.classList.add(c));
  if (themeId && themeId.startsWith('theme-')) document.body.classList.add(themeId);
  else document.body.classList.add('theme-light');
  localStorage.setItem(K.THEME, themeId || 'theme-light');
  const quickBtn = document.getElementById('btnThemeQuick');
  if (quickBtn) {
    const theme = THEMES.find(t => t.id === (themeId || 'theme-light'));
    quickBtn.textContent = theme ? theme.icon : '🌙';
  }
  renderThemeGrid();
  renderThemeDropdown();
}

function renderThemeGrid() {
  const grid = document.getElementById('themeGrid');
  if (!grid) return;
  const current = localStorage.getItem(K.THEME) || 'theme-light';
  grid.innerHTML = THEMES.map(t => `
    <button class="theme-option ${current === t.id ? 'active' : ''}" data-theme="${t.id}">
      <div class="theme-swatch" style="background:${t.color}; color: white;">${t.icon}</div>
      <div class="theme-option-label">${t.label}</div>
    </button>
  `).join('');
}

function renderThemeDropdown() {
  const dd = document.getElementById('themeDropdown');
  if (!dd) return;
  const current = localStorage.getItem(K.THEME) || 'theme-light';
  dd.innerHTML = THEMES.map(t => `
    <button class="theme-option ${current === t.id ? 'active' : ''}" data-theme="${t.id}">
      <div class="theme-swatch" style="background:${t.color}; color: white;">${t.icon}</div>
      <div class="theme-option-label">${t.label}</div>
    </button>
  `).join('');
}

function setupThemeEvents() {
  const quickBtn = document.getElementById('btnThemeQuick');
  const dd = document.getElementById('themeDropdown');
  if (quickBtn && dd) {
    quickBtn.addEventListener('click', (e) => { e.stopPropagation(); dd.classList.toggle('show'); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.theme-quick')) dd.classList.remove('show'); });
  }
  document.addEventListener('click', (e) => {
    const opt = e.target.closest('[data-theme]');
    if (opt) {
      applyTheme(opt.dataset.theme);
      const dd2 = document.getElementById('themeDropdown');
      if (dd2) dd2.classList.remove('show');
      toast('تم تغییر کرد.', 'success');
    }
  });
}

function toggleTheme() {
  const current = localStorage.getItem(K.THEME) || 'theme-light';
  const next = current === 'theme-dark' ? 'theme-light' : 'theme-dark';
  applyTheme(next);
  toast('تم تغییر کرد.', 'success');
}

function loadTheme() {
  const saved = localStorage.getItem(K.THEME) || 'theme-light';
  applyTheme(saved);
}

// ============================================================
//  درس‌ها
// ============================================================
function getAllScheduleSubjects() {
  const s = loadSchedule();
  const set = new Set();
  s.periods.forEach(p => p.days.forEach(d => { if (d.subject && d.subject.trim()) set.add(d.subject.trim()); }));
  return [...set].sort();
}
function getSubjectDays(subject) {
  const s = loadSchedule();
  const days = new Set();
  s.periods.forEach(p => p.days.forEach((d, di) => { if (d.subject && d.subject.trim() === subject) days.add(WEEKDAYS_6[di]); }));
  return [...days];
}
function getSubjectTimes(subject, day) {
  const s = loadSchedule();
  const dayIdx = WEEKDAYS_6.indexOf(day);
  if (dayIdx === -1) return [];
  const times = [];
  s.periods.forEach(p => {
    if (p.days[dayIdx] && p.days[dayIdx].subject && p.days[dayIdx].subject.trim() === subject) {
      times.push({ start: p.startTime || '', end: p.endTime || '', label: `${p.startTime||'?'} - ${p.endTime||'?'}` });
    }
  });
  return times;
}

// ============================================================
//  آمار
// ============================================================
function renderStatCards() {
  const total = tasks.length;
  const hw = tasks.filter(t=>t.type==='تکلیف').length;
  const ex = tasks.filter(t=>t.type==='امتحان').length;
  const pr = tasks.filter(t=>t.type==='پروژه').length;
  const rm = tasks.filter(t=>t.type==='یادآوری').length;
  const done = tasks.filter(t=>t.done).length;
  const undone = total-done;
  const overdue = tasks.filter(isOverdue).length;
  const cards = [
    { icon:'📋', num:total, lbl:'کل کارها' }, { icon:'📝', num:hw, lbl:'تکلیف' },
    { icon:'📖', num:ex, lbl:'امتحان' }, { icon:'🔬', num:pr, lbl:'پروژه' },
    { icon:'🔔', num:rm, lbl:'یادآوری' }, { icon:'✅', num:done, lbl:'انجام‌شده' },
    { icon:'⏳', num:undone, lbl:'انجام‌نشده' }, { icon:'⚠️', num:overdue, lbl:'عقب‌افتاده' }
  ];
  const html = cards.map(c=>`<div class="stat-card"><div class="stat-icon">${c.icon}</div><div class="stat-info"><span class="stat-num">${c.num}</span><span class="stat-lbl">${c.lbl}</span></div></div>`).join('');
  const sc = document.getElementById('statCards');
  const scf = document.getElementById('statCardsFull');
  if (sc) sc.innerHTML = html;
  if (scf) scf.innerHTML = html;
}

function renderAlerts() {
  const todayCount = tasks.filter(isToday).length;
  const tomCount = tasks.filter(isTomorrow).length;
  const overdueCount = tasks.filter(isOverdue).length;
  let html = '';
  if (todayCount) html += `<div class="alert-item alert-today">📌 ${todayCount} کار برای امروز <span class="alert-close" data-dismiss="today">✖</span></div>`;
  if (tomCount) html += `<div class="alert-item alert-tomorrow">⏰ ${tomCount} کار برای فردا <span class="alert-close" data-dismiss="tomorrow">✖</span></div>`;
  if (overdueCount) html += `<div class="alert-item alert-overdue">⚠️ ${overdueCount} کار عقب‌افتاده <span class="alert-close" data-dismiss="overdue">✖</span></div>`;
  const ab = document.getElementById('alertBar');
  if (ab) ab.innerHTML = html;
}

// ============================================================
//  زیرکارها
// ============================================================
function renderSubtasksInline(t) {
  const subs = t.subtasks || [];
  if (!subs.length) {
    return `<div class="subtasks-inline"><button class="subtask-add-inline" data-subtask-add-inline="${t.id}">➕ افزودن زیرکار جدید</button></div>`;
  }
  const isExpanded = expandedTasks.has(t.id);
  const visibleSubs = isExpanded ? subs : subs.slice(0, 3);
  const remaining = subs.length - 3;
  const doneCount = subs.filter(s => s.done).length;
  return `
    <div class="subtasks-inline">
      <div class="subtasks-inline-header">
        <span>✅ زیرکارها (${doneCount} از ${subs.length})</span>
        <div class="subtasks-bar-inline"><div class="subtasks-fill-inline" style="width:${(doneCount/subs.length)*100}%"></div></div>
      </div>
      ${visibleSubs.map((st, i) => `
        <div class="subtask-row ${st.done ? 'done' : ''}">
          <div class="subtask-check ${st.done ? 'checked' : ''}" data-subtask-toggle-inline="${t.id}" data-subtask-index="${i}">${st.done ? '✓' : ''}</div>
          <div class="subtask-row-content">
            <div class="subtask-row-title">${esc(st.title)}</div>
            ${st.desc ? `<div class="subtask-row-desc" title="${esc(st.desc)}">${esc(st.desc)}</div>` : ''}
          </div>
          <button class="subtask-row-remove" data-subtask-remove-inline="${t.id}" data-subtask-index="${i}" title="حذف">🗑️</button>
        </div>
      `).join('')}
      ${!isExpanded && remaining > 0 ? `<button class="subtask-show-more" data-show-more="${t.id}">نمایش ${remaining} زیرکار دیگر ▼</button>` : ''}
      ${isExpanded && subs.length > 3 ? `<button class="subtask-show-more" data-show-more="${t.id}">نمایش کمتر ▲</button>` : ''}
      <button class="subtask-add-inline" data-subtask-add-inline="${t.id}">➕ افزودن زیرکار جدید</button>
    </div>
  `;
}

// ============================================================
//  کارت کار
// ============================================================
function renderTaskCard(t, compact = false) {
  const overdue = isOverdue(t);
  const cls = `${t.done?'done':''} ${overdue?'overdue':''}`;
  const wd = getWeekdayFromShamsi(t.year, t.month, t.day);
  const statusBadge = t.done ? '<span class="badge badge-done">✅ انجام شده</span>' : (overdue ? '<span class="badge badge-overdue">⚠️ عقب‌افتاده</span>' : '<span class="badge badge-undone">⏳ انجام نشده</span>');
  const workBadge = t.workType === 'حضوری' ? '<span class="badge badge-work-online">حضوری</span>' : '<span class="badge badge-work-offline">آفلاین</span>';
  const autoTags = getAutoTags(t);
  const userTags = (t.tags || []).filter(tag => !autoTags.includes(tag));
  const autoTagsHtml = autoTags.map(tag=>`<span class="badge badge-tag" style="opacity:0.75">#${esc(tag)}</span>`).join('');
  const userTagsHtml = userTags.map(tag=>`<span class="badge badge-tag">#${esc(tag)}</span>`).join('');
  const estHtml = t.estTime > 0 ? `<span class="badge badge-est">⏱️ ${t.estTime} دقیقه</span>` : '';
  const deliverInfo = (t.workType === 'حضوری' && t.deliverDay && t.deliverTime) ? `<span>📌 تحویل: ${esc(t.deliverDay)} — ${esc(t.deliverTime)}</span>` : '';
  const checkboxCls = t.done ? 'checked' : '';
  const checkboxContent = t.done ? '✓' : '';
  const subtasksHtml = renderSubtasksInline(t);

  if (compact) {
    return `
      <div class="task-card ${cls}" data-task-id="${t.id}">
        <div class="task-head">
          <div class="task-title-wrap">
            <div class="task-checkbox ${checkboxCls}" data-act="toggle" data-id="${t.id}">${checkboxContent}</div>
            <span class="task-title" data-act="open" data-id="${t.id}">${esc(t.title)}</span>
          </div>
          <div class="task-badges">${statusBadge}</div>
        </div>
        <div class="task-details"><span>📚 ${esc(t.subject)}</span><span>📅 ${formatShamsi(t.year,t.month,t.day)}</span></div>
      </div>`;
  }

  return `
    <div class="task-card ${cls}" data-task-id="${t.id}">
      <div class="task-head">
        <div class="task-title-wrap">
          <div class="task-checkbox ${checkboxCls}" data-act="toggle" data-id="${t.id}" title="انجام شد">${checkboxContent}</div>
          <span class="task-title" data-act="open" data-id="${t.id}" title="مشاهده جزئیات">${esc(t.title)}</span>
        </div>
        <div class="task-badges">
          ${workBadge}
          <span class="badge badge-type ${esc(t.type)}">${esc(t.type)}</span>
          <span class="badge badge-pri-${esc(t.priority)}">${esc(t.priority)}</span>
          ${estHtml}
          ${statusBadge}
        </div>
      </div>
      <div class="task-details">
        <span>📚 ${esc(t.subject)}</span>
        <span>📅 موعد: ${formatShamsi(t.year,t.month,t.day)}</span>
        <span>🗓️ ${wd}</span>
        ${deliverInfo}
        ${t.location?`<span>📍 ${esc(t.location)}</span>`:''}
      </div>
      ${t.description?`<div class="task-desc">${esc(t.description)}</div>`:''}
      ${(autoTagsHtml || userTagsHtml) ? `<div class="task-badges" style="margin-top:0.4rem">${autoTagsHtml}${userTagsHtml}</div>` : ''}
      ${subtasksHtml}
      <div class="task-actions">
        <button class="btn btn-outline" data-act="edit" data-id="${t.id}">✏️ ویرایش</button>
        <button class="btn btn-danger" data-act="delete" data-id="${t.id}">🗑️ حذف</button>
      </div>
    </div>`;
}

function renderTaskDetails(t) {
  const overdue = isOverdue(t);
  const wd = getWeekdayFromShamsi(t.year, t.month, t.day);
  const statusBadge = t.done ? '<span class="badge badge-done">✅ انجام شده</span>' : (overdue ? '<span class="badge badge-overdue">⚠️ عقب‌افتاده</span>' : '<span class="badge badge-undone">⏳ انجام نشده</span>');
  const workBadge = t.workType === 'حضوری' ? '<span class="badge badge-work-online">حضوری</span>' : '<span class="badge badge-work-offline">آفلاین</span>';
  const autoTags = getAutoTags(t);
  const userTags = (t.tags || []).filter(tag => !autoTags.includes(tag));
  const autoTagsHtml = autoTags.map(tag=>`<span class="badge badge-tag" style="opacity:0.75">#${esc(tag)}</span>`).join('');
  const userTagsHtml = userTags.map(tag=>`<span class="badge badge-tag">#${esc(tag)}</span>`).join('');
  const estHtml = t.estTime > 0 ? `<span class="badge badge-est">⏱️ ${t.estTime} دقیقه</span>` : '';
  const deliverInfo = (t.workType === 'حضوری' && t.deliverDay && t.deliverTime) ? `<span>📌 تحویل: ${esc(t.deliverDay)} — ${esc(t.deliverTime)}</span>` : '';
  const checkboxCls = t.done ? 'checked' : '';
  const checkboxContent = t.done ? '✓' : '';
  const subs = t.subtasks || [];
  const doneCount = subs.filter(s => s.done).length;
  const subtasksHtml = `
    <div class="subtasks-detail">
      <h4><span>✅ زیرکارها (${doneCount} از ${subs.length})</span></h4>
      ${subs.length ? `<div class="subtasks-detail-list">${subs.map((st, i) => `
        <div class="subtask-detail-item ${st.done ? 'done' : ''}">
          <div class="subtask-detail-checkbox ${st.done ? 'checked' : ''}" data-subtask-toggle-detail="${t.id}" data-subtask-index="${i}">${st.done ? '✓' : ''}</div>
          <div class="subtask-detail-content">
            <div class="subtask-detail-title">${esc(st.title)}</div>
            ${st.desc ? `<div class="subtask-detail-desc">${esc(st.desc)}</div>` : ''}
          </div>
          <button class="subtask-detail-remove" data-subtask-remove-detail="${t.id}" data-subtask-index="${i}" title="حذف">🗑️</button>
        </div>
      `).join('')}</div>` : `<div class="empty-msg" style="padding:0.8rem; font-size:0.82rem;">هنوز زیرکاری اضافه نشده.</div>`}
      <button class="subtask-add-btn" data-subtask-add-detail="${t.id}">➕ افزودن زیرکار جدید</button>
    </div>
  `;

  return `
    <div class="task-detail-view">
      <div class="task-head" style="margin-bottom:0.8rem">
        <div class="task-title-wrap">
          <div class="task-checkbox ${checkboxCls}" data-act="modal-toggle" data-id="${t.id}" title="انجام شد">${checkboxContent}</div>
          <span class="task-title" style="font-size:1.1rem">${esc(t.title)}</span>
        </div>
        <div class="task-badges">
          ${workBadge}
          <span class="badge badge-type ${esc(t.type)}">${esc(t.type)}</span>
          <span class="badge badge-pri-${esc(t.priority)}">${esc(t.priority)}</span>
          ${estHtml}
          ${statusBadge}
        </div>
      </div>
      <div class="task-details" style="margin-bottom:0.7rem">
        <span>📚 ${esc(t.subject)}</span>
        <span>📅 موعد: ${formatShamsi(t.year,t.month,t.day)}</span>
        <span>🗓️ ${wd}</span>
        ${deliverInfo}
        ${t.location?`<span>📍 ${esc(t.location)}</span>`:''}
      </div>
      ${t.description?`<div class="task-desc">${esc(t.description)}</div>`:''}
      ${(autoTagsHtml || userTagsHtml) ? `<div class="task-badges" style="margin-top:0.5rem">${autoTagsHtml}${userTagsHtml}</div>` : ''}
      ${subtasksHtml}
      <div class="task-actions" style="margin-top:1rem">
        <button class="btn btn-primary" data-act="edit" data-id="${t.id}">✏️ ویرایش</button>
        <button class="btn btn-danger" data-act="delete" data-id="${t.id}">🗑️ حذف</button>
      </div>
    </div>
  `;
}

// ============================================================
//  صفحه درس
// ============================================================
function renderSubjectPage(subject) {
  currentSubjectPage = subject;
  const notes = subjectNotes[subject] || [];
  const subjectTasks = tasks.filter(t => t.subject === subject);
  const notesHtml = notes.length ? notes.map(n => `
    <div class="note-card">
      <div class="note-card-header">
        <div class="note-card-title">${esc(n.title)}</div>
        <div class="note-card-actions">
          <button data-note-edit="${n.id}" title="ویرایش">✏️</button>
          <button data-note-delete="${n.id}" title="حذف">🗑️</button>
        </div>
      </div>
      ${n.text ? `<div class="note-card-text">${esc(n.text)}</div>` : ''}
      ${n.tags && n.tags.length ? `<div class="note-card-tags">${n.tags.map(t=>`<span class="badge badge-tag">#${esc(t)}</span>`).join('')}</div>` : ''}
    </div>
  `).join('') : '<div class="empty-msg" style="padding:1rem; font-size:0.85rem;">هنوز یادداشتی برای این درس ثبت نشده.</div>';

  const tasksHtml = subjectTasks.length ? subjectTasks.map(t => renderTaskCard(t)).join('') : '<div class="empty-msg" style="padding:1rem; font-size:0.85rem;">هنوز کاری برای این درس ثبت نشده.</div>';

  return `
    <div class="subject-page">
      <div class="subject-page-header"><h3>📚 ${esc(subject)}</h3></div>
      <div class="subject-tabs">
        <button class="subject-tab-btn active" data-subject-tab="notes">📝 یادداشت‌ها (${notes.length})</button>
        <button class="subject-tab-btn" data-subject-tab="tasks">📋 کارها (${subjectTasks.length})</button>
      </div>
      <div class="subject-tab-content active" data-subject-content="notes">
        ${notesHtml}
        <button class="note-add-btn" data-note-add="${esc(subject)}">➕ یادداشت جدید</button>
      </div>
      <div class="subject-tab-content" data-subject-content="tasks">${tasksHtml}</div>
    </div>
  `;
}

function openSubjectPage(subject) {
  const mt = document.getElementById('modalTitle');
  const mb = document.getElementById('modalBody');
  const mo = document.getElementById('modalOverlay');
  if (!mt || !mb || !mo) return;
  mt.textContent = `📚 ${subject}`;
  mb.innerHTML = renderSubjectPage(subject);
  mo.classList.add('show');
}

// ============================================================
//  فیلتر
// ============================================================
function getFiltered() {
  const search = (document.getElementById('fSearch').value||'').trim().toLowerCase();
  const subject = document.getElementById('fFilterSubject').value;
  const workType = document.getElementById('fFilterWorkType').value;
  const type = document.getElementById('fFilterType').value;
  const priority = document.getElementById('fFilterPriority').value;
  const status = document.getElementById('fFilterStatus').value;
  const tag = document.getElementById('fFilterTag').value;
  const sort = document.getElementById('fSort').value;
  const yF = parseInt(document.getElementById('fYearFrom').value)||null;
  const mF = parseInt(document.getElementById('fMonthFrom').value)||null;
  const dF = parseInt(document.getElementById('fDayFrom').value)||null;
  const yT = parseInt(document.getElementById('fYearTo').value)||null;
  const mT = parseInt(document.getElementById('fMonthTo').value)||null;
  const dT = parseInt(document.getElementById('fDayTo').value)||null;

  let arr = tasks.filter(t => {
    if (search) {
      const hay = (t.title+' '+t.subject+' '+(t.location||'')+' '+(t.description||'')+' '+(t.tags||[]).join(' ')+' '+getAutoTags(t).join(' ')).toLowerCase();
      if (!hay.includes(search)) return false;
    }
    if (subject && t.subject !== subject) return false;
    if (workType && t.workType !== workType) return false;
    if (type && t.type !== type) return false;
    if (priority && t.priority !== priority) return false;
    if (tag) { const allTaskTags = [...getAutoTags(t), ...(t.tags||[])]; if (!allTaskTags.includes(tag)) return false; }
    if (status === 'done' && !t.done) return false;
    if (status === 'undone' && t.done) return false;
    if (status === 'overdue' && !isOverdue(t)) return false;
    const tc = shamsiComparable(t.year, t.month, t.day);
    if (yF && mF && dF) { if (tc < shamsiComparable(yF, mF, dF)) return false; }
    if (yT && mT && dT) { if (tc > shamsiComparable(yT, mT, dT)) return false; }
    return true;
  });

  if (sort === 'date-asc') arr.sort((a,b)=>shamsiComparable(a.year,a.month,a.day)-shamsiComparable(b.year,b.month,b.day));
  else if (sort === 'date-desc') arr.sort((a,b)=>shamsiComparable(b.year,b.month,b.day)-shamsiComparable(a.year,a.month,a.day));
  else if (sort === 'priority-desc') arr.sort((a,b)=>PRIORITY_ORDER[a.priority]-PRIORITY_ORDER[b.priority]);
  else if (sort === 'priority-asc') arr.sort((a,b)=>PRIORITY_ORDER[b.priority]-PRIORITY_ORDER[a.priority]);
  else if (sort === 'subject-asc') arr.sort((a,b)=>a.subject.localeCompare(b.subject,'fa'));
  else if (sort === 'title-asc') arr.sort((a,b)=>a.title.localeCompare(b.title,'fa'));
  return arr;
}

function renderTasksList() {
  const arr = getFiltered();
  const container = document.getElementById('tasksList');
  if (!container) return;
  const viewMode = document.getElementById('fViewMode').value;
  const groupBy = document.getElementById('fGroupBy').value;
  if (!arr.length) {
    container.innerHTML = '<div class="empty-msg"><span class="empty-icon">📭</span>هیچ کاری یافت نشد.<br>اولین کارت رو اضافه کن!</div>';
    refreshCalendarDay();
    return;
  }
  if (groupBy === 'none') {
    container.innerHTML = arr.map(t=>renderTaskCard(t, viewMode==='compact')).join('');
    refreshCalendarDay();
    return;
  }
  const groups = {};
  arr.forEach(t => {
    let key;
    if (groupBy === 'due') {
      if (isOverdue(t)) key = '⚠️ عقب‌افتاده';
      else if (isToday(t)) key = '📌 امروز';
      else if (isTomorrow(t)) key = '⏰ فردا';
      else if (isThisWeek(t)) key = '📅 این هفته';
      else key = '📆 بعد';
    } else if (groupBy === 'subject') key = '📚 ' + t.subject;
    else if (groupBy === 'priority') key = '🎯 ' + t.priority;
    if (!groups[key]) groups[key] = [];
    groups[key].push(t);
  });
  let html = '';
  Object.keys(groups).forEach(key => {
    html += `<div class="group-header"><h4>${key} (${groups[key].length})</h4></div>`;
    html += groups[key].map(t=>renderTaskCard(t, viewMode==='compact')).join('');
  });
  container.innerHTML = html;
  refreshCalendarDay();
}

function populateSubjectFilter() {
  const subs = getAllScheduleSubjects();
  subs.sort();
  const sel1 = document.getElementById('fFilterSubject');
  if (sel1) {
    const cur1 = sel1.value;
    sel1.innerHTML = '<option value="">همه دروس</option>' + subs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (subs.includes(cur1)) sel1.value = cur1;
  }
  const sel2 = document.getElementById('fSubject');
  if (sel2) {
    const cur2 = sel2.value;
    sel2.innerHTML = '<option value="">— انتخاب درس —</option>' + subs.map(s=>`<option value="${esc(s)}">${esc(s)}</option>`).join('');
    if (subs.includes(cur2)) sel2.value = cur2;
  }
  const allTaskTags = new Set();
  tasks.forEach(t => { getAutoTags(t).forEach(tag => allTaskTags.add(tag)); (t.tags||[]).forEach(tag => allTaskTags.add(tag)); });
  allTags.forEach(tag => allTaskTags.add(tag));
  const selTag = document.getElementById('fFilterTag');
  if (selTag) {
    const curT = selTag.value;
    selTag.innerHTML = '<option value="">همه برچسب‌ها</option>' + [...allTaskTags].sort().map(t=>`<option value="${esc(t)}">#${esc(t)}</option>`).join('');
    if ([...allTaskTags].includes(curT)) selTag.value = curT;
  }
}

// ============================================================
//  فرم
// ============================================================
function updateWeekdayField() {
  const y = parseInt(document.getElementById('fYear').value);
  const m = parseInt(document.getElementById('fMonth').value);
  const d = parseInt(document.getElementById('fDay').value);
  const el = document.getElementById('fWeekday');
  if (!el) return;
  if (isValidShamsi(y,m,d)) el.value = getWeekdayFromShamsi(y,m,d);
  else el.value = '—';
}

function updateDeliverFields() {
  const workType = document.getElementById('fWorkType').value;
  const subject = document.getElementById('fSubject').value;
  const dayGroup = document.getElementById('deliverDayGroup');
  const timeGroup = document.getElementById('deliverTimeGroup');
  const freeTimeGroup = document.getElementById('freeTimeGroup');
  const daySel = document.getElementById('fDeliverDay');
  const timeSel = document.getElementById('fDeliverTime');
  if (workType === 'آفلاین') {
    dayGroup.style.display = 'none';
    timeGroup.style.display = 'none';
    freeTimeGroup.style.display = 'flex';
    daySel.value = '';
    timeSel.innerHTML = '<option value="">— انتخاب ساعت —</option>';
  } else {
    dayGroup.style.display = 'flex';
    timeGroup.style.display = 'flex';
    freeTimeGroup.style.display = 'none';
    const days = subject ? getSubjectDays(subject) : [];
    const curDay = daySel.value;
    daySel.innerHTML = '<option value="">— انتخاب روز —</option>' + days.map(d=>`<option value="${esc(d)}">${esc(d)}</option>`).join('');
    if (days.includes(curDay)) daySel.value = curDay;
    updateTimeOptions();
  }
}

function updateTimeOptions() {
  const subject = document.getElementById('fSubject').value;
  const day = document.getElementById('fDeliverDay').value;
  const timeSel = document.getElementById('fDeliverTime');
  const curTime = timeSel.value;
  if (!subject || !day) { timeSel.innerHTML = '<option value="">— انتخاب ساعت —</option>'; return; }
  const times = getSubjectTimes(subject, day);
  timeSel.innerHTML = '<option value="">— انتخاب ساعت —</option>' + times.map(t=>`<option value="${esc(t.start)}">${esc(t.label)}</option>`).join('');
  if (times.some(t=>t.start===curTime)) timeSel.value = curTime;
}

function renderSubtasksForm() {
  const container = document.getElementById('subtasksList');
  if (!container) return;
  container.innerHTML = formSubtasks.map((st, i) => `
    <div class="subtask-item" data-index="${i}">
      <input type="checkbox" ${st.done?'checked':''} data-subtask-toggle="${i}">
      <input type="text" value="${esc(st.title)}" placeholder="عنوان زیرکار" data-subtask-title="${i}">
      <button type="button" class="btn btn-danger" data-subtask-remove="${i}" style="padding:0.3rem 0.6rem">🗑️</button>
      <textarea placeholder="توضیحات (اختیاری)" data-subtask-desc="${i}">${esc(st.desc||'')}</textarea>
    </div>`).join('');
}

function renderTagsForm() {
  const container = document.getElementById('tagsInput');
  if (!container) return;
  const input = container.querySelector('input');
  if (!input) return;
  container.querySelectorAll('.tag-pill').forEach(el => el.remove());
  formTags.forEach((tag, i) => {
    const pill = document.createElement('span');
    pill.className = 'tag-pill';
    pill.innerHTML = `#${esc(tag)} <span class="remove" data-tag-remove="${i}">✖</span>`;
    container.insertBefore(pill, input);
  });
  renderTagSuggestions();
}

function renderTagSuggestions() {
  const container = document.getElementById('tagSuggestions');
  if (!container) return;
  const available = allTags.filter(t => !formTags.includes(t));
  container.innerHTML = available.map(t => `<button type="button" class="tag-suggestion" data-tag-add="${esc(t)}">#${esc(t)}</button>`).join('');
}

function resetForm() {
  const form = document.getElementById('taskForm');
  if (form) form.reset();
  document.getElementById('editId').value = '';
  document.getElementById('formTitleSide').textContent = '➕ افزودن کار جدید';
  document.getElementById('btnSubmit').textContent = '💾 ذخیره';
  document.getElementById('btnCancel').style.display = 'none';
  document.getElementById('fWeekday').value = '—';
  document.getElementById('freeTimeGroup').style.display = 'none';
  document.getElementById('deliverDayGroup').style.display = 'flex';
  document.getElementById('deliverTimeGroup').style.display = 'flex';
  editingId = null;
  formSubtasks = [];
  formTags = [];
  currentFormStep = 1;
  updateFormStep();
  renderSubtasksForm();
  renderTagsForm();
}

function updateFormStep() {
  document.querySelectorAll('.form-step').forEach(s => s.classList.toggle('active', parseInt(s.dataset.step) === currentFormStep));
  const btnPrev = document.getElementById('btnPrevStep');
  const btnNext = document.getElementById('btnNextStep');
  const btnSubmit = document.getElementById('btnSubmit');
  if (btnPrev) btnPrev.style.display = currentFormStep > 1 ? 'inline-flex' : 'none';
  if (btnNext) btnNext.style.display = currentFormStep < 4 ? 'inline-flex' : 'none';
  if (btnSubmit) btnSubmit.style.display = currentFormStep === 4 ? 'inline-flex' : 'none';
}

function fillForm(t) {
  document.getElementById('editId').value = t.id;
  document.getElementById('fTitle').value = t.title;
  document.getElementById('fSubject').value = t.subject;
  document.getElementById('fWorkType').value = t.workType || 'حضوری';
  document.getElementById('fType').value = t.type;
  document.getElementById('fLocation').value = t.location || '';
  document.getElementById('fDesc').value = t.description || '';
  document.getElementById('fYear').value = t.year;
  document.getElementById('fMonth').value = t.month;
  document.getElementById('fDay').value = t.day;
  document.getElementById('fPriority').value = t.priority;
  document.getElementById('fDone').value = t.done ? 'true' : 'false';
  document.getElementById('fWeekday').value = getWeekdayFromShamsi(t.year, t.month, t.day);
  document.getElementById('fEstTime').value = t.estTime || 0;
  updateDeliverFields();
  if (t.workType === 'حضوری') {
    document.getElementById('fDeliverDay').value = t.deliverDay || '';
    updateTimeOptions();
    document.getElementById('fDeliverTime').value = t.deliverTime || '';
  } else {
    document.getElementById('fFreeTime').value = t.deliverTime || '08:00';
  }
  formSubtasks = (t.subtasks || []).map(s => ({...s}));
  formTags = [...(t.tags || [])];
  renderSubtasksForm();
  renderTagsForm();
  document.getElementById('formTitleSide').textContent = '✏️ ویرایش کار';
  document.getElementById('btnSubmit').textContent = '💾 بروزرسانی';
  document.getElementById('btnCancel').style.display = 'inline-flex';
  editingId = t.id;
  currentFormStep = 1;
  updateFormStep();
}

function handleSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  if (!document.getElementById('sidePanelOverlay').classList.contains('show')) return;
  const title = document.getElementById('fTitle').value.trim();
  const subject = document.getElementById('fSubject').value.trim();
  const workType = document.getElementById('fWorkType').value;
  const type = document.getElementById('fType').value;
  const location = document.getElementById('fLocation').value.trim();
  const description = document.getElementById('fDesc').value.trim();
  const year = parseInt(document.getElementById('fYear').value);
  const month = parseInt(document.getElementById('fMonth').value);
  const day = parseInt(document.getElementById('fDay').value);
  const priority = document.getElementById('fPriority').value;
  const done = document.getElementById('fDone').value === 'true';
  const estTime = parseInt(document.getElementById('fEstTime').value) || 0;

  if (!title || !subject) { toast('عنوان و درس الزامی هستند.', 'error'); return; }
  if (!isValidShamsi(year, month, day)) { toast('تاریخ شمسی معتبر نیست.', 'error'); return; }
  const scheduleSubjects = getAllScheduleSubjects();
  if (!scheduleSubjects.includes(subject)) { toast('این درس در برنامه هفتگی ثبت نشده.', 'warn'); return; }

  let deliverDay = '', deliverTime = '';
  if (workType === 'حضوری') {
    deliverDay = document.getElementById('fDeliverDay').value;
    deliverTime = document.getElementById('fDeliverTime').value;
    if (!deliverDay || !deliverTime) { toast('برای کار حضوری، روز و ساعت تحویل الزامی است.', 'error'); return; }
  } else {
    deliverTime = document.getElementById('fFreeTime').value || '';
  }

  const subtasks = formSubtasks.filter(s => s.title && s.title.trim()).map(s => ({ title: s.title.trim(), desc: s.desc || '', done: s.done || false }));
  const tags = formTags.filter(t => t.trim());
  const data = { title, subject, workType, type, location, description, year, month, day, priority, done, deliverDay, deliverTime, estTime, subtasks, tags };

  if (editingId) {
    const idx = tasks.findIndex(t=>t.id===editingId);
    if (idx !== -1) tasks[idx] = { ...tasks[idx], ...data };
    toast('کار بروزرسانی شد.', 'success');
  } else {
    tasks.push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,7), ...data, createdAt: Date.now() });
    toast('کار جدید ذخیره شد.', 'success');
  }
  tags.forEach(t => { if (!allTags.includes(t)) allTags.push(t); });
  saveTags();
  saveTasks();
  populateSubjectFilter();
  renderAll();
  closeSidePanel();
  if (SupaClient.isLoggedIn()) {
  syncToCloud().catch(() => {});
}
  resetForm();
}

// ============================================================
//  رندر همه
// ============================================================
function renderAll() {
  renderStatCards();
  renderAlerts();
  renderTasksList();
  renderDashboard();
  renderOverview();
  renderSubjects();
  renderCalendar();
  refreshCalendarDay();
  renderSchedule();
  renderStatsTables();
  renderTimeStats();
  renderBadges();
  renderWeeklyChart();
  renderProgress();
  updateStorageInfo();
}

function renderDashboard() {
  const todayTasks = tasks.filter(isToday);
  const overdueTasks = tasks.filter(isOverdue);
  const todayHtml = todayTasks.length ? todayTasks.slice(0,5).map(t=>`<div class="ov-item">${esc(t.title)} — ${esc(t.subject)}</div>`).join('') : '<div class="empty-msg">کاری برای امروز نیست.</div>';
  const dToday = document.getElementById('dashboardToday');
  if (dToday) dToday.innerHTML = todayHtml;
  const overdueHtml = overdueTasks.length ? overdueTasks.slice(0,3).map(t=>`<div class="ov-item">${esc(t.title)} — ${formatShamsi(t.year,t.month,t.day)}</div>`).join('') : '<div class="empty-msg">هیچ کار عقب‌افتاده‌ای نداری.</div>';
  const dOverdue = document.getElementById('dashboardOverdue');
  if (dOverdue) dOverdue.innerHTML = overdueHtml;
}

function renderProgress() {
  const weekTasks = tasks.filter(isThisWeek);
  const monthTasks = tasks.filter(isThisMonth);
  const wDone = weekTasks.filter(t=>t.done).length;
  const mDone = monthTasks.filter(t=>t.done).length;
  const wP = weekTasks.length ? Math.round((wDone/weekTasks.length)*100) : 0;
  const mP = monthTasks.length ? Math.round((mDone/monthTasks.length)*100) : 0;
  const pw = document.getElementById('progressWeek'); const pwt = document.getElementById('progressWeekText');
  const pm = document.getElementById('progressMonth'); const pmt = document.getElementById('progressMonthText');
  if (pw) pw.style.width = wP+'%';
  if (pwt) pwt.textContent = wP+'%';
  if (pm) pm.style.width = mP+'%';
  if (pmt) pmt.textContent = mP+'%';
}

function renderBadges() {
  const done = tasks.filter(t=>t.done).length;
  const overdue = tasks.filter(isOverdue).length;
  const highDone = tasks.filter(t=>t.done && t.priority==='زیاد').length;
  const todayAllDone = tasks.filter(isToday).length > 0 && tasks.filter(isToday).every(t=>t.done);
  const badges = [];
  if (done >= 10) badges.push('🏅 ۱۰ کار انجام دادی');
  if (done >= 50) badges.push('🏆 ۵۰ کار انجام دادی');
  if (overdue === 0 && tasks.length > 0) badges.push('🌟 هیچ کار عقب‌افتاده‌ای نداری');
  if (todayAllDone) badges.push('✅ همه کارهای امروز تموم شد');
  if (highDone >= 5) badges.push('🔥 ۵ کار با اولویت زیاد انجام دادی');
  const bc = document.getElementById('badgesContainer');
  if (bc) bc.innerHTML = badges.length ? badges.map(b=>`<div class="badge-item">${b}</div>`).join('') : '<div class="empty-msg">هنوز دستاوردی کسب نکردی. ادامه بده!</div>';
}

function renderWeeklyChart() {
  const today = todayShamsi();
  const g = shamsiToGregorian(today.year, today.month, today.day);
  const d = new Date(g.year, g.month-1, g.day);
  const dow = d.getDay();
  let diff;
  if (dow === 6) diff = 0; else if (dow === 0) diff = 1; else if (dow === 1) diff = 2;
  else if (dow === 2) diff = 3; else if (dow === 3) diff = 4; else if (dow === 4) diff = 5; else diff = 6;
  const sat = new Date(d); sat.setDate(d.getDate()-diff);
  const counts = []; let max = 1;
  for (let i=0; i<7; i++) {
    const day = new Date(sat); day.setDate(sat.getDate()+i);
    const sh = gregorianToShamsi(day.getFullYear(), day.getMonth()+1, day.getDate());
    const c = tasks.filter(t=>t.done && t.year===sh.year && t.month===sh.month && t.day===sh.day).length;
    counts.push(c); if (c > max) max = c;
  }
  const html = counts.map((c,i)=>{ const h = (c/max)*100;
    return `<div class="chart-bar-wrap"><div class="chart-value">${c}</div><div class="chart-bar" style="height:${h}%"></div><div class="chart-label">${WEEKDAYS[i]}</div></div>`;
  }).join('');
  const wc = document.getElementById('weeklyChart');
  if (wc) wc.innerHTML = html;
}

function renderOverview() {
  const todayTasks = tasks.filter(isToday);
  const weekTasks = tasks.filter(isThisWeek);
  const renderNums = (arr) => {
    const done = arr.filter(t=>t.done).length;
    const undone = arr.length - done;
    const overdue = arr.filter(isOverdue).length;
    return `<div class="ov-num"><strong>${arr.length}</strong><span>کل</span></div><div class="ov-num"><strong>${done}</strong><span>انجام‌شده</span></div><div class="ov-num"><strong>${undone}</strong><span>انجام‌نشده</span></div><div class="ov-num"><strong>${overdue}</strong><span>عقب‌افتاده</span></div>`;
  };
  const tn = document.getElementById('ovTodayNumbers'); const wn = document.getElementById('ovWeekNumbers'); const an = document.getElementById('ovAllNumbers');
  if (tn) tn.innerHTML = renderNums(todayTasks);
  if (wn) wn.innerHTML = renderNums(weekTasks);
  if (an) an.innerHTML = renderNums(tasks);
  const listHtml = (arr, n) => arr.length ? arr.slice(0,n).map(t=>`<div class="ov-item">${esc(t.title)} — ${esc(t.subject)}</div>`).join('') : '<div class="empty-msg">موردی نیست.</div>';
  const tl = document.getElementById('ovTodayList'); const wl = document.getElementById('ovWeekList');
  if (tl) tl.innerHTML = listHtml(todayTasks,5);
  if (wl) wl.innerHTML = listHtml(weekTasks,5);
  const done = tasks.filter(t=>t.done).length;
  const p = tasks.length ? Math.round((done/tasks.length)*100) : 0;
  const ac = document.getElementById('ovAllChart');
  if (ac) ac.innerHTML = `<div class="donut" style="--p:${p*3.6}deg" data-label="${p}%"></div>`;
}

function renderSubjects() {
  const ss = document.getElementById('subjectSearch');
  if (!ss) return;
  const search = (ss.value||'').toLowerCase();
  const allSubjects = getAllScheduleSubjects();
  const subs = {};
  allSubjects.forEach(s => { subs[s] = { total:0, done:0, overdue:0 }; });
  tasks.forEach(t=>{
    if (!subs[t.subject]) subs[t.subject] = { total:0, done:0, overdue:0 };
    subs[t.subject].total++;
    if (t.done) subs[t.subject].done++;
    if (isOverdue(t)) subs[t.subject].overdue++;
  });
  const keys = Object.keys(subs).filter(s=>!search || s.toLowerCase().includes(search)).sort();
  const sc = document.getElementById('subjectCards');
  if (!sc) return;
  sc.innerHTML = keys.length ? keys.map(s=>{
    const d = subs[s];
    const p = d.total ? Math.round((d.done/d.total)*100) : 0;
    const notesCount = (subjectNotes[s] || []).length;
    return `<div class="subject-card" data-subject="${esc(s)}"><h4>📚 ${esc(s)}</h4><div class="subj-stats"><span>کل: ${d.total}</span><span>انجام: ${d.done}</span><span>عقب: ${d.overdue}</span><span>یادداشت: ${notesCount}</span></div><div class="subj-bar"><div class="subj-fill" style="width:${p}%"></div></div></div>`;
  }).join('') : '<div class="empty-msg">درسی یافت نشد. ابتدا در برنامه هفتگی درس وارد کن.</div>';
}

// ============================================================
//  تقویم
// ============================================================
function renderCalendar() {
  const today = todayShamsi();
  if (!currentCalYear) { currentCalYear = today.year; currentCalMonth = today.month; }
  const monthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
  const ct = document.getElementById('calTitle');
  if (ct) ct.textContent = `${monthNames[currentCalMonth-1]} ${currentCalYear}`;
  const firstG = shamsiToGregorian(currentCalYear, currentCalMonth, 1);
  const firstDate = new Date(firstG.year, firstG.month-1, firstG.day);
  const firstDow = firstDate.getDay();
  let offset;
  if (firstDow === 6) offset = 0; else if (firstDow === 0) offset = 1; else if (firstDow === 1) offset = 2;
  else if (firstDow === 2) offset = 3; else if (firstDow === 3) offset = 4; else if (firstDow === 4) offset = 5; else offset = 6;
  const daysInMonth = currentCalMonth <= 6 ? 31 : (currentCalMonth <= 11 ? 30 : (isLeapShamsi(currentCalYear) ? 30 : 29));
  let html = WEEKDAYS.map(d=>`<div class="cal-head">${d}</div>`).join('');
  for (let i=0; i<offset; i++) html += '<div class="cal-cell empty"></div>';
  for (let d=1; d<=daysInMonth; d++) {
    const isTodayCell = (currentCalYear===today.year && currentCalMonth===today.month && d===today.day);
    const dayTasks = tasks.filter(t=>t.year===currentCalYear && t.month===currentCalMonth && t.day===d);
    let statusCls = ''; let dots = '';
    if (dayTasks.length) {
      const anyOverdue = dayTasks.some(isOverdue);
      const anyUndone = dayTasks.some(t=>!t.done && !isOverdue(t));
      const allDone = dayTasks.every(t=>t.done);
      if (anyOverdue) { statusCls = 'status-overdue'; dots = '<span class="cal-dot dot-overdue"></span>'; }
      else if (anyUndone) { statusCls = 'status-undone'; dots = '<span class="cal-dot dot-undone"></span>'; }
      else if (allDone) { statusCls = 'status-done'; dots = '<span class="cal-dot dot-done"></span>'; }
    }
    html += `<div class="cal-cell ${isTodayCell?'today':''} ${statusCls}" data-day="${d}"><div class="cal-day">${d}</div><div class="cal-dots">${dots}</div></div>`;
  }
  const cg = document.getElementById('calendarGrid');
  if (cg) cg.innerHTML = html;
  const cdd = document.getElementById('calDayDetail');
  if (cdd) cdd.innerHTML = '';
  currentCalDay = null;
}

function showCalendarDay(day) {
  currentCalDay = day;
  const arr = tasks.filter(t=>t.year===currentCalYear && t.month===currentCalMonth && t.day===day);
  const wd = getWeekdayFromShamsi(currentCalYear, currentCalMonth, day);
  const cdd = document.getElementById('calDayDetail');
  if (!cdd) return;
  cdd.innerHTML = `<h3>📅 ${formatShamsi(currentCalYear, currentCalMonth, day)} — ${wd}</h3>${arr.length ? arr.map(t=>renderTaskCard(t)).join('') : '<div class="empty-msg">کاری برای این روز نیست.</div>'}`;
}

function refreshCalendarDay() {
  if (currentCalDay !== null) {
    const day = currentCalDay;
    const arr = tasks.filter(t=>t.year===currentCalYear && t.month===currentCalMonth && t.day===day);
    const wd = getWeekdayFromShamsi(currentCalYear, currentCalMonth, day);
    const cdd = document.getElementById('calDayDetail');
    if (cdd && cdd.innerHTML) {
      cdd.innerHTML = `<h3>📅 ${formatShamsi(currentCalYear, currentCalMonth, day)} — ${wd}</h3>${arr.length ? arr.map(t=>renderTaskCard(t)).join('') : '<div class="empty-msg">کاری برای این روز نیست.</div>'}`;
    }
  }
}

// ============================================================
//  برنامه هفتگی
// ============================================================
function renderSchedule() {
  const s = loadSchedule();
  const tbody = document.getElementById('scheduleBody');
  if (!tbody) return;
  let html = '';
  for (let p=0; p<PERIODS; p++) {
    html += `<tr>`;
    html += `<td class="period-cell"><div class="period-title">زنگ ${p+1}</div><div class="period-times"><input type="text" class="period-time-input" data-p="${p}" data-field="startTime" value="${esc(s.periods[p].startTime)}" placeholder="شروع"><input type="text" class="period-time-input" data-p="${p}" data-field="endTime" value="${esc(s.periods[p].endTime)}" placeholder="پایان"></div></td>`;
    for (let d=0; d<6; d++) {
      const dayData = s.periods[p].days[d] || { subject: '' };
      const dayName = WEEKDAYS_6[d];
      const subject = (dayData.subject || '').trim();
      let cellTasks = [];
      if (subject) cellTasks = tasks.filter(t => { if (t.subject !== subject) return false; if (t.done) return false; return true; });
      cellTasks.sort((a,b)=>{
        const ao = isOverdue(a) ? 0 : 1;
        const bo = isOverdue(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        return shamsiComparable(a.year,a.month,a.day) - shamsiComparable(b.year,b.month,b.day);
      });
      const tasksHtml = cellTasks.map(t => {
        const overdue = isOverdue(t);
        const tCls = overdue ? 'overdue' : '';
        const typeChip = t.workType === 'حضوری' ? '<span class="task-type-chip online">حضوری</span>' : '<span class="task-type-chip offline">آفلاین</span>';
        const dueWd = getWeekdayFromShamsi(t.year, t.month, t.day);
        const isDeliverCell = t.workType === 'حضوری' && t.deliverDay === dayName && t.deliverTime === s.periods[p].startTime;
        const deliverMark = isDeliverCell ? '<span class="schedule-task-deliver">📌</span>' : '';
        return `<div class="schedule-task ${tCls}" data-act="open" data-task-id="${t.id}"><span class="schedule-task-title">${deliverMark} ${esc(t.title)}</span><div class="schedule-task-meta">${typeChip}</div><div class="schedule-task-due">موعد: ${dueWd} ${formatShamsi(t.year,t.month,t.day)}</div></div>`;
      }).join('');
      html += `<td><div class="schedule-cell"><input type="text" class="schedule-subject-input" data-p="${p}" data-d="${d}" value="${esc(subject)}" placeholder="—">${cellTasks.length ? `<div class="schedule-tasks">${tasksHtml}</div>` : ''}${subject ? `<div class="schedule-cell-info" data-subject="${esc(subject)}">مشاهده کارهای ${esc(subject)}</div>` : ''}</div></td>`;
    }
    html += `</tr>`;
  }
  tbody.innerHTML = html;
  tbody.querySelectorAll('.schedule-subject-input').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const s2 = loadSchedule();
      const p = parseInt(inp.dataset.p); const d = parseInt(inp.dataset.d);
      s2.periods[p].days[d].subject = inp.value;
      saveSchedule(s2); renderSchedule(); populateSubjectFilter(); renderSubjects();
    });
  });
  tbody.querySelectorAll('.period-time-input').forEach(inp=>{
    inp.addEventListener('change', ()=>{
      const s2 = loadSchedule();
      const p = parseInt(inp.dataset.p); const field = inp.dataset.field;
      s2.periods[p][field] = inp.value; saveSchedule(s2);
    });
  });
}

// ============================================================
//  آمار
// ============================================================
function renderStatsTables() {
  const subs = {};
  tasks.forEach(t=>{
    if (!subs[t.subject]) subs[t.subject] = { total:0, done:0, undone:0, overdue:0 };
    subs[t.subject].total++;
    if (t.done) subs[t.subject].done++; else subs[t.subject].undone++;
    if (isOverdue(t)) subs[t.subject].overdue++;
  });
  let html = '<thead><tr><th>درس</th><th>کل</th><th>انجام‌شده</th><th>انجام‌نشده</th><th>عقب‌افتاده</th><th>پیشرفت</th></tr></thead><tbody>';
  Object.keys(subs).sort().forEach(s=>{
    const d = subs[s]; const p = d.total ? Math.round((d.done/d.total)*100) : 0;
    html += `<tr><td>${esc(s)}</td><td>${d.total}</td><td>${d.done}</td><td>${d.undone}</td><td>${d.overdue}</td><td>${p}%</td></tr>`;
  });
  html += '</tbody>';
  const s1 = document.getElementById('statsBySubject'); if (s1) s1.innerHTML = html;

  html = '<thead><tr><th>اولویت</th><th>کل</th><th>انجام‌شده</th><th>انجام‌نشده</th></tr></thead><tbody>';
  ['کم','متوسط','زیاد'].forEach(p=>{
    const arr = tasks.filter(t=>t.priority===p);
    html += `<tr><td>${p}</td><td>${arr.length}</td><td>${arr.filter(t=>t.done).length}</td><td>${arr.filter(t=>!t.done).length}</td></tr>`;
  });
  html += '</tbody>';
  const s2 = document.getElementById('statsByPriority'); if (s2) s2.innerHTML = html;

  html = '<thead><tr><th>نوع</th><th>کل</th><th>انجام‌شده</th><th>انجام‌نشده</th></tr></thead><tbody>';
  ['تکلیف','امتحان','پروژه','یادآوری'].forEach(ty=>{
    const arr = tasks.filter(t=>t.type===ty);
    html += `<tr><td>${ty}</td><td>${arr.length}</td><td>${arr.filter(t=>t.done).length}</td><td>${arr.filter(t=>!t.done).length}</td></tr>`;
  });
  html += '</tbody>';
  const s3 = document.getElementById('statsByType'); if (s3) s3.innerHTML = html;

  html = '<thead><tr><th>نوع کار</th><th>کل</th><th>انجام‌شده</th><th>انجام‌نشده</th></tr></thead><tbody>';
  ['حضوری','آفلاین'].forEach(w=>{
    const arr = tasks.filter(t=>t.workType===w);
    html += `<tr><td>${w}</td><td>${arr.length}</td><td>${arr.filter(t=>t.done).length}</td><td>${arr.filter(t=>!t.done).length}</td></tr>`;
  });
  html += '</tbody>';
  const s4 = document.getElementById('statsByWorkType'); if (s4) s4.innerHTML = html;

  html = '<thead><tr><th>روز</th><th>کل</th><th>انجام‌شده</th><th>انجام‌نشده</th></tr></thead><tbody>';
  WEEKDAYS.forEach(w=>{
    const arr = tasks.filter(t=>getWeekdayFromShamsi(t.year,t.month,t.day)===w);
    html += `<tr><td>${w}</td><td>${arr.length}</td><td>${arr.filter(t=>t.done).length}</td><td>${arr.filter(t=>!t.done).length}</td></tr>`;
  });
  html += '</tbody>';
  const s5 = document.getElementById('statsByWeekday'); if (s5) s5.innerHTML = html;
}

function renderTimeStats() {
  const el = document.getElementById('timeStats');
  if (!el) return;
  const totalMin = tasks.reduce((s,t)=>s+(t.estTime||0), 0);
  const weekMin = tasks.filter(isThisWeek).reduce((s,t)=>s+(t.estTime||0), 0);
  const monthMin = tasks.filter(isThisMonth).reduce((s,t)=>s+(t.estTime||0), 0);
  const doneMin = tasks.filter(t=>t.done).reduce((s,t)=>s+(t.estTime||0), 0);
  const undoneMin = tasks.filter(t=>!t.done).reduce((s,t)=>s+(t.estTime||0), 0);
  const fmt = (m) => { if (!m) return '۰ دقیقه'; const h = Math.floor(m/60), mm = m%60; if (h && mm) return `${h} ساعت و ${mm} دقیقه`; if (h) return `${h} ساعت`; return `${mm} دقیقه`; };
  el.innerHTML = `<div class="stat-cards">
    <div class="stat-card"><div class="stat-icon">⏱️</div><div class="stat-info"><span class="stat-num">${fmt(totalMin)}</span><span class="stat-lbl">کل زمان تخمینی</span></div></div>
    <div class="stat-card"><div class="stat-icon">📅</div><div class="stat-info"><span class="stat-num">${fmt(weekMin)}</span><span class="stat-lbl">این هفته</span></div></div>
    <div class="stat-card"><div class="stat-icon">📆</div><div class="stat-info"><span class="stat-num">${fmt(monthMin)}</span><span class="stat-lbl">این ماه</span></div></div>
    <div class="stat-card"><div class="stat-icon">✅</div><div class="stat-info"><span class="stat-num">${fmt(doneMin)}</span><span class="stat-lbl">انجام‌شده</span></div></div>
    <div class="stat-card"><div class="stat-icon">⏳</div><div class="stat-info"><span class="stat-num">${fmt(undoneMin)}</span><span class="stat-lbl">باقی‌مانده</span></div></div>
  </div>`;
}

function calcRangeStats() {
  const yF = parseInt(document.getElementById('sYearFrom').value);
  const mF = parseInt(document.getElementById('sMonthFrom').value);
  const dF = parseInt(document.getElementById('sDayFrom').value);
  const yT = parseInt(document.getElementById('sYearTo').value);
  const mT = parseInt(document.getElementById('sMonthTo').value);
  const dT = parseInt(document.getElementById('sDayTo').value);
  const rr = document.getElementById('rangeResult');
  if (!rr) return;
  if (!isValidShamsi(yF,mF,dF) || !isValidShamsi(yT,mT,dT)) { rr.innerHTML = '<div class="empty-msg">تاریخ معتبر نیست.</div>'; return; }
  const from = shamsiComparable(yF,mF,dF); const to = shamsiComparable(yT,mT,dT);
  if (from > to) { rr.innerHTML = '<div class="empty-msg">تاریخ شروع بعد از پایان است.</div>'; return; }
  const arr = tasks.filter(t=>{ const c = shamsiComparable(t.year,t.month,t.day); return c>=from && c<=to; });
  const done = arr.filter(t=>t.done).length;
  const undone = arr.length - done;
  const overdue = arr.filter(isOverdue).length;
  rr.innerHTML = `<div class="stat-cards"><div class="stat-card"><div class="stat-icon">📋</div><div class="stat-info"><span class="stat-num">${arr.length}</span><span class="stat-lbl">کل</span></div></div><div class="stat-card"><div class="stat-icon">✅</div><div class="stat-info"><span class="stat-num">${done}</span><span class="stat-lbl">انجام‌شده</span></div></div><div class="stat-card"><div class="stat-icon">⏳</div><div class="stat-info"><span class="stat-num">${undone}</span><span class="stat-lbl">انجام‌نشده</span></div></div><div class="stat-card"><div class="stat-icon">⚠️</div><div class="stat-info"><span class="stat-num">${overdue}</span><span class="stat-lbl">عقب‌افتاده</span></div></div></div>`;
}

// ============================================================
//  برنامه روزانه
// ============================================================
function initDailyDate() {
  if (!currentDailyDate) {
    const t = todayShamsi();
    currentDailyDate = { year: t.year, month: t.month, day: t.day };
  }
}

function renderDailyPlan() {
  initDailyDate();
  const { year, month, day } = currentDailyDate;
  const weekday = getWeekdayFromShamsi(year, month, day);
  const titleEl = document.getElementById('dailyDateTitle');
  const weekdayEl = document.getElementById('dailyDateWeekday');
  const listEl = document.getElementById('dailyList');
  if (titleEl) titleEl.textContent = formatShamsiFull(year, month, day);
  if (weekdayEl) weekdayEl.textContent = weekday;
  const items = loadDailyPlan(year, month, day);
  if (!listEl) return;
  if (!items.length) {
    listEl.innerHTML = '<div class="daily-empty">هنوز برنامه‌ای برای این روز ثبت نشده.<br>روی «افزودن برنامه» کلیک کن.</div>';
    return;
  }
  listEl.innerHTML = items.map((item, idx) => `
    <div class="daily-item ${item.done ? 'done' : ''}">
      <div class="daily-item-check ${item.done ? 'checked' : ''}" data-daily-toggle="${idx}">${item.done ? '✓' : ''}</div>
      <div class="daily-item-content">
        <div class="daily-item-title">${esc(item.title)}</div>
        ${item.duration ? `<div class="daily-item-duration">⏱️ ${esc(item.duration)}</div>` : ''}
      </div>
      <div class="daily-item-actions">
        <button class="move-up" data-daily-up="${idx}" title="بالا">⬆️</button>
        <button class="move-down" data-daily-down="${idx}" title="پایین">⬇️</button>
        <button data-daily-edit="${idx}" title="ویرایش">✏️</button>
        <button class="delete" data-daily-delete="${idx}" title="حذف">🗑️</button>
      </div>
    </div>
  `).join('');
}

function addDailyItem(title, duration) {
  const { year, month, day } = currentDailyDate;
  const items = loadDailyPlan(year, month, day);
  items.push({ id: Date.now().toString(36), title, duration, done: false });
  saveDailyPlan(year, month, day, items);
  renderDailyPlan();
}

// ============================================================
//  ناوبری
// ============================================================
const GROUP_TABS = {
  home: [ { id: 'dashboard', label: '🏠 داشبورد' }, { id: 'overview', label: '📊 نمای کلی' } ],
  tasks: [ { id: 'tasks', label: '📋 کارها' }, { id: 'subjects', label: '📚 دروس' }, { id: 'form', label: '➕ افزودن کار' }, { id: 'stats', label: '📊 آمار' } ],
  schedule: [ { id: 'calendar', label: '🗓️ تقویم' }, { id: 'schedule', label: '📅 برنامه هفتگی' }, { id: 'daily', label: '📆 برنامه روزانه' } ],
  more: [ { id: 'note', label: '📝 یادداشت شخصی' }, { id: 'settings', label: '⚙️ تنظیمات' }, { id: 'about', label: 'ℹ️ درباره' } ]
};

function switchGroup(group) {
  document.querySelectorAll('.nav-group-btn').forEach(b => b.classList.toggle('active', b.dataset.group === group));
  localStorage.setItem(K.ACTIVE_GROUP, group);
  const tabs = GROUP_TABS[group] || [];
  const subNav = document.getElementById('subNav');
  if (!subNav) return;
  subNav.innerHTML = tabs.map(t => `<button class="sub-nav-btn" data-tab="${t.id}">${t.label}</button>`).join('');
  subNav.querySelectorAll('.sub-nav-btn').forEach(b => { b.addEventListener('click', () => switchTab(b.dataset.tab)); });
  if (tabs.length) switchTab(tabs[0].id);
}

function switchTab(name) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + name));
  document.querySelectorAll('.sub-nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  localStorage.setItem(K.ACTIVE_TAB, name);
  if (name === 'daily') renderDailyPlan();
}

// ============================================================
//  پنل کنار
// ============================================================
function openSidePanel() {
  document.getElementById('sidePanelOverlay').classList.add('show');
  currentFormStep = 1;
  updateFormStep();
}
function closeSidePanel() { document.getElementById('sidePanelOverlay').classList.remove('show'); }

// ============================================================
//  خروجی‌ها
// ============================================================
function exportTxt() {
  const t0 = todayShamsi();
  let c = '===== مدیریت تکالیف مدرسه =====\n';
  c += `تاریخ: ${formatShamsi(t0.year, t0.month, t0.day)}\n\n`;
  c += `--- آمار کلی ---\nکل: ${tasks.length}\n`;
  ['تکلیف','امتحان','پروژه','یادآوری'].forEach(ty=>{ c += `${ty}: ${tasks.filter(t=>t.type===ty).length}\n`; });
  c += `انجام‌شده: ${tasks.filter(t=>t.done).length}\nعقب‌افتاده: ${tasks.filter(isOverdue).length}\n\n--- لیست کارها ---\n`;
  tasks.forEach((t,i)=>{
    const wd = getWeekdayFromShamsi(t.year,t.month,t.day);
    c += `${i+1}. ${t.title} | ${t.subject} | ${t.workType} | ${t.type} | موعد: ${formatShamsi(t.year,t.month,t.day)} (${wd})`;
    if (t.estTime) c += ` | زمان: ${t.estTime} دقیقه`;
    c += ` | ${t.done?'انجام‌شده':'انجام‌نشده'}${isOverdue(t)?' | ⚠️':''}\n`;
    if (t.subtasks && t.subtasks.length) { t.subtasks.forEach(st => { c += `     ${st.done?'✓':'○'} ${st.title}\n`; }); }
  });
  c += '\n--- یادداشت‌های درسی ---\n';
  Object.keys(subjectNotes).forEach(sub => {
    const notes = subjectNotes[sub] || [];
    if (notes.length) { c += `\n📚 ${sub}:\n`; notes.forEach(n => { c += `  - ${n.title}\n    ${(n.text||'').slice(0,100)}\n`; }); }
  });
  c += '\n--- یادداشت شخصی ---\n' + (loadNote()||'—') + '\n\n--- برنامه هفتگی ---\n';
  const s = loadSchedule();
  for (let p=0; p<PERIODS; p++) {
    c += `زنگ ${p+1} (${s.periods[p].startTime||'?'} - ${s.periods[p].endTime||'?'}): `;
    WEEKDAYS_6.forEach((w,i)=>{ c += `${w}: ${(s.periods[p].days[i].subject)||'—'}  `; });
    c += '\n';
  }
  downloadFile(c, `takalif_${formatShamsi(t0.year,t0.month,t0.day).replace(/\//g,'-')}.txt`, 'text/plain');
  toast('خروجی TXT دانلود شد.', 'success');
}

function exportPdf() { window.print(); }

function backupJson() {
  const data = { tasks, note: loadNote(), schedule: loadSchedule(), tags: allTags, subjectNotes, exportedAt: new Date().toISOString() };
  downloadFile(JSON.stringify(data,null,2), `backup_${Date.now()}.json`, 'application/json');
  toast('بکاپ JSON دانلود شد.', 'success');
}

function restoreJson(file) {
  const r = new FileReader();
  r.onload = e => {
    try {
      const d = JSON.parse(e.target.result);
      if (Array.isArray(d.tasks)) { tasks = d.tasks; saveTasks(); }
      if (typeof d.note === 'string') { saveNote(d.note); const n = document.getElementById('personalNote'); if (n) n.value = d.note; }
      if (d.schedule) saveSchedule(d.schedule);
      if (Array.isArray(d.tags)) { allTags = d.tags; saveTags(); }
      if (d.subjectNotes) { subjectNotes = d.subjectNotes; saveSubjectNotes(); }
      populateSubjectFilter();
      renderAll();
      toast('بازیابی انجام شد.', 'success');
    } catch(err) { toast('فایل نامعتبر است.', 'error'); }
  };
  r.readAsText(file);
}

function downloadFile(content, name, type) {
  const blob = new Blob([content], { type: type + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
//  یادداشت شخصی
// ============================================================
function setupNote() {
  const ta = document.getElementById('personalNote');
  if (!ta) return;
  ta.value = loadNote();
  let t;
  ta.addEventListener('input', ()=>{
    clearTimeout(t);
    t = setTimeout(()=>{
      saveNote(ta.value);
      const s = document.getElementById('noteStatus');
      if (s) { s.textContent = 'ذخیره شد ✓'; s.classList.add('show'); setTimeout(()=>s.classList.remove('show'), 1500); }
    }, 400);
  });
}

// ============================================================
//  تنظیمات
// ============================================================
function updateStorageInfo() {
  let size = 0;
  for (const k in localStorage) { if (localStorage.hasOwnProperty(k)) size += (localStorage[k].length + k.length) * 2; }
  const kb = (size/1024).toFixed(2);
  const el = document.getElementById('storageInfo');
  if (el) el.textContent = `فضای مصرفی localStorage: ${kb} کیلوبایت`;
}

function clearAll() {
  if (!confirm('همه داده‌ها پاک می‌شوند. مطمئنی؟')) return;
  if (!confirm('آخرین تأیید: واقعاً پاک کنم؟')) return;
  const keysToRemove = [];
  for (const k in localStorage) { if (k.startsWith('sd_')) keysToRemove.push(k); }
  keysToRemove.forEach(k => localStorage.removeItem(k));
  tasks = []; allTags = []; expandedTasks = new Set(); subjectNotes = {};
  const n = document.getElementById('personalNote');
  if (n) n.value = '';
  renderAll();
  toast('همه داده‌ها پاک شد.', 'success');
}

function applySettings() {
  const s = loadSettings();
  const fontClasses = ['font-large','font-small'].filter(c => document.body.classList.contains(c));
  fontClasses.forEach(c => document.body.classList.remove(c));
  if (s.fontSize === 'large') document.body.classList.add('font-large');
  else if (s.fontSize === 'small') document.body.classList.add('font-small');
  const elFontSize = document.getElementById('setFontSize'); if (elFontSize && s.fontSize) elFontSize.value = s.fontSize;
  const elDefaultView = document.getElementById('setDefaultView'); if (elDefaultView && s.defaultView) elDefaultView.value = s.defaultView;
  const elAutoSave = document.getElementById('setAutoSave'); if (elAutoSave && s.autoSave !== undefined) elAutoSave.checked = s.autoSave;
  const elViewMode = document.getElementById('fViewMode'); if (elViewMode && s.defaultView) elViewMode.value = s.defaultView;
  updateManualSaveRow();
}

function updateManualSaveRow() {
  const s = loadSettings();
  const row = document.getElementById('manualSaveRow');
  if (row) row.style.display = s.autoSave === false ? 'flex' : 'none';
}

// ============================================================
//  جست‌وجوی سراسری
// ============================================================
function setupGlobalSearch() {
  const input = document.getElementById('globalSearch');
  const results = document.getElementById('globalSearchResults');
  if (!input || !results) return;
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.classList.remove('show'); return; }
    const arr = tasks.filter(t => {
      const hay = (t.title+' '+t.subject+' '+(t.location||'')+' '+(t.description||'')+' '+(t.tags||[]).join(' ')+' '+getAutoTags(t).join(' ')).toLowerCase();
      return hay.includes(q);
    }).slice(0, 10);
    if (!arr.length) results.innerHTML = '<div class="search-result-item">چیزی پیدا نشد.</div>';
    else results.innerHTML = arr.map(t => `<div class="search-result-item" data-search-id="${t.id}"><div class="search-result-title">${esc(t.title)}</div><div class="search-result-meta">${esc(t.subject)} — ${formatShamsi(t.year,t.month,t.day)}</div></div>`).join('');
    results.classList.add('show');
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.global-search')) results.classList.remove('show');
    const item = e.target.closest('[data-search-id]');
    if (item) {
      e.stopPropagation();
      const t = tasks.find(x=>x.id===item.dataset.searchId);
      if (t) { openTaskModal(t); input.value = ''; results.classList.remove('show'); }
    }
  });
}

function openTaskModal(t) {
  const mt = document.getElementById('modalTitle');
  const mb = document.getElementById('modalBody');
  const mo = document.getElementById('modalOverlay');
  if (!mt || !mb || !mo) return;
  mt.textContent = `📌 ${t.title}`;
  mb.innerHTML = renderTaskDetails(t);
  mo.classList.add('show');
}

// ============================================================
//  میانبرها
// ============================================================
function setupShortcuts() {
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const mo = document.getElementById('modalOverlay');
      if (mo) mo.classList.remove('show');
      closeSidePanel();
      return;
    }
    if (!e.altKey || !e.shiftKey) return;
    if (e.ctrlKey || e.metaKey) return;
    if (e.code === 'KeyA' || e.key === 'A' || e.key === 'a') { e.preventDefault(); resetForm(); openSidePanel(); setTimeout(function(){ const el = document.getElementById('fTitle'); if (el) el.focus(); }, 300); return; }
    if (e.code === 'KeyQ' || e.key === 'Q' || e.key === 'q') { e.preventDefault(); switchGroup('home'); return; }
    if (e.code === 'KeyW' || e.key === 'W' || e.key === 'w') { e.preventDefault(); switchGroup('tasks'); return; }
    if (e.code === 'KeyR' || e.key === 'R' || e.key === 'r') { e.preventDefault(); switchGroup('schedule'); return; }
    if (e.code === 'KeyM' || e.key === 'M' || e.key === 'm') { e.preventDefault(); switchGroup('more'); return; }
    if (e.code === 'KeyF' || e.key === 'F' || e.key === 'f') { e.preventDefault(); const gs = document.getElementById('globalSearch'); if (gs) gs.focus(); return; }
    if (e.code === 'KeyY' || e.key === 'Y' || e.key === 'y') { e.preventDefault(); toggleTheme(); return; }
    if (e.code === 'KeyE' || e.key === 'E' || e.key === 'e') { e.preventDefault(); exportTxt(); return; }
    if (e.code === 'KeyH' || e.key === 'H' || e.key === 'h') { e.preventDefault(); backupJson(); return; }
  }, true);
}

// ============================================================
//  آمار بازه‌ای سریع
// ============================================================
function fillRangeInputs(yF,mF,dF,yT,mT,dT) {
  const ids = ['sYearFrom','sMonthFrom','sDayFrom','sYearTo','sMonthTo','sDayTo'];
  const vals = [yF,mF,dF,yT,mT,dT];
  ids.forEach((id,i)=>{ const el = document.getElementById(id); if (el) el.value = vals[i]; });
}

function quickRange(type) {
  const today = todayShamsi();
  const g = shamsiToGregorian(today.year, today.month, today.day);
  const d = new Date(g.year, g.month-1, g.day);
  if (type === 'week') {
    const dow = d.getDay();
    let diff;
    if (dow===6) diff=0; else if (dow===0) diff=1; else if (dow===1) diff=2;
    else if (dow===2) diff=3; else if (dow===3) diff=4; else if (dow===4) diff=5; else diff=6;
    const sat = new Date(d); sat.setDate(d.getDate()-diff);
    const fri = new Date(sat); fri.setDate(sat.getDate()+6);
    const sS = gregorianToShamsi(sat.getFullYear(), sat.getMonth()+1, sat.getDate());
    const fS = gregorianToShamsi(fri.getFullYear(), fri.getMonth()+1, fri.getDate());
    fillRangeInputs(sS.year,sS.month,sS.day,fS.year,fS.month,fS.day);
  } else if (type === 'month') fillRangeInputs(today.year, today.month, 1, today.year, today.month, 30);
  else if (type === 'prevmonth') { let y = today.year, m = today.month - 1; if (m < 1) { m = 12; y--; } fillRangeInputs(y, m, 1, y, m, 30); }
  else if (type === '30days') { const past = new Date(d); past.setDate(d.getDate()-30); const pS = gregorianToShamsi(past.getFullYear(), past.getMonth()+1, past.getDate()); fillRangeInputs(pS.year,pS.month,pS.day,today.year,today.month,today.day); }
  calcRangeStats();
}

// ============================================================
//  رویدادها
// ============================================================
function setupEvents() {
  document.querySelectorAll('.nav-group-btn').forEach(b => { b.addEventListener('click', () => switchGroup(b.dataset.group)); });
  const tf = document.getElementById('taskForm'); if (tf) tf.addEventListener('submit', handleSubmit);
  const bc = document.getElementById('btnCancel'); if (bc) bc.addEventListener('click', resetForm);
  ['fYear','fMonth','fDay'].forEach(id=>{ const el = document.getElementById(id); if (el) el.addEventListener('input', updateWeekdayField); });
  const fwt = document.getElementById('fWorkType'); if (fwt) fwt.addEventListener('change', updateDeliverFields);
  const fs = document.getElementById('fSubject'); if (fs) fs.addEventListener('change', updateDeliverFields);
  const fdd = document.getElementById('fDeliverDay'); if (fdd) fdd.addEventListener('change', updateTimeOptions);
  const bp = document.getElementById('btnPrevStep'); const bn = document.getElementById('btnNextStep');
  if (bp) bp.addEventListener('click', ()=>{ if (currentFormStep > 1) { currentFormStep--; updateFormStep(); } });
  if (bn) bn.addEventListener('click', ()=>{ if (currentFormStep < 4) { currentFormStep++; updateFormStep(); } });
  const bas = document.getElementById('btnAddSubtask'); if (bas) bas.addEventListener('click', ()=>{ formSubtasks.push({ title:'', desc:'', done:false }); renderSubtasksForm(); });
  const sl = document.getElementById('subtasksList');
  if (sl) {
    sl.addEventListener('input', (e)=>{
      const idx = e.target.dataset.subtaskTitle; if (idx !== undefined) formSubtasks[parseInt(idx)].title = e.target.value;
      const didx = e.target.dataset.subtaskDesc; if (didx !== undefined) formSubtasks[parseInt(didx)].desc = e.target.value;
    });
    sl.addEventListener('change', (e)=>{ const idx = e.target.dataset.subtaskToggle; if (idx !== undefined) formSubtasks[parseInt(idx)].done = e.target.checked; });
    sl.addEventListener('click', (e)=>{ const idx = e.target.dataset.subtaskRemove; if (idx !== undefined) { formSubtasks.splice(parseInt(idx), 1); renderSubtasksForm(); } });
  }
  const ti = document.getElementById('fTagInput');
  if (ti) ti.addEventListener('keydown', (e)=>{ if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); const v = ti.value.trim().replace(/^#/, ''); if (v && !formTags.includes(v)) { formTags.push(v); renderTagsForm(); } ti.value = ''; } });
  const tic = document.getElementById('tagsInput'); if (tic) tic.addEventListener('click', (e)=>{ const idx = e.target.dataset.tagRemove; if (idx !== undefined) { formTags.splice(parseInt(idx), 1); renderTagsForm(); } });
  const ts = document.getElementById('tagSuggestions'); if (ts) ts.addEventListener('click', (e)=>{ const t = e.target.dataset.tagAdd; if (t) { if (!formTags.includes(t)) formTags.push(t); renderTagsForm(); } });

  ['fSearch','fFilterSubject','fFilterWorkType','fFilterType','fFilterPriority','fFilterStatus','fFilterTag','fSort','fGroupBy','fViewMode','fYearFrom','fMonthFrom','fDayFrom','fYearTo','fMonthTo','fDayTo'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', renderTasksList); el.addEventListener('change', renderTasksList); }
  });

  document.querySelectorAll('.quick-filters .btn-chip[data-quick]').forEach(b=>{
    b.addEventListener('click', ()=>{
      const q = b.dataset.quick;
      ['fSearch','fFilterSubject','fFilterWorkType','fFilterType','fFilterPriority','fFilterStatus','fFilterTag','fYearFrom','fMonthFrom','fDayFrom','fYearTo','fMonthTo','fDayTo'].forEach(id=>{ const el = document.getElementById(id); if (el) el.value = ''; });
      const today = todayShamsi();
      if (q === 'today') { document.getElementById('fYearFrom').value = today.year; document.getElementById('fMonthFrom').value = today.month; document.getElementById('fDayFrom').value = today.day; document.getElementById('fYearTo').value = today.year; document.getElementById('fMonthTo').value = today.month; document.getElementById('fDayTo').value = today.day; }
      else if (q === 'week') {
        const g = shamsiToGregorian(today.year, today.month, today.day);
        const d = new Date(g.year, g.month-1, g.day);
        const dow = d.getDay(); let diff;
        if (dow===6) diff=0; else if (dow===0) diff=1; else if (dow===1) diff=2; else if (dow===2) diff=3; else if (dow===3) diff=4; else if (dow===4) diff=5; else diff=6;
        const sat = new Date(d); sat.setDate(d.getDate()-diff);
        const fri = new Date(sat); fri.setDate(sat.getDate()+6);
        const sS = gregorianToShamsi(sat.getFullYear(), sat.getMonth()+1, sat.getDate());
        const fS = gregorianToShamsi(fri.getFullYear(), fri.getMonth()+1, fri.getDate());
        document.getElementById('fYearFrom').value = sS.year; document.getElementById('fMonthFrom').value = sS.month; document.getElementById('fDayFrom').value = sS.day;
        document.getElementById('fYearTo').value = fS.year; document.getElementById('fMonthTo').value = fS.month; document.getElementById('fDayTo').value = fS.day;
      }
      else if (q === 'month') { document.getElementById('fYearFrom').value = today.year; document.getElementById('fMonthFrom').value = today.month; document.getElementById('fDayFrom').value = 1; document.getElementById('fYearTo').value = today.year; document.getElementById('fMonthTo').value = today.month; document.getElementById('fDayTo').value = 30; }
      else if (q === 'overdue') document.getElementById('fFilterStatus').value = 'overdue';
      else if (q === 'done') document.getElementById('fFilterStatus').value = 'done';
      else if (q === 'undone') document.getElementById('fFilterStatus').value = 'undone';
      else if (q === 'high') document.getElementById('fFilterPriority').value = 'زیاد';
      renderTasksList();
    });
  });

  document.querySelectorAll('.subtab').forEach(b=>{
    b.addEventListener('click', ()=>{
      document.querySelectorAll('.subtab').forEach(x=>x.classList.remove('active'));
      b.classList.add('active'); currentSubtab = b.dataset.subtab;
      const today = todayShamsi();
      if (currentSubtab === 'today') { document.getElementById('fYearFrom').value = today.year; document.getElementById('fMonthFrom').value = today.month; document.getElementById('fDayFrom').value = today.day; document.getElementById('fYearTo').value = today.year; document.getElementById('fMonthTo').value = today.month; document.getElementById('fDayTo').value = today.day; }
      else if (currentSubtab === 'week') {
        const g = shamsiToGregorian(today.year, today.month, today.day);
        const d = new Date(g.year, g.month-1, g.day); const dow = d.getDay(); let diff;
        if (dow===6) diff=0; else if (dow===0) diff=1; else if (dow===1) diff=2; else if (dow===2) diff=3; else if (dow===3) diff=4; else if (dow===4) diff=5; else diff=6;
        const sat = new Date(d); sat.setDate(d.getDate()-diff); const fri = new Date(sat); fri.setDate(sat.getDate()+6);
        const sS = gregorianToShamsi(sat.getFullYear(), sat.getMonth()+1, sat.getDate());
        const fS = gregorianToShamsi(fri.getFullYear(), fri.getMonth()+1, fri.getDate());
        document.getElementById('fYearFrom').value = sS.year; document.getElementById('fMonthFrom').value = sS.month; document.getElementById('fDayFrom').value = sS.day;
        document.getElementById('fYearTo').value = fS.year; document.getElementById('fMonthTo').value = fS.month; document.getElementById('fDayTo').value = fS.day;
      } else { ['fYearFrom','fMonthFrom','fDayFrom','fYearTo','fMonthTo','fDayTo'].forEach(id=>{ const el = document.getElementById(id); if (el) el.value = ''; }); }
      renderTasksList();
    });
  });

  document.addEventListener('click', e=>{
    // زیرکار inline
    const sm = e.target.closest('[data-show-more]');
    if (sm) { const id = sm.dataset.showMore; if (expandedTasks.has(id)) expandedTasks.delete(id); else expandedTasks.add(id); saveExpanded(); renderTasksList(); return; }
    const sti = e.target.closest('[data-subtask-toggle-inline]');
    if (sti) { const tid = sti.dataset.subtaskToggleInline; const idx = parseInt(sti.dataset.subtaskIndex); const t = tasks.find(x=>x.id===tid); if (t && t.subtasks[idx]) { t.subtasks[idx].done = !t.subtasks[idx].done; saveTasks(); renderAll(); toast(t.subtasks[idx].done?'زیرکار انجام شد.':'برگشت.', 'success'); } return; }
    const sri = e.target.closest('[data-subtask-remove-inline]');
    if (sri) { const tid = sri.dataset.subtaskRemoveInline; const idx = parseInt(sri.dataset.subtaskIndex); const t = tasks.find(x=>x.id===tid); if (t && t.subtasks[idx]) { if (confirm('حذف شود؟')) { t.subtasks.splice(idx, 1); saveTasks(); renderAll(); toast('حذف شد.', 'info'); } } return; }
    const sai = e.target.closest('[data-subtask-add-inline]');
    if (sai) { const tid = sai.dataset.subtaskAddInline; const t = tasks.find(x=>x.id===tid); if (!t) return; const title = prompt('عنوان زیرکار جدید:'); if (title && title.trim()) { if (!t.subtasks) t.subtasks = []; t.subtasks.push({ title: title.trim(), desc: '', done: false }); saveTasks(); renderAll(); toast('اضافه شد.', 'success'); } return; }
    const std = e.target.closest('[data-subtask-toggle-detail]');
    if (std) { const tid = std.dataset.subtaskToggleDetail; const idx = parseInt(std.dataset.subtaskIndex); const t = tasks.find(x=>x.id===tid); if (t && t.subtasks[idx]) { t.subtasks[idx].done = !t.subtasks[idx].done; saveTasks(); renderAll(); openTaskModal(t); toast(t.subtasks[idx].done?'انجام شد.':'برگشت.', 'success'); } return; }
    const srd = e.target.closest('[data-subtask-remove-detail]');
    if (srd) { const tid = srd.dataset.subtaskRemoveDetail; const idx = parseInt(srd.dataset.subtaskIndex); const t = tasks.find(x=>x.id===tid); if (t && t.subtasks[idx]) { if (confirm('حذف شود؟')) { t.subtasks.splice(idx, 1); saveTasks(); renderAll(); openTaskModal(t); toast('حذف شد.', 'info'); } } return; }
    const sad = e.target.closest('[data-subtask-add-detail]');
    if (sad) { const tid = sad.dataset.subtaskAddDetail; const t = tasks.find(x=>x.id===tid); if (!t) return; const title = prompt('عنوان زیرکار جدید:'); if (title && title.trim()) { if (!t.subtasks) t.subtasks = []; t.subtasks.push({ title: title.trim(), desc: '', done: false }); saveTasks(); renderAll(); openTaskModal(t); toast('اضافه شد.', 'success'); } return; }

    // دکمه‌های act
    const btn = e.target.closest('[data-act]');
    if (btn) {
      const act = btn.dataset.act; const id = btn.dataset.id || btn.dataset.taskId;
      if (act === 'open') { const t = tasks.find(x=>x.id===id); if (t) openTaskModal(t); return; }
      if (act === 'toggle' || act === 'modal-toggle') { const t = tasks.find(x=>x.id===id); if (t) { t.done = !t.done; saveTasks(); renderAll(); if (act === 'modal-toggle') openTaskModal(t); toast(t.done?'انجام شد.':'برگشت.', 'success'); } return; }
      if (act === 'edit') { const t = tasks.find(x=>x.id===id); if (t) { document.getElementById('modalOverlay').classList.remove('show'); fillForm(t); openSidePanel(); } return; }
      if (act === 'delete') { const removed = tasks.find(x=>x.id===id); if (!removed) return; tasks = tasks.filter(x=>x.id!==id); saveTasks(); populateSubjectFilter(); renderAll(); document.getElementById('modalOverlay').classList.remove('show'); lastDeletedTask = removed; toast('حذف شد.', 'info', { label: 'بازگردانی', callback: () => { if (lastDeletedTask) { tasks.push(lastDeletedTask); saveTasks(); populateSubjectFilter(); renderAll(); toast('بازگردانی شد.', 'success'); lastDeletedTask = null; } } }); return; }
    }

    // درس‌ها
    const sc = e.target.closest('.subject-card');
    if (sc) { openSubjectPage(sc.dataset.subject); return; }
    const ci = e.target.closest('.schedule-cell-info');
    if (ci) { openSubjectPage(ci.dataset.subject); return; }

    // تب‌های داخلی درس
    const stb = e.target.closest('.subject-tab-btn');
    if (stb) {
      const subj = stb.closest('.subject-page');
      if (subj) {
        subj.querySelectorAll('.subject-tab-btn').forEach(x => x.classList.remove('active'));
        stb.classList.add('active');
        const tabName = stb.dataset.subjectTab;
        subj.querySelectorAll('.subject-tab-content').forEach(x => x.classList.toggle('active', x.dataset.subjectContent === tabName));
      }
      return;
    }

    // یادداشت
    const na = e.target.closest('[data-note-add]');
    if (na) { const subject = na.dataset.noteAdd; const title = prompt('عنوان یادداشت:'); if (title && title.trim()) { const text = prompt('متن یادداشت:') || ''; if (!subjectNotes[subject]) subjectNotes[subject] = []; subjectNotes[subject].push({ id: Date.now().toString(36) + Math.random().toString(36).slice(2,7), title: title.trim(), text: text.trim(), tags: [], createdAt: Date.now() }); saveSubjectNotes(); openSubjectPage(subject); renderSubjects(); toast('یادداشت اضافه شد.', 'success'); } return; }
    const ne = e.target.closest('[data-note-edit]');
    if (ne) { const noteId = ne.dataset.noteEdit; const subject = currentSubjectPage; if (!subject || !subjectNotes[subject]) return; const note = subjectNotes[subject].find(n => n.id === noteId); if (!note) return; const title = prompt('عنوان جدید:', note.title); if (title === null) return; const text = prompt('متن جدید:', note.text || ''); if (text === null) return; note.title = title.trim() || note.title; note.text = text.trim(); saveSubjectNotes(); openSubjectPage(subject); toast('بروزرسانی شد.', 'success'); return; }
    const nd = e.target.closest('[data-note-delete]');
    if (nd) { const noteId = nd.dataset.noteDelete; const subject = currentSubjectPage; if (!subject || !subjectNotes[subject]) return; if (!confirm('این یادداشت حذف شود؟')) return; subjectNotes[subject] = subjectNotes[subject].filter(n => n.id !== noteId); saveSubjectNotes(); openSubjectPage(subject); renderSubjects(); toast('حذف شد.', 'info'); return; }

    // تقویم
    const cc = e.target.closest('.cal-cell:not(.empty)');
    if (cc && cc.dataset.day) { showCalendarDay(parseInt(cc.dataset.day)); return; }
    const go = e.target.closest('[data-goto]');
    if (go) { switchGroup('tasks'); setTimeout(()=>switchTab(go.dataset.goto), 50); const q = go.dataset.quick; if (q) setTimeout(()=>{ const qb = document.querySelector(`.quick-filters .btn-chip[data-quick="${q}"]`); if (qb) qb.click(); }, 100); return; }
    const dis = e.target.closest('[data-dismiss]');
    if (dis) { dis.closest('.alert-item').remove(); return; }

    // برنامه روزانه
    const dt = e.target.closest('[data-daily-toggle]');
    if (dt) { const idx = parseInt(dt.dataset.dailyToggle); const { year, month, day } = currentDailyDate; const items = loadDailyPlan(year, month, day); if (items[idx]) { items[idx].done = !items[idx].done; saveDailyPlan(year, month, day, items); renderDailyPlan(); toast(items[idx].done?'انجام شد.':'برگشت.', 'success'); } return; }
    const dup = e.target.closest('[data-daily-up]');
    if (dup) { const idx = parseInt(dup.dataset.dailyUp); if (idx > 0) { const { year, month, day } = currentDailyDate; const items = loadDailyPlan(year, month, day); [items[idx-1], items[idx]] = [items[idx], items[idx-1]]; saveDailyPlan(year, month, day, items); renderDailyPlan(); } return; }
    const ddn = e.target.closest('[data-daily-down]');
    if (ddn) { const idx = parseInt(ddn.dataset.dailyDown); const { year, month, day } = currentDailyDate; const items = loadDailyPlan(year, month, day); if (idx < items.length - 1) { [items[idx+1], items[idx]] = [items[idx], items[idx+1]]; saveDailyPlan(year, month, day, items); renderDailyPlan(); } return; }
    const de = e.target.closest('[data-daily-edit]');
    if (de) { const idx = parseInt(de.dataset.dailyEdit); const { year, month, day } = currentDailyDate; const items = loadDailyPlan(year, month, day); const item = items[idx]; if (!item) return; const title = prompt('عنوان جدید:', item.title); if (title === null) return; const duration = prompt('مدت زمان:', item.duration || ''); if (duration === null) return; item.title = title.trim() || item.title; item.duration = duration.trim(); saveDailyPlan(year, month, day, items); renderDailyPlan(); toast('بروزرسانی شد.', 'success'); return; }
    const dd = e.target.closest('[data-daily-delete]');
    if (dd) { const idx = parseInt(dd.dataset.dailyDelete); if (confirm('این برنامه حذف شود؟')) { const { year, month, day } = currentDailyDate; const items = loadDailyPlan(year, month, day); items.splice(idx, 1); saveDailyPlan(year, month, day, items); renderDailyPlan(); toast('حذف شد.', 'info'); } return; }
  });

  const mc = document.getElementById('modalClose'); if (mc) mc.addEventListener('click', ()=>document.getElementById('modalOverlay').classList.remove('show'));
  const mo = document.getElementById('modalOverlay'); if (mo) mo.addEventListener('click', e=>{ if (e.target.id === 'modalOverlay') document.getElementById('modalOverlay').classList.remove('show'); });
  const spc = document.getElementById('sidePanelClose'); if (spc) spc.addEventListener('click', closeSidePanel);
  const spo = document.getElementById('sidePanelOverlay'); if (spo) spo.addEventListener('click', e=>{ if (e.target.id === 'sidePanelOverlay') closeSidePanel(); });

  const cp = document.getElementById('calPrev'); const cn = document.getElementById('calNext'); const ctd = document.getElementById('calToday');
  if (cp) cp.addEventListener('click', ()=>{ currentCalMonth--; if (currentCalMonth < 1) { currentCalMonth = 12; currentCalYear--; } renderCalendar(); });
  if (cn) cn.addEventListener('click', ()=>{ currentCalMonth++; if (currentCalMonth > 12) { currentCalMonth = 1; currentCalYear++; } renderCalendar(); });
  if (ctd) ctd.addEventListener('click', ()=>{ const t = todayShamsi(); currentCalYear = t.year; currentCalMonth = t.month; renderCalendar(); });

  const ss = document.getElementById('subjectSearch'); if (ss) ss.addEventListener('input', renderSubjects);

  const brs = document.getElementById('btnRangeStats'); if (brs) brs.addEventListener('click', calcRangeStats);
  document.querySelectorAll('.quick-filters .btn-chip[data-range]').forEach(b=>{ b.addEventListener('click', ()=>quickRange(b.dataset.range)); });

  const ex1 = document.getElementById('btnExportTxt'); const ex2 = document.getElementById('btnExportTxt2');
  const ep1 = document.getElementById('btnExportPdf'); const ep2 = document.getElementById('btnExportPdf2');
  const bk1 = document.getElementById('btnBackup'); const bk2 = document.getElementById('btnBackup2');
  const rs1 = document.getElementById('btnRestore'); const rs2 = document.getElementById('btnRestore2');
  const fr = document.getElementById('fileRestore');
  if (ex1) ex1.addEventListener('click', exportTxt); if (ex2) ex2.addEventListener('click', exportTxt);
  if (ep1) ep1.addEventListener('click', exportPdf); if (ep2) ep2.addEventListener('click', exportPdf);
  if (bk1) bk1.addEventListener('click', backupJson); if (bk2) bk2.addEventListener('click', backupJson);
  if (rs1) rs1.addEventListener('click', ()=>document.getElementById('fileRestore').click());
  if (rs2) rs2.addEventListener('click', ()=>document.getElementById('fileRestore').click());
  if (fr) fr.addEventListener('change', e=>{ if (e.target.files[0]) { restoreJson(e.target.files[0]); e.target.value = ''; } });

  const ca = document.getElementById('btnClearAll'); if (ca) ca.addEventListener('click', clearAll);
  const fab = document.getElementById('fabAdd'); if (fab) fab.addEventListener('click', ()=>{ resetForm(); openSidePanel(); setTimeout(()=>document.getElementById('fTitle').focus(), 300); });
  const bof = document.getElementById('btnOpenForm'); if (bof) bof.addEventListener('click', ()=>{ resetForm(); openSidePanel(); setTimeout(()=>document.getElementById('fTitle').focus(), 300); });

  // برنامه روزانه
  const dPrev = document.getElementById('dailyPrev');
  const dNext = document.getElementById('dailyNext');
  const dToday = document.getElementById('dailyToday');
  const dAdd = document.getElementById('dailyAddBtn');
  if (dPrev) dPrev.addEventListener('click', ()=>{ const nd = addDaysToShamsi(currentDailyDate.year, currentDailyDate.month, currentDailyDate.day, -1); currentDailyDate = nd; renderDailyPlan(); });
  if (dNext) dNext.addEventListener('click', ()=>{ const nd = addDaysToShamsi(currentDailyDate.year, currentDailyDate.month, currentDailyDate.day, 1); currentDailyDate = nd; renderDailyPlan(); });
  if (dToday) dToday.addEventListener('click', ()=>{ const t = todayShamsi(); currentDailyDate = { year: t.year, month: t.month, day: t.day }; renderDailyPlan(); });
  if (dAdd) dAdd.addEventListener('click', ()=>{
    const { year, month, day } = currentDailyDate;
    const items = loadDailyPlan(year, month, day);
    const newIdx = items.length;
    items.push({ id: Date.now().toString(36), title: '', duration: '', done: false });
    saveDailyPlan(year, month, day, items);
    renderDailyPlan();
    setTimeout(() => {
      const listEl = document.getElementById('dailyList');
      if (!listEl) return;
      const lastItem = listEl.children[newIdx];
      if (!lastItem) return;
      const title = prompt('عنوان برنامه:');
      if (title && title.trim()) {
        const duration = prompt('مدت زمان (اختیاری):') || '';
        items[newIdx].title = title.trim();
        items[newIdx].duration = duration.trim();
        saveDailyPlan(year, month, day, items);
        renderDailyPlan();
        toast('برنامه اضافه شد.', 'success');
      } else {
        items.pop();
        saveDailyPlan(year, month, day, items);
        renderDailyPlan();
      }
    }, 50);
  });

  // تنظیمات
  const sas = document.getElementById('setAutoSave'); if (sas) sas.addEventListener('change', e=>{ const s = loadSettings(); s.autoSave = e.target.checked; saveSettings(s); updateManualSaveRow(); toast(e.target.checked ? 'ذخیره خودکار روشن شد.' : 'خاموش شد.', 'info'); });
  const sdv = document.getElementById('setDefaultView'); if (sdv) sdv.addEventListener('change', e=>{ const s = loadSettings(); s.defaultView = e.target.value; saveSettings(s); const el = document.getElementById('fViewMode'); if (el) el.value = e.target.value; });
  const sfs = document.getElementById('setFontSize'); if (sfs) sfs.addEventListener('change', e=>{ const s = loadSettings(); s.fontSize = e.target.value; saveSettings(s); document.body.classList.remove('font-large','font-small'); if (e.target.value === 'large') document.body.classList.add('font-large'); else if (e.target.value === 'small') document.body.classList.add('font-small'); });
  const bms = document.getElementById('btnManualSave'); if (bms) bms.addEventListener('click', ()=>{ if (forceSaveTasks()) toast('ذخیره شد.', 'success'); });
}

// ============================================================
//  راه‌اندازی
// ============================================================
document.addEventListener('DOMContentLoaded', ()=>{
  loadTheme();
  SupaClient.loadSession();
  updateAuthUI();
  loadTasks();
  loadTags();
  loadExpanded();
  loadSubjectNotes();
  applySettings();
  renderThemeGrid();
  renderThemeDropdown();
  setupThemeEvents();
  populateSubjectFilter();
  setupNote();
  setupEvents();
  setupGlobalSearch();
  setupShortcuts();
  renderAll();

  const t = todayShamsi();
  currentDailyDate = { year: t.year, month: t.month, day: t.day };

  const td = document.getElementById('todayDate');
  const tw = document.getElementById('todayWeekday');
  if (td) td.textContent = `امروز: ${formatShamsi(t.year,t.month,t.day)}`;
  if (tw) tw.textContent = getWeekdayFromShamsi(t.year,t.month,t.day);

  const savedGroup = localStorage.getItem(K.ACTIVE_GROUP) || 'home';
  switchGroup(savedGroup);
  const savedTab = localStorage.getItem(K.ACTIVE_TAB);
  if (savedTab) setTimeout(()=>switchTab(savedTab), 100);
});
