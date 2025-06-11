// Card Price Lookup - Popup Script

let rowCounter = 0;

// Add a new row to the input table
function addInputRow(name = '', set = '', number = '', type = '') {
    const tbody = document.getElementById('inputTableBody');
    const row = document.createElement('tr');
    rowCounter++;
    
    row.innerHTML = `
        <td><input type="text" placeholder="bijv. charizard" value="${name}" data-field="name"></td>
        <td><input type="text" placeholder="bijv. sv7a" value="${set}" data-field="set"></td>
        <td><input type="text" placeholder="bijv. 125" value="${number}" data-field="number"></td>
        <td><input type="text" placeholder="bijv. ar, sar" value="${type}" data-field="type"></td>
        <td><button class="delete-row-btn" onclick="deleteRow(this)">×</button></td>
    `;
    
    tbody.appendChild(row);
    
    // Focus on the first input of the new row
    const firstInput = row.querySelector('input');
    if (firstInput) {
        firstInput.focus();
    }
    
    console.log('Added new input row');
}

// Delete a row from the input table
function deleteRow(button) {
    const row = button.closest('tr');
    row.remove();
    console.log('Deleted input row');
}

// Clear all rows
function clearAllRows() {
    const tbody = document.getElementById('inputTableBody');
    tbody.innerHTML = '';
    rowCounter = 0;
    console.log('Cleared all input rows');
}

// Get all card data from input table
function getCardDataFromTable() {
    const tbody = document.getElementById('inputTableBody');
    const rows = tbody.querySelectorAll('tr');
    const cardData = [];
    
    rows.forEach((row, index) => {
        const inputs = row.querySelectorAll('input');
        const name = inputs[0].value.trim();
        const set = inputs[1].value.trim();
        const number = inputs[2].value.trim();
        const type = inputs[3].value.trim();
        
        // Only add non-empty rows
        if (name || set || number || type) {
            cardData.push({
                row_number: index + 1,
                name: name || null,
                set_number: set || null,
                card_number: number || null,
                card_type: type || null
            });
        }
    });
    
    console.log('Extracted card data from table:', cardData);
    return cardData;
}

// Fetch card prices via background worker
async function fetchCardPrices(cardQueries) {
    console.log('=== FETCHING CARD PRICES ===');
    console.log(`Sending ${cardQueries.length} search queries to background worker...`);
    
    // Validate input
    if (!Array.isArray(cardQueries) || cardQueries.length === 0) {
        console.error('Invalid cardQueries:', cardQueries);
        showResultsInfo(0, 0, 'Invalid search data');
        renderResultsTable([]);
        return [];
    }
    
    try {
        console.log('Sending message with action: searchMultipleCards');
        console.log('Queries to send:', cardQueries);
        
        const response = await new Promise((resolve, reject) => {
            // Set a timeout to catch hanging requests
            const timeout = setTimeout(() => {
                reject(new Error('Request timeout after 30 seconds'));
            }, 30000);
            
            chrome.runtime.sendMessage(
                { action: 'searchMultipleCards', queries: cardQueries }, 
                (response) => {
                    clearTimeout(timeout);
                    
                    // Check for chrome runtime errors
                    if (chrome.runtime.lastError) {
                        console.error('Chrome runtime error:', chrome.runtime.lastError);
                        reject(new Error('Extension error: ' + chrome.runtime.lastError.message));
                        return;
                    }
                    
                    // Check if response is valid
                    if (!response) {
                        console.error('No response received from background worker');
                        reject(new Error('No response from background worker'));
                        return;
                    }
                    
                    console.log('Received response from background:', response);
                    resolve(response);
                }
            );
        });
        
        if (response.success) {
            console.log('\n=== SEARCH RESULTS ===');
            console.log(`Found results for ${response.data.length} queries`);
            console.log('=========================');
            
            // Flatten all results into single array
            const allResults = [];
            response.data.forEach(queryResult => {
                if (queryResult.results && queryResult.results.length > 0) {
                    queryResult.results.forEach(card => {
                        allResults.push({
                            ...card,
                            query_info: {
                                row: queryResult.query.row_number,
                                original_query: queryResult.query
                            }
                        });
                    });
                }
            });
            
            // Show results info
            showResultsInfo(allResults.length, cardQueries.length);
            
            // Render results in HTML table
            renderResultsTable(allResults);
            return allResults;
        } else {
            console.error('Background worker error:', response.error);
            // Show error
            showResultsInfo(0, cardQueries.length, response.error || 'Unknown error');
            renderResultsTable([]);
            return [];
        }
    } catch (error) {
        console.error('Message passing error:', error);
        // Show more specific error messages
        let errorMessage = 'Connection error';
        if (error.message.includes('timeout')) {
            errorMessage = 'Request timeout - try again';
        } else if (error.message.includes('Extension error')) {
            errorMessage = 'Extension not properly loaded - reload the extension';
        } else if (error.message.includes('No response')) {
            errorMessage = 'Background worker not responding - reload the extension';
        }
        
        showResultsInfo(0, cardQueries.length, errorMessage);
        renderResultsTable([]);
        return [];
    }
}

// Show search results info
function showResultsInfo(cardCount, queryCount, error = null) {
    const infoDiv = document.getElementById('results-info');
    
    if (error) {
        infoDiv.innerHTML = `<strong>Error:</strong> ${error}`;
        infoDiv.style.background = '#f8d7da';
        infoDiv.style.borderColor = '#f5c6cb';
        infoDiv.style.color = '#721c24';
    } else {
        infoDiv.innerHTML = `<strong>${cardCount} kaarten gevonden</strong> uit ${queryCount} zoekopdrachten`;
        infoDiv.style.background = '#d4edda';
        infoDiv.style.borderColor = '#c3e6cb';
        infoDiv.style.color = '#155724';
    }
    
    infoDiv.classList.add('show');
}

// Render results in HTML table
function renderResultsTable(results) {
    const table = document.getElementById('results');
    const tbody = table.querySelector('tbody');
    
    // Clear existing rows
    tbody.innerHTML = '';
    
    let totalMin = 0;
    let totalAvg = 0;
    let totalMax = 0;
    let validPriceCount = 0;
    
    if (results.length === 0) {
        const row = document.createElement('tr');
        row.innerHTML = `<td colspan="7" style="text-align: center; color: #999; padding: 20px;">Geen kaarten gevonden</td>`;
        tbody.appendChild(row);
    } else {
        results.forEach(card => {
            const row = document.createElement('tr');
            const minPrice = parseFloat(card.min_price) || 0;
            const avgPrice = parseFloat(card.avg_price) || 0;
            const maxPrice = parseFloat(card.max_price) || 0;
            
            row.innerHTML = `
                <td>${card.set_number || '-'}</td>
                <td>${card.name || '-'}</td>
                <td>${card.card_number || '-'}</td>
                <td>${card.card_type || '-'}</td>
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
    }
    
    // Update totals row
    document.getElementById('total-min').innerHTML = `<strong>€${totalMin.toFixed(2)}</strong>`;
    document.getElementById('total-avg').innerHTML = `<strong>€${totalAvg.toFixed(2)}</strong>`;
    document.getElementById('total-max').innerHTML = `<strong>€${totalMax.toFixed(2)}</strong>`;
    
    console.log(`Table updated with ${results.length} cards. Totals: Min=€${totalMin.toFixed(2)}, Avg=€${totalAvg.toFixed(2)}, Max=€${totalMax.toFixed(2)}`);
}

// Manage hover toggle setting
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

// Event listeners
document.addEventListener('DOMContentLoaded', async function() {
    const addRowButton = document.getElementById('addRowButton');
    const clearAllButton = document.getElementById('clearAllButton');
    const searchButton = document.getElementById('searchButton');
    const hoverToggle = document.getElementById('hoverToggle');
    
    // Extension ready
    console.log('Popup loaded - ready to search cards!');
    
    // Test background worker connection
    try {
        console.log('Testing background worker connection...');
        const testResponse = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Background worker test timeout'));
            }, 5000);
            
            chrome.runtime.sendMessage(
                { action: 'test', test: true }, 
                (response) => {
                    clearTimeout(timeout);
                    
                    if (chrome.runtime.lastError) {
                        console.error('Background worker test failed:', chrome.runtime.lastError);
                        reject(new Error('Background worker not available'));
                        return;
                    }
                    
                    resolve(response || { received: true });
                }
            );
        });
        
        console.log('Background worker test successful:', testResponse);
        
    } catch (error) {
        console.error('Background worker test failed:', error);
        showResultsInfo(0, 0, 'Extension not properly loaded - please reload the extension');
    }
    
    // Load and set hover toggle state
    const hoverEnabled = await loadHoverSetting();
    hoverToggle.checked = hoverEnabled;
    console.log('Hover detection enabled:', hoverEnabled);
    
    // Add initial empty row
    addInputRow();
    
    // Handle hover toggle changes
    hoverToggle.addEventListener('change', function() {
        const enabled = hoverToggle.checked;
        saveHoverSetting(enabled);
        console.log('Hover detection toggled:', enabled);
    });
    
    // Handle add row button
    addRowButton.addEventListener('click', function() {
        addInputRow();
    });
    
    // Handle clear all button
    clearAllButton.addEventListener('click', function() {
        if (confirm('Weet je zeker dat je alle rijen wilt wissen?')) {
            clearAllRows();
            addInputRow(); // Add one empty row back
        }
    });
    
    // Handle search button click
    searchButton.addEventListener('click', function() {
        const cardQueries = getCardDataFromTable();
        
        if (cardQueries.length === 0) {
            showResultsInfo(0, 0, 'Vul minimaal één rij in');
            renderResultsTable([]);
            return;
        }
        
        console.log('Starting search with queries:', cardQueries);
        fetchCardPrices(cardQueries);
    });
    
    // Handle Enter key in input fields - add new row
    document.addEventListener('keypress', function(e) {
        if (e.target.matches('#inputTable input') && e.key === 'Enter') {
            e.preventDefault();
            const currentRow = e.target.closest('tr');
            const allInputs = currentRow.querySelectorAll('input');
            const currentIndex = Array.from(allInputs).indexOf(e.target);
            
            // If this is the last input in the row, add a new row
            if (currentIndex === allInputs.length - 1) {
                addInputRow();
            } else {
                // Move to next input in same row
                allInputs[currentIndex + 1].focus();
            }
        }
    });
    
    // Handle Tab navigation within table
    document.addEventListener('keydown', function(e) {
        if (e.target.matches('#inputTable input') && e.key === 'Tab') {
            const currentRow = e.target.closest('tr');
            const allInputs = currentRow.querySelectorAll('input');
            const currentIndex = Array.from(allInputs).indexOf(e.target);
            
            // If this is the last input in the row and we're not shift-tabbing
            if (currentIndex === allInputs.length - 1 && !e.shiftKey) {
                e.preventDefault();
                addInputRow();
            }
        }
    });
});
