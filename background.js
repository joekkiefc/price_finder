// Background service worker for Chrome extension
console.log('Background service worker loaded');

// Supabase configuration
// Note: Anon keys are safe to include in public code - they only allow read access protected by RLS
const SUPABASE_URL = 'https://buapbvrzrzkholjkzizo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YXBidnJ6cnpraG9samt6aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzMzAxMDAsImV4cCI6MjA2NDkwNjEwMH0.ERMqrikRCz6uHTOA8eUPre_hg3Ymp2rbRHeeKrMkzb0';

// Handle messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Background received message:', request);
    
    // Add safety check
    if (!request || !request.action) {
        console.error('Invalid request received:', request);
        sendResponse({ success: false, error: 'Invalid request format' });
        return false;
    }
    
    try {
        if (request.action === 'querySupabase') {
            // Legacy support for hover functionality
            querySupabase(request.cards)
                .then(results => {
                    console.log('Background sending results:', results);
                    sendResponse({ success: true, data: results });
                })
                .catch(error => {
                    console.error('Background error:', error);
                    sendResponse({ success: false, error: error.message || 'Unknown error' });
                });
            
            return true; // Keep message channel open for async response
        }
        
        if (request.action === 'searchCards') {
            // New search functionality
            searchCards(request.query)
                .then(results => {
                    console.log('Background sending search results:', results.length, 'cards');
                    sendResponse({ success: true, data: results });
                })
                .catch(error => {
                    console.error('Background search error:', error);
                    sendResponse({ success: false, error: error.message || 'Search error' });
                });
            
            return true; // Keep message channel open for async response
        }
        
        if (request.action === 'searchMultipleCards') {
            console.log('Processing searchMultipleCards with', request.queries?.length || 0, 'queries');
            console.log('Include product categories:', request.includeProductCategories);
            
            // Validate queries
            if (!request.queries || !Array.isArray(request.queries)) {
                console.error('Invalid queries format:', request.queries);
                sendResponse({ success: false, error: 'Invalid queries format' });
                return false;
            }
            
            // New multiple search functionality for table interface
            searchMultipleCards(request.queries, request.includeProductCategories)
                .then(results => {
                    console.log('Background sending multiple search results:', results.length, 'queries processed');
                    sendResponse({ success: true, data: results });
                })
                .catch(error => {
                    console.error('Background multiple search error:', error);
                    sendResponse({ success: false, error: error.message || 'Multiple search error' });
                });
            
            return true; // Keep message channel open for async response
        }
        
        if (request.action === 'test') {
            // Test action to verify background worker is working
            console.log('Background worker test - responding to popup');
            sendResponse({ success: true, message: 'Background worker is active', timestamp: Date.now() });
            return false; // Synchronous response
        }
        
        // Unknown action
        console.warn('Unknown action received:', request.action);
        sendResponse({ success: false, error: 'Unknown action: ' + request.action });
        return false;
        
    } catch (syncError) {
        console.error('Synchronous error in message handler:', syncError);
        sendResponse({ success: false, error: 'Message handler error: ' + syncError.message });
        return false;
    }
});

// New search function for 4-column interface
async function searchCards(query, includeProductCategories = false) {
    console.log('=== SEARCHING CARDS ===');
    console.log('Search query:', query);
    console.log('Include product categories:', includeProductCategories);
    
    // Build query URL with card_type column
    let queryUrl = SUPABASE_URL + '/rest/v1/card_prices_view?select=set_number,name,card_number,card_id_simple,min_price,avg_price,max_price,scraped_at,card_type,url,product_category';
    let filters = [];
    
    // Filter out products with product_category unless explicitly enabled
    if (!includeProductCategories) {
        filters.push('product_category=is.null');
        console.log('🔍 Product category filter: excluding special categories');
    }
    
    // Add filters based on filled fields
    if (query.set_number) {
        filters.push('set_number=eq.' + encodeURIComponent(query.set_number.toLowerCase()));
        console.log('🔍 Set filter:', 'set_number=eq.' + query.set_number.toLowerCase());
    }
    
    if (query.card_number) {
        // Remove leading zeros from card number (database stores without leading zeros)
        const cleanCardNumber = parseInt(query.card_number).toString();
        filters.push('card_number=eq.' + encodeURIComponent(cleanCardNumber));
        console.log('🔍 Card number filter:', 'card_number=eq.' + cleanCardNumber + ' (converted from ' + query.card_number + ')');
    }
    
    if (query.name) {
        filters.push('name=ilike.*' + encodeURIComponent(query.name) + '*');
        console.log('🔍 Name filter:', 'name=ilike.*' + query.name + '*');
    }
    
    // Filter by card_type (rarity) - support multiple types separated by spaces
    if (query.card_type) {
        console.log('🔍 Original card_type:', query.card_type);
        
        // Split on spaces and trim whitespace
        const types = query.card_type.split(' ').map(t => t.trim()).filter(t => t.length > 0);
        
        if (types.length === 1) {
            // Single type - exact match
            const filter = 'card_type=eq.' + encodeURIComponent(types[0].toLowerCase());
            filters.push(filter);
            console.log('🔍 Single type filter:', filter);
        } else if (types.length > 1) {
            // Multiple types - OR query
            const typeFilters = types.map(type => 'card_type.eq.' + encodeURIComponent(type.toLowerCase()));
            const orFilter = 'or=(' + typeFilters.join(',') + ')';
            filters.push(orFilter);
            console.log('🔍 Multiple type filter:', orFilter);
        }
    }
    
    // Add limit to prevent huge result sets
    filters.push('limit=1000');
    
    const finalUrl = queryUrl + (filters.length > 0 ? '&' + filters.join('&') : '');
    console.log('🌐 FINAL DATABASE QUERY URL:', finalUrl);
    
    // Show exactly what we're searching for
    console.log('🔍 EXACT SEARCH CRITERIA:');
    if (query.set_number) {
        console.log(`  ✅ Set: "${query.set_number}" → searching for: "${query.set_number.toLowerCase()}"`);
    }
    if (query.card_number) {
        const cleanCardNumber = parseInt(query.card_number).toString();
        console.log(`  ✅ Card Number: "${query.card_number}" → searching for: "${cleanCardNumber}" (leading zeros removed)`);
    }
    if (query.name) {
        console.log(`  ✅ Name: "${query.name}" → searching for: "*${query.name}*"`);
    }
    if (query.card_type) {
        console.log(`  ✅ Card Type: "${query.card_type}" → searching for: "${query.card_type.toLowerCase()}"`);
    }
    
    try {
        console.log('📡 Sending request to database...');
        const response = await fetch(finalUrl, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        if (!response.ok) {
            console.log('❌ Response status:', response.status, response.statusText);
            const errorText = await response.text();
            console.log('❌ Error response:', errorText);
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        let data = await response.json();
        console.log(`📊 Database returned ${data.length} results`);
        
        // Log first few results for debugging
        if (data.length > 0) {
            console.log('✅ Sample results:');
            data.slice(0, 3).forEach((card, index) => {
                console.log(`  ${index + 1}. ${card.name} (${card.set_number}) #${card.card_number} [${card.card_type || 'no type'}]`);
            });
        } else {
            console.log('❌ NO RESULTS FOUND');
                        console.log('🔎 Debug: Try searching with less specific criteria');
            

            
            // FALLBACK: Try searching with just the set_number if we have one
            if (query.set_number && (query.card_number || query.card_type)) {
                console.log('🔄 FALLBACK: Trying to search with only set_number...');
                const fallbackUrl = SUPABASE_URL + '/rest/v1/card_prices_view?select=set_number,name,card_number,card_id_simple,min_price,avg_price,max_price,scraped_at,card_type&set_number=eq.' + encodeURIComponent(query.set_number.toLowerCase()) + '&limit=10';
                console.log('🔄 Fallback query:', fallbackUrl);
                
                try {
                    const fallbackResponse = await fetch(fallbackUrl, {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (fallbackResponse.ok) {
                        const fallbackData = await fallbackResponse.json();
                        console.log(`🔄 Fallback found ${fallbackData.length} cards from set "${query.set_number}":`);
                        fallbackData.forEach(card => {
                            console.log(`  - ${card.name} (${card.set_number}) #${card.card_number} [${card.card_type || 'no type'}]`);
                        });
                        
                        if (fallbackData.length > 0) {
                            console.log('💡 SOLUTION: Set exists but specific card number/type combination not found');
                            console.log('💡 Try: Check if card number or card type is stored differently');
                        } else {
                            // Try uppercase version
                            console.log('🔄 No results with lowercase, trying UPPERCASE...');
                            const upperUrl = SUPABASE_URL + '/rest/v1/card_prices_view?select=set_number,name,card_number,card_type&set_number=eq.' + encodeURIComponent(query.set_number.toUpperCase()) + '&limit=10';
                            console.log('🔄 Uppercase query:', upperUrl);
                            
                            const upperResponse = await fetch(upperUrl, {
                                headers: {
                                    'apikey': SUPABASE_ANON_KEY,
                                    'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (upperResponse.ok) {
                                const upperData = await upperResponse.json();
                                console.log(`🔄 UPPERCASE found ${upperData.length} cards from set "${query.set_number.toUpperCase()}":`);
                                upperData.forEach(card => {
                                    console.log(`  - ${card.name} (${card.set_number}) #${card.card_number} [${card.card_type || 'no type'}]`);
                                });
                                
                                if (upperData.length > 0) {
                                    console.log('💡 FOUND THE ISSUE: Set is stored in UPPERCASE in database!');
                                }
                            }
                        }
                    }
                } catch (fallbackError) {
                    console.log('🔄 Fallback query failed:', fallbackError);
                }
            }
            

            
            // If no results found, try a simpler query for debugging
            if (query.name && query.name.includes('ho-oh')) {
                console.log('🔍 DEBUGGING: Trying to find ho-oh cards in database...');
                const debugUrl = SUPABASE_URL + '/rest/v1/card_prices_view?select=name,set_number,card_number,card_type&name=ilike.*ho-oh*&limit=10';
                console.log('🔍 Debug query:', debugUrl);
                
                try {
                    const debugResponse = await fetch(debugUrl, {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (debugResponse.ok) {
                        const debugData = await debugResponse.json();
                        console.log(`🔍 Debug: Found ${debugData.length} ho-oh cards in database:`);
                        debugData.forEach(card => {
                            console.log(`  - ${card.name} (${card.set_number}) #${card.card_number} [${card.card_type}]`);
                        });
                    }
                } catch (debugError) {
                    console.log('🔍 Debug query failed:', debugError);
                }
            }
        }
        
        // Sort results by set, then by card number, then by name
        data.sort((a, b) => {
            if (a.set_number !== b.set_number) {
                return (a.set_number || '').localeCompare(b.set_number || '');
            }
            if (a.card_number !== b.card_number) {
                return parseInt(a.card_number || 0) - parseInt(b.card_number || 0);
            }
            return (a.name || '').localeCompare(b.name || '');
        });
        
        console.log(`✅ Final results: ${data.length} cards`);
        return data;
        
    } catch (error) {
        console.error('❌ Search error:', error);
        throw error;
    }
}

// Legacy function for hover functionality (simplified)
async function querySupabase(cards, includeProductCategories = false) {
    console.log('Legacy query for', cards.length, 'cards');
    const results = [];
    
    for (const card of cards) {
        console.log('Legacy querying card:', card.original);
        
        try {
            // Convert legacy card to new search format
            const searchQuery = {
                name: card.name,
                set_number: card.set_number,
                card_number: card.card_number,
                card_type: card.card_type || card.card_rarity
            };
            
            console.log('Converted legacy card to search query:', searchQuery);
            
            const data = await searchCards(searchQuery, includeProductCategories);
            results.push({ ...card, supabase_data: data });
            
        } catch (error) {
            console.error('Error querying', card.original, ':', error);
            results.push({ ...card, error: error.message });
        }
    }
    
    console.log('Legacy query completed, returning', results.length, 'results');
    return results;
}

// New function to handle multiple card searches
async function searchMultipleCards(queries, includeProductCategories = false) {
    console.log('=== SEARCHING MULTIPLE CARDS ===');
    console.log(`Processing ${queries.length} queries`);
    console.log('Include product categories:', includeProductCategories);
    
    const results = [];
    
    for (const query of queries) {
        console.log(`Processing query for row ${query.row_number}:`, query);
        
        try {
            const searchResults = await searchCards(query, includeProductCategories);
            results.push({
                query: query,
                results: searchResults,
                success: true
            });
            console.log(`Row ${query.row_number}: Found ${searchResults.length} cards`);
        } catch (error) {
            console.error(`Row ${query.row_number}: Error:`, error);
            results.push({
                query: query,
                results: [],
                success: false,
                error: error.message
            });
        }
    }
    
    console.log(`Completed processing ${results.length} queries`);
    return results;
} 