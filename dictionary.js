/**
 * WordVault Dictionary Service
 * Interacts with the free Dictionary API to enrich vocab terms,
 * and maintains a local cache to optimize network usage.
 */

// Cache key prefix
const CACHE_STORAGE_KEY = "dict_cache";

// Retrieve cache from local storage
async function getCache() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    try {
      return JSON.parse(localStorage.getItem(CACHE_STORAGE_KEY) || "{}");
    } catch (e) {
      return {};
    }
  }
  return new Promise((resolve) => {
    chrome.storage.local.get({ [CACHE_STORAGE_KEY]: {} }, (result) => {
      resolve(result[CACHE_STORAGE_KEY] || {});
    });
  });
}

// Save cache to local storage
async function saveCache(cache) {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(cache));
    return;
  }
  return new Promise((resolve) => {
    chrome.storage.local.set({ [CACHE_STORAGE_KEY]: cache }, () => {
      resolve();
    });
  });
}

/**
 * Fetches dictionary enrichment for a word (cached).
 * @param {string} word - The term to search for.
 * @returns {Promise<object>} enriched fields or null if not found/error.
 */
export async function fetchWordDefinition(word) {
  if (!word) {
    return { found: false, dictionaryStatus: "not_found" };
  }
  
  // 4. Normalize: trim(), remove punctuation, lowercase
  const targetWord = word.trim().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"']/g, "").replace(/\s+/g, " ").toLowerCase();

  if (!targetWord) {
    return { found: false, dictionaryStatus: "not_found" };
  }

  // 5. Check if multiple words (phrase)
  if (targetWord.includes(" ")) {
    console.info("Dictionary skipped (phrase)");
    return {
      found: false,
      dictionaryStatus: "skipped_phrase"
    };
  }

  // 1. Check Cache first
  const cache = await getCache();
  if (cache[targetWord]) {
    const cached = cache[targetWord];
    // Migrate legacy cache entries
    if (cached && typeof cached === 'object' && !cached.dictionaryStatus) {
      cached.dictionaryStatus = (cached.meaning && cached.meaning.trim()) ? "found" : "not_found";
      cached.found = cached.dictionaryStatus === "found";
    }
    
    // Log matching status
    if (cached.dictionaryStatus === "found") {
      console.info("Dictionary entry found");
    } else if (cached.dictionaryStatus === "not_found") {
      console.info("Dictionary entry not found");
    } else if (cached.dictionaryStatus === "skipped_phrase") {
      console.info("Dictionary skipped (phrase)");
    } else if (cached.dictionaryStatus === "error") {
      console.info("Dictionary network error");
    }
    return cached;
  }

  try {
    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(targetWord)}`, {
      method: "GET",
      headers: { "Accept": "application/json" }
    });

    if (response.status === 404) {
      console.info("Dictionary entry not found");
      const notFoundResult = {
        found: false,
        dictionaryStatus: "not_found"
      };
      cache[targetWord] = notFoundResult;
      await saveCache(cache);
      return notFoundResult;
    }

    if (!response.ok) {
      console.info("Dictionary network error");
      return {
        found: false,
        dictionaryStatus: "error"
      };
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) {
      console.info("Dictionary entry not found");
      const notFoundResult = {
        found: false,
        dictionaryStatus: "not_found"
      };
      cache[targetWord] = notFoundResult;
      await saveCache(cache);
      return notFoundResult;
    }

    const entry = data[0];
    
    // Extract phonetic text
    let phonetic = entry.phonetic || "";
    if (!phonetic && Array.isArray(entry.phonetics)) {
      const pWithText = entry.phonetics.find(p => p.text);
      if (pWithText) phonetic = pWithText.text;
    }

    // Extract audio
    let phoneticsAudio = "";
    if (Array.isArray(entry.phonetics)) {
      const pWithAudio = entry.phonetics.find(p => p.audio && p.audio.trim().length > 0);
      if (pWithAudio) {
        phoneticsAudio = pWithAudio.audio;
        if (phoneticsAudio.startsWith("//")) {
          phoneticsAudio = "https:" + phoneticsAudio;
        }
      }
    }

    // Extract first meaning and definitions
    let meaningText = "";
    let partOfSpeech = "";
    let example = "";
    let synonymsList = [];
    let antonymsList = [];

    if (Array.isArray(entry.meanings) && entry.meanings.length > 0) {
      const firstMeaning = entry.meanings[0];
      partOfSpeech = firstMeaning.partOfSpeech || "";
      
      if (Array.isArray(firstMeaning.synonyms)) {
        synonymsList = [...firstMeaning.synonyms];
      }
      if (Array.isArray(firstMeaning.antonyms)) {
        antonymsList = [...firstMeaning.antonyms];
      }

      if (Array.isArray(firstMeaning.definitions) && firstMeaning.definitions.length > 0) {
        const firstDef = firstMeaning.definitions[0];
        meaningText = firstDef.definition || "";
        example = firstDef.example || "";
        
        if (Array.isArray(firstDef.synonyms)) {
          synonymsList = [...synonymsList, ...firstDef.synonyms];
        }
        if (Array.isArray(firstDef.antonyms)) {
          antonymsList = [...antonymsList, ...firstDef.antonyms];
        }
      }
    }

    const enriched = {
      found: true,
      dictionaryStatus: "found",
      word: entry.word || targetWord,
      meaning: meaningText,
      partOfSpeech: partOfSpeech,
      phonetic: phonetic,
      phoneticsAudio: phoneticsAudio,
      example: example,
      synonyms: synonymsList.slice(0, 5).join(", "),
      antonyms: antonymsList.slice(0, 5).join(", "),
      origin: entry.origin || ""
    };

    console.info("Dictionary entry found");
    cache[targetWord] = enriched;
    await saveCache(cache);
    return enriched;

  } catch (error) {
    console.info("Dictionary network error");
    return {
      found: false,
      dictionaryStatus: "error"
    };
  }
}
