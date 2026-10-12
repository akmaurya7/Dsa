const problems = window.DSA_PROBLEMS.map(([id, topic, subtopic, name, difficulty, leetcode, gfg]) => ({ id, topic, subtopic, name, difficulty, leetcode, gfg }));
const storeKey = 'dsa-practice-board-v1';
let state = loadState();
let activeTopic = 'All problems';
let view = 'all';
let noteId = null;

function loadState() { try { return JSON.parse(localStorage.getItem(storeKey)) || { done: {}, notes: {} }; } catch { return { done: {}, notes: {} }; } }
function saveState() { localStorage.setItem(storeKey, JSON.stringify(state)); }
const topics = [...new Set(problems.map(p => p.topic))];
const topicCounts = Object.fromEntries(topics.map(topic => [topic, problems.filter(p => p.topic === topic).length]));

const els = {
  topicNav: document.querySelector('#topicNav'), list: document.querySelector('#problemList'), empty: document.querySelector('#emptyState'),
  title: document.querySelector('#queueTitle'), crumb: document.querySelector('#crumbTopic'), resultCount: document.querySelector('#resultCount'),
  search: document.querySelector('#searchInput'), difficulty: document.querySelector('#difficultyFilter'), sort: document.querySelector('#sortSelect'),
  total: document.querySelector('#totalProgress'), completed: document.querySelector('#completedCount'), revisit: document.querySelector('#revisitCount'), notes: document.querySelector('#notesCount'),
  bar: document.querySelector('#totalBar'), percent: document.querySelector('#heroPercent'), modal: document.querySelector('#noteModal'), noteTitle: document.querySelector('#noteTitle'), noteMeta: document.querySelector('#noteMeta'), noteInput: document.querySelector('#noteInput')
};

function renderNav() {
  els.topicNav.innerHTML = `<button class="topic-button ${activeTopic === 'All problems' ? 'active' : ''}" data-topic="All problems"><span>All problems</span><small>${problems.length}</small></button>` + topics.map(topic => `<button class="topic-button ${activeTopic === topic ? 'active' : ''}" data-topic="${escapeHtml(topic)}"><span>${escapeHtml(topic)}</span><small>${topicCounts[topic]}</small></button>`).join('');
}
function filteredProblems() {
  const term = els.search.value.trim().toLowerCase();
  let list = problems.filter(p => (activeTopic === 'All problems' || p.topic === activeTopic) && (els.difficulty.value === 'all' || p.difficulty === els.difficulty.value) && (view === 'all' || (view === 'done' ? state.done[p.id] : !state.done[p.id])) && (!term || [p.name, p.topic, p.subtopic].join(' ').toLowerCase().includes(term)));
  if (els.sort.value === 'difficulty') list.sort((a, b) => ({ Easy: 1, Medium: 2, Hard: 3 }[a.difficulty] - { Easy: 1, Medium: 2, Hard: 3 }[b.difficulty]) || a.id - b.id);
  if (els.sort.value === 'topic') list.sort((a, b) => a.topic.localeCompare(b.topic) || a.id - b.id);
  return list;
}
function problemMarkup(p) { return `<article class="problem-row ${state.done[p.id] ? 'is-done' : ''}" data-id="${p.id}" tabindex="0"><span class="problem-number">${String(p.id).padStart(3, '0')}</span><div><div class="problem-title">${escapeHtml(p.name)}</div><div class="problem-subtitle">${escapeHtml(p.subtopic)}</div><div class="problem-links">${p.leetcode ? `<a href="${p.leetcode}" target="_blank" rel="noreferrer">LeetCode ↗</a>` : ''}${p.gfg ? `<a href="${p.gfg}" target="_blank" rel="noreferrer">GFG ↗</a>` : ''}</div></div><span class="topic-pill">${escapeHtml(p.topic)}</span><span class="difficulty ${p.difficulty.toLowerCase()}">${p.difficulty}</span><button class="check-button" data-action="done" aria-label="Mark ${escapeHtml(p.name)} ${state.done[p.id] ? 'not completed' : 'completed'}">✓</button><span class="note-indicator ${state.notes[p.id] ? 'has-note' : ''}" aria-label="${state.notes[p.id] ? 'Has note' : 'Add note'}"></span></article>`; }
function groupedMarkup(list) { const grouped = topics.filter(topic => list.some(p => p.topic === topic)).map(topic => { const topicProblems = list.filter(p => p.topic === topic); const difficulties = ['Easy', 'Medium', 'Hard'].filter(difficulty => topicProblems.some(p => p.difficulty === difficulty)); return `<details class="topic-group" ${activeTopic === topic || els.search.value.trim() ? 'open' : ''}><summary><span>${escapeHtml(topic)}</span><small>${topicProblems.length} problem${topicProblems.length === 1 ? '' : 's'}</small></summary><div class="difficulty-groups">${difficulties.map(difficulty => { const difficultyProblems = topicProblems.filter(p => p.difficulty === difficulty); return `<details class="difficulty-group"><summary><span class="difficulty ${difficulty.toLowerCase()}">${difficulty}</span><small>${difficultyProblems.length}</small></summary><div class="group-problems">${difficultyProblems.map(problemMarkup).join('')}</div></details>`; }).join('')}</div></details>`; }).join(''); return grouped; }
function render() {
  renderNav();
  const list = filteredProblems();
  els.title.textContent = activeTopic;
  els.crumb.textContent = activeTopic;
  els.resultCount.textContent = `${list.length} problem${list.length === 1 ? '' : 's'}`;
  els.list.innerHTML = groupedMarkup(list);
  els.empty.hidden = list.length !== 0;
  const completed = Object.values(state.done).filter(Boolean).length;
  const notes = Object.values(state.notes).filter(Boolean).length;
  const percent = Math.round(completed / problems.length * 100);
  els.total.textContent = `${completed} / ${problems.length}`; els.completed.textContent = completed; els.revisit.textContent = problems.length - completed; els.notes.textContent = notes; els.bar.style.width = `${percent}%`; els.percent.textContent = `${percent}%`;
}
function escapeHtml(value) { return String(value || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c])); }
function openNote(id) { const p = problems.find(item => item.id === id); noteId = id; els.noteTitle.textContent = p.name; els.noteMeta.textContent = `${p.topic} · ${p.difficulty} · #${p.id}`; els.noteInput.value = state.notes[id] || ''; els.modal.hidden = false; els.noteInput.focus(); }
function closeNote() { els.modal.hidden = true; noteId = null; }

els.topicNav.addEventListener('click', event => { const button = event.target.closest('[data-topic]'); if (!button) return; activeTopic = button.dataset.topic; render(); document.querySelector('#sidebar').classList.remove('open'); });
els.list.addEventListener('click', event => { const row = event.target.closest('.problem-row'); if (!row) return; const id = Number(row.dataset.id); if (event.target.closest('[data-action="done"]')) { state.done[id] = !state.done[id]; saveState(); render(); return; } if (!event.target.closest('a')) openNote(id); });
els.list.addEventListener('keydown', event => { if (event.key !== 'Enter') return; const row = event.target.closest('.problem-row'); if (row) openNote(Number(row.dataset.id)); });
document.querySelectorAll('.view-toggle button').forEach(button => button.addEventListener('click', () => { view = button.dataset.view; document.querySelectorAll('.view-toggle button').forEach(item => item.classList.toggle('active', item === button)); render(); }));
[els.search, els.difficulty, els.sort].forEach(input => input.addEventListener('input', render));
document.querySelector('#saveNote').addEventListener('click', () => { const value = els.noteInput.value.trim(); if (value) state.notes[noteId] = value; else delete state.notes[noteId]; saveState(); closeNote(); render(); });
document.querySelector('#cancelNote').addEventListener('click', closeNote); document.querySelector('#closeModal').addEventListener('click', closeNote); els.modal.addEventListener('click', event => { if (event.target === els.modal) closeNote(); });
document.querySelector('#resetProgress').addEventListener('click', () => { if (!confirm('Reset all completion marks and notes?')) return; state = { done: {}, notes: {} }; saveState(); render(); });
document.querySelector('#openSidebar').addEventListener('click', () => document.querySelector('#sidebar').classList.add('open')); document.querySelector('#closeSidebar').addEventListener('click', () => document.querySelector('#sidebar').classList.remove('open'));
render();
