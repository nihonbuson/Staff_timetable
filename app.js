/* ============================================================
   Staff Timetable - シフト表 (素のHTML/CSS/JS / GitHub Pages 用)
   データはブラウザの localStorage に保存します。
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "staff-timetable:v1";
  const DAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"];

  // シフトのプリセット（ラベルと色）
  const PRESETS = [
    { label: "早番", value: "早 8:00-17:00", color: "#dbeafe", text: "#1e40af" },
    { label: "遅番", value: "遅 12:00-21:00", color: "#fef3c7", text: "#92400e" },
    { label: "日勤", value: "日 9:00-18:00", color: "#dcfce7", text: "#166534" },
    { label: "夜勤", value: "夜 21:00-翌6:00", color: "#ede9fe", text: "#5b21b6" },
    { label: "休み", value: "休", color: "#f1f5f9", text: "#64748b" },
    { label: "有休", value: "有休", color: "#fce7f3", text: "#9d174d" },
  ];

  // ---------- 状態 ----------
  let state = loadState();
  let weekOffset = 0; // 今週からの週数オフセット
  let editMode = false;
  let activeCell = null; // { staffId, dayIndex }

  // ---------- DOM ----------
  const el = (id) => document.getElementById(id);
  const tableHead = el("tableHead");
  const tableBody = el("tableBody");
  const weekLabel = el("weekLabel");
  const legendList = el("legendList");

  // ============================================================
  // 永続化
  // ============================================================
  function defaultState() {
    return {
      staff: [
        { id: uid(), name: "山田 太郎" },
        { id: uid(), name: "佐藤 花子" },
        { id: uid(), name: "鈴木 一郎" },
      ],
      // shifts[weekKey][staffId][dayIndex] = "シフト文字列"
      shifts: {},
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed.staff || !parsed.shifts) return defaultState();
      return parsed;
    } catch (e) {
      console.warn("保存データの読み込みに失敗しました。初期データを使用します。", e);
      return defaultState();
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function uid() {
    return "id-" + Math.random().toString(36).slice(2, 9);
  }

  // ============================================================
  // 週の計算
  // ============================================================
  function startOfWeek(date) {
    // 月曜始まり
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = (d.getDay() + 6) % 7; // 月=0 ... 日=6
    d.setDate(d.getDate() - day);
    return d;
  }

  function currentWeekStart() {
    const base = startOfWeek(new Date());
    base.setDate(base.getDate() + weekOffset * 7);
    return base;
  }

  function weekKey(weekStart) {
    return formatDate(weekStart, "-");
  }

  function formatDate(date, sep = "/") {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return [y, m, d].join(sep);
  }

  function weekDates(weekStart) {
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(weekStart);
      d.setDate(d.getDate() + i);
      return d;
    });
  }

  // ============================================================
  // 描画
  // ============================================================
  function render() {
    const weekStart = currentWeekStart();
    const dates = weekDates(weekStart);
    const wk = weekKey(weekStart);

    // 週ラベル
    const end = dates[6];
    weekLabel.textContent = `${formatDate(weekStart)} 〜 ${formatDate(end)}`;

    // ヘッダー
    tableHead.innerHTML = "";
    const headRow = document.createElement("tr");
    headRow.appendChild(th("スタッフ", "staff-name"));
    dates.forEach((d, i) => {
      const cls = i === 5 ? "day-sat" : i === 6 ? "day-sun" : "";
      const cell = th(`${DAY_LABELS[i]}\n${d.getMonth() + 1}/${d.getDate()}`, cls);
      cell.style.whiteSpace = "pre-line";
      headRow.appendChild(cell);
    });
    tableHead.appendChild(headRow);

    // ボディ
    tableBody.innerHTML = "";
    if (state.staff.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 8;
      td.textContent = "スタッフがいません。編集モードで追加してください。";
      td.style.color = "var(--muted)";
      td.style.padding = "20px";
      tr.appendChild(td);
      tableBody.appendChild(tr);
    }

    state.staff.forEach((person) => {
      const tr = document.createElement("tr");

      // 名前セル
      const nameTd = document.createElement("td");
      nameTd.className = "staff-name";
      const nameText = document.createElement("span");
      nameText.className = "name-text";
      nameText.textContent = person.name;
      nameText.addEventListener("click", () => {
        if (editMode) renameStaff(person);
      });
      const delBtn = document.createElement("button");
      delBtn.className = "del-staff";
      delBtn.textContent = "✕";
      delBtn.title = "このスタッフを削除";
      delBtn.addEventListener("click", () => removeStaff(person));
      nameTd.appendChild(nameText);
      nameTd.appendChild(delBtn);
      tr.appendChild(nameTd);

      // シフトセル
      dates.forEach((d, i) => {
        const td = document.createElement("td");
        const cls = i === 5 ? "day-sat" : i === 6 ? "day-sun" : "";
        td.className = ("shift-cell " + cls).trim();
        const value = getShift(wk, person.id, i);
        if (value) {
          const chip = document.createElement("span");
          chip.className = "shift-chip";
          const preset = PRESETS.find((p) => p.value === value);
          if (preset) {
            chip.style.background = preset.color;
            chip.style.color = preset.text;
          }
          chip.textContent = value;
          td.appendChild(chip);
        }
        td.addEventListener("click", () => {
          if (editMode) openCellModal(person, i);
        });
        tr.appendChild(td);
      });

      tableBody.appendChild(tr);
    });

    renderLegend();
  }

  function th(text, className) {
    const cell = document.createElement("th");
    cell.textContent = text;
    if (className) cell.className = className;
    return cell;
  }

  function renderLegend() {
    legendList.innerHTML = "";
    PRESETS.forEach((p) => {
      const li = document.createElement("li");
      const sw = document.createElement("span");
      sw.className = "legend-swatch";
      sw.style.background = p.color;
      const label = document.createElement("span");
      label.textContent = `${p.label}（${p.value}）`;
      li.appendChild(sw);
      li.appendChild(label);
      legendList.appendChild(li);
    });
  }

  // ============================================================
  // シフトデータ操作
  // ============================================================
  function getShift(wk, staffId, dayIndex) {
    return state.shifts?.[wk]?.[staffId]?.[dayIndex] || "";
  }

  function setShift(wk, staffId, dayIndex, value) {
    if (!state.shifts[wk]) state.shifts[wk] = {};
    if (!state.shifts[wk][staffId]) state.shifts[wk][staffId] = {};
    if (value) {
      state.shifts[wk][staffId][dayIndex] = value;
    } else {
      delete state.shifts[wk][staffId][dayIndex];
    }
    saveState();
  }

  // ============================================================
  // スタッフ操作
  // ============================================================
  function addStaff() {
    const name = prompt("スタッフ名を入力してください");
    if (name && name.trim()) {
      state.staff.push({ id: uid(), name: name.trim() });
      saveState();
      render();
    }
  }

  function renameStaff(person) {
    const name = prompt("スタッフ名を編集", person.name);
    if (name && name.trim()) {
      person.name = name.trim();
      saveState();
      render();
    }
  }

  function removeStaff(person) {
    if (!confirm(`「${person.name}」を削除しますか？\n（このスタッフの全シフトデータも削除されます）`)) return;
    state.staff = state.staff.filter((s) => s.id !== person.id);
    // 全週のシフトから削除
    Object.values(state.shifts).forEach((week) => delete week[person.id]);
    saveState();
    render();
  }

  // ============================================================
  // セル編集モーダル
  // ============================================================
  const cellModal = el("cellModal");
  const presetGrid = el("presetGrid");
  const cellInput = el("cellInput");
  const cellModalTitle = el("cellModalTitle");

  function buildPresetButtons() {
    presetGrid.innerHTML = "";
    PRESETS.forEach((p) => {
      const btn = document.createElement("button");
      btn.className = "preset-btn";
      btn.textContent = p.label;
      btn.style.background = p.color;
      btn.style.color = p.text;
      btn.addEventListener("click", () => {
        cellInput.value = p.value;
      });
      presetGrid.appendChild(btn);
    });
  }

  function openCellModal(person, dayIndex) {
    const weekStart = currentWeekStart();
    const wk = weekKey(weekStart);
    const date = weekDates(weekStart)[dayIndex];
    activeCell = { wk, staffId: person.id, dayIndex };
    cellModalTitle.textContent = `${person.name} ／ ${DAY_LABELS[dayIndex]} ${date.getMonth() + 1}/${date.getDate()}`;
    cellInput.value = getShift(wk, person.id, dayIndex);
    cellModal.hidden = false;
    cellInput.focus();
  }

  function closeCellModal() {
    cellModal.hidden = true;
    activeCell = null;
  }

  function saveCell() {
    if (!activeCell) return;
    setShift(activeCell.wk, activeCell.staffId, activeCell.dayIndex, cellInput.value.trim());
    closeCellModal();
    render();
  }

  // ============================================================
  // インポート / エクスポート
  // ============================================================
  function exportJSON() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `staff-timetable-${formatDate(new Date(), "")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJSON(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        if (!parsed.staff || !parsed.shifts) throw new Error("形式が不正です");
        state = parsed;
        saveState();
        render();
        alert("インポートが完了しました。");
      } catch (e) {
        alert("インポートに失敗しました: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  function resetAll() {
    if (!confirm("全データをリセットして初期状態に戻しますか？この操作は元に戻せません。")) return;
    state = defaultState();
    saveState();
    render();
  }

  // ============================================================
  // イベント登録
  // ============================================================
  function setEditMode(on) {
    editMode = on;
    document.body.classList.toggle("edit-mode", on);
    el("editControls").hidden = !on;
    el("editToggle").checked = on;
  }

  function init() {
    buildPresetButtons();
    render();

    // 週ナビ
    el("prevWeek").addEventListener("click", () => { weekOffset--; render(); });
    el("nextWeek").addEventListener("click", () => { weekOffset++; render(); });
    el("todayBtn").addEventListener("click", () => { weekOffset = 0; render(); });

    // 編集モード
    el("editToggle").addEventListener("change", (e) => setEditMode(e.target.checked));
    el("addStaffBtn").addEventListener("click", addStaff);

    // メニュー
    const menuPanel = el("menuPanel");
    el("menuBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      menuPanel.hidden = !menuPanel.hidden;
    });
    document.addEventListener("click", () => { menuPanel.hidden = true; });
    menuPanel.addEventListener("click", (e) => e.stopPropagation());

    el("exportBtn").addEventListener("click", () => { exportJSON(); menuPanel.hidden = true; });
    el("importBtn").addEventListener("click", () => { el("importFile").click(); menuPanel.hidden = true; });
    el("importFile").addEventListener("change", (e) => {
      if (e.target.files[0]) importJSON(e.target.files[0]);
      e.target.value = "";
    });
    el("printBtn").addEventListener("click", () => { menuPanel.hidden = true; window.print(); });
    el("resetBtn").addEventListener("click", () => { resetAll(); menuPanel.hidden = true; });

    // セルモーダル
    el("cellSave").addEventListener("click", saveCell);
    el("cellCancel").addEventListener("click", closeCellModal);
    el("cellClear").addEventListener("click", () => { cellInput.value = ""; });
    cellModal.addEventListener("click", (e) => { if (e.target === cellModal) closeCellModal(); });
    cellInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveCell();
      if (e.key === "Escape") closeCellModal();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
