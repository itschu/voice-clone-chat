// Chat page
// Exposes window.chatPage = { init }

// Module-level state variables
let chatVoices = [];
let conversations = [];
let activeConversationId = null;
let isRecording = false;
let mediaRecorder = null;
let audioChunks = [];
let turnQueue = [];
let isProcessingTurn = false;
let navigationToken = 0; // For context-staleness guard

// Utility to escape HTML
function escapeHtml(text) {
	const div = document.createElement('div');
	div.textContent = text;
	return div.innerHTML;
}

// Helper function to render AI content with "No response" handling
function renderAiContent(content) {
	if (!content || content === 'No response') {
		return '<span class="no-response">No response</span>';
	}
	return escapeHtml(content);
}

// Show a toast message
function showToast(message, duration = 4000) {
	const toast = document.getElementById('toast');
	if (toast) {
		toast.textContent = message;
		toast.classList.remove('hidden');

		setTimeout(() => {
			toast.classList.add('hidden');
		}, duration);
	}
}

// Initialize the chat page
function init() {
	// Set the HTML content for the chat page
	const chatView = document.getElementById('view-chat');
	chatView.innerHTML = `
    <div class="chat-layout">
      <!-- Sidebar -->
      <div class="sidebar">
        <div class="sidebar-header">
          <h1>VoiceRA</h1>
          <button id="new-chat-btn" class="btn btn-primary">+ New Chat</button>
        </div>
        <div class="conv-list" id="conv-list"></div>
        <div class="nav-links">
          <a href="#/voices" class="nav-link">Manage Voices</a>
          <a href="#/chat" class="nav-link active">Chat</a>
        </div>
      </div>

      <div class="sidebar-overlay" id="sidebar-overlay"></div>

      <!-- Chat Area -->
      <div class="chat-area">
        <div class="chat-toolbar">
          <button id="menu-btn" class="menu-btn">☰</button>
          <label>Speaking as:</label>
          <select id="voice-select" disabled>
            <option value="">Select a voice...</option>
          </select>
        </div>
        <div id="chat-messages" class="chat-messages">
          <div class="chat-empty">
            <div class="empty-icon">💬</div>
            <p>Select a voice to begin.</p>
          </div>
        </div>
        <div class="chat-input-bar">
          <div id="status-label" class="status-label">Select a voice to begin.</div>
          <button id="mic-btn" class="mic-btn" disabled>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <!-- Toast -->
    <div id="toast" class="toast hidden"></div>
  `;

	// Fetch initial data
	fetchInitialData();

	// Attach event listeners
	document.getElementById('new-chat-btn').addEventListener('click', handleNewChat);
	document.getElementById('voice-select').addEventListener('change', handleVoiceSelect);
	document.getElementById('mic-btn').addEventListener('click', handleMicClick);

	// Mobile sidebar toggle
	document.getElementById('menu-btn').addEventListener('click', () => {
		const sidebar = document.querySelector('.sidebar');
		const overlay = document.getElementById('sidebar-overlay');
		if (sidebar && overlay) {
			sidebar.classList.add('open');
			overlay.classList.add('visible');
		}
	});

	document.getElementById('sidebar-overlay').addEventListener('click', () => {
		const sidebar = document.querySelector('.sidebar');
		const overlay = document.getElementById('sidebar-overlay');
		if (sidebar && overlay) {
			sidebar.classList.remove('open');
			overlay.classList.remove('visible');
		}
	});
}

// Fetch initial data (voices and conversations)
async function fetchInitialData() {
	try {
		// Fetch voices
		const voicesResponse = await fetch('/api/voices');
		if (!voicesResponse.ok) throw new Error('Failed to fetch voices');
		chatVoices = await voicesResponse.json();

		// Populate voice select dropdown
		const voiceSelect = document.getElementById('voice-select');
		voiceSelect.innerHTML = '<option value="">Select a voice...</option>';
		chatVoices.forEach((voice) => {
			const option = document.createElement('option');
			option.value = voice.id;
			option.textContent = voice.name;
			voiceSelect.appendChild(option);
		});

		// Fetch conversations
		const convResponse = await fetch('/api/conversations');
		if (!convResponse.ok) throw new Error('Failed to fetch conversations');
		conversations = await convResponse.json();

		// Render conversation list
		renderConvList();
	} catch (error) {
		console.error('Error fetching initial data:', error);
		showToast('Failed to load data. Please refresh the page.');
	}
}

// Render the conversation list
function renderConvList() {
	const convList = document.getElementById('conv-list');
	convList.innerHTML = '';

	conversations.forEach((conv) => {
		const convItem = document.createElement('div');
		convItem.className = 'conv-item';
		convItem.dataset.id = conv.id;

		// Find voice name
		const voice = chatVoices.find((v) => v.id === conv.voiceId);
		const voiceName = voice ? voice.name : 'Unknown Voice';

		convItem.innerHTML = `
      <div class="conv-title">${escapeHtml(conv.title || 'New Conversation')}</div>
      <div class="conv-voice">${escapeHtml(voiceName)}</div>
    `;

		// Mark as active if this is the active conversation
		if (conv.id === activeConversationId) {
			convItem.classList.add('active');
		}

		convItem.addEventListener('click', () => {
			loadConversation(conv.id);

			// Close sidebar on mobile
			const sidebar = document.querySelector('.sidebar');
			const overlay = document.getElementById('sidebar-overlay');
			if (sidebar && overlay) {
				sidebar.classList.remove('open');
				overlay.classList.remove('visible');
			}
		});
		convList.appendChild(convItem);
	});
}

// Handle new chat button click
function handleNewChat() {
	turnQueue = [];
	navigationToken++; // Increment navigation token

	activeConversationId = null;

	// Clear chat messages and show empty state
	const chatMessages = document.getElementById('chat-messages');
	chatMessages.innerHTML = `
    <div class="chat-empty">
      <div class="empty-icon">💬</div>
      <p>Select a voice to begin.</p>
    </div>
  `;

	// Enable voice select and reset its value
	const voiceSelect = document.getElementById('voice-select');
	voiceSelect.value = '';
	voiceSelect.disabled = false;

	// Update status label
	document.getElementById('status-label').textContent = 'Select a voice to begin.';

	// Disable mic button
	document.getElementById('mic-btn').disabled = true;

	// Remove active class from all conversation items
	document.querySelectorAll('.conv-item').forEach((item) => {
		item.classList.remove('active');
	});
}

// Handle voice selection
async function handleVoiceSelect() {
	const voiceSelect = document.getElementById('voice-select');
	const voiceId = voiceSelect.value;

	if (!voiceId) return;

	try {
		// Create a new conversation
		const response = await fetch('/api/conversations', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({ voiceId }),
		});

		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to create conversation');
		}

		const newConversation = await response.json();

		// Set as active conversation
		activeConversationId = newConversation.id;

		// Add to conversations array
		conversations.unshift(newConversation);

		// Update conversation list
		renderConvList();

		// Update status label
		const voice = chatVoices.find((v) => v.id === voiceId);
		const voiceName = voice ? voice.name : 'Voice';
		document.getElementById('status-label').textContent = `${escapeHtml(voiceName)} is ready. Press the mic to start talking.`;

		// Enable mic button
		document.getElementById('mic-btn').disabled = false;

		// Clear chat messages
		document.getElementById('chat-messages').innerHTML = '';
	} catch (error) {
		console.error('Error creating conversation:', error);
		showToast(error.message || 'Failed to create conversation');

		// Reset voice select
		voiceSelect.value = '';
	}
}

// Load a conversation
async function loadConversation(id) {
	turnQueue = [];
	navigationToken++; // Increment navigation token

	try {
		const response = await fetch(`/api/conversations/${id}`);
		if (!response.ok) {
			const errorData = await response.json();
			throw new Error(errorData.error || 'Failed to load conversation');
		}

		const conversation = await response.json();

		// Set as active conversation
		activeConversationId = id;

		// Render messages
		renderMessages(conversation.messages);

		// Set voice select value and disable it
		const voiceSelect = document.getElementById('voice-select');
		voiceSelect.value = conversation.voiceId;
		voiceSelect.disabled = true;

		// Update status label
		document.getElementById('status-label').textContent = 'Press mic to speak';

		// Enable mic button
		document.getElementById('mic-btn').disabled = false;

		// Update active class in sidebar
		document.querySelectorAll('.conv-item').forEach((item) => {
			item.classList.remove('active');
			if (item.dataset.id === id) {
				item.classList.add('active');
			}
		});
	} catch (error) {
		console.error('Error loading conversation:', error);
		showToast(error.message || 'Failed to load conversation');
	}
}

// Render messages in the chat
function renderMessages(messages) {
	const chatMessages = document.getElementById('chat-messages');
	chatMessages.innerHTML = '';

	if (!messages || messages.length === 0) {
		chatMessages.innerHTML = `
      <div class="chat-empty">
        <div class="empty-icon">💬</div>
        <p>This conversation is empty. Press the mic to start talking.</p>
      </div>
    `;
		return;
	}

	messages.forEach((message) => {
		const bubble = document.createElement('div');
		bubble.className = `bubble ${message.role}`;

		if (message.role === 'user') {
			bubble.innerHTML = escapeHtml(message.content);
		} else if (message.role === 'assistant') {
			bubble.innerHTML = `
        ${renderAiContent(message.content)}
        <audio class="bubble-audio" src="${escapeHtml(message.audioUrl)}" controls></audio>
      `;
		}

		chatMessages.appendChild(bubble);
	});

	// Scroll to bottom
	chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Handle mic button click
function handleMicClick() {
	if (!isRecording) {
		startRecording();
	} else {
		stopRecording();
	}
}

// Start recording
async function startRecording() {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		mediaRecorder = new MediaRecorder(stream);

		mediaRecorder.ondataavailable = (e) => {
			if (e.data.size > 0) {
				audioChunks.push(e.data);
			}
		};

		mediaRecorder.onstop = handleRecordingStop;

		mediaRecorder.start();
		isRecording = true;

		// Update UI
		const micBtn = document.getElementById('mic-btn');
		micBtn.classList.add('recording');
		document.getElementById('status-label').textContent = 'Listening… click to stop';
	} catch (error) {
		console.error('Error starting recording:', error);
		showToast('Failed to access microphone. Please check permissions.');
	}
}

// Stop recording
function stopRecording() {
	if (mediaRecorder && isRecording) {
		mediaRecorder.stop();
		isRecording = false;

		// Update UI
		const micBtn = document.getElementById('mic-btn');
		micBtn.classList.remove('recording');
	}
}

// Handle recording stop
function handleRecordingStop() {
	const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
	audioChunks = [];

	// Push turn to queue
	turnQueue.push({ audioBlob, mimeType: mediaRecorder.mimeType, conversationId: activeConversationId });

	// Process queue if not already processing
	if (!isProcessingTurn) {
		drainQueue();
	}

	// Stop all tracks in the stream
	if (mediaRecorder && mediaRecorder.stream) {
		mediaRecorder.stream.getTracks().forEach((track) => track.stop());
	}
}

// Drain the turn queue
async function drainQueue() {
	isProcessingTurn = true;
	let failed = false;

	while (turnQueue.length > 0) {
		const item = turnQueue.shift();

		try {
			await submitTurn(item.audioBlob, item.mimeType, item.conversationId);

			// If there are more items in the queue, update status
			if (turnQueue.length > 0) {
				document.getElementById('status-label').textContent = `Thinking… (${turnQueue.length} more queued)`;
			}
		} catch (error) {
			// Failure policy: clear queue and show toast
			turnQueue = [];
			failed = true;
			showToast('Turn failed. Remaining queued turns cleared.');
			document.getElementById('status-label').textContent = 'Turn failed. Queue cleared.';
			break;
		}
	}

	isProcessingTurn = false;

	// If we didn't fail, set status to ready
	if (!failed) {
		document.getElementById('status-label').textContent = 'Press mic to speak';
	}
}

// Submit a turn (two-phase: transcribe then process)
async function submitTurn(audioBlob, mimeType, conversationId) {
	const turnId = crypto.randomUUID();

	// Add pending user bubble
	const chatMessages = document.getElementById('chat-messages');
	const pendingBubble = document.createElement('div');
	pendingBubble.className = 'bubble user pending';
	pendingBubble.id = 'pending-user';
	pendingBubble.textContent = 'Transcribing…';
	chatMessages.appendChild(pendingBubble);

	// Scroll to bottom
	chatMessages.scrollTop = chatMessages.scrollHeight;

	// Update status label
	document.getElementById('status-label').textContent = 'Transcribing…';

	try {
		// Phase 1: Transcribe audio
		const transcribeFormData = new FormData();
		transcribeFormData.append('audio', audioBlob, 'recording.webm');

		const transcribeResponse = await fetch(`/api/conversations/${conversationId}/transcribe`, {
			method: 'POST',
			body: transcribeFormData,
		});

		if (!transcribeResponse.ok) {
			const errorData = await transcribeResponse.json();
			throw new Error('Transcription failed: ' + (errorData.error || 'Unknown error'));
		}

		const transcribeResult = await transcribeResponse.json();

		// Update pending bubble text to transcribed text
		pendingBubble.textContent = transcribeResult.text;

		// Update status label to "Thinking…" with queue info if needed
		if (turnQueue.length > 0) {
			document.getElementById('status-label').textContent = `Thinking… (${turnQueue.length} more queued)`;
		} else {
			document.getElementById('status-label').textContent = 'Thinking…';
		}

		// Phase 2: Process turn with transcribed text
		const turnFormData = new FormData();
		turnFormData.append('turnId', turnId);
		turnFormData.append('transcribedText', transcribeResult.text);

		const turnResponse = await fetch(`/api/conversations/${conversationId}/turn`, {
			method: 'POST',
			body: turnFormData,
		});

		if (!turnResponse.ok) {
			const errorData = await turnResponse.json();
			throw new Error(errorData.error || 'Failed to process turn');
		}

		const result = await turnResponse.json();

		// Remove pending user bubble
		const pendingUser = document.getElementById('pending-user');
		if (pendingUser) {
			pendingUser.remove();
		}

		// Add user message bubble
		const userBubble = document.createElement('div');
		userBubble.className = 'bubble user';
		userBubble.innerHTML = escapeHtml(result.userMessage.content);
		chatMessages.appendChild(userBubble);

		// Add AI message bubble
		const aiBubble = document.createElement('div');
		aiBubble.className = 'bubble ai';
		aiBubble.innerHTML = `
      ${renderAiContent(result.aiMessage.content)}
      <audio class="bubble-audio" src="${escapeHtml(result.aiMessage.audioUrl)}" controls></audio>
    `;
		chatMessages.appendChild(aiBubble);

		// Auto-play AI audio
		const audio = aiBubble.querySelector('audio');
		if (audio) {
			audio.play().catch((e) => console.log('Auto-play prevented:', e));
		}

		// Check if conversation title needs to be updated
		const conversation = conversations.find((c) => c.id === conversationId);
		if (conversation && conversation.title === 'New Conversation') {
			// Re-fetch conversations to get updated title
			try {
				const convResponse = await fetch('/api/conversations');
				if (convResponse.ok) {
					conversations = await convResponse.json();
					renderConvList();
				}
			} catch (error) {
				console.error('Error refreshing conversations:', error);
			}
		}

		// Scroll to bottom
		chatMessages.scrollTop = chatMessages.scrollHeight;
	} catch (error) {
		console.error('Error submitting turn:', error);

		// Remove pending user bubble
		const pendingUser = document.getElementById('pending-user');
		if (pendingUser) {
			pendingUser.remove();
		}

		// Re-throw error so drainQueue can catch it and apply failure policy
		throw error;
	}
}

// Expose the init function to the global scope
window.chatPage = { init };
