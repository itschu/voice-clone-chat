// Voices management page
// Exposes window.voicesPage = { init }

// Module-level state variables
let voices = [];
let editingVoiceId = null;
let selectedFiles = [];

// Utility to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize the voices page
function init() {
  // Set the HTML content for the voices page
  const voicesView = document.getElementById('view-voices');
  voicesView.innerHTML = `
    <div class="voices-page">
      <div class="page-header">
        <h1>Voices</h1>
        <div class="page-header-actions">
          <button id="add-voice-btn" class="btn btn-primary">+ Add Voice</button>
        </div>
      </div>
      <div class="nav-links">
        <a href="#/voices" class="nav-link active">Manage Voices</a>
        <a href="#/chat" class="nav-link">Chat</a>
      </div>
      <div id="voice-form-container" class="voice-form hidden"></div>
      <div id="voice-list" class="voice-list"></div>
    </div>
  `;

  // Fetch voices and render the list
  fetchVoices();

  // Attach event listener for the add voice button
  document.getElementById('add-voice-btn').addEventListener('click', showCreateForm);
}

// Fetch voices from the API
async function fetchVoices() {
  try {
    const response = await fetch('/api/voices');
    if (!response.ok) throw new Error('Failed to fetch voices');
    voices = await response.json();
    renderVoiceList();
  } catch (error) {
    console.error('Error fetching voices:', error);
    document.getElementById('voice-list').innerHTML = '<div class="empty-state">Failed to load voices</div>';
  }
}

// Show the create voice form
function showCreateForm() {
  editingVoiceId = null;
  selectedFiles = [];

  const formContainer = document.getElementById('voice-form-container');
  formContainer.innerHTML = `
    <div class="voice-form">
      <h2>Create New Voice</h2>
      <div class="form-group">
        <label for="voice-name">Voice Name *</label>
        <input type="text" id="voice-name" placeholder="e.g., Grandma's Voice" />
      </div>
      <div class="form-group">
        <label for="voice-system-prompt">System Prompt *</label>
        <textarea id="voice-system-prompt" placeholder="Describe the personality and speaking style..."></textarea>
      </div>
      <div class="form-group" id="file-group">
        <label>Sample Audio Files *</label>
        <div id="file-drop-zone" class="file-drop">
          <div class="file-drop-content">
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <p class="file-drop-text">Click to upload or drag & drop</p>
            <p class="file-drop-hint">1–3 samples recommended • MP3/WAV/M4A • Max 10MB each</p>
          </div>
          <input type="file" id="voice-file-input" accept=".mp3,.wav,.m4a,audio/*" multiple hidden />
        </div>
        <div id="selected-files-list" class="selected-files"></div>
      </div>
      <div id="form-error" class="form-error hidden"></div>
      <div class="form-actions">
        <button id="voice-cancel-btn" class="btn btn-outline">Cancel</button>
        <button id="voice-submit-btn" class="btn btn-primary">Create Voice</button>
      </div>
    </div>
  `;

  formContainer.classList.remove('hidden');

  // Attach event listeners
  document.getElementById('file-drop-zone').addEventListener('click', () => {
    document.getElementById('voice-file-input').click();
  });

  document.getElementById('voice-file-input').addEventListener('change', handleFileSelection);

  // Drag and drop handlers
  const dropZone = document.getElementById('file-drop-zone');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    const files = Array.from(e.dataTransfer.files);
    validateAndAddFiles(files);
  });

  document.getElementById('voice-cancel-btn').addEventListener('click', () => {
    formContainer.classList.add('hidden');
  });

  document.getElementById('voice-submit-btn').addEventListener('click', handleCreateSubmit);
}

// Handle file selection
function handleFileSelection(e) {
  const files = Array.from(e.target.files);
  validateAndAddFiles(files);
}

// Validate and add files to selectedFiles
function validateAndAddFiles(files) {
  const errors = [];
  const validFiles = [];

  // Check total file count
  if (selectedFiles.length + files.length > 3) {
    errors.push('You can upload up to 3 samples.');
  }

  // Validate each file
  files.forEach(file => {
    if (selectedFiles.length + validFiles.length >= 3) return;

    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/mp4'];
    const allowedExtensions = ['.mp3', '.wav', '.m4a'];

    if (file.size > 10 * 1024 * 1024) {
      errors.push(`File "${file.name}" must be under 10MB.`);
    } else if (!allowedTypes.includes(file.type) && !allowedExtensions.includes(ext)) {
      errors.push(`File "${file.name}" is not a supported format. Upload MP3, WAV, or M4A.`);
    } else {
      validFiles.push(file);
    }
  });

  // Add valid files to selectedFiles
  selectedFiles.push(...validFiles);

  // Show errors if any
  if (errors.length > 0) {
    showError(errors.join('<br>'));
    return;
  }

  // Update the file list display
  updateSelectedFilesList();
}

// Update the selected files list display
function updateSelectedFilesList() {
  const fileList = document.getElementById('selected-files-list');
  fileList.innerHTML = '';

  selectedFiles.forEach((file, index) => {
    const fileItem = document.createElement('div');
    fileItem.className = 'selected-file';
    fileItem.innerHTML = `
      <span class="file-name">${escapeHtml(file.name)}</span>
      <span class="file-size">${(file.size / (1024 * 1024)).toFixed(1)} MB</span>
      <button class="btn-remove-file" data-index="${index}">×</button>
    `;
    fileList.appendChild(fileItem);

    // Add remove handler
    fileItem.querySelector('.btn-remove-file').addEventListener('click', (e) => {
      const index = parseInt(e.target.getAttribute('data-index'));
      selectedFiles.splice(index, 1);
      updateSelectedFilesList();
    });
  });
}

// Show error message
function showError(message) {
  const errorElement = document.getElementById('form-error');
  errorElement.innerHTML = message;
  errorElement.classList.remove('hidden');
}

// Hide error message
function hideError() {
  const errorElement = document.getElementById('form-error');
  errorElement.classList.add('hidden');
}

// Handle create voice submission
async function handleCreateSubmit() {
  const name = document.getElementById('voice-name').value.trim();
  const systemPrompt = document.getElementById('voice-system-prompt').value.trim();

  // Validate inputs
  if (!name) {
    showError('Voice name is required.');
    return;
  }

  if (!systemPrompt) {
    showError('System prompt is required.');
    return;
  }

  if (selectedFiles.length === 0) {
    showError('Please select at least one audio file.');
    return;
  }

  // Hide error if there was one
  hideError();

  // Disable submit button and show loading state
  const submitBtn = document.getElementById('voice-submit-btn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Cloning voice…';

  try {
    // Build FormData
    const formData = new FormData();
    formData.append('name', name);
    formData.append('systemPrompt', systemPrompt);
    selectedFiles.forEach(file => {
      formData.append('files', file);
    });

    // Send request to API
    const response = await fetch('/api/voices', {
      method: 'POST',
      body: formData
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to create voice');
    }

    const newVoice = await response.json();

    // Reset form and update UI
    document.getElementById('voice-form-container').classList.add('hidden');
    voices.unshift(newVoice); // Add to beginning of array
    renderVoiceList();

    // Reset form fields
    document.getElementById('voice-name').value = '';
    document.getElementById('voice-system-prompt').value = '';
    selectedFiles = [];
  } catch (error) {
    console.error('Error creating voice:', error);
    showError(error.message || 'Failed to create voice. Please try again.');
  } finally {
    // Re-enable submit button
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create Voice';
  }
}

// Show the edit voice form
function showEditForm(voice) {
  editingVoiceId = voice.id;

  const formContainer = document.getElementById('voice-form-container');
  formContainer.innerHTML = `
    <div class="voice-form">
      <h2>Edit Voice</h2>
      <div class="form-group">
        <label for="voice-name">Voice Name *</label>
        <input type="text" id="voice-name" placeholder="e.g., Grandma's Voice" value="${escapeHtml(voice.name)}" />
      </div>
      <div class="form-group">
        <label for="voice-system-prompt">System Prompt *</label>
        <textarea id="voice-system-prompt" placeholder="Describe the personality and speaking style...">${escapeHtml(voice.systemPrompt)}</textarea>
      </div>
      <div class="form-group hidden" id="file-group">
        <label>Sample Audio Files *</label>
        <div id="file-drop-zone" class="file-drop">
          <div class="file-drop-content">
            <svg class="upload-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="17 8 12 3 7 8"></polyline>
              <line x1="12" y1="3" x2="12" y2="15"></line>
            </svg>
            <p class="file-drop-text">Click to upload or drag & drop</p>
            <p class="file-drop-hint">1–3 samples recommended • MP3/WAV/M4A • Max 10MB each</p>
          </div>
          <input type="file" id="voice-file-input" accept=".mp3,.wav,.m4a,audio/*" multiple hidden />
        </div>
        <div id="selected-files-list" class="selected-files"></div>
      </div>
      <div id="form-error" class="form-error hidden"></div>
      <div class="form-actions">
        <button id="voice-cancel-btn" class="btn btn-outline">Cancel</button>
        <button id="voice-submit-btn" class="btn btn-primary">Save Changes</button>
      </div>
    </div>
  `;

  formContainer.classList.remove('hidden');

  // Attach event listeners
  document.getElementById('voice-cancel-btn').addEventListener('click', () => {
    formContainer.classList.add('hidden');
  });

  document.getElementById('voice-submit-btn').addEventListener('click', handleEditSubmit);
}

// Handle edit voice submission
async function handleEditSubmit() {
  const name = document.getElementById('voice-name').value.trim();
  const systemPrompt = document.getElementById('voice-system-prompt').value.trim();

  // Validate inputs
  if (!name) {
    showError('Voice name is required.');
    return;
  }

  if (!systemPrompt) {
    showError('System prompt is required.');
    return;
  }

  // Hide error if there was one
  hideError();

  try {
    // Send request to API
    const response = await fetch(`/api/voices/${editingVoiceId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name, systemPrompt })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to update voice');
    }

    const updatedVoice = await response.json();

    // Update the voice in the array
    const index = voices.findIndex(v => v.id === editingVoiceId);
    if (index !== -1) {
      voices[index] = updatedVoice;
    }

    // Reset form and update UI
    document.getElementById('voice-form-container').classList.add('hidden');
    renderVoiceList();
  } catch (error) {
    console.error('Error updating voice:', error);
    showError(error.message || 'Failed to update voice. Please try again.');
  }
}

// Render the voice list
function renderVoiceList() {
  const voiceList = document.getElementById('voice-list');

  if (voices.length === 0) {
    voiceList.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎤</div>
        <h3>No Voices Yet</h3>
        <p>You haven't created any voices. Click "Add Voice" to get started.</p>
      </div>
    `;
    return;
  }

  voiceList.innerHTML = '';

  voices.forEach(voice => {
    const voiceCard = document.createElement('div');
    voiceCard.className = 'voice-card';
    voiceCard.dataset.id = voice.id;

    // Truncate system prompt if too long
    const truncatedPrompt = voice.systemPrompt.length > 100
      ? voice.systemPrompt.substring(0, 100) + '…'
      : voice.systemPrompt;

    voiceCard.innerHTML = `
      <div class="voice-card-info">
        <h3>${escapeHtml(voice.name)}</h3>
        <p>${escapeHtml(truncatedPrompt)}</p>
        <div class="voice-card-meta">
          <span class="voice-created">${new Date(voice.createdAt).toLocaleDateString()}</span>
        </div>
      </div>
      <div class="voice-card-actions">
        <button class="btn-edit" data-id="${voice.id}">Edit</button>
        <button class="btn-delete" data-id="${voice.id}">Delete</button>
      </div>
    `;

    voiceList.appendChild(voiceCard);

    // Add event listeners for edit and delete buttons
    voiceCard.querySelector('.btn-edit').addEventListener('click', () => {
      showEditForm(voice);
    });

    voiceCard.querySelector('.btn-delete').addEventListener('click', () => {
      showDeleteConfirm(voiceCard, voice);
    });
  });
}

// Show delete confirmation
function showDeleteConfirm(card, voice) {
  // Check if confirmation already exists
  if (card.querySelector('.delete-confirm')) return;

  const confirmDiv = document.createElement('div');
  confirmDiv.className = 'delete-confirm';
  confirmDiv.innerHTML = `
    <p>Delete this voice? This cannot be undone.</p>
    <div class="delete-confirm-buttons">
      <button class="btn-cancel-delete">Cancel</button>
      <button class="btn-confirm-delete">Confirm</button>
    </div>
  `;

  card.querySelector('.voice-card-actions').appendChild(confirmDiv);

  // Add event listeners
  confirmDiv.querySelector('.btn-cancel-delete').addEventListener('click', () => {
    confirmDiv.remove();
  });

  confirmDiv.querySelector('.btn-confirm-delete').addEventListener('click', async () => {
    try {
      const response = await fetch(`/api/voices/${voice.id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete voice');
      }

      // Remove from UI
      card.remove();

      // Remove from array
      voices = voices.filter(v => v.id !== voice.id);

      // Show empty state if no voices left
      if (voices.length === 0) {
        renderVoiceList();
      }
    } catch (error) {
      console.error('Error deleting voice:', error);
      alert('Failed to delete voice. Please try again.');
      confirmDiv.remove();
    }
  });
}

// Expose the init function to the global scope
window.voicesPage = { init };