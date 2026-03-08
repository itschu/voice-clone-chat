const fs = require('fs');
const path = require('path');

let dbDriver = null;
const IS_POSTGRES = !!process.env.DATABASE_URL;

if (IS_POSTGRES) {
	const { Pool } = require('pg');
	dbDriver = new Pool({
		connectionString: process.env.DATABASE_URL,
		ssl: { rejectUnauthorized: false },
	});
} else {
	const Database = require('better-sqlite3');
	const dbPath = path.join(__dirname, '../../data/voicera.db');
	fs.mkdirSync(path.dirname(dbPath), { recursive: true });
	dbDriver = new Database(dbPath);
	dbDriver.pragma('journal_mode = WAL');
}

async function init() {
	if (IS_POSTGRES) {
		await createTablesPostgres();
		console.log('✅ PostgreSQL database connected');
	} else {
		createTablesSqlite();
		console.log('✅ SQLite database initialised');
	}
}

async function createTablesPostgres() {
	const queries = [
		`CREATE TABLE IF NOT EXISTS voices (
            id TEXT PRIMARY KEY,
            name TEXT,
            eleven_labs_voice_id TEXT,
            system_prompt TEXT,
            created_at TEXT
        )`,
		`CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            voice_id TEXT,
            title TEXT,
            active_language TEXT,
            active_llm_model TEXT,
            messages JSONB,
            created_at TEXT,
            updated_at TEXT
        )`,
		`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK(id=1),
            default_language TEXT,
            preferred_llm_model TEXT,
            api_keys JSONB
        )`,
		`INSERT INTO settings (id, default_language, preferred_llm_model, api_keys)
         VALUES (1, 'en', null, '{}')
         ON CONFLICT (id) DO NOTHING`,
	];

	for (const query of queries) {
		await dbDriver.query(query);
	}
}

function createTablesSqlite() {
	const queries = [
		`CREATE TABLE IF NOT EXISTS voices (
            id TEXT PRIMARY KEY,
            name TEXT,
            eleven_labs_voice_id TEXT,
            system_prompt TEXT,
            created_at TEXT
        )`,
		`CREATE TABLE IF NOT EXISTS conversations (
            id TEXT PRIMARY KEY,
            voice_id TEXT,
            title TEXT,
            active_language TEXT,
            active_llm_model TEXT,
            messages TEXT,
            created_at TEXT,
            updated_at TEXT
        )`,
		`CREATE TABLE IF NOT EXISTS settings (
            id INTEGER PRIMARY KEY CHECK(id=1),
            default_language TEXT,
            preferred_llm_model TEXT,
            api_keys TEXT
        )`,
		`INSERT OR IGNORE INTO settings (id, default_language, preferred_llm_model, api_keys)
         VALUES (1, 'en', null, '{}')`,
	];

	for (const query of queries) {
		dbDriver.prepare(query).run();
	}
}

async function query(sql, params = []) {
	if (IS_POSTGRES) {
		const result = await dbDriver.query(sql, params);
		return result.rows;
	} else {
		const stmt = dbDriver.prepare(sql);
		return stmt.all(...params);
	}
}

async function queryOne(sql, params = []) {
	if (IS_POSTGRES) {
		const result = await dbDriver.query(sql, params);
		return result.rows[0];
	} else {
		const stmt = dbDriver.prepare(sql);
		return stmt.get(...params);
	}
}

async function run(sql, params = []) {
	if (IS_POSTGRES) {
		await dbDriver.query(sql, params);
	} else {
		const stmt = dbDriver.prepare(sql);
		stmt.run(...params);
	}
}

module.exports = {
	init,
	query,
	queryOne,
	run,
	IS_POSTGRES,
};
