const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// URLs/Filenames that are too generic and should trigger a fallback
const BLOCKLIST = [
  'International_Pok%C3%A9mon_logo',
  'International_Pokémon_logo',
  'Commons-logo',
  'Wiki_letter_w',
  'Disambig_gray',
  'Icon',
  'Stub',
  'Flag',
  'Map',
  'Store',
  'Shop',
  'Center',
  'Building',
  'Mall'
];

/**
 * Validates if an image is relevant to the query.
 * 1. Checks blocklist.
 * 2. Checks if at least one meaningful word from the query appears in the filename.
 */
const isValidImage = (url: string, query: string): boolean => {
  if (!url) return false;
  
  const cleanUrl = decodeURIComponent(url).toLowerCase();
  
  // 1. Check Blocklist
  if (BLOCKLIST.some(term => cleanUrl.includes(term.toLowerCase()))) {
    return false;
  }

  // 2. Keyword Matching (Strict Mode)
  // We want to ensure the image actually represents the search term.
  // Query: "Lapras" -> Tokens: ["lapras"]
  // URL: ".../Pokemon_Center_Tokyo.jpg" -> Fail
  // URL: ".../Lapras_drawing.jpg" -> Pass
  
  const cleanQuery = query.toLowerCase().replace(/[^a-z0-9\s]/g, '');
  const queryTokens = cleanQuery.split(' ').filter(t => t.length > 3); // Ignore "the", "and", etc.

  // If query is very short (e.g. "Cat"), just trust the search result unless blocked
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
    gsrsearch: query,
    gsrnamespace: '6', // 6 = File namespace
    gsrlimit: '5',
    prop: 'imageinfo',
    iiprop: 'url',
    iiurlwidth: '500', // Request thumbnail
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
            // Strict check on Commons files too
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