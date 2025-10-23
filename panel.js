// panel.js
// 1) Set your live Wix site base (no trailing slash), e.g. "https://example.wixsite.com/mysite"
const SITE_BASE = "https://devcentertesting.wixsite.com/dev-sitex-1634411368";

// 2) Endpoints (from your Velo HTTP functions)
const GEN_URL = `${SITE_BASE}/_functions/generateUploadUrl`;
const COMPLETE_URL = `${SITE_BASE}/_functions/completeUpload`;

const fileInput = document.getElementById('fileInput');
const btnUpload = document.getElementById('btnUpload');
const logEl = document.getElementById('log');
const progressWrap = document.getElementById('progressWrap');
const progressBar = document.getElementById('progressBar');

function log(...args) {
  const msg = args.map(a => (typeof a === 'string' ? a : JSON.stringify(a, null, 2))).join(' ');
  // console log + UI log
  console.log('[panel]', ...args);
  logEl.textContent += msg + '\n';
  logEl.scrollTop = logEl.scrollHeight;
}

function assert(cond, message) {
  if (!cond) {
    log('ERROR:', message);
    throw new Error(message);
  }
}

function setProgress(pct) {
  progressWrap.hidden = false;
  const clamped = Math.max(0, Math.min(100, pct|0));
  progressBar.style.width = clamped + '%';
}

function resetProgress() {
  progressWrap.hidden = true;
  progressBar.style.width = '0%';
}

async function generateUploadUrl(file) {
  log('→ generateUploadUrl', { fileName: file.name, mimeType: file.type || 'image/svg+xml' });
  const res = await fetch(GEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, mimeType: file.type || 'image/svg+xml' })
  }).catch(err => {
    log('NETWORK ERROR (generateUploadUrl):', err?.message || err);
    throw err;
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log('HTTP ERROR (generateUploadUrl):', res.status, text);
    throw new Error(`generateUploadUrl failed: ${res.status}`);
  }
  const json = await res.json();
  log('✓ generateUploadUrl OK', { hasUploadUrl: !!json.uploadUrl });
  return json; // { uploadUrl, fileDescriptor }
}

// Use XHR for progress events
function uploadWithProgress(uploadUrl, file) {
  log('→ uploadToUploadUrl', { sizeBytes: file.size });

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', uploadUrl);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        log('✓ uploadToUploadUrl OK', { status: xhr.status });
        resolve(true);
      } else {
        log('HTTP ERROR (upload):', xhr.status, xhr.responseText || '');
        reject(new Error(`upload failed: ${xhr.status}`));
      }
    };
    xhr.onerror = () => {
      log('NETWORK ERROR (upload):', xhr.status);
      reject(new Error('network error during upload'));
    };
    xhr.upload.onprogress = (evt) => {
      if (evt.lengthComputable) {
        const pct = (evt.loaded / evt.total) * 100;
        setProgress(pct);
      }
    };
    const fd = new FormData();
    fd.append('file', file, file.name); // field name 'file' is accepted by Wix upload URL
    xhr.send(fd);
  });
}

async function completeUpload(fileDescriptor) {
  log('→ completeUpload');
  const res = await fetch(COMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileDescriptor })
  }).catch(err => {
    log('NETWORK ERROR (completeUpload):', err?.message || err);
    throw err;
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    log('HTTP ERROR (completeUpload):', res.status, text);
    throw new Error(`completeUpload failed: ${res.status}`);
  }
  const json = await res.json();
  log('✓ completeUpload OK', { fileId: json?.file?._id, fileName: json?.file?.fileName });
  return json; // { file: {...} }
}

btnUpload.addEventListener('click', async () => {
  try {
    resetProgress();
    const files = Array.from(fileInput.files || []);
    assert(files.length > 0, 'Please choose at least one SVG file.');
    btnUpload.disabled = true;

    for (const file of files) {
      log('–––––––– New File ––––––––');
      log('Selected:', { name: file.name, size: file.size, type: file.type });

      assert(/\.svg$/i.test(file.name), 'Selected file is not an .svg.');
      if (!file.type) {
        // Some browsers omit SVG mime; set a default for clarity
        Object.defineProperty(file, 'type', { value: 'image/svg+xml' });
      }

      const { uploadUrl, fileDescriptor } = await generateUploadUrl(file);
      assert(uploadUrl && fileDescriptor, 'Invalid response from generateUploadUrl');

      await uploadWithProgress(uploadUrl, file);
      const { file: mediaFile } = await completeUpload(fileDescriptor);

      log('SUCCESS: Uploaded to Media Manager', {
        id: mediaFile?._id,
        fileName: mediaFile?.fileName,
        mimeType: mediaFile?.mimeType,
        mediaType: mediaFile?.mediaType
      });
      resetProgress();
    }

    log('=== All uploads complete ===');
  } catch (e) {
    log('FATAL ERROR:', e?.message || e);
  } finally {
    btnUpload.disabled = false;
  }
});
