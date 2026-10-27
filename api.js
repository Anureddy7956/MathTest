'use strict';
/*
 * Data layer. Everything the UI needs goes through window.API, so moving to a
 * real backend means replacing these functions with fetch() calls — the UI
 * does not change.
 *
 * This version stores data in the browser (localStorage), which needs no
 * server and works offline. Users and results are per-device in this mode.
 */
(() => {
  const K = { users: 'mt.users', session: 'mt.session', results: id => 'mt.results.' + id };
  const get = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
  const set = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

  // Demo accounts. With a backend these live in the database with hashed passwords.
  const SEED = {
    STU20260001: { name: 'Demo Student', pw: 'pass1234', level: 3 },
    STU20260002: { name: 'Second Student', pw: 'pass1234', level: 3 }
  };
  if (!get(K.users)) set(K.users, SEED);

  window.API = {
    async login(id, pw) {
      id = id.trim().toUpperCase();
      const u = get(K.users, {})[id];
      if (!u || u.pw !== pw) throw new Error('Invalid Login ID or password');
      const s = { id, name: u.name, level: u.level };
      set(K.session, s);
      return s;
    },
    me() { return get(K.session, null); },
    logout() { try { localStorage.removeItem(K.session); } catch {} },
    async results(uid) { return get(K.results(uid), []); },
    async saveResult(uid, r) {
      const all = get(K.results(uid), []);
      all.unshift(r);
      set(K.results(uid), all.slice(0, 200));
      return r;
    },
    async finalExam() { return null; }
  };
})();
