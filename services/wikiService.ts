const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

/**
 * Reusable helper to search a Wiki API and return the first valid thumbnail.
 */
async function searchWiki(apiUrl: string, query: string): Promise<string | null> {
  // Use generator=search to find the most relevant pages
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '3', // Check top 3 results to find one with an image
    prop: 'pageimages',
    pithumbsize: '500', // Standard clear resolution
    format: 'json',
    origin: '*' // Required for CORS
  });

  try {
    const res = await fetch(`${apiUrl}?${params.toString()}`);
    const data = await res.json();

    if (!data.query || !data.query.pages) return null;

    // The API returns pages as an object with random IDs. Convert to array.
    const pages = Object.values(data.query.pages) as any[];

    // Return the first available image source
    for (const page of pages) {
      if (page.thumbnail && page.thumbnail.source) {
        return page.thumbnail.source;
      }
    }
  } catch (error) {
    console.warn(`[WikiService] Search failed for '${query}' at ${apiUrl}`);
  }

  return null;
}

/**
 * Main function to get an image.
 * Strategy:
 * 1. English Wikipedia (Best for Pop Culture, Brands, Specific People)
 * 2. Wikimedia Commons (Best for General Objects, Nature, Locations)
 */
export const getWikimediaImage = async (query: string): Promise<string | null> => {
  if (!query) return null;
  const cleanQuery = query.trim();

  // Step 1: Try English Wikipedia
  const wikiImage = await searchWiki(WIKI_API_URL, cleanQuery);
  if (wikiImage) return wikiImage;

  // Step 2: Try Wikimedia Commons
  const commonsImage = await searchWiki(COMMONS_API_URL, cleanQuery);
  if (commonsImage) return commonsImage;

  // Step 3: Return null to trigger AI fallback in the caller
  return null;
};