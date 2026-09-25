// ============================================================
//  Sync — همگام‌سازی با Supabase
//  نسخه ۴.۰ — کامل و بی‌نقص
// ============================================================


let isSyncing = false;
let lastSyncTime = 0;
let pendingSyncToCloud = false;
let autoSyncInterval = null;

// ============================================================
//  ارسال داده‌ها به ابر
// ============================================================
async function syncToCloud(force = false) {
  if (!SupaClient.isLoggedIn()) {
    if (force) toast('اول وارد شو.', 'warn');
    return false;
  }
  if (isSyncing) {
    pendingSyncToCloud = true;
    return false;
  }
  isSyncing = true;
  const uid = SupaClient.getUserId();
  try {
    // ---- ۱. کارها ----
    const localTaskIds = new Set();
    for (const t of tasks) {
      const cloudId = t.cloudId;
      const row = {
        user_id: uid, title: t.title, subject: t.subject,
        work_type: t.workType || 'حضوری', type: t.type || 'تکلیف',
        location: t.location || '', description: t.description || '',
        year: t.year, month: t.month, day: t.day,
        time: t.time || '', priority: t.priority || 'متوسط',
        est_time: t.estTime || 0, done: t.done || false,
        updated_at: new Date().toISOString()
      };
      if (cloudId) {
        await SupaClient.update('tasks', `id=eq.${cloudId}`, row);
        localTaskIds.add(cloudId);
      } else {
        const res = await SupaClient.insert('tasks', row);
        if (res && res[0]) {
          t.cloudId = res[0].id;
          localTaskIds.add(res[0].id);
        }
      }
      if (t.cloudId) {
        await SupaClient.delete('subtasks', `task_id=eq.${t.cloudId}`);
        if (t.subtasks && t.subtasks.length) {
          for (const s of t.subtasks) {
            await SupaClient.insert('subtasks', {
              task_id: t.cloudId, title: s.title,
              sub_desc: s.desc || '', done: s.done || false, ord: 0
            });
          }
        }
        await SupaClient.delete('tags', `task_id=eq.${t.cloudId}`);
        if (t.tags && t.tags.length) {
          for (const tag of t.tags) {
            await SupaClient.insert('tags', { task_id: t.cloudId, tag: tag });
          }
        }
      }
    }
    // حذف کارهای حذف‌شده
    const cloudTasks = await SupaClient.select('tasks', `user_id=eq.${uid}`);
    if (cloudTasks) {
      for (const ct of cloudTasks) {
        if (!localTaskIds.has(ct.id)) {
          await SupaClient.delete('tasks', `id=eq.${ct.id}`);
        }
      }
    }

    // ---- ۲. برنامه هفتگی ----
    const s = loadSchedule();
    const cloudSched = await SupaClient.select('schedule', `user_id=eq.${uid}`);
    const cloudGrid = {};
    if (cloudSched) for (const r of cloudSched) cloudGrid[`${r.day}-${r.period}`] = r;
    for (let p = 0; p < PERIODS; p++) {
      for (let d = 0; d < 6; d++) {
        const subj = (s.periods[p].days[d].subject || '').trim();
        const key = `${d}-${p+1}`;
        const existing = cloudGrid[key];
        if (existing) {
          if (existing.subject !== subj) {
            await SupaClient.update('schedule', `id=eq.${existing.id}`, {subject: subj});
          }
        } else if (subj) {
          await SupaClient.insert('schedule', { user_id: uid, period: p + 1, day: d, subject: subj });
        }
      }
    }

    // ---- ۳. یادداشت‌های درسی ----
    const localNoteIds = new Set();
    for (const subj in subjectNotes) {
      if (subj === '__personal__') continue;
      for (const n of subjectNotes[subj]) {
        const row = {
          user_id: uid, subject: subj, title: n.title,
          text: n.text || '', created_at: n.createdAt || new Date().toISOString()
        };
        if (n.cloudId) {
          await SupaClient.update('subject_notes', `id=eq.${n.cloudId}`, row);
          localNoteIds.add(n.cloudId);
        } else {
          const res = await SupaClient.insert('subject_notes', row);
          if (res && res[0]) {
            n.cloudId = res[0].id;
            localNoteIds.add(res[0].id);
          }
        }
      }
    }
    // یادداشت شخصی
    const personalNoteText = loadNote();
    const cloudPersonal = await SupaClient.select('subject_notes', `user_id=eq.${uid}&subject=eq.__personal__`);
    if (cloudPersonal && cloudPersonal.length > 0) {
      await SupaClient.update('subject_notes', `id=eq.${cloudPersonal[0].id}`, {
        title: 'یادداشت شخصی', text: personalNoteText
      });
      localNoteIds.add(cloudPersonal[0].id);
    } else if (personalNoteText) {
      const res = await SupaClient.insert('subject_notes', {
        user_id: uid, subject: '__personal__', title: 'یادداشت شخصی', text: personalNoteText
      });
      if (res && res[0]) localNoteIds.add(res[0].id);
    }
    // حذف یادداشت‌های حذف‌شده
    const cloudNotes = await SupaClient.select('subject_notes', `user_id=eq.${uid}`);
    if (cloudNotes) {
      for (const cn of cloudNotes) {
        if (!localNoteIds.has(cn.id)) {
          await SupaClient.delete('subject_notes', `id=eq.${cn.id}`);
        }
      }
    }
    saveSubjectNotes();

    // ---- ۴. برنامه روزانه ----
    const localDailyIds = new Set();
    for (const key in dailyPlans) {
      const items = dailyPlans[key] || [];
      const parts = key.split('-');
      if (parts.length !== 3) continue;
      const y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);
      for (const it of items) {
        const row = {
          user_id: uid, year: y, month: m, day: d,
          title: it.title, duration: it.duration || '',
          done: it.done || false, ord: 0
        };
        if (it.cloudId) {
          await SupaClient.update('daily_plans', `id=eq.${it.cloudId}`, row);
          localDailyIds.add(it.cloudId);
        } else {
          const res = await SupaClient.insert('daily_plans', row);
          if (res && res[0]) {
            it.cloudId = res[0].id;
            localDailyIds.add(res[0].id);
          }
        }
      }
    }
    const cloudDaily = await SupaClient.select('daily_plans', `user_id=eq.${uid}`);
    if (cloudDaily) {
      for (const cd of cloudDaily) {
        if (!localDailyIds.has(cd.id)) {
          await SupaClient.delete('daily_plans', `id=eq.${cd.id}`);
        }
      }
    }
    saveDailyPlans();

    // ---- ۵. ذخیره محلی ----
    saveLocalCopy();
    lastSyncTime = Date.now();
    return true;
  } catch(e) {
    console.error('Sync error:', e);
    if (force) toast('خطا در همگام‌سازی: ' + e.message, 'error');
    return false;
  } finally {
    isSyncing = false;
    if (pendingSyncToCloud) {
      pendingSyncToCloud = false;
      setTimeout(() => syncToCloud(), 200);
    }
  }
}

// ============================================================
//  دریافت داده‌ها از ابر
// ============================================================
async function syncFromCloud() {
  if (!SupaClient.isLoggedIn()) return false;
  if (isSyncing) return false;
  isSyncing = true;
  const uid = SupaClient.getUserId();
  try {
    // ---- ۱. کارها ----
    const cloudTasks = await SupaClient.select('tasks', `user_id=eq.${uid}&order=created_at.desc`);
    const newTasks = [];
    if (cloudTasks) {
      for (const t of cloudTasks) {
        const subs = await SupaClient.select('subtasks', `task_id=eq.${t.id}`) || [];
        const tags = await SupaClient.select('tags', `task_id=eq.${t.id}`) || [];
        newTasks.push({
          id: t.id, cloudId: t.id, title: t.title, subject: t.subject,
          workType: t.work_type, type: t.type, location: t.location,
          description: t.description, year: t.year, month: t.month, day: t.day,
          time: t.time, priority: t.priority, estTime: t.est_time || 0,
          done: t.done,
          subtasks: subs.map(s => ({ id: s.id, cloudId: s.id, title: s.title, desc: s.sub_desc, done: s.done })),
          tags: tags.map(x => x.tag)
        });
      }
    }
    tasks = newTasks;

    // ---- ۲. برنامه هفتگی ----
    const cloudSched = await SupaClient.select('schedule', `user_id=eq.${uid}`);
    const s = defaultSchedule();
    if (cloudSched) {
      for (const r of cloudSched) {
        const p = r.period - 1;
        const d = r.day;
        if (s.periods[p] && s.periods[p].days[d]) {
          s.periods[p].days[d].subject = r.subject;
        }
      }
    }
    saveSchedule(s);

    // ---- ۳. یادداشت‌ها ----
    const cloudNotes = await SupaClient.select('subject_notes', `user_id=eq.${uid}`);
    subjectNotes = {};
    let personalNoteText = '';
    if (cloudNotes) {
      for (const n of cloudNotes) {
        if (n.subject === '__personal__') {
          personalNoteText = n.text || '';
          continue;
        }
        if (!subjectNotes[n.subject]) subjectNotes[n.subject] = [];
        subjectNotes[n.subject].push({
          id: n.id, cloudId: n.id, title: n.title, text: n.text,
          tags: [], createdAt: n.created_at
        });
      }
    }
    saveSubjectNotes();
    if (personalNoteText !== undefined) {
      saveNote(personalNoteText);
      const ta = document.getElementById('personalNote');
      if (ta) ta.value = personalNoteText;
    }

    // ---- ۴. برنامه روزانه ----
    const cloudDaily = await SupaClient.select('daily_plans', `user_id=eq.${uid}`);
    dailyPlans = {};
    if (cloudDaily) {
      for (const x of cloudDaily) {
        const key = `${x.year}-${String(x.month).padStart(2,'0')}-${String(x.day).padStart(2,'0')}`;
        if (!dailyPlans[key]) dailyPlans[key] = [];
        dailyPlans[key].push({
          id: x.id, cloudId: x.id, title: x.title,
          duration: x.duration, done: x.done
        });
      }
    }
    saveDailyPlans();

    saveLocalCopy();
    populateSubjectFilter();
    renderAll();
    lastSyncTime = Date.now();
    return true;
  } catch(e) {
    console.error('Sync from cloud error:', e);
    return false;
  } finally {
    isSyncing = false;
  }
}

// ============================================================
//  Auto-sync
// ============================================================
function startAutoSync() {
  if (autoSyncInterval) clearInterval(autoSyncInterval);
  autoSyncInterval = setInterval(() => {
    if (typeof SupaClient !== 'undefined' && SupaClient.isLoggedIn() && !isSyncing) {
      syncFromCloud().catch(() => {});
    }
  }, 10000);
}

function stopAutoSync() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
  }
}

// ============================================================
//  کمکی
// ============================================================
function saveLocalCopy() {
  try {
    localStorage.setItem('sd_tasks', JSON.stringify(tasks));
    localStorage.setItem('sd_schedule', JSON.stringify(loadSchedule()));
    localStorage.setItem('sd_subject_notes', JSON.stringify(subjectNotes));
    localStorage.setItem('sd_daily_all', JSON.stringify(dailyPlans));
  } catch(e) {
    console.error('saveLocalCopy error:', e);
  }
}

function loadFromLocalStorage() {
  loadTasks();
  loadSubjectNotes();
  loadDailyPlans();
  loadTags();
  populateSubjectFilter();
}

function clearLocalData() {
  localStorage.removeItem('sd_tasks');
  localStorage.removeItem('sd_schedule');
  localStorage.removeItem('sd_subject_notes');
  localStorage.removeItem('sd_daily_all');
  localStorage.removeItem('sd_tags');
  localStorage.removeItem('sd_note');
  tasks = [];
  subjectNotes = {};
  dailyPlans = {};
  allTags = [];
}
