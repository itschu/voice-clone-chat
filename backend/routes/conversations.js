const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const dataStore = require('../services/dataStore');
const elevenlabs = require('../services/elevenlabs');
const llmFactory = require('../services/llmFactory');
const storage = require('../services/storage');

const router = express.Router();
const turnUpload = multer({ storage: multer.memoryStorage() });

// Per-conversation turn queue to prevent concurrent turn lost-updates
const turnQueues = new Map();

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
    const voice = voices.find(v => v.id === voiceId);

    if (!voice) {
      return res.status(404).json({ error: 'Voice not found' });
    }

    const conversation = {
      id: uuidv4(),
      voiceId,
      title: 'New Conversation',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
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

        if (!req.file) {
          return res.status(400).json({ error: 'audio file is required' });
        }

        // Load conversation
        const conversation = await dataStore.getConversation(req.params.id); // Propagates 404

        // Idempotency check
        const existing = conversation.messages.filter(m => m.turnId === req.body.turnId);
        if (existing.length > 0) {
          const userMessage = existing.find(m => m.role === 'user');
          const aiMessage = existing.find(m => m.role === 'assistant');
          return res.json({ userMessage, aiMessage });
        }

        // Atomic pipeline
        let aiMessageId;
        let audioSaved = false;

        try {
          // Load voice
          const voices = await dataStore.getVoices();
          const voice = voices.find(v => v.id === conversation.voiceId);
          if (!voice) {
            return res.status(404).json({ error: 'Voice not found' });
          }

          // Transcribe speech
          console.log(`🎙️ Transcribing speech for turn ${req.body.turnId}`);
          const userText = await elevenlabs.transcribeSpeech(req.file.buffer, req.file.mimetype);

          // Prepare messages for LLM
          const llmMessages = [
            { role: 'system', content: voice.systemPrompt },
            ...conversation.messages.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userText }
          ];

          // Get LLM response
          console.log('🎙️ LLM response received');
          const aiText = await llmFactory.chat(llmMessages);

          // Generate speech
          console.log('🎙️ TTS audio generated');
          const audioBuffer = await elevenlabs.generateSpeech(voice.elevenLabsVoiceId, aiText);

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
            timestamp: new Date().toISOString()
          };

          const aiMessage = {
            id: aiMessageId,
            turnId: req.body.turnId,
            role: 'assistant',
            content: aiText,
            audioUrl: `/api/audio/${req.params.id}/${aiMessageId}.mp3`,
            timestamp: new Date().toISOString()
          };

          // Update conversation
          conversation.messages.push(userMessage, aiMessage);
          conversation.updatedAt = new Date().toISOString();

          // Set title if it's the first message
          if (conversation.title === 'New Conversation') {
            conversation.title = userText.split(' ').slice(0, 6).join(' ') + '…';
          }

          // Save conversation
          await dataStore.saveConversation(conversation);
          console.log(`✅ Turn saved for conversation ${req.params.id}`);

          res.json({ userMessage, aiMessage });
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

          res.status(500).json({ error: error.message });
        }
      });
    } catch (error) {
      res.status(error.status || 500).json({ error: error.message || 'Failed to process turn' });
    }
  });
});

module.exports = router;