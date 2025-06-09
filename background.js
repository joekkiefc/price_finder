// Background service worker for Chrome extension
console.log('Background service worker loaded');

// Supabase configuration
// Note: Anon keys are safe to include in public code - they only allow read access protected by RLS
const SUPABASE_URL = 'https://buapbvrzrzkholjkzizo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YXBidnJ6cnpraG9samt6aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzMzAxMDAsImV4cCI6MjA2NDkwNjEwMH0.ERMqrikRCz6uHTOA8eUPre_hg3Ymp2rbRHeeKrMkzb0';

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    if (request.action === 'querySupabase') {
        querySupabase(request.cards)
            .then(results => {
                console.log('Background sending results:', results);
                sendResponse({ success: true, data: results });
            })
            .catch(error => {
                console.error('Background error:', error);
                sendResponse({ success: false, error: error.message });
            });
        
        // Return true to keep the message channel open for async response
        return true;
    }
});

// Query Supabase for card data
async function querySupabase(cards) {
    console.log('Querying Supabase for', cards.length, 'cards');
    const results = [];
    
    for (const card of cards) {
        console.log('Querying card:', card.original);
        
        try {
            let queryUrl = SUPABASE_URL + '/rest/v1/card_prices_view?select=set_number,name,card_number,card_id_simple,min_price,avg_price,max_price,scraped_at';
            let filters = [];
            let queryAttempts = [];
            
            // Build multiple query strategies (try most specific first)
            if (card.set_number && card.card_number) {
                // Strategy 1: Set + card number (most reliable)
                queryAttempts.push({
                    name: 'set+card_number',
                    filters: [
                        'set_number=eq.' + encodeURIComponent(card.set_number),
                        'card_number=eq.' + encodeURIComponent(card.card_number)
                    ]
                });
            }
            
            if (card.set_number && card.name) {
                // Strategy 2: Set + flexible name matching
                const cleanName = card.name
                    .replace(/^\[.*?\]\s*/, '') // Remove [Condition A-] prefixes
                    .replace(/\s*(sar|sr|ar|ex|gx|vmax|v)\s*$/i, '') // Remove suffix card types
                    .replace(/\s+/g, ' ')
                    .trim();
                
                if (cleanName.length > 2) {
                    queryAttempts.push({
                        name: 'set+name_flexible',
                        filters: [
                            'set_number=eq.' + encodeURIComponent(card.set_number),
                            'name=ilike.%' + encodeURIComponent(cleanName) + '%'
                        ]
                    });
                }
            }
            
            if (card.set_number && !card.name && !card.card_number) {
                // Strategy 3: Only set number - get ALL cards from this set
                queryAttempts.push({
                    name: 'set_only',
                    filters: ['set_number=eq.' + encodeURIComponent(card.set_number)]
                });
                console.log('Fetching ALL cards from set:', card.set_number);
            }
            
            if (card.name && !card.set_number) {
                // Strategy 4: Only name available
                const cleanName = card.name
                    .replace(/^\[.*?\]\s*/, '')
                    .replace(/\s*(sar|sr|ar|ex|gx|vmax|v)\s*$/i, '')
                    .replace(/\s+/g, ' ')
                    .trim();
                    
                queryAttempts.push({
                    name: 'name_only',
                    filters: ['name=ilike.%' + encodeURIComponent(cleanName) + '%']
                });
            }
            
            // Try each query strategy until we find results
            let data = [];
            let successfulStrategy = null;
            
            for (const attempt of queryAttempts) {
                const finalUrl = queryUrl + '&' + attempt.filters.join('&');
                console.log(`Trying strategy "${attempt.name}":`, finalUrl);
                
                const response = await fetch(finalUrl, {
                    headers: {
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                        'Content-Type': 'application/json'
                    }
                });
                
                if (!response.ok) {
                    throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                }
                
                data = await response.json();
                console.log(`Strategy "${attempt.name}" found ${data.length} results`);
                
                if (data.length > 0) {
                    successfulStrategy = attempt.name;
                    break; // Found results, stop trying
                }
            }
            
            console.log('Final result:', data.length, 'cards found using strategy:', successfulStrategy);
            results.push({ ...card, supabase_data: data });
            
        } catch (error) {
            console.error('Error querying', card.original, ':', error);
            results.push({ ...card, error: error.message });
        }
    }
    
    return results;
} 