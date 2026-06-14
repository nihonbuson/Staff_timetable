/* ============================================================
   香盤表メーカー (Staff Timetable)
   カンファレンス運営スタッフの香盤表を作成する静的Webアプリ。
   - 5タブ構成: メンバー / 役割 / タイムテーブル / 担当 / 表示
   - データは localStorage に自動保存
   - CSV / JSON エクスポート、JSON インポート、印刷に対応
   ============================================================ */

(() => {
  "use strict";

  const STORAGE_KEY = "kouban:v1";

  // 役割の自動カラーパレット（淡色）
  const PALETTE = [
    "#dbeafe", "#dcfce7", "#fef3c7", "#ede9fe", "#fce7f3",
    "#ffedd5", "#cffafe", "#fee2e2", "#e0e7ff", "#d1fae5",
  ];

  const el = (id) => document.getElementById(id);
  const uid = (p = "id") => p + "-" + Math.random().toString(36).slice(2, 9);

  // ============================================================
  // 状態 / 永続化
  // ============================================================
  function defaultState() {
    return {
      meta: { title: "", day1Date: "", day2Date: "" },
      members: [],
      roles: [],
      sessions: [],
      // assignments[sessionId][memberId] = [ { roleId, start, end } ]
      assignments: {},
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const p = JSON.parse(raw);
      return Object.assign(defaultState(), p);
    } catch (e) {
      console.warn("保存データの読み込みに失敗。初期化します。", e);
      return defaultState();
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  let state = loadState();

  // ============================================================
  // 参照ヘルパー
  // ============================================================
  const getRole = (id) => state.roles.find((r) => r.id === id);
  const getMember = (id) => state.members.find((m) => m.id === id);

  function sortedSessions() {
    return [...state.sessions].sort((a, b) => {
      if (a.day !== b.day) return a.day - b.day;
      return (a.start || "").localeCompare(b.start || "");
    });
  }

  function getAssignment(sessionId, memberId) {
    return state.assignments?.[sessionId]?.[memberId] || [];
  }

  function setAssignment(sessionId, memberId, segments) {
    if (!state.assignments[sessionId]) state.assignments[sessionId] = {};
    if (segments && segments.length) {
      state.assignments[sessionId][memberId] = segments;
    } else {
      delete state.assignments[sessionId][memberId];
      if (Object.keys(state.assignments[sessionId]).length === 0) {
        delete state.assignments[sessionId];
      }
    }
    save();
  }

  function fmtTime(t) { return t || ""; }
  function timeRange(s, e) { return `${fmtTime(s)}–${fmtTime(e)}`; }

  // "HH:MM" → 分。形式不正なら null
  function toMin(t) {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  // 担当（役割の時間帯）のバリデーション。問題があればエラーメッセージ、無ければ null。
  // segs はいずれも roleId が設定済みの想定。
  function validateSegments(session, segs) {
    const ss = toMin(session.start);
    const se = toMin(session.end);
    const items = segs.map((s) => ({
      name: (getRole(s.roleId) || {}).name || "(無名の役割)",
      start: s.start, end: s.end,
      a: toMin(s.start), b: toMin(s.end),
    }));

    for (const it of items) {
      if (it.a === null || it.b === null) {
        return `「${it.name}」の開始時刻・終了時刻を入力してください。`;
      }
      if (it.b <= it.a) {
        return `「${it.name}」の終了時刻(${it.end})は開始時刻(${it.start})より後にしてください。`;
      }
      if (ss !== null && it.a < ss) {
        return `「${it.name}」の開始時刻(${it.start})は、セッションの開始時刻(${session.start})以降にしてください。`;
      }
      if (se !== null && it.b > se) {
        return `「${it.name}」の終了時刻(${it.end})は、セッションの終了時刻(${session.end})以前にしてください。`;
      }
    }

    // 時間帯の重複チェック（隣接＝前の終了と次の開始が同じ、は重複ではない）
    const sorted = [...items].sort((x, y) => x.a - y.a);
    for (let k = 1; k < sorted.length; k++) {
      if (sorted[k].a < sorted[k - 1].b) {
        return `役割の時間帯が重複しています：「${sorted[k - 1].name}」(${timeRange(sorted[k - 1].start, sorted[k - 1].end)})` +
          ` と 「${sorted[k].name}」(${timeRange(sorted[k].start, sorted[k].end)})`;
      }
    }
    return null;
  }

  // ============================================================
  // タブ
  // ============================================================
  function initTabs() {
    el("tabs").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab");
      if (!btn) return;
      const tab = btn.dataset.tab;
      document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === btn));
      document.querySelectorAll(".panel").forEach((p) => {
        p.hidden = p.id !== "panel-" + tab;
      });
      renderAll();
    });
  }

  // ============================================================
  // ① メンバー設定
  // ============================================================
  function renderMembers() {
    const list = el("memberList");
    list.innerHTML = "";
    if (state.members.length === 0) {
      list.innerHTML = '<p class="empty-hint">メンバーがまだいません。「＋ メンバー追加」で登録してください。</p>';
      return;
    }
    state.members.forEach((m, i) => {
      const row = document.createElement("div");
      row.className = "row-item";
      row.innerHTML = `
        <span class="idx">${i + 1}</span>
        <input type="text" value="" placeholder="氏名" />
        <button class="icon-btn" data-act="up" title="上へ" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="icon-btn" data-act="down" title="下へ" ${i === state.members.length - 1 ? "disabled" : ""}>↓</button>
        <button class="icon-btn danger" data-act="del" title="削除">✕</button>`;
      const input = row.querySelector("input");
      input.value = m.name;
      input.addEventListener("input", () => { m.name = input.value; save(); });
      row.querySelector('[data-act="up"]').addEventListener("click", () => moveMember(i, -1));
      row.querySelector('[data-act="down"]').addEventListener("click", () => moveMember(i, 1));
      row.querySelector('[data-act="del"]').addEventListener("click", () => removeMember(m));
      list.appendChild(row);
    });
  }

  function moveMember(i, dir) {
    const j = i + dir;
    if (j < 0 || j >= state.members.length) return;
    [state.members[i], state.members[j]] = [state.members[j], state.members[i]];
    save();
    renderMembers();
  }

  function removeMember(m) {
    if (!confirm(`「${m.name || "(無名)"}」を削除しますか？\nこのメンバーの担当データも削除されます。`)) return;
    state.members = state.members.filter((x) => x.id !== m.id);
    Object.values(state.assignments).forEach((sess) => delete sess[m.id]);
    save();
    renderAll();
  }

  // ============================================================
  // ② 役割設定
  // ============================================================
  function renderRoles() {
    const list = el("roleList");
    list.innerHTML = "";
    if (state.roles.length === 0) {
      list.innerHTML = '<p class="empty-hint">役割がまだありません。「＋ 役割追加」で登録してください。</p>';
      return;
    }
    state.roles.forEach((r, i) => {
      const row = document.createElement("div");
      row.className = "row-item";
      row.innerHTML = `
        <span class="idx">${i + 1}</span>
        <input type="text" placeholder="役割名（例: 司会）" />
        <input type="color" title="表示色" />
        <button class="icon-btn danger" data-act="del" title="削除">✕</button>`;
      const [nameInput, colorInput] = row.querySelectorAll("input");
      nameInput.value = r.name;
      colorInput.value = r.color;
      nameInput.addEventListener("input", () => { r.name = nameInput.value; save(); });
      colorInput.addEventListener("input", () => { r.color = colorInput.value; save(); });
      row.querySelector('[data-act="del"]').addEventListener("click", () => removeRole(r));
      list.appendChild(row);
    });
  }

  function removeRole(r) {
    if (!confirm(`役割「${r.name || "(無名)"}」を削除しますか？\nこの役割を使っている担当からも取り除かれます。`)) return;
    state.roles = state.roles.filter((x) => x.id !== r.id);
    Object.values(state.assignments).forEach((sess) => {
      Object.keys(sess).forEach((mid) => {
        sess[mid] = sess[mid].filter((seg) => seg.roleId !== r.id);
        if (sess[mid].length === 0) delete sess[mid];
      });
    });
    save();
    renderAll();
  }

  // ============================================================
  // ③ タイムテーブル設定
  // ============================================================
  function renderSessions() {
    el("confTitle").value = state.meta.title || "";
    el("day1Date").value = state.meta.day1Date || "";
    el("day2Date").value = state.meta.day2Date || "";

    const wrap = el("sessionList");
    wrap.innerHTML = "";
    [1, 2].forEach((day) => {
      const group = document.createElement("div");
      group.className = "session-day-group";
      const dateLabel = day === 1 ? state.meta.day1Date : state.meta.day2Date;
      group.innerHTML = `<h3>Day${day}${dateLabel ? `（${dateLabel}）` : ""}</h3>`;
      const daySessions = sortedSessions().filter((s) => s.day === day);
      if (daySessions.length === 0) {
        const p = document.createElement("p");
        p.className = "empty-hint";
        p.textContent = "セッション未登録";
        group.appendChild(p);
      }
      daySessions.forEach((s) => group.appendChild(sessionRow(s)));
      wrap.appendChild(group);
    });
  }

  // 開始時刻の入力確定後、表示上の並び順が実際に変わるときだけ再描画する。
  // （順番が変わらなければ再描画せず、編集中のフォーカスを保てる）
  function resortSessionsIfNeeded() {
    const domOrder = [...el("sessionList").querySelectorAll(".session-item")]
      .map((r) => r._sid).join(",");
    const sortedOrder = sortedSessions().map((x) => x.id).join(",");
    if (domOrder !== sortedOrder) renderSessions();
  }

  function sessionRow(s) {
    const row = document.createElement("div");
    row.className = "session-item";
    row._sid = s.id;
    row.innerHTML = `
      <label class="mini">日<select class="s-day">
        <option value="1">Day1</option><option value="2">Day2</option>
      </select></label>
      <input type="text" class="s-title" placeholder="セッション名（例: 基調講演）" />
      <label class="mini">開始<input type="time" class="s-start" /></label>
      <span class="s-sep">〜</span>
      <label class="mini">終了<input type="time" class="s-end" /></label>
      <button class="icon-btn danger" data-act="del" title="削除">✕</button>`;
    row.querySelector(".s-day").value = String(s.day);
    row.querySelector(".s-title").value = s.title || "";
    row.querySelector(".s-start").value = s.start || "";
    row.querySelector(".s-end").value = s.end || "";
    row.querySelector(".s-day").addEventListener("change", (e) => { s.day = Number(e.target.value); save(); renderSessions(); });
    row.querySelector(".s-title").addEventListener("input", (e) => { s.title = e.target.value; save(); });
    // 開始時刻: 入力中は値の保存のみ（並べ替えしない＝フォーカスを保持）。
    // 入力確定(blur)時に、並び順が変わる場合だけ再描画する。
    const startInput = row.querySelector(".s-start");
    startInput.addEventListener("input", () => { s.start = startInput.value; save(); });
    startInput.addEventListener("blur", resortSessionsIfNeeded);
    row.querySelector(".s-end").addEventListener("change", (e) => { s.end = e.target.value; save(); });
    row.querySelector('[data-act="del"]').addEventListener("click", () => {
      if (!confirm("このセッションを削除しますか？担当データも削除されます。")) return;
      state.sessions = state.sessions.filter((x) => x.id !== s.id);
      delete state.assignments[s.id];
      save();
      renderAll();
    });
    return row;
  }

  // ============================================================
  // ④ 担当設定
  // ============================================================
  function renderAssign() {
    const wrap = el("assignTableWrap");
    wrap.innerHTML = "";

    if (state.members.length === 0 || state.sessions.length === 0) {
      wrap.innerHTML = '<p class="empty-hint">先に「メンバー設定」と「タイムテーブル設定」を済ませてください。</p>';
      return;
    }

    const table = document.createElement("table");
    table.className = "grid";
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    headRow.innerHTML = '<th class="time-col">セッション</th>';
    state.members.forEach((m) => {
      const th = document.createElement("th");
      th.textContent = m.name || "(無名)";
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    [1, 2].forEach((day) => {
      const daySessions = sortedSessions().filter((s) => s.day === day);
      if (daySessions.length === 0) return;
      const dr = document.createElement("tr");
      dr.className = "day-row";
      const dateLabel = day === 1 ? state.meta.day1Date : state.meta.day2Date;
      dr.innerHTML = `<td colspan="${state.members.length + 1}">Day${day}${dateLabel ? `（${dateLabel}）` : ""}</td>`;
      tbody.appendChild(dr);

      daySessions.forEach((s) => {
        const tr = document.createElement("tr");
        const timeTd = document.createElement("td");
        timeTd.className = "time-col";
        timeTd.innerHTML = `<div class="s-name">${escapeHtml(s.title || "(無題)")}</div><div class="s-time">${timeRange(s.start, s.end)}</div>`;
        tr.appendChild(timeTd);

        state.members.forEach((m) => {
          const td = document.createElement("td");
          td.className = "assign-cell";
          renderCellContent(td, getAssignment(s.id, m.id));
          td.addEventListener("click", () => openAssignModal(s, m));
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
    });
    table.appendChild(tbody);
    wrap.appendChild(table);
  }

  function renderCellContent(td, segments) {
    td.innerHTML = "";
    if (!segments.length) {
      td.classList.add("empty");
      td.textContent = "—";
      return;
    }
    td.classList.remove("empty");
    const stack = document.createElement("div");
    stack.className = "chip-stack";
    segments.forEach((seg) => {
      const role = getRole(seg.roleId);
      const chip = document.createElement("span");
      chip.className = "role-chip";
      if (role) chip.style.background = role.color;
      chip.textContent = role ? role.name : "(不明な役割)";
      if (seg.start || seg.end) {
        const t = document.createElement("span");
        t.className = "seg-time";
        t.textContent = timeRange(seg.start, seg.end);
        chip.appendChild(t);
      }
      stack.appendChild(chip);
    });
    td.appendChild(stack);
  }

  // ---------- 担当編集モーダル ----------
  let modalCtx = null; // { session, member }

  function openAssignModal(session, member) {
    if (state.roles.length === 0) {
      alert("先に「役割設定」で役割を登録してください。");
      return;
    }
    modalCtx = { session, member };
    el("assignModalTitle").textContent = `${member.name || "(無名)"} の担当`;
    el("assignModalSub").textContent = `${session.title || "(無題)"} ／ Day${session.day} ${timeRange(session.start, session.end)}`;

    const existing = getAssignment(session.id, member.id);
    // 未設定セルを開いたときは、初期値としてセッションの開始/終了時刻を入れておく
    const segs = existing.length
      ? existing.map((s) => ({ ...s }))
      : [{ roleId: "", start: session.start || "", end: session.end || "" }];
    renderSegments(segs);
    el("assignModal").hidden = false;
  }

  function renderSegments(segs) {
    const list = el("segmentList");
    list.innerHTML = "";
    segs.forEach((seg, i) => list.appendChild(segmentRow(seg, i, segs)));
    // 単一セグメントなら「時間帯」は任意（空＝セッション全体）という案内
  }

  function segmentRow(seg, i, segs) {
    const row = document.createElement("div");
    row.className = "segment-row";
    const opts = state.roles.map((r) => `<option value="${r.id}">${escapeHtml(r.name || "(無名)")}</option>`).join("");
    row.innerHTML = `
      <select><option value="">役割を選択</option>${opts}</select>
      <input type="time" class="seg-start" title="開始（空欄可）" />
      <span class="seg-dash">〜</span>
      <input type="time" class="seg-end" title="終了（空欄可）" />
      <button class="icon-btn danger" data-act="del" title="この行を削除">✕</button>`;
    const sel = row.querySelector("select");
    const startI = row.querySelector(".seg-start");
    const endI = row.querySelector(".seg-end");
    sel.value = seg.roleId || "";
    startI.value = seg.start || "";
    endI.value = seg.end || "";
    sel.addEventListener("change", () => { seg.roleId = sel.value; });
    startI.addEventListener("change", () => { seg.start = startI.value; });
    endI.addEventListener("change", () => { seg.end = endI.value; });
    row.querySelector('[data-act="del"]').addEventListener("click", () => {
      const idx = segs.indexOf(seg);
      if (idx >= 0) segs.splice(idx, 1);
      if (segs.length === 0) segs.push({ roleId: "", start: "", end: "" });
      renderSegments(segs);
    });
    // 現在の編集対象配列を保持
    row._segs = segs;
    return row;
  }

  function currentSegs() {
    const first = el("segmentList").firstElementChild;
    return first ? first._segs : [];
  }

  function closeAssignModal() {
    el("assignModal").hidden = true;
    modalCtx = null;
  }

  function saveAssign() {
    if (!modalCtx) return;
    const segs = currentSegs().filter((s) => s.roleId); // 役割未選択の行は無視
    const err = validateSegments(modalCtx.session, segs);
    if (err) {
      alert(err);
      return; // モーダルは閉じず、修正を促す
    }
    setAssignment(modalCtx.session.id, modalCtx.member.id, segs);
    closeAssignModal();
    renderAll();
  }

  // ============================================================
  // ⑤ 表示
  // ============================================================
  function renderDisplay() {
    const area = el("displayArea");
    area.innerHTML = "";

    if (state.meta.title) {
      const h = document.createElement("h2");
      h.className = "display-title";
      h.textContent = state.meta.title;
      area.appendChild(h);
    }

    // 凡例
    if (state.roles.length) {
      const legend = document.createElement("div");
      legend.className = "legend";
      state.roles.forEach((r) => {
        const item = document.createElement("span");
        item.className = "item";
        item.innerHTML = `<span class="swatch" style="background:${r.color}"></span>${escapeHtml(r.name || "(無名)")}`;
        legend.appendChild(item);
      });
      area.appendChild(legend);
    }

    if (state.members.length === 0 || state.sessions.length === 0) {
      const p = document.createElement("p");
      p.className = "empty-hint";
      p.textContent = "メンバーとタイムテーブルを設定すると、ここに香盤表が表示されます。";
      area.appendChild(p);
      return;
    }

    [1, 2].forEach((day) => {
      const daySessions = sortedSessions().filter((s) => s.day === day);
      if (daySessions.length === 0) return;
      const block = document.createElement("div");
      block.className = "display-day-block";
      const dateLabel = day === 1 ? state.meta.day1Date : state.meta.day2Date;
      block.innerHTML = `<h3>Day${day}${dateLabel ? `（${dateLabel}）` : ""}</h3>`;

      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      const table = document.createElement("table");
      table.className = "grid";

      const thead = document.createElement("thead");
      const hr = document.createElement("tr");
      hr.innerHTML = '<th class="time-col">時間 / セッション</th>';
      state.members.forEach((m) => {
        const th = document.createElement("th");
        th.textContent = m.name || "(無名)";
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      daySessions.forEach((s) => {
        const tr = document.createElement("tr");
        const timeTd = document.createElement("td");
        timeTd.className = "time-col";
        timeTd.innerHTML = `<div class="s-time">${timeRange(s.start, s.end)}</div><div class="s-name">${escapeHtml(s.title || "(無題)")}</div>`;
        tr.appendChild(timeTd);
        state.members.forEach((m) => {
          const td = document.createElement("td");
          renderCellContent(td, getAssignment(s.id, m.id));
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      block.appendChild(wrap);
      area.appendChild(block);
    });
  }

  // ============================================================
  // エクスポート / インポート
  // ============================================================
  function segmentsToText(segments) {
    return segments.map((seg) => {
      const role = getRole(seg.roleId);
      const name = role ? role.name : "(不明)";
      return (seg.start || seg.end) ? `${name}(${timeRange(seg.start, seg.end)})` : name;
    }).join(" / ");
  }

  function exportCsv() {
    const rows = [];
    rows.push(["日", "開始", "終了", "セッション", ...state.members.map((m) => m.name || "(無名)")]);
    [1, 2].forEach((day) => {
      sortedSessions().filter((s) => s.day === day).forEach((s) => {
        const row = [`Day${day}`, s.start || "", s.end || "", s.title || ""];
        state.members.forEach((m) => row.push(segmentsToText(getAssignment(s.id, m.id))));
        rows.push(row);
      });
    });
    const csv = rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    // Excel での文字化け防止に UTF-8 BOM を付与
    download("﻿" + csv, csvFileName("csv"), "text/csv;charset=utf-8");
  }

  function csvCell(v) {
    const s = String(v ?? "");
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function exportJson() {
    download(JSON.stringify(state, null, 2), csvFileName("json"), "application/json");
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(reader.result);
        if (!p.members || !p.sessions || !p.roles) throw new Error("形式が不正です");
        state = Object.assign(defaultState(), p);
        save();
        renderAll();
        alert("インポートが完了しました。");
      } catch (e) {
        alert("インポートに失敗しました: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  // ---------- 別サービスのイベントJSON取り込み ----------
  // 想定フォーマット例: { eventName, startDate, endDate,
  //   committeeMembers: ["氏名", ...],
  //   day1Sessions: [{ startTime, endTime, title, ... }], day2Sessions: [...] }
  function importEventData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const p = JSON.parse(reader.result);
        // 委員長(committeeChair)を先頭に、続けて委員(committeeMembers)を取り込む。
        // 既に committeeMembers に委員長が含まれている場合は重複させない。
        const memberNames = Array.isArray(p.committeeMembers) ? p.committeeMembers : [];
        const chair = p.committeeChair ? String(p.committeeChair).trim() : "";
        const members = [];
        if (chair) members.push(chair);
        memberNames.forEach((name) => {
          const n = String(name).trim();
          if (n && n !== chair) members.push(n);
        });
        const d1 = Array.isArray(p.day1Sessions) ? p.day1Sessions : [];
        const d2 = Array.isArray(p.day2Sessions) ? p.day2Sessions : [];
        if (members.length === 0 && d1.length === 0 && d2.length === 0) {
          throw new Error("committeeChair / committeeMembers / day1Sessions / day2Sessions が見つかりません");
        }
        const ok = confirm(
          `イベントデータを取り込みます。\n` +
          `・メンバー: ${members.length}名\n` +
          `・セッション: ${d1.length + d2.length}件（Day1 ${d1.length} / Day2 ${d2.length}）\n\n` +
          `既存の「メンバー」「タイムテーブル」「担当設定」は置き換えられます。\n` +
          `（「役割」の設定はそのまま残ります）\n\nよろしいですか？`
        );
        if (!ok) return;

        // メンバー
        state.members = members
          .map((name) => String(name).trim())
          .filter((name) => name)
          .map((name) => ({ id: uid("m"), name }));

        // セッション（休憩・昼食などのブロックも含めて全て取り込む）
        const toSession = (s, day) => ({
          id: uid("s"),
          day,
          title: String(s.title || "").trim(),
          start: normalizeTime(s.startTime),
          end: normalizeTime(s.endTime),
        });
        state.sessions = [
          ...d1.map((s) => toSession(s, 1)),
          ...d2.map((s) => toSession(s, 2)),
        ];

        // セッション/メンバーのIDが変わるため、担当データはクリア
        state.assignments = {};

        // 任意項目: イベント名・各日の日付
        if (p.eventName) state.meta.title = String(p.eventName).trim();
        const sd = parseJpDate(p.startDate); if (sd) state.meta.day1Date = sd;
        const ed = parseJpDate(p.endDate); if (ed) state.meta.day2Date = ed;

        save();
        renderAll();
        alert(`取り込みが完了しました。\nメンバー ${state.members.length}名 / セッション ${state.sessions.length}件`);
      } catch (e) {
        alert("取り込みに失敗しました: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  // "9:00" / "09:00" → "09:00"（time入力用に2桁ゼロ埋め）
  function normalizeTime(t) {
    const m = String(t || "").match(/(\d{1,2}):(\d{2})/);
    if (!m) return "";
    return String(m[1]).padStart(2, "0") + ":" + m[2];
  }

  // "2026年6月27日（土）" → "2026-06-27"
  function parseJpDate(s) {
    const m = String(s || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
    if (!m) return "";
    return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  }

  function csvFileName(ext) {
    const base = (state.meta.title || "kouban").replace(/[\\/:*?"<>|]/g, "_");
    return `${base}.${ext}`;
  }

  function download(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ============================================================
  // ユーティリティ
  // ============================================================
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  function renderAll() {
    renderMembers();
    renderRoles();
    renderSessions();
    renderAssign();
    renderDisplay();
  }

  // ============================================================
  // 初期化 / イベント
  // ============================================================
  function init() {
    initTabs();

    // メンバー
    el("addMember").addEventListener("click", () => {
      state.members.push({ id: uid("m"), name: "" });
      save();
      renderMembers();
    });

    // 役割
    el("addRole").addEventListener("click", () => {
      const color = PALETTE[state.roles.length % PALETTE.length];
      state.roles.push({ id: uid("r"), name: "", color });
      save();
      renderRoles();
    });

    // タイムテーブル
    el("confTitle").addEventListener("input", (e) => { state.meta.title = e.target.value; save(); });
    el("day1Date").addEventListener("change", (e) => { state.meta.day1Date = e.target.value; save(); renderSessions(); });
    el("day2Date").addEventListener("change", (e) => { state.meta.day2Date = e.target.value; save(); renderSessions(); });
    el("addSession").addEventListener("click", () => {
      state.sessions.push({ id: uid("s"), day: 1, title: "", start: "09:00", end: "10:00" });
      save();
      renderSessions();
    });

    // イベントJSON取り込み
    el("importEvent").addEventListener("click", () => el("importEventFile").click());
    el("importEventFile").addEventListener("change", (e) => {
      if (e.target.files[0]) importEventData(e.target.files[0]);
      e.target.value = "";
    });

    // 担当モーダル
    el("addSegment").addEventListener("click", () => {
      const segs = currentSegs();
      segs.push({ roleId: "", start: "", end: "" });
      renderSegments(segs);
    });
    el("assignSave").addEventListener("click", saveAssign);
    el("assignCancel").addEventListener("click", closeAssignModal);
    el("assignClear").addEventListener("click", () => {
      const s = modalCtx && modalCtx.session;
      const segs = [{ roleId: "", start: (s && s.start) || "", end: (s && s.end) || "" }];
      renderSegments(segs);
    });
    el("assignModal").addEventListener("click", (e) => {
      if (e.target === el("assignModal")) closeAssignModal();
    });

    // 表示タブ：エクスポート/インポート
    el("exportCsv").addEventListener("click", exportCsv);
    el("exportJson").addEventListener("click", exportJson);
    el("importJson").addEventListener("click", () => el("importFile").click());
    el("importFile").addEventListener("change", (e) => {
      if (e.target.files[0]) importJson(e.target.files[0]);
      e.target.value = "";
    });
    el("printBtn").addEventListener("click", () => window.print());

    renderAll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
