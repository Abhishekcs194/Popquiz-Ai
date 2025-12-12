const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';
const COMMONS_API_URL = 'https://commons.wikimedia.org/w/api.php';

// URLs that are too generic and should trigger a fallback (to AI or next search)
const BLOCKLISTED_IMAGES = [
  'International_Pok%C3%A9mon_logo',
  'International_Pokémon_logo',
  'Commons-logo',
  'Wiki_letter_w',
  'Disambig_gray'
];

/**
 * Checks if a URL is in the blocklist
 */
const isBlocked = (url: string) => {
  return BLOCKLISTED_IMAGES.some(term => url.includes(term));
};

/**
 * Helper to search English Wikipedia Pages
 */
async function searchWikiPages(query: string): Promise<string | null> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: query,
    gsrlimit: '3', 
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
        if (!isBlocked(page.thumbnail.source)) {
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
 * This finds "File:Pikachu.jpg" directly, avoiding generic page logos.
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
            if (url && !isBlocked(url)) {
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
 * Strategy:
 * 1. English Wikipedia Page (Best for Official Context)
 * 2. Commons FILES (Best for specific objects/characters without official pages)
 * 3. Commons Page (Fallback)
 */
export const getWikimediaImage = async (query: string): Promise<string | null> => {
  if (!query) return null;
  const cleanQuery = query.trim();

  // 1. Wikipedia Page
  const wikiImage = await searchWikiPages(cleanQuery);
  if (wikiImage) return wikiImage;

  // 2. Commons Files (NEW & IMPORTANT for "Pokemon" etc)
  // Searching for "File:Pikachu" is better than searching Page "Pikachu" on Commons
  const commonsFile = await searchCommonsFiles(cleanQuery);
  if (commonsFile) return commonsFile;

  return null;
};