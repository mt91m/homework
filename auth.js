// ============================================================
//  Authentication — لاگین، ثبت‌نام، خروج
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
  document.getElementById('authError').textContent = '';
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';

  if (!username || !password) {
    errEl.textContent = 'نام کاربری و پسورد رو وارد کن.';
    return;
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    errEl.textContent = 'نام کاربری باید ۳ تا ۲۰ کاراکتر انگلیسی/عدد/_ باشه.';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'پسورد باید حداقل ۶ کاراکتر باشه.';
    return;
  }

  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    await SupaClient.signIn(username, password);
    hideAuthModal();
    toast('خوش آمدی ' + (SupaClient.getFirstName() || ''), 'success');
    onLoginSuccess();
  } catch(err) {
    errEl.textContent = err.message || 'خطا در ورود';
  } finally {
    btn.disabled = false;
    btn.textContent = 'ورود';
  }
}

async function handleSignup(e) {
  e.preventDefault();
  const firstName = document.getElementById('signupFirstName').value.trim();
  const username = document.getElementById('signupUsername').value.trim();
  const password = document.getElementById('signupPassword').value;
  const password2 = document.getElementById('signupPassword2').value;
  const errEl = document.getElementById('authError');
  errEl.textContent = '';

  if (!firstName || !username || !password || !password2) {
    errEl.textContent = 'همه فیلدها الزامی هستن.';
    return;
  }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    errEl.textContent = 'نام کاربری باید ۳ تا ۲۰ کاراکتر انگلیسی/عدد/_ باشه.';
    return;
  }
  if (password.length < 6) {
    errEl.textContent = 'پسورد باید حداقل ۶ کاراکتر باشه.';
    return;
  }
  if (password !== password2) {
    errEl.textContent = 'پسوردها یکسان نیستن.';
    return;
  }

  const btn = document.getElementById('signupBtn');
  btn.disabled = true;
  btn.textContent = '...';

  try {
    await SupaClient.signUp(username, password, firstName);
    hideAuthModal();
    toast('ثبت‌نام موفق! خوش آمدی ' + firstName, 'success');
    onLoginSuccess();
  } catch(err) {
    let msg = err.message || 'خطا در ثبت‌نام';
    if (msg.includes('already registered') || msg.includes('already exists')) {
      msg = 'این نام کاربری قبلاً ثبت شده.';
    }
    errEl.textContent = msg;
  } finally {
    btn.disabled = false;
    btn.textContent = 'ثبت‌نام';
  }
}

async function handleLogout() {
  if (!confirm('از حساب خارج می‌شی؟')) return;
  await SupaClient.signOut();
  toast('خارج شدی.', 'info');
  updateAuthUI();
  // بازگشت به حالت محلی
  loadFromLocalStorage();
  renderAll();
}

function onLoginSuccess() {
  // انتقال داده محلی به ابر (اگه داشت)
  const localHasData = tasks.length > 0 || Object.keys(subjectNotes).length > 0;
  if (localHasData) {
    if (confirm('داده‌های محلی داری. می‌خوای به حسابت منتقل بشن؟')) {
      syncToCloud(true).then(() => {
        toast('داده‌ها به ابر منتقل شدن.', 'success');
        syncFromCloud();
      });
    } else {
      if (confirm('داده‌های محلی پاک بشن؟')) {
        clearLocalData();
      }
    }
  } else {
    syncFromCloud();
  }
  updateAuthUI();
}

function updateAuthUI() {
  const loggedIn = SupaClient.isLoggedIn();
  const authBtn = document.getElementById('authBtn');
  const userInfo = document.getElementById('userInfo');

  if (authBtn) {
    if (loggedIn) {
      authBtn.textContent = '👤 ' + (SupaClient.getFirstName() || 'حساب من');
      authBtn.onclick = () => showUserMenu();
    } else {
      authBtn.textContent = '🔐 ورود';
      authBtn.onclick = () => showAuthModal('login');
    }
  }

  if (userInfo) {
    userInfo.style.display = loggedIn ? 'flex' : 'none';
    if (loggedIn) {
      userInfo.querySelector('.user-name').textContent = SupaClient.getFirstName() || '';
      userInfo.querySelector('.user-username').textContent = '@' + (SupaClient.getUsername() || '');
    }
  }
}

function showUserMenu() {
  const action = prompt('1 = خروج\n2 = بکاپ ابری\n3 = بستن', '3');
  if (action === '1') handleLogout();
  else if (action === '2') syncToCloud(true).then(() => toast('بکاپ ابری انجام شد.', 'success'));
}
