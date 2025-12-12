// The Ultimate Image API Router
// Prioritizes specific high-quality APIs before falling back to Wikipedia/AI

// --- 1. POKÉMON (PokéAPI) ---
// Guarantees official artwork, no cosplay.
const fetchPokemonImage = async (query: string): Promise<string | null> => {
    try {
        // Clean query: "Pikachu" -> "pikachu"
        const cleanName = query.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
        const res = await fetch(`https://pokeapi.co/api/v2/pokemon/${cleanName}`);
        if (!res.ok) return null;
        const data = await res.json();
        // Prefer official artwork
        return data.sprites?.other?.['official-artwork']?.front_default || data.sprites?.front_default || null;
    } catch (e) {
        return null;
    }
};

// --- 2. ANIME (Jikan/MyAnimeList) ---
// Gets official character profiles.
const fetchAnimeImage = async (query: string): Promise<string | null> => {
    try {
        // Jikan has strict rate limits (3 req/sec), so we might need to handle this carefully.
        // For now, we rely on the fact that calls are spread out or handled by Promise.all with inherent network delays.
        const res = await fetch(`https://api.jikan.moe/v4/characters?q=${encodeURIComponent(query)}&limit=1`);
        if (!res.ok) return null;
        const data = await res.json();
        if (data.data && data.data.length > 0) {
            return data.data[0].images?.jpg?.image_url || null;
        }
        return null;
    } catch (e) {
        return null;
    }
};

// --- 3. FLAGS (RestCountries) ---
// High quality SVGs/PNGs for countries.
const fetchFlagImage = async (query: string): Promise<string | null> => {
    try {
        const res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}?fullText=true`);
        if (!res.ok) {
            // Try fuzzy search if full text fails
             const fuzzyRes = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}`);
             if(!fuzzyRes.ok) return null;
             const fuzzyData = await fuzzyRes.json();
             return fuzzyData[0]?.flags?.png || null;
        }
        const data = await res.json();
        return data[0]?.flags?.png || null;
    } catch (e) {
        return null;
    }
};

// --- 4. LOGOS ---
// Tries WorldVectorLogo then standard clearbit
const fetchLogoImage = async (query: string): Promise<string | null> => {
    // Strategy 1: WorldVectorLogo (Guessing slug)
    // slugify: "Coca Cola" -> "coca-cola"
    const slug = query.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    const wvlUrl = `https://cdn.worldvectorlogo.com/logos/${slug}.svg`;
    
    // We can't easily check 404 on cors images without fetching, so we might just try Wiki first for logos
    // OR we just assume Wiki is better for logos unless we have a specific dataset.
    // Actually, Wikipedia is excellent for logos. Let's fallback to Wiki for logos unless we want to try the SVG.
    // Let's rely on Wiki for Logos for now as it handles "Apple" (fruit vs company) via context better,
    // UNLESS the AI gives us a very specific brand name.
    
    return null; // Fallthrough to Wiki
};

// --- 5. ART (Met Museum) ---
const fetchArtImage = async (query: string): Promise<string | null> => {
    try {
        const searchRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(query)}&hasImages=true`);
        if (!searchRes.ok) return null;
        const searchData = await searchRes.json();
        
        if (searchData.objectIDs && searchData.objectIDs.length > 0) {
            // Get first object
            const objId = searchData.objectIDs[0];
            const objRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${objId}`);
            const objData = await objRes.json();
            return objData.primaryImage || objData.primaryImageSmall || null;
        }
        return null;
    } catch (e) {
        return null;
    }
};

// --- 6. WIKI / COMMONS (The Robust Fallback) ---
const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

const BANNED_TERMS = [
  'logo', 'icon', 'stub', 'flag', 'map', 'disambig', 'wiki_letter',
  'store', 'shop', 'center', 'building', 'mall', 'plush', 'toy', 'merch', 'card', 'box',
  'cosplay', 'costume', 'suit', 'human', 'man', 'woman', 'person', 'convention', 'event', 'fan',
  'bus', 'train', 'car', 'vehicle', 'jet', 'plane', 'advert'
];

const isValidWikiImage = (url: string, query: string): boolean => {
  if (!url) return false;
  const cleanUrl = decodeURIComponent(url).toLowerCase();
  
  if (BANNED_TERMS.some(term => cleanUrl.includes(term))) return false;

  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const queryTokens = cleanQuery.split(' ').filter(t => t.length > 3); 
  if (queryTokens.length === 0) return true;
  return queryTokens.some(token => cleanUrl.includes(token));
};

async function fetchWikiImage(query: string): Promise<string | null> {
  // 1. Try PageImages (Best for general topics)
  try {
      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: query, gsrlimit: '3', 
        prop: 'pageimages', pithumbsize: '500', format: 'json', origin: '*' 
      });
      const res = await fetch(`${WIKI_API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.query?.pages) {
          for (const page of Object.values(data.query.pages) as any[]) {
              if (page.thumbnail?.source && isValidWikiImage(page.thumbnail.source, query)) {
                  return page.thumbnail.source;
              }
          }
      }
  } catch(e) {}

  // 2. Try Commons File Search (Best for specific files)
  try {
      const params = new URLSearchParams({
        action: 'query', generator: 'search', gsrsearch: `File:${query} -cosplay -bus`, 
        gsrnamespace: '6', gsrlimit: '5', prop: 'imageinfo', iiprop: 'url', iiurlwidth: '500', format: 'json', origin: '*'
      });
      const res = await fetch(`${COMMONS_API_URL}?${params.toString()}`);
      const data = await res.json();
      if (data.query?.pages) {
          for (const page of Object.values(data.query.pages) as any[]) {
              if (page.imageinfo?.[0]?.thumburl && isValidWikiImage(page.imageinfo[0].thumburl, query)) {
                  return page.imageinfo[0].thumburl;
              }
          }
      }
  } catch(e) {}

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
    else if (type === 'logo') imageUrl = await fetchLogoImage(query);

    // 2. If specific API failed (or type was general), try Wiki
    if (!imageUrl) {
        imageUrl = await fetchWikiImage(query);
    }
    
    return imageUrl;
};