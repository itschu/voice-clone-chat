# VoiceRA MVP

AI-powered voice cloning web application for preserving loved ones' voices.

## Features

- Upload 1-3 voice samples (MP3/WAV/M4A, max 10MB each)
- Enter text (max 2,500 characters)
- Generate voice message using ElevenLabs Instant Voice Cloning
- Download generated audio
- Automatic cleanup after download

## Tech Stack

- **Backend**: Node.js, Express
- **Storage**: Local filesystem (files stored on server)
- **Voice Cloning**: ElevenLabs API
- **Frontend**: Vanilla JavaScript, HTML, CSS

## Setup Instructions

### 1. Clone and Install

```bash
cd voicera
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Server
PORT=3000
NODE_ENV=development

# Local Storage (optional - defaults to ./uploads)
# STORAGE_DIR=./uploads

# ElevenLabs API
ELEVENLABS_API_KEY=your-api-key

# Optional: Scheduled Cleanup
CLEANUP_ENABLED=false
CLEANUP_INTERVAL_HOURS=24
CLEANUP_AGE_HOURS=24
```

### 3. ElevenLabs Setup

1. Sign up at [elevenlabs.io](https://elevenlabs.io)
2. Get your API key from the dashboard
3. Add it to your `.env` file

### 4. Run the Application

```bash
npm start
```

Open http://localhost:3000 in your browser.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/health` | GET | Health check |
| `/api/upload` | POST | Upload voice samples |
| `/api/generate` | POST | Generate voice from text |
| `/api/download/:sessionId/:filename` | GET | Download generated audio |

## Project Structure

```
voicera/
├── backend/
│   ├── server.js              # Express server entry
│   ├── routes/
│   │   ├── upload.js          # Upload endpoint
│   │   ├── generate.js        # Generation endpoint
│   │   └── download.js        # Download endpoint
│   ├── services/
│   │   ├── storage.js         # Local filesystem storage
│   │   └── elevenlabs.js      # ElevenLabs API
│   ├── middleware/
│   │   └── validation.js      # Input validation
│   └── jobs/
│       └── cleanup.js         # Scheduled cleanup
├── frontend/
│   ├── index.html             # Main HTML
│   ├── styles.css             # Styles
│   └── app.js                 # Frontend logic
├── uploads/                   # File storage (created automatically)
├── .env.example               # Environment template
└── package.json
```

## Data Flow

1. User uploads 1-3 voice samples → stored locally in `uploads/` directory
2. User enters text → validated (max 2,500 chars)
3. Generate button clicked:
   - Fetch samples from local storage
   - Create voice clone via ElevenLabs IVC
   - Generate speech via ElevenLabs TTS
   - Store generated audio locally
4. User downloads audio → files deleted from local storage

## Notes

- MVP has no authentication (anyone with URL can use)
- Files are stored on the server's local filesystem in the `uploads/` directory
- Files are deleted immediately after download
- Optional scheduled cleanup removes abandoned files after 24 hours
- ElevenLabs free tier: 10,000 characters/month
