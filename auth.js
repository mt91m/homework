// ============================================================
//  Authentication — لاگین، ثبت‌نام، خروج
//  نسخه ۴.۰ — کامل و بی‌نقص
// ============================================================

function showAuthModal(mode = 'login') {
  const modal = document.getElementById('authModal');
  if (!modal) return;
  modal.classList.add('show');
  switchAuthTab(mode);
}

function hideAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) modal.classList.remove('show');
}

function switchAuthTab(mode) {
  document.querySelectorAll('.auth-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.authTab === mode);
  });
  document.querySelectorAll('.auth-panel').forEach(p => {
    p.classList.toggle('active', p.dataset.authPanel === mode);
  });
  const e1 = document.getElementById('authError'); if (e1) e1.textContent = '';
  const e2 = document.getElementById('authErrorSignup'); if (e2) e2.textContent = '';
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';

  if (!username || !password) { errEl.textContent = 'نام کاربری و پسورد رو وارد کن.'; return; }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { errEl.textContent = 'نام کاربری باید ۳ تا ۲۰ کاراکتر انگلیسی/عدد/_ باشه.'; return; }
  if (password.length < 6) { errEl.textContent = 'پسورد باید حداقل ۶ کاراکتر باشه.'; return; }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = '...';
  try {
    await SupaClient.signIn(username, password);
    hideAuthModal();
    toast('خوش آمدی ' + (SupaClient.getFirstName() || ''), 'success');
    onLoginSuccess();
  } catch(err) {
    errEl.textContent = err.message || 'خطا در ورود';
  } finally {
    btn.disabled = false; btn.textContent = 'ورود';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const firstName = document.getElementById('signupFirstName').value.trim();
  const username = document.getElementById('signupUsername').value.trim();
  const password = document.getElementById('signupPassword').value;
  const password2 = document.getElementById('signupPassword2').value;
  const errEl = document.getElementById('authErrorSignup');
  errEl.textContent = '';

  if (!firstName || !username || !password || !password2) { errEl.textContent = 'همه فیلدها الزامی هستن.'; return; }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) { errEl.textContent = 'نام کاربری باید ۳ تا ۲۰ کاراکتر انگلیسی/عدد/_ باشه.'; return; }
  if (password.length < 6) { errEl.textContent = 'پسورد باید حداقل ۶ کاراکتر باشه.'; return; }
  if (password !== password2) { errEl.textContent = 'پسوردها یکسان نیستن.'; return; }

  const btn = document.getElementById('signupBtn');
  btn.disabled = true; btn.textContent = '...';
  try {
    await SupaClient.signUp(username, password, firstName);
    hideAuthModal();
    toast('ثبت‌نام موفق! خوش آمدی ' + firstName, 'success');
    onLoginSuccess();
  } catch(err) {
    let msg = err.message || 'خطا در ثبت‌نام';
    if (msg.includes('already registered') || msg.includes('already exists')) msg = 'این نام کاربری قبلاً ثبت شده.';
    errEl.textContent = msg;
  } finally {
    btn.disabled = false; btn.textContent = 'ثبت‌نام';
  }
}

async function handleLogout() {
  if (!confirm('از حساب خارج می‌شی؟')) return;
  if (typeof stopAutoSync === 'function') stopAutoSync();
  await SupaClient.signOut();
  toast('خارج شدی.', 'info');
  updateAuthUI();
  loadFromLocalStorage();
  renderAll();
}

function onLoginSuccess() {
  const localHasData = tasks.length > 0 || Object.keys(subjectNotes).length > 0;
  if (localHasData) {
    if (confirm('داده‌های محلی داری. می‌خوای به حسابت منتقل بشن؟')) {
      syncToCloud(true).then(() => {
        toast('داده‌ها به ابر منتقل شدن.', 'success');
        syncFromCloud().then(() => {
          if (typeof startAutoSync === 'function') startAutoSync();
        });
      });
    } else {
      if (confirm('داده‌های محلی پاک بشن؟')) {
        clearLocalData();
        syncFromCloud().then(() => {
          if (typeof startAutoSync === 'function') startAutoSync();
        });
      }
    }
  } else {
    syncFromCloud().then(() => {
      if (typeof startAutoSync === 'function') startAutoSync();
    });
  }
  updateAuthUI();
}

function updateAuthUI() {
  const loggedIn = SupaClient.isLoggedIn();
  const authBtn = document.getElementById('authBtn');
  const userDropdown = document.getElementById('userDropdown');
  const aboutBtn = document.getElementById('aboutAuthBtn');
  const aboutStatus = document.getElementById('aboutAccountStatus');

  if (authBtn) {
    if (loggedIn) {
      authBtn.style.display = 'none';
    } else {
      authBtn.style.display = 'inline-flex';
      authBtn.textContent = '🔐 ورود';
      authBtn.onclick = () => showAuthModal('login');
    }
  }

  if (userDropdown) {
    userDropdown.style.display = loggedIn ? 'inline-block' : 'none';
    if (loggedIn) {
      const name = SupaClient.getFirstName() || 'کاربر';
      const username = SupaClient.getUsername() || '';
      userDropdown.querySelectorAll('.user-name').forEach(el => el.textContent = name);
      userDropdown.querySelectorAll('.user-username').forEach(el => el.textContent = '@' + username);
    }
  }

  if (aboutBtn) aboutBtn.textContent = loggedIn ? '🚪 خروج از حساب' : '🔐 ورود / ثبت‌نام';
  if (aboutStatus) {
    if (loggedIn) {
      aboutStatus.innerHTML = `✅ وارد شدی به عنوان <strong>${SupaClient.getFirstName() || ''}</strong> (@${SupaClient.getUsername() || ''})`;
    } else {
      aboutStatus.innerHTML = '⚠️ وارد نشدی. داده‌ها فقط روی همین دستگاه ذخیره می‌شن.';
    }
  }
}
