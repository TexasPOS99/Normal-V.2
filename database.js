(function () {
  'use strict';

  const config = window.FIREBASE_CONFIG || {};
  const configured = config.apiKey && !String(config.apiKey).startsWith('ใส่ค่า-');
  let db = null;
  let unsubscribe = null;

  const ready = new Promise((resolve, reject) => {
    document.addEventListener('DOMContentLoaded', () => {
      if (!configured) {
        alert('ยังไม่ได้ตั้งค่า Firebase ในไฟล์ firebase-config.js');
        reject(new Error('Firebase is not configured'));
        return;
      }
      try {
        firebase.initializeApp(config);
        db = firebase.firestore();
        db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
        resolve();
      } catch (error) {
        alert('เชื่อมต่อ Firebase ไม่สำเร็จ: ' + error.message);
        reject(error);
      }
    });
  });

  function collection() {
    if (!db) throw new Error('ฐานข้อมูลยังไม่พร้อมใช้งาน');
    return db.collection('links');
  }

  async function allRows() {
    const snap = await collection().get();
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
          const payload = { ...row, created_at: row.created_at || new Date().toISOString() };
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
        if (!snap.exists) throw new Error('ไม่พบข้อมูล');
        if (this.type === 'delete') await ref.delete();
        else await ref.update(this.values);
        return { data: null, error: null };
      });
    }
  }

  class SelectQuery {
    order(field, options) {
      return safe(async () => {
        const rows = await allRows();
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
            unsubscribe = collection().onSnapshot(
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
