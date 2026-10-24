/**
 * 轻量 IndexedDB 封装 —— 多项目 / 多条目持久化。
 *
 * 设计目标：
 * - 长期：将来套 Tauri 桌面壳时，可直接替换为 Rust 侧 SQLite 写入，
 *   业务层接口（loadProject/saveProject/listProjects）保持不变。
 * - 现在：浏览器 / WebView 内用 IndexedDB 持久化，刷新/清缓存都不会丢稿。
 *
 * 用法：
 *   const db = await openDB();
 *   await db.saveProject("novel", projectId, data);
 *   const p = await db.loadProject("novel", projectId);
 *   const all = await db.listProjects("novel");
 *   await db.deleteProject("novel", projectId);
 */

const DB_NAME = "dual-studio";
const DB_VERSION = 1;
const STORE = "projects"; // 复合键 store: [type, id]

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("当前环境不支持 indexedDB"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        // keyPath 用复合键 [type, id]
        db.createObjectStore(STORE, { keyPath: ["type", "id"] });
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      const api = {
        /** 保存/更新一个项目 */
        async saveProject(type, id, data) {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).put({ type, id, data, updatedAt: Date.now() });
          await txDone(tx);
        },
        /** 读取单个项目 */
        async loadProject(type, id) {
          const tx = db.transaction(STORE, "readonly");
          const rec = await reqToPromise(tx.objectStore(STORE).get([type, id]));
          return rec ? rec.data : null;
        },
        /** 列出某类型下所有项目（按更新时间倒序） */
        async listProjects(type) {
          const tx = db.transaction(STORE, "readonly");
          const all = await reqToPromise(tx.objectStore(STORE).getAll());
          return all
            .filter((r) => r.type === type)
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((r) => ({ id: r.id, updatedAt: r.updatedAt, data: r.data }));
        },
        /** 删除项目 */
        async deleteProject(type, id) {
          const tx = db.transaction(STORE, "readwrite");
          tx.objectStore(STORE).delete([type, id]);
          await txDone(tx);
        },
      };
      resolve(api);
    };
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
