export interface SerpContextResult {
  snippets: string[];
  rawUrls: string[];
  success: boolean;
}

export const fetchSerpContext = async (
  query: string
): Promise<SerpContextResult> => {
  const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
  const cx = process.env.GOOGLE_SEARCH_CX;

  if (!apiKey || !cx) {
    console.warn("[SERP] GOOGLE_SEARCH_API_KEY or GOOGLE_SEARCH_CX is missing. Search context will be empty.");
    return { snippets: [], rawUrls: [], success: false };
  }

  try {
    const url = new URL('https://www.googleapis.com/customsearch/v1');
    url.searchParams.append('key', apiKey);
    url.searchParams.append('cx', cx);
    url.searchParams.append('q', query);
    url.searchParams.append('num', '3'); // Top 3 results are usually enough

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`[SERP] Rate limit exceeded (429) for query: "${query}"`);
      } else {
        console.warn(`[SERP] API error ${response.status} for query: "${query}"`);
      }
      return { snippets: [], rawUrls: [], success: false };
    }

    const data = await response.json();
    const items = data.items || [];

    const snippets: string[] = [];
    const rawUrls: string[] = [];

    for (const item of items) {
      if (item.snippet) snippets.push(item.snippet);
      if (item.link) rawUrls.push(item.link);
    }

    return {
      snippets,
      rawUrls,
      success: true
    };
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`[SERP] Timeout exceeded (5000ms) for query: "${query}"`);
    } else {
      console.error(`[SERP] Unexpected error fetching context for query: "${query}"`, error);
    }
    return { snippets: [], rawUrls: [], success: false };
  }
};
