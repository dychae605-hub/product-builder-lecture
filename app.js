/* ==========================================================================
   Antigravity PDF Splitter - Application Logic & Real-time Processing
   ========================================================================== */

// 1. PDF.js Worker Configuration
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';

// 2. State Variables
let originalArrayBuffer = null;
let originalFileName = "";
let pdfDoc = null; // pdfjs object
let splitFiles = []; // Array to store split files for ZIP aggregation

// 3. DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const btnSelectFile = document.getElementById('btn-select-file');
const fileInfoArea = document.getElementById('file-info-area');
const selectedFileName = document.getElementById('selected-file-name');
const selectedFileSize = document.getElementById('selected-file-size');
const selectedFilePages = document.getElementById('selected-file-pages');
const dropzoneContent = document.querySelector('.dropzone-content');

const fallbackInput = document.getElementById('fallback-input');
const btnSplit = document.getElementById('btn-split');
const btnSaveSelected = document.getElementById('btn-save-selected');
const btnDownloadAll = document.getElementById('btn-download-all');

const progressCard = document.getElementById('progress-card');
const progressBar = document.getElementById('progress-bar');
const progressLabel = document.getElementById('progress-label');
const progressPercentLabel = document.getElementById('progress-percent-label');

const fileList = document.getElementById('file-list');
const splitCountLabel = document.getElementById('split-count');
const chkSelectAll = document.getElementById('chk-select-all');

/* ==========================================================================
   Drag & Drop & File Picker Logic
   ========================================================================== */

// Trigger file input click
btnSelectFile.addEventListener('click', (e) => {
  e.stopPropagation(); // Prevent dropzone click bubbling
  fileInput.click();
});

dropzone.addEventListener('click', () => {
  fileInput.click();
});

// Drag over effect
dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('dragover');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('dragover');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('dragover');
  
  const files = e.dataTransfer.files;
  if (files.length > 0 && files[0].type === 'application/pdf') {
    handleSelectedFile(files[0]);
  } else {
    alert('올바른 PDF 파일을 업로드해 주세요.');
  }
});

fileInput.addEventListener('change', (e) => {
  const files = e.target.files;
  if (files.length > 0) {
    handleSelectedFile(files[0]);
  }
});

// Read and analyze selected file
async function handleSelectedFile(file) {
  originalFileName = file.name;
  selectedFileName.textContent = file.name;
  selectedFileSize.textContent = formatBytes(file.size);
  
  // Visual state updates
  dropzoneContent.style.display = 'none';
  fileInfoArea.style.display = 'flex';
  
  // Show loading in badge
  selectedFilePages.textContent = '분석 중...';
  btnSplit.disabled = true;
  btnDownloadAll.disabled = true;
  
  const reader = new FileReader();
  reader.onload = async (e) => {
    originalArrayBuffer = e.target.result;
    try {
      // Load PDF via pdf.js to get page count and enable extraction
      // Use .slice(0) to prevent the worker thread from detaching the original buffer
      pdfDoc = await pdfjsLib.getDocument({ data: originalArrayBuffer.slice(0) }).promise;
      selectedFilePages.textContent = `${pdfDoc.numPages} 페이지`;
      
      // Auto pre-populate fallback prefix based on original filename (optional smart default)
      const baseName = file.name.substring(0, file.name.lastIndexOf('.'));
      fallbackInput.value = `${baseName}_분할`;
      
      btnSplit.disabled = false;
    } catch (err) {
      console.error('PDF 로드 에러:', err);
      alert('PDF 분석 중 오류가 발생했습니다. 올바른 문서가 맞는지 확인해 주세요.');
      resetUploadArea();
    }
  };
  reader.readAsArrayBuffer(file);
}

function resetUploadArea() {
  originalArrayBuffer = null;
  pdfDoc = null;
  fileInput.value = '';
  dropzoneContent.style.display = 'flex';
  fileInfoArea.style.display = 'none';
  btnSplit.disabled = true;
}

/* ==========================================================================
   High-performance Regex Parsing Engine
   ========================================================================== */

// 이름 사후 정제 헬퍼 함수 (꼬리 키워드 완벽 제거 및 NFC 정규화)
function cleanName(matchedName) {
  if (!matchedName) return "";
  let name = matchedName.trim().normalize('NFC');
  
  // 한국어 이름의 경우 공백 제거 (예: "홍 길 동" -> "홍길동")
  if (/^[가-힣\s]+$/.test(name)) {
    name = name.replace(/\s+/g, '');
  }
  
  // 꼬리 키워드 리스트
  const removeKeywords = ["소속부서", "소속", "부서", "직급", "직위", "사원번호", "사원", "사번", "성명", "이름", "귀하", "직인생략"];
  
  // 1. 정규식 제거 패턴 적용 (뒤에 붙은 꼬리 메타 정보 일괄 삭제)
  name = name.replace(/(소속부서|소속|부서|직급|직위|사원번호|사원|사번|성명|이름|귀하|직인생략).*$/, '');
  
  // 2. 키워드 기반 indexOf 절단
  for (const kw of removeKeywords) {
    const idx = name.indexOf(kw);
    if (idx !== -1) {
      name = name.substring(0, idx);
    }
  }
  
  // 3. 한글 이름 정밀 필터링: 한글 이름 뒤에 한두 글자의 불필요한 단어가 달라붙은 경우 (예: "강호관소", "강호관부" 등)
  // 키워드의 '첫 글자'가 이름 끝에 달라붙은 경우를 처리하기 위해, 끝 글자가 특정 글자군("소", "부", "직", "사", "귀")인지 검사하여 제거
  // 단, 이름 자체가 3글자 이상일 때만 마지막 글자가 키워드 일부일 경우 잘라냅니다.
  if (name.length >= 3) {
    const lastChar = name.charAt(name.length - 1);
    const firstCharsOfKeywords = ["소", "부", "직", "사", "귀"];
    if (firstCharsOfKeywords.includes(lastChar)) {
      name = name.substring(0, name.length - 1);
    }
  }
  
  return name.trim();
}

function extractInfo(text) {
  // macOS NFD 한글 자모 분리 현상 방지를 위해 NFC 정규화 강제 적용
  text = text.normalize('NFC');
  let yearMonth = '';
  let name = '';
  
  // Normalize whitespaces for standard match, and strip spaces entirely for non-space match
  const cleanedText = text.replace(/\s+/g, ' ');
  const noSpaceText = text.replace(/\s+/g, '');
  
  // 1. Extract Payroll Year/Month
  const dateRegexes = [
    /(?:급여\s*년\s*월|귀\s*속\s*년\s*월|귀속\s*월|귀속\s*연\s*월)\s*[:：]?\s*(\d{4})년?\s*(\d{1,2})월?/,
    /(\d{4})년\s*(\d{1,2})월/,
    /(\d{4})[-./](\d{1,2})/
  ];
  
  for (const r of dateRegexes) {
    const m = cleanedText.match(r);
    if (m) {
      const year = m[1];
      const month = m[2].padStart(2, '0');
      yearMonth = `${year}${month}`;
      break;
    }
  }
  
  // Fail-safe yearMonth match on space-stripped version
  if (!yearMonth) {
    const noSpaceDateRegexes = [
      /(?:급여년월|귀속년월|귀속월|귀속연월)[:：]?(\d{4})년?(\d{1,2})월?/,
      /(\d{4})년(\d{1,2})월/,
      /(\d{4})[-./](\d{1,2})/
    ];
    for (const r of noSpaceDateRegexes) {
      const m = noSpaceText.match(r);
      if (m) {
        const year = m[1];
        const month = m[2].padStart(2, '0');
        yearMonth = `${year}${month}`;
        break;
      }
    }
  }
  
  // 2. Extract Employee Name
  const nameRegexes = [
    // [성명]과 소속부서(혹은 소속, 부서, 직급 등) 사이의 이름을 최우선적으로 감지하는 고정밀 앵커 매칭 패턴
    /(?:성\s*명|이\s*름|사원\s*명|직원\s*명)\s*[:：]?\s*([가-힣a-zA-Z\s·]{2,10})\s*(?:소속\s*부서|소속|부서|직급|직위|사원\s*번호|사번)/,
    /(?:성\s*명|이\s*름|사원명|직원명|수령인|수취인)\s*[:：]?\s*([가-힣a-zA-Z\s·]{2,10})/,
    /(?:성\s*명|이\s*름|사원명|직원명)\s+([가-힣a-zA-Z\s·]{2,10})/
  ];
  
  for (const r of nameRegexes) {
    const m = cleanedText.match(r);
    if (m) {
      let cleaned = cleanName(m[1]);
      // Ensure name isn't matching general labels (minimum length 2)
      if (cleaned.length >= 2 && cleaned.length <= 6) {
        name = cleaned;
        break;
      }
    }
  }
  
  // Fail-safe name match on space-stripped version
  if (!name) {
    const noSpaceNameRegexes = [
      // 무공백 상태에서 성명과 소속부서 경계를 포착하는 고정밀 무공백 패턴
      /(?:성명|이름|사원명|직원명)[:：]?([가-힣]{2,5})(?:소속부서|소속|부서|직급|직위|사번)/,
      /(?:성명|이름|사원명|직원명)[:：]?([가-힣]{2,5})/,
      /(?:성명|이름|사원명|직원명)([가-힣]{2,5})/
    ];
    for (const r of noSpaceNameRegexes) {
      const m = noSpaceText.match(r);
      if (m) {
        let cleaned = cleanName(m[1]);
        if (cleaned.length >= 2 && cleaned.length <= 6) {
          name = cleaned;
          break;
        }
      }
    }
  }
  
  // Deep extraction: find standard Korean name pattern near the '성명' anchor
  if (!name) {
    const m = cleanedText.match(/(?:성\s*명|이\s*름)\s*[\s\S]{0,10}?\s*([가-힣]{2,4})/);
    if (m && m[1]) {
      name = cleanName(m[1]);
    }
  }
  
  return { yearMonth, name };
}

/* ==========================================================================
   Real-Time PDF Splitting Logic
   ========================================================================== */

btnSplit.addEventListener('click', startPdfSplitting);

async function startPdfSplitting() {
  if (!originalArrayBuffer || !pdfDoc) return;

  // Clear explorer and state
  fileList.innerHTML = '';
  splitCountLabel.textContent = '0';
  splitFiles = [];
  chkSelectAll.checked = true;

  // Disable controls during operation
  btnSplit.disabled = true;
  btnSaveSelected.disabled = true;
  btnDownloadAll.disabled = true;
  btnSelectFile.disabled = true;
  dropzone.style.pointerEvents = 'none';

  progressCard.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.style.background = 'linear-gradient(90deg, var(--bg-base), var(--accent-color))';
  progressLabel.textContent = '분할 작업 시작 중...';
  progressPercentLabel.textContent = '0%';
  
  const totalPages = pdfDoc.numPages;
  const fallbackPrefix = fallbackInput.value.trim() || '미지정_급여명세서';
  
  let successCount = 0;
  let failCount = 0;
  let failedPages = [];

  try {
    // Load original PDF using pdf-lib
    const pdfLibDoc = await PDFLib.PDFDocument.load(originalArrayBuffer.slice(0));
    
    for (let i = 0; i < totalPages; i++) {
      const currentPageNum = i + 1;
      const percent = Math.round((currentPageNum / totalPages) * 100);
      
      // Update real-time progress text
      progressLabel.textContent = `총 ${totalPages}명 중 ${currentPageNum}명째 분할 중...`;
      progressBar.style.width = `${percent}%`;
      progressPercentLabel.textContent = `${percent}%`;
      
      // Process individual page
      try {
        // A. Extract text using PDF.js
        const page = await pdfDoc.getPage(currentPageNum);
        const textContent = await page.getTextContent();
        const text = textContent.items.map(item => item.str).join(' ');
        
        const { yearMonth, name } = extractInfo(text);
        
        // B. Determine filename
        let filename = "";
        if (yearMonth && name) {
          filename = `${yearMonth}_${name}_급여명세서.pdf`;
        } else {
          filename = `${fallbackPrefix}_${currentPageNum.toString().padStart(3, '0')}_급여명세서.pdf`;
        }
        
        // C. Extract page using pdf-lib
        const singlePageDoc = await PDFLib.PDFDocument.create();
        const [copiedPage] = await singlePageDoc.copyPages(pdfLibDoc, [i]);
        singlePageDoc.addPage(copiedPage);
        const pdfBytes = await singlePageDoc.save();
        
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        const size = blob.size;
        
        // D. Cache in state variable
        const fileId = 'file-' + Math.random().toString(36).substr(2, 9);
        splitFiles.push({ id: fileId, filename, bytes: pdfBytes, size });
        
        // E. Real-time list addition
        addFileToExplorer(fileId, filename, size, pdfBytes);
        
        successCount++;
        splitCountLabel.textContent = successCount;
        
        // GC hint
        singlePageDoc.context.pdfDoc = null;
        
      } catch (pageErr) {
        console.error(`${currentPageNum}페이지 분할 처리 실패:`, pageErr);
        failCount++;
        failedPages.push(currentPageNum);
      }
      
      // Throttling for UI rendering
      await new Promise(resolve => setTimeout(resolve, 80));
      
      // Yield to main thread
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    // Finished successfully
    if (failCount === 0) {
      progressLabel.textContent = `🎉 모든 분할이 성공적으로 완료되었습니다! 총 ${successCount}개의 명세서가 리스트에 준비되었습니다. 저장할 파일을 선택하고 [선택된 파일 로컬 저장] 버튼을 눌러주세요.`;
      progressBar.style.background = 'var(--success-color)';
    } else {
      progressLabel.textContent = `⚠️ 분할 완료 (일부 실패): 성공 ${successCount}건, 실패 ${failCount}건 (실패 페이지: ${failedPages.join(', ')}).`;
      progressBar.style.background = 'var(--warning-color, #f59e0b)';
    }
    
  } catch (err) {
    console.error('PDF 분할 에러:', err);
    progressLabel.textContent = `작업 도중 치명적인 오류가 발생했습니다: ${err.message}`;
    progressBar.style.background = 'var(--error-color)';
  } finally {
    // Re-enable elements
    btnSplit.disabled = false;
    btnSelectFile.disabled = false;
    dropzone.style.pointerEvents = 'auto';
    updateControlsState();
  }
}

/* ==========================================================================
   Explorer-Style File List Management
   ========================================================================== */

function addFileToExplorer(fileId, filename, size, pdfBytes) {
  const emptyRow = document.getElementById('empty-row');
  if (emptyRow) {
    emptyRow.remove();
  }
  
  const tr = document.createElement('tr');
  tr.id = `row-${fileId}`;
  
  tr.innerHTML = `
    <td class="col-checkbox-cell">
      <label class="checkbox-container row-checkbox-container">
        <input type="checkbox" class="explorer-row-checkbox" id="${fileId}-chk" data-id="${fileId}" checked>
      </label>
    </td>
    <td>
      <div class="explorer-file-cell">
        <!-- PDF File Icon -->
        <svg class="pdf-icon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path fill-rule="evenodd" d="M5.625 1.5H9a3.75 3.75 0 013.75 3.75v1.875c0 1.036.84 1.875 1.875 1.875H16.5a3.75 3.75 0 013.75 3.75v7.875c0 1.035-.84 1.875-1.875 1.875H5.625a1.875 1.875 0 01-1.875-1.875V3.375c0-1.036.84-1.875 1.875-1.875zm5.845 17.03a.75.75 0 001.06 0l3-3a.75.75 0 10-1.06-1.06l-1.72 1.72V12a.75.75 0 00-1.5 0v4.19l-1.72-1.72a.75.75 0 00-1.06 1.06l3 3z" clip-rule="evenodd" />
          <path d="M14.25 5.25a5.23 5.23 0 00-1.279-3.434 9.768 9.768 0 016.963 6.963A5.23 5.23 0 0016.5 7.5h-2.25z" />
        </svg>
        <span class="explorer-filename-link cursor-pointer" id="${fileId}-link" title="${filename}">${filename}</span>
      </div>
    </td>
    <td><span class="explorer-type-text">급여명세서 PDF</span></td>
    <td><span class="explorer-size-text">${formatBytes(size)}</span></td>
    <td style="text-align: right;">
      <button class="btn-row-download" id="${fileId}-btn" title="개별 다운로드">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
        </svg>
      </button>
    </td>
  `;
  
  fileList.appendChild(tr);
  
  // Checkbox change listener
  const chk = document.getElementById(`${fileId}-chk`);
  chk.addEventListener('change', updateControlsState);
  
  // Download helper binding
  const triggerDownload = () => {
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 100);
  };

  document.getElementById(`${fileId}-link`).addEventListener('click', triggerDownload);
  document.getElementById(`${fileId}-btn`).addEventListener('click', triggerDownload);
  
  // Stable layout autoscroll
  const container = document.querySelector('.explorer-table-container');
  container.scrollTop = container.scrollHeight;
}

/* ==========================================================================
   Checkbox and Control Button Synchronization
   ========================================================================== */

function updateControlsState() {
  const rowCheckboxes = Array.from(document.querySelectorAll('.explorer-row-checkbox'));
  
  if (rowCheckboxes.length === 0) {
    chkSelectAll.checked = false;
    btnSaveSelected.disabled = true;
    btnDownloadAll.disabled = true;
    return;
  }
  
  const checkedCount = rowCheckboxes.filter(c => c.checked).length;
  
  chkSelectAll.checked = (checkedCount === rowCheckboxes.length);
  
  // Enable save and download only if at least one checkbox is checked
  btnSaveSelected.disabled = (checkedCount === 0);
  btnDownloadAll.disabled = (checkedCount === 0);
}

// Select All functionality
chkSelectAll.addEventListener('change', () => {
  const isChecked = chkSelectAll.checked;
  const rowCheckboxes = document.querySelectorAll('.explorer-row-checkbox');
  rowCheckboxes.forEach(c => {
    c.checked = isChecked;
  });
  updateControlsState();
});

/* ==========================================================================
   Directory Save logic (Separated Process)
   ========================================================================== */

btnSaveSelected.addEventListener('click', saveSelectedFiles);

async function saveSelectedFiles() {
  // Collect selected files
  const checkedRowIds = Array.from(document.querySelectorAll('.explorer-row-checkbox'))
    .filter(c => c.checked)
    .map(c => c.dataset.id);
    
  const filesToSave = splitFiles.filter(f => checkedRowIds.includes(f.id));
  
  if (filesToSave.length === 0) {
    alert('저장할 파일을 선택해 주세요.');
    return;
  }

  if (!window.showDirectoryPicker) {
    alert("이 브라우저는 폴더 직접 저장 기능(File System Access API)을 지원하지 않습니다.\nChrome, Edge, 최신 Safari(macOS 15.2+) 브라우저를 사용하시거나 '선택 파일 압축(ZIP) 다운로드' 버튼을 이용해 주세요.");
    return;
  }

  let directoryHandle = null;
  let subDirHandle = null;

  try {
    directoryHandle = await window.showDirectoryPicker({
      mode: 'readwrite'
    });
    
    // Verify permission
    const hasPermission = await verifyPermission(directoryHandle, true);
    if (!hasPermission) {
      alert("선택하신 폴더에 대한 쓰기 권한이 승인되지 않았습니다. 파일 저장을 위해 권한을 허용해 주십시오.");
      return;
    }
  } catch (err) {
    console.error('폴더 선택 취소 또는 오류:', err);
    if (err.name === 'AbortError') {
      alert('로컬 폴더 선택이 취소되었습니다. 저장하려면 폴더를 선택해야 합니다.');
    } else {
      alert('폴더를 선택하는 도중 오류가 발생했습니다: ' + err.message);
    }
    return;
  }

  // Create date-time subfolder (e.g. 20260523_101234)
  try {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const dateTimeFolder = `${year}${month}${day}_${hours}${minutes}${seconds}`;

    subDirHandle = await directoryHandle.getDirectoryHandle(dateTimeFolder, { create: true });
  } catch (err) {
    console.error('폴더 생성 실패:', err);
    alert('로컬 폴더 내에 날짜시간 폴더를 생성하지 못했습니다. 폴더의 쓰기 권한을 확인해 주세요: ' + err.message);
    return;
  }

  // Disable controls during saving
  btnSplit.disabled = true;
  btnSaveSelected.disabled = true;
  btnDownloadAll.disabled = true;
  btnSelectFile.disabled = true;
  dropzone.style.pointerEvents = 'none';

  progressCard.style.display = 'block';
  progressBar.style.width = '0%';
  progressBar.style.background = 'linear-gradient(90deg, var(--bg-base), var(--accent-color))';
  
  const totalFiles = filesToSave.length;
  let successCount = 0;
  let failCount = 0;
  let failedNames = [];

  try {
    for (let i = 0; i < totalFiles; i++) {
      const currentFile = filesToSave[i];
      const percent = Math.round(((i + 1) / totalFiles) * 100);
      
      progressLabel.textContent = `총 ${totalFiles}개 중 ${i + 1}개째 저장 중... (${currentFile.filename})`;
      progressBar.style.width = `${percent}%`;
      progressPercentLabel.textContent = `${percent}%`;
      
      // Attempt save with retries
      try {
        const maxRetries = 3;
        let isSaved = false;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const fileHandle = await subDirHandle.getFileHandle(currentFile.filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(currentFile.bytes);
            await writable.close();
            isSaved = true;
            break;
          } catch (fileErr) {
            console.warn(`${currentFile.filename} 저장 시도 ${attempt}회 실패:`, fileErr);
            if (attempt < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, attempt * 150));
            } else {
              throw new Error(`${currentFile.filename} 로컬 저장 실패: ${fileErr.message}`);
            }
          }
        }
        
        if (isSaved) {
          successCount++;
        }
      } catch (saveErr) {
        console.error(`${currentFile.filename} 저장 에러:`, saveErr);
        failCount++;
        failedNames.push(currentFile.filename);
      }
      
      // Yield to main thread
      await new Promise(resolve => setTimeout(resolve, 80));
      await new Promise(resolve => requestAnimationFrame(resolve));
    }
    
    // Finished saving successfully
    if (failCount === 0) {
      progressLabel.textContent = `🎉 선택된 ${successCount}개의 파일이 성공적으로 로컬 폴더에 저장되었습니다!`;
      progressBar.style.background = 'var(--success-color)';
    } else {
      progressLabel.textContent = `⚠️ 저장 완료 (일부 실패): 성공 ${successCount}건, 실패 ${failCount}건 (실패 파일: ${failedNames.join(', ')}).`;
      progressBar.style.background = 'var(--warning-color, #f59e0b)';
    }
    
  } catch (err) {
    console.error('로컬 폴더 일괄 저장 에러:', err);
    progressLabel.textContent = `저장 도중 치명적인 오류가 발생했습니다: ${err.message}`;
    progressBar.style.background = 'var(--error-color)';
  } finally {
    // Re-enable elements
    btnSplit.disabled = false;
    btnSelectFile.disabled = false;
    dropzone.style.pointerEvents = 'auto';
    updateControlsState();
  }
}

/* ==========================================================================
   ZIP Download Aggregator (Selected Files Only)
   ========================================================================== */

btnDownloadAll.addEventListener('click', async () => {
  const checkedRowIds = Array.from(document.querySelectorAll('.explorer-row-checkbox'))
    .filter(c => c.checked)
    .map(c => c.dataset.id);
    
  const filesToDownload = splitFiles.filter(f => checkedRowIds.includes(f.id));
  
  if (filesToDownload.length === 0) return;
  
  btnDownloadAll.disabled = true;
  const originalHtml = btnDownloadAll.innerHTML;
  btnDownloadAll.innerHTML = `
    <svg class="btn-icon animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" style="animation: spin 1s linear infinite;">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H18" />
    </svg>
    <span>압축 파일 생성 중...</span>
  `;
  
  try {
    const selectedZip = new JSZip();
    filesToDownload.forEach(file => {
      selectedZip.file(file.filename, file.bytes);
    });
    
    const zipBlob = await selectedZip.generateAsync({ type: 'blob' });
    const zipUrl = URL.createObjectURL(zipBlob);
    
    // Create automatic trigger link
    const link = document.createElement('a');
    link.href = zipUrl;
    
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
    link.download = `급여명세서_선택분할_${dateStr}_${timeStr}.zip`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean URL
    setTimeout(() => URL.revokeObjectURL(zipUrl), 60000);
    
  } catch (err) {
    console.error('ZIP 생성 실패:', err);
    alert('압축 파일 생성 도중 오류가 발생했습니다: ' + err.message);
  } finally {
    btnDownloadAll.disabled = false;
    btnDownloadAll.innerHTML = originalHtml;
    updateControlsState();
  }
});

// Helper for spinner rotation
const styleEl = document.createElement('style');
styleEl.innerHTML = `
@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
.animate-spin {
  animation: spin 1s linear infinite;
}
`;
document.head.appendChild(styleEl);

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

// 사전 디렉토리 권한 검증 및 요청 함수
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
