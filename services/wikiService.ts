const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

/**
 * Searches for a high-quality image URL for a given topic.
 * 
 * Strategy 1: Exact Page on EN Wiki (Best for Official Art/Logos)
 * Strategy 2: Search on EN Wiki (Finds the correct page if name is slightly off)
 * Strategy 3: Commons Search (Fallback for generic objects)
 */
export const getWikimediaImage = async (query: string): Promise<string | null> => {
  try {
    // --- STRATEGY 1: Direct Wikipedia Page Lookup ---
    const pageParams = new URLSearchParams({
      action: 'query',
      titles: query,
      prop: 'pageimages',
      format: 'json',
      pithumbsize: '500',
      redirects: '1', // Follow redirects (e.g. "USA" -> "United States")
      origin: '*'
    });

    const pageRes = await fetch(`${WIKI_API_URL}?${pageParams.toString()}`);
    const pageData = await pageRes.json();
    
    if (pageData.query && pageData.query.pages) {
        const pages = pageData.query.pages;
        const pageId = Object.keys(pages)[0];
        // -1 means page not found
        if (pageId !== "-1" && pages[pageId].thumbnail) {
             return pages[pageId].thumbnail.source;
        }
    }

    // --- STRATEGY 2: English Wikipedia Search (The "Official Image" Fix) ---
    // Instead of going to Commons (which has cosplay/fan art), we SEARCH English Wiki.
    // This finds "Iron Man (character)" when given "Iron Man", keeping the official art.
    const searchParams = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '1',
      prop: 'pageimages',
      format: 'json',
      pithumbsize: '500',
      origin: '*'
    });

    const searchRes = await fetch(`${WIKI_API_URL}?${searchParams.toString()}`);
    const searchData = await searchRes.json();

    if (searchData.query && searchData.query.pages) {
        const pages = searchData.query.pages;
        const pageId = Object.keys(pages)[0];
        
        if (pages[pageId].thumbnail) {
            console.log(`[WikiService] Hit EnWiki Search for: ${query} -> ${pages[pageId].title}`);
            return pages[pageId].thumbnail.source;
        }
    }

    // --- STRATEGY 3: Wikimedia Commons (Last Resort) ---
    // Only use this for generic things (e.g. "Toaster", "Mountain") where official art doesn't matter.
    const commonsParams = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: query,
      gsrlimit: '1',
      prop: 'pageimages',
      format: 'json',
      pithumbsize: '500',
      origin: '*'
    });

    const commonsRes = await fetch(`${COMMONS_API_URL}?${commonsParams.toString()}`);
    const commonsData = await commonsRes.json();

    if (commonsData.query && commonsData.query.pages) {
        const pages = commonsData.query.pages;
        const pageId = Object.keys(pages)[0];
        
        if (pages[pageId].thumbnail) {
            return pages[pageId].thumbnail.source;
        }
    }

    return null;

  } catch (error) {
    console.warn("[WikiService] Lookup failed for:", query, error);
    return null;
  }
};