// ============================================================
//  Sync — همگام‌سازی با Supabase
//  نسخه ۳.۵ — با ساختار جدید
// ============================================================

async function syncToCloud(force = false) {
  if (!SupaClient.isLoggedIn()) {
    if (force) toast('اول وارد شو.', 'warn');
    return false;
  }
  const uid = SupaClient.getUserId();
  try {
    // ۱. کارها
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
      } else {
        const res = await SupaClient.insert('tasks', row);
        if (res && res[0]) t.cloudId = res[0].id;
      }
      if (t.cloudId && t.subtasks && t.subtasks.length) {
        await SupaClient.delete('subtasks', `task_id=eq.${t.cloudId}`);
        for (const s of t.subtasks) {
          await SupaClient.insert('subtasks', {
            task_id: t.cloudId, title: s.title,
            sub_desc: s.desc || '', done: s.done || false, ord: 0
          });
        }
      }
      if (t.cloudId && t.tags && t.tags.length) {
        await SupaClient.delete('tags', `task_id=eq.${t.cloudId}`);
        for (const tag of t.tags) {
          await SupaClient.insert('tags', { task_id: t.cloudId, tag: tag });
        }
      }
    }

    // ۲. برنامه هفتگی — آپدیت
    const s = loadSchedule();
    const cloudSched = await SupaClient.select('schedule', `user_id=eq.${uid}`);
    const cloudGrid = {};
    for (const r of cloudSched) cloudGrid[`${r.day}-${r.period}`] = r;
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

    // ۳. یادداشت‌ها
    // ساختار subjectNotes = { subject: [notes] }
    // توی ابر، همه توی یه جدول، با subject
    for (const subj in subjectNotes) {
      for (const n of subjectNotes[subj]) {
        const row = {
          user_id: uid, subject: subj, title: n.title,
          text: n.text || '', created_at: n.createdAt || new Date().toISOString()
        };
        if (n.cloudId) {
          await SupaClient.update('subject_notes', `id=eq.${n.cloudId}`, row);
        } else {
          const res = await SupaClient.insert('subject_notes', row);
          if (res && res[0]) n.cloudId = res[0].id;
        }
      }
    }

    // ۴. برنامه روزانه
    // ساختار جدید: dailyPlans['1403-05-12'] = [items]
    // توی ابر: هر آیتم یه رکورد با year/month/day
    const cloudDaily = await SupaClient.select('daily_plans', `user_id=eq.${uid}`);
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
        } else {
          const res = await SupaClient.insert('daily_plans', row);
          if (res && res[0]) it.cloudId = res[0].id;
        }
      }
    }
    // حذف آیتم‌های حذف‌شده
    const localCloudIds = new Set();
    for (const key in dailyPlans) {
      (dailyPlans[key]||[]).forEach(it => { if (it.cloudId) localCloudIds.add(it.cloudId); });
    }
    for (const c of cloudDaily) {
      if (!localCloudIds.has(c.id)) {
        await SupaClient.delete('daily_plans', `id=eq.${c.id}`);
      }
    }

    saveLocalCopy();
    return true;
  } catch(e) {
    console.error('Sync error:', e);
    if (force) toast('خطا در همگام‌سازی: ' + e.message, 'error');
    return false;
  }
}

async function syncFromCloud() {
  if (!SupaClient.isLoggedIn()) return false;
  const uid = SupaClient.getUserId();
  try {
    // ۱. کارها
    const cloudTasks = await SupaClient.select('tasks', `user_id=eq.${uid}&order=created_at.desc`);
    tasks = [];
    for (const t of cloudTasks) {
      const subs = await SupaClient.select('subtasks', `task_id=eq.${t.id}`);
      const tags = await SupaClient.select('tags', `task_id=eq.${t.id}`);
      tasks.push({
        id: t.id, cloudId: t.id, title: t.title, subject: t.subject,
        workType: t.work_type, type: t.type, location: t.location,
        description: t.description, year: t.year, month: t.month, day: t.day,
        time: t.time, priority: t.priority, estTime: t.est_time || 0,
        done: t.done,
        subtasks: subs.map(s => ({ id: s.id, cloudId: s.id, title: s.title, desc: s.sub_desc, done: s.done })),
        tags: tags.map(x => x.tag)
      });
    }

    // ۲. برنامه هفتگی
    const cloudSched = await SupaClient.select('schedule', `user_id=eq.${uid}`);
    const s = defaultSchedule();
    for (const r of cloudSched) {
      const p = r.period - 1;
      const d = r.day;
      if (s.periods[p] && s.periods[p].days[d]) {
        s.periods[p].days[d].subject = r.subject;
      }
    }
    saveSchedule(s);

    // ۳. یادداشت‌ها
    const cloudNotes = await SupaClient.select('subject_notes', `user_id=eq.${uid}`);
    subjectNotes = {};
    for (const n of cloudNotes) {
      if (!subjectNotes[n.subject]) subjectNotes[n.subject] = [];
      subjectNotes[n.subject].push({
        id: n.id, cloudId: n.id, title: n.title, text: n.text,
        tags: [], createdAt: n.created_at
      });
    }
    saveSubjectNotes();

    // ۴. برنامه روزانه
    const cloudDaily = await SupaClient.select('daily_plans', `user_id=eq.${uid}`);
    dailyPlans = {};
    for (const x of cloudDaily) {
      const key = `${x.year}-${String(x.month).padStart(2,'0')}-${String(x.day).padStart(2,'0')}`;
      if (!dailyPlans[key]) dailyPlans[key] = [];
      dailyPlans[key].push({
        id: x.id, cloudId: x.id, title: x.title,
        duration: x.duration, done: x.done
      });
    }
    saveDailyPlans();

    saveLocalCopy();
    populateSubjectFilter();
    renderAll();
    return true;
  } catch(e) {
    console.error('Sync from cloud error:', e);
    toast('خطا در دریافت داده‌ها: ' + e.message, 'error');
    return false;
  }
}

function saveLocalCopy() {
  try {
    localStorage.setItem(K.TASKS, JSON.stringify(tasks));
    localStorage.setItem(K.SCHEDULE, JSON.stringify(loadSchedule()));
    localStorage.setItem(K.SUBJECT_NOTES, JSON.stringify(subjectNotes));
    localStorage.setItem(K.DAILY_PREFIX + 'all', JSON.stringify(dailyPlans));
  } catch(e) {}
}

function loadFromLocalStorage() {
  loadTasks();
  loadSubjectNotes();
  loadDailyPlans();
  loadTags();
  populateSubjectFilter();
}

function clearLocalData() {
  localStorage.removeItem(K.TASKS);
  localStorage.removeItem(K.SCHEDULE);
  localStorage.removeItem(K.SUBJECT_NOTES);
  localStorage.removeItem(K.DAILY_PREFIX + 'all');
  localStorage.removeItem(K.TAGS);
  tasks = [];
  subjectNotes = {};
  dailyPlans = {};
  allTags = [];
}
