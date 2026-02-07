/**
 * VoiceRA MVP - Frontend Application
 * Vanilla JavaScript SPA with all UI interactions
 */

// ============================================
// State Management
// ============================================
const state = {
  sessionId: null,
  uploadedFiles: [], // Array of {fileId, filename, size, fileObject}
  text: '',
  generatedAudioUrl: null,
  isUploading: false,
  isGenerating: false,
  lastGenerationParams: null // For retry functionality
};

// ============================================
// DOM Elements
// ============================================
const elements = {
  // Upload
  uploadArea: document.getElementById('upload-area'),
  fileInput: document.getElementById('file-input'),
  sampleList: document.getElementById('sample-list'),
  
  // Text
  textInput: document.getElementById('text-input'),
  charCounter: document.getElementById('char-counter'),
  
  // Buttons
  generateBtn: document.getElementById('generate-btn'),
  downloadBtn: document.getElementById('download-btn'),
  startOverBtn: document.getElementById('start-over-btn'),
  
  // States
  uploadSection: document.getElementById('upload-section'),
  textSection: document.getElementById('text-section'),
  generateSection: document.getElementById('generate-section'),
  generatingState: document.getElementById('generating-state'),
  successState: document.getElementById('success-state'),
  generatedAudio: document.getElementById('generated-audio'),
  
  // Error Modal
  errorModal: document.getElementById('error-modal'),
  errorMessage: document.getElementById('error-message'),
  errorHint: document.getElementById('error-hint'),
  closeModalBtn: document.getElementById('close-modal'),
  retryBtn: document.getElementById('retry-btn')
};

// ============================================
// Constants
// ============================================
const MAX_FILES = 3;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_TEXT_LENGTH = 2500;
const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/m4a', 'audio/mp4'];
const ALLOWED_EXTENSIONS = ['.mp3', '.wav', '.m4a'];

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  updateUI();
});

function initializeEventListeners() {
  // Upload area
  elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
  elements.fileInput.addEventListener('change', handleFileSelect);
  
  // Drag and drop
  elements.uploadArea.addEventListener('dragover', handleDragOver);
  elements.uploadArea.addEventListener('dragleave', handleDragLeave);
  elements.uploadArea.addEventListener('drop', handleDrop);
  
  // Text input
  elements.textInput.addEventListener('input', handleTextInput);
  
  // Buttons
  elements.generateBtn.addEventListener('click', handleGenerate);
  elements.downloadBtn.addEventListener('click', handleDownload);
  elements.startOverBtn.addEventListener('click', handleStartOver);
  elements.closeModalBtn.addEventListener('click', hideErrorModal);
  elements.retryBtn.addEventListener('click', handleRetry);
  
  // Close modal on overlay click
  elements.errorModal.addEventListener('click', (e) => {
    if (e.target === elements.errorModal) hideErrorModal();
  });
}

// ============================================
// File Upload Handlers
// ============================================
function handleDragOver(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.uploadArea.classList.add('dragover');
}

function handleDragLeave(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.uploadArea.classList.remove('dragover');
}

function handleDrop(e) {
  e.preventDefault();
  e.stopPropagation();
  elements.uploadArea.classList.remove('dragover');
  
  const files = Array.from(e.dataTransfer.files);
  processFiles(files);
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files);
  processFiles(files);
  // Reset input so same files can be selected again
  e.target.value = '';
}

function processFiles(files) {
  // Check total file count
  const totalFiles = state.uploadedFiles.length + files.length;
  if (totalFiles > MAX_FILES) {
    showError(
      'Too Many Files',
      `You can upload up to ${MAX_FILES} samples.`,
      'Remove some samples first, then try again.'
    );
    return;
  }
  
  // Validate each file
  for (const file of files) {
    const error = validateFile(file);
    if (error) {
      showError('Invalid File', error);
      return;
    }
  }
  
  // Add files to state
  files.forEach(file => {
    const fileId = `sample_${state.uploadedFiles.length + 1}${getFileExtension(file.name)}`;
    state.uploadedFiles.push({
      fileId,
      filename: file.name,
      size: file.size,
      fileObject: file
    });
  });
  
  renderSampleList();
  updateUI();
}

function validateFile(file) {
  // Check size
  if (file.size > MAX_FILE_SIZE) {
    return `File "${file.name}" must be under 10MB.`;
  }
  
  // Check format
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTENSIONS.includes(ext)) {
    return `File "${file.name}" is not a supported format. Upload MP3, WAV, or M4A.`;
  }
  
  return null;
}

function getFileExtension(filename) {
  const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
  return ['.mp3', '.wav', '.m4a'].includes(ext) ? ext : '.mp3';
}

function removeSample(index) {
  state.uploadedFiles.splice(index, 1);
  
  // Reassign fileIds
  state.uploadedFiles.forEach((file, i) => {
    file.fileId = `sample_${i + 1}${getFileExtension(file.filename)}`;
  });
  
  renderSampleList();
  updateUI();
}

// ============================================
// Text Input Handler
// ============================================
function handleTextInput(e) {
  state.text = e.target.value;
  updateCharCounter();
  updateUI();
}

function updateCharCounter() {
  const count = state.text.length;
  elements.charCounter.textContent = `${count} / ${MAX_TEXT_LENGTH}`;
  
  if (count > MAX_TEXT_LENGTH) {
    elements.charCounter.classList.add('over-limit');
    elements.textInput.classList.add('error');
  } else {
    elements.charCounter.classList.remove('over-limit');
    elements.textInput.classList.remove('error');
  }
}

// ============================================
// UI Rendering
// ============================================
function renderSampleList() {
  elements.sampleList.innerHTML = '';
  
  state.uploadedFiles.forEach((file, index) => {
    const sampleCard = document.createElement('div');
    sampleCard.className = 'sample-card';
    
    const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
    
    // Create object URL for preview
    const objectUrl = URL.createObjectURL(file.fileObject);
    
    sampleCard.innerHTML = `
      <div class="sample-header">
        <div class="sample-info">
          <div class="sample-name">${escapeHtml(file.filename)}</div>
          <div class="sample-size">${sizeMB} MB</div>
        </div>
        <button class="btn btn-danger" data-index="${index}">Remove</button>
      </div>
      <audio class="sample-audio" controls src="${objectUrl}"></audio>
    `;
    
    // Add remove handler
    const removeBtn = sampleCard.querySelector('.btn-danger');
    removeBtn.addEventListener('click', () => removeSample(index));
    
    elements.sampleList.appendChild(sampleCard);
  });
}

function updateUI() {
  const hasFiles = state.uploadedFiles.length > 0;
  const hasText = state.text.length > 0 && state.text.length <= MAX_TEXT_LENGTH;
  
  // Enable/disable generate button
  elements.generateBtn.disabled = !hasFiles || !hasText || state.isGenerating;
  
  // Disable upload area during generation
  if (state.isGenerating) {
    elements.uploadArea.classList.add('disabled');
    elements.textInput.disabled = true;
  } else {
    elements.uploadArea.classList.remove('disabled');
    elements.textInput.disabled = false;
  }
}

function showGeneratingState() {
  elements.uploadSection.classList.add('disabled');
  elements.textSection.classList.add('disabled');
  elements.generateSection.classList.add('hidden');
  elements.generatingState.classList.remove('hidden');
}

function hideGeneratingState() {
  elements.uploadSection.classList.remove('disabled');
  elements.textSection.classList.remove('disabled');
  elements.generateSection.classList.remove('hidden');
  elements.generatingState.classList.add('hidden');
}

function showSuccessState(audioUrl) {
  state.generatedAudioUrl = audioUrl;
  elements.generatedAudio.src = audioUrl;
  
  elements.uploadSection.classList.add('hidden');
  elements.textSection.classList.add('hidden');
  elements.generateSection.classList.add('hidden');
  elements.generatingState.classList.add('hidden');
  elements.successState.classList.remove('hidden');
}

function hideSuccessState() {
  elements.uploadSection.classList.remove('hidden');
  elements.textSection.classList.remove('hidden');
  elements.generateSection.classList.remove('hidden');
  elements.successState.classList.add('hidden');
  elements.generatedAudio.src = '';
}

// ============================================
// API Calls
// ============================================
async function handleGenerate() {
  if (state.uploadedFiles.length === 0) {
    showError('No Samples', 'Please upload at least 1 voice sample.');
    return;
  }
  
  if (!state.text || state.text.trim().length === 0) {
    showError('No Text', 'Please enter text to generate speech.');
    return;
  }
  
  if (state.text.length > MAX_TEXT_LENGTH) {
    showError('Text Too Long', `Text must be ${MAX_TEXT_LENGTH} characters or fewer.`);
    return;
  }
  
  await performGeneration();
}

async function performGeneration() {
  state.isGenerating = true;
  showGeneratingState();
  updateUI();
  
  try {
    // Step 1: Upload files if not already uploaded
    if (!state.sessionId) {
      const uploadResult = await uploadFiles();
      state.sessionId = uploadResult.sessionId;
    }
    
    // Save params for retry
    state.lastGenerationParams = {
      sessionId: state.sessionId,
      fileIds: state.uploadedFiles.map(f => f.fileId),
      text: state.text
    };
    
    // Step 2: Generate voice
    const generateResult = await generateVoice(state.lastGenerationParams);
    
    // Step 3: Show success
    state.isGenerating = false;
    showSuccessState(generateResult.audioUrl);
    
  } catch (error) {
    console.error('Generation failed:', error);
    state.isGenerating = false;
    hideGeneratingState();
    updateUI();
    
    showError(
      'Generation Error',
      error.message || 'Unable to generate audio right now.',
      'Try Again retries immediately using the same samples + text. Close returns to the form so you can edit.'
    );
  }
}

async function uploadFiles() {
  const formData = new FormData();
  
  state.uploadedFiles.forEach(file => {
    formData.append('files', file.fileObject);
  });
  
  console.log('Uploading files...');
  
  const response = await fetch('/api/upload', {
    method: 'POST',
    body: formData
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Upload failed');
  }
  
  const result = await response.json();
  console.log('Upload complete:', result);
  
  // Update fileIds from server response
  result.files.forEach((file, index) => {
    if (state.uploadedFiles[index]) {
      state.uploadedFiles[index].fileId = file.fileId;
    }
  });
  
  return result;
}

async function generateVoice(params) {
  console.log('Generating voice...', params);
  
  const response = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.message || 'Generation failed');
  }
  
  const result = await response.json();
  console.log('Generation complete:', result);
  return result;
}

// ============================================
// Download & Start Over
// ============================================
async function handleDownload() {
  if (!state.generatedAudioUrl) return;
  
  try {
    // Create a temporary link to trigger download
    const link = document.createElement('a');
    link.href = state.generatedAudioUrl;
    link.download = `voicera_${Date.now()}.mp3`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    console.log('Download initiated');
    
    // Note: Server will delete files after download completes
    // We don't need to do anything else here
    
  } catch (error) {
    console.error('Download failed:', error);
    showError('Download Failed', 'Could not download the audio file. Please try again.');
  }
}

function handleStartOver() {
  // Reset state
  state.sessionId = null;
  state.uploadedFiles = [];
  state.text = '';
  state.generatedAudioUrl = null;
  state.isGenerating = false;
  state.lastGenerationParams = null;
  
  // Reset UI
  elements.fileInput.value = '';
  elements.textInput.value = '';
  elements.sampleList.innerHTML = '';
  elements.generatedAudio.src = '';
  
  updateCharCounter();
  hideSuccessState();
  hideGeneratingState();
  updateUI();
  
  console.log('Started over');
}

// ============================================
// Error Handling
// ============================================
function showError(title, message, hint = null) {
  elements.errorMessage.innerHTML = `<strong>${escapeHtml(title)}</strong><br>${escapeHtml(message)}`;
  elements.errorHint.textContent = hint || 'Try Again retries immediately using the same samples + text. Close returns to the form so you can edit.';
  elements.errorModal.classList.remove('hidden');
}

function hideErrorModal() {
  elements.errorModal.classList.add('hidden');
}

async function handleRetry() {
  hideErrorModal();
  
  // If we have saved params, retry generation
  if (state.lastGenerationParams) {
    state.isGenerating = true;
    showGeneratingState();
    updateUI();
    
    try {
      const generateResult = await generateVoice(state.lastGenerationParams);
      state.isGenerating = false;
      showSuccessState(generateResult.audioUrl);
    } catch (error) {
      console.error('Retry failed:', error);
      state.isGenerating = false;
      hideGeneratingState();
      updateUI();
      
      showError(
        'Generation Error',
        error.message || 'Still unable to generate audio.',
        'Try Again retries immediately using the same samples + text. Close returns to the form so you can edit.'
      );
    }
  } else {
    // No saved params, just try again from scratch
    await performGeneration();
  }
}

// ============================================
// Utilities
// ============================================
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
