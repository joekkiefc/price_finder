// Card Price Lookup - Popup Script

// Import Supabase configuration (we'll load this after DOM loads)

// Parse input lines and extract card information
function parseCardLines(input, setSpecificMode = false, specificSet = null) {
    const lines = input.trim().split('\n');
    const cards = [];
    
    lines.forEach((line, index) => {
        line = line.trim();
        if (line === '') return; // Skip empty lines
        
        const parts = line.split(/\s+/); // Split on whitespace
        let set_number = null;
        let name = null;
        let card_number = null;
        let card_type = null;
        
        // If in set-specific mode, use the specified set for all cards
        if (setSpecificMode && specificSet) {
            set_number = specificSet.toLowerCase();
            
            // In set-specific mode, treat all numbers as card numbers
            // and everything else as name parts
            parts.forEach(part => {
                if (/^\d+$/.test(part)) {
                    // This is a card number
                    card_number = parseInt(part).toString(); // Remove leading zeros
                } else {
                    // This is part of the name (ignore set codes when in set-specific mode)
                    if (name === null) {
                        name = part.toLowerCase();
                    } else {
                        name += ' ' + part.toLowerCase();
                    }
                }
            });
        } else {
            // Original parsing logic for normal mode
            // Special case 1: Set + Card Type (e.g., "sv7a AR", "sv2a SAR")
            if (parts.length === 2 && /^[a-zA-Z]+\d+[a-zA-Z]*$/i.test(parts[0]) && /^(ar|sar|sr|ex|gx|vmax|v)$/i.test(parts[1])) {
                set_number = parts[0].toLowerCase();
                card_type = parts[1].toUpperCase();
                console.log(`🎯 Detected set + card type pattern: "${line}" → set: ${set_number}, type: ${card_type}`);
            }
            // Special case 2: if the entire input looks like a name with card types (e.g., "mew ex", "alakazam ex"), treat it as a name
            else if (parts.length === 2 && /^(ex|gx|vmax|v|sar|sr|ar)$/i.test(parts[1]) && !/^\d+$/.test(parts[0])) {
                // This looks like "pokemon cardtype" - treat as single name
                name = line.toLowerCase();
                console.log(`🎯 Detected card type pattern: "${line}" → treating as single name`);
            } else {
                // Normal parsing logic
                parts.forEach(part => {
                    // Check if this part looks like a set code (letters followed by numbers, OR specific known set patterns like AR, BW, XY, DP)
                    // BUT exclude common card types when they appear with pokemon names
                    if (/^[a-zA-Z]+\d+[a-zA-Z]*$/i.test(part) || /^(ar|bw|xy|dp|lg|rs|md|neo|gym|base|jungle|fossil|rocket)$/i.test(part)) {
                        set_number = part.toLowerCase();
                    }
                    // Check if this part looks like a card number (only digits)
                    else if (/^\d+$/.test(part)) {
                        card_number = parseInt(part).toString(); // Remove leading zeros
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
            }
        }
        
        const cardInfo = {
            line_number: index + 1,
            original: line,
            set_number: set_number,
            name: name,
            card_number: card_number,
            card_type: card_type,
            search_mode: setSpecificMode ? 'set_specific' : 'normal'
        };
        
        cards.push(cardInfo);
        
        // Debug: uncomment next line for detailed parsing logs
        // console.log(`Line ${index + 1}: "${line}" → set: ${set_number}, name: ${name}, card: ${card_number}, mode: ${cardInfo.search_mode}`);
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
            const searchModeInfo = result.search_mode === 'set_specific' ? ' [Set-Specific]' : '';
            row.innerHTML = `
                <td>${result.set_number || '-'}</td>
                <td>${result.name || result.original}${searchModeInfo}</td>
                <td colspan="3" style="color: red;">Error: ${result.error}</td>
            `;
            tbody.appendChild(row);
        } else if (result.supabase_data && result.supabase_data.length > 0) {
            // Handle multiple results from one query (e.g., all cards from a set)
            result.supabase_data.forEach((data, index) => {
                const row = document.createElement('tr');
                const minPrice = parseFloat(data.min_price) || 0;
                const avgPrice = parseFloat(data.avg_price) || 0;
                const maxPrice = parseFloat(data.max_price) || 0;
                
                // Add search mode indicator to the first result of set-specific searches
                let nameDisplay = data.name || '-';
                if (result.search_mode === 'set_specific' && index === 0) {
                    nameDisplay += ' <span style="color: #007bff; font-size: 11px;">[Set-Specific]</span>';
                }
                
                row.innerHTML = `
                    <td>${data.set_number || '-'}</td>
                    <td>${nameDisplay}</td>
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
            const searchModeInfo = result.search_mode === 'set_specific' ? ' <span style="color: #007bff; font-size: 11px;">[Set-Specific]</span>' : '';
            row.innerHTML = `
                <td>${result.set_number || '-'}</td>
                <td>${result.name || result.original}${searchModeInfo}</td>
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

// NEW: Manage hover set-specific settings
async function loadHoverSetSettings() {
    try {
        const result = await chrome.storage.sync.get(['hoverSetSpecific', 'hoverSetNumber']);
        return {
            enabled: result.hoverSetSpecific || false,
            setNumber: result.hoverSetNumber || ''
        };
    } catch (error) {
        console.error('Error loading hover set settings:', error);
        return { enabled: false, setNumber: '' };
    }
}

async function saveHoverSetSettings(enabled, setNumber) {
    try {
        await chrome.storage.sync.set({ 
            hoverSetSpecific: enabled,
            hoverSetNumber: setNumber 
        });
        console.log('Hover set-specific settings saved:', enabled, setNumber);
        
        // Notify content scripts about the change
        chrome.tabs.query({}, (tabs) => {
            tabs.forEach(tab => {
                chrome.tabs.sendMessage(tab.id, { 
                    action: 'updateHoverSetMode', 
                    enabled: enabled,
                    setNumber: setNumber
                }, () => {
                    // Ignore errors for tabs that don't have our content script
                    if (chrome.runtime.lastError) {
                        // Silent ignore
                    }
                });
            });
        });
        
    } catch (error) {
        console.error('Error saving hover set settings:', error);
    }
}

// Event listener for the lookup button
document.addEventListener('DOMContentLoaded', async function() {
    const inputTextarea = document.getElementById('input');
    const goButton = document.getElementById('go');
    const hoverToggle = document.getElementById('hoverToggle');
    
    // New set-specific search elements
    const setSpecificToggle = document.getElementById('setSpecificToggle');
    const setInputContainer = document.getElementById('setInputContainer');
    const setNumberInput = document.getElementById('setNumber');
    
    // New hover set-specific elements
    const hoverSetSpecificToggle = document.getElementById('hoverSetSpecificToggle');
    const hoverSetInputContainer = document.getElementById('hoverSetInputContainer');
    const hoverSetNumberInput = document.getElementById('hoverSetNumber');
    
    // Extension ready
    console.log('Popup loaded - ready to fetch card prices via background worker');
    
    // Task 12: Load and set hover toggle state
    const hoverEnabled = await loadHoverSetting();
    hoverToggle.checked = hoverEnabled;
    console.log('Hover detection enabled:', hoverEnabled);
    
    // Load hover set-specific settings
    const hoverSetSettings = await loadHoverSetSettings();
    hoverSetSpecificToggle.checked = hoverSetSettings.enabled;
    hoverSetNumberInput.value = hoverSetSettings.setNumber;
    hoverSetInputContainer.style.display = hoverSetSettings.enabled ? 'block' : 'none';
    console.log('Hover set-specific mode:', hoverSetSettings);
    
    // Handle hover toggle changes
    hoverToggle.addEventListener('change', function() {
        const enabled = hoverToggle.checked;
        saveHoverSetting(enabled);
        console.log('Hover detection toggled:', enabled);
    });
    
    // Handle hover set-specific toggle changes
    hoverSetSpecificToggle.addEventListener('change', function() {
        const enabled = hoverSetSpecificToggle.checked;
        hoverSetInputContainer.style.display = enabled ? 'block' : 'none';
        
        if (enabled) {
            hoverSetNumberInput.focus();
        }
        
        saveHoverSetSettings(enabled, hoverSetNumberInput.value.trim());
        console.log('Hover set-specific mode toggled:', enabled);
    });
    
    // Auto-format hover set number input and save changes
    hoverSetNumberInput.addEventListener('input', function() {
        this.value = this.value.toLowerCase().replace(/\s+/g, '');
        saveHoverSetSettings(hoverSetSpecificToggle.checked, this.value.trim());
    });
    
    // Handle set-specific toggle changes
    setSpecificToggle.addEventListener('change', function() {
        const enabled = setSpecificToggle.checked;
        setInputContainer.style.display = enabled ? 'block' : 'none';
        
        if (enabled) {
            setNumberInput.focus();
            // Update placeholder text for set-specific mode
            inputTextarea.placeholder = 'Enter card numbers or names (one per line)\nExample: 130, 098, tropius';
        } else {
            // Restore original placeholder
            inputTextarea.placeholder = 'Enter cards (one per line)\nExample: sv1a tropius';
        }
        
        console.log('Set-specific search toggled:', enabled);
    });
    
    // Auto-format set number input (lowercase, remove spaces)
    setNumberInput.addEventListener('input', function() {
        this.value = this.value.toLowerCase().replace(/\s+/g, '');
    });
    
    goButton.addEventListener('click', function() {
        const inputText = inputTextarea.value;
        const setSpecificMode = setSpecificToggle.checked;
        const specificSet = setSpecificMode ? setNumberInput.value.trim() : null;
        
        // Validate set-specific mode
        if (setSpecificMode && !specificSet) {
            alert('Please enter a set number when using set-specific search.');
            setNumberInput.focus();
            return;
        }
        
        console.log('Parsing', inputText.split('\n').length, 'cards...');
        console.log('Set-specific mode:', setSpecificMode, 'Set:', specificSet);
        
        const parsedCards = parseCardLines(inputText, setSpecificMode, specificSet);
        console.log('Parsed cards:', parsedCards);
        
        // Task 6: Call Supabase to get prices for each card
        fetchCardPrices(parsedCards);
    });
});
