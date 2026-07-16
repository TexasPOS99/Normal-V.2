(function () {
  'use strict';

  const config = window.FIREBASE_CONFIG || {};
  const configured = config.apiKey && !String(config.apiKey).startsWith('ใส่ค่า-');
  let db = null;
  let currentUser = null;
  let unsubscribe = null;

  function showGate(message, isError) {
    const gate = document.getElementById('authGate');
    const text = document.getElementById('authGateMessage');
    if (!gate) return;
    gate.classList.remove('hidden');
    gate.classList.add('flex');
    if (message && text) {
      text.textContent = message;
      text.style.color = isError ? '#dc2626' : '#64748b';
    }
  }

  function hideGate() {
    const gate = document.getElementById('authGate');
    if (!gate) return;
    gate.classList.add('hidden');
    gate.classList.remove('flex');
  }

  const ready = new Promise((resolve) => {
    document.addEventListener('DOMContentLoaded', () => {
      if (!configured) {
        showGate('ยังไม่ได้ตั้งค่า Firebase กรุณาใส่ค่าในไฟล์ firebase-config.js', true);
        return;
      }

      firebase.initializeApp(config);
      db = firebase.firestore();
      db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
      const auth = firebase.auth();
      const button = document.getElementById('googleSignInBtn');

      if (button) {
        button.onclick = async () => {
          button.disabled = true;
          button.textContent = 'กำลังเข้าสู่ระบบ...';
          try {
            await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
          } catch (error) {
            showGate('เข้าสู่ระบบไม่สำเร็จ: ' + error.message, true);
            button.disabled = false;
            button.textContent = 'เข้าสู่ระบบด้วย Google';
          }
        };
      }

      auth.onAuthStateChanged((user) => {
        if (!user) {
          showGate('ข้อมูลจะถูกเก็บแยกตามบัญชี Google ของคุณ');
          return;
        }
        currentUser = user;
        hideGate();
        resolve();
      });
    });
  });

  function collection() {
    if (!db || !currentUser) throw new Error('กรุณาเข้าสู่ระบบก่อน');
    return db.collection('links');
  }

  async function ownedRows() {
    const snap = await collection().where('owner_uid', '==', currentUser.uid).get();
    return snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
  }

  function safe(task) {
    return Promise.resolve().then(task).catch(error => ({ data: null, error }));
  }

  class InsertQuery {
    constructor(rows) {
      this.promise = safe(async () => {
        const data = [];
        for (const row of rows) {
          const payload = { ...row, owner_uid: currentUser.uid, created_at: row.created_at || new Date().toISOString() };
          const ref = await collection().add(payload);
          data.push({ id: ref.id, ...payload });
        }
        return { data, error: null };
      });
    }
    select() { return this.promise; }
    then(resolve, reject) { return this.promise.then(resolve, reject); }
  }

  class MutationQuery {
    constructor(type, values) { this.type = type; this.values = values; }
    eq(field, value) {
      return safe(async () => {
        if (field !== 'id') throw new Error('รองรับการค้นหาด้วย id เท่านั้น');
        const ref = collection().doc(String(value));
        const snap = await ref.get();
        if (!snap.exists || snap.data().owner_uid !== currentUser.uid) throw new Error('ไม่พบข้อมูลหรือไม่มีสิทธิ์');
        if (this.type === 'delete') await ref.delete();
        else await ref.update(this.values);
        return { data: null, error: null };
      });
    }
  }

  class SelectQuery {
    order(field, options) {
      return safe(async () => {
        const rows = await ownedRows();
        rows.sort((a, b) => {
          const result = String(a[field] || '').localeCompare(String(b[field] || ''));
          return options && options.ascending === false ? -result : result;
        });
        return { data: rows, error: null };
      });
    }
  }

  window.sb = {
    from(name) {
      if (name !== 'links') throw new Error('Unknown collection: ' + name);
      return {
        insert: rows => new InsertQuery(rows),
        update: values => new MutationQuery('update', values),
        delete: () => new MutationQuery('delete'),
        select: () => new SelectQuery()
      };
    },
    channel() {
      let callback = null;
      return {
        on(event, filter, cb) { callback = cb; return this; },
        subscribe(statusCb) {
          ready.then(() => {
            unsubscribe = collection().where('owner_uid', '==', currentUser.uid).onSnapshot(
              () => callback && callback(),
              error => { console.error(error); statusCb && statusCb('CHANNEL_ERROR'); }
            );
            statusCb && statusCb('SUBSCRIBED');
          });
          return this;
        },
        unsubscribe() { if (unsubscribe) unsubscribe(); }
      };
    }
  };

  window.whenDatabaseReady = () => ready;
})();
