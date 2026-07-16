// =============================================
// app.js — Application Logic
// (แยกออกมาจาก <script> inline ใน index.html)
// =============================================

// =============================================
// --- MATRIX BACKGROUND ---
// =============================================
(function () {
  const canvas = document.getElementById('matrixCanvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const matrix = "ABCDEFGHIJKLMNOPQRSTUVWXYZ123456789@#$%^&*()*&^%+-/~{[|`]}";
  const matrixArray = matrix.split("");
  const fontSize = 10;
  const columns = canvas.width / fontSize;
  const drops = [];
  for (let x = 0; x < columns; x++) { drops[x] = 1; }

  function draw() {
    ctx.fillStyle = 'rgba(248, 250, 252, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#94a3b8';
    ctx.font = fontSize + 'px monospace';
    for (let i = 0; i < drops.length; i++) {
      const text = matrixArray[Math.floor(Math.random() * matrixArray.length)];
      ctx.fillText(text, i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) { drops[i] = 0; }
      drops[i]++;
    }
  }

  let matrixAnimId = null;
  let lastDraw = 0;

  function animateMatrix(ts) {
    if (ts - lastDraw >= 35) {
      draw();
      lastDraw = ts;
    }
    matrixAnimId = requestAnimationFrame(animateMatrix);
  }

  matrixAnimId = requestAnimationFrame(animateMatrix);

  // หยุด animation เมื่อไม่ได้ดูหน้า (ประหยัด battery)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (matrixAnimId) { cancelAnimationFrame(matrixAnimId); matrixAnimId = null; }
    } else {
      if (!matrixAnimId) matrixAnimId = requestAnimationFrame(animateMatrix);
    }
  });

  window.addEventListener('resize', () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  });
})();

// --- FIREBASE & APP LOGIC ---
const EMAIL_PREFIX = "vault://";
const ADDR_PREFIX = "addr://";
const QUICKNOTE_PREFIX = "quicknote://";
const EMAIL_SEPARATOR = "|::|";
const PARCEL_SEPARATOR = "\u2295\u2295\u2295"; // ⊕⊕⊕ ไม่ชนกับ |||EXTRA||| ใน messages

let currentEmailsList = [];
let currentMessagesList = [];
let allMessagesList = [];
let emailDisplayCount = 10;
let boardDisplayCount = 10;
let messageIdToDelete = null;
let messageIdToEdit = null;
let isEditingEmailMode = false;
let isEditingQuickNoteMode = false;
let addressIdToDelete = null;
let quickNoteId = null;
let quickNoteText = "";
let emailSortOrder = 'newest'; // 'newest' or 'oldest'

// Toast Function
function showToast(msg = 'คัดลอกข้อความแล้ว!') {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('opacity-0', 'translate-y-10');
  toast.classList.add('opacity-100', 'translate-y-0');
  setTimeout(() => {
    toast.classList.remove('opacity-100', 'translate-y-0');
    toast.classList.add('opacity-0', 'translate-y-10');
  }, 2000);
}

function formatTimeAgo(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMinutes < 60) {
    return `${diffMinutes} นาทีที่แล้ว`;
  } else if (diffHours < 24) {
    return `${diffHours} ชั่วโมงที่แล้ว`;
  } else {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${day}-${month}-${year} ${hours}:${minutes}`;
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[m]));
}

async function copyTextToClipboard(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    showToast();
    if (btn) {
      const original = btn.textContent;
      btn.textContent = '✅ คัดลอกแล้ว';
      setTimeout(() => { btn.textContent = original; }, 1500);
    }
  } catch (err) { alert('ไม่สามารถคัดลอกได้'); }
}

// =============================================
// --- TAB NAVIGATION ---
// =============================================
document.querySelectorAll('.tab-item').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.tab;
    ['camouflage', 'board', 'email'].forEach(t => {
      document.getElementById(t + '-tab').classList.toggle('hidden', t !== tab);
    });
    // Show/hide Quick Note only on camouflage tab
    const quickNoteContainer = document.getElementById('quicknote-container');
    if (quickNoteContainer) {
      quickNoteContainer.classList.toggle('hidden', tab !== 'camouflage');
    }
  };
});

// =============================================
// --- QUICK NOTE SYSTEM ---
// =============================================
function renderQuickNote(text) {
  const content = document.getElementById('quickNoteContent');
  if (!text || text.trim() === '') {
    content.textContent = '(บันทึกว่างเปล่า - กดแก้ไขเพื่อเพิ่มข้อความ)';
    content.style.color = 'var(--text-hint)';
    content.style.fontStyle = 'italic';
  } else {
    content.textContent = text;
    content.style.color = 'var(--text-main)';
    content.style.fontStyle = 'normal';
  }
}

function openQuickNoteEditModal() {
  isEditingQuickNoteMode = true;
  messageIdToEdit = quickNoteId; // เก็บ ID สำหรับการบันทึก
  
  // ซ่อน containers อื่น
  document.getElementById('editMessageContainer').classList.add('hidden');
  document.getElementById('editEmailContainer').classList.add('hidden');
  document.getElementById('editAddressContainer').classList.add('hidden');
  document.getElementById('editQuickNoteContainer').classList.remove('hidden');
  
  document.getElementById('editTitleInput').value = 'Quick Note'; // ไม่ต้องแก้ไขหัวข้อ
  document.getElementById('editQuickNoteInput').value = quickNoteText || '';
  document.getElementById('editModal').classList.remove('hidden');
}

async function ensureQuickNoteExists() {
  // ถ้าไม่มี quick note ID แล้ว ให้สร้างตัวใหม่
  if (!quickNoteId) {
    try {
      const { data, error } = await sb.from('links').insert([
        {
          title: 'Quick Note',
          url: QUICKNOTE_PREFIX,
          is_pinned: false
        }
      ]).select();
      
      if (error) {
        console.error('Error creating quick note:', error);
        return;
      }
      
      if (data && data[0]) {
        quickNoteId = data[0].id;
        quickNoteText = '';
      }
    } catch (err) {
      console.error('Exception creating quick note:', err);
    }
  }
}

async function saveQuickNote(text) {
  if (!quickNoteId) {
    await ensureQuickNoteExists();
  }
  
  if (!quickNoteId) return;
  
  try {
    const url = QUICKNOTE_PREFIX + (text || '');
    const { error } = await sb.from('links')
      .update({ url: url })
      .eq('id', quickNoteId);
    
    if (error) {
      console.error('Error saving quick note:', error);
      showToast('❌ ไม่สามารถบันทึก');
      return;
    }
    
    quickNoteText = text;
    renderQuickNote(text);
    showToast('✅ บันทึกสำเร็จ');
  } catch (err) {
    console.error('Exception saving quick note:', err);
    showToast('❌ เกิดข้อผิดพลาด');
  }
}

// =============================================
// --- ADDRESS SYSTEM (FIREBASE) ---
// =============================================
let allAddresses = []; // เก็บข้อมูลที่อยู่ทั้งหมดเพื่อใช้ค้นหา

function initAddressSystem() {
  const searchInput = document.getElementById('addressSearchInput');
  const searchResults = document.getElementById('addressSearchResults');
  const inputArea = document.getElementById('inputArea');
  const addressListContainer = document.getElementById('addressListContainer');

  const toggleAddAddress = document.getElementById('toggleAddAddress');
  const addAddressContent = document.getElementById('addAddressContent');
  const collapseIcon = document.getElementById('collapseIcon');

  toggleAddAddress.onclick = () => {
    const isHidden = addAddressContent.classList.contains('hidden');
    addAddressContent.classList.toggle('hidden');
    collapseIcon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
  };

  // Address Type Selection
  document.querySelectorAll('.addr-type-label').forEach(label => {
    label.onclick = () => {
      document.querySelectorAll('.addr-type-label').forEach(l => l.classList.remove('selected'));
      label.classList.add('selected');
      label.querySelector('input').checked = true;
    };
  });

  // Save new address to Firebase
  document.getElementById('btnSaveNewAddress').onclick = async () => {
    const name = document.getElementById('newAddressName').value.trim();
    const address = document.getElementById('newAddressFull').value.trim();
    const checkedRadio = document.querySelector('input[name="addressType"]:checked');
    const type = checkedRadio ? checkedRadio.value : 'personal';

    if (!name || !address) {
      alert('กรุณากรอกชื่อเรียกและที่อยู่ให้ครบถ้วน');
      return;
    }

    const btn = document.getElementById('btnSaveNewAddress');
    btn.textContent = 'กำลังบันทึก...';
    btn.disabled = true;

    try {
      const url = `${ADDR_PREFIX}${type}${EMAIL_SEPARATOR}${address}`;
      const { error } = await sb.from('links').insert([{ title: name, url, is_pinned: false }]);
      if (error) throw error;

      document.getElementById('newAddressName').value = '';
      document.getElementById('newAddressFull').value = '';
      
      // Clear search input and results
      document.getElementById('addressSearchInput').value = '';
      renderSearchResults(''); // Reset search results to empty
      document.getElementById('addressSearchResults').classList.add('hidden');
      
      showToast('บันทึกที่อยู่ใหม่แล้ว ✅');
    } catch (e) {
      alert('บันทึกไม่สำเร็จ: ' + e.message);
    } finally {
      btn.textContent = '💾 บันทึกที่อยู่';
      btn.disabled = false;
    }
  };

  // Delete Address Modal handlers
  document.getElementById('deleteAddressCancelBtn').onclick = () => {
    document.getElementById('deleteAddressModal').classList.add('hidden');
    addressIdToDelete = null;
  };

  document.getElementById('deleteAddressConfirmBtn').onclick = async () => {
    if (addressIdToDelete !== null) {
      try {
        const { error } = await sb.from('links').delete().eq('id', addressIdToDelete);
        if (error) throw error;
        showToast('ลบที่อยู่แล้ว 🗑️');
      } catch (e) {
        alert('ลบไม่สำเร็จ: ' + e.message);
      }
    }
    document.getElementById('deleteAddressModal').classList.add('hidden');
    addressIdToDelete = null;
  };

  // Smart Search Logic
  searchInput.addEventListener('focus', () => {
    if (allAddresses.length > 0) {
      renderSearchResults(searchInput.value);
      searchResults.classList.remove('hidden');
    }
  });

  searchInput.addEventListener('input', () => {
    renderSearchResults(searchInput.value);
    searchResults.classList.remove('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
      searchResults.classList.add('hidden');
    }
  });

  function renderSearchResults(query) {
    const personalItems = document.getElementById('search-items-personal');
    const customerItems = document.getElementById('search-items-customer');
    const noResults = document.getElementById('search-no-results');
    const q = query.toLowerCase().trim();

    personalItems.innerHTML = '';
    customerItems.innerHTML = '';

    const filtered = allAddresses.filter(item =>
      item.name.toLowerCase().includes(q) ||
      item.address.toLowerCase().includes(q)
    );

    let pCount = 0, cCount = 0;

    filtered.forEach(item => {
      const div = document.createElement('div');
      div.className = "p-3 hover:bg-bg-input rounded-lg cursor-pointer transition-colors border border-transparent hover:border-border";
      div.innerHTML = `
        <div class="font-heading text-sm">${escapeHTML(item.name)}</div>
        <div class="text-[10px] text-hint truncate">${escapeHTML(item.address)}</div>
      `;
      div.onclick = () => {
        inputArea.value = item.address;
        searchInput.value = item.name;
        searchResults.classList.add('hidden');
        showToast('โหลดที่อยู่แล้ว ✨');
      };

      if (item.type === 'customer') {
        customerItems.appendChild(div);
        cCount++;
      } else {
        personalItems.appendChild(div);
        pCount++;
      }
    });

    document.getElementById('search-group-personal').classList.toggle('hidden', pCount === 0);
    document.getElementById('search-group-customer').classList.toggle('hidden', cCount === 0);
    noResults.classList.toggle('hidden', filtered.length > 0);
  }

  // Paste button
  document.getElementById('btnPaste').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      inputArea.value = text;
      showToast('วางข้อมูลแล้ว');
    } catch (err) { alert('ไม่สามารถเข้าถึง Clipboard ได้'); }
  };

  // Clear button → show confirm modal
  document.getElementById('btnClear').onclick = () => {
    if (!inputArea.value.trim()) {
      showToast('ไม่มีข้อมูลให้ล้าง');
      return;
    }
    document.getElementById('clearConfirmModal').classList.remove('hidden');
  };

  // Clear Confirm Modal handlers
  document.getElementById('clearCancelBtn').onclick = () => {
    document.getElementById('clearConfirmModal').classList.add('hidden');
  };
  document.getElementById('clearConfirmBtn').onclick = () => {
    inputArea.value = '';
    document.getElementById('clearConfirmModal').classList.add('hidden');
    showToast('ล้างข้อมูลแล้ว');
  };

  // New Address: Paste button
  document.getElementById('btnPasteNewAddress').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      document.getElementById('newAddressFull').value = text;
      showToast('วางข้อมูลแล้ว');
    } catch (err) { alert('ไม่สามารถเข้าถึง Clipboard ได้'); }
  };

  // New Address: Clear button
  document.getElementById('btnClearNewAddress').onclick = () => {
    document.getElementById('newAddressName').value = '';
    document.getElementById('newAddressFull').value = '';
    document.querySelectorAll('.addr-type-label').forEach(l => l.classList.remove('selected'));
    document.getElementById('typePersonalLabel').classList.add('selected');
    document.getElementById('typePersonalRadio').checked = true;
    showToast('ล้างข้อมูลแล้ว');
  };
}

function renderAddressList(addresses) {
  const addressListContainer = document.getElementById('addressListContainer');
  addressListContainer.innerHTML = '';

  addresses.forEach((item) => {
    const div = document.createElement('div');
    div.className = "flex items-center justify-between p-3 bg-bg-input rounded-xl border border-border";
    div.innerHTML = `
      <div class="flex flex-col flex-1 min-w-0 mr-2">
        <span class="font-heading text-sm">${escapeHTML(item.name || 'ไม่มีชื่อ')} ${item.type === 'personal' ? '🏠' : '👥'}</span>
        <span class="text-[10px] text-hint truncate">${escapeHTML(item.address)}</span>
      </div>
      <div class="flex gap-1">
        <button class="edit-addr-btn flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-blue-50 transition-colors" data-id="${item.id}" title="แก้ไขที่อยู่นี้">
          <span class="text-blue-400 hover:text-blue-600 text-base">✏️</span>
        </button>
        <button class="del-addr-btn flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg hover:bg-rose-50 transition-colors" data-id="${item.id}" data-name="${escapeHTML(item.name)}" title="ลบที่อยู่นี้">
          <span class="text-rose-400 hover:text-rose-600 text-base">🗑️</span>
        </button>
      </div>
    `;

    const editBtn = div.querySelector('.edit-addr-btn');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        const addr = allAddresses.find(a => a.id == item.id);
        if (addr) {
          messageIdToEdit = addr.id;
          isEditingEmailMode = false;
          document.getElementById('editTitleInput').value = addr.name;
          document.getElementById('editEmailContainer').classList.add('hidden');
          document.getElementById('editMessageContainer').classList.add('hidden');
          document.getElementById('editAddressContainer').classList.remove('hidden');

          document.getElementById('editAddressFull').value = addr.address;
          const typeRadio = document.querySelector(`input[name="editAddressType"][value="${addr.type}"]`);
          if (typeRadio) {
            typeRadio.checked = true;
            document.querySelectorAll('.edit-addr-type-label').forEach(l => l.classList.remove('selected'));
            typeRadio.closest('.edit-addr-type-label').classList.add('selected');
          }

          document.getElementById('editModal').classList.remove('hidden');
        }
      });
    }

    const delBtn = div.querySelector('.del-addr-btn');
    if (delBtn) {
      delBtn.addEventListener('click', () => {
        const id = delBtn.dataset.id;
        const name = delBtn.dataset.name;
        document.getElementById('deleteAddressName').textContent = `"${name}"`;
        addressIdToDelete = id;
        document.getElementById('deleteAddressModal').classList.remove('hidden');
      });
    }

    addressListContainer.appendChild(div);
  });

  if (addresses.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = "text-center py-4 text-hint text-sm";
    emptyDiv.textContent = "ยังไม่มีที่อยู่ที่บันทึกไว้";
    addressListContainer.appendChild(emptyDiv);
  }
}

// =============================================
// --- GENERATE CAMOUFLAGE TEXT ---
// =============================================
(function () {
  const fakeChars = ["\u0E31", "\u0E34", "\u0E35", "\u0E36", "\u0E37", "\u0E38", "\u0E39", "\u0E47", "\u0E48", "\u0E49", "\u0E4A", "\u0E4B", "\u0E4C", "\u0E4D", "\u0E4E"];
  const invisibleChars = ["\u200B", "\u200C", "\u200D", "\uFEFF"];

  function insertFakeChars(text, count) {
    let chars = text.split('');
    for (let i = 0; i < count; i++) {
      const pos = Math.floor(Math.random() * chars.length);
      const fake = fakeChars[Math.floor(Math.random() * fakeChars.length)];
      chars.splice(pos, 0, fake);
    }
    return chars.join('');
  }

  function insertInvisibleChars(text, count) {
    let chars = text.split('');
    for (let i = 0; i < count; i++) {
      const pos = Math.floor(Math.random() * chars.length);
      const inv = invisibleChars[Math.floor(Math.random() * invisibleChars.length)];
      chars.splice(pos, 0, inv);
    }
    return chars.join('');
  }

  function insertExtraSpaces(text, count) {
    let chars = text.split('');
    for (let i = 0; i < count; i++) {
      const pos = Math.floor(Math.random() * chars.length);
      chars.splice(pos, 0, ' ');
    }
    return chars.join('');
  }

  function generateCamouflage() {
    const inputText = document.getElementById('inputArea').value.trim();
    if (!inputText) {
      showToast('กรุณากรอกข้อความก่อน ✨');
      return;
    }

    const useFake = document.getElementById('checkFake').checked;
    const useInvisible = document.getElementById('checkInvisible').checked;
    const useSpace = document.getElementById('checkSpace').checked;
    const numFake = parseInt(document.getElementById('numFake').value) || 3;
    const numInvisible = parseInt(document.getElementById('numInvisible').value) || 5;
    const numSpace = parseInt(document.getElementById('numSpace').value) || 2;

    const results = [];
    for (let v = 0; v < 3; v++) {
      let text = inputText;
      if (useFake) text = insertFakeChars(text, numFake);
      if (useInvisible) text = insertInvisibleChars(text, numInvisible);
      if (useSpace) text = insertExtraSpaces(text, numSpace);
      results.push(text);
    }

    const resultList = document.getElementById('resultList');
    resultList.innerHTML = '';
    const badges = ['🎲', '🎭', '🎨'];
    results.forEach((res, idx) => {
      const div = document.createElement('div');
      div.style.cssText = 'background:white; border:1px solid var(--border); border-radius:20px; padding:16px; transition: box-shadow 0.2s ease, border-color 0.2s ease;';
      div.onmouseover = () => { div.style.boxShadow = '0 4px 20px rgba(37,99,235,0.1)'; div.style.borderColor = '#93c5fd'; };
      div.onmouseout  = () => { div.style.boxShadow = 'none'; div.style.borderColor = 'var(--border)'; };
      div.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="background:linear-gradient(135deg,#2563eb,#0ea5e9); color:white; width:28px; height:28px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">${badges[idx] || '✨'}</span>
            <span class="font-heading" style="color:#0f172a; font-size:0.9rem;">รูปแบบที่ ${idx + 1}</span>
          </div>
        </div>
        <p style="color:#334155; font-family:'JetBrains Mono',monospace; font-size:0.82rem; line-height:1.85; white-space:pre-wrap; word-break:break-all; background:#f8fafc; padding:12px; border-radius:12px; margin-bottom:12px;">${escapeHTML(res)}</p>
        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button class="copy-result-btn" style="flex:1; min-width:120px; padding:10px 14px; border-radius:12px; border:none; background:linear-gradient(135deg,#2563eb,#0ea5e9); color:white; font-weight:600; font-size:0.8rem; cursor:pointer; font-family:'Kanit',sans-serif; transition:all 0.2s ease; display:flex; align-items:center; justify-content:center; gap:6px;">📋 คัดลอก</button>
          <button class="copy-to-board-btn" style="flex:1; min-width:120px; padding:10px 14px; border-radius:12px; border:none; background:linear-gradient(135deg,#10b981,#059669); color:white; font-weight:600; font-size:0.8rem; cursor:pointer; font-family:'Kanit',sans-serif; transition:all 0.2s ease; display:flex; align-items:center; justify-content:center; gap:6px;">📋 คัดลอก + ส่งไปบอร์ด</button>
        </div>
      `;
      // ปุ่มคัดลอกธรรมดา
      div.querySelector('.copy-result-btn').onclick = (e) => copyTextToClipboard(res, e.target);
      // ปุ่มคัดลอก + ส่งไปบอร์ด
      div.querySelector('.copy-to-board-btn').onclick = async (e) => {
        try {
          await navigator.clipboard.writeText(res);
          const boardInput = document.getElementById('boardMessageInput');
          boardInput.value = res;
          document.getElementById('resultModal').classList.add('hidden');
          document.querySelectorAll('.tab-item').forEach(b => b.classList.remove('active'));
          const boardTab = document.querySelector('.tab-item[data-tab="board"]');
          if (boardTab) boardTab.classList.add('active');
          ['camouflage', 'board', 'email'].forEach(t => {
            document.getElementById(t + '-tab').classList.toggle('hidden', t !== 'board');
          });
          boardInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
          boardInput.focus();
          showToast('คัดลอกและส่งไปบอร์ดแล้ว ✨');
        } catch (err) {
          alert('ไม่สามารถคัดลอกได้');
        }
      };
      // Hover effect ปุ่ม
      div.querySelectorAll('button').forEach(b => {
        b.onmouseover = () => { b.style.transform = 'translateY(-1px)'; b.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)'; };
        b.onmouseout  = () => { b.style.transform = 'translateY(0)'; b.style.boxShadow = 'none'; };
      });
      resultList.appendChild(div);
    });

    document.getElementById('resultModal').classList.remove('hidden');
    // Auto-clear input after successful generation
    document.getElementById('inputArea').value = '';
  }

  document.getElementById('btnGenerate').addEventListener('click', generateCamouflage);
  document.getElementById('closeResultBtn').addEventListener('click', () => {
    document.getElementById('resultModal').classList.add('hidden');
  });
  document.getElementById('resultModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('resultModal')) {
      document.getElementById('resultModal').classList.add('hidden');
    }
  });
})();

// =============================================
// --- REALTIME & DATA LOADING ---
// =============================================
async function loadData() {
  try {
    const { data, error } = await sb.from('links').select('*').order('created_at', { ascending: true });
    
    if (error) {
      console.error('Database error:', error);
      showToast('❌ ไม่สามารถโหลดข้อมูลได้');
      return;
    }

    if (!data) {
      console.error('No data returned from database');
      showToast('❌ ไม่มีข้อมูลที่ได้รับ');
      return;
    }

    const emails = [];
    const messages = [];
    const addresses = [];

    data.forEach(row => {
      const item = {
        id: row.id,
        title: row.title || '',
        rawUrl: row.url || '',
        isPinned: !!row.is_pinned,
        created_at: row.created_at
      };

      if (item.rawUrl.startsWith(EMAIL_PREFIX)) {
        const content = item.rawUrl.replace(EMAIL_PREFIX, '');
        const parts = content.split(EMAIL_SEPARATOR);
        item.email = parts[0] || '';
        item.password = parts[1] || '';
        item.status = parts[3] || '0';
        item.confirmReceived = parts[5] === '1';
        // เลขพัสดุเก็บใน parts[6] คั่นด้วย PARCEL_SEPARATOR
        const parcelRaw = parts[6] || '';
        item.parcels = parcelRaw ? parcelRaw.split(PARCEL_SEPARATOR).filter(p => p.trim()) : [];
        item.hasParcel = item.parcels.length > 0;
        emails.push(item);
      } else if (item.rawUrl.startsWith(QUICKNOTE_PREFIX)) {
        // Quick Note
        quickNoteId = item.id;
        quickNoteText = item.rawUrl.replace(QUICKNOTE_PREFIX, '');
        renderQuickNote(quickNoteText);
      } else if (item.rawUrl.startsWith(ADDR_PREFIX)) {
        const content = item.rawUrl.replace(ADDR_PREFIX, '');
        const parts = content.split(EMAIL_SEPARATOR);
        item.type = parts[0] || 'personal';
        item.address = parts[1] || '';
        item.name = item.title; // ใช้ title จากฐานข้อมูลเป็นชื่อเรียก
        addresses.push(item);
      } else {
        if (item.rawUrl.includes('\n|||EXTRA|||\n')) {
          const parts = item.rawUrl.split('\n|||EXTRA|||\n');
          item.text = parts[0];
          item.extra = parts[1];
        } else {
          item.text = item.rawUrl;
          item.extra = '';
        }
        messages.push(item);
      }
    });

    currentEmailsList = emails;
    allMessagesList = messages;
    // ไม่รีเซ็ต displayCount เมื่อ Realtime update เพื่อรักษาสถานะ Load More
    if (emailDisplayCount < 10) emailDisplayCount = 10;
    if (boardDisplayCount < 10) boardDisplayCount = 10;
    renderMessages(messages);
    renderEmails(emails);
    // เรียงที่อยู่แบบต่อท้าย (Oldest First) ตามความต้องการของผู้ใช้
    const sortedAddresses = [...addresses].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    allAddresses = sortedAddresses; // เก็บข้อมูลที่อยู่ทั้งหมดเพื่อใช้ค้นหา
    renderAddressList(sortedAddresses);
  } catch (err) {
    console.error('Exception loading data:', err);
    showToast('❌ เกิดข้อผิดพลาดในการโหลด');
  }
}

function isLikelyUrl(str) {
  if (str.includes(' ')) return false;
  if (/^https?:\/\//i.test(str)) return true;
  if (/^www\./i.test(str)) return true;
  if (/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}(\/.*)?$/.test(str)) return true;
  return false;
}

function renderExtraContent(extra) {
  if (!extra) return '';
  const lines = extra.split('\n').filter(l => l.trim());
  let content = '<div class="space-y-2">';
  lines.forEach(line => {
    const trimmed = line.trim();
    if (isLikelyUrl(trimmed)) {
      const safeText = escapeHTML(trimmed);
      content += `<div>${safeText}</div>`;
    } else {
      const safeCode = escapeHTML(trimmed);
      content += `<div><button class="btn-copy-extra text-left text-accent hover:text-primary transition-colors break-all text-xs py-1 px-2 rounded" data-code="${safeCode}">📋 ${safeCode}</button></div>`;
    }
  });
  content += '</div>';
  return content;
}

function renderMessages(messages) {
  const container = document.getElementById('board-container');
  container.innerHTML = '';
  if (messages.length === 0) {
    container.innerHTML = '<p class="text-center text-hint col-span-2 py-8">ยังไม่มีข้อความ</p>';
    return;
  }

  // เรียงลำดับ: ปักหมุดขึ้นก่อน (Pinned First)
  // ถ้าสถานะปักหมุดเหมือนกัน ให้เรียงตามเวลาล่าสุด (Newest First)
  const sortedMessages = [...messages].sort((a, b) => {
    if (a.isPinned === b.isPinned) {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    return a.isPinned ? -1 : 1;
  });

  currentMessagesList = sortedMessages;
  const displayMessages = sortedMessages.slice(0, boardDisplayCount);
  displayMessages.forEach(msg => {
    const div = document.createElement('div');
    div.className = `card-premium ${msg.isPinned ? 'pinned-message' : ''}`;
    div.innerHTML = `
      <div class="flex justify-between items-start mb-3">
        <h4 class="font-heading text-primary">${escapeHTML(msg.title || 'ไม่มีหัวข้อ')}</h4>
        <div class="flex gap-2">
          <button class="text-hint hover:text-primary edit-btn transition-colors">✏️</button>
          <button class="text-hint hover:text-rose-500 del-btn transition-colors">🗑️</button>
        </div>
      </div>
      <p class="text-sm mb-4 whitespace-pre-wrap">${escapeHTML(msg.text)}</p>
      ${msg.extra ? `<div class="text-xs text-hint bg-bg-input p-3 rounded-lg mb-4 break-all">${renderExtraContent(msg.extra)}</div>` : ''}
      <div class="flex gap-2">
        <button class="btn-base btn-secondary py-2 text-xs copy-btn">📋 คัดลอก</button>
        <button class="btn-base btn-secondary py-2 text-xs pin-btn">${msg.isPinned ? '📌 เลิกปักหมุด' : '📌 ปักหมุด'}</button>
      </div>
    `;
    div.querySelector('.copy-btn').onclick = (e) => copyTextToClipboard(msg.text, e.target);
    div.querySelector('.pin-btn').onclick = () => togglePin(msg.id, msg.isPinned);
    div.querySelector('.del-btn').onclick = () => { messageIdToDelete = msg.id; document.getElementById('confirmModal').classList.remove('hidden'); };
    div.querySelector('.edit-btn').onclick = () => openEditModal(msg.id, msg.title, msg.text, false, '', '', '0', msg.extra);
    const copyBtns = div.querySelectorAll('.btn-copy-extra');
    copyBtns.forEach(btn => {
      btn.onclick = (e) => {
        const code = btn.dataset.code;
        copyTextToClipboard(code, btn);
      };
    });
    container.appendChild(div);
  });
  updateLoadMoreButtons();
}

function renderEmails(emails) {
  // Null check: ถ้า emails ไม่ได้รับค่า ให้ใช้ currentEmailsList แทน
  if (!emails || !Array.isArray(emails)) {
    emails = currentEmailsList;
  }
  
  const container = document.getElementById('email-container');
  if (!container) {
    console.error('Email container not found');
    return;
  }
  
  container.innerHTML = '';
  const filterPending = document.getElementById('filterPendingCheckbox').checked;
  const searchTerm = document.getElementById('searchEmailInput').value.toLowerCase();
  const dateSearch = document.getElementById('searchDateInput').value.trim();
  const selectedMonth = parseInt(document.getElementById('searchMonthSelect').value);
  const currentYear = new Date().getFullYear();

  const filtered = emails.filter(mail => {
    const createdDate = new Date(mail.created_at);
    const matchesSearch = mail.title.toLowerCase().includes(searchTerm) || mail.email.toLowerCase().includes(searchTerm);
    const matchesPending = filterPending ? (mail.hasParcel && !mail.confirmReceived) : true;

    // กรองตามเดือนและปีปัจจุบัน (เพื่อไม่ให้ข้อมูลปีเก่ามาปน)
    const matchesMonth = createdDate.getMonth() === selectedMonth && createdDate.getFullYear() === currentYear;

    let matchesDate = true;
    if (dateSearch) {
      const day = createdDate.getDate();
      if (dateSearch.includes('-')) {
        const [start, end] = dateSearch.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start) && !isNaN(end)) {
          matchesDate = (day >= start && day <= end);
        }
      } else {
        const targetDay = parseInt(dateSearch);
        if (!isNaN(targetDay)) {
          matchesDate = (day === targetDay);
        }
      }
    }

    return matchesSearch && matchesPending && matchesMonth && matchesDate;
  });

  if (filtered.length === 0) {
    container.innerHTML = '<p class="text-center text-hint col-span-2 py-8">ไม่พบข้อมูลอีเมล</p>';
    return;
  }

  // เรียงลำดับตามค่า emailSortOrder
  const sortedFiltered = [...filtered].sort((a, b) => {
    const dateA = new Date(a.created_at);
    const dateB = new Date(b.created_at);
    return emailSortOrder === 'newest' ? (dateB - dateA) : (dateA - dateB);
  });

  // เก็บรายการที่กรองแล้วไว้ใช้กับ Load More
  const allFiltered = sortedFiltered;
  lastFilteredEmailCount = allFiltered.length;
  const displayEmails = allFiltered.slice(0, emailDisplayCount);
  displayEmails.forEach(mail => {
    const div = document.createElement('div');
    let statusClass = mail.status === '2' ? 'email-status-good' : (mail.status === '1' ? 'email-status-warning' : 'email-status-expired');
    div.className = `card-premium ${statusClass}`;
    div.innerHTML = `
      <div class="flex justify-between items-start mb-4">
        <div>
          <h4 class="font-heading">${escapeHTML(mail.title)}</h4>
          <span class="text-[10px] text-hint">${mail.status === '2' ? '✅ ใช้งานแล้ว' : (mail.status === '1' ? '⏱️ รอใช้งาน' : '❌ ไม่ได้ใช้')}</span>
        </div>
        <div class="flex gap-2">
          <button class="text-hint hover:text-primary edit-btn transition-colors">✏️</button>
          <button class="text-hint hover:text-rose-500 del-btn transition-colors">🗑️</button>
        </div>
      </div>
      <div class="space-y-2 mb-4">
        <div class="bg-bg-input p-2 rounded-lg text-xs font-mono truncate">${escapeHTML(mail.email)}</div>
        <div class="bg-bg-input p-2 rounded-lg text-xs font-mono flex justify-between items-center">
          <span class="pass-text">••••••••</span>
          <button class="text-[10px] text-primary toggle-pass">👁️</button>
        </div>
      </div>
      <div class="flex gap-2 mb-4">
        <button class="btn-base btn-secondary py-2 text-xs copy-email-btn">📧 เมล</button>
        <button class="btn-base btn-secondary py-2 text-xs copy-pass-btn">🔑 รหัส</button>
      </div>
      <div class="flex flex-wrap gap-2 pt-4 border-t border-border/50">
        <button class="checkbox-icon parcel-open-btn ${mail.hasParcel ? 'checked-confirm' : ''}" data-email-id="${mail.id}">
          <span>📦 เลขพัสดุ${mail.parcels && mail.parcels.length > 0 ? ` <span style="font-size:0.75rem;opacity:0.85;">(${mail.parcels.length}/3)</span>` : ''}</span>
        </button>
        <button class="checkbox-icon conf-btn ${mail.confirmReceived ? 'checked-confirm' : ''}">
          <span>🤝 ยืนยัน</span>
        </button>
      </div>
      <div class="email-timestamp text-hint text-xs mt-3 text-right">${formatTimeAgo(mail.created_at)}</div>
    `;
    div.querySelector('.copy-email-btn').onclick = (e) => copyTextToClipboard(mail.email, e.target);
    div.querySelector('.copy-pass-btn').onclick = (e) => copyTextToClipboard(mail.password, e.target);
    div.querySelector('.del-btn').onclick = () => { messageIdToDelete = mail.id; document.getElementById('confirmModal').classList.remove('hidden'); };
    div.querySelector('.edit-btn').onclick = () => openEditModal(mail.id, mail.title, '', true, mail.email, mail.password, mail.status, '', mail.confirmReceived);
    const passText = div.querySelector('.pass-text');
    div.querySelector('.toggle-pass').onclick = (e) => {
      const isHidden = passText.textContent === '••••••••';
      passText.textContent = isHidden ? mail.password : '••••••••';
      e.target.textContent = isHidden ? '🙈' : '👁️';
    };
    const parcelBtn = div.querySelector('.parcel-open-btn');
    const confBtn = div.querySelector('.conf-btn');
    if (parcelBtn) parcelBtn.onclick = (e) => { e.preventDefault(); openParcelModal(mail.id); };
    if (confBtn) confBtn.onclick = async (e) => {
      e.preventDefault();
      const ns = !mail.confirmReceived;
      try {
        mail.confirmReceived = ns;
        const newUrl = buildEmailUrl(mail, mail.parcels || []);
        const { error } = await sb.from('links').update({ url: newUrl }).eq('id', mail.id);
        if (error) throw error;
        mail.rawUrl = newUrl;
        confBtn.classList.toggle('checked-confirm', ns);
        showToast(ns ? '✅ ยืนยันแล้ว' : '↩ ยกเลิกแล้ว');
      } catch (err) {
        mail.confirmReceived = !ns; // rollback
        alert('เกิดข้อผิดพลาด: ' + (err.message || err));
      }
    };
    container.appendChild(div);
  });
  updateLoadMoreButtons();
}

async function togglePin(id, current) {
  try { await sb.from('links').update({ is_pinned: !current }).eq('id', id); } catch (e) { alert('Error'); }
}

document.getElementById('modalCancelBtn').onclick = () => {
  document.getElementById('confirmModal').classList.add('hidden');
  messageIdToDelete = null;
};
document.getElementById('modalConfirmBtn').onclick = async () => {
  if (messageIdToDelete) {
    try { await sb.from('links').delete().eq('id', messageIdToDelete); showToast('ลบข้อมูลแล้ว 🗑️'); } catch (e) { alert('ลบไม่สำเร็จ'); }
  }
  document.getElementById('confirmModal').classList.add('hidden');
  messageIdToDelete = null;
};

document.getElementById('quickPasteEmailBtn').onclick = async () => {
  try {
    const input = await navigator.clipboard.readText();
    if (!input.trim()) { alert('Clipboard ว่างเปล่า'); return; }
    const parts = input.trim().split('|');
    if (parts.length < 2) { alert('รูปแบบต้องเป็น email|password'); return; }
    const email = parts[0].trim();
    const password = parts[1].trim();
    const title = email.split('@')[0] || email;
    const url = `${EMAIL_PREFIX}${email}${EMAIL_SEPARATOR}${password}${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}1${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}`;
    const btn = document.getElementById('quickPasteEmailBtn');
    btn.textContent = 'กำลังบันทึก...';
    try {
      const { error } = await sb.from('links').insert([{ title, url, is_pinned: false }]);
      if (error) throw error;
      showToast('บันทึกบัญชีแล้ว ✅');
    } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
    finally { btn.textContent = '📋 วางด่วน'; }
  } catch (err) { alert('ไม่สามารถเข้าถึง Clipboard ได้'); }
};

document.getElementById('quickPasteBoardBtn').onclick = async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (!text.trim()) {
      showToast('Clipboard ว่างเปล่า 📋');
      return;
    }

    // จัดระเบียบข้อความ: ลบบรรทัดว่างที่ซ้ำซ้อน และรักษาตัวอักษรให้ครบถ้วน
    const cleanedText = text.split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .join('\n');

    // วางข้อมูลลงในช่อง "ลิ้งค์ หรือ โค้ดเพิ่มเติม" (ช่องล่างสุด) - เปลี่ยนเป็นแบบต่อท้าย (Append)
    const currentVal = document.getElementById('boardExtraInput').value.trim();
    if (currentVal) {
      document.getElementById('boardExtraInput').value = currentVal + '\n' + cleanedText;
    } else {
      document.getElementById('boardExtraInput').value = cleanedText;
    }
    showToast('วางและต่อท้ายข้อความแล้ว ✨');
  } catch (err) {
    alert('ไม่สามารถเข้าถึง Clipboard ได้');
  }
};

document.getElementById('saveBoardBtn').onclick = async () => {
  const title = document.getElementById('boardTitleInput').value.trim();
  const text = document.getElementById('boardMessageInput').value.trim();
  const extra = document.getElementById('boardExtraInput').value.trim();
  if (!text && !extra) { alert('กรุณาพิมพ์ข้อความก่อน'); return; }
  let url = text;
  if (extra) url = text + '\n|||EXTRA|||\n' + extra;
  const btn = document.getElementById('saveBoardBtn');
  btn.textContent = 'กำลังบันทึก...';
  try {
    const { error } = await sb.from('links').insert([{ title: title || '', url, is_pinned: false }]);
    if (error) throw error;
    document.getElementById('boardTitleInput').value = '';
    document.getElementById('boardMessageInput').value = '';
    document.getElementById('boardExtraInput').value = '';
    showToast('บันทึกข้อความแล้ว ✅');
  } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
  finally { btn.textContent = '💾 บันทึกข้อความ'; }
};

document.getElementById('saveEmailBtn').onclick = async () => {
  const title = document.getElementById('emailTitleInput').value.trim();
  const email = document.getElementById('emailFieldInput').value.trim();
  const password = document.getElementById('passwordFieldInput').value.trim();
  if (!email || !password) { alert('กรุณากรอกอีเมลและรหัสผ่าน'); return; }
  const finalTitle = title || email.split('@')[0];
  const url = `${EMAIL_PREFIX}${email}${EMAIL_SEPARATOR}${password}${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}1${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}`;
  const btn = document.getElementById('saveEmailBtn');
  btn.textContent = 'กำลังบันทึก...';
  try {
    const { error } = await sb.from('links').insert([{ title: finalTitle, url, is_pinned: false }]);
    if (error) throw error;
    document.getElementById('emailTitleInput').value = '';
    document.getElementById('emailFieldInput').value = '';
    document.getElementById('passwordFieldInput').value = '';
    showToast('บันทึกบัญชีแล้ว ✅');
  } catch (e) { alert('บันทึกไม่สำเร็จ: ' + e.message); }
  finally { btn.textContent = '💾 บันทึกบัญชี'; }
};

document.getElementById('filterPendingCheckbox').onchange = () => {
  emailDisplayCount = 10;
  renderEmails(currentEmailsList);
};
document.getElementById('searchEmailInput').oninput = () => {
  emailDisplayCount = 10;
  renderEmails(currentEmailsList);
};
document.getElementById('searchDateInput').oninput = () => {
  emailDisplayCount = 10;
  renderEmails(currentEmailsList);
};
document.getElementById('searchMonthSelect').onchange = () => {
  emailDisplayCount = 10;
  renderEmails(currentEmailsList);
};

// Sort Buttons
document.getElementById('sortOldestBtn').onclick = () => {
  emailSortOrder = 'oldest';
  emailDisplayCount = 10;
  renderEmails(currentEmailsList);
  // อัปเดตสไตล์ปุ่ม
  document.getElementById('sortOldestBtn').className = 'btn-base btn-primary py-1 px-3 text-xs w-auto flex-1';
  document.getElementById('sortNewestBtn').className = 'btn-base btn-secondary py-1 px-3 text-xs w-auto flex-1';
};

document.getElementById('sortNewestBtn').onclick = () => {
  emailSortOrder = 'newest';
  emailDisplayCount = 10;
  renderEmails(currentEmailsList);
  // อัปเดตสไตล์ปุ่ม
  document.getElementById('sortNewestBtn').className = 'btn-base btn-primary py-1 px-3 text-xs w-auto flex-1';
  document.getElementById('sortOldestBtn').className = 'btn-base btn-secondary py-1 px-3 text-xs w-auto flex-1';
};

// ตั้งค่าเดือนปัจจุบันเป็นค่าเริ่มต้น
document.getElementById('searchMonthSelect').value = new Date().getMonth();

document.getElementById('searchBoardInput').oninput = () => {
  const searchTerm = document.getElementById('searchBoardInput').value.toLowerCase();
  const filtered = allMessagesList.filter(msg => (msg.title || '').toLowerCase().includes(searchTerm) || (msg.text || '').toLowerCase().includes(searchTerm));
  boardDisplayCount = 10;
  renderMessages(filtered);
};

document.getElementById('clearFilterBtn').onclick = () => {
  document.getElementById('searchEmailInput').value = '';
  document.getElementById('searchBoardInput').value = '';
  document.getElementById('searchDateInput').value = '';
  document.getElementById('searchMonthSelect').value = new Date().getMonth();
  document.getElementById('filterPendingCheckbox').checked = false;
  emailDisplayCount = 10;
  boardDisplayCount = 10;
  renderEmails(currentEmailsList);
  renderMessages(allMessagesList);
};

let lastFilteredEmailCount = 0; // เก็บจำนวน filtered emails ล่าสุด

function updateLoadMoreButtons() {
  const emailContainer = document.getElementById('email-container');
  const boardContainer = document.getElementById('board-container');
  document.querySelectorAll('.load-more-btn').forEach(btn => btn.remove());
  if (lastFilteredEmailCount > emailDisplayCount) {
    const btn = document.createElement('button');
    btn.className = 'load-more-btn btn-base btn-secondary col-span-1 md:col-span-2 py-3 mt-4';
    btn.textContent = '📥 ดูเพิ่มเติม';
    btn.onclick = () => { emailDisplayCount += 5; renderEmails(currentEmailsList); };
    emailContainer.parentElement.appendChild(btn);
  }
  if (currentMessagesList.length > boardDisplayCount) {
    const btn = document.createElement('button');
    btn.className = 'load-more-btn btn-base btn-secondary col-span-1 md:col-span-2 py-3 mt-4';
    btn.textContent = '📥 ดูเพิ่มเติม';
    btn.onclick = () => { boardDisplayCount += 5; renderMessages(currentMessagesList); };
    boardContainer.parentElement.appendChild(btn);
  }
}

function openEditModal(id, currentTitle, currentText, isEmail = false, emailVal = '', passVal = '', currentStatus = '0', extraText = '', confirmReceived = false) {
  messageIdToEdit = id;
  isEditingEmailMode = isEmail;
  document.getElementById('editTitleInput').value = currentTitle || '';
  // ซ่อนทุก container ก่อน
  document.getElementById('editMessageContainer').classList.add('hidden');
  document.getElementById('editEmailContainer').classList.add('hidden');
  document.getElementById('editAddressContainer').classList.add('hidden');
  if (isEmail) {
    document.getElementById('editEmailContainer').classList.remove('hidden');
    document.getElementById('editEmailField').value = emailVal || '';
    document.getElementById('editPasswordField').value = passVal || '';
    document.querySelectorAll('input[name="edit-email-status"]').forEach(r => { r.checked = (r.value === currentStatus); });
    const confCb = document.getElementById('edit-confirm-checkbox');
    confCb.checked = !!confirmReceived;
    document.getElementById('edit-confirm-label').classList.toggle('checked-confirm', !!confirmReceived);
  } else {
    document.getElementById('editMessageContainer').classList.remove('hidden');
    document.getElementById('editEmailContainer').classList.add('hidden');
    document.getElementById('editMessageInput').value = currentText || '';
    document.getElementById('editExtraMessageInput').value = extraText || '';
  }
  document.getElementById('editModal').classList.remove('hidden');
}

document.getElementById('editCancelBtn').onclick = () => {
  document.getElementById('editModal').classList.add('hidden');
  messageIdToEdit = null;
  isEditingQuickNoteMode = false;
  isEditingEmailMode = false;
};

document.getElementById('editSaveBtn').onclick = async () => {
  if (!messageIdToEdit) return;
  
  // ตรวจสอบว่าเป็นการแก้ไข Quick Note หรือไม่
  if (isEditingQuickNoteMode) {
    const text = document.getElementById('editQuickNoteInput').value;
    await saveQuickNote(text);
    document.getElementById('editModal').classList.add('hidden');
    messageIdToEdit = null;
    isEditingQuickNoteMode = false;
    return;
  }
  
  const newTitle = document.getElementById('editTitleInput').value;
  let newUrl = '';

  const isAddressMode = !document.getElementById('editAddressContainer').classList.contains('hidden');

  if (isAddressMode) {
    const address = document.getElementById('editAddressFull').value.trim();
    const checkedRadio = document.querySelector('input[name="editAddressType"]:checked');
    const type = checkedRadio ? checkedRadio.value : 'personal';
    if (!newTitle || !address) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }
    newUrl = `${ADDR_PREFIX}${type}${EMAIL_SEPARATOR}${address}`;
  } else if (isEditingEmailMode) {
    const e = document.getElementById('editEmailField').value.trim();
    const p = document.getElementById('editPasswordField').value.trim();
    const statusRadio = document.querySelector('input[name="edit-email-status"]:checked');
    const s = statusRadio ? statusRadio.value : '0';
    const conf = document.getElementById('edit-confirm-checkbox').checked ? '1' : '0';
    if (!e || !p) { alert('กรุณากรอกข้อมูลให้ครบ'); return; }
    // รักษา parcels เดิมไว้ ไม่ลบทิ้งเมื่อ edit
    const existingMail = currentEmailsList.find(m => m.id == messageIdToEdit);
    const existingParcels = existingMail ? existingMail.parcels : [];
    const parcelStr = existingParcels.length > 0 ? existingParcels.join(PARCEL_SEPARATOR) : '';
    newUrl = `${EMAIL_PREFIX}${e}${EMAIL_SEPARATOR}${p}${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}${s}${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}${conf}${EMAIL_SEPARATOR}${parcelStr}`;
  } else {
    const t = document.getElementById('editMessageInput').value;
    const xt = document.getElementById('editExtraMessageInput').value;
    if (!t.trim() && !xt.trim()) { alert('กรุณาใส่ข้อความหรือลิ้งค์'); return; }
    newUrl = t;
    if (xt && xt.trim()) newUrl = t + '\n|||EXTRA|||\n' + xt.trim();
  }

  const btn = document.getElementById('editSaveBtn');
  const originalText = btn.textContent;
  btn.textContent = 'กำลังบันทึก...';
  try {
    const { error } = await sb.from('links').update({ title: newTitle, url: newUrl }).eq('id', messageIdToEdit);
    if (error) throw error;
    showToast('แก้ไขเรียบร้อย ✅');
    document.getElementById('editModal').classList.add('hidden');
    messageIdToEdit = null;
  } catch (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); }
  finally { btn.textContent = originalText; }
};

document.getElementById('edit-confirm-label').addEventListener('click', () => {
  const cb = document.getElementById('edit-confirm-checkbox');
  const label = document.getElementById('edit-confirm-label');
  setTimeout(() => { 
    label.classList.toggle('checked-confirm', cb.checked);
    
    // Auto-set status to '2' (green/success) when confirm is checked
    if (cb.checked) {
      const statusRadio = document.querySelector('input[name="edit-email-status"][value="2"]');
      if (statusRadio) {
        statusRadio.checked = true;
      }
    }
  }, 0);
});

document.querySelectorAll('.edit-addr-type-label').forEach(label => {
  label.onclick = () => {
    document.querySelectorAll('.edit-addr-type-label').forEach(l => l.classList.remove('selected'));
    label.classList.add('selected');
    label.querySelector('input').checked = true;
  };
});

// =============================================
// --- UTILITIES ---
// =============================================
window.adjustValue = function (id, delta) {
  const input = document.getElementById(id);
  let val = parseInt(input.value) || 0;
  val += delta;
  const min = parseInt(input.min) || 0;
  const max = parseInt(input.max) || 100;
  if (val < min) val = min;
  if (val > max) val = max;
  input.value = val;
};

// Randomize values for camouflage settings
window.randomizeValues = function () {
  // numFake: ต่ำสุด 4, สูงสุด 15
  const randomFake = Math.floor(Math.random() * (15 - 4 + 1)) + 4;
  document.getElementById('numFake').value = randomFake;
  
  // numInvisible: ต่ำสุด 5, สูงสุด 15
  const randomInvisible = Math.floor(Math.random() * (15 - 5 + 1)) + 5;
  document.getElementById('numInvisible').value = randomInvisible;
  
  // numSpace: ต่ำสุด 2, สูงสุด 6
  const randomSpace = Math.floor(Math.random() * (6 - 2 + 1)) + 2;
  document.getElementById('numSpace').value = randomSpace;
  
  showToast('🎲 สุ่มค่าใหม่แล้ว!');
};

// =============================================
// --- PARCEL MANAGEMENT SYSTEM (inline in links.url) ---
// Format: vault://email|::|pass|::|0|::|status|::|0|::|confirm|::|parcel1⊕⊕⊕parcel2⊕⊕⊕parcel3
// =============================================
let currentParcelEmailId = null;

function openParcelModal(emailId) {
  currentParcelEmailId = emailId;
  const modal = document.getElementById('parcelModal');
  modal.classList.add('active');
  renderParcelList();
}

function closeParcelModal() {
  const modal = document.getElementById('parcelModal');
  modal.classList.remove('active');
  currentParcelEmailId = null;
}

// ดึงข้อมูล email จาก currentEmailsList
function getCurrentMailData() {
  return currentEmailsList.find(m => m.id == currentParcelEmailId);
}

function buildEmailUrl(mail, newParcels) {
  const parcelStr = newParcels.length > 0 ? newParcels.join(PARCEL_SEPARATOR) : '';
  // อัปเดตสถานะอัตโนมัติ: ถ้ามีเลขพัสดุให้เป็น '2' (ใช้งานแล้ว), ถ้าไม่มีให้เป็น '1' (รอใช้งาน)
  const newStatus = newParcels.length > 0 ? '2' : '1';
  mail.status = newStatus;
  return `${EMAIL_PREFIX}${mail.email}${EMAIL_SEPARATOR}${mail.password}${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}${newStatus}${EMAIL_SEPARATOR}0${EMAIL_SEPARATOR}${mail.confirmReceived ? '1' : '0'}${EMAIL_SEPARATOR}${parcelStr}`;
}

// บันทึก parcels ลงฐานข้อมูล (คงชื่อเดิมเพื่อไม่กระทบจุดเรียกใช้)
async function saveParcelsToSupabase(mail, newParcels) {
  try {
    if (!mail || !mail.id) {
      console.error('Invalid mail object:', mail);
      alert('ข้อมูลอีเมลไม่ถูกต้อง');
      return;
    }
    
    const newUrl = buildEmailUrl(mail, newParcels);
    const { error } = await sb.from('links').update({ url: newUrl }).eq('id', mail.id);
    
    if (error) {
      console.error('Error updating database:', error);
      alert('เกิดข้อผิดพลาดในการบันทึกข้อมูลพัสดุ');
      return;
    }
    
    mail.parcels = newParcels;
    mail.hasParcel = newParcels.length > 0;
    mail.status = newParcels.length > 0 ? '2' : '1';
    mail.rawUrl = newUrl;

    renderEmails(currentEmailsList);
  } catch (err) {
    console.error('Unexpected database error:', err);
    alert('เกิดข้อผิดพลาดไม่คาดหมาย');
  }
}

function renderParcelList() {
  const container = document.getElementById("parcelListContainer");
  const mail = getCurrentMailData();
  const parcels = mail ? mail.parcels : [];

  if (!parcels || parcels.length === 0) {
    container.innerHTML = '<div class="parcel-item-empty">ยังไม่มีเลขพัสดุ</div>';
    return;
  }

  container.innerHTML = parcels.map((parcel, idx) => `
    <div class="parcel-item">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
        <span style="font-weight: 600; color: #0f172a;">ชุดที่ ${idx + 1}</span>
        <button class="parcel-del-btn" data-idx="${idx}" style="background:none;border:none;cursor:pointer;color:#ef4444;font-size:0.85rem;padding:2px 6px;border-radius:6px;" title="ลบ">🗑</button>
      </div>
      <div style="white-space:pre-wrap;">${escapeHTML(parcel)}</div>
    </div>
  `).join('');

  container.querySelectorAll('.parcel-del-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.idx);
      if (!confirm('ลบเลขพัสดุชุดนี้?')) return;
      const mail = getCurrentMailData();
      if (!mail) return;
      try {
        const newParcels = mail.parcels.filter((_, i) => i !== idx);
        await saveParcelsToSupabase(mail, newParcels);
        renderParcelList();
        updateParcelButtonColor();
        showToast('ลบแล้ว 🗑️');
      } catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
    };
  });
}

function updateParcelButtonColor() {
  if (!currentParcelEmailId) return;
  const mail = getCurrentMailData();
  const count = mail && mail.parcels ? mail.parcels.length : 0;
  const hasParcel = count > 0;
  const btn = document.querySelector(`.parcel-open-btn[data-email-id="${currentParcelEmailId}"]`);
  if (!btn) return;
  btn.classList.toggle('checked-confirm', hasParcel);
  // อัปเดตตัวเลขบนปุ่ม
  const span = btn.querySelector('span');
  if (span) {
    span.innerHTML = `📦 เลขพัสดุ${hasParcel ? ` <span style="font-size:0.75rem;opacity:0.85;">(${count}/3)</span>` : ''}`;
  }
}

// Helper: Copy to clipboard with fallback (returns Promise)
function copyToClipboardWithFallback(text) {
  return new Promise((resolve) => {
    navigator.clipboard.writeText(text).then(() => {
      resolve(true);
    }).catch(() => {
      // Fallback: ใช้ textarea + execCommand
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        document.body.removeChild(textarea);
        resolve(true);
      } catch (e) {
        document.body.removeChild(textarea);
        resolve(false);
      }
    });
  });
}

// Helper: Read from clipboard with fallback (รับข้อมูลจาก input)
async function pasteFromClipboardOrPrompt() {
  try {
    // ลองใช้ Clipboard API ก่อน
    const text = await navigator.clipboard.readText();
    return text;
  } catch (err) {
    // Fallback: ให้ user paste ผ่าน prompt
    const text = prompt('วาง (Paste) เลขพัสดุที่นี่:');
    return text || null; // return null ถ้า cancel
  }
}

async function pasteParcelData() {
  try {
    const text = await pasteFromClipboardOrPrompt();
    if (!text || !text.trim()) {
      alert('Clipboard ว่างเปล่า');
      return;
    }

    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length < 1) {
      alert('Clipboard ว่างเปล่า');
      return;
    }

    // เก็บทุกบรรทัด (สูงสุด 3 บรรทัด)
    const parcelSet = lines.slice(0, 3).join('\n');
    const mail = getCurrentMailData();
    if (!mail) { alert('ไม่พบข้อมูลอีเมล'); return; }

    if (mail.parcels.includes(parcelSet)) {
      alert('เลขพัสดุชุดนี้มีอยู่แล้ว');
      return;
    }

    if (mail.parcels.length >= 3) {
      alert('เกินจำนวนสูงสุด 3 ชุด');
      return;
    }

    const newParcels = [...mail.parcels, parcelSet];
    const pasteBtn = document.getElementById('parcelPasteBtn');
    const origText = pasteBtn.textContent;
    pasteBtn.textContent = 'กำลังบันทึก...';
    pasteBtn.disabled = true;
    try {
      await saveParcelsToSupabase(mail, newParcels);
      renderParcelList();
      updateParcelButtonColor();
      showToast('เพิ่มเลขพัสดุแล้ว ✅');
    } catch (err) {
      alert('เกิดข้อผิดพลาด: ' + (err.message || err));
    } finally {
      pasteBtn.textContent = origText;
      pasteBtn.disabled = false;
    }
  } catch (err) {
    alert('เกิดข้อผิดพลาด: ' + err);
  }
}

function copyAllParcels() {
  const mail = getCurrentMailData();
  if (!mail || mail.parcels.length === 0) {
    alert('ยังไม่มีเลขพัสดุ');
    return;
  }
  const text = mail.parcels.join('\n\n');
  copyToClipboardWithFallback(text).then((success) => {
    if (success) {
      showToast('คัดลอกแล้ว ✅');
    } else {
      alert('ไม่สามารถคัดลอกได้');
    }
  });
}

async function clearAllParcels() {
  if (!confirm('ต้องการลบเลขพัสดุทั้งหมดใช่หรือไม่?')) return;
  const mail = getCurrentMailData();
  if (!mail) return;
  try {
    await saveParcelsToSupabase(mail, []);
    renderParcelList();
    updateParcelButtonColor();
    showToast('ลบแล้ว 🗑️');
  } catch (e) { alert('ลบไม่สำเร็จ: ' + e.message); }
}

document.getElementById('parcelModalCloseBtn').onclick = closeParcelModal;
document.getElementById('parcelCloseBtn').onclick = closeParcelModal;
document.getElementById('parcelPasteBtn').onclick = pasteParcelData;
document.getElementById('parcelCopyAllBtn').onclick = copyAllParcels;
document.getElementById('parcelClearBtn').onclick = clearAllParcels;

document.getElementById('parcelModal').onclick = (e) => {
  if (e.target === document.getElementById('parcelModal')) {
    closeParcelModal();
  }
};

// =============================================
// --- COLLAPSIBLE SYSTEM ---
// =============================================
// Quick Note Edit Button
document.getElementById('quickNoteEditBtn').addEventListener('click', async () => {
  await ensureQuickNoteExists();
  openQuickNoteEditModal();
});

const emailFormTrigger = document.getElementById('emailFormTrigger');
const emailFormContent = document.getElementById('emailFormContent');
if (emailFormTrigger && emailFormContent) {
  emailFormTrigger.onclick = () => {
    emailFormTrigger.classList.toggle('active');
    emailFormContent.classList.toggle('expanded');
  };
}

// =============================================
// --- REFRESH BUTTON ---
// =============================================
(function () {
  const btn = document.getElementById('refreshBtn');
  let isRefreshing = false;

  btn.addEventListener('click', async function (e) {
    if (isRefreshing) return;
    isRefreshing = true;

    // Ripple effect
    const ripple = document.createElement('span');
    ripple.className = 'ripple';
    const size = Math.max(btn.offsetWidth, btn.offsetHeight);
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (e.offsetX - size / 2) + 'px';
    ripple.style.top  = (e.offsetY - size / 2) + 'px';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);

    // Spin icon
    btn.classList.add('spinning');

    try {
      await loadData();
      // Success glow (green flash)
      btn.classList.remove('spinning');
      btn.classList.add('success-glow');
      showToast('อัปเดตข้อมูลแล้ว ✅');
      setTimeout(() => btn.classList.remove('success-glow'), 700);
    } catch (err) {
      btn.classList.remove('spinning');
      showToast('โหลดไม่สำเร็จ ⚠️');
    } finally {
      // รอให้ animation จบก่อนอนุญาตกดซ้ำ
      setTimeout(() => { isRefreshing = false; }, 800);
    }
  });

  // ลบ animation class เมื่อ spin จบ
  btn.addEventListener('animationend', function (e) {
    if (e.animationName === 'spinOnce') btn.classList.remove('spinning');
  });
})();

// =============================================
// --- INIT ---
// =============================================
(async () => {
  console.log('🚀 Initializing application...');
  await window.whenDatabaseReady();
  initAddressSystem();
  console.log('📡 Loading data from Firebase...');
  await loadData();
  console.log('✅ Data loaded successfully');
  
  await ensureQuickNoteExists();
  
  // ตั้ง realtime subscription พร้อม error handling
  const channel = sb.channel('links-channel')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, () => {
      console.log('🔄 Realtime update detected');
      loadData().catch(err => console.error('Error in realtime update:', err));
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.log('✅ Connected to real-time updates');
      } else if (status === 'CLOSED') {
        console.warn('⚠️ Real-time connection closed');
      } else if (status === 'CHANNEL_ERROR') {
        console.error('❌ Real-time channel error');
        showToast('⚠️ การเชื่อมต่อแบบ realtime มีปัญหา');
      }
    });
})();


document.addEventListener('DOMContentLoaded', () => {
  // APIs ที่รองรับ CORS (ต้องเป็น API ที่มี Access-Control-Allow-Origin header)
  const ipApis = [
    { url: 'https://ipwho.is/', ipField: 'ip', countryField: 'country' },
    { url: 'https://api.ipify.org?format=json', ipField: 'ip', countryField: null },
    { url: 'https://myip.ipv4.wtf/json', ipField: 'ip', countryField: null },
  ];
  
  let apiIndex = 0;
  
  function tryFetchIP() {
    if (apiIndex >= ipApis.length) {
      const ipInfo = document.getElementById('ip-info');
      if (ipInfo) {
        ipInfo.textContent = 'ไม่สามารถโหลดข้อมูล IP ได้';
      }
      console.error('❌ ทั้งหมด IP API ล้มเหลว');
      return;
    }
    
    const apiConfig = ipApis[apiIndex];
    apiIndex++;
    
    fetch(apiConfig.url, { 
      method: 'GET',
      headers: { 'Accept': 'application/json' }
    })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        const ipInfo = document.getElementById('ip-info');
        if (!ipInfo) {
          console.error('❌ Element #ip-info ไม่พบ');
          return;
        }
        
        const ip = data[apiConfig.ipField];
        const country = apiConfig.countryField ? data[apiConfig.countryField] : null;
        
        if (ip) {
          const countryText = country ? ` <span class="font-bold">(${country})</span>` : '';
          ipInfo.innerHTML = `IP: <span class="ip-address-clickable cursor-pointer hover:text-accent transition-colors" title="คลิกเพื่อคัดลอก">${ip}</span>${countryText}`;
          
          // Add click handler to copy IP
          const clickableSpan = ipInfo.querySelector('.ip-address-clickable');
          if (clickableSpan) {
            clickableSpan.addEventListener('click', (e) => {
              e.stopPropagation();
              copyTextToClipboard(ip);
            });
          }
          console.log('✅ โหลดข้อมูล IP สำเร็จ:', ip);
        } else {
          console.warn('⚠️ ไม่พบ IP field ใน response');
          tryFetchIP();
        }
      })
      .catch(error => {
        console.warn(`⚠️ API ล้มเหลว (${apiConfig.url}):`, error.message);
        tryFetchIP();
      });
  }
  
  tryFetchIP();
});
