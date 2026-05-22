/* ==========================================================================
   Antigravity PDF Encryption - Application Logic & Pure Client-Side Processing
   ========================================================================== */

import { encryptPDF } from 'https://esm.sh/@pdfsmaller/pdf-encrypt-lite';

// 1. State Variables
let directoryHandle = null;
let pdfFiles = []; // Array to store { id, name, handle, size }

// 2. DOM Elements
const btnSelectDir = document.getElementById('btn-select-dir');
const dirPickerZone = document.getElementById('dir-picker-zone');
const dirInfoArea = document.getElementById('dir-info-area');
const selectedDirName = document.getElementById('selected-dir-name');
const selectedDirPath = document.getElementById('selected-dir-path');
const selectedPdfCount = document.getElementById('selected-pdf-count');

const bulkPasswordInput = document.getElementById('bulk-password-input');
const btnToggleBulkPw = document.getElementById('btn-toggle-bulk-pw');
const btnApplyAllPw = document.getElementById('btn-apply-all-pw');
const btnStartEncrypt = document.getElementById('btn-start-encrypt');

const progressCard = document.getElementById('progress-card');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');
const progressPercentLabel = document.getElementById('progress-percent-label');

const pdfList = document.getElementById('pdf-list');
const pdfCountLabel = document.getElementById('pdf-count');
const chkSelectAll = document.getElementById('chk-select-all');

/* ==========================================================================
   Directory Selection & Permission Logic
   ========================================================================== */

// Trigger folder picker on button click
btnSelectDir.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent dropzone click bubbling
  selectLocalDirectory();
});

// Trigger folder picker on dropzone click (if not loaded yet)
dirPickerZone.addEventListener('click', () => {
  if (!directoryHandle) {
    selectLocalDirectory();
  }
});

// Select Local Directory
async function selectLocalDirectory() {
  if (!window.showDirectoryPicker) {
    alert("이 브라우저는 폴더 선택 기능(File System Access API)을 지원하지 않습니다.\n최신 Chrome, Edge, Safari(macOS 15.2+) 브라우저를 사용해 주세요.");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });

    // Request read & write permission
    const hasPermission = await verifyPermission(handle, true);
    if (!hasPermission) {
      alert("선택하신 폴더에 대한 읽기/쓰기 권한이 승인되지 않았습니다. 암호화를 위해 권한을 허용해 주십시오.");
      return;
    }

    directoryHandle = handle;
    
    // Update directory info UI
    selectedDirName.textContent = directoryHandle.name;
    selectedDirPath.textContent = `📁 로컬 보안 폴더: /Users/dychae/급여명세서_Project/${directoryHandle.name}`;
    
    // Hide picker content and show directory details
    document.querySelector('.dropzone-content').style.display = 'none';
    dirInfoArea.style.display = 'flex';
    
    // Reset progress UI and table
    progressCard.style.display = 'none';
    progressBar.style.width = '0%';
    
    // Scan directory for PDF files
    await scanDirectory();

  } catch (err) {
    console.error('폴더 선택 취소 또는 오류:', err);
    if (err.name !== 'AbortError') {
      alert('폴더를 선택하는 도중 오류가 발생했습니다: ' + err.message);
    }
  }
}

// Check and request folder read/write permissions
async function verifyPermission(fileHandle, readWrite) {
  const options = {};
  if (readWrite) {
    options.mode = 'readwrite';
  }
  if ((await fileHandle.queryPermission(options)) === 'granted') {
    return true;
  }
  if ((await fileHandle.requestPermission(options)) === 'granted') {
    return true;
  }
  return false;
}

/* ==========================================================================
   Directory Scan & File Listing
   ========================================================================== */

async function scanDirectory() {
  if (!directoryHandle) return;

  pdfFiles = [];
  pdfList.innerHTML = '';
  chkSelectAll.checked = true;

  try {
    let count = 0;
    for await (const entry of directoryHandle.values()) {
      if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.pdf')) {
        const file = await entry.getFile();
        const fileId = 'pdf-' + Math.random().toString(36).substr(2, 9);
        pdfFiles.push({
          id: fileId,
          name: entry.name,
          handle: entry,
          size: file.size
        });
        count++;
      }
    }

    if (pdfFiles.length === 0) {
      pdfList.innerHTML = `
        <tr id="empty-row">
          <td colspan="5" class="empty-state">
            <svg class="empty-icon" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p>선택하신 폴더 내에 PDF 파일이 존재하지 않습니다. 다른 폴더를 선택해 주세요.</p>
          </td>
        </tr>
      `;
      pdfCountLabel.textContent = '0';
      selectedPdfCount.textContent = '0개 파일';
      btnStartEncrypt.disabled = true;
      btnApplyAllPw.disabled = true;
    } else {
      pdfCountLabel.textContent = count;
      selectedPdfCount.textContent = `${count}개 파일`;

      // Sort files alphabetically
      pdfFiles.sort((a, b) => a.name.localeCompare(b.name));

      pdfFiles.forEach(file => {
        addFileRow(file);
      });

      btnStartEncrypt.disabled = false;
      btnApplyAllPw.disabled = false;
    }
  } catch (err) {
    console.error('폴더 스캔 중 에러:', err);
    alert('폴더 내의 파일을 스캔하는 중 오류가 발생했습니다: ' + err.message);
  }
}

// Add row to PDF Explorer Table
function addFileRow(file) {
  const emptyRow = document.getElementById('empty-row');
  if (emptyRow) {
    emptyRow.remove();
  }

  const tr = document.createElement('tr');
  tr.id = `row-${file.id}`;

  tr.innerHTML = `
    <td class="col-checkbox" style="text-align: center;">
      <label class="checkbox-container" style="padding: 0; display: inline-flex; justify-content: center; align-items: center; width: 18px; height: 18px; margin: 0 auto;">
        <input type="checkbox" class="explorer-row-checkbox" id="${file.id}-chk" data-id="${file.id}" checked>
      </label>
    </td>
    <td>
      <div class="explorer-file-cell">
        <svg class="pdf-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path fill-rule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 013.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 013.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 01-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875zm5.845 17.03a.75.75 0 001.06 0l3-3a.75.75 0 10-1.06-1.06l-1.72 1.72V12a.75.75 0 00-1.5 0v4.19l-1.72-1.72a.75.75 0 00-1.06 1.06l3 3z" clip-rule="evenodd" />
          <path d="M14.25 5.25a5.23 5.23 0 00-1.279-3.434 9.768 9.768 0 016.963 6.963A5.23 5.23 0 0016.5 7.5h-2.25z" />
        </svg>
        <span class="explorer-filename" title="${file.name}">${file.name}</span>
      </div>
    </td>
    <td><span class="explorer-size-text">${formatBytes(file.size)}</span></td>
    <td>
      <div class="table-password-wrapper">
        <input type="password" class="row-password-input" id="${file.id}-pw" placeholder="비밀번호 입력">
        <button type="button" class="btn-toggle-pw" id="${file.id}-btn-toggle" title="비밀번호 보기/숨기기">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="icon-eye">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        </button>
      </div>
    </td>
    <td>
      <span class="status-badge status-standby" id="${file.id}-status">대기 중</span>
    </td>
  `;

  pdfList.appendChild(tr);

  // Checkbox state sync listener
  const chk = document.getElementById(`${file.id}-chk`);
  chk.addEventListener('change', updateControlsState);

  // Individual Row Password toggle visibility
  const pwInput = document.getElementById(`${file.id}-pw`);
  const toggleBtn = document.getElementById(`${file.id}-btn-toggle`);
  
  toggleBtn.addEventListener('click', () => {
    if (pwInput.type === 'password') {
      pwInput.type = 'text';
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="icon-eye-off">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
        </svg>
      `;
    } else {
      pwInput.type = 'password';
      toggleBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="icon-eye">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      `;
    }
  });
}

/* ==========================================================================
   Syncing Bulk Password and Select All Inputs
   ========================================================================== */

// Bulk Password toggle visibility
btnToggleBulkPw.addEventListener('click', () => {
  if (bulkPasswordInput.type === 'password') {
    bulkPasswordInput.type = 'text';
    btnToggleBulkPw.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="icon-eye-off">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
      </svg>
    `;
  } else {
    bulkPasswordInput.type = 'password';
    btnToggleBulkPw.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" class="icon-eye">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    `;
  }
});

// Apply Bulk Password to Checked Row inputs
btnApplyAllPw.addEventListener('click', () => {
  const bulkVal = bulkPasswordInput.value.trim();
  if (!bulkVal) {
    alert('일괄 적용할 비밀번호를 입력해 주세요.');
    return;
  }

  const checkedRows = Array.from(document.querySelectorAll('.explorer-row-checkbox'))
    .filter(c => c.checked)
    .map(c => c.dataset.id);

  if (checkedRows.length === 0) {
    alert('비밀번호를 일괄 적용할 대상을 선택해 주세요.');
    return;
  }

  checkedRows.forEach(id => {
    const rowPwInput = document.getElementById(`${id}-pw`);
    if (rowPwInput) {
      rowPwInput.value = bulkVal;
    }
  });
});

// Update state of buttons based on selected checkboxes
function updateControlsState() {
  const rowCheckboxes = Array.from(document.querySelectorAll('.explorer-row-checkbox'));

  if (rowCheckboxes.length === 0) {
    chkSelectAll.checked = false;
    btnStartEncrypt.disabled = true;
    btnApplyAllPw.disabled = true;
    return;
  }

  const checkedCount = rowCheckboxes.filter(c => c.checked).length;
  chkSelectAll.checked = (checkedCount === rowCheckboxes.length);

  btnStartEncrypt.disabled = (checkedCount === 0);
  btnApplyAllPw.disabled = (checkedCount === 0);
}

// Select All Checkboxes toggle
chkSelectAll.addEventListener('change', () => {
  const isChecked = chkSelectAll.checked;
  const rowCheckboxes = document.querySelectorAll('.explorer-row-checkbox');
  rowCheckboxes.forEach(c => {
    c.checked = isChecked;
  });
  updateControlsState();
});

/* ==========================================================================
   Sequential PDF Encryption Pipeline
   ========================================================================== */

btnStartEncrypt.addEventListener('click', startPdfEncryption);

async function startPdfEncryption() {
  // Collect checked rows
  const checkedCheckboxes = Array.from(document.querySelectorAll('.explorer-row-checkbox'))
    .filter(c => c.checked);

  if (checkedCheckboxes.length === 0) {
    alert('암호화할 파일을 하나 이상 선택해 주세요.');
    return;
  }

  // 1. Disable page interactions
  btnStartEncrypt.disabled = true;
  btnSelectDir.disabled = true;
  btnApplyAllPw.disabled = true;
  chkSelectAll.disabled = true;
  
  const allRowCheckboxes = document.querySelectorAll('.explorer-row-checkbox');
  allRowCheckboxes.forEach(c => c.disabled = true);

  // 2. Setup progress panel
  progressCard.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.style.background = 'linear-gradient(90deg, var(--bg-dark), var(--blue-color))';
  progressLabel.textContent = '순차 PDF 암호화 작업 시작 중...';
  progressPercentLabel.textContent = '0%';

  const total = checkedCheckboxes.length;
  let successCount = 0;
  let failCount = 0;
  let failedFiles = [];

  try {
    for (let i = 0; i < total; i++) {
      const chk = checkedCheckboxes[i];
      const fileId = chk.dataset.id;
      const fileObj = pdfFiles.find(f => f.id === fileId);

      if (!fileObj) continue;

      const pwInput = document.getElementById(`${fileId}-pw`);
      const statusLabel = document.getElementById(`${fileId}-status`);
      const password = pwInput ? pwInput.value.trim() : '';

      // Update progress bar
      const percent = Math.round((i / total) * 100);
      progressLabel.textContent = `총 ${total}개 중 ${i + 1}개째 암호화 중... (${fileObj.name})`;
      progressBar.style.width = `${percent}%`;
      progressPercentLabel.textContent = `${percent}%`;

      // Set state to running
      statusLabel.className = 'status-badge status-running';
      statusLabel.textContent = '암호화 중...';

      try {
        if (!password) {
          throw new Error('비밀번호 미입력');
        }

        // A. Read raw file bytes
        const file = await fileObj.handle.getFile();
        const arrayBuffer = await file.arrayBuffer();
        const existingPdfBytes = new Uint8Array(arrayBuffer);

        // B. Encrypt PDF using the imported library
        const encryptedPdfBytes = await encryptPDF(existingPdfBytes, password);

        // C. Overwrite the original file on the local file system
        const writable = await fileObj.handle.createWritable();
        await writable.write(encryptedPdfBytes);
        await writable.close();

        // D. Update row status to success
        statusLabel.className = 'status-badge status-success';
        statusLabel.textContent = '🎉 암호화 성공';

        // E. Update file size in table as it might have changed slightly
        const fileRow = document.getElementById(`row-${fileId}`);
        const sizeCell = fileRow.querySelector('.explorer-size-text');
        if (sizeCell) {
          sizeCell.textContent = formatBytes(encryptedPdfBytes.byteLength);
        }
        fileObj.size = encryptedPdfBytes.byteLength;

        successCount++;
      } catch (fileErr) {
        console.error(`${fileObj.name} 암호화 중 오류 발생:`, fileErr);
        statusLabel.className = 'status-badge status-error';
        statusLabel.textContent = `❌ 실패: ${fileErr.message}`;
        failCount++;
        failedFiles.push(fileObj.name);
      }

      // Add a slight throttle to let browser render UI
      await new Promise(resolve => setTimeout(resolve, 80));
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    // 3. Update final progress state
    progressBar.style.width = '100%';
    progressPercentLabel.textContent = '100%';

    if (failCount === 0) {
      progressLabel.textContent = `🎉 선택된 ${successCount}개의 PDF 파일이 모두 성공적으로 암호화 및 로컬 저장되었습니다!`;
      progressBar.style.background = 'var(--success-color)';
    } else {
      progressLabel.textContent = `⚠️ 암호화 완료 (일부 실패): 성공 ${successCount}건, 실패 ${failCount}건 (실패 파일: ${failedFiles.join(', ')}). 각 행의 사유를 확인해 주세요.`;
      progressBar.style.background = 'var(--warning-color)';
    }

  } catch (err) {
    console.error('암호화 작업 도중 치명적 에러:', err);
    progressLabel.textContent = `작업 도중 치명적인 오류가 발생했습니다: ${err.message}`;
    progressBar.style.background = 'var(--error-color)';
  } finally {
    // 4. Re-enable interactive elements
    btnStartEncrypt.disabled = false;
    btnSelectDir.disabled = false;
    btnApplyAllPw.disabled = false;
    chkSelectAll.disabled = false;
    
    allRowCheckboxes.forEach(c => c.disabled = false);
    updateControlsState();
  }
}

/* ==========================================================================
   Utilities
   ========================================================================== */

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}
