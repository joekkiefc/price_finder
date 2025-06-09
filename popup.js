// Card Price Lookup - Popup Script

// Import Supabase configuration (we'll load this after DOM loads)

// Parse input lines and extract card information
function parseCardLines(input) {
    const lines = input.trim().split('\n');
    const cards = [];
    
    lines.forEach((line, index) => {
        line = line.trim();
        if (line === '') return; // Skip empty lines
        
        const parts = line.split(/\s+/); // Split on whitespace
        let set_number = null;
        let name = null;
        let card_number = null;
        
        parts.forEach(part => {
            // Check if this part looks like a set code (letters followed by numbers, starts with letters)
            if (/^[a-zA-Z]+\d+[a-zA-Z]*$/i.test(part)) {
                set_number = part.toLowerCase();
            }
            // Check if this part looks like a card number (only digits)
            else if (/^\d+$/.test(part)) {
                card_number = part;
            }
            // Everything else is considered part of the name
            else {
                if (name === null) {
                    name = part.toLowerCase();
                } else {
                    name += ' ' + part.toLowerCase();
                }
            }
        });
        
        const cardInfo = {
            line_number: index + 1,
            original: line,
            set_number: set_number,
            name: name,
            card_number: card_number
        };
        
        cards.push(cardInfo);
        
        // Debug: uncomment next line for detailed parsing logs
        // console.log(`Line ${index + 1}: "${line}" → set: ${set_number}, name: ${name}, card: ${card_number}`);
    });
    
    return cards;
}

// Fetch card prices via background worker (Task 6)
async function fetchCardPrices(parsedCards) {
    console.log('=== FETCHING CARD PRICES ===');
    console.log('Sending request to background worker...');
    
    try {
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'querySupabase', cards: parsedCards }, 
                resolve
            );
        });
        
        console.log('Response from background:', response);
        
        if (response.success) {
            console.log('\n=== FINAL RESULTS ===');
            console.log(response.data);
            console.log('=========================');
            
            // Task 7: Render results in HTML table
            renderResultsTable(response.data);
            return response.data;
        } else {
            console.error('Background worker error:', response.error);
            // Show error in table
            const errorResults = parsedCards.map(card => ({ ...card, error: response.error }));
            renderResultsTable(errorResults);
            return errorResults;
        }
    } catch (error) {
        console.error('Message passing error:', error);
        // Show error in table
        const errorResults = parsedCards.map(card => ({ ...card, error: 'Connection error' }));
        renderResultsTable(errorResults);
        return errorResults;
    }
}

// Render results in HTML table (Task 7)
function renderResultsTable(results) {
    const table = document.getElementById('results');
    const tbody = table.querySelector('tbody');
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    let totalMin = 0;
    let totalAvg = 0;
    let totalMax = 0;
    let validPriceCount = 0;
    
    results.forEach(result => {
        if (result.error) {
            // Show error row
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.set_number || '-'}</td>
                <td>${result.name || result.original}</td>
                <td colspan="3" style="color: red;">Error: ${result.error}</td>
            `;
            tbody.appendChild(row);
        } else if (result.supabase_data && result.supabase_data.length > 0) {
            // Handle multiple results from one query (e.g., all cards from a set)
            result.supabase_data.forEach(data => {
                const row = document.createElement('tr');
                const minPrice = parseFloat(data.min_price) || 0;
                const avgPrice = parseFloat(data.avg_price) || 0;
                const maxPrice = parseFloat(data.max_price) || 0;
                
                row.innerHTML = `
                    <td>${data.set_number || '-'}</td>
                    <td>${data.name || '-'}</td>
                    <td>€${minPrice.toFixed(2)}</td>
                    <td>€${avgPrice.toFixed(2)}</td>
                    <td>€${maxPrice.toFixed(2)}</td>
                `;
                
                // Add to totals
                totalMin += minPrice;
                totalAvg += avgPrice;
                totalMax += maxPrice;
                validPriceCount++;
                
                tbody.appendChild(row);
            });
        } else {
            // No data found
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${result.set_number || '-'}</td>
                <td>${result.name || result.original}</td>
                <td colspan="3" style="color: #999;">No data found</td>
            `;
            tbody.appendChild(row);
        }
    });
    
    // Update totals row
    document.getElementById('total-min').innerHTML = `<strong>€${totalMin.toFixed(2)}</strong>`;
    document.getElementById('total-avg').innerHTML = `<strong>€${totalAvg.toFixed(2)}</strong>`;
    document.getElementById('total-max').innerHTML = `<strong>€${totalMax.toFixed(2)}</strong>`;
    
    console.log(`\nTable updated with ${tbody.children.length} rows. Totals: Min=€${totalMin.toFixed(2)}, Avg=€${totalAvg.toFixed(2)}, Max=€${totalMax.toFixed(2)}`);
}

// Manage hover toggle setting (Task 12)
async function loadHoverSetting() {
    try {
        const result = await chrome.storage.sync.get(['hoverEnabled']);
        return result.hoverEnabled !== false; // Default to true
    } catch (error) {
        console.error('Error loading hover setting:', error);
        return true; // Default to enabled
    }
}

async function saveHoverSetting(enabled) {
    try {
        await chrome.storage.sync.set({ hoverEnabled: enabled });
        console.log('Hover setting saved:', enabled);
        
        // Notify content scripts about the change
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { 
                    action: 'toggleHover', 
                    enabled: enabled 
                }, () => {
                    // Ignore errors for tabs that don't have our content script
                    if (chrome.runtime.lastError) {
                        // Silent ignore
                    }
                });
            });
        });
        
    } catch (error) {
        console.error('Error saving hover setting:', error);
    }
}

// Event listener for the lookup button
document.addEventListener('DOMContentLoaded', async function() {
    const inputTextarea = document.getElementById('input');
    const goButton = document.getElementById('go');
    const hoverToggle = document.getElementById('hoverToggle');
    
    // Extension ready
    console.log('Popup loaded - ready to fetch card prices via background worker');
    
    // Task 12: Load and set hover toggle state
    const hoverEnabled = await loadHoverSetting();
    hoverToggle.checked = hoverEnabled;
    console.log('Hover detection enabled:', hoverEnabled);
    
    // Handle hover toggle changes
    hoverToggle.addEventListener('change', function() {
        const enabled = hoverToggle.checked;
        saveHoverSetting(enabled);
        console.log('Hover detection toggled:', enabled);
    });
    
    goButton.addEventListener('click', function() {
        const inputText = inputTextarea.value;
        console.log('Parsing', inputText.split('\n').length, 'cards...');
        const parsedCards = parseCardLines(inputText);
        console.log('Parsed cards:', parsedCards);
        
        // Task 6: Call Supabase to get prices for each card
        fetchCardPrices(parsedCards);
    });
});
