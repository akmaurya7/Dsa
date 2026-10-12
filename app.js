/**
 * STRIVER A2Z DSA TRACKER · MODERN CLIENT ENGINE & GOOGLE CLOUD SYNC
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// --- Data Initialization ---
const problems = (window.DSA_PROBLEMS || []).map(([id, topic, subtopic, name, difficulty, leetcode, gfg]) => ({
  id: Number(id),
  topic: topic ? topic.trim() : 'General',
  subtopic: subtopic ? subtopic.trim() : '',
  name: name ? name.trim() : 'Problem #' + id,
  difficulty: difficulty || 'Medium',
  leetcode: leetcode || '',
  gfg: gfg || ''
}));
const problemIds = new Set(problems.map(problem => String(problem.id)));
const MAX_NOTE_LENGTH = 5000;
const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

const storeKey = 'dsa-practice-board-v1';
let state = loadState();

// Active filters and views
let activeTopic = 'All problems';
let view = 'all'; // 'all' | 'pending' | 'done' | 'starred' | 'notes'
let difficultyFilter = 'all';
let layoutMode = state.layout || 'grouped'; // 'grouped' | 'flat'
let currentNoteId = null;
let topicFilterQuery = '';

// Firebase State
let auth = null;
let db = null;
let googleProvider = null;
let currentUser = null;
let cloudSyncTimeout = null;

// Motivational Wisdom Quotes
const motivationalQuotes = [
  '"Consistent small daily sessions compound. Master the pattern, not just the solution."',
  '"Never memorize code. Understand the invariant, the time complexity, and the boundary condition."',
  '"Stuck on medium/hard problems? Write down 3 test cases by hand and trace with brute-force first."',
  '"Two-pointer, sliding window, and monotonic stacks cover 60% of array interview questions."',
  '"Every rejected submission is feedback. Diagnose why your edge case failed before peeking at solutions."',
  '"Consistency beats intensity. 2 problems a day for 6 months beats 10 problems a day for 2 weeks."',
  '"Before writing a single line of code, speak your algorithm’s time & space complexity out loud."',
  '"Recursion is just mathematical induction. Base condition, hypothesis, and induction step."',
  '"In Dynamic Programming: Identify overlapping subproblems, define state, and build the recurrence."',
  '"Graph BFS gives shortest paths in unweighted graphs; DFS is optimal for cycles and topological sorts."'
];
let quoteIndex = 0;

// Topic Icons Mapping
const topicIcons = {
  'Learn the Basics': '🔢',
  'Sorting': '⚡',
  'Arrays': '📊',
  'Binary Search': '🔍',
  'Strings': '🔤',
  'LinkedList': '🔗',
  'Recursion': '🔁',
  'Bit Manipulation & Advanced Maths': '👾',
  'Stack and Queues': '📚',
  'Sliding Window & Two Pointer Combined Problems': '🪟',
  'Heaps': '⛰️',
  'Greedy Algorithms': '🎯',
  'Binary Trees': '🌲',
  'Binary Search Trees': '🌿',
  'Graphs': '🕸️',
  'Dynamic Programming': '🧩',
  'Tries': '🌳'
};

// --- State Persistence ---
function loadState() {
  try {
    return sanitizeState(JSON.parse(localStorage.getItem(storeKey)) || {});
  } catch (e) {
    return { done: {}, notes: {}, starred: {}, theme: 'dark', layout: 'grouped' };
  }
}

function sanitizeState(data) {
  const source = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const booleanMap = value => Object.fromEntries(
    Object.entries(value && typeof value === 'object' && !Array.isArray(value) ? value : {})
      .filter(([id, enabled]) => problemIds.has(id) && enabled === true)
  );
  const notes = Object.fromEntries(
    Object.entries(source.notes && typeof source.notes === 'object' && !Array.isArray(source.notes) ? source.notes : {})
      .filter(([id, note]) => problemIds.has(id) && typeof note === 'string' && note.trim())
      .map(([id, note]) => [id, note.trim().slice(0, MAX_NOTE_LENGTH)])
  );
  return {
    done: booleanMap(source.done),
    notes,
    starred: booleanMap(source.starred),
    theme: source.theme === 'light' ? 'light' : 'dark',
    layout: source.layout === 'flat' ? 'flat' : 'grouped'
  };
}

function saveLocalStateOnly() {
  state.layout = layoutMode;
  try {
    localStorage.setItem(storeKey, JSON.stringify(sanitizeState(state)));
  } catch (error) {
    showToast('Local storage is full; export a backup and clear space.', '⚠️');
  }
}

function saveState() {
  saveLocalStateOnly();
  syncToCloud();
}

// --- Topics Analysis ---
const topics = [...new Set(problems.map(p => p.topic))];
const topicCounts = Object.fromEntries(topics.map(t => [t, problems.filter(p => p.topic === t).length]));

// --- DOM Elements References ---
const els = {
  // Theme
  themeToggle: document.getElementById('themeToggle'),
  // Auth Controls
  authContainer: document.getElementById('authContainer'),
  googleSignInBtn: document.getElementById('googleSignInBtn'),
  userProfileMenu: document.getElementById('userProfileMenu'),
  syncIndicator: document.getElementById('syncIndicator'),
  syncStatusText: document.getElementById('syncStatusText'),
  userAvatarWrap: document.getElementById('userAvatarWrap'),
  userAvatar: document.getElementById('userAvatar'),
  userInitials: document.getElementById('userInitials'),
  userDropdownPanel: document.getElementById('userDropdownPanel'),
  userDisplayName: document.getElementById('userDisplayName'),
  userEmail: document.getElementById('userEmail'),
  forceSyncBtn: document.getElementById('forceSyncBtn'),
  googleSignOutBtn: document.getElementById('googleSignOutBtn'),
  // Sidebar
  sidebar: document.getElementById('sidebar'),
  openSidebar: document.getElementById('openSidebar'),
  closeSidebar: document.getElementById('closeSidebar'),
  topicNav: document.getElementById('topicNav'),
  topicSearchInput: document.getElementById('topicSearchInput'),
  exportBtn: document.getElementById('exportBtn'),
  importBtn: document.getElementById('importBtn'),
  importFileInput: document.getElementById('importFileInput'),
  // Topbar
  crumbTopic: document.getElementById('crumbTopic'),
  randomProblemBtn: document.getElementById('randomProblemBtn'),
  resetProgress: document.getElementById('resetProgress'),
  streakDisplay: document.getElementById('streakDisplay'),
  // Hero
  heroPercent: document.getElementById('heroPercent'),
  heroFraction: document.getElementById('heroFraction'),
  gaugeProgressCircle: document.getElementById('gaugeProgressCircle'),
  heroEasyCount: document.getElementById('heroEasyCount'),
  heroMedCount: document.getElementById('heroMedCount'),
  heroHardCount: document.getElementById('heroHardCount'),
  resumeNextBtn: document.getElementById('resumeNextBtn'),
  viewStarredHeroBtn: document.getElementById('viewStarredHeroBtn'),
  heroStarredLabel: document.getElementById('heroStarredLabel'),
  // Stats cards
  totalProgress: document.getElementById('totalProgress'),
  totalBar: document.getElementById('totalBar'),
  overallPercentLabel: document.getElementById('overallPercentLabel'),
  easyProgress: document.getElementById('easyProgress'),
  easyBar: document.getElementById('easyBar'),
  easyPercentLabel: document.getElementById('easyPercentLabel'),
  mediumProgress: document.getElementById('mediumProgress'),
  mediumBar: document.getElementById('mediumBar'),
  medPercentLabel: document.getElementById('medPercentLabel'),
  hardProgress: document.getElementById('hardProgress'),
  hardBar: document.getElementById('hardBar'),
  hardPercentLabel: document.getElementById('hardPercentLabel'),
  // Workspace & Filters
  queueTitle: document.getElementById('queueTitle'),
  searchInput: document.getElementById('searchInput'),
  clearSearchBtn: document.getElementById('clearSearchBtn'),
  sortSelect: document.getElementById('sortSelect'),
  resultCount: document.getElementById('resultCount'),
  problemList: document.getElementById('problemList'),
  emptyState: document.getElementById('emptyState'),
  resetFiltersBtn: document.getElementById('resetFiltersBtn'),
  layoutGroupedBtn: document.getElementById('layoutGroupedBtn'),
  layoutFlatBtn: document.getElementById('layoutFlatBtn'),
  groupAccordionControls: document.getElementById('groupAccordionControls'),
  expandAllBtn: document.getElementById('expandAllBtn'),
  collapseAllBtn: document.getElementById('collapseAllBtn'),
  // Counts
  countAll: document.getElementById('countAll'),
  countPending: document.getElementById('countPending'),
  countDone: document.getElementById('countDone'),
  countStarred: document.getElementById('countStarred'),
  countNotes: document.getElementById('countNotes'),
  // Rail Insights
  railFocus: document.getElementById('railFocus'),
  railFocusMeta: document.getElementById('railFocusMeta'),
  railFocusBar: document.getElementById('railFocusBar'),
  railFocusFraction: document.getElementById('railFocusFraction'),
  railFocusPercent: document.getElementById('railFocusPercent'),
  difficultyBars: document.getElementById('difficultyBars'),
  railDone: document.getElementById('railDone'),
  railStarred: document.getElementById('railStarred'),
  railNotes: document.getElementById('railNotes'),
  motivationalQuote: document.getElementById('motivationalQuote'),
  newQuoteBtn: document.getElementById('newQuoteBtn'),
  // Note Modal
  noteModal: document.getElementById('noteModal'),
  closeModal: document.getElementById('closeModal'),
  noteTitle: document.getElementById('noteTitle'),
  noteMeta: document.getElementById('noteMeta'),
  noteInput: document.getElementById('noteInput'),
  noteCharCount: document.getElementById('noteCharCount'),
  saveNote: document.getElementById('saveNote'),
  cancelNote: document.getElementById('cancelNote'),
  deleteNoteBtn: document.getElementById('deleteNoteBtn'),
  // Random Modal
  randomModal: document.getElementById('randomModal'),
  closeRandomModal: document.getElementById('closeRandomModal'),
  randomCardContent: document.getElementById('randomCardContent'),
  rollAgainBtn: document.getElementById('rollAgainBtn'),
  solveRandomBtn: document.getElementById('solveRandomBtn'),
  // Toast Container
  toastContainer: document.getElementById('toastContainer')
};

// Apply initial theme
document.documentElement.setAttribute('data-theme', state.theme || 'dark');

// --- Toast Notifications ---
function showToast(message, icon = '✨') {
  if (!els.toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
  els.toastContainer.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3200);
}

// --- Confetti Canvas Animation ---
const canvas = document.getElementById('confettiCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
let particles = [];
let confettiAnimationId = null;

function resizeCanvas() {
  if (!canvas) return;
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function fireConfetti(originX, originY) {
  if (!ctx) return;
  const colors = ['#10b981', '#06b6d4', '#6366f1', '#f59e0b', '#ec4899', '#3b82f6'];
  const count = 45;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 8 + 3;
    particles.push({
      x: originX || window.innerWidth / 2,
      y: originY || window.innerHeight / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      size: Math.random() * 6 + 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotationSpeed: (Math.random() - 0.5) * 15,
      alpha: 1,
      decay: Math.random() * 0.02 + 0.015
    });
  }

  if (!confettiAnimationId) {
    updateConfetti();
  }
}

function updateConfetti() {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22; // gravity
    p.rotation += p.rotationSpeed;
    p.alpha -= p.decay;

    if (p.alpha <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.translate(p.x, p.y);
    ctx.rotate((p.rotation * Math.PI) / 180);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore();
  }

  if (particles.length > 0) {
    confettiAnimationId = requestAnimationFrame(updateConfetti);
  } else {
    confettiAnimationId = null;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// --- SVG Icons Helper ---
const ICONS = {
  leetcode: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M13.483 0a1.374 1.374 0 0 0-.961.438L7.116 6.226l-3.854 4.126a5.266 5.266 0 0 0-1.209 2.104 5.35 5.35 0 0 0-.125.513 5.527 5.527 0 0 0 .062 2.362 5.83 5.83 0 0 0 .349 1.017 5.938 5.938 0 0 0 4.818 3.559 5.874 5.874 0 0 0 3.023-.427l6.096-3.267a1.365 1.365 0 0 0 .68-1.189 1.365 1.365 0 0 0-.68-1.189l-5.184-2.78a2.122 2.122 0 0 1-.956-1.745 2.122 2.122 0 0 1 .956-1.745l4.896-4.46a1.374 1.374 0 0 0 .438-.961 1.374 1.374 0 0 0-1.374-1.374zM8.31 16.582l-3.05 1.634a3.185 3.185 0 0 1-2.615-.195 3.125 3.125 0 0 1-1.39-2.025 3.033 3.033 0 0 1-.033-1.328 2.87 2.87 0 0 1 .665-1.157l3.208-3.435 4.385 2.351a4.854 4.854 0 0 0 2.19.52 4.854 4.854 0 0 0 2.19-.52l-5.56 4.155z"/></svg>`,
  gfg: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.88 15.68a5.558 5.558 0 0 1-3.95 1.62c-3.13 0-5.67-2.54-5.67-5.67s2.54-5.67 5.67-5.67c1.47 0 2.81.56 3.82 1.48l-1.57 1.57a3.42 3.42 0 0 0-2.25-.85c-1.92 0-3.47 1.55-3.47 3.47s1.55 3.47 3.47 3.47c1.37 0 2.45-.73 2.89-1.77H13.5v-2.2h5.08c.07.36.1.72.1 1.11 0 1.94-.74 3.7-1.8 4.97z"/></svg>`,
  starOutline: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.8" fill="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  starFilled: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
  noteIcon: `<svg viewBox="0 0 24 24" width="15" height="15" stroke="currentColor" stroke-width="1.8" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>`,
  checkIcon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`,
  chevronRight: `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none"><polyline points="9 18 15 12 9 6"></polyline></svg>`
};

// --- Helper Functions ---
function escapeHtml(value) {
  return String(value || '').replace(/[&<>'"]/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[c]));
}

function safeExternalUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

// --- Render Sidebar Navigation ---
function renderNav() {
  const filterTerm = topicFilterQuery.trim().toLowerCase();
  const visibleTopics = topics.filter(t => !filterTerm || t.toLowerCase().includes(filterTerm));

  const allCompleted = Object.values(state.done).filter(Boolean).length;
  const allPercent = Math.round((allCompleted / problems.length) * 100);

  let html = `
    <button class="topic-button ${activeTopic === 'All problems' ? 'active' : ''}" data-topic="All problems">
      <div class="topic-button-main">
        <div class="topic-title-wrap">
          <span class="topic-icon">⚡</span>
          <span class="topic-name">All Problems</span>
        </div>
        <span class="topic-badge">${allCompleted}/${problems.length}</span>
      </div>
      <div class="topic-progress-track">
        <div class="topic-progress-fill" style="width: ${allPercent}%"></div>
      </div>
    </button>
  `;

  visibleTopics.forEach(topic => {
    const topicProblems = problems.filter(p => p.topic === topic);
    const doneCount = topicProblems.filter(p => state.done[p.id]).length;
    const totalCount = topicProblems.length;
    const pct = Math.round((doneCount / totalCount) * 100);
    const isMastered = doneCount === totalCount && totalCount > 0;
    const icon = topicIcons[topic] || '📁';

    html += `
      <button class="topic-button ${activeTopic === topic ? 'active' : ''} ${isMastered ? 'is-mastered' : ''}" data-topic="${escapeHtml(topic)}">
        <div class="topic-button-main">
          <div class="topic-title-wrap">
            <span class="topic-icon">${icon}</span>
            <span class="topic-name">${escapeHtml(topic)}</span>
          </div>
          <span class="topic-badge">${isMastered ? '✓ ' : ''}${doneCount}/${totalCount}</span>
        </div>
        <div class="topic-progress-track">
          <div class="topic-progress-fill" style="width: ${pct}%"></div>
        </div>
      </button>
    `;
  });

  els.topicNav.innerHTML = html;
}

// --- Filter Problems ---
function getFilteredProblems() {
  const term = els.searchInput.value.trim().toLowerCase();

  let list = problems.filter(p => {
    if (activeTopic !== 'All problems' && p.topic !== activeTopic) return false;
    if (difficultyFilter !== 'all' && p.difficulty !== difficultyFilter) return false;
    if (view === 'pending' && state.done[p.id]) return false;
    if (view === 'done' && !state.done[p.id]) return false;
    if (view === 'starred' && !state.starred[p.id]) return false;
    if (view === 'notes' && !state.notes[p.id]) return false;

    if (term) {
      const hay = [p.name, p.topic, p.subtopic, p.id].join(' ').toLowerCase();
      if (!hay.includes(term)) return false;
    }

    return true;
  });

  const sortVal = els.sortSelect.value;
  if (sortVal === 'diff-asc') {
    const order = { Easy: 1, Medium: 2, Hard: 3 };
    list.sort((a, b) => order[a.difficulty] - order[b.difficulty] || a.id - b.id);
  } else if (sortVal === 'diff-desc') {
    const order = { Easy: 1, Medium: 2, Hard: 3 };
    list.sort((a, b) => order[b.difficulty] - order[a.difficulty] || a.id - b.id);
  } else if (sortVal === 'topic') {
    list.sort((a, b) => a.topic.localeCompare(b.topic) || a.id - b.id);
  } else if (sortVal === 'name') {
    list.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  } else {
    list.sort((a, b) => a.id - b.id);
  }

  return list;
}

// --- Problem Row Markup ---
function renderProblemRow(p) {
  const isDone = !!state.done[p.id];
  const isStarred = !!state.starred[p.id];
  const hasNote = !!state.notes[p.id];
  const diffClass = p.difficulty.toLowerCase();
  const leetcodeUrl = safeExternalUrl(p.leetcode);
  const gfgUrl = safeExternalUrl(p.gfg);

  return `
    <article class="problem-row ${isDone ? 'is-done' : ''}" data-id="${p.id}" tabindex="0">
      <button class="check-btn" data-action="toggle-done" aria-label="Mark problem as ${isDone ? 'incomplete' : 'solved'}">
        ${ICONS.checkIcon}
      </button>
      <span class="problem-id">#${String(p.id).padStart(3, '0')}</span>
      <div class="problem-info-cell">
        <div class="problem-title-text" data-action="open-note" title="Click to view/edit notes">${escapeHtml(p.name)}</div>
        <div class="problem-meta-tags">
          ${p.subtopic ? `<span class="subtopic-tag">${escapeHtml(p.subtopic)}</span>` : ''}
        </div>
      </div>
      <div class="diff-badge ${diffClass}">
        <span class="dot"></span>
        <span>${p.difficulty}</span>
      </div>
      <div class="problem-links-cell">
        ${leetcodeUrl ? `<a class="platform-link leetcode" href="${escapeHtml(leetcodeUrl)}" target="_blank" rel="noopener noreferrer" title="Solve on LeetCode">${ICONS.leetcode}<span>LC</span></a>` : ''}
        ${gfgUrl ? `<a class="platform-link gfg" href="${escapeHtml(gfgUrl)}" target="_blank" rel="noopener noreferrer" title="Solve on GeeksforGeeks">${ICONS.gfg}<span>GFG</span></a>` : ''}
      </div>
      <div class="problem-actions-cell">
        <button class="action-icon-btn star-btn ${isStarred ? 'is-starred' : ''}" data-action="toggle-star" title="${isStarred ? 'Remove from starred' : 'Star for revision'}">
          ${isStarred ? ICONS.starFilled : ICONS.starOutline}
        </button>
        <button class="action-icon-btn note-btn ${hasNote ? 'has-note' : ''}" data-action="open-note" title="${hasNote ? 'Edit study note' : 'Add study note'}">
          ${ICONS.noteIcon}
        </button>
      </div>
    </article>
  `;
}

// --- Grouped Markup Render ---
function renderGroupedList(list, openTopicNames = new Set(), openSubtopicKeys = new Set()) {
  const presentTopics = topics.filter(t => list.some(p => p.topic === t));
  if (presentTopics.length === 0) return '';

  const isSearchActive = Boolean(els.searchInput.value.trim());

  return presentTopics.map(topic => {
    const topicProblems = list.filter(p => p.topic === topic);
    const allTopicProblems = problems.filter(p => p.topic === topic);
    const doneInTopic = allTopicProblems.filter(p => state.done[p.id]).length;
    const pct = Math.round((doneInTopic / allTopicProblems.length) * 100);
    const icon = topicIcons[topic] || '📁';

    const isTopicOpen =
      isSearchActive ||
      activeTopic === topic ||
      openTopicNames.has(topic) ||
      (activeTopic === 'All problems' && openTopicNames.size === 0 && topic === topics[0]);

    const subtopics = [...new Set(topicProblems.map(p => p.subtopic))];

    const subtopicsMarkup = subtopics.map(subtopic => {
      const subProblems = topicProblems.filter(p => p.subtopic === subtopic);
      const subDone = subProblems.filter(p => state.done[p.id]).length;
      const subtopicKey = topic + '::' + (subtopic || '');

      const isSubtopicOpen = isSearchActive || openSubtopicKeys.has(subtopicKey);

      return `
        <details class="subtopic-group" data-subtopic-key="${escapeHtml(subtopicKey)}" ${isSubtopicOpen ? 'open' : ''}>
          <summary>
            <div class="subtopic-summary-left">
              <span class="subtopic-chevron">${ICONS.chevronRight}</span>
              <span>${escapeHtml(subtopic || 'General')}</span>
            </div>
            <small>${subDone}/${subProblems.length}</small>
          </summary>
          <div class="group-problems-list">
            ${subProblems.map(renderProblemRow).join('')}
          </div>
        </details>
      `;
    }).join('');

    return `
      <details class="topic-group" data-topic-name="${escapeHtml(topic)}" ${isTopicOpen ? 'open' : ''}>
        <summary>
          <div class="topic-summary-left">
            <span class="summary-chevron">${ICONS.chevronRight}</span>
            <span class="topic-icon">${icon}</span>
            <span class="topic-group-title">${escapeHtml(topic)}</span>
          </div>
          <div class="topic-summary-right">
            <span class="topic-group-stat">${doneInTopic} / ${allTopicProblems.length}</span>
            <div class="topic-group-bar">
              <div class="topic-group-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
        </summary>
        <div class="subtopic-container">
          ${subtopicsMarkup}
        </div>
      </details>
    `;
  }).join('');
}

// --- Flat Markup Render ---
function renderFlatList(list) {
  return `
    <div class="topic-group" style="padding: 6px 0;">
      <div class="group-problems-list">
        ${list.map(renderProblemRow).join('')}
      </div>
    </div>
  `;
}

// --- Main Render Function ---
function render() {
  renderNav();

  const openTopicNames = new Set(
    [...document.querySelectorAll('.topic-group[open]')].map(el => el.dataset.topicName).filter(Boolean)
  );
  const openSubtopicKeys = new Set(
    [...document.querySelectorAll('.subtopic-group[open]')].map(el => el.dataset.subtopicKey).filter(Boolean)
  );

  const list = getFilteredProblems();

  els.queueTitle.textContent = activeTopic;
  els.crumbTopic.textContent = activeTopic;
  els.resultCount.textContent = `${list.length} problem${list.length === 1 ? '' : 's'}`;

  if (layoutMode === 'grouped') {
    els.groupAccordionControls.style.display = 'flex';
    els.problemList.innerHTML = renderGroupedList(list, openTopicNames, openSubtopicKeys);
  } else {
    els.groupAccordionControls.style.display = 'none';
    els.problemList.innerHTML = renderFlatList(list);
  }

  els.emptyState.hidden = list.length !== 0;

  const totalDone = Object.values(state.done).filter(Boolean).length;
  const totalStarred = Object.values(state.starred).filter(Boolean).length;
  const totalNotes = Object.values(state.notes).filter(Boolean).length;
  const totalPending = problems.length - totalDone;
  const overallPct = Math.round((totalDone / problems.length) * 100);

  els.countAll.textContent = problems.length;
  els.countPending.textContent = totalPending;
  els.countDone.textContent = totalDone;
  els.countStarred.textContent = totalStarred;
  els.countNotes.textContent = totalNotes;

  els.heroPercent.textContent = `${overallPct}%`;
  els.heroFraction.textContent = `${totalDone} / ${problems.length}`;
  if (els.gaugeProgressCircle) {
    const radius = 66;
    const circumference = 2 * Math.PI * radius; // ~414.7
    const offset = circumference - (overallPct / 100) * circumference;
    els.gaugeProgressCircle.style.strokeDashoffset = offset;
  }

  els.heroStarredLabel.textContent = `Starred (${totalStarred})`;

  const easyProblems = problems.filter(p => p.difficulty === 'Easy');
  const easyDone = easyProblems.filter(p => state.done[p.id]).length;
  const easyPct = Math.round((easyDone / easyProblems.length) * 100);

  const medProblems = problems.filter(p => p.difficulty === 'Medium');
  const medDone = medProblems.filter(p => state.done[p.id]).length;
  const medPct = Math.round((medDone / medProblems.length) * 100);

  const hardProblems = problems.filter(p => p.difficulty === 'Hard');
  const hardDone = hardProblems.filter(p => state.done[p.id]).length;
  const hardPct = Math.round((hardDone / hardProblems.length) * 100);

  els.heroEasyCount.textContent = `${easyDone}/${easyProblems.length} Easy`;
  els.heroMedCount.textContent = `${medDone}/${medProblems.length} Med`;
  els.heroHardCount.textContent = `${hardDone}/${hardProblems.length} Hard`;

  els.totalProgress.textContent = `${totalDone} / ${problems.length}`;
  els.totalBar.style.width = `${overallPct}%`;
  els.overallPercentLabel.textContent = `${overallPct}% of the entire curriculum completed`;

  els.easyProgress.textContent = `${easyDone} / ${easyProblems.length}`;
  els.easyBar.style.width = `${easyPct}%`;
  els.easyPercentLabel.textContent = `${easyPct}% completed (${easyProblems.length - easyDone} left)`;

  els.mediumProgress.textContent = `${medDone} / ${medProblems.length}`;
  els.mediumBar.style.width = `${medPct}%`;
  els.medPercentLabel.textContent = `${medPct}% completed (${medProblems.length - medDone} left)`;

  els.hardProgress.textContent = `${hardDone} / ${hardProblems.length}`;
  els.hardBar.style.width = `${hardPct}%`;
  els.hardPercentLabel.textContent = `${hardPct}% completed (${hardProblems.length - hardDone} left)`;

  const topicFilteredList = activeTopic === 'All problems' ? problems : problems.filter(p => p.topic === activeTopic);
  const topicDone = topicFilteredList.filter(p => state.done[p.id]).length;
  const topicPct = Math.round((topicDone / topicFilteredList.length) * 100);

  els.railFocus.textContent = activeTopic;
  els.railFocusMeta.textContent = `${topicFilteredList.length} problems in this track`;
  els.railFocusBar.style.width = `${topicPct}%`;
  els.railFocusFraction.textContent = `${topicDone} / ${topicFilteredList.length} Solved`;
  els.railFocusPercent.textContent = `${topicPct}%`;

  els.railDone.textContent = `${totalDone} completed`;
  els.railStarred.textContent = `${totalStarred} starred`;
  els.railNotes.textContent = `${totalNotes} notes saved`;

  els.difficultyBars.innerHTML = [
    { name: 'Easy', done: easyDone, total: easyProblems.length, pct: easyPct, color: 'var(--easy)' },
    { name: 'Medium', done: medDone, total: medProblems.length, pct: medPct, color: 'var(--medium)' },
    { name: 'Hard', done: hardDone, total: hardProblems.length, pct: hardPct, color: 'var(--hard)' }
  ].map(d => `
    <div class="rail-diff-row">
      <div class="rail-diff-header">
        <span>${d.name}</span>
        <span class="rail-diff-fraction">${d.done}/${d.total} (${d.pct}%)</span>
      </div>
      <div class="rail-diff-track">
        <div class="rail-diff-fill" style="width: ${d.pct}%; background: ${d.color};"></div>
      </div>
    </div>
  `).join('');
}

// --- Note Modal Handling ---
function openNoteModal(id) {
  const p = problems.find(item => item.id === id);
  if (!p) return;
  currentNoteId = id;

  els.noteTitle.textContent = `#${p.id} · ${p.name}`;
  els.noteMeta.innerHTML = `
    <span class="subtopic-tag">${escapeHtml(p.topic)}</span>
    <span class="meta-divider">•</span>
    <span class="subtopic-tag">${escapeHtml(p.subtopic)}</span>
    <span class="meta-divider">•</span>
    <span class="diff-badge ${p.difficulty.toLowerCase()}"><span class="dot"></span>${p.difficulty}</span>
  `;

  const noteText = state.notes[id] || '';
  els.noteInput.value = noteText;
  updateNoteCharCount();
  els.noteModal.hidden = false;
  setTimeout(() => els.noteInput.focus(), 50);
}

function closeNoteModal() {
  els.noteModal.hidden = true;
  currentNoteId = null;
}

function saveCurrentNote() {
  if (!currentNoteId) return;
  const text = els.noteInput.value.trim().slice(0, MAX_NOTE_LENGTH);
  if (text) {
    state.notes[currentNoteId] = text;
    showToast('Study note saved!', '📝');
  } else {
    delete state.notes[currentNoteId];
    showToast('Note cleared', '🗑️');
  }
  saveState();
  closeNoteModal();
  render();
}

function deleteCurrentNote() {
  if (!currentNoteId) return;
  if (confirm('Are you sure you want to delete this study note?')) {
    delete state.notes[currentNoteId];
    saveState();
    closeNoteModal();
    showToast('Note deleted', '🗑️');
    render();
  }
}

function updateNoteCharCount() {
  const len = els.noteInput.value.length;
  els.noteCharCount.textContent = `${len} character${len === 1 ? '' : 's'}`;
}

// --- Random Problem Challenge Modal ---
function openRandomChallenge() {
  const pending = problems.filter(p => !state.done[p.id]);
  const pool = pending.length > 0 ? pending : problems;
  const randomPick = pool[Math.floor(Math.random() * pool.length)];

  if (!randomPick) return;
  const leetcodeUrl = safeExternalUrl(randomPick.leetcode);
  const gfgUrl = safeExternalUrl(randomPick.gfg);

  els.randomCardContent.innerHTML = `
    <div class="rand-title">#${randomPick.id} · ${escapeHtml(randomPick.name)}</div>
    <div class="rand-meta-row">
      <span class="subtopic-tag">${escapeHtml(randomPick.topic)}</span>
      <span class="meta-divider">•</span>
      <span class="subtopic-tag">${escapeHtml(randomPick.subtopic)}</span>
      <span class="diff-badge ${randomPick.difficulty.toLowerCase()}">
        <span class="dot"></span>${randomPick.difficulty}
      </span>
    </div>
    <div class="problem-links-cell" style="margin-top: 8px;">
      ${leetcodeUrl ? `<a class="platform-link leetcode" href="${escapeHtml(leetcodeUrl)}" target="_blank" rel="noopener noreferrer">${ICONS.leetcode} Solve on LeetCode</a>` : ''}
      ${gfgUrl ? `<a class="platform-link gfg" href="${escapeHtml(gfgUrl)}" target="_blank" rel="noopener noreferrer">${ICONS.gfg} Solve on GFG</a>` : ''}
    </div>
  `;

  els.solveRandomBtn.onclick = () => {
    els.randomModal.hidden = true;
    activeTopic = randomPick.topic;
    view = 'all';
    difficultyFilter = 'all';
    els.searchInput.value = randomPick.name;
    els.clearSearchBtn.hidden = false;
    render();
    setTimeout(() => {
      const row = document.querySelector(`.problem-row[data-id="${randomPick.id}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.style.outline = '2px solid var(--cyan)';
        setTimeout(() => (row.style.outline = 'none'), 2200);
      }
    }, 200);
  };

  els.randomModal.hidden = false;
}

// --- Resume Next Problem ---
function resumeNextProblem() {
  const nextUnsolved = problems.find(p => !state.done[p.id]);
  if (!nextUnsolved) {
    showToast('All 455 problems solved! Outstanding achievement! 🏆', '🎉');
    return;
  }

  activeTopic = nextUnsolved.topic;
  view = 'all';
  difficultyFilter = 'all';
  els.searchInput.value = '';
  els.clearSearchBtn.hidden = true;
  render();

  setTimeout(() => {
    const row = document.querySelector(`.problem-row[data-id="${nextUnsolved.id}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.style.outline = '2px solid var(--easy)';
      setTimeout(() => (row.style.outline = 'none'), 2500);
    }
  }, 200);

  showToast(`Next challenge: #${nextUnsolved.id} ${nextUnsolved.name}`, '🎯');
}

// --- Backup & Restore ---
function exportProgress() {
  const exportData = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    done: state.done,
    notes: state.notes,
    starred: state.starred
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `striver-dsa-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Progress exported as JSON!', '💾');
}

function handleImportFile(event) {
  const file = event.target.files && event.target.files[0];
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    alert('Backup file is too large. The limit is 2 MB.');
    event.target.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = function (e) {
    try {
      const imported = JSON.parse(e.target.result);
      if (imported && typeof imported === 'object' && !Array.isArray(imported) &&
        (imported.done || imported.notes || imported.starred)) {
        const importedState = sanitizeState(imported);
        state.done = importedState.done;
        state.notes = importedState.notes;
        state.starred = importedState.starred;
        saveState();
        render();
        showToast('Progress successfully restored!', '🚀');
      } else {
        alert('Invalid backup file format.');
      }
    } catch (err) {
      alert('Could not parse JSON file.');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// ==========================================================================
// GOOGLE AUTH & CLOUD FIRESTORE SYNCHRONIZATION
// ==========================================================================

function updateAuthUI(user, status = "synced") {
  if (user) {
    if (els.googleSignInBtn) els.googleSignInBtn.hidden = true;
    if (els.userProfileMenu) els.userProfileMenu.hidden = false;
    if (els.userDisplayName) els.userDisplayName.textContent = user.displayName || 'Learner';
    if (els.userEmail) els.userEmail.textContent = user.email || '';

    if (user.photoURL && els.userAvatar) {
      els.userAvatar.src = user.photoURL;
      els.userAvatar.hidden = false;
      if (els.userInitials) els.userInitials.hidden = true;
    } else if (els.userInitials) {
      if (els.userAvatar) els.userAvatar.hidden = true;
      els.userInitials.hidden = false;
      const initial = (user.displayName || user.email || 'U')[0].toUpperCase();
      els.userInitials.textContent = initial;
    }
  } else {
    if (els.googleSignInBtn) els.googleSignInBtn.hidden = false;
    if (els.userProfileMenu) els.userProfileMenu.hidden = true;
    if (els.userDropdownPanel) els.userDropdownPanel.hidden = true;
  }
  setSyncStatus(status);
}

function setSyncStatus(status) {
  if (!els.syncIndicator || !els.syncStatusText) return;
  els.syncIndicator.classList.remove("syncing", "error");
  if (status === "syncing") {
    els.syncIndicator.classList.add("syncing");
    els.syncStatusText.textContent = "Syncing...";
  } else if (status === "error") {
    els.syncIndicator.classList.add("error");
    els.syncStatusText.textContent = "Sync Error";
  } else if (status === "offline") {
    els.syncStatusText.textContent = "Local Mode";
  } else {
    els.syncStatusText.textContent = "Synced";
  }
}

async function loadUserDataFromFirestore(user) {
  if (!db || !user) return;
  try {
    setSyncStatus("syncing");
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const cloudData = sanitizeState(snap.data());
      // Merge cloud data with existing local progress (never lose user's work)
      state = sanitizeState({
        ...state,
        done: { ...(cloudData.done || {}), ...state.done },
        notes: { ...(cloudData.notes || {}), ...state.notes },
        starred: { ...(cloudData.starred || {}), ...state.starred }
      });

      saveLocalStateOnly();
      render();

      // Write merged state back to cloud so both are completely synchronized
      await setDoc(userRef, {
        done: state.done,
        notes: state.notes,
        starred: state.starred,
        lastUpdated: new Date().toISOString()
      }, { merge: true });

      showToast(`Welcome back, ${user.displayName || 'Learner'}! Progress synced.`, "☁️");
    } else {
      // First time sign-in: upload current local progress to cloud
      await setDoc(userRef, {
        done: state.done,
        notes: state.notes,
        starred: state.starred,
        email: user.email || '',
        displayName: user.displayName || '',
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
      });
      showToast(`Welcome, ${user.displayName || 'Learner'}! Progress linked to Google.`, "🚀");
    }
    setSyncStatus("synced");
  } catch (err) {
    console.error("Firestore sync error:", err);
    setSyncStatus("error");
    showToast("Cloud sync notice: Please check Firestore Rules in Firebase console.", "⚠️");
  }
}

function syncToCloud() {
  if (!db || !currentUser) return;
  setSyncStatus("syncing");
  clearTimeout(cloudSyncTimeout);
  cloudSyncTimeout = setTimeout(async () => {
    try {
      const userRef = doc(db, "users", currentUser.uid);
      await setDoc(userRef, {
        done: state.done,
        notes: state.notes,
        starred: state.starred,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
      setSyncStatus("synced");
    } catch (err) {
      console.error("Cloud save failed:", err);
      setSyncStatus("error");
    }
  }, 750);
}

async function handleGoogleSignIn() {
  if (!auth || !googleProvider) {
    showToast("Firebase sign-in is not configured. Check the deployment settings.", "⚠️");
    return;
  }
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    showAuthError(err);
  }
}

function showAuthError(err) {
  console.error("Google sign-in error:", err);
  if (err.code === "auth/unauthorized-domain") {
    showToast("Domain not authorized in Firebase! Add your domain in Firebase Console.", "⚠️");
  } else if (err.code === "auth/operation-not-allowed") {
    showToast("Enable Google sign-in in Firebase Authentication settings.", "⚠️");
  } else if (err.code === "auth/internal-error") {
    showToast("Firebase setup error. Check Vercel config and Firebase authorized domains.", "⚠️");
  } else if (err.code !== "auth/popup-closed-by-user") {
    showToast(err.message || "Sign-in error", "⚠️");
  }
}

async function handleSignOut() {
  if (!auth) return;
  try {
    await signOut(auth);
    showToast("Signed out. Using local storage mode.", "👋");
  } catch (err) {
    console.error("Sign-out error:", err);
  }
}

async function initFirebase() {
  try {
    const res = await fetch('/api/config');
    if (!res.ok) {
      console.info("Firebase: /api/config returned " + res.status + " (Local fallback mode).");
      updateAuthUI(null, "offline");
      return;
    }
    const config = await res.json();
    if (config && !config.authDomain && config.projectId) {
      config.authDomain = `${config.projectId}.firebaseapp.com`;
    }
    const missingConfig = ['apiKey', 'authDomain', 'projectId', 'appId']
      .filter(key => !config || !config[key]);
    if (missingConfig.length) {
      console.info("Firebase: Missing config fields:", missingConfig.join(', '));
      updateAuthUI(null, "offline");
      return;
    }

    const app = initializeApp(config);
    auth = getAuth(app);
    db = getFirestore(app);
    googleProvider = new GoogleAuthProvider();

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        currentUser = user;
        updateAuthUI(user, "syncing");
        await loadUserDataFromFirestore(user);
      } else {
        currentUser = null;
        updateAuthUI(null, "offline");
      }
    });
  } catch (err) {
    console.warn("Firebase initialization skipped (running locally or offline):", err);
    updateAuthUI(null, "offline");
  }
}

// --- Event Listeners Setup ---

// Sidebar Topic Click
els.topicNav.addEventListener('click', event => {
  const btn = event.target.closest('[data-topic]');
  if (!btn) return;
  activeTopic = btn.dataset.topic;
  render();
  els.sidebar.classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// Sidebar Search
els.topicSearchInput.addEventListener('input', e => {
  topicFilterQuery = e.target.value;
  renderNav();
});

// Problem List Interactions (Done, Star, Note)
els.problemList.addEventListener('click', event => {
  const target = event.target;
  const row = target.closest('.problem-row');
  if (!row) return;

  const id = Number(row.dataset.id);

  // Done Checkbox Click
  if (target.closest('[data-action="toggle-done"]')) {
    const isNowDone = !state.done[id];
    state.done[id] = isNowDone;
    saveState();

    if (isNowDone) {
      const rect = target.getBoundingClientRect();
      fireConfetti(rect.left + rect.width / 2, rect.top + rect.height / 2);
      showToast(`Problem #${id} solved! Great job!`, '🎉');
    }

    render();
    return;
  }

  // Star Toggle Click
  if (target.closest('[data-action="toggle-star"]')) {
    state.starred[id] = !state.starred[id];
    saveState();
    showToast(state.starred[id] ? `Problem #${id} starred for revision` : `Problem #${id} unstarred`, '⭐');
    render();
    return;
  }

  // Open Note Click
  if (target.closest('[data-action="open-note"]')) {
    openNoteModal(id);
    return;
  }

  // External link clicks
  if (target.closest('a')) {
    return;
  }
});

// Status Filter Tabs
document.querySelectorAll('.status-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    view = btn.dataset.view;
    document.querySelectorAll('.status-pill').forEach(b => b.classList.toggle('active', b === btn));
    render();
  });
});

// Difficulty Chips
document.querySelectorAll('.diff-chip').forEach(chip => {
  chip.addEventListener('click', () => {
    difficultyFilter = chip.dataset.difficulty;
    document.querySelectorAll('.diff-chip').forEach(c => c.classList.toggle('active', c === chip));
    render();
  });
});

// Layout Toggle
els.layoutGroupedBtn.addEventListener('click', () => {
  layoutMode = 'grouped';
  els.layoutGroupedBtn.classList.add('active');
  els.layoutFlatBtn.classList.remove('active');
  saveState();
  render();
});

els.layoutFlatBtn.addEventListener('click', () => {
  layoutMode = 'flat';
  els.layoutFlatBtn.classList.add('active');
  els.layoutGroupedBtn.classList.remove('active');
  saveState();
  render();
});

if (layoutMode === 'flat') {
  els.layoutFlatBtn.classList.add('active');
  els.layoutGroupedBtn.classList.remove('active');
}

// Accordion Expand/Collapse All
els.expandAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.topic-group, .subtopic-group').forEach(el => el.setAttribute('open', ''));
});

els.collapseAllBtn.addEventListener('click', () => {
  document.querySelectorAll('.topic-group, .subtopic-group').forEach(el => el.removeAttribute('open'));
});

// Search Input & Clear
els.searchInput.addEventListener('input', () => {
  els.clearSearchBtn.hidden = !els.searchInput.value.trim();
  render();
});

els.clearSearchBtn.addEventListener('click', () => {
  els.searchInput.value = '';
  els.clearSearchBtn.hidden = true;
  render();
  els.searchInput.focus();
});

// Sort Select
els.sortSelect.addEventListener('change', render);

// Reset Filters Button in Empty State
els.resetFiltersBtn.addEventListener('click', () => {
  activeTopic = 'All problems';
  view = 'all';
  difficultyFilter = 'all';
  els.searchInput.value = '';
  els.clearSearchBtn.hidden = true;
  document.querySelectorAll('.status-pill').forEach(b => b.classList.toggle('active', b.dataset.view === 'all'));
  document.querySelectorAll('.diff-chip').forEach(c => c.classList.toggle('active', c.dataset.difficulty === 'all'));
  render();
});

// Note Modal Actions
els.noteInput.addEventListener('input', updateNoteCharCount);
els.saveNote.addEventListener('click', saveCurrentNote);
els.cancelNote.addEventListener('click', closeNoteModal);
els.closeModal.addEventListener('click', closeNoteModal);
els.deleteNoteBtn.addEventListener('click', deleteCurrentNote);
els.noteModal.addEventListener('click', e => {
  if (e.target === els.noteModal) closeNoteModal();
});

// Random Modal Actions
els.randomProblemBtn.addEventListener('click', openRandomChallenge);
els.closeRandomModal.addEventListener('click', () => (els.randomModal.hidden = true));
els.rollAgainBtn.addEventListener('click', openRandomChallenge);
els.randomModal.addEventListener('click', e => {
  if (e.target === els.randomModal) els.randomModal.hidden = true;
});

// Hero Quick Actions
els.resumeNextBtn.addEventListener('click', resumeNextProblem);
els.viewStarredHeroBtn.addEventListener('click', () => {
  view = 'starred';
  document.querySelectorAll('.status-pill').forEach(b => b.classList.toggle('active', b.dataset.view === 'starred'));
  render();
  document.querySelector('.workspace').scrollIntoView({ behavior: 'smooth' });
});

// Theme Toggle
els.themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  state.theme = next;
  saveLocalStateOnly();
  showToast(`Switched to ${next} theme`, next === 'dark' ? '🌙' : '☀️');
});

// Google Auth Actions
if (els.googleSignInBtn) {
  els.googleSignInBtn.addEventListener('click', handleGoogleSignIn);
}

if (els.googleSignOutBtn) {
  els.googleSignOutBtn.addEventListener('click', handleSignOut);
}

if (els.userAvatarWrap) {
  els.userAvatarWrap.addEventListener('click', (e) => {
    e.stopPropagation();
    els.userDropdownPanel.hidden = !els.userDropdownPanel.hidden;
  });
}

if (els.forceSyncBtn) {
  els.forceSyncBtn.addEventListener('click', () => {
    if (currentUser) {
      loadUserDataFromFirestore(currentUser);
    }
  });
}

document.addEventListener('click', (e) => {
  if (els.userDropdownPanel && !els.userDropdownPanel.hidden && !e.target.closest('#userProfileMenu')) {
    els.userDropdownPanel.hidden = true;
  }
});

// Mobile Drawer Toggle
els.openSidebar.addEventListener('click', () => els.sidebar.classList.add('open'));
els.closeSidebar.addEventListener('click', () => els.sidebar.classList.remove('open'));

// Export & Import
els.exportBtn.addEventListener('click', exportProgress);
els.importBtn.addEventListener('click', () => els.importFileInput.click());
els.importFileInput.addEventListener('change', handleImportFile);

// Reset Progress
els.resetProgress.addEventListener('click', () => {
  if (confirm('Are you sure you want to completely reset all solved marks, stars, and notes? This action cannot be undone.')) {
    state.done = {};
    state.notes = {};
    state.starred = {};
    saveState();
    render();
    showToast('All progress has been reset', '🔄');
  }
});

// Next Motivational Tip
els.newQuoteBtn.addEventListener('click', () => {
  quoteIndex = (quoteIndex + 1) % motivationalQuotes.length;
  els.motivationalQuote.textContent = motivationalQuotes[quoteIndex];
});

// Keyboard Shortcuts
window.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!els.noteModal.hidden) closeNoteModal();
    if (!els.randomModal.hidden) els.randomModal.hidden = true;
    if (els.userDropdownPanel && !els.userDropdownPanel.hidden) els.userDropdownPanel.hidden = true;
  }
  if (event.key === '/' && document.activeElement !== els.searchInput && document.activeElement !== els.noteInput) {
    event.preventDefault();
    els.searchInput.focus();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !els.noteModal.hidden) {
    event.preventDefault();
    saveCurrentNote();
  }
});

// --- Initial Render & Firebase Boot ---
render();
initFirebase();
