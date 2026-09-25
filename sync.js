// ============================================================
//  Sync — همگام‌سازی با Supabase
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
        user_id: uid,
        title: t.title,
        subject: t.subject,
        work_type: t.workType || 'حضوری',
        type: t.type || 'تکلیف',
        location: t.location || '',
        description: t.description || '',
        year: t.year,
        month: t.month,
        day: t.day,
        time: t.time || '',
        priority: t.priority || 'متوسط',
        est_time: t.estTime || 0,
        done: t.done || false,
        updated_at: new Date().toISOString()
      };
      if (cloudId) {
        await SupaClient.update('tasks', `id=eq.${cloudId}`, row);
      } else {
        const res = await SupaClient.insert('tasks', row);
        if (res && res[0]) t.cloudId = res[0].id;
      }
    }

    // ۲. برنامه هفتگی
    const s = loadSchedule();
    await SupaClient.delete('schedule', `user_id=eq.${uid}`);
    for (let p = 0; p < PERIODS; p++) {
      for (let d = 0; d < 6; d++) {
        const subj = s.periods[p].days[d].subject;
        if (subj && subj.trim()) {
          await SupaClient.insert('schedule', {
            user_id: uid, period: p + 1, day: d, subject: subj.trim()
          });
        }
      }
    }

    // ۳. یادداشت‌ها
    for (const subj in subjectNotes) {
      for (const n of subjectNotes[subj]) {
        const row = {
          user_id: uid, subject: subj, title: n.title, text: n.text || '',
          created_at: n.createdAt || new Date().toISOString()
        };
        if (n.cloudId) {
          await SupaClient.update('subject_notes', `id=eq.${n.cloudId}`, row);
        } else {
          const res = await SupaClient.insert('subject_notes', row);
          if (res && res[0]) n.cloudId = res[0].id;
        }
      }
    }

    // ۴. برنامه روزانه (ساده — پاک و درج مجدد)
    await SupaClient.delete('daily_plans', `user_id=eq.${uid}`);
    for (let i = 0; i < 7; i++) {
      const items = dailyPlans[i] || [];
      for (const it of items) {
        await SupaClient.insert('daily_plans', {
          user_id: uid, year: 0, month: 0, day: i,
          title: it.title, duration: it.duration || '',
          done: it.done || false, ord: 0
        });
      }
    }

    // ۵. تنظیمات
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
    tasks = cloudTasks.map(t => ({
      id: t.id,
      cloudId: t.id,
      title: t.title,
      subject: t.subject,
      workType: t.work_type,
      type: t.type,
      location: t.location,
      description: t.description,
      year: t.year,
      month: t.month,
      day: t.day,
      time: t.time,
      priority: t.priority,
      estTime: t.est_time || 0,
      done: t.done,
      subtasks: [],
      tags: []
    }));

    // زیرکارها
    for (const t of tasks) {
      const subs = await SupaClient.select('subtasks', `task_id=eq.${t.cloudId}`);
      t.subtasks = subs.map(s => ({ id: s.id, title: s.title, desc: s.sub_desc, done: s.done }));
      const tags = await SupaClient.select('tags', `task_id=eq.${t.cloudId}`);
      t.tags = tags.map(x => x.tag);
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
    for (let i = 0; i < 7; i++) dailyPlans[i] = [];
    for (const x of cloudDaily) {
      const i = x.day;
      if (!dailyPlans[i]) dailyPlans[i] = [];
      dailyPlans[i].push({ id: x.id, title: x.title, duration: x.duration, done: x.done });
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
  // ذخیره محلی به عنوان پشتیبان
  try {
    localStorage.setItem(K.TASKS, JSON.stringify(tasks));
    localStorage.setItem(K.SCHEDULE, JSON.stringify(loadSchedule()));
    localStorage.setItem(K.SUBJECT_NOTES, JSON.stringify(subjectNotes));
    localStorage.setItem(K.DAILY, JSON.stringify(dailyPlans));
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
  localStorage.removeItem(K.DAILY);
  localStorage.removeItem(K.TAGS);
  tasks = [];
  subjectNotes = {};
  dailyPlans = {};
  allTags = [];
}

// ============================================================
//  اتصال به بات — تولید کد
// ============================================================
async function generateLinkCode() {
  if (!SupaClient.isLoggedIn()) {
    toast('اول وارد شو.', 'warn');
    return;
  }
  const uid = SupaClient.getUserId();
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  try {
    await SupaClient.insert('link_codes', {
      code: code,
      user_id: uid,
      used: false
    });
    alert('کد اتصال بات:\n\n' + code + '\n\nاین کد رو توی بات بزن:\n/link ' + code + '\n\nکد ۵ دقیقه اعتبار داره.');
  } catch(e) {
    toast('خطا در تولید کد: ' + e.message, 'error');
  }
}
