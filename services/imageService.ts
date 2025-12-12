// The Ultimate Image API Router
// Prioritizes specific high-quality APIs before falling back to a Randomized Wikipedia Search

const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// Keys: Checking multiple formats to ensure we catch the environment variable
const RAWG_API_KEY = process.env.RAWG_API_KEY || (import.meta as any).env?.VITE_RAWG_API_KEY || ''; 
const TMDB_API_KEY = process.env.TMDB_API_KEY || (import.meta as any).env?.VITE_TMDB_API_KEY || ''; 

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
// Only effective if we are looking for the GAME TITLE itself.
const fetchRawgImage = async (query: string): Promise<string | null> => {
    if (!RAWG_API_KEY) {
        console.warn(`[ImageService] RAWG_API_KEY missing. Cannot fetch game image.`);
        return null;
    }
    try {
        console.log(`[ImageService] Fetching RAWG for: "${query}"...`);
        const res = await fetch(`https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${RAWG_API_KEY}&page_size=1`);
        
        if (!res.ok) {
            console.error(`[ImageService] RAWG Request Failed: ${res.status} ${res.statusText}`);
            return null;
        }

        const data = await res.json();
        if (data.results && data.results.length > 0) {
            console.log(`[ImageService] RAWG Match: ${data.results[0].name}`);
            return data.results[0].background_image;
        }
        console.warn(`[ImageService] RAWG found no results for: "${query}"`);
        return null;
    } catch (e) { 
        console.error(`[ImageService] RAWG Error:`, e);
        return null; 
    }
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

// --- MASTER ROUTER ---
export const getSmartImage = async (query: string, type?: string, topic?: string): Promise<string | null> => {
    const safeType = type || 'general';
    let imageUrl: string | null = null;
    
    const topicLC = topic?.toLowerCase() || '';
    const isGameContext = topicLC.includes('game') || topicLC.includes('gaming') || topicLC.includes('esports') || topicLC.includes('playstation') || topicLC.includes('xbox') || topicLC.includes('nintendo');

    // 1. Specific High-Quality APIs
    if (safeType === 'pokemon') imageUrl = await fetchPokemonImage(query);
    else if (safeType === 'anime') imageUrl = await fetchAnimeImage(query);
    else if (safeType === 'flag') imageUrl = await fetchFlagImage(query);
    else if (safeType === 'art') imageUrl = await fetchArtImage(query);
    
    // 2. Pop Culture (Games/Movies)
    // We now Force RAWG check if the TOPIC implies games, even if the question type is generic
    else if (safeType === 'game' || (safeType === 'general' && isGameContext)) {
        imageUrl = await fetchRawgImage(query);
        // Fallback to iTunes Software search if RAWG fails
        if (!imageUrl) imageUrl = await fetchItunesImage(query, 'game');
    }
    else if (safeType === 'movie') {
        imageUrl = await fetchTmdbImage(query);
        if (!imageUrl) imageUrl = await fetchItunesImage(query, 'movie');
    }

    if (imageUrl) return imageUrl;

    // 3. Fallback: iTunes Global Search
    if (safeType === 'general' || safeType === 'character') {
         const itunesFallback = await fetchItunesImage(query, 'all');
         if (itunesFallback) return itunesFallback;
    }

    // 4. Wiki Strategy
    
    // Strategy A: Subject + Topic
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
    
    return imageUrl;
};