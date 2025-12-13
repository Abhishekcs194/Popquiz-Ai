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
  // Visual noise filters (but NOT food-related terms - we want actual food images!)
  'graffiti', 'mural', 'street_art', 'sculpture', 'statue', 'lego',
  'booth', 'stand', 'expo', 'stage', 'screen', 'display', 'monitor', 'trash', 'bin', 'rubbish',
  'magazine', 'page'
  // Note: 'book' and 'cover' removed from global spam - handled by topic-specific exclusions
];

const CONTEXT_TERMS = {
    logo: ['logo', 'icon', 'symbol'],
    flag: ['flag', 'map'],
    map: ['map', 'location']
};

// Topic-specific disambiguation terms to improve search accuracy
const TOPIC_DISAMBIGUATORS: Record<string, string[]> = {
  'food': [
    'food', 'dish', 'cuisine', 'recipe', 'cooking', 'meal', 'dessert', 'ingredient',
    '-movie', '-film', '-game', '-poster', '-book', '-cover', '-novel', '-story',
    '-author', '-audible', '-publishing', '-literature'
  ],
  'animals': ['animal', 'species', 'wildlife', 'creature', '-movie', '-film', '-character', '-cartoon', '-book', '-cover'],
  'countries': ['country', 'nation', 'flag', '-movie', '-film', '-game', '-book', '-cover'],
  'science': ['science', 'scientific', 'research', '-movie', '-film', '-game', '-book', '-cover'],
  'history': ['history', 'historical', 'ancient', '-movie', '-film', '-book', '-cover'],
  'sports': ['sport', 'sports', 'athlete', 'athletic', '-movie', '-film', '-book', '-cover'],
  'music': ['music', 'song', 'artist', 'musical', '-movie', '-film', '-book', '-cover'],
  'geography': ['geography', 'geographic', 'location', 'place', '-movie', '-film', '-book', '-cover'],
  'nature': ['nature', 'natural', 'wildlife', '-movie', '-film', '-book', '-cover'],
  'plants': ['plant', 'flower', 'tree', 'vegetation', '-movie', '-film', '-book', '-cover'],
};

// Topic-specific exclusion terms for result validation
const TOPIC_EXCLUSIONS: Record<string, string[]> = {
  'food': [
    'movie', 'film', 'poster', 'cinema', 'theater', 'actor', 'director', 'cinematic',
    'book', 'cover', 'novel', 'story', 'author', 'audible', 'publishing', 'publisher',
    'bengtss', 'love story', 'literature', 'fiction', 'non-fiction', 'chapter',
    'album', 'song', 'music', 'cd', 'record'
  ],
  'animals': ['movie', 'film', 'character', 'cartoon', 'animation', 'poster', 'book', 'cover'],
  'countries': ['movie', 'film', 'game', 'video game', 'poster', 'book', 'cover'],
  'science': ['movie', 'film', 'game', 'poster', 'book', 'cover'],
  'history': ['movie', 'film', 'poster', 'book', 'cover'],
  'sports': ['movie', 'film', 'poster', 'book', 'cover'],
  'music': ['movie', 'film', 'poster', 'book', 'cover'],
};

// Enhance query with topic-specific disambiguation terms
const enhanceQueryWithTopic = (query: string, topic?: string): string => {
  if (!topic) return query;
  
  const topicLC = topic.toLowerCase();
  const queryLC = query.toLowerCase();
  
  // Find matching topic keywords
  const matchingTopic = Object.entries(TOPIC_DISAMBIGUATORS).find(([key]) => 
    topicLC.includes(key) || key.includes(topicLC)
  );
  
  if (!matchingTopic) return query;
  
  const disambiguators = matchingTopic[1];
  const enhancedQuery = `${query} ${disambiguators.join(' ')}`;
  
  return enhancedQuery;
};

// Score result by topic relevance
const scoreResultByTopic = (url: string, query: string, topic?: string, pageTitle?: string): number => {
  if (!topic) return 0;
  
  const urlLC = decodeURIComponent(url).toLowerCase();
  const titleLC = (pageTitle || '').toLowerCase();
  const topicLC = topic.toLowerCase();
  const queryLC = query.toLowerCase();
  
  let score = 0;
  
  // Check both URL and page title for topic keywords
  const topicKeywords = topicLC.split(/\s+/).filter(k => k.length > 2);
  topicKeywords.forEach(keyword => {
    if (urlLC.includes(keyword)) score += 15;
    if (titleLC.includes(keyword)) score += 20; // Page title is more reliable
    if (queryLC.includes(keyword)) score += 5;
  });
  
  // Special boost for food-related terms when topic is food
  if (topicLC.includes('food')) {
    const foodTerms = ['dish', 'cuisine', 'recipe', 'cooking', 'meal', 'dessert', 'ingredient', 'plate', 'serving', 'food'];
    foodTerms.forEach(term => {
      if (urlLC.includes(term)) score += 20;
      if (titleLC.includes(term)) score += 30; // Strong boost for food in title
    });
  }
  
  // Check for topic-specific exclusion terms in BOTH URL and title
  const matchingTopic = Object.entries(TOPIC_EXCLUSIONS).find(([key]) => 
    topicLC.includes(key) || key.includes(topicLC)
  );
  
  if (matchingTopic) {
    const exclusions = matchingTopic[1];
    exclusions.forEach(term => {
      if (urlLC.includes(term) || titleLC.includes(term)) {
        score -= 200; // EXTREME penalty - reject immediately
      }
    });
  }
  
  // Additional checks for movie/film/book in title when topic is food
  if (topicLC.includes('food')) {
    const mediaPatterns = ['movie', 'film', 'poster', 'book', 'novel', 'story', 'museum', 'night at', 'secret of'];
    const isRestaurantOrBrand = titleLC.includes('restaurant') || titleLC.includes('factory') || 
                                 titleLC.includes('chain') || titleLC.includes('company');
    
    // Only penalize if it's not a restaurant/brand (restaurants can show food images)
    if (!isRestaurantOrBrand) {
      mediaPatterns.forEach(pattern => {
        if (titleLC.includes(pattern)) {
          score -= 300; // Reject movie/book titles completely
        }
      });
    }
    
    // Bonus for exact matches
    if (titleLC === queryLC || titleLC === `${queryLC} (food)` || titleLC === `${queryLC} (dish)`) {
      score += 100; // Big bonus for exact matches
    }
  }
  
  return score;
};

// Validate result matches topic context
const isValidWikiImage = (url: string, query: string, type: string = 'general', topic?: string, pageTitle?: string): boolean => {
  if (!url) return false;
  const cleanUrl = decodeURIComponent(url).toLowerCase();
  const titleLC = (pageTitle || '').toLowerCase();
  
  // 1. Filter out absolute spam
  if (SPAM_TERMS.some(term => cleanUrl.includes(term))) return false;
  
  // 2. Context-aware filtering
  if (type !== 'logo' && CONTEXT_TERMS.logo.some(term => cleanUrl.includes(term))) return false;
  if (type !== 'flag' && type !== 'general' && type !== 'country' && CONTEXT_TERMS.flag.some(term => cleanUrl.includes(term))) return false;

  // 3. Topic-based validation (exclude results that don't match topic) - AGGRESSIVE FILTERING
  if (topic) {
    const topicLC = topic.toLowerCase();
    const matchingTopic = Object.entries(TOPIC_EXCLUSIONS).find(([key]) => 
      topicLC.includes(key) || key.includes(topicLC)
    );
    
    if (matchingTopic) {
      const exclusions = matchingTopic[1];
      // Reject if URL OR TITLE contains ANY exclusion terms for this topic
      if (exclusions.some(term => cleanUrl.includes(term) || titleLC.includes(term))) {
        return false; // Hard reject - don't even consider these
      }
    }
    
    // Additional aggressive filtering for food topic - check BOTH URL and title
    if (topicLC.includes('food')) {
      // Reject if URL looks like a book cover, movie poster, or media
      const mediaPatterns = [
        /book.*cover/i,
        /cover.*book/i,
        /novel.*cover/i,
        /cover.*novel/i,
        /audible/i,
        /author/i,
        /publishing/i,
        /literature/i,
        /poster.*movie/i,
        /movie.*poster/i,
        /film.*poster/i,
        /poster.*film/i
      ];
      
      if (mediaPatterns.some(pattern => pattern.test(cleanUrl) || pattern.test(titleLC))) {
        return false;
      }
      
      // Reject if page title contains movie/film/book terms (but allow restaurant names)
      const titleExclusions = ['movie', 'film', 'poster', 'book', 'novel', 'story', 'museum', 'night at', 'secret of', 'tomb'];
      // Allow restaurant/brand names that might contain food (e.g., "The Cheesecake Factory")
      const isRestaurantOrBrand = titleLC.includes('restaurant') || titleLC.includes('factory') || 
                                   titleLC.includes('chain') || titleLC.includes('company') ||
                                   titleLC.includes('brand') || titleLC.includes('franchise');
      
      if (!isRestaurantOrBrand && titleExclusions.some(term => titleLC.includes(term))) {
        return false; // Hard reject movie/book titles (unless it's a restaurant)
      }
      
      // For food topic, prioritize exact matches or food-related pages
      const queryLC = query.toLowerCase();
      const isExactMatch = titleLC === queryLC || titleLC === `${queryLC} (food)` || titleLC === `${queryLC} (dish)`;
      
      // If it's an exact match, allow it even without explicit food terms
      if (isExactMatch) {
        return true; // Exact match is always valid
      }
      
      // For non-exact matches, prefer pages with food-related terms
      const foodTerms = ['food', 'dish', 'cuisine', 'recipe', 'cooking', 'meal', 'dessert', 'ingredient', 'plate', 'restaurant'];
      const urlLC = cleanUrl.toLowerCase();
      const hasFoodTerm = foodTerms.some(term => titleLC.includes(term) || urlLC.includes(term));
      
      // If title contains the query but no food terms, and query is ambiguous, reject
      if (titleLC.includes(queryLC) && !hasFoodTerm && !isRestaurantOrBrand) {
        // Check if query might be ambiguous (like "tomb" which could be food or movie)
        const ambiguousQueries = ['tomb', 'museum', 'night', 'secret'];
        if (ambiguousQueries.some(amb => queryLC.includes(amb))) {
          return false; // Reject ambiguous queries without food context
        }
      }
    }
  }

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

// --- 8. FOOD (Foodish API) ---
// Simple, free API for food images - perfect for food-related questions
// Note: This API can be unreliable, so we have retry logic and Wikipedia fallback
const fetchFoodishImage = async (query: string, retries: number = 2): Promise<string | null> => {
    const apiUrl = 'https://foodish-api.herokuapp.com/api/';
    console.log(`[ImageService] 🍔 Fetching Foodish image for query: "${query}"`);
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            console.log(`[ImageService] 🍔 Foodish attempt ${attempt + 1}/${retries + 1} for "${query}"`);
            
            // Add timeout to prevent hanging
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
            
            const fetchStartTime = Date.now();
            const res = await fetch(apiUrl, {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                },
                signal: controller.signal,
            });
            
            clearTimeout(timeoutId);
            const fetchDuration = Date.now() - fetchStartTime;
            console.log(`[ImageService] 🍔 Foodish response status: ${res.status} ${res.statusText} (took ${fetchDuration}ms)`);
            
            if (!res.ok) {
                console.warn(`[ImageService] 🍔 Foodish API returned error status ${res.status}`);
                if (attempt < retries) {
                    const delay = 1000 * (attempt + 1);
                    console.log(`[ImageService] 🍔 Retrying Foodish in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }
                console.warn(`[ImageService] 🍔 Foodish API failed after ${retries + 1} attempts`);
                return null;
            }
            
            const data = await res.json();
            console.log(`[ImageService] 🍔 Foodish response data:`, data);
            
            // Validate response structure
            if (!data || typeof data !== 'object') {
                console.warn(`[ImageService] 🍔 Foodish returned invalid response structure:`, typeof data);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }
                return null;
            }
            
            // Check if response has image field
            if (data.image && typeof data.image === 'string' && data.image.startsWith('http')) {
                console.log(`[ImageService] ✅ Foodish success! Image URL: ${data.image}`);
                return data.image;
            }
            
            console.warn(`[ImageService] 🍔 Foodish response missing valid image field. Data:`, data);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
            }
            
            return null;
        } catch (e: any) {
            // Handle abort/timeout
            if (e.name === 'AbortError') {
                console.warn(`[ImageService] 🍔 Foodish request timeout on attempt ${attempt + 1}`);
                if (attempt < retries) {
                    await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                    continue;
                }
                return null;
            }
            
            // Other errors
            console.error(`[ImageService] 🍔 Foodish error on attempt ${attempt + 1}:`, e);
            if (attempt < retries) {
                await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
            }
            
            return null;
        }
    }
    
    console.warn(`[ImageService] 🍔 Foodish failed after all retries for "${query}"`);
    return null;
};

// --- 8. WIKI HELPER ---
interface CandidateWithScore {
  url: string;
  score: number;
}

async function runWikiSearch(query: string, type: string, topic?: string): Promise<string | null> {
  const candidates: CandidateWithScore[] = [];
  
  const collectCandidates = (pages: any[], searchQuery: string) => {
      console.log(`[ImageService] 📚 Collecting candidates from ${Object.keys(pages).length} pages for search: "${searchQuery}"`);
      for (const page of Object.values(pages)) {
          const pageTitle = (page as any).title || '';
          // Prefer 'original' source if available (better quality), then thumbnail
          const url = (page as any).original?.source || (page as any).thumbnail?.source || (page as any).imageinfo?.[0]?.thumburl || (page as any).imageinfo?.[0]?.url;
          
          if (url) {
              const isValid = isValidWikiImage(url, query, type, topic, pageTitle);
              if (isValid) {
                  const score = scoreResultByTopic(url, query, topic, pageTitle);
                  console.log(`[ImageService] 📚 ✅ Candidate: "${pageTitle}" | Score: ${score} | URL: ${url.substring(0, 80)}...`);
                  candidates.push({ url, score });
              } else {
                  console.log(`[ImageService] 📚 ❌ Rejected: "${pageTitle}" | URL: ${url.substring(0, 80)}...`);
              }
          } else {
              console.log(`[ImageService] 📚 ⚠️ No image URL found for page: "${pageTitle}"`);
          }
      }
  };

  // Build multiple search strategies with topic context
  // SIMPLIFIED: Use shorter, more direct queries that Wikipedia handles better
  const searchStrategies: string[] = [];
  const topicLC = topic?.toLowerCase() || '';
  
  if (topicLC.includes('food')) {
    // For food, use simpler, more direct searches
    // Strategy 1: Exact query (most likely to match the actual food page)
    searchStrategies.push(query);
    
    // Strategy 2: Query + "food" (helps disambiguate)
    searchStrategies.push(`${query} food`);
    
    // Strategy 3: Query with basic exclusions only
    searchStrategies.push(`${query} -movie -film -poster -book -cover`);
    
    // Strategy 4: Query + "dish" (common food term)
    searchStrategies.push(`${query} dish`);
    
    // Strategy 5: Fallback with minimal exclusions
    searchStrategies.push(`${query} -disambiguation`);
  } else if (topic) {
    // For non-food topics, use topic-aware searches
    const enhancedQuery = enhanceQueryWithTopic(query, topic);
    searchStrategies.push(`${enhancedQuery} -disambiguation`);
    
    const topicKeywords = topicLC.split(/\s+/).filter(k => k.length > 2);
    if (topicKeywords.length > 0) {
      searchStrategies.push(`${query} ${topicKeywords.join(' ')} -disambiguation`);
    }
    
    searchStrategies.push(`${query} -disambiguation`);
  } else {
    // No topic, just basic search
    searchStrategies.push(`${query} -disambiguation`);
  }

  // Try each search strategy
  console.log(`[ImageService] 📚 Trying ${searchStrategies.length} search strategies`);
  for (let i = 0; i < searchStrategies.length; i++) {
    const searchQuery = searchStrategies[i];
    try {
      console.log(`[ImageService] 📚 Strategy ${i + 1}/${searchStrategies.length}: "${searchQuery}"`);
      const params = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: searchQuery,
        gsrnamespace: '0', // Main namespace only
        gsrlimit: '5',
        prop: 'pageimages',
        pithumbsize: '600',
        piprop: 'thumbnail|original',
        format: 'json',
        origin: '*'
      });
      const res = await fetch(`${WIKI_API_URL}?${params.toString()}`);
      console.log(`[ImageService] 📚 Wikipedia API response status: ${res.status}`);
      
      if (!res.ok) {
        console.warn(`[ImageService] 📚 Wikipedia API error: ${res.status} ${res.statusText}`);
        continue;
      }
      
      const data = await res.json();
      if (data.query?.pages) {
        collectCandidates(data.query.pages, searchQuery);
        // If we found good candidates, we can break early
        if (candidates.length > 0 && candidates.some(c => c.score > 0)) {
          console.log(`[ImageService] 📚 Found good candidates, stopping search`);
          break;
        }
      } else {
        console.log(`[ImageService] 📚 No pages found in Wikipedia response`);
      }
    } catch(e) {
      console.error(`[ImageService] 📚 Wikipedia search error for strategy "${searchQuery}":`, e);
      // Continue to next strategy
    }
  }

  // Sort candidates by score (highest first) and return best match
  if (candidates.length > 0) {
    console.log(`[ImageService] 📚 Found ${candidates.length} total candidates, sorting by score...`);
    candidates.sort((a, b) => b.score - a.score);
    
    console.log(`[ImageService] 📚 Top 3 candidates:`, candidates.slice(0, 3).map(c => ({ score: c.score, url: c.url.substring(0, 80) + '...' })));
    
    // For food topic, prefer results with positive or neutral scores
    const topicLC = topic?.toLowerCase() || '';
    if (topicLC.includes('food')) {
      // First, try to find a candidate with a good score (> 0)
      const goodCandidate = candidates.find(c => c.score > 0);
      if (goodCandidate) {
        console.log(`[ImageService] ✅ Wikipedia food image selected (score: ${goodCandidate.score}): ${goodCandidate.url.substring(0, 80)}...`);
        return goodCandidate.url;
      }
      
      // If no good candidates, accept any candidate that's not heavily penalized
      const acceptableCandidate = candidates.find(c => c.score > -50);
      if (acceptableCandidate) {
        console.log(`[ImageService] ⚠️ Using acceptable Wikipedia candidate (score: ${acceptableCandidate.score}): ${acceptableCandidate.url.substring(0, 80)}...`);
        return acceptableCandidate.url;
      }
      
      // Last resort: accept the best candidate even if it's low-scoring (might still be valid)
      if (candidates[0].score > -100) {
        console.warn(`[ImageService] ⚠️ Using low-scoring Wikipedia candidate (score: ${candidates[0].score}): ${candidates[0].url.substring(0, 80)}...`);
        return candidates[0].url;
      }
      
      console.warn(`[ImageService] ❌ All Wikipedia candidates rejected (all scores < -100)`);
      return null;
    }
    
    console.log(`[ImageService] ✅ Wikipedia image selected: ${candidates[0].url.substring(0, 80)}...`);
    return candidates[0].url;
  }
  
  console.warn(`[ImageService] ❌ No Wikipedia candidates found for "${query}"`);

  // B. Commons Files (Backup) - BLOCKED for Pop Culture
  if (type === 'game' || type === 'movie' || type === 'character' || type === 'anime') {
      return null;
  }

  try {
      const spamFilter = '-cosplay -costume -pdf -webm -text -graffiti -sculpture -person -people -man -woman';
      const commonsQuery = topic ? `${query} ${topic} ${spamFilter}` : `${query} ${spamFilter}`;
      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: commonsQuery, 
        gsrnamespace: '6', gsrlimit: '10', 
        prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600', format: 'json', origin: '*'
      });
      const res = await fetch(`${COMMONS_API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.query?.pages) {
        collectCandidates(data.query.pages, commonsQuery);
        if (candidates.length > 0) {
          candidates.sort((a, b) => b.score - a.score);
          
          // For food topic, filter out heavily penalized results
          const topicLC = topic?.toLowerCase() || '';
          if (topicLC.includes('food')) {
            const bestCandidate = candidates.find(c => c.score > -50);
            if (bestCandidate) {
              return bestCandidate.url;
            }
            return candidates[0].score > -100 ? candidates[0].url : null;
          }
          
          return candidates[0].url;
        }
      }
  } catch(e) {}

  return null;
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
    console.log(`[ImageService] 🎯 getSmartImage called: query="${query}", type="${type}", topic="${topic}"`);
    const safeType = type || 'general';
    const topicLC = topic?.toLowerCase() || '';
    let imageUrl: string | null = null;
    
    // PRIORITY 1: Food topic - Try Wikipedia first (more reliable), then Foodish as backup
    // Foodish API is unreliable and can fail after a few requests, so Wikipedia is primary
    if (topicLC.includes('food')) {
        console.log(`[ImageService] 🍽️ Food topic detected, trying Wikipedia first...`);
        // Try Wikipedia first with all our filtering logic
        imageUrl = await runWikiSearch(query, safeType, topic);
        
        if (imageUrl) {
            console.log(`[ImageService] ✅ Wikipedia returned image for food query "${query}"`);
            return imageUrl;
        }
        
        console.log(`[ImageService] ⚠️ Wikipedia failed for "${query}", trying Foodish as backup...`);
        // If Wikipedia fails, try Foodish as backup
        imageUrl = await fetchFoodishImage(query);
        
        if (imageUrl) {
            console.log(`[ImageService] ✅ Foodish returned image for food query "${query}"`);
            return imageUrl;
        }
        
        console.error(`[ImageService] ❌ Both Wikipedia and Foodish failed for food query "${query}"`);
        // Return whatever we got (or null if both failed)
        return imageUrl;
    }
    
    // CRITICAL: Check if this is game-related
    const isGame = isGameRelated(query, safeType, topic);
    
    if (isGame) {
        // FORCE RAWG API for ALL game-related queries - NO FALLBACKS
        imageUrl = await fetchRawgImage(query, true);
        
        if (!imageUrl) {
            console.warn(`[ImageService] RAWG failed for game query "${query}" - Returning null (no fallbacks allowed)`);
            return null; // Return null instead of falling back to other sources
        }
        
        return imageUrl;
    }

    // 2. Specific High-Quality APIs (non-game, non-food)
    if (safeType === 'pokemon') imageUrl = await fetchPokemonImage(query);
    else if (safeType === 'anime') imageUrl = await fetchAnimeImage(query);
    else if (safeType === 'flag') imageUrl = await fetchFlagImage(query);
    else if (safeType === 'art') imageUrl = await fetchArtImage(query);
    
    // 3. Movies (non-game)
    else if (safeType === 'movie') {
        imageUrl = await fetchTmdbImage(query);
        if (!imageUrl) imageUrl = await fetchItunesImage(query, 'movie');
    }

    if (imageUrl) return imageUrl;

    // 4. Fallback: iTunes Global Search (ONLY for non-game, non-food queries)
    if ((safeType === 'general' || safeType === 'character') && !isGame && !topicLC.includes('food')) {
         const itunesFallback = await fetchItunesImage(query, 'all');
         if (itunesFallback) return itunesFallback;
    }

    // 5. Wiki Strategy (ONLY for non-game, non-food queries)
    // Note: Food queries already tried Wikipedia above, so skip here
    if (!isGame && !topicLC.includes('food')) {
        // runWikiSearch now handles topic-aware search internally with multiple strategies
        // It will try: query+topic+disambiguation, query+topic, query+exclusions, and basic query
        imageUrl = await runWikiSearch(query, safeType, topic);
    }
    
    return imageUrl;
};