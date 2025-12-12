// The Ultimate Image API Router
// Prioritizes specific high-quality APIs before falling back to a Randomized Wikipedia Search

const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// Keys (optional, for better Game/Movie results)
const RAWG_API_KEY = process.env.RAWG_API_KEY || ''; // For Games
const TMDB_API_KEY = process.env.TMDB_API_KEY || ''; // For Movies

// --- VALIDATION & FILTERING ---

const SPAM_TERMS = [
  'stub', 'disambig', 'wiki_letter', 'chart', 'diagram',
  'store', 'shop', 'center', 'building', 'mall', 'plush', 'toy', 'merch', 'card', 'box',
  'cosplay', 'costume', 'suit', 'human', 'man', 'woman', 'person', 'convention', 'event', 'fan',
  'advert', 'pdf', 'svg', 'webm', 'ogv',
  // New visual noise filters
  'graffiti', 'mural', 'street_art', 'sculpture', 'statue', 'lego', 'cake', 'food',
  'booth', 'stand', 'expo', 'stage', 'screen', 'display', 'monitor'
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
    if (!RAWG_API_KEY) return null;
    try {
        const res = await fetch(`https://api.rawg.io/api/games?search=${encodeURIComponent(query)}&key=${RAWG_API_KEY}&page_size=1`);
        const data = await res.json();
        if (data.results && data.results.length > 0) {
            return data.results[0].background_image;
        }
        return null;
    } catch (e) { return null; }
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
const fetchItunesImage = async (query: string, type: 'movie' | 'game'): Promise<string | null> => {
    try {
        const entity = type === 'movie' ? 'movie' : 'software';
        // software searches the App Store. Good for "Minecraft", "Among Us", "PUBG", etc.
        const res = await fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(query)}&media=${entity}&limit=1`);
        if (!res.ok) return null;
        const data = await res.json();
        
        if (data.results && data.results.length > 0) {
            // Get the 100x100 url and upgrade it to 600x600 for high res
            const smallUrl = data.results[0].artworkUrl100;
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

  // A. Page Images (Best for "Official" things like Game Covers that are Fair Use on Wiki)
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

  // B. Commons Files (Backup)
  // WARNING: Commons DOES NOT host copyrighted game covers or movie posters. 
  // It only hosts fan photos, cosplay, and graffiti.
  // We SKIP this for games/movies to avoid bad images.
  if (type === 'game' || type === 'movie') {
      return null;
  }

  try {
      const spamFilter = '-cosplay -costume -pdf -webm -text -graffiti -sculpture';
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
    
    // 1. Specific High-Quality APIs
    if (safeType === 'pokemon') imageUrl = await fetchPokemonImage(query);
    else if (safeType === 'anime') imageUrl = await fetchAnimeImage(query);
    else if (safeType === 'flag') imageUrl = await fetchFlagImage(query);
    else if (safeType === 'art') imageUrl = await fetchArtImage(query);
    
    // Game/Movie Strategy:
    // 1. Private Key APIs (Best)
    // 2. iTunes API (Great for Posters/Icons, No Key)
    // 3. Wiki Page Images (Good for Covers)
    // 4. SKIP Commons (Avoids Graffiti/Cosplay)
    else if (safeType === 'game') {
        imageUrl = await fetchRawgImage(query);
        if (!imageUrl) imageUrl = await fetchItunesImage(query, 'game');
    }
    else if (safeType === 'movie') {
        imageUrl = await fetchTmdbImage(query);
        if (!imageUrl) imageUrl = await fetchItunesImage(query, 'movie');
    }

    if (imageUrl) return imageUrl;

    // 2. Iterative Wiki Fallback Strategy
    
    // Strategy A: Subject + Topic
    if (topic && !query.toLowerCase().includes(topic.toLowerCase())) {
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