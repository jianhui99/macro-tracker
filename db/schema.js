const fs = require('fs');
const path = require('path');

// schema.sql only creates missing tables (CREATE TABLE IF NOT EXISTS never alters an
// existing one), so columns added after a database was first created are patched in here
function applySchema(db) {
    db.exec(fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8'));
    const userColumns = db.prepare('PRAGMA table_info(user_settings)').all().map(c => c.name);
    if (!userColumns.includes('target_weight')) db.exec('ALTER TABLE user_settings ADD COLUMN target_weight REAL');
}

module.exports = { applySchema };
