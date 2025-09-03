const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs-extra');

const DB_PATH = path.join(__dirname, '../../data/taskdog.json');

let db = null;

async function initDatabase() {
  try {
    // 确保数据目录存在
    await fs.ensureDir(path.dirname(DB_PATH));
    
    const adapter = new FileSync(DB_PATH);
    db = low(adapter);
    
    // 只有当数据库为空时才设置默认数据结构
    if (!db.has('scripts').value()) {
      db.defaults({
        scripts: [],
        scheduled_tasks: [],
        configs: [],
        logs: [],
        _meta: {
          nextScriptId: 1,
          nextTaskId: 1,
          nextConfigId: 1,
          nextLogId: 1
        }
      }).write();
    }
    
    console.log('Database initialized successfully');
    console.log('Scripts count:', db.get('scripts').size().value());
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

function getDatabase() {
  return db;
}

module.exports = {
  initDatabase,
  getDatabase
};
