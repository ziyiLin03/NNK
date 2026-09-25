import WaveSurfer from 'https://unpkg.com/wavesurfer.js@7.8.6/dist/wavesurfer.esm.js'
import RecordPlugin from 'https://unpkg.com/wavesurfer.js@7.8.6/dist/plugins/record.esm.js'

let wavesurfer, record

const ICON_MIC   = '<i class="fa-solid fa-microphone"></i>'
const ICON_STOP  = '<i class="fa-solid fa-stop"></i>'
const ICON_PAUSE = '<i class="fa-solid fa-pause"></i>'
const ICON_PLAY  = '<i class="fa-solid fa-play"></i>'

const MAX_RECORDING_MS    = 10 * 60 * 1000
const MAX_RECORDING_LABEL = '10 minutes'

const draft     = JSON.parse(localStorage.getItem('reporteBorrador')) || {};
const esEdicion = localStorage.getItem('modoEdicion') === 'true';
const BASE_URL  = `${API_BASE_URL}`;
const getToken  = () => localStorage.getItem('access_token');

const progress         = document.querySelector('#progress')
const pauseButton      = document.querySelector('#pause')
const recButton        = document.querySelector('#record')
const micSelect        = document.querySelector('#mic-select')
const transcriptionBox = document.querySelector('#transcription-text')
const saveButton       = document.querySelector('#save-all')
const reviewSection    = document.querySelector('#review-section');
const textEditor       = document.querySelector('#final-text-editor');
const btnRedo          = document.querySelector('#btn-redo');
const btnReturn        = document.getElementById('btnReturn');
const btnSaveNext      = document.querySelector('#btn-save-next');
const btnSaveFinish    = document.querySelector('#btn-save-finish');

const MAX_AUDIOS = 5;
let audioBlob            = null;
let temporaryAudioUrl    = '';
let currentTranslation   = '';
let uploadedTranscription = '';
let currentTranscription = '';

let savedAudios = Array.isArray(draft.audios) ? [...draft.audios] : [];

// ── Detect best supported MIME type for this device ───────────────────────────
// iOS Safari only supports audio/mp4. Chrome/Android support audio/webm.
function getSupportedMimeType() {
    const types = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/ogg;codecs=opus',
        'audio/mp4',
    ];
    for (const type of types) {
        if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';  // Let browser pick
}

const SUPPORTED_MIME = getSupportedMimeType();
console.log('🎙️ Recording MIME type:', SUPPORTED_MIME || '(browser default)');

// ── Audio counter UI ──────────────────────────────────────────────────────────
function updateAudioCounter() {
    let counter = document.getElementById('audio-counter');
    if (!counter) {
        counter = document.createElement('p');
        counter.id = 'audio-counter';
        counter.style.cssText = 'font-size:0.85rem;color:var(--text-muted,#888);margin:8px 0 0;';
        recButton.parentNode.insertBefore(counter, recButton.nextSibling);
    }
    counter.textContent = `${savedAudios.length} / ${MAX_AUDIOS} audio clips saved`;

    const atLimit = savedAudios.length >= MAX_AUDIOS;
    recButton.disabled = atLimit;
    if (atLimit) {
        transcriptionBox.innerHTML = `<span style="color:#c1121f;">Maximum of ${MAX_AUDIOS} audio clips reached. Delete one to record more.</span>`;
    }
}

// ── Render saved audios list ──────────────────────────────────────────────────
function renderSavedAudios() {
    let listEl = document.getElementById('saved-audios-list');
    if (!listEl) {
        listEl = document.createElement('div');
        listEl.id = 'saved-audios-list';
        listEl.style.cssText = 'margin-top:16px;';
        saveButton.parentNode.appendChild(listEl);
    }

    if (savedAudios.length === 0) {
        listEl.innerHTML = '';
        return;
    }

    listEl.innerHTML = `<h4 style="color:var(--text-dark);margin-bottom:8px;">Saved audio clips (${savedAudios.length}/${MAX_AUDIOS})</h4>`;
    savedAudios.forEach((audio, idx) => {
        const item = document.createElement('div');
        item.style.cssText = `
            display:flex; align-items:center; gap:10px;
            background:var(--content-bg,#f5f5f5); border-radius:8px;
            padding:10px 12px; margin-bottom:8px;
            border:1px solid var(--divider-color,#e9edf7);
        `;
        item.innerHTML = `
            <div style="flex:1;min-width:0;">
                <p style="margin:0;font-weight:600;font-size:0.85rem;color:var(--text-dark);">
                    ${audio.title || 'Audio ' + (idx + 1)}
                </p>
                <audio controls src="${audio.url}" style="width:100%;margin-top:4px;"></audio>
                ${audio.transcription
                    ? `<p style="margin:4px 0 0;font-size:0.78rem;color:var(--text-muted,#888);font-style:italic;">"${audio.transcription.slice(0, 80)}..."</p>`
                    : ''}
            </div>
            <button data-idx="${idx}" class="delete-audio-btn" title="Delete"
                style="background:none;border:none;color:#c1121f;font-size:1.1rem;cursor:pointer;flex-shrink:0;">
                <i class="fa-solid fa-trash"></i>
            </button>
        `;
        listEl.appendChild(item);
    });

    listEl.querySelectorAll('.delete-audio-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const idx   = parseInt(btn.dataset.idx);
            const audio = savedAudios[idx];
            if (!audio) return;

            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            btn.disabled  = true;

            try {
                const token = getToken();
                await fetch(`${BASE_URL}/api/delete-audio/`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ url: audio.url })
                });
            } catch (e) {
                console.warn('Could not delete from Cloudinary:', e);
            }

            savedAudios.splice(idx, 1);
            persistAudios();
            renderSavedAudios();
            updateAudioCounter();
        });
    });
}

function persistAudios() {
    let d = JSON.parse(localStorage.getItem('reporteBorrador') || '{}');
    d.audios = savedAudios;
    localStorage.setItem('reporteBorrador', JSON.stringify(d));
}

renderSavedAudios();
updateAudioCounter();

// ── Reset UI after saving a clip ──────────────────────────────────────────────
function resetRecordingState(message = 'Audio saved! You can record another clip or go back.') {
    temporaryAudioUrl    = '';
    currentTranslation   = '';
    uploadedTranscription = '';
    currentTranscription = '';
    audioBlob            = null;

    if (reviewSection) reviewSection.style.display = 'none';

    recButton.style.display   = 'inline-block';
    pauseButton.style.display = 'inline-block';
    saveButton.style.display  = 'inline-block';

    recButton.innerHTML  = ICON_MIC;
    recButton.disabled   = savedAudios.length >= MAX_AUDIOS;
    saveButton.disabled  = true;
    saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk" style="color:white;"></i> Save Audio and Transcription';

    transcriptionBox.innerHTML   = `<span>${message}</span>`;
    transcriptionBox.style.color = 'inherit';

    if (btnSaveNext)   { btnSaveNext.disabled = false;   btnSaveNext.innerHTML = '<i class="fa-solid fa-check"></i> Save'; }
    if (btnSaveFinish) { btnSaveFinish.disabled = false; btnSaveFinish.innerHTML = '<i class="fa-solid fa-flag-checkered"></i> Finish'; }
    if (btnRedo)       { btnRedo.disabled = false; }

    if (wavesurfer) {
        wavesurfer.empty();
        progress.textContent = '00:00';
    }

    renderSavedAudios();
    updateAudioCounter();
}

// ── WaveSurfer init ───────────────────────────────────────────────────────────
const createWaveSurfer = () => {
    wavesurfer = WaveSurfer.create({
        container: '#mic',
        waveColor: '#4F4A85',
        progressColor: '#4b0339',
        barWidth: 1,
        cursorWidth: 0,
        height: 50,
    });

    // Pass the supported MIME type so iOS uses mp4 instead of webm
    const recordOptions = {
        renderRecordedAudio: false,
        scrollingWaveform: true,
        scrollingWaveformDuration: 8,
        audioBitsPerSecond: 16000,
    };
    if (SUPPORTED_MIME) recordOptions.mimeType = SUPPORTED_MIME;

    record = wavesurfer.registerPlugin(RecordPlugin.create(recordOptions));

    record.on('record-progress', (time) => {
        const formattedTime = [
            Math.floor((time % 3600000) / 60000),
            Math.floor((time % 60000)   / 1000),
        ].map(v => (v < 10 ? '0' + v : v)).join(':');

        progress.textContent = formattedTime;

        if (time >= 8 * 60 * 1000 && time < 8 * 60 * 1000 + 1000) {
            transcriptionBox.innerHTML = `
                <span style="color: orange;">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    Warning: 2 minutes remaining before the recording limit (${MAX_RECORDING_LABEL}).
                </span>`;
        }

        if (time >= MAX_RECORDING_MS) {
            record.stopRecording();
            recButton.innerHTML  = ICON_MIC;
            pauseButton.disabled = true;
            transcriptionBox.innerHTML = `
                <span style="color: #c1121f;">
                    <i class="fa-solid fa-circle-stop"></i>
                    Recording stopped automatically after ${MAX_RECORDING_LABEL}.
                </span>`;
        }
    });

    record.on('record-end', (blob) => {
        audioBlob = blob;
        saveButton.disabled = false;
        if (!transcriptionBox.innerHTML.includes('stopped automatically')) {
            transcriptionBox.innerHTML = '<span>Audio recorded. Ready for AI analysis.</span>';
        }
    });
};

// ── Mic selector ──────────────────────────────────────────────────────────────
RecordPlugin.getAvailableAudioDevices().then((devices) => {
    devices.forEach((device) => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text  = device.label || `Microphone ${micSelect.length}`;
        micSelect.appendChild(option);
    });
});

// ── Record button ─────────────────────────────────────────────────────────────
recButton.onclick = () => {
    if (record.isRecording() || record.isPaused()) {
        record.stopRecording();
        recButton.innerHTML  = ICON_MIC;
        pauseButton.disabled = true;
        return;
    }

    recButton.disabled  = true;
    saveButton.disabled = true;
    audioBlob = null;

    transcriptionBox.innerHTML = `<span>Recording... Speak naturally. Max ${MAX_RECORDING_LABEL}.</span>`;
    transcriptionBox.classList.remove('placeholder');

    const deviceId = micSelect.value;
    record.startRecording({ deviceId }).then(() => {
        recButton.innerHTML  = ICON_STOP;
        recButton.disabled   = false;
        pauseButton.disabled = false;
        pauseButton.innerHTML = ICON_PAUSE;
    });
};

// ── Pause button ──────────────────────────────────────────────────────────────
pauseButton.onclick = () => {
    if (record.isPaused()) {
        record.resumeRecording();
        pauseButton.innerHTML = ICON_PAUSE;
        return;
    }
    record.pauseRecording();
    pauseButton.innerHTML = ICON_PLAY;
};

// ── Upload & analyse button ───────────────────────────────────────────────────
saveButton.onclick = async () => {
    if (!audioBlob) return;

    saveButton.disabled  = true;
    saveButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Analyzing...';
    transcriptionBox.innerHTML = '<span>AI is processing your audio. This might take a few seconds...</span>';

    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = async () => {
        const base64Audio = reader.result;

        // FIX: iOS Safari returns audio/mp4 — extract extension safely
        // audioBlob.type can be e.g. "audio/webm;codecs=opus" or "audio/mp4"
        const mimeType = audioBlob.type.split(';')[0] || 'audio/webm';
        const extension = (mimeType.includes('mp4') || mimeType.includes('aac') || mimeType.includes('m4a'))
            ? 'mp4'
            : (mimeType.split('/')[1] || 'webm');

        console.log('📤 Uploading audio — mimeType:', mimeType, '| extension:', extension);

        const token = getToken();

        try {
            const response = await fetch(`${BASE_URL}/api/upload-audio/`, {
                method: 'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ audio: base64Audio, extension })
            });

            const data = await response.json();

            if (!response.ok) {
                if (response.status === 413 || data?.error?.includes('too large') || data?.error?.includes('413')) {
                    transcriptionBox.innerHTML = `
                        <span style="color: #c1121f;">
                            <i class="fa-solid fa-circle-xmark"></i>
                            The audio file is too large. Please record a shorter clip (max ${MAX_RECORDING_LABEL}).
                        </span>`;
                } else {
                    throw new Error(data?.error || 'Rejected by server');
                }
                saveButton.disabled  = false;
                saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Retry Analysis';
                return;
            }

            temporaryAudioUrl  = data.url;
            currentTranslation = data.translation || '';
            uploadedTranscription = data.transcription || '';

            if (reviewSection && textEditor) {
                transcriptionBox.textContent = data.warning || data.translation || 'Audio uploaded. You can save it now.';
                transcriptionBox.style.color = 'var(--text-dark)';
                textEditor.value = uploadedTranscription;

                recButton.style.display     = 'none';
                pauseButton.style.display   = 'none';
                saveButton.style.display    = 'none';
                reviewSection.style.display = 'block';
            }

        } catch (error) {
            console.error('Error uploading audio:', error);
            transcriptionBox.textContent = error.message || 'Could not upload the audio. Please try again.';
            saveButton.disabled  = false;
            saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Retry Analysis';
        }
    };
};

// ── Save transcription (shared by Save + Finish buttons) ──────────────────────
async function saveTranscription(action) {
    const finalTranscription = textEditor.value.trim();

    if (!temporaryAudioUrl) {
        alert('Upload a recording before saving.');
        return;
    }

    const activeBtn = action === 'next' ? btnSaveNext : btnSaveFinish;
    const originalHtml = activeBtn.innerHTML;

    if (btnSaveNext)   btnSaveNext.disabled   = true;
    if (btnSaveFinish) btnSaveFinish.disabled = true;
    if (btnRedo)       btnRedo.disabled       = true;

    activeBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

    try {
        const token = getToken();
        let translation = currentTranslation || '';
        if (finalTranscription && finalTranscription !== uploadedTranscription) {
            try {
                const response = await fetch(`${BASE_URL}/api/translate-text/`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ text: finalTranscription }),
                });
                if (!response.ok) throw new Error('Translation failed on the server');
                const data = await response.json();
                translation = data.translation || '';
            } catch (error) {
                console.warn('Saving audio without an updated translation:', error);
                translation = '';
                alert('Translation is unavailable. Your audio and transcription will still be saved.');
            }
        }

        savedAudios.push({
            url:           temporaryAudioUrl,
            transcription: finalTranscription,
            translation,
            title:         `Audio ${savedAudios.length + 1}`,
            timestamp:     new Date().toISOString()
        });
        persistAudios();

        if (action === 'finish') {
            window.location.href = './new-report.html';
        } else {
            if (savedAudios.length < MAX_AUDIOS) {
                resetRecordingState('Audio saved! You can record another clip.');
            } else {
                window.location.href = './new-report.html';
            }
        }

    } catch (error) {
        console.error('Error saving audio draft:', error);
        alert('Could not save the audio draft on this device. Please free some storage and try again.');
        activeBtn.innerHTML = originalHtml;
        if (btnSaveNext)   btnSaveNext.disabled   = false;
        if (btnSaveFinish) btnSaveFinish.disabled = false;
        if (btnRedo)       btnRedo.disabled       = false;
    }
}

if (btnSaveNext)   btnSaveNext.onclick   = () => saveTranscription('next');
if (btnSaveFinish) btnSaveFinish.onclick = () => saveTranscription('finish');

// ── Redo button ───────────────────────────────────────────────────────────────
if (btnRedo) {
    btnRedo.onclick = async () => {
        if (temporaryAudioUrl) {
            try {
                const token = getToken();
                await fetch(`${BASE_URL}/api/delete-audio/`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                    body: JSON.stringify({ url: temporaryAudioUrl })
                });
            } catch (err) {
                console.error('Error deleting audio:', err);
            }
        }
        textEditor.value = '';
        resetRecordingState('Recording discarded. You can record again.');
    };
}

// ── Return button ─────────────────────────────────────────────────────────────
if (btnReturn) {
    btnReturn.addEventListener('click', async (e) => {
        e.preventDefault();

        if (temporaryAudioUrl) {
            const token = getToken();
            if (token) {
                try {
                    await fetch(`${BASE_URL}/api/delete-audio/`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                        body: JSON.stringify({ url: temporaryAudioUrl })
                    });
                } catch (err) { console.error('Error deleting from Cloudinary', err); }
            }
        }

        window.location.href = './audio-list.html';
    });
}

// ── Boot ──────────────────────────────────────────────────────────────────────
createWaveSurfer();
