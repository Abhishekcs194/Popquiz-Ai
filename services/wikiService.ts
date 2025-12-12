const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

/**
 * Searches for a high-quality image URL for a given topic.
 * 
 * Strategy 1: "Page Images" (Best)
 * Queries the specific Wikipedia page for the topic and gets its main thumbnail.
 * Perfect for: "Vaporeon", "Lionel Messi", "Ferrari".
 * 
 * Strategy 2: "Commons Search" (Fallback)
 * If no page/thumbnail exists, searches Wikimedia Commons for the term.
 * Perfect for: Obscure topics or generic terms.
 */
export const getWikimediaImage = async (query: string): Promise<string | null> => {
  try {
    // --- STRATEGY 1: Direct Wikipedia Page Lookup ---
    // This finds the "main" image of the article (Infobox image), which is usually the best one.
    const pageParams = new URLSearchParams({
      action: 'query',
      titles: query, // e.g. "Vaporeon"
      prop: 'pageimages',
      format: 'json',
      pithumbsize: '500', // 500px width is a good balance of quality/speed
      origin: '*' // CRITICAL: Allows CORS
    });

    const pageRes = await fetch(`${WIKI_API_URL}?${pageParams.toString()}`);
    const pageData = await pageRes.json();

    if (pageData.query && pageData.query.pages) {
        const pages = pageData.query.pages;
        // The API returns an object with pageId as keys. "-1" means page not found.
        const pageId = Object.keys(pages)[0];
        
        if (pageId !== "-1" && pages[pageId].thumbnail) {
            // console.log(`[WikiService] Hit PageImage for: ${query}`);
            return pages[pageId].thumbnail.source;
        }
    }

    // --- STRATEGY 2: Wikimedia Commons Search (Fallback) ---
    // If the main page doesn't exist or has no image, search Commons.
    // We use generator=search to find pages matching the query on Commons.
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
            console.log(`[WikiService] Hit Commons fallback for: ${query}`);
            return pages[pageId].thumbnail.source;
        }
    }

    // If both fail, return null (caller will handle AI generation)
    return null;

  } catch (error) {
    console.warn("[WikiService] Lookup failed for:", query, error);
    return null;
  }
};