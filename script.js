// ============================================================
//  MODUL-TOGGLE
// ============================================================

function toggleSection(id) {
  const section = document.getElementById(id);
  if (!section) return;
  section.classList.toggle('collapsed');
}

// Alle Module standardmäßig geöffnet – nichts zu tun.
// Einzelne Module kann man initial einklappen falls gewünscht:
// document.getElementById('sec-g').classList.add('collapsed');

// ============================================================
//  TOGGLE-ALLE BUTTONS (Alle auf-/zuklappen)
// ============================================================

function expandAll() {
  document.querySelectorAll('.section.module').forEach(s => s.classList.remove('collapsed'));
}

function collapseAll() {
  document.querySelectorAll('.section.module').forEach(s => s.classList.add('collapsed'));
}

// ============================================================
//  TOOLBAR DYNAMISCH ERZEUGEN
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  const bar = document.querySelector('.print-bar-inner');
  if (!bar) return;

  // "Alle einklappen" Button
  const btnCollapse = document.createElement('button');
  btnCollapse.className = 'btn-secondary';
  btnCollapse.textContent = '▲ Alle zuklappen';
  btnCollapse.onclick = collapseAll;

  // "Alle aufklappen" Button
  const btnExpand = document.createElement('button');
  btnExpand.className = 'btn-secondary';
  btnExpand.textContent = '▼ Alle aufklappen';
  btnExpand.onclick = expandAll;

  bar.prepend(btnCollapse);
  bar.prepend(btnExpand);

  addToolbarStyles();
  initAutosave();
  initModuleHighlight();
  setTodayDate();
});

function addToolbarStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .btn-secondary {
      background: transparent;
      color: #5a6880;
      border: 1.5px solid #d8dde6;
      border-radius: 4px;
      padding: 7px 16px;
      font-size: 12px;
      font-weight: 600;
      cursor: pointer;
      transition: border-color 0.15s, color 0.15s, background 0.15s;
      font-family: inherit;
    }
    .btn-secondary:hover {
      border-color: #1a2e4a;
      color: #1a2e4a;
      background: #f0f5fe;
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
//  AUTOSAVE IN LOCALSTORAGE
// ============================================================

function initAutosave() {
  const SAVE_KEY = 'fragebogen_data';

  // Gespeicherte Daten laden
  try {
    const saved = localStorage.getItem(SAVE_KEY);
    if (saved) {
      const data = JSON.parse(saved);
      restoreFormData(data);
      showSaveNotice('Letzter Stand wiederhergestellt.');
    }
  } catch (e) {}

  // Bei jeder Eingabe speichern (debounced)
  let saveTimer;
  document.addEventListener('input', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(collectFormData()));
        showSaveNotice('Automatisch gespeichert.');
      } catch (e) {}
    }, 800);
  });

  document.addEventListener('change', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(collectFormData()));
      } catch (e) {}
    }, 400);
  });

  // "Formular zurücksetzen" Button
  const bar = document.querySelector('.print-bar-inner');
  if (bar) {
    const btnReset = document.createElement('button');
    btnReset.className = 'btn-secondary';
    btnReset.textContent = '🗑 Zurücksetzen';
    btnReset.style.color = '#c0392b';
    btnReset.onclick = () => {
      if (confirm('Alle Eingaben löschen und Formular zurücksetzen?')) {
        localStorage.removeItem(SAVE_KEY);
        document.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], input[type="tel"], input[type="date"], textarea').forEach(el => {
          el.value = '';
        });
        document.querySelectorAll('input[type="checkbox"]').forEach(el => {
          el.checked = false;
        });
        setTodayDate();
        updateProgress();
        showSaveNotice('Formular zurückgesetzt.');
      }
    };
    bar.prepend(btnReset);
  }
}

function collectFormData() {
  const data = { inputs: {}, checkboxes: {} };
  document.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], input[type="tel"], input[type="date"], textarea').forEach((el, i) => {
    const key = el.dataset.key || `field_${i}`;
    if (!el.dataset.key) el.dataset.key = key;
    data.inputs[key] = el.value;
  });
  document.querySelectorAll('input[type="checkbox"]').forEach((el, i) => {
    const key = el.dataset.key || `cb_${i}`;
    if (!el.dataset.key) el.dataset.key = key;
    data.checkboxes[key] = el.checked;
  });
  return data;
}

function restoreFormData(data) {
  document.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], input[type="tel"], input[type="date"], textarea').forEach((el, i) => {
    const key = el.dataset.key || `field_${i}`;
    if (!el.dataset.key) el.dataset.key = key;
    if (data.inputs && data.inputs[key] !== undefined) el.value = data.inputs[key];
  });
  document.querySelectorAll('input[type="checkbox"]').forEach((el, i) => {
    const key = el.dataset.key || `cb_${i}`;
    if (!el.dataset.key) el.dataset.key = key;
    if (data.checkboxes && data.checkboxes[key] !== undefined) el.checked = data.checkboxes[key];
  });
}

function showSaveNotice(msg) {
  const existing = document.getElementById('save-notice');
  if (existing) existing.remove();

  const notice = document.createElement('div');
  notice.id = 'save-notice';
  notice.textContent = msg;
  notice.style.cssText = `
    position: fixed; bottom: 20px; right: 24px;
    background: #1a2e4a; color: white;
    padding: 8px 18px; border-radius: 6px;
    font-size: 12px; font-weight: 500;
    box-shadow: 0 4px 16px rgba(0,0,0,0.18);
    z-index: 9999; opacity: 0;
    transition: opacity 0.3s;
    pointer-events: none;
  `;
  document.body.appendChild(notice);
  requestAnimationFrame(() => { notice.style.opacity = '1'; });
  setTimeout(() => {
    notice.style.opacity = '0';
    setTimeout(() => notice.remove(), 400);
  }, 2200);
}

// ============================================================
//  MODUL-VOLLSTÄNDIGKEIT ANZEIGEN
// ============================================================

function initModuleHighlight() {
  // Prüft ob eine Sektion mindestens eine Eingabe hat
  // und markiert den Header mit grünem Häkchen
  document.addEventListener('change', updateProgress);
  document.addEventListener('input', updateProgress);
}

function updateProgress() {
  document.querySelectorAll('.section.module').forEach(section => {
    const hasInput =
      [...section.querySelectorAll('input[type="text"], input[type="number"], input[type="email"], input[type="tel"], textarea')]
        .some(el => el.value.trim() !== '') ||
      [...section.querySelectorAll('input[type="checkbox"]')]
        .some(el => el.checked);

    const header = section.querySelector('.section-title-row');
    let dot = header.querySelector('.progress-dot');

    if (hasInput) {
      if (!dot) {
        dot = document.createElement('span');
        dot.className = 'progress-dot';
        dot.textContent = '●';
        dot.style.cssText = 'color: #4caf7d; font-size: 10px; margin-left: 6px;';
        header.appendChild(dot);
      }
    } else {
      if (dot) dot.remove();
    }
  });
}

// ============================================================
//  HEUTIGES DATUM IN GESPRÄCHSDATEN EINTRAGEN
// ============================================================

function setTodayDate() {
  const dateInputs = document.querySelectorAll('input[type="date"]');
  if (dateInputs.length > 0) {
    const today = new Date().toISOString().split('T')[0];
    // Nur das erste Datumsfeld (Gesprächsdatum) vorausfüllen
    if (!dateInputs[0].value) {
      dateInputs[0].value = today;
    }
  }
}
