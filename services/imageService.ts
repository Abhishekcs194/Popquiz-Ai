// The Ultimate Image API Router
// Prioritizes specific high-quality APIs before falling back to a Randomized Wikipedia Search

const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// --- VALIDATION & FILTERING ---

// Terms that are ALWAYS garbage/spam for a trivia game
const SPAM_TERMS = [
  'stub', 'disambig', 'wiki_letter', 'chart', 'diagram',
  'store', 'shop', 'center', 'building', 'mall', 'plush', 'toy', 'merch', 'card', 'box',
  'cosplay', 'costume', 'suit', 'human', 'man', 'woman', 'person', 'convention', 'event', 'fan',
  'advert', 'pdf', 'svg', 'webm', 'ogv'
];

// Terms that are undesirable UNLESS the specific type requests them
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
  // If we are NOT looking for a logo, filter out logos.
  if (type !== 'logo' && CONTEXT_TERMS.logo.some(term => cleanUrl.includes(term))) {
      return false;
  }
  // If we are NOT looking for a flag, filter out flags/maps (unless it's geography/general)
  if (type !== 'flag' && type !== 'general' && type !== 'country' && CONTEXT_TERMS.flag.some(term => cleanUrl.includes(term))) {
      return false;
  }

  // 3. (REMOVED) Strict Token Matching
  // Previously we required the filename to contain the query words. 
  // This blocked "Godrick_the_Grafted.jpg" when searching "Elden Ring".
  // Now we trust the search engine relevance, filtering only known bad patterns.

  return true;
};

// --- 1. POKÉMON (PokéAPI) ---
const fetchPokemonImage = async (query: string): Promise<string | null> => {
    try {
        const cleanName = query.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${cleanName}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default || null;
    } catch (e) { return null; }
};

// --- 2. ANIME (Jikan/MyAnimeList) ---
const fetchAnimeImage = async (query: string): Promise<string | null> => {
    try {
        const res = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=1`);
        if (!res.ok) return null;
        const data = await res.json();
        return data.data?.[0]?.images?.jpg?.image_url || null;
    } catch (e) { return null; }
};

// --- 3. FLAGS (RestCountries) ---
const fetchFlagImage = async (query: string): Promise<string | null> => {
    try {
        let res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}?fullText=true`);
        if (!res.ok) res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}`);
        if(!res.ok) return null;
        const data = await res.json();
        return data[0]?.flags?.png || null;
    } catch (e) { return null; }
};

// --- 4. ART (Met Museum) ---
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

// --- 5. UNIVERSAL FALLBACK: RANDOMIZED WIKI SEARCH ---
async function fetchRandomWikiImage(query: string, type: string = 'general'): Promise<string | null> {
  const candidates: string[] = [];
  
  const collectCandidates = (pages: any[]) => {
      for (const page of Object.values(pages)) {
          const url = page.thumbnail?.source || page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
          if (url && isValidWikiImage(url, query, type)) {
              candidates.push(url);
          }
      }
  };

  // A. Wikipedia Page Images (High Relevance)
  try {
      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '5', 
        prop: 'pageimages', pithumbsize: '600', format: 'json', origin: '*' 
      });
      const res = await fetch(`${WIKI_API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.query?.pages) collectCandidates(data.query.pages);
  } catch(e) {}

  // B. Wikimedia Commons Search (High Variety)
  try {
      // NOTE: Removed "File:" prefix from gsrsearch to broaden results.
      // gsrnamespace=6 already restricts to files.
      // Exclude key spam terms in the query itself for efficiency.
      const spamFilter = '-cosplay -costume -pdf -webm -text';
      const searchQuery = `${query} ${spamFilter}`; 

      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: searchQuery, 
        gsrnamespace: '6', gsrlimit: '20', 
        prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600', format: 'json', origin: '*'
      });
      const res = await fetch(`${COMMONS_API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.query?.pages) collectCandidates(data.query.pages);
  } catch(e) {}

  // C. Random Selection
  if (candidates.length > 0) {
      const randomIndex = Math.floor(Math.random() * candidates.length);
      return candidates[randomIndex];
  }

  return null;
}

// --- MASTER ROUTER ---
export const getSmartImage = async (query: string, type?: string): Promise<string | null> => {
    const safeType = type || 'general';
    let imageUrl: string | null = null;
    
    // 1. Try Specific API
    if (safeType === 'pokemon') imageUrl = await fetchPokemonImage(query);
    else if (safeType === 'anime') imageUrl = await fetchAnimeImage(query);
    else if (safeType === 'flag') imageUrl = await fetchFlagImage(query);
    else if (safeType === 'art') imageUrl = await fetchArtImage(query);

    // 2. Fallback to Wiki
    if (!imageUrl) {
        imageUrl = await fetchRandomWikiImage(query, safeType);
    }
    
    return imageUrl;
};