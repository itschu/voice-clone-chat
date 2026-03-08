const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../services/dataStore');
const elevenlabs = require('../services/elevenlabs');
const llmFactory = require('../services/llmFactory');
const storage = require('../services/storage');
const franc = require('franc');
const settingsStore = require('../services/settingsStore');
const openrouterStatus = require('../services/openrouterStatus');

const router = express.Router();
const turnUpload = multer({ storage: multer.memoryStorage() });

// Per-conversation turn queue to prevent concurrent turn lost-updates
const turnQueues = new Map();

// Voice switch instruction for LLM
const VOICE_SWITCH_META = `If the user asks to switch to a different voice or persona, you MUST output the following JSON on its own line BEFORE your reply — no preamble, no explanation before it:
{"switchVoice":"<exact voice name>"}
Then continue your reply as the new persona on the next line.
Example:
{"switchVoice":"Didi"}
Hello! I am Didi, great to meet you.
If no voice switch is requested, respond normally with no JSON prefix whatsoever.`;

// Helper function to extract voice switch signal from LLM response
function extractSwitchVoiceSignal(text) {
	if (!text) return null;

	// Priority 1: Fenced block at start: ```json\n{...}\n```
	let match = text.match(/^\`\`\`(?:json)?\s*\n(\{[^\n]*\})\s*\n\`\`\`\s*\n?/);
	if (match) {
		try {
			const parsed = JSON.parse(match[1]);
			if (typeof parsed.switchVoice === 'string' && parsed.switchVoice) {
				return {
					switchVoice: parsed.switchVoice,
					replyText: text.slice(match[0].length).trim(),
				};
			}
		} catch (e) {
			// Continue to next candidate if JSON parsing fails
		}
	}

	// Priority 2: Clean first-line JSON: {"switchVoice":"Didi"}\n...
	match = text.match(/^(\{[^\n]*\})\s*\n?/);
	if (match) {
		try {
			const parsed = JSON.parse(match[1]);
			if (typeof parsed.switchVoice === 'string' && parsed.switchVoice) {
				return {
					switchVoice: parsed.switchVoice,
					replyText: text.slice(match[0].length).trim(),
				};
			}
		} catch (e) {
			// Return null if JSON parsing fails
		}
	}

	// Priority 3: Scan all lines for JSON pattern
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const jsonMatch = line.match(/\{[^\n]*\}/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[0]);
				if (typeof parsed.switchVoice === 'string' && parsed.switchVoice) {
					// Remove the line containing the JSON from the array
					lines.splice(i, 1);
					// Join the remaining lines back together
					const replyText = lines.join('\n').trim();
					return {
						switchVoice: parsed.switchVoice,
						replyText: replyText,
					};
				}
			} catch (e) {
				// Continue to next line if JSON parsing fails
			}
		}
	}

	return null;
}

// LLM switch instruction for LLM
const LLM_SWITCH_META = `If the user asks to switch LLM, emit {"switchLLM":"model-id"} on its own line BEFORE your reply. Use exact model IDs from the available list.`;

// Helper function to extract LLM switch signal from LLM response
function extractSwitchLlmSignal(text) {
	if (!text) return null;

	// Priority 1: Fenced block at start: ```json\n{...}\n```
	let match = text.match(/^\`\`\`(?:json)?\s*\n(\{[^\n]*\})\s*\n\`\`\`\s*\n?/);
	if (match) {
		try {
			const parsed = JSON.parse(match[1]);
			if (typeof parsed.switchLLM === 'string' && parsed.switchLLM) {
				return {
					switchLLM: parsed.switchLLM,
					replyText: text.slice(match[0].length).trim(),
				};
			}
		} catch (e) {
			// Continue to next candidate if JSON parsing fails
		}
	}

	// Priority 2: Clean first-line JSON: {"switchLLM":"model-id"}\n...
	match = text.match(/^(\{[^\n]*\})\s*\n?/);
	if (match) {
		try {
			const parsed = JSON.parse(match[1]);
			if (typeof parsed.switchLLM === 'string' && parsed.switchLLM) {
				return {
					switchLLM: parsed.switchLLM,
					replyText: text.slice(match[0].length).trim(),
				};
			}
		} catch (e) {
			// Return null if JSON parsing fails
		}
	}

	// Priority 3: Scan all lines for JSON pattern
	const lines = text.split('\n');
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const jsonMatch = line.match(/\{[^\n]*\}/);
		if (jsonMatch) {
			try {
				const parsed = JSON.parse(jsonMatch[0]);
				if (typeof parsed.switchLLM === 'string' && parsed.switchLLM) {
					// Remove the line containing the JSON from the array
					lines.splice(i, 1);
					// Join the remaining lines back together
					const replyText = lines.join('\n').trim();
					return {
						switchLLM: parsed.switchLLM,
						replyText: replyText,
					};
				}
			} catch (e) {
				// Continue to next line if JSON parsing fails
			}
		}
	}

	return null;
}

function enqueueTurn(conversationId, fn) {
	const current = turnQueues.get(conversationId) || Promise.resolve();
	const next = current.catch(() => {}).then(() => fn());
	turnQueues.set(conversationId, next);
	return next;
}

// GET / - list conversations
router.get('/', async (req, res) => {
	try {
		const conversations = await dataStore.listConversations();
		res.json(conversations);
	} catch (error) {
		console.error('❌ Error listing conversations:', error);
		res.status(500).json({ error: 'Failed to list conversations' });
	}
});

// POST / - create conversation
router.post('/', async (req, res) => {
	try {
		const { voiceId } = req.body;

		if (!voiceId) {
			return res.status(400).json({ error: 'voiceId is required' });
		}

		const voices = await dataStore.getVoices();
		const voice = voices.find((v) => v.id === voiceId);

		if (!voice) {
			return res.status(404).json({ error: 'Voice not found' });
		}

		const conversation = {
			id: uuidv4(),
			voiceId,
			title: 'New Conversation',
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
			messages: [],
		};

		await dataStore.saveConversation(conversation);
		res.status(201).json(conversation);
	} catch (error) {
		console.error('❌ Error creating conversation:', error);
		res.status(500).json({ error: 'Failed to create conversation' });
	}
});

// GET /:id - get full conversation
router.get('/:id', async (req, res) => {
	try {
		const conversation = await dataStore.getConversation(req.params.id);

		// Load voices to check if the conversation's voice still exists
		const voices = await dataStore.getVoices();

		// Check if the conversation's voice exists
		const voiceExists = voices.find((v) => v.id === conversation.voiceId);

		// Branch A - voice found: proceed without changes
		if (voiceExists) {
			return res.json(conversation);
		}

		// Branch B - voice missing, no voices available: proceed without changes
		if (voices.length === 0) {
			return res.json(conversation);
		}

		// Branch C - voice missing, but we have voices available: recover by assigning first voice
		const fromVoiceId = conversation.voiceId;
		conversation.voiceId = voices[0].id;

		// Build recovery event
		const recoveryEvent = {
			id: uuidv4(),
			turnId: null,
			role: 'system',
			type: 'voiceSwitch',
			subtype: 'recovery',
			fromVoiceId: fromVoiceId,
			fromVoiceName: 'Unknown',
			toVoiceId: voices[0].id,
			toVoiceName: voices[0].name,
			timestamp: new Date().toISOString(),
		};

		// Add recovery event to messages and update timestamp
		// Defensively normalize conversation.messages to ensure it's an array
		if (!Array.isArray(conversation.messages)) {
			conversation.messages = [];
		}
		conversation.messages.push(recoveryEvent);
		conversation.updatedAt = new Date().toISOString();

		// Save updated conversation
		await dataStore.saveConversation(conversation);

		// Log recovery action
		console.log(`⚠️ Voice recovery: assigned ${voices[0].name} to conversation ${req.params.id}`);

		res.json(conversation);
	} catch (error) {
		res.status(error.status || 500).json({ error: error.message || 'Failed to get conversation' });
	}
});

// DELETE /:id - delete conversation
router.delete('/:id', async (req, res) => {
	try {
		await dataStore.getConversation(req.params.id); // Will throw 404 if not found
		await dataStore.deleteConversation(req.params.id);
		await storage.deleteSession(req.params.id); // Already handles ENOENT internally
		res.status(204).send();
	} catch (error) {
		res.status(error.status || 500).json({ error: error.message || 'Failed to delete conversation' });
	}
});

// POST /:id/transcribe - transcribe audio to text
router.post('/:id/transcribe', turnUpload.single('audio'), async (req, res) => {
	try {
		// Validate req.file exists
		if (!req.file) {
			return res.status(400).json({ error: 'audio file is required' });
		}

		// Load conversation (will propagate 404 if not found)
		await dataStore.getConversation(req.params.id);

		// Transcribe speech
		const { text } = await elevenlabs.transcribeSpeech(req.file.buffer, req.file.mimetype);

		res.json({ text });
	} catch (error) {
		console.error(`❌ Transcription failed: ${error.message}`);
		res.status(error.status || 500).json({ error: error.message });
	}
});

// POST /:id/turn - core turn pipeline
router.post('/:id/turn', (req, res) => {
	turnUpload.single('audio')(req, res, async (err) => {
		if (err instanceof multer.MulterError || err) {
			return res.status(400).json({ error: err.message || 'Multer error' });
		}

		try {
			await enqueueTurn(req.params.id, async () => {
				// Validate inputs
				if (!req.body.turnId) {
					return res.status(400).json({ error: 'turnId is required' });
				}

				if (!req.file && (!req.body.transcribedText || !req.body.transcribedText.trim())) {
					return res.status(400).json({ error: 'audio file or transcribedText is required' });
				}

				// Load conversation
				const conversation = await dataStore.getConversation(req.params.id); // Propagates 404

				// Idempotency check
				const existing = conversation.messages.filter((m) => m.turnId === req.body.turnId);
				if (existing.length > 0) {
					const userMessage = existing.find((m) => m.role === 'user');
					const aiMessage = existing.find((m) => m.role === 'assistant');

					// Look for system events
					const voiceSwitchEvent = existing.find((m) => m.role === 'system' && m.type === 'voiceSwitch' && m.turnId === req.body.turnId);
					const languageSwitchEvent = existing.find((m) => m.role === 'system' && m.type === 'languageSwitch' && m.turnId === req.body.turnId);
					const llmSwitchEvent = existing.find((m) => m.role === 'system' && m.type === 'llmSwitch' && m.subtype === 'switch' && m.turnId === req.body.turnId);
					const llmFallbackEvent = existing.find((m) => m.role === 'system' && m.type === 'llmSwitch' && m.subtype === 'fallback' && m.turnId === req.body.turnId);

					const response = { userMessage, aiMessage };
					if (voiceSwitchEvent) {
						response.voiceSwitchEvent = voiceSwitchEvent;
					}
					if (languageSwitchEvent) {
						response.languageSwitchEvent = languageSwitchEvent;
					}
					if (llmSwitchEvent) {
						response.llmSwitchEvent = llmSwitchEvent;
					}
					if (llmFallbackEvent) {
						response.llmFallbackEvent = llmFallbackEvent;
					}

					return res.json(response);
				}

				// Atomic pipeline
				let aiMessageId;
				let audioSaved = false;

				try {
					// Load voice
					const voices = await dataStore.getVoices();
					const voice = voices.find((v) => v.id === conversation.voiceId);
					if (!voice) {
						return res.status(404).json({ error: 'Voice not found' });
					}

					// Transcribe speech
					console.log(`🎙️ Transcribing speech for turn ${req.body.turnId}`);
					let userText;
					let sttLanguageCode;
					if (req.body.transcribedText && req.body.transcribedText.trim()) {
						userText = req.body.transcribedText.trim();
						sttLanguageCode = null;
					} else {
						const { text, languageCode } = await elevenlabs.transcribeSpeech(req.file.buffer, req.file.mimetype);
						userText = text;
						sttLanguageCode = languageCode;
					}

					// Language detection and instruction
					const settings = await settingsStore.getSettings();
					const currentActiveLanguage = conversation.activeLanguage || settings.defaultLanguage;
					let detectedLang,
						highConfidence,
						languageSwitchEvent = null,
						languageInstruction = null;
					if (sttLanguageCode !== null) {
						detectedLang = sttLanguageCode;
						highConfidence = true;
					} else {
						const rawFrancCode = franc(userText);
						// Normalize franc ISO-639-3 codes to BCP-47 codes used by the app
						const francToBcp47 = {
							eng: 'en',
							fra: 'fr',
							spa: 'es',
							deu: 'de',
							ara: 'ar',
							jpn: 'ja',
							// Add more mappings as needed for supported languages
						};
						detectedLang = francToBcp47[rawFrancCode] || rawFrancCode;
						highConfidence = userText.length >= 15 && rawFrancCode !== 'und';
					}
					if (highConfidence && detectedLang !== currentActiveLanguage) {
						conversation.activeLanguage = detectedLang;
						languageSwitchEvent = {
							id: uuidv4(),
							turnId: req.body.turnId,
							role: 'system',
							type: 'languageSwitch',
							subtype: 'switch',
							fromLanguage: currentActiveLanguage,
							toLanguage: detectedLang,
							timestamp: new Date().toISOString(),
						};
						const languageNames = { en: 'English', fr: 'French', es: 'Spanish', de: 'German', ar: 'Arabic', ja: 'Japanese' };
						languageInstruction = `Respond in ${languageNames[detectedLang] || detectedLang}.`;
					} else if (!highConfidence) {
						languageSwitchEvent = {
							id: uuidv4(),
							turnId: req.body.turnId,
							role: 'system',
							type: 'languageSwitch',
							subtype: 'lowConfidence',
							timestamp: new Date().toISOString(),
						};
					}

					// Prepare messages for LLM
					let systemContent = voice.systemPrompt + '\n\n' + VOICE_SWITCH_META;
					if (openrouterStatus.isActive()) {
						systemContent += '\n\n' + LLM_SWITCH_META;
					}
					if (languageInstruction) {
						systemContent += '\n\n' + languageInstruction;
					}
					const llmMessages = [{ role: 'system', content: systemContent }, ...conversation.messages.filter((m) => m.role === 'user' || m.role === 'assistant').map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: userText }];

					// Resolve model override
					let modelOverride = conversation.activeLlmModel || settings.preferredLlmModel || undefined;

					// Get LLM response with auto-fallback
					console.log('🎙️ LLM response received');
					let aiText;
					let llmFallbackEvent = null;
					try {
						aiText = await llmFactory.chat(llmMessages, { modelOverride });
					} catch (primaryError) {
						console.warn('⚠️ Primary LLM failed, attempting fallback');
						const fallbackOverride = settings.preferredLlmModel && settings.preferredLlmModel !== modelOverride ? settings.preferredLlmModel : undefined;
						try {
							aiText = await llmFactory.chat(llmMessages, { modelOverride: fallbackOverride });
							if (fallbackOverride !== undefined) {
								conversation.activeLlmModel = fallbackOverride;
								llmFallbackEvent = {
									id: uuidv4(),
									turnId: req.body.turnId,
									role: 'system',
									type: 'llmSwitch',
									subtype: 'fallback',
									model: fallbackOverride,
									timestamp: new Date().toISOString(),
								};
							} else {
								// Baseline fallback, no model change
								llmFallbackEvent = {
									id: uuidv4(),
									turnId: req.body.turnId,
									role: 'system',
									type: 'llmSwitch',
									subtype: 'fallback',
									timestamp: new Date().toISOString(),
								};
							}
						} catch (fallbackError) {
							throw primaryError; // Re-throw original error
						}
					}

					// Trim and extract signal
					const trimmedAiText = aiText?.trim() || 'No response';

					// Extract LLM switch signal if OpenRouter active
					let llmSwitchEvent = null;
					let textAfterLlmSignal = trimmedAiText;
					if (openrouterStatus.isActive()) {
						const llmSignalResult = extractSwitchLlmSignal(trimmedAiText);
						if (llmSignalResult) {
							const models = await settingsStore.getOpenRouterModels();
							const model = models.find((m) => m.id === llmSignalResult.switchLLM);
							if (model) {
								conversation.activeLlmModel = llmSignalResult.switchLLM;
								llmSwitchEvent = {
									id: uuidv4(),
									turnId: req.body.turnId,
									role: 'system',
									type: 'llmSwitch',
									subtype: 'switch',
									model: llmSignalResult.switchLLM,
									timestamp: new Date().toISOString(),
								};
								textAfterLlmSignal = llmSignalResult.replyText;
							}
						}
					}

					const signalResult = extractSwitchVoiceSignal(textAfterLlmSignal);

					// Determine branch variables
					let replyText,
						ttsElevenLabsVoiceId,
						pendingSwitch = null;

					if (signalResult === null) {
						// No voice switch signal
						replyText = textAfterLlmSignal;
						ttsElevenLabsVoiceId = voice.elevenLabsVoiceId;
						pendingSwitch = null;
					} else {
						// Voice switch signal detected
						// Run partial case-insensitive match against voices array
						// Normalize the extracted switch voice name by trimming whitespace
						const normalizedSwitchVoice = signalResult.switchVoice.trim();
						const matches = voices.filter((v) => v.name.toLowerCase().includes(normalizedSwitchVoice.toLowerCase()) || normalizedSwitchVoice.toLowerCase().includes(v.name.toLowerCase()));

						if (matches.length === 0) {
							// No matching voice found
							replyText = `I couldn't find a voice named "${normalizedSwitchVoice}".`;
							ttsElevenLabsVoiceId = voice.elevenLabsVoiceId;
							pendingSwitch = null;
						} else if (matches.length >= 2) {
							// Multiple matching voices found
							replyText = `Did you mean ${matches.map((v) => v.name).join(' or ')}?`;
							ttsElevenLabsVoiceId = voice.elevenLabsVoiceId;
							pendingSwitch = null;
						} else {
							// Exactly one matching voice found
							const matchedVoice = matches[0];
							if (matchedVoice.id === conversation.voiceId) {
								// Already speaking as the requested voice
								replyText = `I'm already speaking as ${matchedVoice.name}.`;
								ttsElevenLabsVoiceId = voice.elevenLabsVoiceId;
								pendingSwitch = null;
							} else {
								// Switch to the new voice
								replyText = signalResult.replyText || 'No response';
								ttsElevenLabsVoiceId = matchedVoice.elevenLabsVoiceId;
								pendingSwitch = matchedVoice;
							}
						}
					}

					// Generate speech
					console.log('🎙️ TTS audio generated');
					const audioBuffer = await elevenlabs.generateSpeech(ttsElevenLabsVoiceId, replyText);

					// Save audio file
					aiMessageId = uuidv4();
					await storage.uploadFile(req.params.id, `${aiMessageId}.mp3`, audioBuffer);
					audioSaved = true;

					// Create message objects
					const userMessage = {
						id: uuidv4(),
						turnId: req.body.turnId,
						role: 'user',
						content: userText,
						timestamp: new Date().toISOString(),
					};

					const aiMessage = {
						id: aiMessageId,
						turnId: req.body.turnId,
						role: 'assistant',
						content: replyText,
						audioUrl: `/api/audio/${req.params.id}/${aiMessageId}.mp3`,
						timestamp: new Date().toISOString(),
					};

					// Handle voice switch if applicable
					let voiceSwitchEvent = null;
					if (pendingSwitch !== null) {
						// Capture voice info before mutation
						const fromVoiceId = conversation.voiceId;
						const fromVoiceName = voice.name;

						// Create voice switch event
						voiceSwitchEvent = {
							id: uuidv4(),
							turnId: req.body.turnId,
							role: 'system',
							type: 'voiceSwitch',
							subtype: 'switch',
							fromVoiceId: fromVoiceId,
							fromVoiceName: fromVoiceName,
							toVoiceId: pendingSwitch.id,
							toVoiceName: pendingSwitch.name,
							timestamp: new Date().toISOString(),
						};

						// Update conversation voice
						conversation.voiceId = pendingSwitch.id;

						// Add messages to conversation
						conversation.messages.push(userMessage, aiMessage, voiceSwitchEvent);
					} else {
						// No voice switch, just add user and AI messages
						conversation.messages.push(userMessage, aiMessage);
					}

					// Push additional system events
					if (languageSwitchEvent) conversation.messages.push(languageSwitchEvent);
					if (llmFallbackEvent) conversation.messages.push(llmFallbackEvent);
					if (llmSwitchEvent) conversation.messages.push(llmSwitchEvent);

					// Update conversation timestamp
					conversation.updatedAt = new Date().toISOString();

					// Set title if it's the first message
					if (conversation.title === 'New Conversation') {
						conversation.title = userText.split(' ').slice(0, 6).join(' ') + '…';
					}

					// Save conversation
					await dataStore.saveConversation(conversation);
					console.log(`✅ Turn saved for conversation ${req.params.id}`);

					// Build response
					const response = { userMessage, aiMessage };
					if (voiceSwitchEvent) {
						response.voiceSwitchEvent = voiceSwitchEvent;
					}
					if (languageSwitchEvent) {
						response.languageSwitchEvent = languageSwitchEvent;
					}
					if (llmSwitchEvent) {
						response.llmSwitchEvent = llmSwitchEvent;
					}
					if (llmFallbackEvent) {
						response.llmFallbackEvent = llmFallbackEvent;
					}

					res.json(response);
				} catch (error) {
					console.error(`❌ Turn pipeline failed: ${error.message}`);

					// Cleanup audio file if it was saved
					if (audioSaved && aiMessageId) {
						try {
							await storage.deleteFile(req.params.id, `${aiMessageId}.mp3`);
						} catch (cleanupError) {
							console.warn(`⚠️ Failed to cleanup audio file: ${cleanupError.message}`);
						}
					}

					res.status(error.status || 500).json({ error: error.message });
				}
			});
		} catch (error) {
			res.status(error.status || 500).json({ error: error.message || 'Failed to process turn' });
		}
	});
});

// PATCH /:id - update conversation active LLM model
router.patch('/:id', async (req, res) => {
	try {
		const conversation = await dataStore.getConversation(req.params.id);
		const models = await settingsStore.getOpenRouterModels();
		const { activeLlmModel } = req.body;

		if (typeof activeLlmModel !== 'string' || !models.find((m) => m.id === activeLlmModel)) {
			return res.status(400).json({ error: 'Invalid activeLlmModel' });
		}

		conversation.activeLlmModel = activeLlmModel;
		conversation.messages.push({
			id: uuidv4(),
			turnId: null,
			role: 'system',
			type: 'llmSwitch',
			subtype: 'switch',
			model: activeLlmModel,
			timestamp: new Date().toISOString(),
		});
		conversation.updatedAt = new Date().toISOString();
		await dataStore.saveConversation(conversation);

		res.status(200).json(conversation);
	} catch (error) {
		res.status(error.status || 500).json({ error: error.message || 'Failed to update conversation' });
	}
});

module.exports = router;
