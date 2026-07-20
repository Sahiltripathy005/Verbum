/**
 * WordVault Studio Options Dashboard Controller
 */

import {
  getAllWords,
  deleteWord,
  updateWord,
  exportWords,
  importWords,
  getAllCollections,
  createCollection,
  deleteCollection,
  updateCollection,
  submitReview,
  getStreakData,
  getActivityHistory,
  getUnlockedBadges,
  getPersistentReviewCount,
  getActiveCollectionId,
  setActiveCollectionId
} from './storage.js';

import { fetchWordDefinition } from './dictionary.js';
import { formatDate, escapeHtml } from './utils.js';

// Local State
let allWords = [];
let collections = [];
let searchQuery = "";
let selectedTagFilter = "";
let selectedCollectionFilter = "all";
let selectedStatusFilter = "";
let selectedMeaningFilter = "";
let sortBy = "recent";
let toastTimeout = null;
let isBulkFetching = false;
let selectedWordsSet = new Set();
let deletingCollectionId = null;

// Spaced Repetition Review State
let reviewQueue = [];
let currentReviewIndex = 0;
let initialDueCount = 0;
let activeTab = "inventory";
let activeDetailWordId = null;



// DOM Elements - Stats
const elStatTotal = document.getElementById("stat-total");
const elStatFavorites = document.getElementById("stat-favorites");
const elStatTags = document.getElementById("stat-tags");
const elStatMostEnc = document.getElementById("stat-most-enc");
const elStatMostEncCount = document.getElementById("stat-most-enc-count");
const elBoundNewest = document.getElementById("bound-newest");
const elBoundOldest = document.getElementById("bound-oldest");

// DOM Elements - Navigation & Actions
const elBtnExportAll = document.getElementById("btn-export-all");
const elBtnImportAll = document.getElementById("btn-import-all");
const elFileInputOpt = document.getElementById("file-import-opt");

// DOM Elements - Filters
const elSearchInventory = document.getElementById("search-inventory");
const elFilterCollectionSelect = document.getElementById("filter-collection-select");
const elFilterStatusSelect = document.getElementById("filter-status-select");
const elFilterTagSelect = document.getElementById("filter-tag-select");
const elFilterMeaningSelect = document.getElementById("filter-meaning-select");
const elSortSelect = document.getElementById("sort-select");

// DOM Elements - Lists
const elInventoryTbody = document.getElementById("inventory-tbody");
const elTableEmptyState = document.getElementById("table-empty-state");
const elLeaderboardList = document.getElementById("leaderboard-list");
const elTagCloud = document.getElementById("tag-cloud");

// DOM Elements - Collections Manager sidebar
const elNewCollectionName = document.getElementById("new-collection-name");
const elBtnCreateCollection = document.getElementById("btn-create-collection");
const elCollectionsList = document.getElementById("collections-list");

// DOM Elements - Dictionary Tools
const elBtnBulkFetch = document.getElementById("btn-bulk-fetch");
const elBulkFetchProgress = document.getElementById("bulk-fetch-progress");
const elBulkProgressText = document.getElementById("bulk-progress-text");
const elBulkProgressBar = document.getElementById("bulk-progress-bar");

// DOM Elements - Modal Edit
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

// DOM Elements - Toast
const elToast = document.getElementById("toast");

// Initialize application
// Initialize application
document.addEventListener("DOMContentLoaded", async () => {
  initEventListeners();
  loadSettings();
  selectedCollectionFilter = await getActiveCollectionId();
  await loadAndRender();
  switchTab("inventory");

  // Listen for changes in storage (synchronized updates)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local") {
        if (changes.words || changes.activeCollectionId || changes.collections) {
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
  // Filters & Search
  elSearchInventory.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    renderInventory();
  });
  elFilterCollectionSelect.addEventListener("change", async (e) => {
    selectedCollectionFilter = e.target.value || "all";
    await setActiveCollectionId(selectedCollectionFilter);
    renderCollectionsSidebar();
    calculateStats();
    renderInventory();
    if (activeTab === "review") startReviewSession();
    if (activeTab === "analytics") renderAnalyticsTab();
  });
  elFilterStatusSelect.addEventListener("change", (e) => {
    selectedStatusFilter = e.target.value;
    renderInventory();
  });
  elFilterTagSelect.addEventListener("change", (e) => {
    selectedTagFilter = e.target.value;
    renderTagCloud();
    renderInventory();
  });
  elFilterMeaningSelect.addEventListener("change", (e) => {
    selectedMeaningFilter = e.target.value;
    renderInventory();
  });
  elSortSelect.addEventListener("change", (e) => {
    sortBy = e.target.value;
    renderInventory();
  });

  // Action Buttons
  elBtnExportAll.addEventListener("click", handleExportAll);
  elBtnImportAll.addEventListener("click", () => elFileInputOpt.click());
  elFileInputOpt.addEventListener("change", handleImportAll);

  // Add Collection Modal Triggers
  const elBtnOpenAddColModal = document.getElementById("btn-open-add-col-modal");
  const elBtnCloseAddCol = document.getElementById("btn-close-add-col");
  const elBtnCancelAddCol = document.getElementById("btn-cancel-add-col");
  const elAddColForm = document.getElementById("add-collection-form");

  if (elBtnOpenAddColModal) elBtnOpenAddColModal.addEventListener("click", openAddCollectionModal);
  if (elBtnCloseAddCol) elBtnCloseAddCol.addEventListener("click", closeAddCollectionModal);
  if (elBtnCancelAddCol) elBtnCancelAddCol.addEventListener("click", closeAddCollectionModal);
  if (elAddColForm) elAddColForm.addEventListener("submit", handleAddCollectionSubmit);

  // Delete Collection Modal Triggers
  const elBtnCloseDeleteCol = document.getElementById("btn-close-delete-col");
  const elBtnCancelDeleteCol = document.getElementById("btn-cancel-delete-col");
  const elBtnConfirmDeleteCol = document.getElementById("btn-confirm-delete-col");

  if (elBtnCloseDeleteCol) elBtnCloseDeleteCol.addEventListener("click", closeDeleteCollectionModal);
  if (elBtnCancelDeleteCol) elBtnCancelDeleteCol.addEventListener("click", closeDeleteCollectionModal);
  if (elBtnConfirmDeleteCol) elBtnConfirmDeleteCol.addEventListener("click", handleConfirmDeleteCollection);

  // Bulk operations toolbar
  const selectAllCb = document.getElementById("select-all-words");
  const btnBulkMove = document.getElementById("btn-bulk-move-col");
  const btnBulkDelete = document.getElementById("btn-bulk-delete");

  if (selectAllCb) {
    selectAllCb.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      const visibleCheckboxes = document.querySelectorAll(".word-select-checkbox");
      visibleCheckboxes.forEach(cb => {
        cb.checked = isChecked;
        if (isChecked) {
          selectedWordsSet.add(cb.dataset.id);
        } else {
          selectedWordsSet.delete(cb.dataset.id);
        }
      });
      updateBulkToolbarUI();
    });
  }

  if (btnBulkMove) btnBulkMove.addEventListener("click", handleBulkMoveCollection);
  if (btnBulkDelete) btnBulkDelete.addEventListener("click", handleBulkDeleteSelected);

  // Dictionary Tools bulk operations
  elBtnBulkFetch.addEventListener("click", handleBulkFetch);

  // Modal Actions
  elBtnModalCancel.addEventListener("click", closeEditModal);
  elModalClose.addEventListener("click", closeEditModal);
  elEditForm.addEventListener("submit", saveEditChanges);

  // Settings Toggles
  document.getElementById("setting-compact").addEventListener("change", saveSettings);
  document.getElementById("setting-dark").addEventListener("change", saveSettings);
  document.getElementById("setting-animations").addEventListener("change", saveSettings);
  document.getElementById("setting-notifications").addEventListener("change", saveSettings);
  document.getElementById("setting-workflow-focus").addEventListener("change", saveSettings);
  document.getElementById("setting-workflow-highlight").addEventListener("change", saveSettings);
  document.getElementById("setting-after-capture").addEventListener("change", saveSettings);

  // New Spaced Repetition Settings
  document.getElementById("setting-capture-goal").addEventListener("input", saveSettings);
  document.getElementById("setting-review-goal").addEventListener("input", saveSettings);
  document.getElementById("setting-review-order").addEventListener("change", saveSettings);
  document.getElementById("setting-show-badge").addEventListener("change", saveSettings);
  document.getElementById("setting-badge-visibility").addEventListener("change", saveSettings);
  document.getElementById("setting-review-notif").addEventListener("change", saveSettings);
  document.getElementById("setting-review-notif-threshold").addEventListener("change", saveSettings);

  // Escape key global listener for modals and inline details
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (elEditModal && elEditModal.style.display === "flex") {
        closeEditModal();
      }
      closeAddCollectionModal();
      closeDeleteCollectionModal();
      collapseRowDetails();
    }
  });

  // Tab Navigation Listeners
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const targetTab = tab.getAttribute("data-tab");
      switchTab(targetTab);
    });
  });

  // Review Mode Card Actions
  document.getElementById("btn-reveal-card").addEventListener("click", revealCardAnswer);
  
  const rateButtons = document.querySelectorAll(".btn-rate");
  rateButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const rate = parseInt(btn.getAttribute("data-rate"));
      rateCurrentCard(rate);
    });
  });

  // Review Keyboard Shortcuts Listener
  document.addEventListener("keydown", (e) => {
    if (activeTab !== "review") return;
    
    // Disable shortcuts if modal edit is active
    if (elEditModal && elEditModal.style.display === "flex") return;

    const front = document.getElementById("card-front");
    const back = document.getElementById("card-back");
    
    if (e.key === " " || e.key === "Spacebar") {
      if (front && front.style.display !== "none") {
        e.preventDefault();
        revealCardAnswer();
      }
    } else if (e.key === "1") {
      if (back && back.style.display !== "none") {
        e.preventDefault();
        rateCurrentCard(1);
      }
    } else if (e.key === "2") {
      if (back && back.style.display !== "none") {
        e.preventDefault();
        rateCurrentCard(2);
      }
    } else if (e.key === "3") {
      if (back && back.style.display !== "none") {
        e.preventDefault();
        rateCurrentCard(3);
      }
    } else if (e.key === "4") {
      if (back && back.style.display !== "none") {
        e.preventDefault();
        rateCurrentCard(4);
      }
    } else if (e.key === "Enter") {
      const empty = document.getElementById("card-empty");
      if (empty && empty.style.display !== "none") {
        e.preventDefault();
        startReviewSession();
      }
    }
  });
}

// Load current storage words and trigger comprehensive dashboard rendering
async function loadAndRender() {
  try {
    allWords = await getAllWords();
    collections = await getAllCollections();

    // Ensure active collection is valid
    const activeStored = await getActiveCollectionId();
    if (activeStored && activeStored !== "all" && !collections.some(c => c.id === activeStored)) {
      selectedCollectionFilter = "col_general";
      await setActiveCollectionId("col_general");
    } else {
      selectedCollectionFilter = activeStored || "all";
    }
    
    // Populate Collection Filter dropdown option elements
    if (elFilterCollectionSelect) {
      const prevVal = selectedCollectionFilter === "all" ? "" : selectedCollectionFilter;
      elFilterCollectionSelect.innerHTML = '<option value="">All Collections</option>';
      collections.forEach(col => {
        const opt = document.createElement("option");
        opt.value = col.id;
        opt.textContent = col.name;
        elFilterCollectionSelect.appendChild(opt);
      });
      elFilterCollectionSelect.value = prevVal;
    }

    calculateStats();
    renderTagSelectors();
    renderLeaderboard();
    renderTagCloud();
    renderTagDistribution();
    renderEncounterChart();
    renderCollectionsSidebar();
    renderInventory();
    updateBulkToolbarUI();
  } catch (error) {
    showToast("Error loading storage details: " + error.message);
  }
}

// Render Collections Sidebar Panel (Folder Explorer Layout)
function renderCollectionsSidebar() {
  if (!elCollectionsList) return;
  elCollectionsList.innerHTML = "";

  // 1. All Collections Folder Row
  const totalWordCount = allWords.length;
  const isAllActive = selectedCollectionFilter === "all" || !selectedCollectionFilter;

  const allItem = document.createElement("div");
  allItem.className = `collection-folder-item ${isAllActive ? 'active' : ''}`;
  allItem.innerHTML = `
    <div class="collection-folder-left">
      <span class="collection-folder-icon">📂</span>
      <span class="collection-folder-name">All Collections</span>
    </div>
    <div class="collection-folder-right">
      <span class="collection-count-badge">${totalWordCount}</span>
    </div>
  `;
  allItem.addEventListener("click", async () => {
    selectedCollectionFilter = "all";
    await setActiveCollectionId("all");
    if (elFilterCollectionSelect) elFilterCollectionSelect.value = "";
    renderCollectionsSidebar();
    calculateStats();
    renderInventory();
    if (activeTab === "review") startReviewSession();
    if (activeTab === "analytics") renderAnalyticsTab();
  });
  elCollectionsList.appendChild(allItem);

  // 2. Individual Collections Folder Rows
  collections.forEach(col => {
    const isDefault = col.id === "col_general";
    const isActive = selectedCollectionFilter === col.id;

    // Count words belonging to this collection
    const wordCount = allWords.filter(w => w.collectionId === col.id || (Array.isArray(w.collectionIds) && w.collectionIds.includes(col.id))).length;

    const item = document.createElement("div");
    item.className = `collection-folder-item ${isActive ? 'active' : ''}`;
    item.innerHTML = `
      <div class="collection-folder-left">
        <span class="collection-folder-icon">${isDefault ? '📌' : '📁'}</span>
        <span class="collection-folder-name" title="${escapeHtml(col.name)}">${escapeHtml(col.name)}</span>
      </div>
      <div class="collection-folder-right">
        <span class="collection-count-badge">${wordCount}</span>
        ${!isDefault ? `
          <button class="collection-action-btn edit btn-rename-col" title="Rename Collection">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="collection-action-btn delete btn-delete-col" title="Delete Collection">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          </button>
        ` : ''}
      </div>
    `;

    // Folder select click listener
    item.addEventListener("click", async (e) => {
      if (e.target.closest('.collection-action-btn')) return;
      selectedCollectionFilter = col.id;
      await setActiveCollectionId(col.id);
      if (elFilterCollectionSelect) elFilterCollectionSelect.value = col.id;
      renderCollectionsSidebar();
      calculateStats();
      renderInventory();
      if (activeTab === "review") startReviewSession();
      if (activeTab === "analytics") renderAnalyticsTab();
    });

    if (!isDefault) {
      const editBtn = item.querySelector(".btn-rename-col");
      const delBtn = item.querySelector(".btn-delete-col");
      if (editBtn) {
        editBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          handleRenameCollection(col.id, col.name);
        });
      }
      if (delBtn) {
        delBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          openDeleteCollectionModal(col.id, col.name);
        });
      }
    }

    elCollectionsList.appendChild(item);
  });
}

// Add Collection Modal logic
function openAddCollectionModal() {
  const modal = document.getElementById("add-collection-modal");
  const input = document.getElementById("input-add-col-name");
  if (modal) {
    if (input) input.value = "";
    modal.style.display = "flex";
    if (input) setTimeout(() => input.focus(), 50);
  }
}

function closeAddCollectionModal() {
  const modal = document.getElementById("add-collection-modal");
  if (modal) modal.style.display = "none";
}

async function handleAddCollectionSubmit(e) {
  if (e) e.preventDefault();
  const input = document.getElementById("input-add-col-name");
  const name = input ? input.value.trim() : "";
  if (!name) return;

  try {
    const newCol = await createCollection(name);
    closeAddCollectionModal();
    showToast(`Created collection: ${newCol.name}`);
    selectedCollectionFilter = newCol.id;
    await setActiveCollectionId(newCol.id);
    await loadAndRender();
  } catch (err) {
    showToast(err.message);
  }
}

// Rename Collection prompt handler
async function handleRenameCollection(id, oldName) {
  const newName = prompt(`Rename collection "${oldName}" to:`, oldName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed.toLowerCase() === oldName.toLowerCase()) return;
  try {
    await updateCollection(id, trimmed);
    showToast(`Renamed collection: ${trimmed}`);
    await loadAndRender();
  } catch (err) {
    showToast(err.message);
  }
}

// Delete Collection Modal logic
function openDeleteCollectionModal(id, name) {
  if (id === "col_general") {
    showToast("The General collection cannot be deleted.");
    return;
  }
  deletingCollectionId = id;
  const modal = document.getElementById("delete-collection-modal");
  const msg = document.getElementById("delete-col-message");
  if (msg) {
    msg.innerHTML = `What would you like to do with the words in <strong>"${escapeHtml(name)}"</strong>?`;
  }
  if (modal) modal.style.display = "flex";
}

function closeDeleteCollectionModal() {
  deletingCollectionId = null;
  const modal = document.getElementById("delete-collection-modal");
  if (modal) modal.style.display = "none";
}

async function handleConfirmDeleteCollection() {
  if (!deletingCollectionId) return;
  try {
    const targetCol = "col_general";
    await deleteCollection(deletingCollectionId, targetCol);
    showToast("Collection deleted. Words moved to General.");
    closeDeleteCollectionModal();
    if (selectedCollectionFilter === deletingCollectionId) {
      selectedCollectionFilter = "col_general";
      await setActiveCollectionId("col_general");
    }
    await loadAndRender();
  } catch (err) {
    showToast(err.message);
  }
}

// Dictionary Tools bulk operations
async function handleBulkFetch() {
  if (isBulkFetching) return;
  
  // Find all words that lack meanings (undefined, null, or empty string)
  const wordsToFetch = allWords.filter(w => !w.meaning || !w.meaning.trim());

  if (wordsToFetch.length === 0) {
    showToast("All saved words already have definitions!");
    return;
  }

  isBulkFetching = true;
  elBtnBulkFetch.disabled = true;
  elBtnBulkFetch.textContent = "⌛ Enriching Words...";
  elBulkFetchProgress.style.display = "block";
  
  let successCount = 0;
  let failCount = 0;
  const total = wordsToFetch.length;

  elBulkProgressText.textContent = `0 / ${total}`;
  elBulkProgressBar.style.width = "0%";

  for (let i = 0; i < total; i++) {
    const wordObj = wordsToFetch[i];
    elBulkProgressText.textContent = `${i + 1} / ${total} (${wordObj.word})`;
    elBulkProgressBar.style.width = `${((i + 1) / total) * 100}%`;

    try {
      const enriched = await fetchWordDefinition(wordObj.word);
      if (enriched && enriched.found) {
        await updateWord(wordObj.id, enriched);
        successCount++;
      } else {
        if (enriched) {
          await updateWord(wordObj.id, enriched); // save updated status
        }
        failCount++;
      }
    } catch (err) {
      console.error(`Bulk fetch error for "${wordObj.word}":`, err.message);
      failCount++;
    }

    // Rate-limit: wait 800ms between lookups to be gentle with the API
    if (i < total - 1) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }

  isBulkFetching = false;
  elBtnBulkFetch.disabled = false;
  elBtnBulkFetch.textContent = "✨ Fetch Missing Meanings";
  elBulkFetchProgress.style.display = "none";

  showToast(`Bulk enrichment completed! Success: ${successCount}, Failed: ${failCount}`);
  loadAndRender();
}

// Calculate Dashboard Stats Indicators
function calculateStats() {
  let targetWords = allWords;
  if (selectedCollectionFilter && selectedCollectionFilter !== "all") {
    targetWords = targetWords.filter(w => w.collectionId === selectedCollectionFilter || (Array.isArray(w.collectionIds) && w.collectionIds.includes(selectedCollectionFilter)));
  }

  const total = targetWords.length;
  elStatTotal.textContent = total;

  const activeCount = targetWords.filter(w => w.status && w.status !== "NEW").length;
  elStatFavorites.textContent = activeCount;

  // Extract unique tags count
  const allTags = new Set();
  targetWords.forEach(w => {
    if (Array.isArray(w.tags)) {
      w.tags.forEach(tag => allTags.add(tag.toLowerCase()));
    }
  });
  elStatTags.textContent = allTags.size;

  // Most encountered word
  if (total > 0) {
    const sortedByEnc = [...targetWords].sort((a, b) => b.encounters - a.encounters);
    const topWordObj = sortedByEnc[0];
    elStatMostEnc.textContent = topWordObj.word;
    elStatMostEncCount.textContent = `${topWordObj.encounters} times`;

    // Newest addition
    const sortedByNewest = [...targetWords].sort((a, b) => b.createdAt - a.createdAt);
    elBoundNewest.innerHTML = `<strong>${escapeHtml(sortedByNewest[0].word)}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${new Date(sortedByNewest[0].createdAt).toLocaleDateString()}</span>`;

    // Oldest addition
    const sortedByOldest = [...targetWords].sort((a, b) => a.createdAt - b.createdAt);
    elBoundOldest.innerHTML = `<strong>${escapeHtml(sortedByOldest[0].word)}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${new Date(sortedByOldest[0].createdAt).toLocaleDateString()}</span>`;
  } else {
    elStatMostEnc.textContent = "-";
    elStatMostEncCount.textContent = "0 times";
    elBoundNewest.textContent = "No words saved";
    elBoundOldest.textContent = "No words saved";
  }

  // Calculate real-time due review count for tab bubble
  const now = Date.now();
  const dueWords = targetWords.filter(w => w.nextReview <= now);
  const dueCount = dueWords.length;
  const tabDueCount = document.getElementById("tab-due-count");
  if (tabDueCount) {
    if (dueCount > 0) {
      tabDueCount.textContent = dueCount;
      tabDueCount.style.display = "inline-block";
    } else {
      tabDueCount.style.display = "none";
    }
  }
}

// Render Select Dropdown Option elements
function renderTagSelectors() {
  const previouslySelected = selectedTagFilter;
  elFilterTagSelect.innerHTML = `<option value="">All Tags</option>`;
  
  const tags = new Set();
  allWords.forEach(w => {
    if (Array.isArray(w.tags)) {
      w.tags.forEach(tag => tags.add(tag.toLowerCase()));
    }
  });

  const sortedTags = Array.from(tags).sort();
  sortedTags.forEach(tag => {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = `#${tag}`;
    if (tag === previouslySelected) {
      opt.selected = true;
    }
    elFilterTagSelect.appendChild(opt);
  });

  selectedTagFilter = elFilterTagSelect.value;
}

// Render Leaderboard list
function renderLeaderboard() {
  elLeaderboardList.innerHTML = "";
  
  if (allWords.length === 0) {
    elLeaderboardList.innerHTML = `<li style="list-style:none; color:var(--text-muted); font-size:0.85rem;">No words saved.</li>`;
    return;
  }

  const sortedByEnc = [...allWords]
    .sort((a, b) => b.encounters - a.encounters)
    .slice(0, 5); // top 5 words

  sortedByEnc.forEach(w => {
    const li = document.createElement("li");
    li.innerHTML = `
      <div class="lead-item">
        <span class="lead-word">${escapeHtml(w.word)}</span>
        <span class="lead-count">${w.encounters}x</span>
      </div>
    `;
    elLeaderboardList.appendChild(li);
  });
}

// Render Tag cloud filter widget
function renderTagCloud() {
  elTagCloud.innerHTML = "";
  
  const tagCounts = {};
  allWords.forEach(w => {
    if (Array.isArray(w.tags)) {
      w.tags.forEach(t => {
        const tagNorm = t.toLowerCase();
        tagCounts[tagNorm] = (tagCounts[tagNorm] || 0) + 1;
      });
    }
  });

  const sortedTags = Object.keys(tagCounts).sort();

  if (sortedTags.length === 0) {
    elTagCloud.innerHTML = `<span style="font-size:0.85rem; color:var(--text-muted);">No tags used.</span>`;
    return;
  }

  sortedTags.forEach(tag => {
    const span = document.createElement("span");
    span.className = `tag-cloud-item ${tag === selectedTagFilter ? 'active' : ''}`;
    span.textContent = `${tag} (${tagCounts[tag]})`;
    span.addEventListener("click", () => {
      // Toggle selection
      if (selectedTagFilter === tag) {
        selectedTagFilter = "";
      } else {
        selectedTagFilter = tag;
      }
      elFilterTagSelect.value = selectedTagFilter;
      renderTagCloud();
      renderInventory();
    });
    elTagCloud.appendChild(span);
  });
}

// Render Inventory Table Grid
function renderInventory() {
  activeDetailWordId = null;
  let filtered = [...allWords];

  // 1. Filter by Search Query
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(w => {
      const matchWord = w.word.toLowerCase().includes(q);
      const matchMeaning = w.meaning && w.meaning.toLowerCase().includes(q);
      const matchNotes = w.notes && w.notes.toLowerCase().includes(q);
      const matchTags = Array.isArray(w.tags) && w.tags.some(tag => tag.toLowerCase().includes(q));
      
      const matchCollections = (w.collectionIds || []).some(cid => {
        const col = collections.find(c => c.id === cid);
        return col && col.name.toLowerCase().includes(q);
      });
      
      const matchHostname = w.hostname && w.hostname.toLowerCase().includes(q);
      const matchSource = w.sourceName && w.sourceName.toLowerCase().includes(q);
      const matchExample = w.example && w.example.toLowerCase().includes(q);

      return matchWord || matchMeaning || matchNotes || matchTags || matchCollections || matchHostname || matchSource || matchExample;
    });
  }

  // 2. Filter by Tag selection
  if (selectedTagFilter) {
    const targetTag = selectedTagFilter.toLowerCase();
    filtered = filtered.filter(w => 
      Array.isArray(w.tags) && w.tags.some(tag => tag.toLowerCase() === targetTag)
    );
  }

  // 3. Filter by Collection selection
  if (selectedCollectionFilter && selectedCollectionFilter !== "all") {
    filtered = filtered.filter(w => 
      w.collectionId === selectedCollectionFilter || (Array.isArray(w.collectionIds) && w.collectionIds.includes(selectedCollectionFilter))
    );
  }

  // 4. Filter by Status selection
  if (selectedStatusFilter) {
    filtered = filtered.filter(w => w.status === selectedStatusFilter);
  }

  // 5. Filter by Meaning completion selection
  if (selectedMeaningFilter) {
    if (selectedMeaningFilter === "missing") {
      filtered = filtered.filter(w => !w.meaning || !w.meaning.trim());
    } else if (selectedMeaningFilter === "available") {
      filtered = filtered.filter(w => w.meaning && w.meaning.trim());
    }
  }

  // 6. Apply sorting rule
  switch (sortBy) {
    case "created-desc":
      filtered.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "created-asc":
      filtered.sort((a, b) => a.createdAt - b.createdAt);
      break;
    case "alphabetical":
      filtered.sort((a, b) => a.word.localeCompare(b.word));
      break;
    case "encounters":
      filtered.sort((a, b) => b.encounters - a.encounters);
      break;
    case "recent":
    default:
      filtered.sort((a, b) => (b.lastSeen || b.createdAt) - (a.lastSeen || a.createdAt));
      break;
  }

  // Clear Table
  elInventoryTbody.innerHTML = "";

  if (filtered.length === 0) {
    elTableEmptyState.style.display = "flex";
    updateBulkToolbarUI();
    return;
  } else {
    elTableEmptyState.style.display = "none";
  }

  // Populate Table Rows
  filtered.forEach(wordObj => {
    const tr = document.createElement("tr");
    tr.dataset.id = wordObj.id;

    // Dynamic status colors
    const statusColors = {
      "NEW": { bg: "rgba(156, 163, 175, 0.12)", text: "#9CA3AF" },
      "LEARNING": { bg: "rgba(129, 140, 248, 0.12)", text: "var(--primary)" },
      "REVIEW": { bg: "rgba(245, 158, 11, 0.12)", text: "var(--warning)" },
      "MASTERED": { bg: "rgba(34, 197, 94, 0.12)", text: "var(--success)" }
    };
    const statusStyle = statusColors[wordObj.status || "NEW"] || statusColors["NEW"];

    const escapedWord = escapeHtml(wordObj.word);
    
    // Audio pronunciation trigger
    const audioHtml = wordObj.phoneticsAudio
      ? `<button class="btn-play-audio-table" title="Play pronunciation" style="background: none; border: none; cursor: pointer; font-size: 1.1em; padding: 2px;">🔊</button>`
      : '';
    
    const phoneticHtml = wordObj.phonetic
      ? `<span style="color: var(--text-muted); font-size: 0.85em; font-family: monospace; margin-left: var(--space-1);">${escapeHtml(wordObj.phonetic)}</span>`
      : '';

    // Source display
    const sourceHtml = `
      <div style="font-size: 0.75em; color: var(--text-muted); margin-top: 2px; display: flex; align-items: center; gap: 4px;">
        ${wordObj.favicon ? `<img class="source-favicon" src="${wordObj.favicon}" style="width: 10px; height: 10px; border-radius: 1px;">` : ''}
        <span>${escapeHtml(wordObj.sourceName || 'Direct Capture')}</span>
      </div>
    `;

    // Meaning or Fetch trigger
    let meaningContent = '';
    if (wordObj.meaning && wordObj.meaning.trim()) {
      const partOfSpeechHtml = wordObj.partOfSpeech
        ? `<span style="font-style: italic; font-weight: var(--font-weight-medium); color: var(--primary); margin-right: 4px;">(${escapeHtml(wordObj.partOfSpeech)})</span>`
        : '';
      meaningContent = `<div class="td-meaning-text" title="${escapeHtml(wordObj.meaning)}">${partOfSpeechHtml}${escapeHtml(wordObj.meaning)}</div>`;
    } else {
      meaningContent = `
        <div style="display: flex; align-items: center; gap: var(--space-2);">
          <span style="color: var(--text-muted); font-style: italic; font-size: 0.85em;">No definition.</span>
          <button class="btn-fetch-row btn btn-secondary" style="padding: 2px 6px; font-size: 0.75em; border-radius: var(--radius-sm); cursor: pointer;">Fetch</button>
        </div>
      `;
    }

    // Get primary collection badge
    const curColId = wordObj.collectionId || (wordObj.collectionIds && wordObj.collectionIds[0]) || "col_general";
    const foundCol = collections.find(c => c.id === curColId);
    const colName = foundCol ? foundCol.name : "General";
    const colBadgeHtml = `<span class="col-badge" data-col-id="${curColId}" style="background-color: var(--bg-inset); color: var(--text-muted); font-size: 0.72em; padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 3px; cursor: pointer;">📁 ${escapeHtml(colName)}</span>`;

    const lastSeenFormatted = formatDate(wordObj.lastSeen || wordObj.createdAt);
    const isChecked = selectedWordsSet.has(wordObj.id);

    tr.innerHTML = `
      <td>
        <input type="checkbox" class="word-select-checkbox" data-id="${wordObj.id}" ${isChecked ? 'checked' : ''} style="cursor: pointer; accent-color: var(--primary);">
      </td>
      <td>
        <span class="status-dot" style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: ${statusStyle.text};" title="Status: ${wordObj.status || 'NEW'}"></span>
      </td>
      <td class="td-word">
        <div style="display: flex; align-items: center; gap: 6px;">
          <strong>${escapedWord}</strong>
          ${audioHtml}
          ${phoneticHtml}
        </div>
        ${sourceHtml}
      </td>
      <td class="td-meaning">${meaningContent}</td>
      <td>
        <div style="display: flex; flex-direction: column; gap: 4px;">
          <div class="table-tags">
            ${(wordObj.tags || []).map(tag => `<span class="table-tag">#${escapeHtml(tag)}</span>`).join('')}
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 2px;">
            ${colBadgeHtml}
          </div>
        </div>
      </td>
      <td class="table-encounters">${wordObj.encounters}x</td>
      <td><span title="${new Date(wordObj.lastSeen || wordObj.createdAt).toLocaleString()}">${lastSeenFormatted}</span></td>
      <td>
        <div class="table-actions" style="display: flex; align-items: center; gap: 4px;">
          <select class="quick-move-select" title="Move to collection" style="background-color: var(--bg-inset); color: var(--text-muted); border: 1px solid var(--border); border-radius: var(--radius-sm); font-size: 0.72rem; padding: 2px 4px; outline: none; cursor: pointer; max-width: 80px;">
            <option value="" disabled selected>Move...</option>
          </select>
          <button class="act-btn edit" title="Edit entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="act-btn delete" title="Delete entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </td>
    `;

    // Checkbox listener
    const rowCb = tr.querySelector(".word-select-checkbox");
    if (rowCb) {
      rowCb.addEventListener("change", (e) => {
        if (e.target.checked) {
          selectedWordsSet.add(wordObj.id);
        } else {
          selectedWordsSet.delete(wordObj.id);
        }
        updateBulkToolbarUI();
      });
    }

    // Quick move select options
    const quickMoveSelect = tr.querySelector(".quick-move-select");
    if (quickMoveSelect) {
      collections.forEach(col => {
        const opt = document.createElement("option");
        opt.value = col.id;
        opt.textContent = col.name;
        if (curColId === col.id) {
          opt.disabled = true;
        }
        quickMoveSelect.appendChild(opt);
      });
      quickMoveSelect.addEventListener("change", async (e) => {
        e.stopPropagation();
        const targetColId = e.target.value;
        if (!targetColId) return;
        const targetCol = collections.find(c => c.id === targetColId);
        const nameToDisplay = targetCol ? targetCol.name : "Collection";
        try {
          await updateWord(wordObj.id, { collectionId: targetColId, collectionIds: [targetColId] });
          showToast(`Moved "${wordObj.word}" to ${nameToDisplay}`);
          loadAndRender();
        } catch (err) {
          showToast(err.message);
        }
      });
    }

    // Click handlers
    const faviconImg = tr.querySelector(".source-favicon");
    if (faviconImg) {
      faviconImg.addEventListener("error", () => {
        faviconImg.style.display = "none";
      });
    }

    const playBtn = tr.querySelector(".btn-play-audio-table");
    if (playBtn) {
      playBtn.addEventListener("click", () => {
        const audio = new Audio(wordObj.phoneticsAudio);
        audio.play().catch(() => showToast("Audio playback failed"));
      });
    }

    const fetchBtn = tr.querySelector(".btn-fetch-row");
    if (fetchBtn) {
      fetchBtn.addEventListener("click", async () => {
        fetchBtn.textContent = "⌛";
        fetchBtn.disabled = true;
        try {
          const enriched = await fetchWordDefinition(wordObj.word);
          if (enriched) {
            await updateWord(wordObj.id, enriched);
            if (enriched.found) {
              showToast(`Enriched word: ${wordObj.word}`);
            } else {
              if (enriched.dictionaryStatus === "skipped_phrase") {
                showToast("Dictionary lookup skipped for phrases.");
              } else {
                showToast("No dictionary entry found.");
              }
            }
            loadAndRender();
          } else {
            showToast("No definition found");
            fetchBtn.textContent = "Fetch";
            fetchBtn.disabled = false;
          }
        } catch (err) {
          showToast("Fetch failed: " + err.message);
          fetchBtn.textContent = "Fetch";
          fetchBtn.disabled = false;
        }
      });
    }

    tr.querySelector(".act-btn.edit").addEventListener("click", () => openEditModal(wordObj));
    tr.querySelector(".act-btn.delete").addEventListener("click", () => handleDeleteWord(wordObj.id));

    // Add click listeners to tag chips to trigger filter
    tr.querySelectorAll(".table-tag").forEach(tagSpan => {
      tagSpan.addEventListener("click", (e) => {
        e.stopPropagation();
        const tagText = tagSpan.textContent.replace(/^#/, "").trim().toLowerCase();
        if (selectedTagFilter === tagText) {
          selectedTagFilter = "";
        } else {
          selectedTagFilter = tagText;
        }
        elFilterTagSelect.value = selectedTagFilter;
        renderTagCloud();
        renderInventory();
      });
    });

    // Add click listeners to collection badges to trigger filter
    tr.querySelectorAll(".col-badge").forEach(colBadge => {
      colBadge.addEventListener("click", async (e) => {
        e.stopPropagation();
        const colId = colBadge.dataset.colId;
        if (colId) {
          selectedCollectionFilter = colId;
          await setActiveCollectionId(colId);
          renderCollectionsSidebar();
          calculateStats();
          renderInventory();
        }
      });
    });

    // Register click listener to toggle details card
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("a") || e.target.closest("input") || e.target.closest("select") || e.target.closest(".act-btn") || e.target.closest(".table-tag") || e.target.closest(".col-badge")) {
        return;
      }
      toggleRowDetails(wordObj.id, tr);
    });

    elInventoryTbody.appendChild(tr);
  });

  updateBulkToolbarUI();
}

// Bulk Operations UI Helper
function updateBulkToolbarUI() {
  const bulkToolbar = document.getElementById("bulk-actions-toolbar");
  const countLabel = document.getElementById("bulk-selected-count");
  const moveSelect = document.getElementById("bulk-move-collection-select");
  const selectAllCb = document.getElementById("select-all-words");

  if (!bulkToolbar) return;

  const count = selectedWordsSet.size;
  if (count > 0) {
    bulkToolbar.style.display = "flex";
    if (countLabel) countLabel.textContent = `${count} selected`;

    if (moveSelect) {
      const currentVal = moveSelect.value;
      moveSelect.innerHTML = '<option value="" disabled selected>Select collection...</option>';
      collections.forEach(col => {
        const opt = document.createElement("option");
        opt.value = col.id;
        opt.textContent = col.name;
        moveSelect.appendChild(opt);
      });
      if (currentVal) moveSelect.value = currentVal;
    }
  } else {
    bulkToolbar.style.display = "none";
  }

  if (selectAllCb) {
    const visibleCheckboxes = document.querySelectorAll(".word-select-checkbox");
    if (visibleCheckboxes.length > 0) {
      const allChecked = Array.from(visibleCheckboxes).every(cb => cb.checked);
      selectAllCb.checked = allChecked;
    } else {
      selectAllCb.checked = false;
    }
  }
}

async function handleBulkMoveCollection() {
  const moveSelect = document.getElementById("bulk-move-collection-select");
  if (!moveSelect || !moveSelect.value) {
    showToast("Please select a target collection.");
    return;
  }
  const targetColId = moveSelect.value;
  const targetCol = collections.find(c => c.id === targetColId);
  const targetName = targetCol ? targetCol.name : "General";

  const idsToMove = Array.from(selectedWordsSet);
  if (idsToMove.length === 0) return;

  try {
    for (const id of idsToMove) {
      await updateWord(id, { collectionId: targetColId, collectionIds: [targetColId] });
    }
    showToast(`Moved ${idsToMove.length} word(s) to ${targetName}`);
    selectedWordsSet.clear();
    await loadAndRender();
  } catch (err) {
    showToast("Bulk move failed: " + err.message);
  }
}

async function handleBulkDeleteSelected() {
  const idsToDelete = Array.from(selectedWordsSet);
  if (idsToDelete.length === 0) return;

  if (confirm(`Are you sure you want to delete ${idsToDelete.length} selected word(s)?`)) {
    try {
      for (const id of idsToDelete) {
        await deleteWord(id);
      }
      showToast(`Deleted ${idsToDelete.length} word(s)`);
      selectedWordsSet.clear();
      await loadAndRender();
    } catch (err) {
      showToast("Bulk delete failed: " + err.message);
    }
  }
}

// Delete Word from inventory
async function handleDeleteWord(id) {
  const wordObj = allWords.find(w => w.id === id);
  if (wordObj) {
    if (confirm(`Are you sure you want to permanently delete "${wordObj.word}"?`)) {
      const row = document.querySelector(`tr[data-id="${id}"]`);
      if (row) {
        row.style.transition = "opacity 220ms cubic-bezier(0.22, 1, 0.36, 1), transform 220ms cubic-bezier(0.22, 1, 0.36, 1)";
        row.style.opacity = "0";
        row.style.transform = "translateY(8px)";
        setTimeout(async () => {
          await deleteWord(id);
          selectedWordsSet.delete(id);
          showToast(`Deleted: ${wordObj.word}`);
          loadAndRender();
        }, 220);
      } else {
        await deleteWord(id);
        selectedWordsSet.delete(id);
        showToast(`Deleted: ${wordObj.word}`);
        loadAndRender();
      }
    }
  }
}

// Open editing modal
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

  // Build collection dropdown selection
  const elEditCollectionSelect = document.getElementById("edit-collection-select");
  if (elEditCollectionSelect) {
    elEditCollectionSelect.innerHTML = "";
    const activeColId = wordObj.collectionId || (Array.isArray(wordObj.collectionIds) && wordObj.collectionIds[0]) || "col_general";
    collections.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col.id;
      opt.textContent = col.name;
      if (col.id === activeColId) {
        opt.selected = true;
      }
      elEditCollectionSelect.appendChild(opt);
    });
  }

  elEditModal.style.display = "flex";
  elEditModal.classList.remove("slide-out");
  elEditMeaning.focus();
}

// Close editing modal
function closeEditModal() {
  elEditModal.classList.add("slide-out");
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
  
  // Read selected collection
  const elEditCollectionSelect = document.getElementById("edit-collection-select");
  const selectedColId = elEditCollectionSelect ? elEditCollectionSelect.value : "col_general";

  try {
    await updateWord(id, {
      meaning,
      synonyms,
      tags,
      notes,
      status,
      collectionId: selectedColId,
      collectionIds: [selectedColId]
    });
    closeEditModal();
    showToast("Changes saved successfully");
    await loadAndRender();
  } catch (err) {
    showToast("Failed to save changes: " + err.message);
  }
}

// Export backup to json download
async function handleExportAll() {
  try {
    const jsonStr = await exportWords();
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement("a");
    a.href = url;
    a.download = "wordvault_backup.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showToast("Backup exported successfully!");
  } catch (error) {
    showToast("Export failed: " + error.message);
  }
}

// Import backup from file selection
async function handleImportAll(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const jsonText = event.target.result;
      const { addedCount, mergedCount } = await importWords(jsonText);
      showToast(`Import Completed! Added: ${addedCount}, Merged: ${mergedCount}`);
      elFileInputOpt.value = ""; // Clear element input
      loadAndRender();
    } catch (error) {
      showToast("Import failed: " + error.message);
      elFileInputOpt.value = ""; // Clear element input
    }
  };
  reader.readAsText(file);
}

// Show Snack Toast
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
    progress.style.transition = "width 2200ms linear";
    progress.style.width = "0%";
  }

  toastTimeout = setTimeout(() => {
    elToast.style.display = "none";
    console.log("Toast removed");
  }, 2200);
}

// Load and apply settings
function loadSettings() {
  const defaultSettings = {
    compactMode: false,
    darkMode: false,
    animations: true,
    notifications: true,
    focusLastCaptured: true,
    highlightLastCaptured: true,
    afterCaptureWorkflow: "popup",
    dailyCaptureGoal: 10,
    dailyReviewGoal: 15,
    reviewOrder: "overdue",
    showReviewBadge: true,
    badgeVisibility: true,
    reviewDueNotif: true,
    reviewDueThreshold: 10
  };

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    const settings = JSON.parse(localStorage.getItem("wordvault_settings") || "{}");
    const loadedSettings = { ...defaultSettings, ...settings };
    populateSettingsUI(loadedSettings);
    applySettings(loadedSettings);
    return;
  }

  chrome.storage.local.get("settings", (data) => {
    const settings = { ...defaultSettings, ...data.settings };
    populateSettingsUI(settings);
    applySettings(settings);
  });
}

function populateSettingsUI(settings) {
  const compactToggle = document.getElementById("setting-compact");
  const darkToggle = document.getElementById("setting-dark");
  const animToggle = document.getElementById("setting-animations");
  const notifToggle = document.getElementById("setting-notifications");
  const workflowFocusToggle = document.getElementById("setting-workflow-focus");
  const workflowHighlightToggle = document.getElementById("setting-workflow-highlight");
  const afterCaptureSelect = document.getElementById("setting-after-capture");
  
  const capGoalInput = document.getElementById("setting-capture-goal");
  const revGoalInput = document.getElementById("setting-review-goal");
  const revOrderSelect = document.getElementById("setting-review-order");
  const showBadgeToggle = document.getElementById("setting-show-badge");
  const badgeVisToggle = document.getElementById("setting-badge-visibility");
  const revNotifToggle = document.getElementById("setting-review-notif");
  const revNotifThresholdSelect = document.getElementById("setting-review-notif-threshold");

  if (compactToggle) compactToggle.checked = !!settings.compactMode;
  if (darkToggle) darkToggle.checked = !!settings.darkMode;
  if (animToggle) animToggle.checked = !!settings.animations;
  if (notifToggle) notifToggle.checked = !!settings.notifications;
  if (workflowFocusToggle) workflowFocusToggle.checked = settings.focusLastCaptured !== false;
  if (workflowHighlightToggle) workflowHighlightToggle.checked = settings.highlightLastCaptured !== false;
  if (afterCaptureSelect) afterCaptureSelect.value = settings.afterCaptureWorkflow || "popup";

  if (capGoalInput) capGoalInput.value = settings.dailyCaptureGoal || 10;
  if (revGoalInput) revGoalInput.value = settings.dailyReviewGoal || 15;
  if (revOrderSelect) revOrderSelect.value = settings.reviewOrder || "overdue";
  if (showBadgeToggle) showBadgeToggle.checked = settings.showReviewBadge !== false;
  if (badgeVisToggle) badgeVisToggle.checked = settings.badgeVisibility !== false;
  if (revNotifToggle) revNotifToggle.checked = settings.reviewDueNotif !== false;
  if (revNotifThresholdSelect) revNotifThresholdSelect.value = settings.reviewDueThreshold || 10;
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

  // Handle badges pane visibility
  const badgesContainer = document.getElementById("badges-grid-container");
  if (badgesContainer) {
    if (settings.badgeVisibility === false) {
      badgesContainer.style.display = "none";
      if (!document.getElementById("badges-disabled-msg")) {
        const lockedMsg = document.createElement("p");
        lockedMsg.id = "badges-disabled-msg";
        lockedMsg.textContent = "Badge achievements are hidden by your settings.";
        lockedMsg.style.color = "var(--text-muted)";
        lockedMsg.style.fontStyle = "italic";
        lockedMsg.style.marginTop = "var(--space-3)";
        badgesContainer.parentNode.appendChild(lockedMsg);
      }
    } else {
      badgesContainer.style.display = "grid";
      const msg = document.getElementById("badges-disabled-msg");
      if (msg) msg.remove();
    }
  }
}

// Save settings to storage
function saveSettings() {
  const settings = {
    compactMode: document.getElementById("setting-compact").checked,
    darkMode: document.getElementById("setting-dark").checked,
    animations: document.getElementById("setting-animations").checked,
    notifications: document.getElementById("setting-notifications").checked,
    focusLastCaptured: document.getElementById("setting-workflow-focus").checked,
    highlightLastCaptured: document.getElementById("setting-workflow-highlight").checked,
    afterCaptureWorkflow: document.getElementById("setting-after-capture").value,
    dailyCaptureGoal: parseInt(document.getElementById("setting-capture-goal").value) || 10,
    dailyReviewGoal: parseInt(document.getElementById("setting-review-goal").value) || 15,
    reviewOrder: document.getElementById("setting-review-order").value,
    showReviewBadge: document.getElementById("setting-show-badge").checked,
    badgeVisibility: document.getElementById("setting-badge-visibility").checked,
    reviewDueNotif: document.getElementById("setting-review-notif").checked,
    reviewDueThreshold: parseInt(document.getElementById("setting-review-notif-threshold").value) || 10
  };

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem("wordvault_settings", JSON.stringify(settings));
    applySettings(settings);
    showToast("Settings saved successfully (Local Preview)");
    loadAndRender();
    return;
  }

  chrome.storage.local.set({ settings }, () => {
    applySettings(settings);
    showToast("Settings updated successfully");
    loadAndRender();
  });
}

// Render Tag Distribution lists
function renderTagDistribution() {
  const elTagDist = document.getElementById("tag-distribution");
  if (!elTagDist) return;
  elTagDist.innerHTML = "";
  
  if (allWords.length === 0) {
    elTagDist.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; padding: 4px 0;">No tags to display.</p>`;
    return;
  }
  
  const tagCounts = {};
  allWords.forEach(w => {
    if (Array.isArray(w.tags)) {
      w.tags.forEach(tag => {
        const t = tag.toLowerCase();
        tagCounts[t] = (tagCounts[t] || 0) + 1;
      });
    }
  });
  
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5); // top 5 tags
    
  if (sortedTags.length === 0) {
    elTagDist.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; padding: 4px 0;">No tags to display.</p>`;
    return;
  }
  
  sortedTags.forEach(([tag, count]) => {
    const pct = Math.round((count / allWords.length) * 100);
    const item = document.createElement("div");
    item.className = "tag-dist-item";
    item.innerHTML = `
      <div class="tag-dist-info">
        <span class="tag-dist-name">#${escapeHtml(tag)}</span>
        <span class="tag-dist-pct">${pct}% (${count})</span>
      </div>
      <div class="tag-dist-bar-bg">
        <div class="tag-dist-bar-fill" style="width: ${pct}%;"></div>
      </div>
    `;
    elTagDist.appendChild(item);
  });
}

// Render Encounter Chart
function renderEncounterChart() {
  const elChart = document.getElementById("encounter-distribution");
  if (!elChart) return;
  elChart.innerHTML = "";
  
  if (allWords.length === 0) {
    elChart.innerHTML = `<p style="color:var(--text-muted); font-size:0.85rem; padding: 4px 0;">No capture data available.</p>`;
    return;
  }
  
  let enc1 = 0, enc2 = 0, enc3Plus = 0;
  allWords.forEach(w => {
    if (w.encounters === 1) enc1++;
    else if (w.encounters === 2) enc2++;
    else enc3Plus++;
  });
  
  const total = allWords.length;
  const pct1 = Math.round((enc1 / total) * 100);
  const pct2 = Math.round((enc2 / total) * 100);
  const pct3 = Math.round((enc3Plus / total) * 100);
  
  elChart.innerHTML = `
    <div class="chart-container">
      <div class="chart-segment segment-1" style="flex: ${enc1 || 1};" title="1 Encounter: ${enc1} words (${pct1}%)"></div>
      <div class="chart-segment segment-2" style="flex: ${enc2 || 1};" title="2 Encounters: ${enc2} words (${pct2}%)"></div>
      <div class="chart-segment segment-3" style="flex: ${enc3Plus || 1};" title="3+ Encounters: ${enc3Plus} words (${pct3}%)"></div>
    </div>
    <div class="chart-legend">
      <span class="legend-item"><span class="dot d1"></span>1 encounter (${enc1})</span>
      <span class="legend-item"><span class="dot d2"></span>2 encounters (${enc2})</span>
      <span class="legend-item"><span class="dot d3"></span>3+ encounters (${enc3Plus})</span>
    </div>
  `;
}

// ----------------------------------------------------
// WordVault v2.0 Dynamic Dashboard Controllers
// ----------------------------------------------------

function getSettings() {
  return new Promise((resolve) => {
    if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
      const settings = JSON.parse(localStorage.getItem("wordvault_settings") || "{}");
      const defaultSettings = {
        compactMode: false,
        darkMode: false,
        animations: true,
        notifications: true,
        focusLastCaptured: true,
        highlightLastCaptured: true,
        openEditModalAutomatically: true,
        dailyCaptureGoal: 10,
        dailyReviewGoal: 15,
        reviewOrder: "overdue",
        showReviewBadge: true,
        badgeVisibility: true,
        reviewDueNotif: true,
        reviewDueThreshold: 10
      };
      resolve({ ...defaultSettings, ...settings });
    } else {
      chrome.storage.local.get("settings", (data) => {
        const defaultSettings = {
          compactMode: false,
          darkMode: false,
          animations: true,
          notifications: true,
          focusLastCaptured: true,
          highlightLastCaptured: true,
          openEditModalAutomatically: true,
          dailyCaptureGoal: 10,
          dailyReviewGoal: 15,
          reviewOrder: "overdue",
          showReviewBadge: true,
          badgeVisibility: true,
          reviewDueNotif: true,
          reviewDueThreshold: 10
        };
        resolve({ ...defaultSettings, ...data.settings });
      });
    }
  });
}

function switchTab(tabId) {
  activeTab = tabId;
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    if (tab.getAttribute("data-tab") === tabId) {
      tab.classList.add("active");
    } else {
      tab.classList.remove("active");
    }
  });

  const panes = document.querySelectorAll(".tab-content-pane");
  panes.forEach(pane => {
    if (pane.id === `tab-content-${tabId}`) {
      pane.style.display = "block";
    } else {
      pane.style.display = "none";
    }
  });

  if (tabId === "review") {
    startReviewSession();
  } else if (tabId === "analytics") {
    renderAnalyticsTab();
  } else if (tabId === "badges") {
    renderBadgesTab();
  } else if (tabId === "activity") {
    renderActivityTab();
  }
}

async function startReviewSession() {
  const history = await getActivityHistory();
  const settings = await getSettings();
  const limit = settings.dailyReviewGoal || 15;
  
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const reviewsToday = history.filter(item => item.type === "review" && item.timestamp >= todayStart);
  const completedToday = reviewsToday.length;

  let scopeWords = allWords;
  if (selectedCollectionFilter && selectedCollectionFilter !== "all") {
    scopeWords = scopeWords.filter(w => w.collectionId === selectedCollectionFilter || (Array.isArray(w.collectionIds) && w.collectionIds.includes(selectedCollectionFilter)));
  }
  let dueWords = scopeWords.filter(w => w.nextReview <= Date.now());
  
  const order = settings.reviewOrder || "overdue";
  if (order === "overdue") {
    dueWords.sort((a, b) => (a.nextReview || 0) - (b.nextReview || 0));
  } else if (order === "difficulty") {
    dueWords.sort((a, b) => (a.easeFactor || 2.5) - (b.easeFactor || 2.5));
  } else if (order === "encounters") {
    dueWords.sort((a, b) => (b.encounters || 1) - (a.encounters || 1));
  } else if (order === "newest") {
    dueWords.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  const remainingForGoal = Math.max(0, limit - completedToday);
  reviewQueue = dueWords.slice(0, remainingForGoal);
  currentReviewIndex = 0;
  initialDueCount = reviewQueue.length;

  updateReviewStatsUI(completedToday, limit, dueWords.length);
  showNextCard();
}

function updateReviewStatsUI(completedToday, limit, totalDueCount) {
  const remainingReviews = Math.max(0, reviewQueue.length - currentReviewIndex);
  
  const elDue = document.getElementById("rev-due-today");
  const elComp = document.getElementById("rev-completed");
  const elRem = document.getElementById("rev-remaining");
  
  if (elDue) elDue.textContent = totalDueCount;
  if (elComp) elComp.textContent = completedToday;
  if (elRem) elRem.textContent = remainingReviews;

  const totalSessionCards = initialDueCount || 1;
  const sessionProgress = initialDueCount - remainingReviews;
  const progressPct = Math.min(100, Math.round((sessionProgress / totalSessionCards) * 100));

  const elProgressPct = document.getElementById("rev-progress-pct");
  const elProgressBar = document.getElementById("rev-progress-bar");
  
  if (elProgressPct) elProgressPct.textContent = `${progressPct}%`;
  if (elProgressBar) elProgressBar.style.width = `${progressPct}%`;
}

function showNextCard() {
  const front = document.getElementById("card-front");
  const back = document.getElementById("card-back");
  const empty = document.getElementById("card-empty");

  if (!front || !back || !empty) return;

  if (currentReviewIndex >= reviewQueue.length) {
    front.style.display = "none";
    back.style.display = "none";
    empty.style.display = "flex";
    return;
  }

  front.style.display = "flex";
  back.style.display = "none";
  empty.style.display = "none";

  const word = reviewQueue[currentReviewIndex];
  
  const colId = word.collectionIds && word.collectionIds[0];
  const collection = collections.find(c => c.id === colId);
  const colName = collection ? collection.name : "General";

  document.getElementById("card-front-collection-badge").textContent = colName;
  document.getElementById("card-front-word").textContent = word.word;
  document.getElementById("card-front-phonetic").textContent = word.phonetic || "";

  document.getElementById("card-back-collection-badge").textContent = colName;
  document.getElementById("card-back-word").textContent = word.word;
  document.getElementById("card-back-pos").textContent = word.partOfSpeech || "";
  document.getElementById("card-back-phonetic").textContent = word.phonetic || "";
  document.getElementById("card-back-meaning").textContent = word.meaning || "No meaning enriched yet.";

  const sentenceBox = document.getElementById("card-back-sentence-box");
  if (word.sentence) {
    sentenceBox.style.display = "block";
    document.getElementById("card-back-sentence").textContent = word.sentence;
  } else {
    sentenceBox.style.display = "none";
  }

  const synonymsBox = document.getElementById("card-back-synonyms-box");
  if (word.synonyms) {
    synonymsBox.style.display = "block";
    document.getElementById("card-back-synonyms").textContent = word.synonyms;
  } else {
    synonymsBox.style.display = "none";
  }

  const notesBox = document.getElementById("card-back-notes-box");
  if (word.notes) {
    notesBox.style.display = "block";
    document.getElementById("card-back-notes").textContent = word.notes;
  } else {
    notesBox.style.display = "none";
  }
}

function revealCardAnswer() {
  const front = document.getElementById("card-front");
  const back = document.getElementById("card-back");
  if (front && back && front.style.display !== "none") {
    front.style.display = "none";
    back.style.display = "flex";
  }
}

async function rateCurrentCard(quality) {
  if (currentReviewIndex >= reviewQueue.length) return;
  const word = reviewQueue[currentReviewIndex];
  
  await submitReview(word.id, quality);
  
  currentReviewIndex++;
  allWords = await getAllWords();
  
  calculateStats();

  const settings = await getSettings();
  const limit = settings.dailyReviewGoal || 15;
  const history = await getActivityHistory();
  const todayStart = new Date().setHours(0, 0, 0, 0);
  const reviewsToday = history.filter(item => item.type === "review" && item.timestamp >= todayStart);
  const completedToday = reviewsToday.length;
  
  let dueWordsCount = allWords.filter(w => w.nextReview <= Date.now()).length;
  updateReviewStatsUI(completedToday, limit, dueWordsCount);

  showNextCard();
}

async function renderAnalyticsTab() {
  const history = await getActivityHistory();
  const settings = await getSettings();
  
  const captureGoal = settings.dailyCaptureGoal || 10;
  const reviewGoal = settings.dailyReviewGoal || 15;

  const todayStart = new Date().setHours(0, 0, 0, 0);
  
  const capturesToday = history.filter(item => item.type === "capture" && item.timestamp >= todayStart).length;
  const reviewsToday = history.filter(item => item.type === "review" && item.timestamp >= todayStart).length;

  // Daily Capture Goal UI
  const capturePct = Math.min(100, Math.round((capturesToday / captureGoal) * 100));
  document.getElementById("goal-capture-progress-text").textContent = `${capturesToday} / ${captureGoal} captured`;
  document.getElementById("goal-capture-pct").textContent = `${capturePct}%`;
  document.getElementById("goal-capture-bar").style.width = `${capturePct}%`;
  
  const captureRem = Math.max(0, captureGoal - capturesToday);
  document.getElementById("goal-capture-remaining").textContent = captureRem > 0 
    ? `${captureRem} more words to reach goal`
    : "🎉 Capture goal reached for today!";

  // Daily Review Goal UI
  const reviewPct = Math.min(100, Math.round((reviewsToday / reviewGoal) * 100));
  document.getElementById("goal-review-progress-text").textContent = `${reviewsToday} / ${reviewGoal} reviewed`;
  document.getElementById("goal-review-pct").textContent = `${reviewPct}%`;
  document.getElementById("goal-review-bar").style.width = `${reviewPct}%`;
  
  const reviewRem = Math.max(0, reviewGoal - reviewsToday);
  document.getElementById("goal-review-remaining").textContent = reviewRem > 0 
    ? `${reviewRem} reviews remaining to reach goal`
    : "🎉 Review goal reached for today!";

  // Analytics Widgets Metrics
  document.getElementById("an-captured-today").textContent = capturesToday;
  
  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const capturesWeek = history.filter(item => item.type === "capture" && item.timestamp >= oneWeekAgo).length;
  document.getElementById("an-captured-week").textContent = capturesWeek;
  
  document.getElementById("an-reviewed-today").textContent = reviewsToday;

  const allReviews = history.filter(item => item.type === "review");
  const accurateReviews = allReviews.filter(item => !item.detail.includes("Rated: Again") && !item.detail.includes("Rated: Hard"));
  const accuracy = allReviews.length > 0 ? Math.round((accurateReviews.length / allReviews.length) * 100) : 100;
  document.getElementById("an-review-accuracy").textContent = `${accuracy}%`;

  const totalEF = allWords.reduce((sum, w) => sum + (w.easeFactor || 2.5), 0);
  const avgEase = allWords.length > 0 ? (totalEF / allWords.length).toFixed(2) : "2.50";
  document.getElementById("an-avg-ease").textContent = avgEase;

  const totalInt = allWords.reduce((sum, w) => sum + (w.interval || 1), 0);
  const avgInterval = allWords.length > 0 ? Math.round(totalInt / allWords.length) + "d" : "1d";
  document.getElementById("an-avg-interval").textContent = avgInterval;

  // Top Collections List
  const collectionsList = document.getElementById("an-collections-list");
  collectionsList.innerHTML = "";
  
  const colCounts = collections.map(col => {
    const count = allWords.filter(w => Array.isArray(w.collectionIds) && w.collectionIds.includes(col.id)).length;
    return { name: col.name, count };
  }).sort((a, b) => b.count - a.count).slice(0, 5);

  if (colCounts.length === 0 || allWords.length === 0) {
    collectionsList.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No collection data available.</p>';
  } else {
    colCounts.forEach(col => {
      const pct = Math.round((col.count / allWords.length) * 100);
      const item = document.createElement("div");
      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:4px; font-size:var(--font-size-body);">
          <span style="color:var(--text-main); font-weight:var(--font-weight-medium);">${escapeHtml(col.name)}</span>
          <span style="color:var(--text-muted); font-size:var(--font-size-caption);">${col.count} words (${pct}%)</span>
        </div>
        <div style="background-color:var(--bg-inset); height:6px; border-radius:var(--radius-round); overflow:hidden; margin-bottom:var(--space-2);">
          <div style="background-color:var(--primary); height:100%; width:${pct}%;"></div>
        </div>
      `;
      collectionsList.appendChild(item);
    });
  }

  // Top Context Sources List
  const sourcesList = document.getElementById("an-sources-list");
  sourcesList.innerHTML = "";
  
  const sourceCounts = {};
  allWords.forEach(w => {
    const src = w.sourceName || "Direct Capture";
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;
  });

  const sortedSources = Object.entries(sourceCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  if (sortedSources.length === 0) {
    sourcesList.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem;">No source data available.</p>';
  } else {
    sortedSources.forEach(([src, count]) => {
      const item = document.createElement("div");
      item.style.display = "flex";
      item.style.justifyContent = "space-between";
      item.style.alignItems = "center";
      item.style.backgroundColor = "var(--bg-inset)";
      item.style.padding = "var(--space-2) var(--space-3)";
      item.style.borderRadius = "var(--radius-md)";
      item.style.border = "1px solid var(--border)";
      item.innerHTML = `
        <span style="font-size:var(--font-size-body); color:var(--text-main); font-weight:var(--font-weight-medium); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;">${escapeHtml(src)}</span>
        <span class="badge" style="background-color:var(--primary-glow); color:var(--primary); font-weight:var(--font-weight-bold); font-size:var(--font-size-caption); padding:2px 8px; border-radius:var(--radius-round);">${count} words</span>
      `;
      sourcesList.appendChild(item);
    });
  }

  // Enrichment success rates
  const enrichedWords = allWords.filter(w => w.meaning && w.meaning.trim().length > 0).length;
  document.getElementById("an-dict-ratio").textContent = `${enrichedWords} / ${allWords.length}`;
  
  const enrichRate = allWords.length > 0 ? Math.round((enrichedWords / allWords.length) * 100) : 0;
  document.getElementById("an-dict-rate").textContent = `${enrichRate}%`;

  // Persistent reviews all time
  const totalReviews = await getPersistentReviewCount();
  document.getElementById("an-total-reviews").textContent = totalReviews;

  // Goal Completion Rate
  const goalSuccess = (capturesToday >= captureGoal ? 50 : 0) + (reviewsToday >= reviewGoal ? 50 : 0);
  document.getElementById("an-goal-rate").textContent = `${goalSuccess}%`;
}

async function renderBadgesTab() {
  const streak = await getStreakData();
  const unlocked = await getUnlockedBadges();

  document.getElementById("streak-current-val").textContent = `${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'}`;
  document.getElementById("streak-longest-val").textContent = `${streak.longestStreak} day${streak.longestStreak === 1 ? '' : 's'}`;

  const heatmap = document.getElementById("streak-heatmap-container");
  heatmap.innerHTML = "";

  const history = await getActivityHistory();
  
  const now = new Date();
  const dates = [];
  for (let i = 83; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    dates.push(d);
  }

  dates.forEach(date => {
    const dateStr = date.toDateString();
    const dayStart = new Date(date).setHours(0,0,0,0);
    const dayEnd = new Date(date).setHours(23,59,59,999);
    
    const actions = history.filter(item => item.timestamp >= dayStart && item.timestamp <= dayEnd).length;
    
    const cell = document.createElement("div");
    cell.className = "heatmap-cell";
    cell.setAttribute("data-tooltip", `${dateStr}: ${actions} activity${actions === 1 ? '' : 'ies'}`);
    
    if (actions === 0) {
      cell.style.backgroundColor = "var(--bg-inset)";
    } else if (actions <= 2) {
      cell.style.backgroundColor = "rgba(129, 140, 248, 0.25)";
    } else if (actions <= 4) {
      cell.style.backgroundColor = "rgba(129, 140, 248, 0.5)";
    } else if (actions <= 6) {
      cell.style.backgroundColor = "rgba(129, 140, 248, 0.75)";
    } else {
      cell.style.backgroundColor = "var(--primary)";
    }
    
    heatmap.appendChild(cell);
  });

  const badgesGrid = document.getElementById("badges-grid-container");
  badgesGrid.innerHTML = "";

  const badgesInfo = [
    { name: "First Word", desc: "Saved your first vocabulary word", icon: "🌱" },
    { name: "10 Words", desc: "Captured a total of 10 vocabulary words", icon: "📚" },
    { name: "100 Words", desc: "Captured 100 vocabulary words", icon: "🏛️" },
    { name: "7 Day Streak", desc: "Maintained a 7-day learning streak", icon: "🔥" },
    { name: "30 Day Streak", desc: "Maintained a 30-day learning streak", icon: "⚡" },
    { name: "100 Reviews", desc: "Completed 100 spaced reviews", icon: "🔁" },
    { name: "1000 Reviews", desc: "Completed 1000 spaced reviews", icon: "👑" },
    { name: "Master Collector", desc: "Saved 500 words or created 10 collections", icon: "💎" },
    { name: "Programming Expert", desc: "Saved 20 words in Programming collection", icon: "💻" },
    { name: "Reader", desc: "Saved 20 words with context sentences", icon: "📖" }
  ];

  badgesInfo.forEach(badge => {
    const isUnlocked = unlocked.includes(badge.name);
    const card = document.createElement("div");
    card.className = `badge-card ${isUnlocked ? '' : 'locked'}`;
    card.innerHTML = `
      <span class="badge-icon">${badge.icon}</span>
      <span class="badge-name">${badge.name}</span>
      <span class="badge-desc">${badge.desc}</span>
      <span class="badge-status ${isUnlocked ? 'unlocked' : 'locked'}">${isUnlocked ? '🏅 Unlocked' : '🔒 Locked'}</span>
    `;
    badgesGrid.appendChild(card);
  });
}

async function renderActivityTab() {
  const timeline = document.getElementById("timeline-list");
  if (!timeline) return;
  timeline.innerHTML = "";

  const history = await getActivityHistory();

  if (history.length === 0) {
    timeline.innerHTML = '<p style="color:var(--text-muted); font-size:0.85rem; padding-left: var(--space-2);">No activity logged yet.</p>';
    return;
  }

  history.forEach(item => {
    const timelineItem = document.createElement("div");
    timelineItem.className = "timeline-item";
    
    let dotClass = "capture";
    let emoji = "📥";
    let titlePrefix = "Captured";

    if (item.type === "edit") {
      dotClass = "edit";
      emoji = "✏️";
      titlePrefix = "Edited";
    } else if (item.type === "review") {
      dotClass = "review";
      emoji = "🔁";
      titlePrefix = "Reviewed";
    }

    const relativeTime = formatRelativeTime(item.timestamp);

    timelineItem.innerHTML = `
      <div class="timeline-dot ${dotClass}"></div>
      <span class="timeline-time">${relativeTime}</span>
      <span class="timeline-title">${emoji} ${titlePrefix} word: <strong>${escapeHtml(item.word)}</strong></span>
      <span class="timeline-desc">${escapeHtml(item.detail || '')}</span>
    `;
    timeline.appendChild(timelineItem);
  });
}

function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "Just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// Option A Inline Expandable Details Panel Controller
function toggleRowDetails(wordId, rowElement) {
  // If clicking the currently expanded row, collapse it
  if (activeDetailWordId === wordId) {
    collapseRowDetails();
    return;
  }

  // Collapse any already expanded row
  if (activeDetailWordId) {
    collapseRowDetails();
  }

  const wordObj = allWords.find(w => w.id === wordId);
  if (!wordObj) return;

  // Create the detail row
  const detailTr = document.createElement("tr");
  detailTr.className = "row-details-tr";
  detailTr.dataset.forId = wordId;

  const detailTd = document.createElement("td");
  detailTd.colSpan = 7;

  // Render the content of details
  const escapedWord = escapeHtml(wordObj.word);
  const partOfSpeechHtml = wordObj.partOfSpeech 
    ? `<span style="font-style: italic; color: var(--primary); font-weight: var(--font-weight-semibold); margin-right: var(--space-1);">(${escapeHtml(wordObj.partOfSpeech)})</span>` 
    : '';
  const meaningHtml = wordObj.meaning && wordObj.meaning.trim() 
    ? `${partOfSpeechHtml}${escapeHtml(wordObj.meaning)}` 
    : `<span style="color: var(--text-muted); font-style: italic;">No definition enriched yet.</span>`;

  const pronunciationHtml = wordObj.phonetic 
    ? `<span style="color: var(--text-muted); font-family: monospace;">${escapeHtml(wordObj.phonetic)}</span>` 
    : `<span style="color: var(--text-muted); font-style: italic;">None</span>`;

  const sentenceHtml = wordObj.sentence && wordObj.sentence.trim()
    ? `<p style="font-size: var(--font-size-body); color: var(--text-main); font-style: italic; border-left: 3px solid var(--primary); padding-left: var(--space-2); margin-top: var(--space-1); line-height: 1.4;">${escapeHtml(wordObj.sentence)}</p>`
    : `<span style="color: var(--text-muted); font-style: italic;">No context sentence captured.</span>`;

  const notesHtml = wordObj.notes && wordObj.notes.trim()
    ? `<p style="font-size: var(--font-size-body); color: var(--text-main); white-space: pre-line; background-color: var(--bg-inset); border: 1px dashed var(--border); padding: var(--space-2); border-radius: var(--radius-sm); margin-top: var(--space-1);">${escapeHtml(wordObj.notes)}</p>`
    : `<span style="color: var(--text-muted); font-style: italic;">No notes added yet.</span>`;

  const synonymsHtml = wordObj.synonyms && wordObj.synonyms.trim()
    ? `<span style="color: var(--text-main);">${escapeHtml(wordObj.synonyms)}</span>`
    : `<span style="color: var(--text-muted); font-style: italic;">None</span>`;

  const antonymsHtml = wordObj.antonyms && wordObj.antonyms.trim()
    ? `<span style="color: var(--text-main);">${escapeHtml(wordObj.antonyms)}</span>`
    : `<span style="color: var(--text-muted); font-style: italic;">None</span>`;

  // Metadata info: hostname/origin
  let sourceName = wordObj.sourceName || "Direct Capture";
  let sourceUrl = wordObj.url || "";
  const sourceLink = sourceUrl 
    ? `<a href="${escapeHtml(sourceUrl)}" target="_blank" style="color: var(--primary); text-decoration: none; font-weight: var(--font-weight-medium); display: inline-flex; align-items: center; gap: 4px;">${escapeHtml(sourceName)} 🔗</a>`
    : `<span style="color: var(--text-main); font-weight: var(--font-weight-medium);">${escapeHtml(sourceName)}</span>`;

  const dictStatusText = wordObj.dictionaryStatus === "found" 
    ? "🏅 Enriched via Dictionary API" 
    : wordObj.dictionaryStatus === "skipped_phrase" 
    ? "⚠️ Skipped (Phrase)" 
    : wordObj.dictionaryStatus === "not_found" 
    ? "❌ No entry found" 
    : "⚪ Not checked";

  const originHtml = wordObj.origin && wordObj.origin.trim()
    ? `<p style="font-size: var(--font-size-body); color: var(--text-muted); font-style: italic; margin-top: var(--space-1);">${escapeHtml(wordObj.origin)}</p>`
    : '';

  detailTd.innerHTML = `
    <div class="row-details-content">
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-4);">
        <!-- Left Column: Core Info & Dictionary Metadata -->
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <div>
            <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Full Meaning</span>
            <p style="font-size: var(--font-size-body); color: var(--text-main); line-height: 1.5; font-weight: var(--font-weight-medium);">${meaningHtml}</p>
          </div>
          
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2);">
            <div>
              <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Pronunciation</span>
              ${pronunciationHtml}
            </div>
            <div>
              <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Status</span>
              <span style="font-size: var(--font-size-body); color: var(--text-main); font-weight: var(--font-weight-semibold);">${escapeHtml(wordObj.status || 'NEW')}</span>
            </div>
          </div>

          ${originHtml ? `
          <div>
            <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Etymology / Origin</span>
            ${originHtml}
          </div>
          ` : ''}

          <div>
            <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Dictionary Metadata</span>
            <span style="font-size: var(--font-size-caption); color: var(--text-muted); font-weight: var(--font-weight-medium);">${dictStatusText}</span>
          </div>
        </div>

        <!-- Right Column: Sentence, Notes, Synonyms/Antonyms -->
        <div style="display: flex; flex-direction: column; gap: var(--space-3);">
          <div>
            <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Context Sentence</span>
            ${sentenceHtml}
          </div>

          <div>
            <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Usage Notes</span>
            ${notesHtml}
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2);">
            <div>
              <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Synonyms</span>
              ${synonymsHtml}
            </div>
            <div>
              <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Antonyms</span>
              ${antonymsHtml}
            </div>
          </div>

          <div>
            <span style="font-size: var(--font-size-label); color: var(--text-muted); font-weight: var(--font-weight-semibold); text-transform: uppercase; display: block; margin-bottom: 2px;">Captured From</span>
            <span style="font-size: var(--font-size-body);">${sourceLink}</span>
          </div>
        </div>
      </div>
    </div>
  `;

  detailTr.appendChild(detailTd);

  // Insert the detailTr directly after the parent rowElement
  rowElement.parentNode.insertBefore(detailTr, rowElement.nextSibling);
  rowElement.classList.add("details-expanded");
  activeDetailWordId = wordId;
}

function collapseRowDetails() {
  if (!activeDetailWordId) return;

  const detailTr = elInventoryTbody.querySelector(`.row-details-tr`);
  if (detailTr) {
    const content = detailTr.querySelector(".row-details-content");
    if (content) {
      content.style.animation = "detailsFadeOut 180ms ease-out forwards";
    }
    setTimeout(() => {
      if (detailTr.parentNode) {
        detailTr.parentNode.removeChild(detailTr);
      }
    }, 180);
  }

  const parentRow = elInventoryTbody.querySelector(`tr.details-expanded`);
  if (parentRow) {
    parentRow.classList.remove("details-expanded");
  }

  activeDetailWordId = null;
}

