/**
 * WordVault Popup Interface Controller
 */

import { 
  getAllWords, 
  deleteWord, 
  updateWord, 
  exportWords, 
  importWords,
  getAllCollections
} from './storage.js';

import { fetchWordDefinition } from './dictionary.js';
import { formatDate, escapeHtml, truncate } from './utils.js';

// Local State
let allWords = [];
let collections = [];
let searchQuery = "";
let filterCollection = "";
let filterStatus = "";
let toastTimeout = null;

// DOM Elements
const elWordList = document.getElementById("word-list");
const elSearchInput = document.getElementById("search-input");
const elBtnClearSearch = document.getElementById("btn-clear-search");
const elFilterCollectionPopup = document.getElementById("filter-collection-popup");
const elFilterStatusPopup = document.getElementById("filter-status-popup");
const elBtnOptions = document.getElementById("btn-options");
const elBtnImport = document.getElementById("btn-import");
const elBtnExport = document.getElementById("btn-export");
const elFileInput = document.getElementById("file-import");
const elEmptyState = document.getElementById("empty-state");
const elEmptySearchState = document.getElementById("empty-search-state");

// Modal Elements
const elEditModal = document.getElementById("edit-modal");
const elEditForm = document.getElementById("edit-form");
const elEditId = document.getElementById("edit-id");
const elEditWordText = document.getElementById("edit-word");
const elEditMeaning = document.getElementById("edit-meaning");
const elEditSynonyms = document.getElementById("edit-synonyms");
const elEditTags = document.getElementById("edit-tags");
const elEditNotes = document.getElementById("edit-notes");
const elEditStatus = document.getElementById("edit-status");
const elEditCollectionsList = document.getElementById("edit-collections-list");
const elBtnModalCancel = document.getElementById("btn-modal-cancel");
const elModalClose = document.getElementById("modal-close");

// Toast
const elToast = document.getElementById("toast");

// Initialize application popup
document.addEventListener("DOMContentLoaded", async () => {
  initEventListeners();
  loadSettings();
  await loadAndRender();

  // Handle keyboard workflow trigger
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get(["editLastOnOpen", "focusLastOnOpen", "lastCapturedWordId", "settings"], (result) => {
      const urlParams = new URLSearchParams(window.location.search);
      const focusParam = urlParams.get("focus") === "last";
      
      const editLastOnOpen = result.editLastOnOpen || focusParam;
      const focusLastOnOpen = result.focusLastOnOpen;
      
      if (editLastOnOpen || focusLastOnOpen) {
        if (editLastOnOpen) {
          window.wasOpenedForEditing = true;
          chrome.storage.local.remove("editLastOnOpen");
        }
        if (focusLastOnOpen) {
          chrome.storage.local.remove("focusLastOnOpen");
        }

        const settings = result.settings || {
          focusLastCaptured: true,
          highlightLastCaptured: true,
          afterCaptureWorkflow: "popup"
        };

        const lastCapturedWordId = result.lastCapturedWordId;
        if (!lastCapturedWordId) {
          showToast("No recently captured word.");
          return;
        }

        const wordObj = allWords.find(w => w.id === lastCapturedWordId);
        if (!wordObj) {
          showToast("No recently captured word.");
          return;
        }

        if (settings.focusLastCaptured !== false) {
          const cardEl = document.querySelector(`.word-card[data-id="${lastCapturedWordId}"]`);
          if (cardEl) {
            cardEl.scrollIntoView({ behavior: "smooth", block: "center" });

            if (settings.highlightLastCaptured !== false) {
              cardEl.classList.add("last-captured-glow");
              setTimeout(() => {
                cardEl.classList.remove("last-captured-glow");
              }, 2000);
            }
          }

          if (editLastOnOpen) {
            setTimeout(() => {
              openEditModal(wordObj);
            }, 200);
          }
        }
      }
    });
  } else {
    // Local preview fallback
    const focusParam = new URLSearchParams(window.location.search).get("focus") === "last";
    const editLastOnOpen = localStorage.getItem("editLastOnOpen") === "true" || focusParam;
    const focusLastOnOpen = localStorage.getItem("focusLastOnOpen") === "true";
    
    if (editLastOnOpen || focusLastOnOpen) {
      if (editLastOnOpen) {
        window.wasOpenedForEditing = true;
        localStorage.removeItem("editLastOnOpen");
      }
      if (focusLastOnOpen) {
        localStorage.removeItem("focusLastOnOpen");
      }

      const lastCapturedWordId = localStorage.getItem("lastCapturedWordId");
      if (!lastCapturedWordId) {
        showToast("No recently captured word.");
        return;
      }

      const wordObj = allWords.find(w => w.id === lastCapturedWordId);
      if (!wordObj) {
        showToast("No recently captured word.");
        return;
      }

      const cardEl = document.querySelector(`.word-card[data-id="${lastCapturedWordId}"]`);
      if (cardEl) {
        cardEl.scrollIntoView({ behavior: "smooth", block: "center" });
        cardEl.classList.add("last-captured-glow");
        setTimeout(() => cardEl.classList.remove("last-captured-glow"), 2000);
      }
      
      if (editLastOnOpen) {
        setTimeout(() => {
          openEditModal(wordObj);
        }, 200);
      }
    }
  }

  // Listen for changes in local storage to keep the view perfectly synced
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local") {
        if (changes.words) {
          loadAndRender();
        }
        if (changes.settings) {
          applySettings(changes.settings.newValue);
        }
      }
    });
  }
});

function initEventListeners() {
  // Search
  elSearchInput.addEventListener("input", handleSearch);
  elBtnClearSearch.addEventListener("click", clearSearch);

  // Filters & Action buttons
  elFilterCollectionPopup.addEventListener("change", (e) => {
    filterCollection = e.target.value;
    render();
  });
  elFilterStatusPopup.addEventListener("change", (e) => {
    filterStatus = e.target.value;
    render();
  });
  
  elBtnOptions.addEventListener("click", openOptionsPage);
  elBtnExport.addEventListener("click", handleExport);
  elBtnImport.addEventListener("click", () => elFileInput.click());
  elFileInput.addEventListener("change", handleImport);

  // Modal Cancel & Close
  elBtnModalCancel.addEventListener("click", closeEditModal);
  elModalClose.addEventListener("click", closeEditModal);
  elEditForm.addEventListener("submit", saveEditChanges);

  // Global keyboard shortcuts (Escape key)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (elEditModal && elEditModal.style.display === "flex") {
        closeEditModal();
      } else {
        window.close();
      }
    }
  });
}

// Load words from storage and perform rendering
async function loadAndRender() {
  try {
    allWords = await getAllWords();
    collections = await getAllCollections();
    
    // Populate Collection Filter dropdown options
    const prevCollectionVal = elFilterCollectionPopup.value;
    elFilterCollectionPopup.innerHTML = '<option value="">All Collections</option>';
    collections.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col.id;
      opt.textContent = col.name;
      elFilterCollectionPopup.appendChild(opt);
    });
    elFilterCollectionPopup.value = prevCollectionVal;

    // Default sorting: Newest encounters/creations first
    allWords.sort((a, b) => (b.lastSeen || b.createdAt) - (a.lastSeen || a.createdAt));
    render();
  } catch (error) {
    showToast("Error loading data: " + error.message);
  }
}

// Core Render Orchestrator
function render() {
  // Apply filtering rules
  let filtered = [...allWords];

  // 1. Collection Filter
  if (filterCollection) {
    filtered = filtered.filter(w => Array.isArray(w.collectionIds) && w.collectionIds.includes(filterCollection));
  }

  // 2. Status Filter
  if (filterStatus) {
    filtered = filtered.filter(w => w.status === filterStatus);
  }

  // 3. Text Search Filter
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(w => {
      const matchWord = w.word.toLowerCase().includes(q);
      const matchMeaning = w.meaning && w.meaning.toLowerCase().includes(q);
      const matchNotes = w.notes && w.notes.toLowerCase().includes(q);
      const matchTags = w.tags && w.tags.some(tag => tag.toLowerCase().includes(q));
      
      const matchCollections = (w.collectionIds || []).some(cid => {
        const col = collections.find(c => c.id === cid);
        return col && col.name.toLowerCase().includes(q);
      });
      
      const matchHostname = w.hostname && w.hostname.toLowerCase().includes(q);
      const matchExample = w.example && w.example.toLowerCase().includes(q);
      const matchSource = w.sourceName && w.sourceName.toLowerCase().includes(q);
      
      return matchWord || matchMeaning || matchNotes || matchTags || matchCollections || matchHostname || matchExample || matchSource;
    });
  }

  // Handle Empty States
  if (allWords.length === 0) {
    elWordList.style.display = "none";
    elEmptyState.style.display = "flex";
    elEmptySearchState.style.display = "none";
    return;
  } else {
    elEmptyState.style.display = "none";
  }

  if (filtered.length === 0) {
    elWordList.style.display = "none";
    elEmptySearchState.style.display = "flex";
    return;
  } else {
    elEmptySearchState.style.display = "none";
    elWordList.style.display = "flex";
  }

  // Build the list elements
  elWordList.innerHTML = "";
  filtered.forEach(wordObj => {
    const card = createWordCard(wordObj);
    elWordList.appendChild(card);
  });
}

// Generate Card DOM Component
function createWordCard(wordObj) {
  const card = document.createElement("div");
  
  // Dynamic status-specific color styles
  const statusColors = {
    "NEW": { bg: "rgba(156, 163, 175, 0.12)", text: "#9CA3AF" },
    "LEARNING": { bg: "rgba(129, 140, 248, 0.12)", text: "var(--primary)" },
    "REVIEW": { bg: "rgba(245, 158, 11, 0.12)", text: "var(--warning)" },
    "MASTERED": { bg: "rgba(34, 197, 94, 0.12)", text: "var(--success)" }
  };
  const statusStyle = statusColors[wordObj.status || "NEW"] || statusColors["NEW"];

  card.className = "word-card";
  card.dataset.id = wordObj.id;

  // Search Match Highlighting
  const q = searchQuery ? searchQuery.trim().toLowerCase() : "";
  const highlightText = (text) => {
    if (!text) return "";
    const escaped = escapeHtml(text);
    if (!q) return escaped;
    const escapedQuery = escapeHtml(q);
    const regex = new RegExp(`(${escapedQuery.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
    return escaped.replace(regex, `<mark class="search-highlight">$1</mark>`);
  };

  const highlightedWord = highlightText(wordObj.word);
  const highlightedMeaning = highlightText(wordObj.meaning);
  const highlightedSentence = highlightText(wordObj.sentence);
  const highlightedSynonyms = highlightText(wordObj.synonyms);
  const dateFormatted = formatDate(wordObj.lastSeen || wordObj.createdAt);
  const encounterText = wordObj.encounters > 1 ? `${wordObj.encounters} encounters` : `1 encounter`;

  // Get collection names
  const colBadges = (wordObj.collectionIds || [])
    .map(cid => {
      const col = collections.find(c => c.id === cid);
      return col ? `<span class="col-badge" style="background-color: var(--bg-inset); color: var(--text-muted); font-size: var(--font-size-label); padding: 2px var(--space-2); border-radius: var(--radius-sm); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 4px;">📁 ${escapeHtml(col.name)}</span>` : '';
    })
    .join('');

  // Audio button
  const audioBtnHtml = wordObj.phoneticsAudio
    ? `<button class="btn-play-audio" title="Play pronunciation" style="background: none; border: none; cursor: pointer; font-size: var(--font-size-title); transition: var(--t-fast); vertical-align: middle;">🔊</button>`
    : '';

  // Phonetic display
  const phoneticHtml = wordObj.phonetic
    ? `<span class="phonetic-text" style="color: var(--text-muted); font-size: var(--font-size-caption); font-family: monospace;">${escapeHtml(wordObj.phonetic)}</span>`
    : '';

  // Source display
  const faviconHtml = wordObj.favicon
    ? `<img class="source-favicon" src="${wordObj.favicon}" style="width: 14px; height: 14px; border-radius: 2px; vertical-align: middle;">`
    : '';
  const sourceHtml = `
    <div class="card-source" style="display: flex; align-items: center; gap: 6px; font-size: var(--font-size-caption); color: var(--text-muted);">
      ${faviconHtml}
      <span>${escapeHtml(wordObj.sourceName || 'Direct Capture')}</span>
    </div>
  `;

  // Meaning or Fetch trigger
  let meaningHtml = '';
  if (wordObj.meaning && wordObj.meaning.trim()) {
    const partOfSpeechBadge = wordObj.partOfSpeech 
      ? `<span style="font-style: italic; font-weight: var(--font-weight-medium); color: var(--primary); margin-right: 4px;">(${escapeHtml(wordObj.partOfSpeech)})</span>`
      : '';
    meaningHtml = `<p class="card-meaning">${partOfSpeechBadge}${highlightedMeaning}</p>`;
  } else {
    let statusText = "No meaning available.";
    if (wordObj.dictionaryStatus === "not_found") {
      statusText = "No dictionary entry found.";
    } else if (wordObj.dictionaryStatus === "skipped_phrase") {
      statusText = "Dictionary lookup skipped for phrases.";
    } else if (wordObj.dictionaryStatus === "error") {
      statusText = "Dictionary network error.";
    }

    meaningHtml = `
      <div class="no-meaning-box" style="margin: var(--space-2) 0; display: flex; flex-direction: column; gap: var(--space-2); background-color: var(--bg-inset); padding: var(--space-3); border-radius: var(--radius-md); border: 1px solid var(--border);">
        <span style="font-size: var(--font-size-caption); color: var(--text-muted); font-style: italic;">${statusText}</span>
        <div style="display: flex; gap: var(--space-2); align-items: center; margin-top: 2px;">
          <button class="btn-edit-manually btn btn-secondary" style="padding: 4px var(--space-3); font-size: var(--font-size-label); border-radius: var(--radius-sm); cursor: pointer;">Edit Manually</button>
          <button class="btn-retry-lookup btn btn-primary" style="padding: 4px var(--space-3); font-size: var(--font-size-label); border-radius: var(--radius-sm); cursor: pointer;">Retry Lookup</button>
        </div>
      </div>
    `;
  }

  // HTML Template Construction
  card.innerHTML = `
    <div class="card-header" style="display: flex; justify-content: space-between; align-items: flex-start; gap: var(--space-3); margin-bottom: var(--space-2);">
      <div style="display: flex; flex-direction: column; gap: 2px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <h3 class="card-word-title" style="margin: 0; font-size: var(--font-size-heading); font-weight: var(--font-weight-semibold); color: var(--text-main);">${highlightedWord}</h3>
          ${audioBtnHtml}
          ${phoneticHtml}
        </div>
        ${sourceHtml}
      </div>
      <div style="display: flex; align-items: center; gap: var(--space-2);">
        <span class="encounter-badge" title="${encounterText}">${wordObj.encounters}x</span>
        <span class="status-badge" style="background-color: ${statusStyle.bg}; color: ${statusStyle.text}; font-size: var(--font-size-label); font-weight: var(--font-weight-bold); padding: 2px var(--space-2); border-radius: var(--radius-round); text-transform: uppercase; border: 1px solid var(--border);">${wordObj.status || 'NEW'}</span>
      </div>
    </div>
    
    ${meaningHtml}
    
    ${highlightedSentence ? `<blockquote class="card-sentence" title="Context sentence" style="margin: var(--space-2) 0; font-size: var(--font-size-body); border-left: 2.5px solid var(--primary); padding-left: var(--space-3); color: var(--text-muted); font-style: italic;">&ldquo;${highlightedSentence}&rdquo;</blockquote>` : ''}
    
    ${highlightedSynonyms ? `<p class="card-synonyms" style="font-size: var(--font-size-caption); color: var(--text-muted); margin-bottom: var(--space-2);"><strong>Synonyms:</strong> ${highlightedSynonyms}</p>` : ''}
    
    ${wordObj.example ? `<p class="card-dict-example" style="font-size: var(--font-size-caption); color: var(--text-muted); margin-bottom: var(--space-2);"><strong>Example:</strong> &ldquo;${escapeHtml(wordObj.example)}&rdquo;</p>` : ''}

    <div class="card-collections-tags-row" style="display: flex; flex-wrap: wrap; gap: var(--space-2); margin-top: var(--space-3); margin-bottom: var(--space-3);">
      ${colBadges}
      ${(wordObj.tags || []).map(tag => `<span class="tag-badge">#${highlightText(tag)}</span>`).join('')}
    </div>
    
    <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: var(--space-2); padding-top: var(--space-2); border-top: 1px solid var(--border);">
      <span class="card-date" style="font-size: var(--font-size-label); color: var(--text-muted);" title="Added at: ${new Date(wordObj.createdAt).toLocaleString()}">${dateFormatted}</span>
      <div class="card-actions" style="display: flex; gap: var(--space-2);">
        <button class="card-act-btn edit" title="Edit entry" style="background: none; border: none; cursor: pointer; color: var(--text-muted); transition: var(--t-fast); display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: var(--radius-sm);">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="card-act-btn delete" title="Delete entry" style="background: none; border: none; cursor: pointer; color: var(--text-muted); transition: var(--t-fast); display: flex; align-items: center; justify-content: center; padding: 4px; border-radius: var(--radius-sm);">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
        </button>
      </div>
    </div>
  `;

  // Attach card event listeners
  const faviconImg = card.querySelector(".source-favicon");
  if (faviconImg) {
    faviconImg.addEventListener("error", () => {
      faviconImg.style.display = "none";
    });
  }

  const playBtn = card.querySelector(".btn-play-audio");
  if (playBtn) {
    playBtn.addEventListener("click", () => {
      const audio = new Audio(wordObj.phoneticsAudio);
      audio.play().catch(err => showToast("Audio playback failed"));
    });
  }

  const editManuallyBtn = card.querySelector(".btn-edit-manually");
  if (editManuallyBtn) {
    editManuallyBtn.addEventListener("click", () => {
      openEditModal(wordObj);
    });
  }

  const retryLookupBtn = card.querySelector(".btn-retry-lookup");
  if (retryLookupBtn) {
    retryLookupBtn.addEventListener("click", async () => {
      retryLookupBtn.textContent = "Fetching...";
      retryLookupBtn.disabled = true;
      try {
        const enriched = await fetchWordDefinition(wordObj.word);
        if (enriched) {
          await updateWord(wordObj.id, enriched);
          if (enriched.found) {
            showToast(`Enriched: ${wordObj.word}`);
          } else {
            if (enriched.dictionaryStatus === "skipped_phrase") {
              showToast("Dictionary lookup skipped for phrases.");
            } else {
              showToast("No dictionary entry found.");
            }
          }
          loadAndRender();
        } else {
          showToast("No definition found.");
          retryLookupBtn.textContent = "Retry Lookup";
          retryLookupBtn.disabled = false;
        }
      } catch (err) {
        showToast("Fetch failed: " + err.message);
        retryLookupBtn.textContent = "Retry Lookup";
        retryLookupBtn.disabled = false;
      }
    });
  }

  card.querySelector(".card-act-btn.edit").addEventListener("click", () => openEditModal(wordObj));
  card.querySelector(".card-act-btn.delete").addEventListener("click", () => handleDeleteCard(wordObj.id));

  // Add click-to-filter event listener to each tag badge chip
  card.querySelectorAll(".tag-badge").forEach((badge, index) => {
    badge.addEventListener("click", (e) => {
      e.stopPropagation();
      const rawTag = wordObj.tags[index];
      if (rawTag) {
        elSearchInput.value = rawTag;
        searchQuery = rawTag;
        elBtnClearSearch.style.display = "block";
        render();
      }
    });
  });

  return card;
}

// Handle Search Changes
function handleSearch(e) {
  searchQuery = e.target.value;
  elBtnClearSearch.style.display = searchQuery ? "block" : "none";
  render();
}

// Clear Search Input
function clearSearch() {
  elSearchInput.value = "";
  searchQuery = "";
  elBtnClearSearch.style.display = "none";
  elSearchInput.focus();
  render();
}


// Handle Card Deletion
async function handleDeleteCard(id) {
  const wordObj = allWords.find(w => w.id === id);
  if (wordObj) {
    if (confirm(`Are you sure you want to delete "${wordObj.word}"?`)) {
      const card = document.querySelector(`.word-card[data-id="${id}"]`);
      if (card) {
        card.style.maxHeight = card.offsetHeight + "px";
        // Force reflow
        card.offsetHeight;
        card.classList.add("collapsing-delete");
        setTimeout(async () => {
          try {
            await deleteWord(id);
            showToast(`Deleted: ${wordObj.word}`);
            loadAndRender();
          } catch (e) {
            showToast("Failed to delete word");
          }
        }, 220);
      } else {
        await deleteWord(id);
        showToast(`Deleted: ${wordObj.word}`);
        loadAndRender();
      }
    }
  }
}

// Open Options Dashboard in a new tab
function openOptionsPage() {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage();
  } else {
    window.open(chrome.runtime.getURL('options.html'));
  }
}

// Edit Modal Opening
function openEditModal(wordObj) {
  elEditId.value = wordObj.id;
  elEditWordText.value = wordObj.word;
  elEditMeaning.value = wordObj.meaning || "";
  elEditSynonyms.value = wordObj.synonyms || "";
  elEditTags.value = (wordObj.tags || []).join(", ");
  elEditNotes.value = wordObj.notes || "";
  elEditStatus.value = wordObj.status || "NEW";

  // Render suggested tag if applicable next to status
  const optMastered = elEditStatus.querySelector('option[value="MASTERED"]');
  const optLearning = elEditStatus.querySelector('option[value="LEARNING"]');
  if (optMastered) optMastered.textContent = wordObj.encounters >= 10 ? "Mastered (Suggested)" : "Mastered";
  if (optLearning) optLearning.textContent = (wordObj.meaning && wordObj.meaning.trim()) ? "Learning (Suggested)" : "Learning";

  // Build collections checkboxes
  elEditCollectionsList.innerHTML = "";
  collections.forEach(col => {
    const isChecked = Array.isArray(wordObj.collectionIds) && wordObj.collectionIds.includes(col.id);
    
    const wrapper = document.createElement("label");
    wrapper.style.display = "flex";
    wrapper.style.alignItems = "center";
    wrapper.style.gap = "6px";
    wrapper.style.fontSize = "var(--font-size-caption)";
    wrapper.style.color = "var(--text-main)";
    wrapper.style.cursor = "pointer";

    wrapper.innerHTML = `
      <input type="checkbox" name="edit-col-checkbox" value="${col.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer; accent-color: var(--primary);">
      <span>${escapeHtml(col.name)}</span>
    `;
    elEditCollectionsList.appendChild(wrapper);
  });

  elEditModal.style.display = "flex";
  elEditModal.classList.remove("slide-out");
  
  // Focus the meaning field with slight delay to ensure UI transitions don't block focus
  setTimeout(() => {
    elEditMeaning.focus();
    const val = elEditMeaning.value;
    elEditMeaning.value = '';
    elEditMeaning.value = val;
  }, 50);
}

// Close Edit Modal
function closeEditModal() {
  elEditModal.classList.add("slide-out");
  // Give transition time to end before hiding
  setTimeout(() => {
    elEditModal.style.display = "none";
  }, 250);
}

// Save Modal Form Changes
async function saveEditChanges(e) {
  e.preventDefault();
  const id = elEditId.value;
  const meaning = elEditMeaning.value.trim();
  const synonyms = elEditSynonyms.value.trim();
  
  // Parse tags list
  const tagsStr = elEditTags.value.trim();
  const tags = tagsStr 
    ? tagsStr.split(',').map(tag => tag.trim().toLowerCase()).filter(tag => tag.length > 0)
    : [];

  const notes = elEditNotes.value.trim();
  const status = elEditStatus.value;
  
  // Read checked collections
  const checkboxes = elEditCollectionsList.querySelectorAll('input[name="edit-col-checkbox"]:checked');
  const collectionIds = Array.from(checkboxes).map(cb => cb.value);

  // If no collections are selected, default to General
  if (collectionIds.length === 0) {
    collectionIds.push("col_general");
  }

  try {
    await updateWord(id, {
      meaning,
      synonyms,
      tags,
      notes,
      status,
      collectionIds
    });
    closeEditModal();
    showToast("Changes saved successfully");
    loadAndRender();
  } catch (err) {
    showToast("Failed to save changes: " + err.message);
  }
}

// Export Database JSON
async function handleExport() {
  try {
    const jsonStr = await exportWords();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "wordvault.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("Exported: wordvault.json");
  } catch (error) {
    showToast("Export failed: " + error.message);
  }
}

// Import Database JSON
async function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const jsonText = event.target.result;
      const { addedCount, mergedCount } = await importWords(jsonText);
      showToast(`Imported! Added: ${addedCount}, Merged: ${mergedCount}`);
      elFileInput.value = ""; // Clear file input
      loadAndRender();
    } catch (error) {
      showToast("Import failed: " + error.message);
      elFileInput.value = ""; // Clear file input
    }
  };
  reader.readAsText(file);
}

// Custom Snacktoast Alert
function showToast(message) {
  console.log("Toast requested");
  
  if (elToast) {
    elToast.innerHTML = `
      <div class="toast-content" style="display: flex; align-items: center; gap: 8px; font-family: inherit;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--success)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0; vertical-align: middle;">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
        <span style="color: #FFFFFF !important;">${message}</span>
      </div>
      <div class="toast-progress" style="width: 100%; transition: none;"></div>
    `;
    console.log("Toast element created");
  }
  
  if (toastTimeout) {
    clearTimeout(toastTimeout);
  }
  
  elToast.style.display = "block";
  console.log("Toast displayed");

  // Force layout reflow
  elToast.offsetHeight;

  const progress = elToast.querySelector(".toast-progress");
  if (progress) {
    progress.style.transition = "width 2000ms linear";
    progress.style.width = "0%";
  }

  toastTimeout = setTimeout(() => {
    elToast.style.display = "none";
    console.log("Toast removed");
  }, 2000);
}

// Load and apply settings
function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get("settings", (data) => {
      const settings = data.settings || {
        compactMode: false,
        darkMode: false,
        animations: true,
        notifications: true,
        focusLastCaptured: true,
        highlightLastCaptured: true,
        afterCaptureWorkflow: "popup"
      };
      // Ensure defaults for workflow settings exist
      if (settings.focusLastCaptured === undefined) settings.focusLastCaptured = true;
      if (settings.highlightLastCaptured === undefined) settings.highlightLastCaptured = true;
      if (settings.afterCaptureWorkflow === undefined) settings.afterCaptureWorkflow = "popup";
      
      applySettings(settings);
    });
  } else {
    const settings = JSON.parse(localStorage.getItem("wordvault_settings") || "{}");
    const defaultSettings = {
      compactMode: false,
      darkMode: false,
      animations: true,
      notifications: true,
      focusLastCaptured: true,
      highlightLastCaptured: true,
      afterCaptureWorkflow: "popup"
    };
    applySettings({ ...defaultSettings, ...settings });
  }
}

// Apply settings classes to body
function applySettings(settings) {
  if (settings.compactMode) {
    document.body.classList.add("compact-mode");
  } else {
    document.body.classList.remove("compact-mode");
  }
  
  if (settings.darkMode) {
    document.documentElement.setAttribute("data-theme", "dark");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  
  if (settings.animations === false) {
    document.body.classList.add("no-animations");
  } else {
    document.body.classList.remove("no-animations");
  }
}
