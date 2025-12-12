// The Ultimate Image API Router
// Prioritizes specific high-quality APIs before falling back to a Randomized Wikipedia Search

const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// Keys: Accessing environment variables defined in vite.config.ts
const RAWG_API_KEY = (process.env as any).RAWG_API_KEY || ''; 
const TMDB_API_KEY = (process.env as any).TMDB_API_KEY || '';

// CORS Proxy for RAWG images (media.rawg.io blocks CORS)
// Using reliable CORS proxy services with fallbacks
const getCorsProxyUrl = (imageUrl: string): string => {
    if (!imageUrl || !imageUrl.includes('media.rawg.io')) {
        return imageUrl; // No proxy needed for non-RAWG images
    }
    
    try {
        // Use corsproxy.io - reliable and free CORS proxy
        // Format: https://corsproxy.io/?URL
        return `https://corsproxy.io/?${encodeURIComponent(imageUrl)}`;
    } catch (e) {
        console.warn(`[ImageService] Failed to create CORS proxy URL:`, e);
        // Return original URL as last resort (will show CORS error but image link will work)
        return imageUrl;
    }
}; 

// --- VALIDATION & FILTERING ---

const SPAM_TERMS = [
  'stub', 'disambig', 'wiki_letter', 'chart', 'diagram',
  'store', 'shop', 'center', 'building', 'mall', 'plush', 'toy', 'merch', 'card', 'box',
  'cosplay', 'costume', 'suit', 'human', 'man', 'woman', 'person', 'people', 'convention', 'event', 'fan',
  'advert', 'pdf', 'svg', 'webm', 'ogv',
  // New visual noise filters
  'graffiti', 'mural', 'street_art', 'sculpture', 'statue', 'lego', 'cake', 'food',
  'booth', 'stand', 'expo', 'stage', 'screen', 'display', 'monitor', 'trash', 'bin', 'rubbish',
  'magazine', 'cover', 'page', 'book'
];

const CONTEXT_TERMS = {
    logo: ['logo', 'icon', 'symbol'],
    flag: ['flag', 'map'],
    map: ['map', 'location']
};

const isValidWikiImage = (url: string, query: string, type: string = 'general'): boolean => {
  if (!url) return false;
  const cleanUrl = decodeURIComponent(url).toLowerCase();
  
  // 1. Filter out absolute spam
  if (SPAM_TERMS.some(term => cleanUrl.includes(term))) return false;
  
  // 2. Context-aware filtering
  if (type !== 'logo' && CONTEXT_TERMS.logo.some(term => cleanUrl.includes(term))) return false;
  if (type !== 'flag' && type !== 'general' && type !== 'country' && CONTEXT_TERMS.flag.some(term => cleanUrl.includes(term))) return false;

  return true;
};

// --- 1. POKÉMON (PokéAPI) ---
const fetchPokemonImage = async (query: string): Promise<string | null> => {
    try {
        const cleanName = query.toLowerCase().replace('pokemon', '').trim().replace(/[^a-z0-9-]/g, '');
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${cleanName}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default || null;
    } catch (e) { return null; }
};

// --- 2. ANIME (Jikan) ---
const fetchAnimeImage = async (query: string): Promise<string | null> => {
    try {
        const res = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=1`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.data?.[0]?.images?.jpg?.image_url || null;
    } catch (e) { return null; }
};

// --- 3. GAMES (RAWG) ---
// Enhanced RAWG search with multiple query variations for better matching
const fetchRawgImage = async (query: string, tryVariations: boolean = true): Promise<string | null> => {
    if (!RAWG_API_KEY) {
        console.warn(`[ImageService] RAWG_API_KEY missing. Cannot fetch game image.`);
        return null;
    }

    // Try multiple query variations to improve match rate
    const queryVariations = tryVariations ? [
        query, // Original query
        query.replace(/\(.*?\)/g, '').trim(), // Remove parentheses content
        query.split('(')[0].trim(), // Everything before first parenthesis
        query.split(':')[0].trim(), // Everything before colon
        query.split('-')[0].trim(), // Everything before dash
    ].filter((q, i, arr) => q && arr.indexOf(q) === i) : [query]; // Remove duplicates

    for (const searchQuery of queryVariations) {
        if (!searchQuery) continue;
        
        try {
            console.log(`[ImageService] Fetching RAWG for: "${searchQuery}"...`);
            const url = `https://api.rawg.io/api/games?search=${encodeURIComponent(searchQuery)}&key=${RAWG_API_KEY}&page_size=5`;
            const res = await fetch(url);
            
            if (!res.ok) {
                const errorText = await res.text();
                console.error(`[ImageService] RAWG Request Failed: ${res.status} ${res.statusText}`, errorText);
                continue; // Try next variation
            }

            const data = await res.json();
            if (data.results && data.results.length > 0) {
                // Try to find the best match (exact or close match)
                let bestMatch = data.results[0];
                
                // Look for exact name match
                const exactMatch = data.results.find((game: any) => 
                    game.name.toLowerCase() === searchQuery.toLowerCase() ||
                    game.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    searchQuery.toLowerCase().includes(game.name.toLowerCase())
                );
                
                if (exactMatch) {
                    bestMatch = exactMatch;
                }
                
                const imageUrl = bestMatch.background_image || 
                                (bestMatch.short_screenshots && bestMatch.short_screenshots[0]?.image) ||
                                (bestMatch.short_screenshots && bestMatch.short_screenshots.find((s: any) => s.image)?.image);
                
                if (imageUrl) {
                    console.log(`[ImageService] RAWG Match: ${bestMatch.name}`, 'Image found');
                    // Apply CORS proxy to RAWG images
                    return getCorsProxyUrl(imageUrl);
                }
            }
        } catch (e) { 
            console.error(`[ImageService] RAWG Error for "${searchQuery}":`, e);
            continue; // Try next variation
        }
    }
    
    console.warn(`[ImageService] RAWG found no results for all variations of: "${query}"`);
    return null;
};

// --- 4. MOVIES (TMDB) ---
const fetchTmdbImage = async (query: string): Promise<string | null> => {
    if (!TMDB_API_KEY) return null;
    try {
        const res = await fetch(`https://api.themoviedb.org/3/search/multi?query=${encodeURIComponent(query)}&api_key=${TMDB_API_KEY}`);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            const item = data.results[0];
            const path = item.backdrop_path || item.poster_path;
            if (path) return `https://image.tmdb.org/t/p/w780${path}`;
        }
        return null;
    } catch (e) { return null; }
};

// --- 5. ITUNES (Fallback for Movies & Games) ---
// Excellent for Official Posters and App Icons (which look like covers)
const fetchItunesImage = async (query: string, type: 'movie' | 'game' | 'all'): Promise<string | null> => {
    try {
        let media = 'all';
        if (type === 'movie') media = 'movie';
        if (type === 'game') media = 'software';

        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=${media}&limit=3`);
        if (!res.ok) return null;
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            const item = data.results[0];
            const smallUrl = item.artworkUrl100; 
            if (smallUrl) {
                return smallUrl.replace('100x100', '600x600');
            }
        }
        return null;
    } catch (e) { return null; }
}

// --- 6. FLAGS (RestCountries) ---
const fetchFlagImage = async (query: string): Promise<string | null> => {
    try {
        const cleanQuery = query.replace('flag', '').trim();
        let res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(cleanQuery)}?fullText=true`);
        if (!res.ok) res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(cleanQuery)}`);
        if(!res.ok) return null;
        const data = await res.json();
        return data[0]?.flags?.png || null;
    } catch (e) { return null; }
};

// --- 7. ART (Met Museum) ---
const fetchArtImage = async (query: string): Promise<string | null> => {
    try {
        const searchRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(query)}&hasImages=true`);
        if (!searchRes.ok) return null;
        const searchData = await searchRes.json();
        if (searchData.objectIDs?.length > 0) {
            const objId = searchData.objectIDs[0];
            const objRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objId}`);
            const objData = await objRes.json();
            return objData.primaryImage || objData.primaryImageSmall || null;
        }
        return null;
    } catch (e) { return null; }
};

// --- 8. WIKI HELPER ---
async function runWikiSearch(query: string, type: string): Promise<string | null> {
  const candidates: string[] = [];
  
  const collectCandidates = (pages: any[]) => {
      for (const page of Object.values(pages)) {
          // Prefer 'original' source if available (better quality), then thumbnail
          const url = page.original?.source || page.thumbnail?.source || page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
          if (url && isValidWikiImage(url, query, type)) {
              candidates.push(url);
          }
      }
  };

  // A. Page Images
  try {
      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '3', 
        prop: 'pageimages', pithumbsize: '600', piprop: 'thumbnail|original', format: 'json', origin: '*' 
      });
      const res = await fetch(`${WIKI_API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.query?.pages) collectCandidates(data.query.pages);
  } catch(e) {}

  if (candidates.length > 0) return candidates[0]; 

  // B. Commons Files (Backup) - BLOCKED for Pop Culture
  if (type === 'game' || type === 'movie' || type === 'character' || type === 'anime') {
      return null;
  }

  try {
      const spamFilter = '-cosplay -costume -pdf -webm -text -graffiti -sculpture -person -people -man -woman';
      const searchQuery = `${query} ${spamFilter}`; 
      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: searchQuery, 
        gsrnamespace: '6', gsrlimit: '10', 
        prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600', format: 'json', origin: '*'
      });
      const res = await fetch(`${COMMONS_API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.query?.pages) collectCandidates(data.query.pages);
  } catch(e) {}

  return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
}

// Helper function to detect if query/topic is game-related
const isGameRelated = (query: string, type?: string, topic?: string): boolean => {
    const safeType = type || 'general';
    const queryLC = query.toLowerCase();
    const topicLC = topic?.toLowerCase() || '';
    
    // Explicit game type
    if (safeType === 'game') return true;
    
    // Topic-based detection
    const gameTopicKeywords = [
        'game', 'gaming', 'esports', 'playstation', 'xbox', 'nintendo', 
        'steam', 'pc game', 'video game', 'console', 'gamer',
        'nintendo switch', 'ps5', 'ps4', 'xbox series', 'xbox one',
        'pc gaming', 'mobile game', 'indie game', 'retro game'
    ];
    if (gameTopicKeywords.some(keyword => topicLC.includes(keyword))) return true;
    
    // Query-based detection (common game-related terms)
    const gameQueryKeywords = [
        'game', 'video game', 'series', 'edition', 'remastered', 'remake',
        'dlc', 'expansion', 'sequel', 'prequel', 'franchise'
    ];
    if (gameQueryKeywords.some(keyword => queryLC.includes(keyword))) return true;
    
    // Check for common game title patterns
    const gamePatterns = [
        /\d{4}$/, // Years at the end (e.g., "Call of Duty 2023")
        /^(the|a|an)\s+.+\s+(game|adventure|quest|legend|story)$/i, // "The [Something] Game"
    ];
    if (gamePatterns.some(pattern => pattern.test(query))) return true;
    
    return false;
};

// --- MASTER ROUTER ---
export const getSmartImage = async (query: string, type?: string, topic?: string): Promise<string | null> => {
    const safeType = type || 'general';
    let imageUrl: string | null = null;
    
    // CRITICAL: Check if this is game-related FIRST
    const isGame = isGameRelated(query, safeType, topic);
    
    if (isGame) {
        // FORCE RAWG API for ALL game-related queries - NO FALLBACKS
        console.log(`[ImageService] Game context detected for "${query}" - Using RAWG API exclusively`);
        imageUrl = await fetchRawgImage(query, true);
        
        if (!imageUrl) {
            console.warn(`[ImageService] RAWG failed for game query "${query}" - Returning null (no fallbacks allowed)`);
            return null; // Return null instead of falling back to other sources
        }
        
        return imageUrl;
    }

    // 1. Specific High-Quality APIs (non-game)
    if (safeType === 'pokemon') imageUrl = await fetchPokemonImage(query);
    else if (safeType === 'anime') imageUrl = await fetchAnimeImage(query);
    else if (safeType === 'flag') imageUrl = await fetchFlagImage(query);
    else if (safeType === 'art') imageUrl = await fetchArtImage(query);
    
    // 2. Movies (non-game)
    else if (safeType === 'movie') {
        imageUrl = await fetchTmdbImage(query);
        if (!imageUrl) imageUrl = await fetchItunesImage(query, 'movie');
    }

    if (imageUrl) return imageUrl;

    // 3. Fallback: iTunes Global Search (ONLY for non-game queries)
    if ((safeType === 'general' || safeType === 'character') && !isGame) {
         const itunesFallback = await fetchItunesImage(query, 'all');
         if (itunesFallback) return itunesFallback;
    }

    // 4. Wiki Strategy (ONLY for non-game queries)
    if (!isGame) {
        // Strategy A: Subject + Topic
        const topicLC = topic?.toLowerCase() || '';
        if (topic && !query.toLowerCase().includes(topicLC)) {
            imageUrl = await runWikiSearch(`${query} ${topic}`, safeType);
            if (imageUrl) return imageUrl;
        }

        // Strategy B: Subject + Type
        const categorySuffix = safeType === 'character' ? 'character' : safeType === 'game' ? 'video game' : safeType;
        if (categorySuffix && categorySuffix !== 'general') {
            imageUrl = await runWikiSearch(`${query} ${categorySuffix}`, safeType);
            if (imageUrl) return imageUrl;
        }

        // Strategy C: Subject Only
        imageUrl = await runWikiSearch(query, safeType);
    }
    
    return imageUrl;
};