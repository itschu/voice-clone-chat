/**
 * Data Store Service
 * Handles persistent storage for voices, conversations, and audio files
 */

const db = require('./db');

/**
 * Private helper to convert DB row to voice object
 * @param {Object} row - Database row
 * @returns {Object} Voice object
 */
function rowToVoice(row) {
	return {
		id: row.id,
		name: row.name,
		elevenLabsVoiceId: row.eleven_labs_voice_id,
		systemPrompt: row.system_prompt,
		createdAt: row.created_at,
	};
}

/**
 * Private helper to convert DB row to conversation object
 * @param {Object} row - Database row
 * @returns {Object} Conversation object
 */
function rowToConversation(row) {
	let messages;
	if (typeof row.messages === 'string') {
		messages = JSON.parse(row.messages);
	} else {
		messages = row.messages;
	}

	return {
		id: row.id,
		voiceId: row.voice_id,
		title: row.title,
		activeLanguage: row.active_language,
		activeLlmModel: row.active_llm_model,
		messages: messages,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

/**
 * Get all voices
 * @returns {Promise<Array>}
 */
async function getVoices() {
	try {
		const rows = await db.query('SELECT * FROM voices ORDER BY created_at DESC');
		const voices = rows.map(rowToVoice);
		console.log(`✅ Loaded ${voices.length} voices`);
		return voices;
	} catch (error) {
		console.error('❌ Failed to get voices:', error.message);
		throw error;
	}
}

/**
 * Save voices
 * @param {Array} voices - Array of voice objects
 * @returns {Promise}
 */
async function saveVoices(voices) {
	try {
		await db.run('DELETE FROM voices');

		if (voices.length > 0) {
			if (db.IS_POSTGRES) {
				// For PostgreSQL, insert row by row to avoid complex placeholder generation
				for (const voice of voices) {
					await db.run('INSERT INTO voices (id, name, eleven_labs_voice_id, system_prompt, created_at) VALUES ($1, $2, $3, $4, $5)', [voice.id, voice.name, voice.elevenLabsVoiceId, voice.systemPrompt, voice.createdAt]);
				}
			} else {
				// For SQLite, use multi-row insert
				const placeholders = voices.map(() => '(?, ?, ?, ?, ?)').join(', ');
				const params = [];
				voices.forEach((voice) => {
					params.push(voice.id, voice.name, voice.elevenLabsVoiceId, voice.systemPrompt, voice.createdAt);
				});

				const sql = `INSERT INTO voices (id, name, eleven_labs_voice_id, system_prompt, created_at) VALUES ${placeholders}`;
				await db.run(sql, params);
			}
		}

		console.log(`✅ Saved ${voices.length} voices`);
	} catch (error) {
		console.error('❌ Failed to save voices:', error.message);
		throw error;
	}
}

/**
 * Get conversation by ID
 * @param {string} id - Conversation ID
 * @returns {Promise<Object>}
 */
async function getConversation(id) {
	try {
		const sql = db.IS_POSTGRES ? 'SELECT * FROM conversations WHERE id = $1' : 'SELECT * FROM conversations WHERE id = ?';
		const row = await db.queryOne(sql, [id]);
		if (!row) {
			const err = new Error(`Conversation not found: ${id}`);
			err.status = 404;
			throw err;
		}
		const conversation = rowToConversation(row);
		console.log(`✅ Loaded conversation ${id}`);
		return conversation;
	} catch (error) {
		if (error.status !== 404) {
			console.error(`❌ Failed to get conversation ${id}:`, error.message);
		}
		throw error;
	}
}

/**
 * Save conversation
 * @param {Object} conv - Conversation object
 * @returns {Promise}
 */
async function saveConversation(conv) {
	try {
		const messagesJson = JSON.stringify(conv.messages);
		const params = [conv.id, conv.voiceId, conv.title, conv.activeLanguage, conv.activeLlmModel, messagesJson, conv.createdAt, conv.updatedAt];

		const sql = db.IS_POSTGRES
			? `INSERT INTO conversations (id, voice_id, title, active_language, active_llm_model, messages, created_at, updated_at)
			   VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
			   ON CONFLICT (id) DO UPDATE SET
			   voice_id = EXCLUDED.voice_id,
			   title = EXCLUDED.title,
			   active_language = EXCLUDED.active_language,
			   active_llm_model = EXCLUDED.active_llm_model,
			   messages = EXCLUDED.messages,
			   created_at = EXCLUDED.created_at,
			   updated_at = EXCLUDED.updated_at`
			: `INSERT OR REPLACE INTO conversations (id, voice_id, title, active_language, active_llm_model, messages, created_at, updated_at)
			   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

		await db.run(sql, params);
		console.log(`✅ Saved conversation ${conv.id}`);
	} catch (error) {
		console.error(`❌ Failed to save conversation ${conv.id}:`, error.message);
		throw error;
	}
}

/**
 * List all conversations (without message content)
 * @returns {Promise<Array>}
 */
async function listConversations() {
	try {
		const rows = await db.query('SELECT id, voice_id, title, created_at, updated_at FROM conversations ORDER BY updated_at DESC');
		const conversations = rows.map((row) => ({
			id: row.id,
			voiceId: row.voice_id,
			title: row.title,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}));
		console.log(`✅ Listed ${conversations.length} conversations`);
		return conversations;
	} catch (error) {
		console.error('❌ Failed to list conversations:', error.message);
		throw error;
	}
}

/**
 * Delete conversation
 * @param {string} id - Conversation ID
 * @returns {Promise}
 */
async function deleteConversation(id) {
	try {
		// Check if conversation exists first
		const sql = db.IS_POSTGRES ? 'SELECT 1 FROM conversations WHERE id = $1' : 'SELECT 1 FROM conversations WHERE id = ?';
		const existing = await db.queryOne(sql, [id]);
		if (!existing) {
			const err = new Error(`Conversation not found: ${id}`);
			err.status = 404;
			throw err;
		}

		// Delete the conversation
		const deleteSql = db.IS_POSTGRES ? 'DELETE FROM conversations WHERE id = $1' : 'DELETE FROM conversations WHERE id = ?';
		await db.run(deleteSql, [id]);

		console.log(`✅ Deleted conversation ${id}`);
	} catch (error) {
		if (error.status !== 404) {
			console.error(`❌ Failed to delete conversation ${id}:`, error.message);
		}
		throw error;
	}
}

module.exports = {
	getVoices,
	saveVoices,
	getConversation,
	saveConversation,
	listConversations,
	deleteConversation,
};
