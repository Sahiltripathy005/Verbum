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
  getPersistentReviewCount
} from './storage.js';

import { fetchWordDefinition } from './dictionary.js';
import { formatDate, escapeHtml } from './utils.js';

// Local State
let allWords = [];
let collections = [];
let searchQuery = "";
let selectedTagFilter = "";
let selectedWordIds = new Set();
let lastCheckedWordId = null;
let selectedCollectionFilter = "";
let selectedStatusFilter = "";
let selectedMeaningFilter = "";
let sortBy = "recent";
let toastTimeout = null;
let isBulkFetching = false;
let bulkFetchCancelled = false;
let isRatingCard = false;
let pageWords = [];
let activeTab = "inventory";

// Pagination State
let currentPage = 1;
let rowsPerPage = 20;
let totalFilteredPages = 1;

// DOM Elements - Pagination
const elPaginationInfo = document.getElementById("pagination-info");
const elRowsPerPage = document.getElementById("rows-per-page");
const elBtnPageFirst = document.getElementById("btn-page-first");
const elBtnPagePrev = document.getElementById("btn-page-prev");
const elBtnPageNext = document.getElementById("btn-page-next");
const elBtnPageLast = document.getElementById("btn-page-last");
const elPageNumbersContainer = document.getElementById("page-numbers-container");
const elInventoryPagination = document.getElementById("inventory-pagination");


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
document.addEventListener("DOMContentLoaded", () => {
  try {
    initEventListeners();
  } catch (err) {
    console.warn("WordVault: Failed to initialize event listeners:", err);
  }

  try {
    loadSettings();
  } catch (err) {
    console.warn("WordVault: Failed to load settings:", err);
  }

  try {
    loadViewModeSetting();
  } catch (err) {
    console.warn("WordVault: Failed to load view mode setting:", err);
  }

  try {
    loadAndRender();
  } catch (err) {
    console.warn("WordVault: Failed to load and render content:", err);
  }

  try {
    switchTab("inventory");
  } catch (err) {
    console.warn("WordVault: Failed to switch to inventory tab:", err);
  }

  // Listen for changes in storage (synchronized updates)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === "local") {
        if (changes.words && !isBulkFetching) {
          try {
            loadAndRender();
          } catch (err) {
            console.warn("WordVault: Failed to load and render on words change:", err);
          }
        }
        if (changes.settings) {
          try {
            applySettings(changes.settings.newValue);
          } catch (err) {
            console.warn("WordVault: Failed to apply settings change:", err);
          }
        }
      }
    });
  }
});

function initEventListeners() {
  // Filters & Search
  elSearchInventory.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    currentPage = 1;
    renderInventory();
  });
  elFilterCollectionSelect.addEventListener("change", (e) => {
    selectedCollectionFilter = e.target.value;
    currentPage = 1;
    renderInventory();
  });
  elFilterStatusSelect.addEventListener("change", (e) => {
    selectedStatusFilter = e.target.value;
    currentPage = 1;
    renderInventory();
  });
  elFilterTagSelect.addEventListener("change", (e) => {
    selectedTagFilter = e.target.value;
    currentPage = 1;
    renderInventory();
  });
  elFilterMeaningSelect.addEventListener("change", (e) => {
    selectedMeaningFilter = e.target.value;
    currentPage = 1;
    renderInventory();
  });
  elSortSelect.addEventListener("change", (e) => {
    sortBy = e.target.value;
    currentPage = 1;
    renderInventory();
  });

  // Table header Select All checkbox action
  const selectAllCheckbox = document.getElementById("select-all-rows");
  if (selectAllCheckbox) {
    selectAllCheckbox.addEventListener("change", (e) => {
      const isChecked = e.target.checked;
      pageWords.forEach(w => {
        if (isChecked) {
          selectedWordIds.add(w.id);
        } else {
          selectedWordIds.delete(w.id);
        }
      });
      renderInventory();
    });
  }

  // Action Buttons
  elBtnExportAll.addEventListener("click", handleExportAll);
  elBtnImportAll.addEventListener("click", () => elFileInputOpt.click());
  elFileInputOpt.addEventListener("change", handleImportAll);

  // Collections Sidebar actions
  elBtnCreateCollection.addEventListener("click", handleCreateCollection);
  elNewCollectionName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleCreateCollection();
  });

  // Dictionary Tools bulk operations
  elBtnBulkFetch.addEventListener("click", handleBulkFetch);
  const elBtnBulkCancel = document.getElementById("btn-bulk-cancel");
  if (elBtnBulkCancel) {
    elBtnBulkCancel.addEventListener("click", () => {
      bulkFetchCancelled = true;
    });
  }

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
  document.getElementById("setting-workflow-edit").addEventListener("change", saveSettings);

  // New Spaced Repetition Settings
  document.getElementById("setting-capture-goal").addEventListener("input", saveSettings);
  document.getElementById("setting-review-goal").addEventListener("input", saveSettings);
  document.getElementById("setting-review-order").addEventListener("change", saveSettings);
  document.getElementById("setting-show-badge").addEventListener("change", saveSettings);
  document.getElementById("setting-badge-visibility").addEventListener("change", saveSettings);
  document.getElementById("setting-review-notif").addEventListener("change", saveSettings);
  document.getElementById("setting-review-notif-threshold").addEventListener("change", saveSettings);

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
    }
  });

  // Collapsible sidebar accordion panels
  const accordionHeaders = document.querySelectorAll(".sidebar-panel .accordion-panel .panel-header-clickable");
  accordionHeaders.forEach(header => {
    header.addEventListener("click", () => {
      const panel = header.closest(".accordion-panel");
      const content = panel.querySelector(".panel-content");
      const arrow = header.querySelector(".accordion-arrow");
      
      const isCollapsed = panel.classList.contains("collapsed");
      if (isCollapsed) {
        panel.classList.remove("collapsed");
        if (content) {
          content.style.display = "block";
          content.offsetHeight; // reflow
        }
        if (arrow) arrow.textContent = "▼";
      } else {
        panel.classList.add("collapsed");
        if (content) content.style.display = "none";
        if (arrow) arrow.textContent = "►";
      }
    });
  });

  // View Mode Select listener
  const viewModeSelect = document.getElementById("view-mode-select");
  if (viewModeSelect) {
    viewModeSelect.addEventListener("change", (e) => {
      const mode = e.target.value;
      if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
        localStorage.setItem("wordvault_viewmode", mode);
        applyViewMode(mode);
      } else {
        chrome.storage.local.set({ viewMode: mode }, () => {
          applyViewMode(mode);
        });
      }
    });
  }

  // Keyboard shortcut Ctrl+F to focus search input, and Escape to close edit modal & inline row details
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      let closedSomething = false;
      if (elEditModal && elEditModal.style.display === "flex") {
        closeEditModal();
        closedSomething = true;
      }
      document.querySelectorAll(".expanded-row-details").forEach(row => {
        const parentTr = document.querySelector(`.word-record-row[data-id="${row.getAttribute("data-parent-id")}"]`);
        if (parentTr) parentTr.classList.remove("row-expanded");
        row.remove();
        closedSomething = true;
      });
      if (closedSomething) {
        e.preventDefault();
      }
    } else if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      const activeElement = document.activeElement;
      // Do not interrupt if typing in a text area or another input field
      if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "TEXTAREA")) {
        return;
      }
      e.preventDefault();
      if (elSearchInventory) {
        elSearchInventory.focus();
        elSearchInventory.select();
      }
    }
  });

  // Column Customization dropdown & change listeners
  initColumnVisibility();

  // Bulk Actions
  const btnBulkClear = document.getElementById("btn-bulk-clear-selection");
  if (btnBulkClear) {
    btnBulkClear.addEventListener("click", () => {
      selectedWordIds.clear();
      renderInventory();
      updateBulkToolbar();
    });
  }

  const btnBulkDelete = document.getElementById("btn-bulk-delete");
  if (btnBulkDelete) {
    btnBulkDelete.addEventListener("click", async () => {
      if (selectedWordIds.size === 0) return;
      if (confirm(`Are you sure you want to permanently delete the ${selectedWordIds.size} selected words?`)) {
        try {
          const ids = Array.from(selectedWordIds);
          for (const id of ids) {
            await deleteWord(id);
          }
          showToast(`Deleted ${ids.length} words`);
          selectedWordIds.clear();
          loadAndRender();
        } catch (err) {
          showToast("Bulk delete failed: " + err.message);
        }
      }
    });
  }

  const btnBulkExport = document.getElementById("btn-bulk-export");
  if (btnBulkExport) {
    btnBulkExport.addEventListener("click", async () => {
      if (selectedWordIds.size === 0) return;
      try {
        const ids = Array.from(selectedWordIds);
        const wordsToExport = allWords.filter(w => ids.includes(w.id));
        const jsonStr = JSON.stringify(wordsToExport, null, 2);
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `wordvault_selection_${ids.length}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`Exported ${ids.length} selected words!`);
      } catch (err) {
        showToast("Export selection failed: " + err.message);
      }
    });
  }

  const bulkMoveSelect = document.getElementById("bulk-move-collection");
  if (bulkMoveSelect) {
    bulkMoveSelect.addEventListener("change", async (e) => {
      const colId = e.target.value;
      if (!colId || selectedWordIds.size === 0) return;
      
      try {
        const ids = Array.from(selectedWordIds);
        for (const id of ids) {
          await updateWord(id, { collectionIds: [colId] });
        }
        showToast(`Moved ${ids.length} words to collection`);
        selectedWordIds.clear();
        loadAndRender();
      } catch (err) {
        showToast("Bulk move failed: " + err.message);
      }
      e.target.value = "";
    });
  }

  const bulkStatusSelect = document.getElementById("bulk-change-status");
  if (bulkStatusSelect) {
    bulkStatusSelect.addEventListener("change", async (e) => {
      const status = e.target.value;
      if (!status || selectedWordIds.size === 0) return;
      
      try {
        const ids = Array.from(selectedWordIds);
        for (const id of ids) {
          await updateWord(id, { status });
        }
        showToast(`Changed status of ${ids.length} words to ${status}`);
        selectedWordIds.clear();
        loadAndRender();
      } catch (err) {
        showToast("Bulk status update failed: " + err.message);
      }
      e.target.value = "";
    });
  }

  // Clear filters buttons
  const btnClearAllFilters = document.getElementById("btn-clear-all-filters");
  if (btnClearAllFilters) {
    btnClearAllFilters.addEventListener("click", () => {
      elSearchInventory.value = "";
      searchQuery = "";
      selectedTagFilter = "";
      selectedCollectionFilter = "";
      selectedStatusFilter = "";
      selectedMeaningFilter = "";
      elFilterCollectionSelect.value = "";
      elFilterStatusSelect.value = "";
      elFilterTagSelect.value = "";
      elFilterMeaningSelect.value = "";
      currentPage = 1;
      loadAndRender();
    });
  }

  const btnEmptyImport = document.getElementById("btn-empty-import");
  if (btnEmptyImport) {
    btnEmptyImport.addEventListener("click", () => {
      elFileInputOpt.click();
    });
  }

  // Pagination Controls
  if (elRowsPerPage) {
    elRowsPerPage.addEventListener("change", (e) => {
      rowsPerPage = parseInt(e.target.value) || 20;
      currentPage = 1;
      renderInventory();
    });
  }
  if (elBtnPageFirst) {
    elBtnPageFirst.addEventListener("click", () => {
      currentPage = 1;
      renderInventory();
    });
  }
  if (elBtnPagePrev) {
    elBtnPagePrev.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderInventory();
      }
    });
  }
  if (elBtnPageNext) {
    elBtnPageNext.addEventListener("click", () => {
      currentPage++;
      renderInventory();
    });
  }
  if (elBtnPageLast) {
    elBtnPageLast.addEventListener("click", () => {
      currentPage = Math.max(1, Math.ceil(allWords.length / rowsPerPage));
      renderInventory();
    });
  }
  
  // Bulk Enrich Action Button
  const btnBulkEnrich = document.getElementById("btn-bulk-enrich");
  if (btnBulkEnrich) {
    btnBulkEnrich.addEventListener("click", handleBulkEnrichSelected);
  }

  // Sidebar Collapse / Expand support
  const btnCollapseSidebar = document.getElementById("btn-collapse-sidebar");
  const btnExpandSidebar = document.getElementById("btn-expand-sidebar");
  const dashboardLayout = document.querySelector(".dashboard-layout");

  if (btnCollapseSidebar && btnExpandSidebar && dashboardLayout) {
    // Load persisted state
    chrome.storage.local.get("sidebarCollapsed", (data) => {
      if (data && data.sidebarCollapsed) {
        dashboardLayout.classList.add("sidebar-collapsed");
      }
    });

    btnCollapseSidebar.addEventListener("click", () => {
      dashboardLayout.classList.add("sidebar-collapsed");
      chrome.storage.local.set({ sidebarCollapsed: true });
    });

    btnExpandSidebar.addEventListener("click", () => {
      dashboardLayout.classList.remove("sidebar-collapsed");
      chrome.storage.local.set({ sidebarCollapsed: false });
    });

    // Collapsed icons click handlers to open specific accordions and expand sidebar
    document.querySelectorAll(".collapsed-icon-item").forEach(icon => {
      icon.addEventListener("click", () => {
        const panelId = icon.getAttribute("data-panel");
        dashboardLayout.classList.remove("sidebar-collapsed");
        chrome.storage.local.set({ sidebarCollapsed: false });
        
        // Open the corresponding accordion panel
        const panel = document.getElementById(panelId);
        if (panel && panel.classList.contains("collapsed")) {
          // Trigger click on panel header to expand it
          const header = panel.querySelector(".panel-header-clickable");
          if (header) header.click();
        }
      });
    });
  }
}

// Load current storage words and trigger comprehensive dashboard rendering
async function loadAndRender() {
  try {
    allWords = await getAllWords();
  } catch (error) {
    console.error("WordVault: Critical failure loading words:", error);
    showToast("Error loading storage details: " + error.message);
    allWords = [];
  }

  try {
    collections = await getAllCollections();
  } catch (error) {
    console.error("WordVault: Critical failure loading collections:", error);
    collections = [];
  }

  // Populate Collection Filter dropdown option elements
  try {
    const prevColFilterVal = elFilterCollectionSelect.value;
    elFilterCollectionSelect.innerHTML = '<option value="">All Collections</option>';
    collections.forEach(col => {
      const opt = document.createElement("option");
      opt.value = col.id;
      opt.textContent = col.name;
      elFilterCollectionSelect.appendChild(opt);
    });
    elFilterCollectionSelect.value = prevColFilterVal;
  } catch (err) {
    console.warn("WordVault: Failed to populate collection filters:", err);
  }

  // Populate Bulk Move Collection dropdown options
  try {
    const bulkMoveSelect = document.getElementById("bulk-move-collection");
    if (bulkMoveSelect) {
      bulkMoveSelect.innerHTML = '<option value="">Move to Collection...</option>';
      collections.forEach(col => {
        const opt = document.createElement("option");
        opt.value = col.id;
        opt.textContent = col.name;
        bulkMoveSelect.appendChild(opt);
      });
    }
  } catch (err) {
    console.warn("WordVault: Failed to populate bulk move collection dropdown:", err);
  }

  try {
    await calculateStats();
  } catch (err) {
    console.warn("WordVault: Failed to calculate stats:", err);
  }

  try {
    renderTagSelectors();
  } catch (err) {
    console.warn("WordVault: Failed to render tag selectors:", err);
  }

  try {
    renderLeaderboard();
  } catch (err) {
    console.warn("WordVault: Failed to render leaderboard:", err);
  }

  try {
    renderTagCloud();
  } catch (err) {
    console.warn("WordVault: Failed to render tag cloud:", err);
  }

  try {
    renderTagDistribution();
  } catch (err) {
    console.warn("WordVault: Failed to render tag distribution:", err);
  }

  try {
    renderEncounterChart();
  } catch (err) {
    console.warn("WordVault: Failed to render encounter chart:", err);
  }

  try {
    renderCollectionsSidebar();
  } catch (err) {
    console.warn("WordVault: Failed to render collections sidebar:", err);
  }

  try {
    renderInventory();
  } catch (err) {
    console.warn("WordVault: Failed to render inventory:", err);
  }
}

// Render Collections Sidebar Panel
function renderCollectionsSidebar() {
  elCollectionsList.innerHTML = "";
  collections.forEach(col => {
    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.alignItems = "center";
    li.style.justifyContent = "space-between";
    li.style.gap = "8px";
    li.style.backgroundColor = "var(--bg-inset)";
    li.style.padding = "var(--space-2) var(--space-3)";
    li.style.borderRadius = "var(--radius-md)";
    li.style.border = "1px solid var(--border)";

    const wordCount = allWords.filter(w => Array.isArray(w.collectionIds) && w.collectionIds.includes(col.id)).length;

    // We block editing of the default general collection
    const isDefault = col.id === "col_general";

    li.innerHTML = `
      <div style="display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;">
        <span class="collection-name" style="font-size: var(--font-size-body); font-weight: var(--font-weight-medium); color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(col.name)}">${escapeHtml(col.name)}</span>
        <span style="font-size: var(--font-size-label); color: var(--text-muted);">${wordCount} words</span>
      </div>
      ${!isDefault ? `
        <div style="display: flex; gap: var(--space-1); flex-shrink: 0;">
          <button class="btn-rename-col" title="Rename Collection" style="background: none; border: none; cursor: pointer; padding: 2px; font-size: var(--font-size-caption);">✏️</button>
          <button class="btn-delete-col" title="Delete Collection" style="background: none; border: none; cursor: pointer; padding: 2px; font-size: var(--font-size-caption);">🗑️</button>
        </div>
      ` : ''}
    `;

    // Hook up delete and rename event listeners
    if (!isDefault) {
      li.querySelector(".btn-rename-col").addEventListener("click", () => handleRenameCollection(col.id, col.name));
      li.querySelector(".btn-delete-col").addEventListener("click", () => handleDeleteCollection(col.id, col.name));
    }

    elCollectionsList.appendChild(li);
  });
}

async function handleCreateCollection() {
  const name = elNewCollectionName.value.trim();
  if (!name) return;
  try {
    await createCollection(name);
    elNewCollectionName.value = "";
    showToast(`Created collection: ${name}`);
    loadAndRender();
  } catch (err) {
    showToast(err.message);
  }
}

async function handleRenameCollection(id, oldName) {
  const newName = prompt(`Rename collection "${oldName}" to:`, oldName);
  if (newName === null) return;
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;
  try {
    await updateCollection(id, trimmed);
    showToast(`Renamed collection: ${trimmed}`);
    loadAndRender();
  } catch (err) {
    showToast(err.message);
  }
}

async function handleDeleteCollection(id, name) {
  if (confirm(`Are you sure you want to delete collection "${name}"? Words in this collection will not be deleted.`)) {
    try {
      await deleteCollection(id);
      showToast(`Deleted collection: ${name}`);
      loadAndRender();
    } catch (err) {
      showToast(err.message);
    }
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
  bulkFetchCancelled = false;

  // Lock filter controls to freeze sorting, scroll, and selection
  elSearchInventory.disabled = true;
  elFilterCollectionSelect.disabled = true;
  elFilterStatusSelect.disabled = true;
  elFilterTagSelect.disabled = true;
  elFilterMeaningSelect.disabled = true;
  elSortSelect.disabled = true;

  elBtnBulkFetch.disabled = true;
  elBtnBulkFetch.textContent = "⌛ Enriching Words...";
  elBulkFetchProgress.style.display = "block";

  const elStatusTitle = document.getElementById("bulk-status-title");
  const elActiveWord = document.getElementById("bulk-active-word");
  const elTimeRemaining = document.getElementById("bulk-time-remaining");

  if (elStatusTitle) elStatusTitle.textContent = "Currently fetching...";
  
  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;
  const total = wordsToFetch.length;

  elBulkProgressText.textContent = `0 / ${total}`;
  elBulkProgressBar.style.width = "0%";

  function formatRemainingTime(ms) {
    const totalSecs = Math.ceil(ms / 1000);
    if (totalSecs < 60) return `${totalSecs}s`;
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs}s`;
  }

  for (let i = 0; i < total; i++) {
    if (bulkFetchCancelled) {
      break;
    }

    const wordObj = wordsToFetch[i];
    if (elActiveWord) elActiveWord.textContent = `Word: ${wordObj.word}`;
    elBulkProgressText.textContent = `${i + 1} / ${total}`;
    elBulkProgressBar.style.width = `${((i + 1) / total) * 100}%`;

    const remainingCount = total - i;
    const estMs = remainingCount * 1000; // ~1s per word average
    if (elTimeRemaining) elTimeRemaining.textContent = `Estimated remaining: ${formatRemainingTime(estMs)}`;

    try {
      const enriched = await fetchWordDefinition(wordObj.word);
      if (enriched && enriched.found) {
        await updateWord(wordObj.id, enriched);
        successCount++;
      } else {
        if (enriched) {
          await updateWord(wordObj.id, enriched);
          if (enriched.dictionaryStatus === "not_found" || enriched.dictionaryStatus === "skipped_phrase") {
            notFoundCount++;
          } else {
            errorCount++;
          }
        } else {
          errorCount++;
        }
      }
    } catch (err) {
      console.error(`Bulk fetch error for "${wordObj.word}":`, err.message);
      errorCount++;
    }

    // Rate-limit: wait 800ms between lookups to be gentle with the API
    if (i < total - 1 && !bulkFetchCancelled) {
      await new Promise(resolve => setTimeout(resolve, 800));
    }
  }

  isBulkFetching = false;
  elBtnBulkFetch.disabled = false;
  elBtnBulkFetch.textContent = "✨ Fetch Missing Meanings";
  elBulkFetchProgress.style.display = "none";

  // Re-enable filter controls
  elSearchInventory.disabled = false;
  elFilterCollectionSelect.disabled = false;
  elFilterStatusSelect.disabled = false;
  elFilterTagSelect.disabled = false;
  elFilterMeaningSelect.disabled = false;
  elSortSelect.disabled = false;

  // Single render and refresh at the end
  await loadAndRender();

  if (bulkFetchCancelled) {
    showToast(`Bulk enrichment cancelled! Fetched: ${successCount}, Not Found: ${notFoundCount}, Errors: ${errorCount}`);
  } else {
    showToast(`Bulk enrichment completed! Fetched: ${successCount}, Not Found: ${notFoundCount}, Errors: ${errorCount}`);
  }
}

// Bulk Enrich Selected Words from Toolbar
async function handleBulkEnrichSelected() {
  if (selectedWordIds.size === 0) return;
  
  const wordsToFetch = allWords.filter(w => selectedWordIds.has(w.id));
  const total = wordsToFetch.length;
  
  const btnEnrich = document.getElementById("btn-bulk-enrich");
  const btnDelete = document.getElementById("btn-bulk-delete");
  const btnExport = document.getElementById("btn-bulk-export");
  const selectCount = document.getElementById("bulk-select-count");
  const bulkMove = document.getElementById("bulk-move-collection");
  const bulkStatus = document.getElementById("bulk-change-status");
  const btnClear = document.getElementById("btn-bulk-clear-selection");

  // Disable controls during bulk enrich
  if (btnEnrich) {
    btnEnrich.disabled = true;
    btnEnrich.textContent = "⌛ Enriching...";
  }
  if (btnDelete) btnDelete.disabled = true;
  if (btnExport) btnExport.disabled = true;
  if (bulkMove) bulkMove.disabled = true;
  if (bulkStatus) bulkStatus.disabled = true;
  if (btnClear) btnClear.disabled = true;

  // Freeze filters
  elSearchInventory.disabled = true;
  elFilterCollectionSelect.disabled = true;
  elFilterStatusSelect.disabled = true;
  elFilterTagSelect.disabled = true;
  elFilterMeaningSelect.disabled = true;
  elSortSelect.disabled = true;

  let successCount = 0;
  let notFoundCount = 0;
  let errorCount = 0;

  for (let i = 0; i < total; i++) {
    const wordObj = wordsToFetch[i];
    if (selectCount) {
      selectCount.textContent = `Enriching: ${wordObj.word} (${i + 1}/${total})`;
    }
    
    try {
      const enriched = await fetchWordDefinition(wordObj.word);
      if (enriched) {
        await updateWord(wordObj.id, enriched);
        if (enriched.found) {
          successCount++;
        } else {
          notFoundCount++;
        }
      } else {
        errorCount++;
      }
    } catch (err) {
      console.error(`Bulk enrich error for "${wordObj.word}":`, err.message);
      errorCount++;
    }

    if (i < total - 1) {
      await new Promise(resolve => setTimeout(resolve, 800)); // Gentle rate-limiting
    }
  }

  // Restore controls
  if (btnEnrich) {
    btnEnrich.disabled = false;
    btnEnrich.textContent = "🔍 Enrich";
  }
  if (btnDelete) btnDelete.disabled = false;
  if (btnExport) btnExport.disabled = false;
  if (bulkMove) bulkMove.disabled = false;
  if (bulkStatus) bulkStatus.disabled = false;
  if (btnClear) btnClear.disabled = false;

  elSearchInventory.disabled = false;
  elFilterCollectionSelect.disabled = false;
  elFilterStatusSelect.disabled = false;
  elFilterTagSelect.disabled = false;
  elFilterMeaningSelect.disabled = false;
  elSortSelect.disabled = false;

  showToast(`Enrichment complete! Success: ${successCount}, Not Found: ${notFoundCount}, Errors: ${errorCount}`);
  
  // Re-enable and load data
  selectedWordIds.clear();
  updateSelectAllCheckboxState();
  await loadAndRender();
}

// Inline Row Expansion details
function toggleInlineRowExpansion(tr, wordObj) {
  const currentDetailsRow = document.querySelector(`.expanded-row-details[data-parent-id="${wordObj.id}"]`);
  
  // Close any other open details rows first
  document.querySelectorAll(".expanded-row-details").forEach(row => {
    if (row.getAttribute("data-parent-id") !== wordObj.id) {
      const parentTr = document.querySelector(`.word-record-row[data-id="${row.getAttribute("data-parent-id")}"]`);
      if (parentTr) parentTr.classList.remove("row-expanded");
      row.remove();
    }
  });

  if (currentDetailsRow) {
    // Already expanded, so close it
    tr.classList.remove("row-expanded");
    currentDetailsRow.remove();
  } else {
    // Expand it
    tr.classList.add("row-expanded");
    
    const detailsTr = document.createElement("tr");
    detailsTr.className = "expanded-row-details";
    detailsTr.setAttribute("data-parent-id", wordObj.id);
    detailsTr.style.backgroundColor = "var(--bg-inset)";
    detailsTr.style.borderBottom = "1px solid var(--border)";
    
    // Format dates
    const lastReviewDate = wordObj.lastReview ? new Date(wordObj.lastReview).toLocaleString() : 'Never';
    const nextReviewDate = wordObj.nextReview ? new Date(wordObj.nextReview).toLocaleString() : 'Due Now';
    const dictStatusText = wordObj.found ? '🟢 Enriched' : (wordObj.dictionaryStatus === "skipped_phrase" ? '🟡 Skipped (Phrase)' : '🔴 Not Found');
    const easeFactorVal = typeof wordObj.easeFactor === 'number' ? wordObj.easeFactor.toFixed(2) : '2.50';
    
    // Construct inline play button if audio exists
    const audioBtnHtml = wordObj.phoneticsAudio
      ? `<button class="btn btn-secondary btn-play-audio-detail" data-audio="${escapeHtml(wordObj.phoneticsAudio)}" style="padding: var(--space-2) var(--space-3); font-size: 0.85rem; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border-radius: var(--radius-md);">🔊 Play Pronunciation</button>`
      : '<span style="font-size: 0.85rem; color: var(--text-muted); font-style: italic;">No audio available</span>';

    detailsTr.innerHTML = `
      <td colspan="3" style="padding: 0;">
        <div class="expanded-row-wrapper" style="overflow: hidden; max-height: 0; opacity: 0; transition: max-height 0.25s var(--ease-premium), opacity 0.25s var(--ease-premium); padding: var(--space-5) var(--space-6);">
          <div class="row-details-grid" style="display: grid; grid-template-columns: 2fr 1fr; gap: var(--space-6);">
            
            <!-- Left Side: Meanings & Context -->
            <div class="details-left" style="display: flex; flex-direction: column; gap: var(--space-4);">
              <div>
                <h4 style="margin: 0 0 var(--space-2) 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Definition</h4>
                <p style="margin: 0; font-size: 0.95rem; color: var(--text-main); font-weight: 500; line-height: 1.4;">
                  ${wordObj.partOfSpeech ? `<span style="font-style: italic; color: var(--primary); font-weight: 600; margin-right: 4px;">(${escapeHtml(wordObj.partOfSpeech)})</span>` : ''}
                  ${escapeHtml(wordObj.meaning || 'No definition available.')}
                </p>
              </div>

              ${wordObj.sentence ? `
              <div>
                <h4 style="margin: 0 0 var(--space-2) 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Context Sentence</h4>
                <p style="margin: 0; font-size: 0.9rem; font-style: italic; color: var(--text-main); line-height: 1.4; border-left: 3px solid var(--primary); padding-left: var(--space-3); background: rgba(129, 140, 248, 0.02);">
                  ${escapeHtml(wordObj.sentence)}
                </p>
              </div>
              ` : ''}

              ${wordObj.notes ? `
              <div>
                <h4 style="margin: 0 0 var(--space-2) 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Usage Notes</h4>
                <p style="margin: 0; font-size: 0.88rem; color: var(--text-main); white-space: pre-wrap; background: rgba(245, 158, 11, 0.03); border: 1px dashed rgba(245, 158, 11, 0.15); padding: var(--space-2) var(--space-3); border-radius: var(--radius-sm); line-height: 1.4;">
                  ${escapeHtml(wordObj.notes)}
                </p>
              </div>
              ` : ''}

              ${wordObj.synonyms ? `
              <div>
                <h4 style="margin: 0 0 var(--space-2) 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Synonyms</h4>
                <p style="margin: 0; font-size: 0.88rem; color: var(--text-main); line-height: 1.4;">
                  ${escapeHtml(wordObj.synonyms)}
                </p>
              </div>
              ` : ''}

              ${wordObj.tags && wordObj.tags.length ? `
              <div>
                <h4 style="margin: 0 0 var(--space-2) 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Tags</h4>
                <div style="display: flex; flex-wrap: wrap; gap: var(--space-2);">
                  ${wordObj.tags.map(t => `<span style="background: var(--primary-glow); color: var(--primary); font-size: 0.75rem; padding: 2px 8px; border-radius: var(--radius-round); font-weight: 500;">#${escapeHtml(t)}</span>`).join('')}
                </div>
              </div>
              ` : ''}
              
              <div style="margin-top: var(--space-2);">
                ${audioBtnHtml}
              </div>
            </div>

            <!-- Right Side: Spaced Repetition Stats & Meta -->
            <div class="details-right" style="border-left: 1px solid var(--border); padding-left: var(--space-6); display: flex; flex-direction: column; gap: var(--space-5);">
              <div>
                <h4 style="margin: 0 0 var(--space-3) 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Study Statistics</h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-3) var(--space-4); font-size: 0.85rem;">
                  <div>
                    <span style="color: var(--text-muted); display: block; font-size: 0.75rem; margin-bottom: 2px;">Status</span>
                    <strong style="color: var(--primary); font-size: 0.9rem;">${escapeHtml(wordObj.status || 'NEW')}</strong>
                  </div>
                  <div>
                    <span style="color: var(--text-muted); display: block; font-size: 0.75rem; margin-bottom: 2px;">Encounters</span>
                    <strong style="font-size: 0.9rem;">${wordObj.encounters || 1}x</strong>
                  </div>
                  <div>
                    <span style="color: var(--text-muted); display: block; font-size: 0.75rem; margin-bottom: 2px;">Interval</span>
                    <strong style="font-size: 0.9rem;">${wordObj.interval ? `${wordObj.interval} days` : '0 days'}</strong>
                  </div>
                  <div>
                    <span style="color: var(--text-muted); display: block; font-size: 0.75rem; margin-bottom: 2px;">Ease Factor</span>
                    <strong style="font-size: 0.9rem;">${easeFactorVal}</strong>
                  </div>
                  <div>
                    <span style="color: var(--text-muted); display: block; font-size: 0.75rem; margin-bottom: 2px;">Review Count</span>
                    <strong style="font-size: 0.9rem;">${wordObj.reviewCount || 0}</strong>
                  </div>
                  <div>
                    <span style="color: var(--text-muted); display: block; font-size: 0.75rem; margin-bottom: 2px;">Stage</span>
                    <strong style="font-size: 0.9rem;">${escapeHtml(wordObj.learningStage || 'Learning')}</strong>
                  </div>
                </div>
              </div>

              <div>
                <h4 style="margin: 0 0 var(--space-2) 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Review History</h4>
                <div style="font-size: 0.8rem; color: var(--text-main); display: flex; flex-direction: column; gap: var(--space-2);">
                  <div><span style="color: var(--text-muted);">Last Review:</span> <strong>${lastReviewDate}</strong></div>
                  <div><span style="color: var(--text-muted);">Next Review:</span> <strong>${nextReviewDate}</strong></div>
                </div>
              </div>

              <div>
                <h4 style="margin: 0 0 var(--space-2) 0; font-size: 0.72rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">Usage Meta</h4>
                <div style="font-size: 0.8rem; color: var(--text-main); display: flex; flex-direction: column; gap: var(--space-2);">
                  <div><span style="color: var(--text-muted);">Source:</span> <strong>${escapeHtml(wordObj.sourceName || 'Direct Capture')}</strong></div>
                  <div><span style="color: var(--text-muted);">Hostname:</span> <strong>${escapeHtml(wordObj.hostname || '-')}</strong></div>
                  <div><span style="color: var(--text-muted);">Dictionary:</span> <strong>${dictStatusText}</strong></div>
                </div>
              </div>
            </div>
            
          </div>
        </div>
      </td>
    `;
    
    // Insert detailsTr directly after tr
    tr.parentNode.insertBefore(detailsTr, tr.nextSibling);
    
    // Animate detailsTr expansion
    const wrapper = detailsTr.querySelector(".expanded-row-wrapper");
    setTimeout(() => {
      wrapper.style.maxHeight = wrapper.scrollHeight + "px";
      wrapper.style.opacity = "1";
    }, 10);

    // Audio listener inside expanded detail
    const playAudioBtn = detailsTr.querySelector(".btn-play-audio-detail");
    if (playAudioBtn) {
      playAudioBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const audioUrl = playAudioBtn.getAttribute("data-audio");
        const audio = new Audio(audioUrl);
        audio.play().catch(() => showToast("Audio playback failed"));
      });
    }
  }
}

// Calculate Dashboard Stats Indicators
async function calculateStats() {
  const total = allWords.length;
  elStatTotal.textContent = total;

  const activeCount = allWords.filter(w => w.status && w.status !== "NEW").length;
  elStatFavorites.textContent = activeCount;

  // Extract unique tags count
  const allTags = new Set();
  allWords.forEach(w => {
    if (Array.isArray(w.tags)) {
      w.tags.forEach(tag => allTags.add(tag.toLowerCase()));
    }
  });
  elStatTags.textContent = allTags.size;

  // Most encountered, newest and oldest words via single pass
  if (total > 0) {
    let topWordObj = allWords[0];
    let newestWordObj = allWords[0];
    let oldestWordObj = allWords[0];

    for (let i = 1; i < total; i++) {
      const w = allWords[i];
      if (w.encounters > topWordObj.encounters) {
        topWordObj = w;
      }
      if (w.createdAt > newestWordObj.createdAt) {
        newestWordObj = w;
      }
      if (w.createdAt < oldestWordObj.createdAt) {
        oldestWordObj = w;
      }
    }

    elStatMostEnc.textContent = topWordObj.word;
    elStatMostEncCount.textContent = `${topWordObj.encounters} times`;

    elBoundNewest.innerHTML = `<strong>${escapeHtml(newestWordObj.word)}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${new Date(newestWordObj.createdAt).toLocaleDateString()}</span>`;

    elBoundOldest.innerHTML = `<strong>${escapeHtml(oldestWordObj.word)}</strong><br><span style="font-size:0.75rem; color:var(--text-muted);">${new Date(oldestWordObj.createdAt).toLocaleDateString()}</span>`;
  } else {
    elStatMostEnc.textContent = "-";
    elStatMostEncCount.textContent = "0 times";
    elBoundNewest.textContent = "No words saved";
    elBoundOldest.textContent = "No words saved";
  }

  // Calculate real-time due review count for tab bubble
  const now = Date.now();
  const dueWords = allWords.filter(w => w.nextReview <= now);
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

  // Update Today's Progress Accordion Widgets
  try {
    const history = await getActivityHistory();
    const streak = await getStreakData();
    const settings = await getSettings();
    const capGoal = settings.dailyCaptureGoal || 10;
    const revGoal = settings.dailyReviewGoal || 15;
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const capturesToday = history.filter(item => item.type === "capture" && item.timestamp >= todayStart).length;
    const reviewsToday = history.filter(item => item.type === "review" && item.timestamp >= todayStart).length;
    const queuePendingCount = allWords.filter(w => !w.meaning || !w.meaning.trim()).length;

    const elQuickCaptures = document.getElementById("quick-stat-captures");
    const elQuickReviews = document.getElementById("quick-stat-reviews");
    const elQuickDue = document.getElementById("quick-stat-due");
    const elQuickStreak = document.getElementById("quick-stat-streak");
    const elQuickQueue = document.getElementById("quick-stat-queue");

    if (elQuickCaptures) elQuickCaptures.textContent = `${capturesToday} / ${capGoal}`;
    if (elQuickReviews) elQuickReviews.textContent = `${reviewsToday} / ${revGoal}`;
    if (elQuickDue) elQuickDue.textContent = dueCount;
    if (elQuickStreak) elQuickStreak.textContent = `${streak.currentStreak} day${streak.currentStreak === 1 ? '' : 's'}`;
    if (elQuickQueue) elQuickQueue.textContent = `${queuePendingCount} pending`;
  } catch (err) {
    console.error("Failed to update Today's Progress widgets:", err);
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
  let filtered = [...allWords];

  // 1. Filter by Search Query
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
      const matchSource = w.sourceName && w.sourceName.toLowerCase().includes(q);
      const matchExample = w.example && w.example.toLowerCase().includes(q);

      return matchWord || matchMeaning || matchNotes || matchTags || matchCollections || matchHostname || matchSource || matchExample;
    });
  }

  // 2. Filter by Tag selection
  if (selectedTagFilter) {
    filtered = filtered.filter(w => 
      Array.isArray(w.tags) && w.tags.includes(selectedTagFilter.toLowerCase())
    );
  }

  // 3. Filter by Collection selection
  if (selectedCollectionFilter) {
    filtered = filtered.filter(w => 
      Array.isArray(w.collectionIds) && w.collectionIds.includes(selectedCollectionFilter)
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

  const totalFiltered = filtered.length;
  totalFilteredPages = Math.ceil(totalFiltered / rowsPerPage) || 1;
  
  if (currentPage > totalFilteredPages) {
    currentPage = totalFilteredPages;
  }

  // Slicing current page words
  const startIndex = (currentPage - 1) * rowsPerPage;
  const endIndex = Math.min(startIndex + rowsPerPage, totalFiltered);
  pageWords = filtered.slice(startIndex, endIndex);

  // Clear Table
  elInventoryTbody.innerHTML = "";

  if (totalFiltered === 0) {
    if (allWords.length === 0) {
      elTableEmptyState.style.display = "flex";
      const emptyFiltersState = document.getElementById("table-empty-filters-state");
      if (emptyFiltersState) emptyFiltersState.style.display = "none";
    } else {
      elTableEmptyState.style.display = "none";
      const emptyFiltersState = document.getElementById("table-empty-filters-state");
      if (emptyFiltersState) emptyFiltersState.style.display = "flex";
    }
    if (elInventoryPagination) elInventoryPagination.style.display = "none";
    return;
  } else {
    elTableEmptyState.style.display = "none";
    const emptyFiltersState = document.getElementById("table-empty-filters-state");
    if (emptyFiltersState) emptyFiltersState.style.display = "none";
    if (elInventoryPagination) elInventoryPagination.style.display = "flex";
  }

  // Update Pagination Controls Info & Button States
  if (elPaginationInfo) {
    elPaginationInfo.textContent = `Showing ${totalFiltered === 0 ? 0 : startIndex + 1}-${endIndex} of ${totalFiltered} items`;
  }
  if (elBtnPageFirst) elBtnPageFirst.disabled = (currentPage === 1);
  if (elBtnPagePrev) elBtnPagePrev.disabled = (currentPage === 1);
  if (elBtnPageNext) elBtnPageNext.disabled = (currentPage === totalFilteredPages);
  if (elBtnPageLast) elBtnPageLast.disabled = (currentPage === totalFilteredPages);

  // Draw Page Number Buttons
  if (elPageNumbersContainer) {
    elPageNumbersContainer.innerHTML = "";
    
    let pageRange = [];
    const maxVisible = 5;
    if (totalFilteredPages <= maxVisible) {
      for (let i = 1; i <= totalFilteredPages; i++) pageRange.push(i);
    } else {
      pageRange.push(1);
      
      let start = Math.max(2, currentPage - 1);
      let end = Math.min(totalFilteredPages - 1, currentPage + 1);
      
      if (currentPage <= 2) {
        end = 4;
      } else if (currentPage >= totalFilteredPages - 1) {
        start = totalFilteredPages - 3;
      }
      
      if (start > 2) {
        pageRange.push("...");
      }
      
      for (let i = start; i <= end; i++) {
        pageRange.push(i);
      }
      
      if (end < totalFilteredPages - 1) {
        pageRange.push("...");
      }
      
      pageRange.push(totalFilteredPages);
    }
    
    pageRange.forEach(p => {
      if (p === "...") {
        const span = document.createElement("span");
        span.style.padding = "0 8px";
        span.style.color = "var(--text-muted)";
        span.textContent = "...";
        elPageNumbersContainer.appendChild(span);
      } else {
        const btn = document.createElement("button");
        btn.className = `btn-page-number ${p === currentPage ? 'active' : ''}`;
        btn.textContent = p;
        btn.addEventListener("click", () => {
          currentPage = p;
          renderInventory();
        });
        elPageNumbersContainer.appendChild(btn);
      }
    });
  }



  // Populate Table Rows
  pageWords.forEach(wordObj => {
    const tr = document.createElement("tr");
    tr.className = "word-record-row";
    tr.dataset.id = wordObj.id;

    const isRowSelected = selectedWordIds.has(wordObj.id);
    if (isRowSelected) {
      tr.classList.add("row-selected");
    }

    // Dynamic status colors
    const statusColors = {
      "NEW": { bg: "rgba(59, 130, 246, 0.12)", text: "#60A5FA" },
      "LEARNING": { bg: "rgba(245, 158, 11, 0.12)", text: "#FBBF24" },
      "REVIEW": { bg: "rgba(139, 92, 246, 0.12)", text: "#A78BFA" },
      "MASTERED": { bg: "rgba(16, 185, 129, 0.12)", text: "#34D399" }
    };
    const statusStyle = statusColors[wordObj.status || "NEW"] || statusColors["NEW"];

    const statusBadgeHtml = `
      <span class="status-badge" style="display: inline-flex; align-items: center; justify-content: center; background-color: ${statusStyle.bg}; color: ${statusStyle.text}; font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-sm); text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid rgba(255, 255, 255, 0.03);">
        ${wordObj.status || 'NEW'}
      </span>
    `;

    const escapedWord = escapeHtml(wordObj.word);
    const highlightedWord = highlightText(escapedWord, searchQuery);
    
    // Audio pronunciation trigger
    const audioHtml = wordObj.phoneticsAudio
      ? `<button class="btn-play-audio-table" title="Play pronunciation" style="background: none; border: none; cursor: pointer; font-size: 1.1em; padding: 2px;">🔊</button>`
      : '';
    
    const phoneticHtml = wordObj.phonetic
      ? `<span style="color: var(--text-muted); font-size: 0.85em; font-family: monospace; margin-left: var(--space-1);">${escapeHtml(wordObj.phonetic)}</span>`
      : '';

    // Meaning or Fetch trigger
    let meaningContent = '';
    if (wordObj.meaning && wordObj.meaning.trim()) {
      const partOfSpeechHtml = wordObj.partOfSpeech
        ? `<span style="font-style: italic; font-weight: var(--font-weight-medium); color: var(--primary); margin-right: 4px;">(${escapeHtml(wordObj.partOfSpeech)})</span>`
        : '';
      meaningContent = `<div class="td-meaning-text" title="${escapeHtml(wordObj.meaning)}">${partOfSpeechHtml}${highlightText(escapeHtml(wordObj.meaning), searchQuery)}</div>`;
    } else {
      meaningContent = `
        <div style="display: flex; align-items: center; gap: var(--space-2);">
          <span style="color: var(--text-muted); font-style: italic; font-size: 0.85em;">No definition.</span>
          <button class="btn-fetch-row btn btn-secondary" style="padding: 2px 6px; font-size: 0.75em; border-radius: var(--radius-sm); cursor: pointer;">Fetch</button>
        </div>
      `;
    }

    // Get collections folder badges
    const colPills = (wordObj.collectionIds || [])
      .map(cid => {
        const col = collections.find(c => c.id === cid);
        return col ? `<span class="col-badge" style="background-color: var(--bg-inset); color: var(--text-muted); font-size: 0.7rem; padding: 1px 4px; border-radius: var(--radius-sm); border: 1px solid var(--border); display: inline-flex; align-items: center; gap: 2px;">📁 ${escapeHtml(col.name)}</span>` : '';
      })
      .join('');

    const lastSeenFormatted = formatDate(wordObj.lastSeen || wordObj.createdAt);

    tr.innerHTML = `
      <td class="col-select" style="text-align: center; vertical-align: middle;">
        <input type="checkbox" class="row-select-checkbox" data-id="${wordObj.id}" ${isRowSelected ? 'checked' : ''}>
      </td>
      <td class="col-record" style="padding: 12px var(--space-4); display: flex; flex-direction: column; gap: var(--space-2); border: none;">
        <!-- Row Top -->
        <div class="record-row-top" style="display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap;">
           <span class="col-word" style="display: inline-flex; align-items: center; gap: 6px;">
              <strong style="font-size: 1.05rem; color: var(--text-main); font-weight: 600;">${highlightedWord}</strong>
              ${audioHtml}
              ${phoneticHtml}
           </span>
           ${wordObj.partOfSpeech ? `<span class="col-meaning part-of-speech" style="font-style: italic; font-size: 0.85em; color: var(--primary);">(${escapeHtml(wordObj.partOfSpeech)})</span>` : ''}
           <span class="col-status">${statusBadgeHtml}</span>
        </div>
        
        <!-- Row Middle -->
        <div class="record-row-middle col-meaning" style="margin: 0;">
           ${meaningContent}
        </div>

        <!-- Row Bottom -->
        <div class="record-row-bottom" style="display: flex; align-items: center; gap: var(--space-3); flex-wrap: wrap; font-size: 0.8rem; color: var(--text-muted);">
           <span class="col-collections" style="display: inline-flex; align-items: center; gap: 4px;">
              ${colPills}
           </span>
           <span class="col-tags" style="display: inline-flex; align-items: center; gap: 4px;">
              ${(wordObj.tags || []).map(tag => `<span class="table-tag">${highlightText('#' + escapeHtml(tag), searchQuery)}</span>`).join('')}
           </span>
           <span class="col-source" style="display: inline-flex; align-items: center; gap: 4px;">
              ${wordObj.favicon ? `<img src="${wordObj.favicon}" style="width: 10px; height: 10px; border-radius: 1px;" onerror="this.style.display='none'">` : ''}
              <span>${escapeHtml(wordObj.sourceName || 'Direct Capture')}</span>
           </span>
           <span class="col-hostname" style="color: var(--text-muted);">${escapeHtml(wordObj.hostname || '-')}</span>
           <span class="col-encounters" style="background: var(--bg-inset); padding: 2px 6px; border-radius: var(--radius-sm); border: 1px solid var(--border); font-family: monospace;">${wordObj.encounters}x</span>
           <span class="col-lastseen" title="${new Date(wordObj.lastSeen || wordObj.createdAt).toLocaleString()}">${lastSeenFormatted}</span>
        </div>
      </td>
      <td class="col-actions" style="text-align: center; vertical-align: middle;">
        <div class="table-actions">
          <button class="act-btn edit" title="Edit entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button class="act-btn delete" title="Delete entry">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </td>
    `;

    const handleSelection = (id, isChecked, isShift) => {
      if (isShift && lastCheckedWordId) {
        const lastIdx = pageWords.findIndex(w => w.id === lastCheckedWordId);
        const currIdx = pageWords.findIndex(w => w.id === id);
        if (lastIdx !== -1 && currIdx !== -1) {
          const start = Math.min(lastIdx, currIdx);
          const end = Math.max(lastIdx, currIdx);
          for (let i = start; i <= end; i++) {
            const wId = pageWords[i].id;
            if (isChecked) {
              selectedWordIds.add(wId);
            } else {
              selectedWordIds.delete(wId);
            }
          }
          renderInventory();
          updateBulkToolbar();
          return;
        }
      }

      lastCheckedWordId = id;
      if (isChecked) {
        selectedWordIds.add(id);
        tr.classList.add("row-selected");
      } else {
        selectedWordIds.delete(id);
        tr.classList.remove("row-selected");
      }

      updateSelectAllCheckboxState();
      updateBulkToolbar();
    };

    // Row-level click select or inline expansion
    tr.addEventListener("click", (e) => {
      if (e.target.closest("button") || e.target.closest("input") || e.target.closest(".table-actions") || e.target.closest(".act-btn")) {
        return;
      }
      
      if (e.shiftKey) {
        const checkbox = tr.querySelector(".row-select-checkbox");
        if (checkbox) {
          const isChecked = !checkbox.checked;
          checkbox.checked = isChecked;
          handleSelection(wordObj.id, isChecked, true);
        }
        return;
      }
      
      toggleInlineRowExpansion(tr, wordObj);
    });

    const checkbox = tr.querySelector(".row-select-checkbox");
    if (checkbox) {
      checkbox.addEventListener("click", (e) => {
        e.stopPropagation();
        handleSelection(wordObj.id, checkbox.checked, e.shiftKey);
      });
    }

    // Click handlers
    const playBtn = tr.querySelector(".btn-play-audio-table");
    if (playBtn) {
      playBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const audio = new Audio(wordObj.phoneticsAudio);
        audio.play().catch(() => showToast("Audio playback failed"));
      });
    }

    const fetchBtn = tr.querySelector(".btn-fetch-row");
    if (fetchBtn) {
      fetchBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
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

    tr.querySelector(".act-btn.edit").addEventListener("click", (e) => {
      e.stopPropagation();
      openEditModal(wordObj);
    });
    tr.querySelector(".act-btn.delete").addEventListener("click", (e) => {
      e.stopPropagation();
      handleDeleteWord(wordObj.id);
    });

    elInventoryTbody.appendChild(tr);
  });

  updateSelectAllCheckboxState();
  updateBulkToolbar();
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
          showToast(`Deleted: ${wordObj.word}`);
          loadAndRender();
        }, 220);
      } else {
        await deleteWord(id);
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
  
  // Read checked collections
  const checkboxes = elEditCollectionsList.querySelectorAll('input[name="edit-col-checkbox"]:checked');
  const collectionIds = Array.from(checkboxes).map(cb => cb.value);

  // Default to general
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
    openEditModalAutomatically: true,
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
  const workflowEditToggle = document.getElementById("setting-workflow-edit");
  
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
  if (workflowEditToggle) workflowEditToggle.checked = settings.openEditModalAutomatically !== false;

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
    openEditModalAutomatically: document.getElementById("setting-workflow-edit").checked,
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

  let dueWords = allWords.filter(w => w.nextReview <= Date.now());
  
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
  if (isRatingCard) return;
  if (currentReviewIndex >= reviewQueue.length) return;
  
  isRatingCard = true;
  const rateButtons = document.querySelectorAll(".btn-rate");
  rateButtons.forEach(btn => btn.disabled = true);
  
  const word = reviewQueue[currentReviewIndex];
  
  try {
    await submitReview(word.id, quality);
    
    currentReviewIndex++;
    allWords = await getAllWords();
    
    await calculateStats();

    const settings = await getSettings();
    const limit = settings.dailyReviewGoal || 15;
    const history = await getActivityHistory();
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const reviewsToday = history.filter(item => item.type === "review" && item.timestamp >= todayStart);
    const completedToday = reviewsToday.length;
    
    let dueWordsCount = allWords.filter(w => w.nextReview <= Date.now()).length;
    updateReviewStatsUI(completedToday, limit, dueWordsCount);

    showNextCard();
  } catch (err) {
    console.error("Failed to submit review:", err);
  } finally {
    isRatingCard = false;
    rateButtons.forEach(btn => btn.disabled = false);
  }
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

// View Mode support
function applyViewMode(mode) {
  const table = document.querySelector(".inventory-table");
  if (!table) return;
  table.classList.remove("mode-comfortable", "mode-compact", "mode-dense");
  table.classList.add(`mode-${mode}`);
}

function loadViewModeSetting() {
  const viewModeSelect = document.getElementById("view-mode-select");
  if (!viewModeSelect) return;
  
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    const mode = localStorage.getItem("wordvault_viewmode") || "comfortable";
    viewModeSelect.value = mode;
    applyViewMode(mode);
    return;
  }
  
  chrome.storage.local.get("viewMode", (data) => {
    const mode = data.viewMode || "comfortable";
    viewModeSelect.value = mode;
    applyViewMode(mode);
  });
}

// Column visibility customization support
function initColumnVisibility() {
  const btnToggleColumns = document.getElementById("btn-toggle-columns");
  const columnsMenu = document.getElementById("columns-menu");
  if (btnToggleColumns && columnsMenu) {
    btnToggleColumns.addEventListener("click", (e) => {
      e.stopPropagation();
      columnsMenu.style.display = columnsMenu.style.display === "block" ? "none" : "block";
    });
    
    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!columnsMenu.contains(e.target) && e.target !== btnToggleColumns) {
        columnsMenu.style.display = "none";
      }
    });
  }

  const checkboxes = document.querySelectorAll(".col-toggle-checkbox");
  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      const colName = cb.getAttribute("data-col");
      const isVisible = cb.checked;
      applyColumnVisibility(colName, isVisible);
      saveColumnVisibilitySettings();
    });
  });
  
  loadColumnVisibilitySettings();
}

function applyColumnVisibility(colName, isVisible) {
  const table = document.querySelector(".inventory-table");
  if (!table) return;
  if (isVisible) {
    table.removeAttribute(`data-hide-${colName}`);
  } else {
    table.setAttribute(`data-hide-${colName}`, "true");
  }
}

function saveColumnVisibilitySettings() {
  const settings = {};
  const checkboxes = document.querySelectorAll(".col-toggle-checkbox");
  checkboxes.forEach(cb => {
    const colName = cb.getAttribute("data-col");
    settings[colName] = cb.checked;
  });
  
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem("wordvault_col_visibility", JSON.stringify(settings));
    return;
  }
  chrome.storage.local.set({ colVisibility: settings });
}

function loadColumnVisibilitySettings() {
  const applyAll = (settings) => {
    const checkboxes = document.querySelectorAll(".col-toggle-checkbox");
    checkboxes.forEach(cb => {
      const colName = cb.getAttribute("data-col");
      if (settings && settings[colName] !== undefined) {
        cb.checked = settings[colName];
        applyColumnVisibility(colName, settings[colName]);
      }
    });
  };

  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    const settings = JSON.parse(localStorage.getItem("wordvault_col_visibility") || "{}");
    applyAll(settings);
    return;
  }
  
  chrome.storage.local.get("colVisibility", (data) => {
    applyAll(data.colVisibility);
  });
}

// Bulk Actions Toolbar State Sync
function updateBulkToolbar() {
  const bulkToolbar = document.getElementById("bulk-toolbar");
  const selectCount = document.getElementById("bulk-select-count");
  if (!bulkToolbar || !selectCount) return;
  
  const count = selectedWordIds.size;
  if (count > 0) {
    bulkToolbar.style.display = "flex";
    selectCount.textContent = `${count} selected`;
  } else {
    bulkToolbar.style.display = "none";
  }
}

function updateSelectAllCheckboxState() {
  const selectAllCheckbox = document.getElementById("select-all-rows");
  if (!selectAllCheckbox) return;
  const pageCheckboxes = elInventoryTbody.querySelectorAll(".row-select-checkbox");
  if (pageCheckboxes.length === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    return;
  }
  let checkedCount = 0;
  pageCheckboxes.forEach(cb => {
    if (cb.checked) checkedCount++;
  });
  selectAllCheckbox.checked = (checkedCount === pageCheckboxes.length);
  selectAllCheckbox.indeterminate = (checkedCount > 0 && checkedCount < pageCheckboxes.length);
}

// Search Highlight support
function highlightText(text, query) {
  if (!query || !text) return text;
  const escapedQuery = query.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const regex = new RegExp(`(${escapedQuery})`, 'gi');
  return text.replace(regex, '<mark class="search-highlight">$1</mark>');
}
