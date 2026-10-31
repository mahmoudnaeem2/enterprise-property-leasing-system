// Database Manager using native Node.js node:sqlite
const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

const DB_PATH = path.join(__dirname, '..', '..', 'data', 'leasing_enterprise.db');

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

let dbInstance = null;

function getDatabase() {
    if (!dbInstance) {
        dbInstance = new DatabaseSync(DB_PATH);
        // Enable WAL mode and foreign keys for enterprise reliability
        dbInstance.exec('PRAGMA foreign_keys = ON;');
        dbInstance.exec('PRAGMA journal_mode = WAL;');
    }
    return dbInstance;
}

function initSchema() {
    const db = getDatabase();
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    db.exec(schemaSql);
    return db;
}

function runTransaction(callback) {
    const db = getDatabase();
    db.exec('BEGIN TRANSACTION;');
    try {
        const result = callback(db);
        db.exec('COMMIT;');
        return result;
    } catch (err) {
        db.exec('ROLLBACK;');
        throw err;
    }
}

module.exports = {
    getDatabase,
    initSchema,
    runTransaction,
    DB_PATH
};
