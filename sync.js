/* 雲端同步：Firebase（Email 登入 + Firestore）。
   提供 window.worklogCloud.connect()，回傳一個和 app 原本資料庫介面相同的物件。
   沒有填 firebase-config.js 時 enabled 為 false，app 維持只存在本機。 */
(function () {
  "use strict";
  var VER = "13.1.0";
  var BASE = "https://www.gstatic.com/firebasejs/" + VER + "/";
  var cfg = window.FIREBASE_CONFIG || null;
  var enabled = !!(cfg && cfg.apiKey && cfg.projectId && !/^YOUR_/.test(cfg.apiKey) && !/^YOUR_/.test(cfg.projectId));
  var api = {
    enabled: enabled,
    _load: function (url) { return import(url); },
    connect: connect
  };
  window.worklogCloud = api;
  if (!enabled) return;

  function clean(d) { return JSON.parse(JSON.stringify(d)); }
  function timeout(ms, v) { return new Promise(function (r) { setTimeout(function () { r(v); }, ms); }); }
  /* 離線時寫入會排在手機裡等連線，不要讓畫面卡住等伺服器回應 */
  function fast(p) { return Promise.race([p, timeout(2500)]); }

  function authMsg(e) {
    var c = (e && e.code) || "";
    if (/invalid-credential|wrong-password|user-not-found|invalid-login/.test(c)) return "電子郵件或密碼不正確";
    if (/email-already-in-use/.test(c)) return "這個電子郵件已經註冊過了，請直接登入";
    if (/weak-password/.test(c)) return "密碼太簡單，至少需要 6 個字元";
    if (/invalid-email/.test(c)) return "電子郵件格式不正確";
    if (/network/.test(c)) return "連不上網路，請檢查連線後再試";
    if (/too-many-requests/.test(c)) return "嘗試次數太多，請稍後再試";
    if (/operation-not-allowed/.test(c)) return "Firebase 尚未啟用 Email 登入，請到 Authentication 開啟";
    return "登入失敗，請再試一次（" + (c || "未知錯誤") + "）";
  }

  var INPUT = "font:inherit;font-size:16px;padding:13px 14px;border:0;border-radius:12px;background:var(--surface,#fff);color:inherit;box-shadow:0 1px 2px rgba(42,53,80,.06)";
  var BTN1 = "border:0;border-radius:12px;padding:13px;font:inherit;font-weight:700;color:#fff;background:var(--grad,linear-gradient(135deg,#7DB0E2,#A895DC))";
  var BTN2 = "border:0;border-radius:12px;padding:12px;font:inherit;font-weight:700;background:var(--sel-bg,#ECE6FA);color:var(--sel-ink,#5A4A9C)";
  var LINK = "border:0;background:none;color:var(--accent,#8A7FD4);font:inherit;font-size:13px;font-weight:700;padding:4px";
  var FORM_HTML =
    '<form id="clForm" style="width:100%;max-width:340px;display:flex;flex-direction:column;gap:12px">' +
    '<div style="font-size:22px;font-weight:800;text-align:center">每日工作日誌</div>' +
    '<div style="font-size:13px;text-align:center;color:var(--muted,#7680A0);margin-bottom:6px">登入後，手機和電腦的紀錄會自動同步</div>' +
    '<input id="clEmail" type="email" autocomplete="email" inputmode="email" placeholder="電子郵件" required style="' + INPUT + '">' +
    '<input id="clPw" type="password" autocomplete="current-password" placeholder="密碼（至少 6 個字元）" required style="' + INPUT + '">' +
    '<div id="clMsg" role="alert" style="min-height:18px;font-size:13px;text-align:center;color:var(--danger,#C2566A)"></div>' +
    '<button type="submit" id="clLogin" style="' + BTN1 + '">登入</button>' +
    '<button type="button" id="clSignup" style="' + BTN2 + '">建立新帳號</button>' +
    '<button type="button" id="clReset" style="' + LINK + '">忘記密碼</button>' +
    '</form>';

  function showLogin(auth, Au) {
    return new Promise(function (resolve) {
      var wrap = document.createElement("div");
      wrap.setAttribute("style", "position:fixed;top:0;right:0;bottom:0;left:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;background:var(--bg,#EDF4FB);font-family:var(--f-body,system-ui,sans-serif);color:var(--ink,#2A3550)");
      wrap.innerHTML = FORM_HTML;
      document.body.appendChild(wrap);
      var q = function (id) { return wrap.querySelector("#" + id); };
      var msg = q("clMsg"), email = q("clEmail"), pw = q("clPw");
      var btns = [q("clLogin"), q("clSignup"), q("clReset")];
      function busy(b) { btns.forEach(function (x) { x.disabled = b; }); }
      function fail(e) { msg.style.color = ""; msg.textContent = authMsg(e); busy(false); }
      function done(cred) { wrap.remove(); resolve(cred.user); }
      function run(fn) { msg.style.color = ""; msg.textContent = ""; busy(true); fn().then(done, fail); }
      q("clForm").onsubmit = function (ev) {
        ev.preventDefault();
        run(function () { return Au.signInWithEmailAndPassword(auth, email.value.trim(), pw.value); });
      };
      q("clSignup").onclick = function () {
        if (!email.value.trim() || !pw.value) { msg.textContent = "請輸入電子郵件和密碼"; return; }
        run(function () { return Au.createUserWithEmailAndPassword(auth, email.value.trim(), pw.value); });
      };
      q("clReset").onclick = function () {
        if (!email.value.trim()) { msg.textContent = "請先輸入電子郵件，再按「忘記密碼」"; return; }
        busy(true);
        Au.sendPasswordResetEmail(auth, email.value.trim()).then(function () {
          msg.style.color = "var(--muted,#7680A0)"; msg.textContent = "已寄出重設密碼的信，請到信箱查看"; busy(false);
        }, fail);
      };
    });
  }

  function waitForUser(auth, Au) {
    return new Promise(function (resolve) {
      var unsub = Au.onAuthStateChanged(auth, function (u) {
        unsub();
        if (u) resolve(u); else showLogin(auth, Au).then(resolve);
      });
    });
  }

  var INPUT2 = "font:inherit;font-size:16px;padding:12px 14px;border:0;border-radius:12px;background:var(--sunk,#EEF3FA);color:inherit";
  var ACC_HTML =
    '<div style="width:100%;max-width:340px;background:var(--surface,#fff);border-radius:18px;padding:22px;box-shadow:0 8px 32px rgba(42,53,80,.18);display:flex;flex-direction:column;gap:12px">' +
    '<div style="font-size:18px;font-weight:800">帳號設定</div>' +
    '<div id="acEmail" style="font-size:13px;color:var(--muted,#7680A0);word-break:break-all"></div>' +
    '<form id="acForm" style="display:flex;flex-direction:column;gap:10px">' +
    '<div style="font-size:13px;font-weight:700">變更密碼</div>' +
    '<input id="acCur" type="password" autocomplete="current-password" placeholder="目前的密碼" required style="' + INPUT2 + '">' +
    '<input id="acNew" type="password" autocomplete="new-password" placeholder="新密碼（至少 6 個字元）" required style="' + INPUT2 + '">' +
    '<div id="acMsg" role="alert" style="min-height:18px;font-size:13px;color:var(--danger,#C2566A)"></div>' +
    '<button type="submit" id="acSave" style="' + BTN1 + '">更新密碼</button>' +
    '</form>' +
    '<button type="button" id="acReset" style="' + LINK + '">忘記目前的密碼？寄重設密碼信到我的信箱</button>' +
    '<button type="button" id="acLogout" style="' + BTN2 + '">登出</button>' +
    '<button type="button" id="acClose" style="' + LINK + '">關閉</button>' +
    '</div>';

  function pwErr(e) {
    var c = (e && e.code) || "";
    if (/invalid-credential|wrong-password/.test(c)) return "目前的密碼不正確";
    if (/requires-recent-login/.test(c)) return "為了安全，請先登出再重新登入，然後再試一次";
    if (/weak-password/.test(c)) return "新密碼太簡單，至少需要 6 個字元";
    return authMsg(e);
  }

  function openAccountDialog(cloud) {
    var wrap = document.createElement("div");
    wrap.setAttribute("style", "position:fixed;top:0;right:0;bottom:0;left:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:24px;overflow:auto;background:rgba(42,53,80,.35);font-family:var(--f-body,system-ui,sans-serif);color:var(--ink,#2A3550)");
    wrap.innerHTML = ACC_HTML;
    document.body.appendChild(wrap);
    var q = function (id) { return wrap.querySelector("#" + id); };
    var msg = q("acMsg");
    q("acEmail").textContent = cloud.email;
    function close() { wrap.remove(); }
    function say(t, ok) { msg.style.color = ok ? "var(--muted,#7680A0)" : ""; msg.textContent = t; }
    q("acClose").onclick = close;
    wrap.onclick = function (ev) { if (ev.target === wrap) close(); };
    q("acForm").onsubmit = function (ev) {
      ev.preventDefault();
      var cur = q("acCur").value, nw = q("acNew").value;
      if (nw.length < 6) { say("新密碼至少需要 6 個字元"); return; }
      if (nw === cur) { say("新密碼不能和目前的密碼一樣"); return; }
      q("acSave").disabled = true; say("");
      cloud.changePassword(cur, nw).then(function () {
        say("密碼已更新", true); q("acCur").value = ""; q("acNew").value = ""; q("acSave").disabled = false;
      }, function (e) { say(pwErr(e)); q("acSave").disabled = false; });
    };
    q("acReset").onclick = function () {
      cloud.sendReset().then(function () { say("已寄出重設密碼的信，請到信箱查看", true); }, function (e) { say(authMsg(e)); });
    };
    q("acLogout").onclick = function () {
      if (!confirm("要登出嗎？\n登出後這台裝置會回到登入畫面，雲端的紀錄不會被刪除。")) return;
      cloud.signOut().then(function () { location.reload(); }, function () { location.reload(); });
    };
  }

  function makeCloud(F, fs, user, Au, auth) {
    var base = "users/" + user.uid + "/";

    function wrapQuery(q) {
      return {
        where: function (f, op, v) { return wrapQuery(F.query(q, F.where(f, op, v))); },
        orderBy: function (f, dir) { return wrapQuery(F.query(q, F.orderBy(f, dir))); },
        limit: function (n) { return wrapQuery(F.query(q, F.limit(n))); },
        get: function () { return F.getDocs(q); },
        onSnapshot: function (ok, err) { return F.onSnapshot(q, { includeMetadataChanges: true }, ok, err); }
      };
    }
    function wrapRef(ref) {
      return {
        id: ref.id,
        set: function (d) { return fast(F.setDoc(ref, clean(d))); },
        delete: function () { return fast(F.deleteDoc(ref)); },
        onSnapshot: function (ok, err) {
          return F.onSnapshot(ref, function (s) { ok({ id: s.id, exists: s.exists(), data: function () { return s.data(); } }); }, err);
        }
      };
    }
    var db = {
      collection: function (name) {
        var col = F.collection(fs, base + name);
        var w = wrapQuery(col);
        w.doc = function (id) { return wrapRef(id ? F.doc(col, id) : F.doc(col)); };
        return w;
      },
      doc: function (path) { return wrapRef(F.doc(fs, base + path)); }
    };

    var self = {
      db: db,
      uid: user.uid,
      email: user.email || "",
      /* 大量寫入（搬移本機資料、還原備份）。回傳 true 代表伺服器已確認；false 代表還在排隊等網路 */
      bulkSet: async function (name, items) {
        var ok = true;
        for (var i = 0; i < items.length; i += 400) {
          var b = F.writeBatch(fs);
          items.slice(i, i + 400).forEach(function (it) { b.set(F.doc(fs, base + name + "/" + it.id), clean(it.data)); });
          var fin = await Promise.race([b.commit().then(function () { return true; }), timeout(15000, false)]);
          if (!fin) ok = false;
        }
        return ok;
      },
      mergeCfg: async function (lc) {
        var ref = F.doc(fs, base + "settings/lists");
        var c = {};
        try { var s = await F.getDoc(ref); if (s.exists()) c = s.data(); } catch (e) {}
        var u = function (a, b) { a = a || []; return a.concat((b || []).filter(function (x) { return a.indexOf(x) < 0; })); };
        var la = lc.archived || {}, ca = c.archived || {};
        var merged = { projects: u(c.projects, lc.projects), tasks: u(c.tasks, lc.tasks), archived: { projects: u(ca.projects, la.projects), tasks: u(ca.tasks, la.tasks) } };
        await fast(F.setDoc(ref, clean(merged)));
        return merged;
      },
      signOut: function () { return Au.signOut(auth); },
      changePassword: async function (cur, next) {
        var u = auth.currentUser || user;
        await Au.reauthenticateWithCredential(u, Au.EmailAuthProvider.credential(u.email, cur));
        await Au.updatePassword(u, next);
      },
      sendReset: function () { return Au.sendPasswordResetEmail(auth, user.email); },
      openAccount: function () { openAccountDialog(self); }
    };
    return self;
  }

  /* 這台裝置上如果有還沒上傳的本機紀錄，登入後問一次要不要搬到雲端 */
  async function offerMigration(cloud) {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem("worklog.v1") || "null"); } catch (e) {}
    if (!raw || !Array.isArray(raw.entries) || !raw.entries.length) return;
    var list = raw.entries.filter(function (e) { return e && typeof e.date === "string"; });
    if (!list.length) return;
    if (!confirm("這台裝置上有 " + list.length + " 筆還沒同步的紀錄。\n要上傳到雲端嗎？\n（按「取消」會先保留在本機，下次開啟時再問）")) return;
    var now = Date.now();
    var items = list.map(function (e, i) {
      var o = JSON.parse(JSON.stringify(e));
      var id = o.id || ("l" + now.toString(36) + i.toString(36));
      delete o.id;
      if (typeof o.createdAt !== "number") o.createdAt = now + i;
      return { id: id, data: o };
    });
    var ok = await cloud.bulkSet("entries", items);
    if (raw.cfg) { try { await cloud.mergeCfg(raw.cfg); } catch (e) {} }
    if (!ok) { alert("上傳還沒有完成，請確認網路。紀錄仍保留在這台裝置上，下次開啟會再問一次。"); return; }
    try {
      localStorage.setItem("worklog.v1.uploaded", localStorage.getItem("worklog.v1"));
      localStorage.removeItem("worklog.v1");
    } catch (e) {}
  }

  async function connect() {
    var mods;
    try {
      mods = await Promise.all([api._load(BASE + "firebase-app.js"), api._load(BASE + "firebase-auth.js"), api._load(BASE + "firebase-firestore.js")]);
    } catch (e) { return null; }
    var A = mods[0], Au = mods[1], F = mods[2];
    var app = A.initializeApp(cfg);
    var auth = Au.getAuth(app);
    var user = await waitForUser(auth, Au);
    var fs;
    try {
      fs = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
    } catch (e) { fs = F.getFirestore(app); }
    var cloud = makeCloud(F, fs, user, Au, auth);
    try { await offerMigration(cloud); } catch (e) { console.warn("migration failed", e); }
    return cloud;
  }
})();
