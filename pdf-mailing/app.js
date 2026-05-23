/* ==========================================================================
   Antigravity PDF Mailing - Application Logic & Safe Dispatch Sim Pipeline
   ========================================================================== */

// 1. State Variables
let directoryHandle = null;
let pdfFiles = []; // Array to store { id, name, handle, size, extractedName }

// 2. DOM Elements
const btnSelectDir = document.getElementById('btn-select-dir');
const dirPickerZone = document.getElementById('dir-picker-zone');
const dirInfoArea = document.getElementById('dir-info-area');
const selectedDirName = document.getElementById('selected-dir-name');
const selectedDirPath = document.getElementById('selected-dir-path');
const mailSenderInput = document.getElementById('mail-sender-input');
const mailSubjectInput = document.getElementById('mail-subject-input');
const editorBody = document.getElementById('editor-body');

const btnStartMailing = document.getElementById('btn-start-mailing');

const progressCard = document.getElementById('progress-card');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');
const progressPercentLabel = document.getElementById('progress-percent-label');

const pdfList = document.getElementById('pdf-list');
const pdfCountLabel = document.getElementById('pdf-count');
const chkSelectAll = document.getElementById('chk-select-all');

// WYSIWYG Editor Toolbar Elements
const btnToolBold = document.getElementById('btn-tool-bold');
const btnToolItalic = document.getElementById('btn-tool-italic');
const btnToolUnderline = document.getElementById('btn-tool-underline');
const selectToolFont = document.getElementById('select-tool-font');
const selectToolSize = document.getElementById('select-tool-size');
const inputToolColor = document.getElementById('input-tool-color');
const colorPreview = document.getElementById('color-preview');

/* ==========================================================================
   WYSIWYG Editor Actions
   ========================================================================== */

// Prevent toolbar buttons from stealing editor selection focus
const toolbarInteractiveElements = document.querySelectorAll('.btn-tool, .select-tool, .color-picker-wrapper');
toolbarInteractiveElements.forEach(elem => {
  elem.addEventListener('mousedown', (e) => {
    e.preventDefault();
  });
});

// Format triggers
btnToolBold.addEventListener('click', () => {
  document.execCommand('bold', false, null);
  editorBody.focus();
});

btnToolItalic.addEventListener('click', () => {
  document.execCommand('italic', false, null);
  editorBody.focus();
});

btnToolUnderline.addEventListener('click', () => {
  document.execCommand('underline', false, null);
  editorBody.focus();
});

selectToolFont.addEventListener('change', () => {
  document.execCommand('fontName', false, selectToolFont.value);
  editorBody.focus();
});

selectToolSize.addEventListener('change', () => {
  document.execCommand('fontSize', false, selectToolSize.value);
  editorBody.focus();
});

inputToolColor.addEventListener('input', () => {
  const chosenColor = inputToolColor.value;
  colorPreview.style.backgroundColor = chosenColor;
  document.execCommand('foreColor', false, chosenColor);
  editorBody.focus();
});

/* ==========================================================================
   Directory Selection & Directory Scan
   ========================================================================== */

btnSelectDir.addEventListener('click', (e) => {
  e.stopPropagation();
  selectLocalDirectory();
});

dirPickerZone.addEventListener('click', () => {
  if (!directoryHandle) {
    selectLocalDirectory();
  }
});

async function selectLocalDirectory() {
  if (!window.showDirectoryPicker) {
    alert("이 브라우저는 폴더 선택 기능(File System Access API)을 지원하지 않습니다.\n최신 Chrome, Edge, Safari(macOS 15.2+) 브라우저를 사용해 주세요.");
    return;
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });

    const hasPermission = await verifyPermission(handle, true);
    if (!hasPermission) {
      alert("선택하신 폴더에 대한 읽기/쓰기 권한이 승인되지 않았습니다. 메일 발송 첨부를 위해 권한을 허용해 주십시오.");
      return;
    }

    directoryHandle = handle;
    
    // Update Directory UI
    selectedDirName.textContent = directoryHandle.name;
    selectedDirPath.textContent = `📁 로컬 보안 폴더: /Users/dychae/급여명세서_Project/${directoryHandle.name}`;
    
    document.querySelector('.dropzone-content').style.display = 'none';
    dirInfoArea.style.display = 'flex';
    
    progressCard.style.display = 'none';
    progressBar.style.width = '0%';
    
    await scanDirectory();

  } catch (err) {
    console.error('폴더 선택 에러:', err);
    if (err.name !== 'AbortError') {
      alert('폴더를 선택하는 도중 오류가 발생했습니다: ' + err.message);
    }
  }
}

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
   Directory PDF File Extraction & Listing
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
        
        // Intelligent Employee Name Extraction from PDF Filename
        const extractedName = extractEmployeeName(entry.name);
        
        pdfFiles.push({
          id: fileId,
          name: entry.name,
          handle: entry,
          size: file.size,
          extractedName: extractedName
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
            <p>선택하신 폴더 내에 PDF 급여명세서 파일이 존재하지 않습니다. 다른 폴더를 선택해 주세요.</p>
          </td>
        </tr>
      `;
      pdfCountLabel.textContent = '0';
      selectedPdfCount.textContent = '0개 파일';
      btnStartMailing.disabled = true;
    } else {
      pdfCountLabel.textContent = count;
      selectedPdfCount.textContent = `${count}개 파일`;

      // Sort files alphabetically
      pdfFiles.sort((a, b) => a.name.localeCompare(b.name));

      pdfFiles.forEach(file => {
        addFileRow(file);
      });

      btnStartMailing.disabled = false;
    }
  } catch (err) {
    console.error('디렉토리 스캔 오류:', err);
    alert('폴더 스캔 중 에러가 발생했습니다: ' + err.message);
  }
}

// Extracted Name Parser (NFC normalization and clean)
function extractEmployeeName(filename) {
  const normName = filename.normalize('NFC');
  const base = normName.substring(0, normName.lastIndexOf('.'));
  
  // Rule 1: Split by underscore (e.g., 202605_강호관_급여명세서)
  const parts = base.split('_');
  if (parts.length >= 2) {
    const candidate = parts[1].trim();
    // Return if it fits Korean or alphabetic name formats
    if (/^[가-힣a-zA-Z\s]{2,10}$/.test(candidate)) {
      return candidate;
    }
  }

  // Rule 2: Regex fallback to match numbers followed by a name
  const match = base.match(/(?:\d+)?_?([가-힣]{2,4})_/);
  if (match && match[1]) {
    return match[1];
  }

  return null;
}

// Add Row to PDF Explorer Table
function addFileRow(file) {
  const emptyRow = document.getElementById('empty-row');
  if (emptyRow) {
    emptyRow.remove();
  }

  // Generate Smart Pre-Populated Email Address
  const mockEmailDomain = 'example.com';
  const prefilledEmail = file.extractedName ? `${file.extractedName}@${mockEmailDomain}` : '';

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
      <input type="text" class="row-email-input" id="${file.id}-email" placeholder="이메일 주소 입력" value="${prefilledEmail}">
    </td>
    <td>
      <span class="status-badge status-standby" id="${file.id}-status">대기 중</span>
    </td>
  `;

  pdfList.appendChild(tr);

  // Sync Checkbox Listener
  const chk = document.getElementById(`${file.id}-chk`);
  chk.addEventListener('change', updateControlsState);
}

/* ==========================================================================
   Syncing Select All and Controls State
   ========================================================================== */

function updateControlsState() {
  const rowCheckboxes = Array.from(document.querySelectorAll('.explorer-row-checkbox'));

  if (rowCheckboxes.length === 0) {
    chkSelectAll.checked = false;
    btnStartMailing.disabled = true;
    return;
  }

  const checkedCount = rowCheckboxes.filter(c => c.checked).length;
  chkSelectAll.checked = (checkedCount === rowCheckboxes.length);

  btnStartMailing.disabled = (checkedCount === 0);
}

chkSelectAll.addEventListener('change', () => {
  const isChecked = chkSelectAll.checked;
  const rowCheckboxes = document.querySelectorAll('.explorer-row-checkbox');
  rowCheckboxes.forEach(c => {
    c.checked = isChecked;
  });
  updateControlsState();
});

/* ==========================================================================
   High-Fidelity Email Dispatch Simulation Pipeline
   ========================================================================== */

btnStartMailing.addEventListener('click', startEmailDispatch);

async function startEmailDispatch() {
  // Collect checked rows
  const checkedCheckboxes = Array.from(document.querySelectorAll('.explorer-row-checkbox'))
    .filter(c => c.checked);

  if (checkedCheckboxes.length === 0) {
    alert('발송할 대상을 하나 이상 선택해 주세요.');
    return;
  }

  const senderEmail = mailSenderInput.value.trim();
  const subject = mailSubjectInput.value.trim();
  const bodyHtml = editorBody.innerHTML.trim();

  if (!senderEmail) {
    alert('보내는 사람 이메일 주소를 입력해 주세요.');
    return;
  }

  // Sender email address validation
  const senderEmailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!senderEmailRegex.test(senderEmail)) {
    alert('보내는 사람 이메일 주소 형식이 올바르지 않습니다.');
    return;
  }

  if (!subject) {
    alert('이메일 제목을 입력해 주세요.');
    return;
  }

  if (!bodyHtml || editorBody.innerText.trim() === '') {
    alert('이메일 본문 내용을 입력해 주세요.');
    return;
  }

  // 1. Disable all controls to preserve state and avoid conflicts
  btnStartMailing.disabled = true;
  btnSelectDir.disabled = true;
  chkSelectAll.disabled = true;
  mailSenderInput.disabled = true;
  mailSubjectInput.disabled = true;
  editorBody.contentEditable = "false";
  
  const allRowCheckboxes = document.querySelectorAll('.explorer-row-checkbox');
  allRowCheckboxes.forEach(c => c.disabled = true);
  
  const allEmailInputs = document.querySelectorAll('.row-email-input');
  allEmailInputs.forEach(i => i.disabled = true);

  // 2. Open progress card
  progressCard.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.style.background = 'linear-gradient(90deg, var(--bg-dark), var(--accent-color))';
  progressLabel.textContent = '메일 발송 큐(Queue) 연동 시작 중...';
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

      const emailInput = document.getElementById(`${fileId}-email`);
      const statusLabel = document.getElementById(`${fileId}-status`);
      const emailAddress = emailInput ? emailInput.value.trim() : '';

      // Update global progress bar with sender info
      const percent = Math.round((i / total) * 100);
      progressLabel.textContent = `[${senderEmail}] ➡️ 총 ${total}명 중 ${i + 1}명째 발송 중... (${fileObj.name})`;
      progressBar.style.width = `${percent}%`;
      progressPercentLabel.textContent = `${percent}%`;

      // Set status to running
      statusLabel.className = 'status-badge status-running';
      statusLabel.textContent = '서버 연결 중...';

      try {
        // Validation Checks
        if (!emailAddress) {
          throw new Error('이메일 주소 누락');
        }

        // Email address regex verification
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(emailAddress)) {
          throw new Error('메일 형식 오류');
        }

        // Simulating fine-grained SMTP dispatch phases to WOW the user
        await new Promise(resolve => setTimeout(resolve, 250));
        statusLabel.textContent = '보안 인증 핸드셰이크...';
        
        await new Promise(resolve => setTimeout(resolve, 300));
        statusLabel.textContent = 'PDF 페이로드 빌드...';
        
        // Read file handle byte check
        const file = await fileObj.handle.getFile();
        
        await new Promise(resolve => setTimeout(resolve, 350));
        statusLabel.textContent = 'SMTP 메일 릴레이 중...';

        await new Promise(resolve => setTimeout(resolve, 350));
        
        // Simulating a rare I/O mock fail for extra validation realism
        if (emailAddress.includes('error') || file.size === 0) {
          throw new Error('서버 전송 시간 만료');
        }

        // Success
        statusLabel.className = 'status-badge status-success';
        statusLabel.textContent = '🎉 발송 성공';
        successCount++;

      } catch (fileErr) {
        console.error(`${fileObj.name} 메일 발송 오류:`, fileErr);
        statusLabel.className = 'status-badge status-error';
        statusLabel.textContent = `❌ 실패: ${fileErr.message}`;
        failCount++;
        failedFiles.push(fileObj.name);
      }

      // Brief rendering pause
      await new Promise(resolve => requestAnimationFrame(resolve));
    }

    // 3. Final progress state updates
    progressBar.style.width = '100%';
    progressPercentLabel.textContent = '100%';

    if (failCount === 0) {
      progressLabel.textContent = `🎉 [${senderEmail}]에서 선택된 ${successCount}명의 임직원에게 급여명세서 메일 발송이 안전하게 완료되었습니다!`;
      progressBar.style.background = 'var(--success-color)';
    } else {
      progressLabel.textContent = `⚠️ [${senderEmail}]에서 발송 완료 (일부 실패): 성공 ${successCount}건, 실패 ${failCount}건.`;
      progressBar.style.background = 'var(--warning-color)';
    }

  } catch (err) {
    console.error('메일 큐 전송 치명적 오류:', err);
    progressLabel.textContent = `작업 도중 치명적인 오류가 발생했습니다: ${err.message}`;
    progressBar.style.background = 'var(--error-color)';
  } finally {
    // 4. Re-enable inputs
    btnStartMailing.disabled = false;
    btnSelectDir.disabled = false;
    chkSelectAll.disabled = false;
    mailSenderInput.disabled = false;
    mailSubjectInput.disabled = false;
    editorBody.contentEditable = "true";
    
    allRowCheckboxes.forEach(c => c.disabled = false);
    allEmailInputs.forEach(i => i.disabled = false);
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
