/**
 * WordVault Storage Engine
 * Handles CRUD operations, collections management, tag suggestions,
 * schema migrations, and dictionary caching.
 */

// Default Collections
export const defaultCollections = [
  { id: "col_programming", name: "Programming" },
  { id: "col_networking", name: "Networking" },
  { id: "col_gre", name: "GRE" },
  { id: "col_books", name: "Books" },
  { id: "col_research", name: "Research" },
  { id: "col_interview", name: "Interview" },
  { id: "col_personal", name: "Personal" },
  { id: "col_general", name: "General" }
];

const mockWords = [
  {
    id: "word_1",
    word: "supercilious",
    meaning: "behaving or looking as though one thinks one is superior to others",
    sentence: "Her supercilious attitude made it difficult to work with her on projects.",
    synonyms: "arrogant, haughty, disdainful",
    tags: ["GRE", "adjectives"],
    createdAt: Date.now() - 86400000 * 5,
    lastSeen: Date.now() - 86400000 * 2,
    status: "REVIEW",
    collectionIds: ["col_gre"],
    encounters: 3,
    hostname: "wikipedia.org",
    sourceName: "Wikipedia",
    favicon: "https://www.google.com/s2/favicons?sz=64&domain=wikipedia.org"
  },
  {
    id: "word_2",
    word: "obfuscate",
    meaning: "render obscure, unclear, or unintelligible",
    sentence: "The project report was filled with jargon to obfuscate the real issues.",
    synonyms: "blur, muddle, confuse",
    tags: ["verbs", "academic", "Programming"],
    createdAt: Date.now() - 86400000 * 10,
    lastSeen: Date.now() - 86400000 * 5,
    status: "NEW",
    collectionIds: ["col_programming"],
    encounters: 1,
    hostname: "developer.mozilla.org",
    sourceName: "MDN Web Docs",
    favicon: "https://www.google.com/s2/favicons?sz=64&domain=developer.mozilla.org"
  },
  {
    id: "word_3",
    word: "ephemeral",
    meaning: "lasting for a very short time",
    sentence: "Fame in the age of social media is often ephemeral.",
    synonyms: "transient, fleeting, brief",
    tags: ["adjectives", "SAT"],
    createdAt: Date.now() - 86400000 * 1,
    lastSeen: Date.now(),
    status: "LEARNING",
    collectionIds: ["col_general"],
    encounters: 2,
    hostname: "reddit.com",
    sourceName: "Reddit",
    favicon: "https://www.google.com/s2/favicons?sz=64&domain=reddit.com"
  }
];

// Helper to extract Smart Tags, Favicon and Hostname
export function getSmartTagsAndSource(urlStr, pageTitle = "") {
  const result = {
    hostname: "",
    sourceName: "",
    favicon: "",
    tags: []
  };

  if (!urlStr) {
    result.sourceName = pageTitle || "Direct Capture";
    return result;
  }

  try {
    const url = new URL(urlStr);
    result.hostname = url.hostname;
    result.favicon = `https://www.google.com/s2/favicons?sz=64&domain=${url.hostname}`;

    const cleanHost = url.hostname.replace("www.", "").toLowerCase();

    if (cleanHost.includes("wikipedia.org")) {
      result.sourceName = "Wikipedia";
      result.tags.push("General");
    } else if (cleanHost.includes("developer.mozilla.org")) {
      result.sourceName = "MDN Web Docs";
      result.tags.push("Programming");
    } else if (cleanHost.includes("stackoverflow.com")) {
      result.sourceName = "Stack Overflow";
      result.tags.push("Programming");
    } else if (cleanHost.includes("leetcode.com")) {
      result.sourceName = "LeetCode";
      result.tags.push("DSA");
    } else if (cleanHost.includes("geeksforgeeks.org")) {
      result.sourceName = "GeeksforGeeks";
      result.tags.push("DSA");
    } else if (cleanHost.includes("kernel.org") || urlStr.toLowerCase().includes("linux")) {
      result.sourceName = "Linux Docs";
      result.tags.push("Linux");
    } else if (cleanHost.includes("oracle.com")) {
      result.sourceName = "Oracle Docs";
      result.tags.push("Java");
    } else if (cleanHost.includes("microsoft.com")) {
      result.sourceName = "Microsoft Learn";
      result.tags.push("C#");
    } else if (cleanHost.includes("reddit.com")) {
      result.sourceName = "Reddit";
      result.tags.push("Discussion");
    } else if (cleanHost.includes("github.com")) {
      result.sourceName = "GitHub";
      result.tags.push("Open Source");
    } else if (cleanHost.includes("chat.openai.com") || cleanHost.includes("chatgpt.com")) {
      result.sourceName = "ChatGPT";
      result.tags.push("AI");
    } else {
      const parts = cleanHost.split('.');
      result.sourceName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    }

    if (urlStr.toLowerCase().endsWith(".pdf") || urlStr.toLowerCase().includes("/pdf/") || urlStr.toLowerCase().includes(".pdf#")) {
      result.tags.push("Book");
      result.sourceName = "PDF Document";
    }
  } catch (e) {
    result.hostname = "";
    result.sourceName = pageTitle || "Web Page";
  }

  return result;
}

// ----------------------------------------------------
// COLLECTIONS STORAGE API
// ----------------------------------------------------

export async function getAllCollections() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (!localStorage.getItem('wordvault_collections')) {
      localStorage.setItem('wordvault_collections', JSON.stringify(defaultCollections));
    }
    return JSON.parse(localStorage.getItem('wordvault_collections') || '[]');
  }
  return new Promise((resolve) => {
    chrome.storage.local.get({ collections: defaultCollections }, (result) => {
      resolve(result.collections || defaultCollections);
    });
  });
}

export async function saveAllCollections(collections) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem('wordvault_collections', JSON.stringify(collections));
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ collections }, () => {
      resolve();
    });
  });
}

export async function createCollection(name) {
  if (!name || !name.trim()) throw new Error("Invalid collection name");
  const collections = await getAllCollections();
  
  // Prevent duplicate names
  if (collections.some(c => c.name.toLowerCase() === name.trim().toLowerCase())) {
    throw new Error("Collection name already exists");
  }

  const newCol = {
    id: "col_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
    name: name.trim()
  };
  collections.push(newCol);
  await saveAllCollections(collections);
  return newCol;
}

export async function renameCollection(id, newName) {
  if (!newName || !newName.trim()) throw new Error("Invalid collection name");
  const collections = await getAllCollections();
  
  const idx = collections.findIndex(c => c.id === id);
  if (idx > -1) {
    collections[idx].name = newName.trim();
    await saveAllCollections(collections);
    return collections[idx];
  }
  return null;
}

export async function deleteCollection(id) {
  const collections = await getAllCollections();
  const filtered = collections.filter(c => c.id !== id);
  await saveAllCollections(filtered);

  // Clean words that were in this collection
  const words = await getAllWords();
  let modified = false;
  words.forEach(w => {
    if (w.collectionIds && w.collectionIds.includes(id)) {
      w.collectionIds = w.collectionIds.filter(cid => cid !== id);
      if (w.collectionIds.length === 0) {
        w.collectionIds = ["col_general"];
      }
      modified = true;
    }
  });

  if (modified) {
    await saveAllWords(words);
  }
  return true;
}

// Aliases for collection APIs
export const getCollections = getAllCollections;
export const addCollection = createCollection;

export async function updateCollection(id, newName) {
  return renameCollection(id, newName);
}

// ----------------------------------------------------
// WORDS STORAGE API (With Migration built-in)
// ----------------------------------------------------

async function getRawWords() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (!localStorage.getItem('wordvault_words')) {
      localStorage.setItem('wordvault_words', JSON.stringify(mockWords));
    }
    return JSON.parse(localStorage.getItem('wordvault_words') || '[]');
  }
  return new Promise((resolve) => {
    chrome.storage.local.get({ words: [] }, (result) => {
      resolve(result.words || []);
    });
  });
}

export async function getAllWords() {
  const words = await getRawWords();
  
  // Migration Check
  let needsMigration = false;
  const migrated = words.map(w => {
    let changed = false;

    // Migrate Favorite -> Learning Status
    if (w.status === undefined) {
      w.status = w.favorite ? "REVIEW" : "NEW";
      delete w.favorite;
      changed = true;
    }

    // Migrate Collections
    if (!w.collectionIds || !Array.isArray(w.collectionIds)) {
      w.collectionIds = ["col_general"];
      changed = true;
    }

    // Migrate Smart Sources
    if (!w.hostname || !w.favicon || !w.sourceName) {
      const smart = getSmartTagsAndSource(w.url, w.pageTitle);
      w.hostname = w.hostname || smart.hostname || "";
      w.sourceName = w.sourceName || smart.sourceName || "Direct Capture";
      w.favicon = w.favicon || smart.favicon || "";
      
      // Auto tags suggested
      if (smart.tags.length > 0) {
        const tags = Array.isArray(w.tags) ? w.tags : [];
        smart.tags.forEach(t => {
          if (!tags.includes(t)) tags.push(t);
        });
        w.tags = tags;
      }
      changed = true;
    }

    // Ensure metadata fields exist
    const defaultFields = ["partOfSpeech", "phonetic", "phoneticsAudio", "example", "antonyms", "origin"];
    defaultFields.forEach(f => {
      if (w[f] === undefined) {
        w[f] = "";
        changed = true;
      }
    });

    if (w.dictionaryStatus === undefined) {
      w.dictionaryStatus = (w.meaning && w.meaning.trim()) ? "found" : "pending";
      changed = true;
    }

    const sm2Fields = {
      reviewCount: 0,
      easeFactor: 2.5,
      interval: 1,
      nextReview: w.createdAt || Date.now(),
      lastReview: 0,
      learningStage: "New"
    };
    Object.keys(sm2Fields).forEach(key => {
      if (w[key] === undefined) {
        w[key] = sm2Fields[key];
        changed = true;
      }
    });

    if (changed) needsMigration = true;
    return w;
  });

  if (needsMigration) {
    await saveAllWords(migrated);
  }

  return migrated;
}

export async function saveAllWords(words) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem('wordvault_words', JSON.stringify(words));
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ words }, () => {
      resolve();
    });
  });
}

export async function findWord(wordText) {
  const words = await getAllWords();
  const normalized = wordText.trim().toLowerCase();
  return words.find(w => w.word.toLowerCase() === normalized);
}

export async function saveWord({ word, sentence, pageTitle, url }) {
  if (!word || !word.trim()) {
    throw new Error("No word provided");
  }

  const words = await getAllWords();
  const normalizedWord = word.trim();
  const existingIndex = words.findIndex(
    w => w.word.toLowerCase() === normalizedWord.toLowerCase()
  );

  let resultStatus = ""; // "saved" or "updated"
  let savedWordObj = null;

  if (existingIndex > -1) {
    // Word exists: increment encounters
    words[existingIndex].encounters += 1;
    words[existingIndex].lastSeen = Date.now();

    // Auto Status Suggestion Trigger
    if (words[existingIndex].encounters >= 10 && words[existingIndex].status !== "MASTERED") {
      // Suggesting MASTERED on high-encounter
      words[existingIndex].status = "MASTERED";
    }

    if (sentence && sentence.trim()) {
      words[existingIndex].sentence = sentence.trim();
    }
    if (pageTitle && pageTitle.trim()) {
      words[existingIndex].pageTitle = pageTitle.trim();
    }
    if (url && url.trim()) {
      words[existingIndex].url = url.trim();
    }

    savedWordObj = words[existingIndex];
    resultStatus = "updated";
  } else {
    // Populate smart sources & tags
    const smart = getSmartTagsAndSource(url, pageTitle);
    
    // New word entry
    const newWord = {
      id: "word_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11),
      word: normalizedWord,
      sentence: sentence ? sentence.trim() : "",
      pageTitle: pageTitle ? pageTitle.trim() : "",
      url: url ? url.trim() : "",
      createdAt: Date.now(),
      lastSeen: Date.now(),
      notes: "",
      meaning: "",
      synonyms: "",
      tags: smart.tags,
      collectionIds: ["col_general"],
      status: "NEW",
      encounters: 1,
      hostname: smart.hostname,
      sourceName: smart.sourceName,
      favicon: smart.favicon,
      
      // Dictionary fields
      dictionaryStatus: "pending",
      partOfSpeech: "",
      phonetic: "",
      phoneticsAudio: "",
      example: "",
      antonyms: "",
      origin: "",

      // Spaced repetition fields (SM-2)
      reviewCount: 0,
      easeFactor: 2.5,
      interval: 1,
      nextReview: Date.now(), // Due immediately!
      lastReview: 0,
      learningStage: "New"
    };
    
    words.push(newWord);
    savedWordObj = newWord;
    resultStatus = "saved";
  }

  await saveAllWords(words);

  // Log activity and update streak / badge
  if (resultStatus === "saved") {
    await addActivity("capture", savedWordObj.word);
  } else {
    await updateChromeBadge();
  }

  // Store last captured word metadata for keyboard workflow
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    await new Promise((resolve) => {
      chrome.storage.local.set({
        lastCapturedWordId: savedWordObj.id,
        lastCapturedTimestamp: Date.now()
      }, () => resolve());
    });
  } else {
    localStorage.setItem('lastCapturedWordId', savedWordObj.id);
    localStorage.setItem('lastCapturedTimestamp', Date.now().toString());
  }

  return { status: resultStatus, word: savedWordObj };
}

export async function deleteWord(id) {
  const words = await getAllWords();
  const filtered = words.filter(w => w.id !== id);
  await saveAllWords(filtered);
  await updateChromeBadge();
  return true;
}

export async function updateWord(id, updatedFields) {
  const words = await getAllWords();
  const index = words.findIndex(w => w.id === id);
  if (index > -1) {
    // If meaning gets added/updated, suggest LEARNING status
    let status = updatedFields.status || words[index].status;
    if (updatedFields.meaning && updatedFields.meaning.trim() && words[index].status === "NEW") {
      status = "LEARNING";
    }

    const isUserEdit = (updatedFields.meaning !== undefined || updatedFields.notes !== undefined || updatedFields.status !== undefined || updatedFields.tags !== undefined || updatedFields.collectionIds !== undefined);

    words[index] = {
      ...words[index],
      ...updatedFields,
      status,
      lastSeen: Date.now()
    };
    await saveAllWords(words);

    if (isUserEdit) {
      await addActivity("edit", words[index].word);
    } else {
      await updateChromeBadge();
    }

    return words[index];
  }
  return null;
}

// ----------------------------------------------------
// IMPORT / EXPORT MIGRATION
// ----------------------------------------------------

export async function exportWords() {
  const words = await getAllWords();
  return JSON.stringify(words, null, 2);
}

export async function importWords(jsonString) {
  let importedData;
  try {
    importedData = JSON.parse(jsonString);
  } catch (e) {
    throw new Error("Invalid JSON format");
  }

  if (!Array.isArray(importedData)) {
    throw new Error("Imported data must be an array of words");
  }

  const currentWords = await getAllWords();
  let addedCount = 0;
  let mergedCount = 0;

  for (const item of importedData) {
    if (!item.word || !item.word.trim()) continue;

    const normalizedWord = item.word.trim();
    const existingIndex = currentWords.findIndex(
      w => w.word.toLowerCase() === normalizedWord.toLowerCase()
    );

    const smart = getSmartTagsAndSource(item.url, item.pageTitle);

    if (existingIndex > -1) {
      const existing = currentWords[existingIndex];
      existing.encounters = (existing.encounters || 1) + (item.encounters || 1);

      // Merge tags
      const currentTags = Array.isArray(existing.tags) ? existing.tags : [];
      const newTags = Array.isArray(item.tags) ? item.tags : [];
      existing.tags = Array.from(new Set([...currentTags, ...newTags, ...smart.tags]));

      // Merge collections
      const currentCols = Array.isArray(existing.collectionIds) ? existing.collectionIds : ["col_general"];
      const newCols = Array.isArray(item.collectionIds) ? item.collectionIds : [];
      existing.collectionIds = Array.from(new Set([...currentCols, ...newCols]));

      // Populate empty values
      if (!existing.meaning && item.meaning) existing.meaning = item.meaning.trim();
      if (!existing.notes && item.notes) existing.notes = item.notes.trim();
      if (!existing.synonyms && item.synonyms) existing.synonyms = item.synonyms.trim();
      if (!existing.partOfSpeech && item.partOfSpeech) existing.partOfSpeech = item.partOfSpeech.trim();
      if (!existing.phonetic && item.phonetic) existing.phonetic = item.phonetic.trim();
      if (!existing.phoneticsAudio && item.phoneticsAudio) existing.phoneticsAudio = item.phoneticsAudio.trim();
      if (!existing.example && item.example) existing.example = item.example.trim();
      if (!existing.antonyms && item.antonyms) existing.antonyms = item.antonyms.trim();
      if (!existing.origin && item.origin) existing.origin = item.origin.trim();

      // Migrate Favorite to status
      if (item.status) {
        existing.status = item.status;
      } else if (item.favorite) {
        existing.status = "REVIEW";
      }

      existing.lastSeen = Math.max(existing.lastSeen || 0, item.lastSeen || 0, Date.now());
      mergedCount++;
    } else {
      const statusValue = item.status || (item.favorite ? "REVIEW" : "NEW");
      const collectionIdsValue = Array.isArray(item.collectionIds) ? item.collectionIds : ["col_general"];

      const newWord = {
        id: item.id || ("word_" + Date.now() + "_" + Math.random().toString(36).substring(2, 11)),
        word: normalizedWord,
        sentence: item.sentence ? item.sentence.trim() : "",
        pageTitle: item.pageTitle ? item.pageTitle.trim() : "",
        url: item.url ? item.url.trim() : "",
        createdAt: item.createdAt || Date.now(),
        lastSeen: item.lastSeen || item.createdAt || Date.now(),
        notes: item.notes ? item.notes.trim() : "",
        meaning: item.meaning ? item.meaning.trim() : "",
        synonyms: item.synonyms ? item.synonyms.trim() : "",
        tags: Array.isArray(item.tags) ? Array.from(new Set([...item.tags, ...smart.tags])) : smart.tags,
        collectionIds: collectionIdsValue,
        status: statusValue,
        encounters: item.encounters || 1,
        
        hostname: item.hostname || smart.hostname || "",
        sourceName: item.sourceName || smart.sourceName || "Direct Capture",
        favicon: item.favicon || smart.favicon || "",

        partOfSpeech: item.partOfSpeech || "",
        phonetic: item.phonetic || "",
        phoneticsAudio: item.phoneticsAudio || "",
        example: item.example || "",
        antonyms: item.antonyms || "",
        origin: item.origin || "",

        // Spaced repetition fields (SM-2)
        reviewCount: item.reviewCount || 0,
        easeFactor: item.easeFactor || 2.5,
        interval: item.interval || 1,
        nextReview: item.nextReview || (item.createdAt || Date.now()),
        lastReview: item.lastReview || 0,
        learningStage: item.learningStage || "New"
      };

      currentWords.push(newWord);
      addedCount++;
    }
  }

  await saveAllWords(currentWords);
  await updateChromeBadge();
  return { addedCount, mergedCount, totalCount: currentWords.length };
}

// ----------------------------------------------------
// SPACED REPETITION & ENGAGEMENT API (WordVault v2.0)
// ----------------------------------------------------

export async function getStreakData() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    try {
      return JSON.parse(localStorage.getItem('wordvault_streak') || '{"currentStreak":0,"longestStreak":0,"lastActiveDay":null}');
    } catch (e) {
      return { currentStreak: 0, longestStreak: 0, lastActiveDay: null };
    }
  }
  return new Promise((resolve) => {
    chrome.storage.local.get({ streakData: { currentStreak: 0, longestStreak: 0, lastActiveDay: null } }, (result) => {
      resolve(result.streakData || { currentStreak: 0, longestStreak: 0, lastActiveDay: null });
    });
  });
}

export async function saveStreakData(streakData) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem('wordvault_streak', JSON.stringify(streakData));
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ streakData }, () => resolve());
  });
}

export async function getPersistentReviewCount() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    return parseInt(localStorage.getItem('wordvault_rev_count') || '0', 10);
  }
  return new Promise((resolve) => {
    chrome.storage.local.get({ persistentReviewCount: 0 }, (result) => {
      resolve(result.persistentReviewCount || 0);
    });
  });
}

export async function savePersistentReviewCount(count) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem('wordvault_rev_count', count.toString());
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ persistentReviewCount: count }, () => resolve());
  });
}

export async function getActivityHistory() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    try {
      return JSON.parse(localStorage.getItem('wordvault_history') || '[]');
    } catch (e) {
      return [];
    }
  }
  return new Promise((resolve) => {
    chrome.storage.local.get({ activityHistory: [] }, (result) => {
      resolve(result.activityHistory || []);
    });
  });
}

export async function saveActivityHistory(activityHistory) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem('wordvault_history', JSON.stringify(activityHistory));
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ activityHistory }, () => resolve());
  });
}

export async function getUnlockedBadges() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    try {
      return JSON.parse(localStorage.getItem('wordvault_badges') || '[]');
    } catch (e) {
      return [];
    }
  }
  return new Promise((resolve) => {
    chrome.storage.local.get({ unlockedBadges: [] }, (result) => {
      resolve(result.unlockedBadges || []);
    });
  });
}

export async function saveUnlockedBadges(unlockedBadges) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem('wordvault_badges', JSON.stringify(unlockedBadges));
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ unlockedBadges }, () => resolve());
  });
}

export function getActiveStreak(streak) {
  if (!streak || !streak.lastActiveDay) return 0;
  const todayStr = new Date().toDateString();
  if (streak.lastActiveDay === todayStr) {
    return streak.currentStreak;
  }
  const lastActiveDate = new Date(streak.lastActiveDay);
  const todayDate = new Date(todayStr);
  const diffTime = Math.abs(todayDate - lastActiveDate);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  if (diffDays === 1) {
    return streak.currentStreak;
  }
  return 0;
}

export async function updateStreak() {
  const todayStr = new Date().toDateString();
  let streak = await getStreakData();
  
  if (streak.lastActiveDay === todayStr) {
    return streak;
  }
  
  if (!streak.lastActiveDay) {
    streak.currentStreak = 1;
    streak.longestStreak = 1;
  } else {
    const lastActiveDate = new Date(streak.lastActiveDay);
    const todayDate = new Date(todayStr);
    const diffTime = Math.abs(todayDate - lastActiveDate);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      streak.currentStreak += 1;
      if (streak.currentStreak > streak.longestStreak) {
        streak.longestStreak = streak.currentStreak;
      }
    } else if (diffDays > 1) {
      streak.currentStreak = 1;
    }
  }
  
  streak.lastActiveDay = todayStr;
  await saveStreakData(streak);
  await checkStatsBadges();
  return streak;
}

export async function addActivity(type, word, detail = "") {
  const history = await getActivityHistory();
  const item = {
    type,
    word,
    detail,
    timestamp: Date.now()
  };
  history.unshift(item);
  if (history.length > 200) {
    history.length = 200;
  }
  await saveActivityHistory(history);
  
  if (type === "capture" || type === "review") {
    await updateStreak();
  }
  
  await checkStatsBadges();
  await updateChromeBadge();
  return item;
}

export async function checkStatsBadges() {
  const words = await getAllWords();
  const streak = await getStreakData();
  const history = await getActivityHistory();
  const collections = await getAllCollections();
  
  const unlocked = await getUnlockedBadges();
  const newlyUnlocked = [];
  
  const totalWords = words.length;
  const reviewCountTotal = await getPersistentReviewCount();
  
  const hasWord = totalWords >= 1;
  const has10Words = totalWords >= 10;
  const has100Words = totalWords >= 100;
  const streak7 = (streak.longestStreak >= 7);
  const streak30 = (streak.longestStreak >= 30);
  const reviews100 = reviewCountTotal >= 100;
  const reviews1000 = reviewCountTotal >= 1000;
  
  const isMasterCollector = (totalWords >= 500 || collections.length >= 10);
  
  const programmingWords = words.filter(w => w.collectionIds && w.collectionIds.includes("col_programming")).length;
  const isProgrammingExpert = programmingWords >= 20;
  
  const readerWords = words.filter(w => w.sentence && w.sentence.trim().length > 0).length;
  const isReader = readerWords >= 20;
  
  const badgeCriteria = {
    "First Word": hasWord,
    "10 Words": has10Words,
    "100 Words": has100Words,
    "7 Day Streak": streak7,
    "30 Day Streak": streak30,
    "100 Reviews": reviews100,
    "1000 Reviews": reviews1000,
    "Master Collector": isMasterCollector,
    "Programming Expert": isProgrammingExpert,
    "Reader": isReader
  };
  
  let modified = false;
  for (const [badge, met] of Object.entries(badgeCriteria)) {
    if (met && !unlocked.includes(badge)) {
      unlocked.push(badge);
      newlyUnlocked.push(badge);
      modified = true;
    }
  }
  
  if (modified) {
    await saveUnlockedBadges(unlocked);
    if (typeof chrome !== 'undefined' && chrome.notifications && chrome.notifications.create) {
      newlyUnlocked.forEach(badge => {
        chrome.notifications.create("", {
          type: "basic",
          iconUrl: "icons/icon128.png",
          title: "🏅 Badge Unlocked!",
          message: `Congratulations! You've earned the "${badge}" badge.`,
          priority: 2
        });
      });
    }
  }
}

export async function updateChromeBadge() {
  if (typeof chrome === 'undefined' || !chrome.action || !chrome.action.setBadgeText) {
    return;
  }
  
  const words = await getAllWords();
  const now = Date.now();
  const dueWords = words.filter(w => w.nextReview <= now);
  const count = dueWords.length;
  
  if (count > 0) {
    chrome.action.setBadgeText({ text: count.toString() });
    chrome.action.setBadgeBackgroundColor({ color: "#EF4444" });
  } else {
    chrome.action.setBadgeText({ text: "" });
  }
}

export async function submitReview(wordId, quality) {
  const words = await getAllWords();
  const idx = words.findIndex(w => w.id === wordId);
  if (idx === -1) return null;
  
  const word = words[idx];
  
  let q = 4;
  if (quality === 1) q = 1;
  else if (quality === 2) q = 3;
  else if (quality === 3) q = 4;
  else if (quality === 4) q = 5;
  
  let reviewCount = word.reviewCount || 0;
  let easeFactor = word.easeFactor || 2.5;
  let interval = word.interval || 1;
  
  if (q < 3) {
    interval = 1;
    reviewCount = 0;
    word.learningStage = "New";
  } else {
    if (reviewCount === 0) {
      interval = 1;
    } else if (reviewCount === 1) {
      interval = (q === 3) ? 3 : 6;
    } else {
      let multiplier = easeFactor;
      if (q === 3) multiplier = 1.2;
      else if (q === 5) multiplier = easeFactor * 1.3;
      
      interval = Math.round(interval * multiplier);
    }
    reviewCount++;
    
    easeFactor = easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (easeFactor < 1.3) easeFactor = 1.3;
    
    word.learningStage = (interval >= 30) ? "Mastered" : "Review";
  }
  
  word.reviewCount = reviewCount;
  word.easeFactor = easeFactor;
  word.interval = interval;
  word.lastReview = Date.now();
  word.nextReview = Date.now() + interval * 24 * 60 * 60 * 1000;
  
  if (word.status === "NEW") {
    word.status = "LEARNING";
  }
  
  words[idx] = word;
  await saveAllWords(words);
  
  let currentTotal = await getPersistentReviewCount();
  currentTotal++;
  await savePersistentReviewCount(currentTotal);
  
  let qualityName = "Good";
  if (quality === 1) qualityName = "Again";
  else if (quality === 2) qualityName = "Hard";
  else if (quality === 4) qualityName = "Easy";
  
  await addActivity("review", word.word, `Rated: ${qualityName}, Next review in ${interval} days`);
  
  return word;
}
