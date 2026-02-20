/**
 * Data Store Service
 * Handles persistent storage for voices, conversations, and audio files
 */

const fs = require('fs');
const path = require('path');

// Directory initialization (runs on require)
const DATA_DIR = path.join(__dirname, '../../data');
const CONVERSATIONS_DIR = path.join(DATA_DIR, 'conversations');
const AUDIO_DIR = path.join(DATA_DIR, 'audio');

// Ensure data directories exist
try {
	fs.mkdirSync(DATA_DIR, { recursive: true });
	fs.mkdirSync(CONVERSATIONS_DIR, { recursive: true });
	fs.mkdirSync(AUDIO_DIR, { recursive: true });
} catch (error) {
	console.error('❌ Failed to create data directories:', error.message);
	process.exit(1);
}

// In-process queue for serializing concurrent writes
const queues = new Map();

/**
 * Private function to enqueue async operations
 * Ensures sequential execution of writes to the same resource
 * @param {string} key - Resource identifier
 * @param {Function} fn - Async function to execute
 * @returns {Promise}
 */
function enqueue(key, fn) {
	const currentTail = queues.get(key) || Promise.resolve();
	const newTail = currentTail.catch(() => {}).then(() => fn());
	queues.set(key, newTail);
	return newTail;
}

/**
 * Get all voices
 * @returns {Promise<Array>}
 */
async function getVoices() {
	try {
		const voicesPath = path.join(DATA_DIR, 'voices.json');
		const data = fs.readFileSync(voicesPath, 'utf-8');
		const voices = JSON.parse(data);
		console.log(`✅ Loaded ${voices.length} voices`);
		return voices;
	} catch (error) {
		if (error.code === 'ENOENT') {
			return [];
		}
		throw error;
	}
}

/**
 * Save voices
 * @param {Array} voices - Array of voice objects
 * @returns {Promise}
 */
async function saveVoices(voices) {
	return enqueue('voices', async () => {
		try {
			const voicesPath = path.join(DATA_DIR, 'voices.json');
			const tmpPath = voicesPath + '.tmp';
			fs.writeFileSync(tmpPath, JSON.stringify(voices, null, 2));
			fs.renameSync(tmpPath, voicesPath);
			console.log(`✅ Saved ${voices.length} voices`);
		} catch (error) {
			console.error('❌ Failed to save voices:', error.message);
			throw error;
		}
	});
}

/**
 * Get conversation by ID
 * @param {string} id - Conversation ID
 * @returns {Promise<Object>}
 */
async function getConversation(id) {
	try {
		const convPath = path.join(CONVERSATIONS_DIR, `${id}.json`);
		const data = fs.readFileSync(convPath, 'utf-8');
		const conversation = JSON.parse(data);
		console.log(`✅ Loaded conversation ${id}`);
		return conversation;
	} catch (error) {
		if (error.code === 'ENOENT') {
			const err = new Error(`Conversation not found: ${id}`);
			err.status = 404;
			throw err;
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
	return enqueue(conv.id, async () => {
		try {
			const convPath = path.join(CONVERSATIONS_DIR, `${conv.id}.json`);
			const tmpPath = convPath + '.tmp';
			fs.writeFileSync(tmpPath, JSON.stringify(conv, null, 2));
			fs.renameSync(tmpPath, convPath);
			console.log(`✅ Saved conversation ${conv.id}`);
		} catch (error) {
			console.error(`❌ Failed to save conversation ${conv.id}:`, error.message);
			throw error;
		}
	});
}

/**
 * List all conversations (without message content)
 * @returns {Promise<Array>}
 */
async function listConversations() {
	try {
		const files = fs.readdirSync(CONVERSATIONS_DIR).filter((f) => f.endsWith('.json'));
		const conversations = [];

		for (const file of files) {
			const convPath = path.join(CONVERSATIONS_DIR, file);
			const data = fs.readFileSync(convPath, 'utf-8');
			const conv = JSON.parse(data);
			conversations.push({
				id: conv.id,
				voiceId: conv.voiceId,
				title: conv.title,
				createdAt: conv.createdAt,
				updatedAt: conv.updatedAt,
			});
		}

		// Sort by updatedAt descending
		conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

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
		const convPath = path.join(CONVERSATIONS_DIR, `${id}.json`);
		fs.unlinkSync(convPath);
		console.log(`✅ Deleted conversation ${id}`);
	} catch (error) {
		if (error.code === 'ENOENT') {
			const err = new Error(`Conversation not found: ${id}`);
			err.status = 404;
			throw err;
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
