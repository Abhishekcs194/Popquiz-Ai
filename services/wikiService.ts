const WIKI_API_URL = 'https://en.wikipedia.org/w/api.php';

/**
 * Searches Wikimedia Commons/Wikipedia for an image matching the query.
 * Returns a thumbnail URL (width ~500px) to ensure fast loading.
 */
export const getWikimediaImage = async (query: string): Promise<string | null> => {
  try {
    // We add specific keywords to try and get better matches
    // namespace 6 = File: namespace
    const searchQuery = `${query} filetype:bitmap`; 

    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      generator: 'search',
      gsrnamespace: '6', // File namespace
      gsrsearch: searchQuery,
      gsrlimit: '1', // We only need the top result
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: '500', // Request a thumbnail (FAST loading)
      origin: '*' // Required for CORS
    });

    const res = await fetch(`${WIKI_API_URL}?${params.toString()}`);
    const data = await res.json();

    if (!data.query || !data.query.pages) {
        return null;
    }

    const pages = Object.values(data.query.pages);
    if (pages.length === 0) return null;

    const page: any = pages[0];
    if (page.imageinfo && page.imageinfo.length > 0) {
        // Return the thumbnail URL (thumburl) if available, otherwise the full url
        return page.imageinfo[0].thumburl || page.imageinfo[0].url;
    }
    
    return null;

  } catch (error) {
    console.warn("[WikiService] Lookup failed for:", query, error);
    return null;
  }
};