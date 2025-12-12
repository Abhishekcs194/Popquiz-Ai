// The Ultimate Image API Router
// Prioritizes specific high-quality APIs before falling back to a Randomized Wikipedia Search

const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// --- VALIDATION & FILTERING ---
const BANNED_TERMS = [
  'logo', 'icon', 'stub', 'flag', 'map', 'disambig', 'wiki_letter', 'chart', 'diagram',
  'store', 'shop', 'center', 'building', 'mall', 'plush', 'toy', 'merch', 'card', 'box',
  'cosplay', 'costume', 'suit', 'human', 'man', 'woman', 'person', 'convention', 'event', 'fan',
  'bus', 'train', 'car', 'vehicle', 'jet', 'plane', 'advert', 'pdf', 'svg'
];

const isValidWikiImage = (url: string, query: string): boolean => {
  if (!url) return false;
  const cleanUrl = decodeURIComponent(url).toLowerCase();
  
  // 1. Filter out known bad file types/names
  if (BANNED_TERMS.some(term => cleanUrl.includes(term))) return false;
  
  // 2. Strict matching for generic queries to avoid random noise
  // If the query is "Lion", we want the filename to contain "lion"
  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const queryTokens = cleanQuery.split(' ').filter(t => t.length > 3); 
  
  if (queryTokens.length === 0) return true;
  return queryTokens.some(token => cleanUrl.includes(token));
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
        // Try exact match first
        let res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}?fullText=true`);
        if (!res.ok) {
             res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}`);
        }
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

// --- 5. LOGOS (Wiki Fallback favored usually, but we can try simple search) ---
// Using Wikipedia is actually best for logos as "Apple" -> "Apple Inc" disambiguation happens naturally.

// --- 6. UNIVERSAL FALLBACK: RANDOMIZED WIKI SEARCH ---
async function fetchRandomWikiImage(query: string): Promise<string | null> {
  const candidates: string[] = [];
  
  const collectCandidates = (pages: any[]) => {
      for (const page of Object.values(pages)) {
          // Check Thumbnail or ImageInfo
          const url = page.thumbnail?.source || page.imageinfo?.[0]?.thumburl || page.imageinfo?.[0]?.url;
          if (url && isValidWikiImage(url, query)) {
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
      // Query specifically for files, exclude common trash terms in the search query itself
      const searchQuery = `File:${query} -cosplay -costume -bus -train -text -pdf`;
      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: searchQuery, 
        gsrnamespace: '6', gsrlimit: '20', // Fetch more to pick random
        prop: 'imageinfo', iiprop: 'url', iiurlwidth: '600', format: 'json', origin: '*'
      });
      const res = await fetch(`${COMMONS_API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.query?.pages) collectCandidates(data.query.pages);
  } catch(e) {}

  // C. Random Selection
  if (candidates.length > 0) {
      // Pick a random image from the valid candidates
      const randomIndex = Math.floor(Math.random() * candidates.length);
      return candidates[randomIndex];
  }

  return null;
}

// --- MASTER ROUTER ---
export const getSmartImage = async (query: string, type?: string): Promise<string | null> => {
    let imageUrl: string | null = null;
    
    // 1. Try Specific API based on type
    if (type === 'pokemon') imageUrl = await fetchPokemonImage(query);
    else if (type === 'anime') imageUrl = await fetchAnimeImage(query);
    else if (type === 'flag') imageUrl = await fetchFlagImage(query);
    else if (type === 'art') imageUrl = await fetchArtImage(query);

    // 2. If specific API failed (or type was general), try Randomized Wiki Search
    if (!imageUrl) {
        imageUrl = await fetchRandomWikiImage(query);
    }
    
    return imageUrl;
};