const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// If the URL/Filename contains ANY of these, it is TRASH and we reject it.
// This filters out Cosplay, Real world ads, Vehicles, Random people, etc.
const BANNED_TERMS = [
  // Generic Wiki trash
  'logo', 'icon', 'stub', 'flag', 'map', 'chart', 'diagram',
  'disambig', 'wiki_letter',
  
  // Real world / Merchandise (The "Pokemon Center" problem)
  'store', 'shop', 'center', 'building', 'mall', 'plush', 'toy', 'merch', 
  'card', 'tcg', 'box', 'packaging',
  
  // Cosplay & People (The "Random Guy" problem)
  'cosplay', 'costume', 'suit', 'human', 'man', 'woman', 'person', 'people', 
  'convention', 'event', 'expo', 'comic-con', 'comic_con', 'fan',
  
  // Vehicles (The "Bus" problem)
  'bus', 'train', 'car', 'vehicle', 'jet', 'plane', 'livery', 'advert',
  
  // Art styles that don't fit
  'graffiti', 'street_art', 'tattoo', 'cake', 'food'
];

/**
 * Validates if an image is relevant to the query and NOT trash.
 */
const isValidImage = (url: string, query: string): boolean => {
  if (!url) return false;
  
  const cleanUrl = decodeURIComponent(url).toLowerCase();
  
  // 1. AGGRESSIVE BAN CHECK
  if (BANNED_TERMS.some(term => cleanUrl.includes(term))) {
    return false;
  }

  // 2. Keyword Matching (Strict Mode)
  // The filename must actually contain the subject.
  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const queryTokens = cleanQuery.split(' ').filter(t => t.length > 3); 

  if (queryTokens.length === 0) return true;

  // Check if ANY significant token matches the filename
  const hasMatch = queryTokens.some(token => cleanUrl.includes(token));
  
  return hasMatch;
};

/**
 * Helper to search English Wikipedia Pages
 */
async function searchWikiPages(query: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '5', 
    prop: 'pageimages',
    pithumbsize: '500', 
    format: 'json',
    origin: '*' 
  });

  try {
    const res = await fetch(`${WIKI_API_URL}?${params.toString()}`);
    const data = await res.json();

    if (!data.query || !data.query.pages) return null;
    const pages = Object.values(data.query.pages) as any[];

    for (const page of pages) {
      if (page.thumbnail && page.thumbnail.source) {
        if (isValidImage(page.thumbnail.source, query)) {
            return page.thumbnail.source;
        }
      }
    }
  } catch (error) {
    console.warn(`[WikiService] Page search failed: ${query}`);
  }
  return null;
}

/**
 * Helper to search Commons FILES (Namespace 6)
 */
async function searchCommonsFiles(query: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `File:${query} -cosplay -bus -train -costume`, // Try to exclude in search query too
    gsrnamespace: '6', // 6 = File namespace
    gsrlimit: '8', // Fetch more to filter through
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '500', 
    format: 'json',
    origin: '*'
  });

  try {
    const res = await fetch(`${COMMONS_API_URL}?${params.toString()}`);
    const data = await res.json();

    if (!data.query || !data.query.pages) return null;
    const pages = Object.values(data.query.pages) as any[];

    for (const page of pages) {
        if (page.imageinfo && page.imageinfo[0]) {
            const info = page.imageinfo[0];
            const url = info.thumburl || info.url;
            if (url && isValidImage(url, query)) {
                return url;
            }
        }
    }
  } catch (error) {
    console.warn(`[WikiService] File search failed: ${query}`);
  }
  return null;
}

/**
 * Main function to get an image.
 */
export const getWikimediaImage = async (query: string): Promise<string | null> => {
  if (!query) return null;
  const cleanQuery = query.trim();

  // 1. Wikipedia Page
  const wikiImage = await searchWikiPages(cleanQuery);
  if (wikiImage) return wikiImage;

  // 2. Commons Files
  const commonsFile = await searchCommonsFiles(cleanQuery);
  if (commonsFile) return commonsFile;

  return null;
};