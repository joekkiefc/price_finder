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
        console.log('Search mode:', card.search_mode || 'normal');
        console.log('Parsed data:', {
            set_number: card.set_number,
            card_number: card.card_number,
            name: card.name,
            card_type: card.card_type
        });
        
        try {
            let queryUrl = SUPABASE_URL + '/rest/v1/card_prices_view?select=set_number,name,card_number,min_price,avg_price,max_price';
            let filters = [];
            let queryAttempts = [];
            
            // Build multiple query strategies (try most specific first)
            
            // NEW: Set-specific search mode (highest priority - ONLY search in this set)
            // This applies to both popup set-specific mode AND hover set-specific mode
            if ((card.search_mode === 'set_specific' || card.search_mode === 'hover_set_specific') && card.set_number) {
                console.log('🎯 SET-SPECIFIC MODE: Only searching in set', card.set_number, '(mode:', card.search_mode + ')');
                
                // First, let's check if this set exists at all
                queryAttempts.push({
                    name: 'set_existence_check',
                    filters: ['set_number=eq.' + encodeURIComponent(card.set_number)],
                    debug: true
                });
                
                if (card.card_number) {
                    // Set-specific with card number - most precise
                    queryAttempts.push({
                        name: 'set_specific_card_number',
                        filters: [
                            'set_number=eq.' + encodeURIComponent(card.set_number),
                            'card_number=eq.' + encodeURIComponent(card.card_number)
                        ]
                    });
                    console.log('Set-specific: Searching for card number', card.card_number, 'in set', card.set_number);
                }
                
                if (card.name && card.name.length > 2) {
                    // Set-specific with name search
                    const cleanName = card.name
                        .replace(/^\[.*?\]\s*/, '') // Remove [Condition A-] prefixes
                        .replace(/\s+/g, ' ')
                        .trim();
                    
                    queryAttempts.push({
                        name: 'set_specific_name',
                        filters: [
                            'set_number=eq.' + encodeURIComponent(card.set_number),
                            'name=eq.' + encodeURIComponent(cleanName.toLowerCase())
                        ]
                    });
                    
                    // Try with trailing spaces
                    queryAttempts.push({
                        name: 'set_specific_name_spaces',
                        filters: [
                            'set_number=eq.' + encodeURIComponent(card.set_number),
                            'name=eq.' + encodeURIComponent(cleanName.toLowerCase() + '  ')
                        ]
                    });
                    console.log('Set-specific: Searching for name', cleanName, 'in set', card.set_number);
                }
                
                // If no specific search criteria but set is specified, show error
                if (!card.card_number && (!card.name || card.name.length <= 2)) {
                    console.log('Set-specific mode: No valid search criteria (card number or name)');
                    results.push({ ...card, error: 'No card number or name provided for set-specific search' });
                    continue;
                }
                
                // IMPORTANT: Do NOT add any other strategies in set-specific mode
                console.log('Set-specific mode: Will only try', queryAttempts.length, 'set-specific strategies');
            }
            
            // EXISTING strategies (ONLY when NOT in set-specific mode)
            else {
                console.log('🔄 NORMAL MODE: Using all available search strategies');
                
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
                
                if (card.set_number && card.card_type) {
                    // NEW Strategy: Set + card type (e.g., sv7a AR = all AR cards from sv7a)
                    // Database is all lowercase, so use lowercase
                    queryAttempts.push({
                        name: 'set+card_type',
                        filters: [
                            'set_number=eq.' + encodeURIComponent(card.set_number),
                            'card_type=eq.' + encodeURIComponent(card.card_type.toLowerCase())
                        ]
                    });
                    
                    // Also try with trailing spaces (common in this database)
                    queryAttempts.push({
                        name: 'set+card_type_spaces',
                        filters: [
                            'set_number=eq.' + encodeURIComponent(card.set_number),
                            'card_type=eq.' + encodeURIComponent(card.card_type.toLowerCase() + '  ')
                        ]
                    });
                    
                    console.log(`🎯 Fetching all ${card.card_type} cards from set ${card.set_number}`);
                }
                
                if (card.set_number && card.name) {
                    // Strategy 2: Set + flexible name matching
                    const cleanName = card.name
                        .replace(/^\[.*?\]\s*/, '') // Remove [Condition A-] prefixes
                        .replace(/\s+/g, ' ')
                        .trim();
                    
                    if (cleanName.length > 2) {
                        queryAttempts.push({
                            name: 'set+name_exact',
                            filters: [
                                'set_number=eq.' + encodeURIComponent(card.set_number),
                                'name=eq.' + encodeURIComponent(cleanName.toLowerCase())
                            ]
                        });
                        
                        // Try with trailing spaces
                        queryAttempts.push({
                            name: 'set+name_spaces',
                            filters: [
                                'set_number=eq.' + encodeURIComponent(card.set_number),
                                'name=eq.' + encodeURIComponent(cleanName.toLowerCase() + '  ')
                            ]
                        });
                    }
                }
                
                if (card.set_number && !card.name && !card.card_number && !card.card_type) {
                    // Strategy 3: Only set number - get ALL cards from this set (but NOT when card_type is specified)
                    queryAttempts.push({
                        name: 'set_only',
                        filters: ['set_number=eq.' + encodeURIComponent(card.set_number)]
                    });
                    console.log('Fetching ALL cards from set:', card.set_number);
                }
                
                if (card.name && !card.set_number && !card.card_number) {
                    // Strategy 4: Only name available
                    const cleanName = card.name
                        .replace(/^\[.*?\]\s*/, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                        
                    if (cleanName.length > 2) {
                        // Try exact lowercase match AND with potential trailing spaces
                        queryAttempts.push({
                            name: 'name_only',
                            filters: ['name=eq.' + encodeURIComponent(cleanName.toLowerCase())]
                        });
                        
                        // Try with trailing spaces (common in this database)
                        queryAttempts.push({
                            name: 'name_with_spaces',
                            filters: ['name=eq.' + encodeURIComponent(cleanName.toLowerCase() + '  ')]
                        });
                        


                    }
                }
                
                // Strategy 5: Name + card number but no set (like "wartortle 171")
                if (card.name && card.card_number && !card.set_number) {
                    const cleanName = card.name
                        .replace(/^\[.*?\]\s*/, '')
                        .replace(/\s+/g, ' ')
                        .trim();
                        
                    console.log('🎯 Checking name+card_number strategy:', {
                        original_name: card.name,
                        clean_name: cleanName,
                        card_number: card.card_number,
                        name_length: cleanName.length,
                        has_set: !!card.set_number
                    });
                        
                    if (cleanName.length > 2) {
                        // Try name only first (more reliable)
                        queryAttempts.push({
                            name: 'name_only_first',
                            filters: ['name=eq.' + encodeURIComponent(cleanName.toLowerCase())]
                        });
                        
                        // Try name with trailing spaces
                        queryAttempts.push({
                            name: 'name_only_spaces',
                            filters: ['name=eq.' + encodeURIComponent(cleanName.toLowerCase() + '  ')]
                        });
                        
                        // Then try name + card number combination
                        queryAttempts.push({
                            name: 'name_and_card_number', 
                            filters: [
                                'name=eq.' + encodeURIComponent(cleanName.toLowerCase()),
                                'card_number=eq.' + encodeURIComponent(card.card_number)
                            ]
                        });
                        
                        // Try name with spaces + card number
                        queryAttempts.push({
                            name: 'name_spaces_and_card_number', 
                            filters: [
                                'name=eq.' + encodeURIComponent(cleanName.toLowerCase() + '  '),
                                'card_number=eq.' + encodeURIComponent(card.card_number)
                            ]
                        });
                        
                        console.log('✅ Added exact match strategies for:', cleanName.toLowerCase(), card.card_number);
                    } else {
                        console.log('❌ Name too short for name_and_card_number strategy:', cleanName);
                    }
                }
                
                // Strategy 6: Only card number available (no set, no name)
                if (card.card_number && !card.set_number && !card.name) {
                    queryAttempts.push({
                        name: 'card_number_only',
                        filters: ['card_number=eq.' + encodeURIComponent(card.card_number)]
                    });
                    console.log('Searching for card number only:', card.card_number);
                }
            }
            
            // Ensure we have at least one query attempt
            if (queryAttempts.length === 0) {
                console.log('No valid query strategy found for card:', card.original);
                results.push({ ...card, error: 'No searchable information found' });
                continue;
            }
            
            // Try each query strategy in order
            let foundResult = false;
            for (const attempt of queryAttempts) {
                try {
                    let fullUrl;
                    if (attempt.debug) {
                        // Special debug query - get all cards (limited)
                        fullUrl = `${queryUrl}&limit=${attempt.limit || 10}`;
                        console.log(`🔍 DEBUG QUERY: Getting sample cards from database`);
                    } else {
                        fullUrl = `${queryUrl}&${attempt.filters.join('&')}`;
                    }
                    console.log(`Trying strategy "${attempt.name}": ${fullUrl}`);
                    console.log(`🔍 DEBUG: Exact query URL being sent:`, fullUrl);
                    const response = await fetch(fullUrl, {
                        headers: {
                            'apikey': SUPABASE_ANON_KEY,
                            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                        }
                    });
                    
                    if (!response.ok) {
                        console.log(`Strategy "${attempt.name}" failed: HTTP ${response.status}: ${response.statusText} - ${await response.text()}`);
                        continue; // Try next strategy
                    }
                    
                    const data = await response.json();
                    console.log(`Strategy "${attempt.name}" succeeded with ${data.length} results`);
                    
                    // Special debug logging
                    if (attempt.debug) {
                        if (attempt.name.startsWith('debug_name_var')) {
                            console.log(`🔤 Name variation test "${attempt.name}": ${data.length} results`);
                        } else if (attempt.name === 'debug_latios_known') {
                            console.log('🎯 Known latios card test: found', data.length, 'results');
                            if (data.length > 0) {
                                console.log(`  Exact name in database: "${data[0].name}" (length: ${data[0].name.length})`);
                                console.log(`  Name bytes:`, Array.from(data[0].name).map(c => c.charCodeAt(0)));
                            }
                        } else {
                            console.log('🔍 DEBUG: Sample cards from database:');
                            data.slice(0, 5).forEach((card, index) => {
                                console.log(`  Card ${index + 1}: "${card.name}" (set: ${card.set_number}, number: ${card.card_number})`);
                            });
                        }
                        continue; // Don't use debug results as actual results
                    }
                    
                    if (data && data.length > 0) {
                        results.push({ ...card, supabase_data: data });
                        foundResult = true;
                        break; // Found results, stop trying
                    }
                    
                    console.log(`Strategy "${attempt.name}" returned 0 results, trying next strategy...`);
                } catch (error) {
                    console.log(`Strategy "${attempt.name}" error: ${error.message}`);
                    continue; // Try next strategy
                }
            }
            
            // If no results found from any strategy
            if (!foundResult) {
                console.log('No results found with any strategy for:', card.original);
                results.push({ ...card, error: 'No results found' });
            }
            
        } catch (error) {
            console.error('Error querying', card.original, ':', error);
            results.push({ ...card, error: error.message });
        }
    }
    
    return results;
} 