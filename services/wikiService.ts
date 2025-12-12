const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

/**
 * Helper to extract the first valid thumbnail from a Wiki pages object.
 * Iterates through results to skip disambiguation pages or articles without images.
 */
const getFirstPageImage = (pagesObj: any): string | null => {
  if (!pagesObj) return null;
  const pages = Object.values(pagesObj);
  
  for (const page of pages as any[]) {
    if (page.thumbnail && page.thumbnail.source) {
      // console.log(`[WikiService] Found image for: ${page.title}`);
      return page.thumbnail.source;
    }
  }
  return null;
};

/**
 * Searches for a high-quality image URL for a given topic.
 * 
 * Strategy 1: Exact Page on EN Wiki (Best for Official Art/Logos)
 * Strategy 2: Search on EN Wiki (Finds the correct page if name is slightly off)
 * Strategy 3: Commons Page Search (Fallback for generic objects)
 * Strategy 4: Commons File Search (Deep search for specific filenames)
 */
export const getWikimediaImage = async (query: string): Promise<string | null> => {
  if (!query) return null;
  const cleanQuery = query.trim();

  try {
    // --- STRATEGY 1: Direct Wikipedia Page Lookup ---
    // Fast, precise. Best for "Iron Man (character)" or "Vaporeon"
    const pageParams = new URLSearchParams({
      action: 'query',
      titles: cleanQuery,
      prop: 'pageimages',
      format: 'json',
      pithumbsize: '500',
      redirects: '1',
      origin: '*'
    });

    const pageRes = await fetch(`${WIKI_API_URL}?${pageParams.toString()}`);
    const pageData = await pageRes.json();
    
    // Check direct page result
    if (pageData.query && pageData.query.pages) {
        const url = getFirstPageImage(pageData.query.pages);
        if (url) return url;
    }

    // --- STRATEGY 2: English Wikipedia Search ---
    // "Iron Man" -> finds "Iron Man (character)" (skips disambiguation via list iteration)
    const enSearchParams = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: cleanQuery,
      gsrlimit: '5', // Fetch 5 results to increase odds of finding one with an image
      prop: 'pageimages',
      format: 'json',
      pithumbsize: '500',
      origin: '*'
    });

    const enSearchRes = await fetch(`${WIKI_API_URL}?${enSearchParams.toString()}`);
    const enSearchData = await enSearchRes.json();

    if (enSearchData.query && enSearchData.query.pages) {
        const url = getFirstPageImage(enSearchData.query.pages);
        if (url) {
            // console.log(`[WikiService] Strategy 2 hit: ${cleanQuery}`);
            return url;
        }
    }

    // --- STRATEGY 3: Wikimedia Commons Page Search ---
    // Good for generic terms like "Toaster", "Laptop"
    const commonsParams = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: cleanQuery,
      gsrlimit: '5',
      prop: 'pageimages',
      format: 'json',
      pithumbsize: '500',
      origin: '*'
    });

    const commonsRes = await fetch(`${COMMONS_API_URL}?${commonsParams.toString()}`);
    const commonsData = await commonsRes.json();

    if (commonsData.query && commonsData.query.pages) {
        const url = getFirstPageImage(commonsData.query.pages);
        if (url) {
            // console.log(`[WikiService] Strategy 3 hit: ${cleanQuery}`);
            return url;
        }
    }

    // --- STRATEGY 4: Wikimedia Commons FILE Search ---
    // Direct search for files (Namespace 6). Very powerful for obscure things.
    // e.g. "Coca Cola Logo.png"
    const fileParams = new URLSearchParams({
      action: 'query',
      generator: 'search',
      gsrsearch: cleanQuery,
      gsrnamespace: '6', // File namespace
      gsrlimit: '5',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '500',
      format: 'json',
      origin: '*'
    });

    const fileRes = await fetch(`${COMMONS_API_URL}?${fileParams.toString()}`);
    const fileData = await fileRes.json();

    if (fileData.query && fileData.query.pages) {
        const pages = Object.values(fileData.query.pages);
        for (const page of pages as any[]) {
            if (page.imageinfo && page.imageinfo[0]) {
                // Use thumburl if available (resized), else url
                const info = page.imageinfo[0];
                const url = info.thumburl || info.url;
                if (url) {
                    // console.log(`[WikiService] Strategy 4 hit: ${cleanQuery}`);
                    return url;
                }
            }
        }
    }

    console.warn(`[WikiService] All strategies failed for: "${cleanQuery}"`);
    return null;

  } catch (error) {
    console.warn("[WikiService] Lookup failed for:", cleanQuery, error);
    return null;
  }
};