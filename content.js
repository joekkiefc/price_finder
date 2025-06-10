// Content script for hover detection on websites
console.log('🚀 Card Price Lookup - Content script loaded [VERSION 2.0 - DEBUG MODE]');

// Track hover state to prevent spam
let lastHoveredElement = null;
let hoverTimeout = null;
let currentTooltip = null;
let hoverEnabled = true; // Default enabled (Task 12)

// NEW: Hover set-specific mode variables
let hoverSetSpecificMode = false;
let hoverSetNumber = '';

// Listen for toggle messages from popup (Task 12)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'toggleHover') {
        hoverEnabled = request.enabled;
        console.log('Hover detection toggled:', hoverEnabled ? 'enabled' : 'disabled');
        
        // Hide tooltip if disabling
        if (!hoverEnabled) {
            hideTooltip();
        }
        
        sendResponse({ success: true });
    }
    
    // NEW: Handle hover set-specific mode updates
    if (request.action === 'updateHoverSetMode') {
        hoverSetSpecificMode = request.enabled;
        hoverSetNumber = request.setNumber ? request.setNumber.toLowerCase() : '';
        console.log('Hover set-specific mode updated:', hoverSetSpecificMode ? 'enabled' : 'disabled', 'Set:', hoverSetNumber);
        
        sendResponse({ success: true });
    }
});

// Check initial hover setting on load
chrome.storage.sync.get(['hoverEnabled', 'hoverSetSpecific', 'hoverSetNumber'], (result) => {
    hoverEnabled = result.hoverEnabled !== false; // Default to true
    hoverSetSpecificMode = result.hoverSetSpecific || false;
    hoverSetNumber = result.hoverSetNumber ? result.hoverSetNumber.toLowerCase() : '';
    console.log('Initial hover settings:', {
        enabled: hoverEnabled ? 'enabled' : 'disabled',
        setSpecific: hoverSetSpecificMode ? 'enabled' : 'disabled',
        setNumber: hoverSetNumber
    });
});

// Parse text to extract card information (Task 9)
function parseHoverText(text) {
    // Clean the text
    const cleanText = text.replace(/\s+/g, ' ').trim();
    console.log('🔍 Parsing hover text:', cleanText);
    console.log('🎯 Hover set-specific mode:', hoverSetSpecificMode ? 'enabled' : 'disabled', 'Set:', hoverSetNumber);
    
    // NEW: Handle hover set-specific mode
    if (hoverSetSpecificMode && hoverSetNumber) {
        console.log('🔧 Using hover set-specific mode for set:', hoverSetNumber);
        
        // In set-specific mode, prioritize card number detection
        const cardNumberMatch = cleanText.match(/\b(\d+)\b/);
        if (cardNumberMatch) {
            const cardNumber = parseInt(cardNumberMatch[1]).toString(); // Remove leading zeros
            console.log('✅ Set-specific hover - Card number found:', cardNumber, 'in set:', hoverSetNumber);
            return {
                set_number: hoverSetNumber,
                card_number: cardNumber,
                name: null,
                original: cleanText,
                search_mode: 'hover_set_specific'
            };
        }
        
        // If no card number, try to extract a card name for set-specific search
        const nameMatch = cleanText.match(/\b([a-zA-Z][a-zA-Z\s']*[a-zA-Z])\b/);
        if (nameMatch) {
            const cardName = nameMatch[1].toLowerCase();
            console.log('✅ Set-specific hover - Card name found:', cardName, 'in set:', hoverSetNumber);
            return {
                set_number: hoverSetNumber,
                card_number: null,
                name: cardName,
                original: cleanText,
                search_mode: 'hover_set_specific'
            };
        }
        
        console.log('❌ Set-specific hover - No card info found in:', cleanText);
        return null;
    }
    
    // EXISTING: Normal parsing patterns (when not in set-specific mode)
    const patterns = [
        // Pattern 1: Any text ending with SET CARDNUM/TOTAL (like "Team Rocket's Wanaider AR SV10 099/098" or "AR) Pururi1 (124/086)")
        /([a-zA-Z]+\d+[a-zA-Z]*|[a-zA-Z]{2,})\s+(\d+)\/(\d+)/i,
        // Pattern 2: Name (SET CARDNUM) format (like "Team Rocket's Mewtwo ex (sv10 125)" or "Pururi1 (AR 124)")
        /(.+?)\s*\(([a-zA-Z]+\d+[a-zA-Z]*|[a-zA-Z]{2,})\s+(\d+)\)/i,
        // Pattern 3: SET followed by name (sv1a tropius or AR wartortle)
        /\b([a-zA-Z]+\d+[a-zA-Z]*|[a-zA-Z]{2,})\s+([a-zA-Z][a-zA-Z\s']*[a-zA-Z])\b/i,
        // Pattern 4: Name followed by SET (tropius sv1a or wartortle AR)  
        /\b([a-zA-Z][a-zA-Z\s']*[a-zA-Z])\s+([a-zA-Z]+\d+[a-zA-Z]*|[a-zA-Z]{2,})\b/i,
        // Pattern 5: Just SET CODE extraction from any text (sv1a, AR, BW, etc.)
        /\b([a-zA-Z]+\d+[a-zA-Z]*|[a-zA-Z]{2,})\b/i,
        // Pattern 6: Card number followed by card name (171 wartortle)
        /\b(\d+)\s+([a-zA-Z][a-zA-Z\s']*[a-zA-Z])\b/i,
        // Pattern 7: Card name followed by card number (wartortle 171)
        /\b([a-zA-Z][a-zA-Z\s']*[a-zA-Z])\s+(\d+)\b/i
    ];
    
    for (let i = 0; i < patterns.length; i++) {
        const pattern = patterns[i];
        const match = cleanText.match(pattern);
        console.log(`🎯 Pattern ${i + 1} test:`, pattern, '→ match:', match);
        
        if (match) {
            let set_number = null;
            let name = null;
            let card_number = null;
            
            if (i === 0) {
                // Pattern 1: "Team Rocket's Wanaider AR SV10 099/098" format
                set_number = match[1].toLowerCase();
                card_number = parseInt(match[2]).toString(); // Remove leading zeros
                // Extract name from everything before the set code
                const beforeSet = cleanText.substring(0, cleanText.indexOf(match[1])).trim();
                if (beforeSet && beforeSet.length > 2) {
                    name = beforeSet.toLowerCase();
                }
                console.log('✅ Pattern 1 - Complex card:', cleanText, '→ set:', set_number, 'card:', card_number, 'name:', name);
                return { set_number, card_number, name, original: cleanText, search_mode: 'hover_normal' };
            } else if (i === 1) {
                // Pattern 2: "Team Rocket's Mewtwo ex (sv10 125)" format
                name = match[1].toLowerCase().trim();
                set_number = match[2].toLowerCase();
                card_number = parseInt(match[3]).toString(); // Remove leading zeros
                console.log('✅ Pattern 2 - Name (Set Card):', cleanText, '→ name:', name, 'set:', set_number, 'card:', card_number);
                return { set_number, card_number, name, original: cleanText, search_mode: 'hover_normal' };
            } else if (i === 2) {
                // sv1a tropius format
                set_number = match[1].toLowerCase();
                name = match[2].toLowerCase();
                console.log('✅ Pattern 3 - Set + Name:', cleanText, '→ set:', set_number, 'name:', name);
                return { set_number, name, card_number: null, original: cleanText, search_mode: 'hover_normal' };
            } else if (i === 3) {
                // tropius sv1a format
                name = match[1].toLowerCase();
                set_number = match[2].toLowerCase();
                console.log('✅ Pattern 4 - Name + Set:', cleanText, '→ name:', name, 'set:', set_number);
                return { set_number, name, card_number: null, original: cleanText, search_mode: 'hover_normal' };
            } else if (i === 4) {
                // Just set code fallback
                set_number = match[1].toLowerCase();
                console.log('✅ Pattern 5 - Set only:', cleanText, '→ set:', set_number);
                return { set_number, name: null, card_number: null, original: cleanText, search_mode: 'hover_normal' };
            } else if (i === 5) {
                // Card number followed by card name
                card_number = parseInt(match[1]).toString(); // Remove leading zeros
                name = match[2];
                console.log('✅ Pattern 6 - Card number followed by card name:', cleanText, '→ card:', card_number, 'name:', name);
                return { set_number: null, card_number, name, original: cleanText, search_mode: 'hover_normal' };
            } else if (i === 6) {
                // Card name followed by card number
                name = match[1];
                card_number = parseInt(match[2]).toString(); // Remove leading zeros
                console.log('✅ Pattern 7 - Card name followed by card number:', cleanText, '→ name:', name, 'card:', card_number);
                return { set_number: null, card_number, name, original: cleanText, search_mode: 'hover_normal' };
            }
        }
    }
    
    console.log('❌ No card info found in:', cleanText);
    return null; // No card info found
}

// Query Supabase for card prices (Task 10)
async function queryCardPrices(cardInfo) {
    try {
        console.log('Querying prices for hover card:', cardInfo);
        
        const response = await new Promise((resolve) => {
            chrome.runtime.sendMessage(
                { action: 'querySupabase', cards: [cardInfo] }, 
                resolve
            );
        });
        
        if (response && response.success && response.data.length > 0) {
            const result = response.data[0];
            if (result.supabase_data && result.supabase_data.length > 0) {
                console.log('Hover prices found:', result.supabase_data);
                return result.supabase_data;
            }
        }
        
        console.log('No prices found for hover card');
        return null;
    } catch (error) {
        console.error('Error querying hover card prices:', error);
        return null;
    }
}

// Create and show tooltip with price data (Task 11)
function showPriceTooltip(element, priceData, cardInfo) {
    // Remove existing tooltip
    hideTooltip();
    
    // Use first price result (in case multiple cards match)
    const data = priceData[0];
    
    // Add indicator for set-specific mode
    const setSpecificIndicator = cardInfo.search_mode === 'hover_set_specific' 
        ? '<span style="color: #ff9800; font-size: 10px; font-weight: bold;">[HOVER SET-SPECIFIC]</span><br>' 
        : '';
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'card-price-tooltip';
    tooltip.innerHTML = `
        <div class="card-price-tooltip-header">
            ${setSpecificIndicator}${data.name || cardInfo.name || 'Card'} (${(data.set_number || cardInfo.set_number || '').toUpperCase()})
        </div>
        <div class="card-price-tooltip-prices">
            <span class="card-price-tooltip-label">Min:</span>
            <span class="card-price-tooltip-value min">€${parseFloat(data.min_price || 0).toFixed(2)}</span>
            <span class="card-price-tooltip-label">Avg:</span>
            <span class="card-price-tooltip-value avg">€${parseFloat(data.avg_price || 0).toFixed(2)}</span>
            <span class="card-price-tooltip-label">Max:</span>
            <span class="card-price-tooltip-value max">€${parseFloat(data.max_price || 0).toFixed(2)}</span>
        </div>
        <div class="card-price-tooltip-footer">
            Card Price Lookup
        </div>
    `;
    
    // Position tooltip
    document.body.appendChild(tooltip);
    currentTooltip = tooltip;
    
    // Get element position
    const rect = element.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    
    // Calculate position (try to show above, fall back to below)
    let top = rect.top - tooltipRect.height - 10;
    let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
    
    // Adjust if tooltip would go off screen
    if (top < 10) {
        top = rect.bottom + 10;
        tooltip.classList.add('top');
    } else {
        tooltip.classList.add('bottom');
    }
    
    if (left < 10) {
        left = 10;
    } else if (left + tooltipRect.width > window.innerWidth - 10) {
        left = window.innerWidth - tooltipRect.width - 10;
    }
    
    // Set position
    tooltip.style.left = left + window.scrollX + 'px';
    tooltip.style.top = top + window.scrollY + 'px';
    
    // Show tooltip with animation
    setTimeout(() => {
        tooltip.classList.add('show');
    }, 10);
    
    const modeText = cardInfo.search_mode === 'hover_set_specific' ? ' (set-specific mode)' : '';
    console.log('Tooltip shown for:', data.name || cardInfo.name, modeText);
}

// Hide tooltip
function hideTooltip() {
    if (currentTooltip) {
        currentTooltip.remove();
        currentTooltip = null;
    }
}

// Add mouseover event listener to detect hover (Task 8)
document.addEventListener('mouseover', function(event) {
    // Skip if hover detection is disabled (Task 12)
    if (!hoverEnabled) {
        console.log('🚫 Hover detection is disabled');
        return;
    }
    
    const element = event.target;
    console.log('👆 Mouse over element:', element.tagName, element.className);
    
    // Skip if same element or if we're hovering too fast
    if (element === lastHoveredElement) {
        console.log('⏭️ Same element as before, skipping');
        return;
    }
    
    // Clear previous timeout and hide tooltip
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
    }
    hideTooltip();
    
    // Set new timeout to avoid spam
    hoverTimeout = setTimeout(async () => {
        console.log('⏰ Timeout triggered for element:', element.tagName);
        lastHoveredElement = element;
        
        // Get text content from element
        let textContent = '';
        
        // Try different ways to get meaningful text
        if (element.textContent && element.textContent.trim()) {
            textContent = element.textContent.trim();
            console.log('📝 Got textContent:', textContent.substring(0, 100) + '...');
        } else if (element.innerText && element.innerText.trim()) {
            textContent = element.innerText.trim();
            console.log('📝 Got innerText:', textContent.substring(0, 100) + '...');
        } else if (element.title) {
            textContent = element.title.trim();
            console.log('📝 Got title:', textContent);
        } else if (element.alt) {
            textContent = element.alt.trim();
            console.log('📝 Got alt:', textContent);
        }
        
        console.log('📊 Text length:', textContent.length, 'Text preview:', textContent.substring(0, 50));
        
        // Only process if we have text and it's not too long
        if (textContent && textContent.length > 2 && textContent.length < 200) {
            console.log('✅ Processing hover text:', textContent.substring(0, 100));
            
            // Task 9: Parse this text for card information
            const cardInfo = parseHoverText(textContent);
            if (cardInfo) {
                console.log('🎯 Card info extracted:', cardInfo);
                
                // Task 10: Query Supabase with this card info
                console.log('🔍 About to query prices...');
                const priceData = await queryCardPrices(cardInfo);
                if (priceData) {
                    console.log('💰 Price data received, showing tooltip...');
                    // Task 11: Show tooltip with price data
                    showPriceTooltip(element, priceData, cardInfo);
                } else {
                    console.log('❌ No price data received');
                }
            } else {
                console.log('❌ No card info could be parsed from text');
            }
        } else {
            if (!textContent) {
                console.log('❌ No text content found');
            } else if (textContent.length <= 2) {
                console.log('❌ Text too short:', textContent);
            } else {
                console.log('❌ Text too long:', textContent.length, 'chars');
            }
        }
    }, 300); // Increased delay to prevent spam
    
}, false);

// Clean up on mouseout
document.addEventListener('mouseout', function(event) {
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
        hoverTimeout = null;
    }
    
    // Hide tooltip when moving away from element
    const relatedTarget = event.relatedTarget;
    if (!relatedTarget || (!relatedTarget.classList || !relatedTarget.classList.contains('card-price-tooltip'))) {
        setTimeout(hideTooltip, 100);
    }
}, false);

console.log('Hover detection activated - hover over card text to see prices');
