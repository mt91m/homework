// ============================================================
//  Supabase Configuration & Client
//  نسخه ۴.۰ — کامل و بی‌نقص
// ============================================================

const SUPABASE_URL = 'https://sulllalgrahgbofirzpn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_ZvqddFeoqhXoOximqIDWvA_HqUB6o6r';

const SupaClient = {
  url: SUPABASE_URL,
  key: SUPABASE_ANON_KEY,
  session: null,

  // ---- درخواست REST ----
  async request(path, options = {}) {
    const cleanKey = String(this.key || '').replace(/[^\x00-\x7F]/g, '').trim();
    const headers = {
      'apikey': cleanKey,
      'Content-Type': 'application/json',
      'Prefer': options.prefer || 'return=representation',
      ...(options.headers || {})
    };
    if (this.session && this.session.access_token) {
      const cleanToken = String(this.session.access_token || '').replace(/[^\x00-\x7F]/g, '').trim();
      headers['Authorization'] = 'Bearer ' + cleanToken;
    }
    const url = this.url + path;
    const res = await fetch(url, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body ? JSON.stringify(options.body) : undefined
    });
    if (!res.ok) {
      let err;
      try { err = await res.json(); } catch(e) { err = { message: res.statusText }; }
      throw new Error(err.message || err.error_description || err.msg || 'خطای Supabase');
    }
    if (res.status === 204) return null;
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch(e) { return text; }
  },

  // ---- Auth ----
  async signUp(username, password, firstName) {
    const email = username + '@school.app';
    const res = await fetch(this.url + '/auth/v1/signup', {
      method: 'POST',
      headers: { 'apikey': String(this.key).replace(/[^\x00-\x7F]/g, '').trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email,
        password: password,
        data: { first_name: firstName, username: username }
      })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || data.error_description || data.msg || 'خطا در ثبت‌نام');
    if (data.access_token) {
      this.session = data;
      this.saveSession();
    }
    return data;
  },

  async signIn(username, password) {
    const email = username + '@school.app';
    const res = await fetch(this.url + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: { 'apikey': String(this.key).replace(/[^\x00-\x7F]/g, '').trim(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error_description || data.message || data.msg || 'نام کاربری یا پسورد اشتباه');
    this.session = data;
    this.saveSession();
    return data;
  },

  async signOut() {
    try {
      if (this.session && this.session.access_token) {
        await fetch(this.url + '/auth/v1/logout', {
          method: 'POST',
          headers: { 'apikey': String(this.key).replace(/[^\x00-\x7F]/g, '').trim(), 'Authorization': 'Bearer ' + this.session.access_token }
        });
      }
    } catch(e) {}
    this.session = null;
    localStorage.removeItem('sb_session');
  },

  saveSession() {
    if (this.session) {
      localStorage.setItem('sb_session', JSON.stringify(this.session));
    }
  },

  loadSession() {
    try {
      const s = localStorage.getItem('sb_session');
      if (s) {
        const sess = JSON.parse(s);
        if (sess.expires_at && Date.now() / 1000 > sess.expires_at) {
          this.session = null;
          localStorage.removeItem('sb_session');
        } else {
          this.session = sess;
        }
      }
    } catch(e) { this.session = null; }
  },

  isLoggedIn() {
    return !!this.session && !!this.session.access_token;
  },

  getUserId() {
    return this.session && this.session.user ? this.session.user.id : null;
  },

  getUsername() {
    if (!this.session || !this.session.user) return null;
    return this.session.user.user_metadata?.username || null;
  },

  getFirstName() {
    if (!this.session || !this.session.user) return null;
    return this.session.user.user_metadata?.first_name || null;
  },

  // ---- Database ----
  async select(table, query = '') {
    return await this.request(`/rest/v1/${table}?${query}`, { method: 'GET' });
  },

  async insert(table, data) {
    return await this.request(`/rest/v1/${table}`, { method: 'POST', body: data });
  },

  async update(table, query, data) {
    return await this.request(`/rest/v1/${table}?${query}`, { method: 'PATCH', body: data });
  },

  async delete(table, query) {
    return await this.request(`/rest/v1/${table}?${query}`, { method: 'DELETE', prefer: 'return=minimal' });
  }
};
