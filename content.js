// Content script for hover detection on websites
console.log('🚀 Card Price Lookup - Content script loaded [VERSION 2.1 - HOVER DEBUG]');

// Track hover state to prevent spam
let lastHoveredElement = null;
let hoverTimeout = null;
let currentTooltip = null;
let hoverEnabled = true; // Default enabled (Task 12)

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
});

// Check initial hover setting on load
chrome.storage.sync.get(['hoverEnabled'], (result) => {
    hoverEnabled = result.hoverEnabled !== false; // Default to true
    console.log('Initial hover setting:', hoverEnabled ? 'enabled' : 'disabled');
});

// Parse text to extract card information (Task 9)
function parseHoverText(text) {
    // Clean the text
    const cleanText = text.replace(/\s+/g, ' ').trim();
    console.log('🔍 Parsing hover text:', cleanText);
    
    let foundSetCode = null;
    let foundCardNumber = null;
    let foundCardType = null;
    
    // 1. SCAN FOR SET CODES (sv1, sv10, sv2a, s12a, xy1, bw1, etc.)
    const setCodeRegex = /\b([a-zA-Z]{1,4}\d{1,3}[a-zA-Z]{0,2})\b/gi;
    const setMatches = cleanText.match(setCodeRegex);
    if (setMatches && setMatches.length > 0) {
        // Take the first set code found
        foundSetCode = setMatches[0].toLowerCase();
        console.log('🎯 Found set code:', foundSetCode);
    }
    
    // 2. SCAN FOR CARD NUMBERS (usually 1-3 digits, sometimes with leading zeros)
    const cardNumberRegex = /\b(\d{1,3})\b/g;
    const numberMatches = [];
    let match;
    while ((match = cardNumberRegex.exec(cleanText)) !== null) {
        const num = match[1];
        // Filter out years, very large numbers, etc.
        if (num.length <= 3 && parseInt(num) <= 999) {
            numberMatches.push(num);
        }
    }
    
    // Special handling for "NUMBER/TOTAL" format (like "100/098")
    const cardNumberSlashPattern = /\b(\d{1,3})\/(\d{1,3})\b/;
    const slashMatch = cleanText.match(cardNumberSlashPattern);
    if (slashMatch) {
        // In "100/098" format, the first number (100) is the card number
        foundCardNumber = slashMatch[1];
        console.log('🎯 Found card number from slash format:', foundCardNumber, '(from', slashMatch[0] + ')');
    } else if (numberMatches.length > 0) {
        // Prefer 3-digit numbers (with leading zeros), then largest number
        foundCardNumber = numberMatches.reduce((best, current) => {
            if (current.length === 3) return current; // Prefer 3-digit
            if (best.length === 3) return best;
            return parseInt(current) > parseInt(best) ? current : best;
        });
        console.log('🎯 Found card number:', foundCardNumber, '(from options:', numberMatches.join(', ') + ')');
    }
    
    // 3. SCAN FOR CARD TYPES/RARITIES (ar, sar, sr, chr, ur, rr, hr, rainbow, promo)
    const cardTypeRegex = /\b(sar|sr|ar|chr|ur|rr|hr|rainbow|rainbow\s*r|promo)\b/gi;
    const typeMatches = cleanText.match(cardTypeRegex);
    if (typeMatches && typeMatches.length > 0) {
        // Clean up the type (remove spaces, lowercase)
        foundCardType = typeMatches[0].replace(/\s+/g, ' ').trim().toLowerCase();
        if (foundCardType === 'rainbow r') foundCardType = 'rainbow r'; // Keep space for this one
        console.log('🎯 Found card type:', foundCardType);
    }
    
    // 4. BUILD SEARCH QUERY FROM FOUND COMPONENTS
    if (foundSetCode || foundCardNumber || foundCardType) {
        const result = {
            set_number: foundSetCode,
            name: null, // We ignore names because they can be translated
            card_number: foundCardNumber,
            card_type: foundCardType,
            original: cleanText
        };
        
        console.log('✅ Extracted card info:', result);
        console.log(`🔍 Will search with: Set="${foundSetCode || 'any'}", Number="${foundCardNumber || 'any'}", Type="${foundCardType || 'any'}"`);
        return result;
    }
    
    console.log('❌ No card components found in:', cleanText);
    return null; // No card info found
}

// Query Supabase for card prices (Task 10)
async function queryCardPrices(cardInfo) {
    try {
        console.log('🔍 Querying prices for hover card:', cardInfo);
        
        const response = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Hover query timeout'));
            }, 10000);
            
            chrome.runtime.sendMessage(
                { action: 'searchCards', query: cardInfo }, 
                (response) => {
                    clearTimeout(timeout);
                    
                    if (chrome.runtime.lastError) {
                        console.error('❌ Chrome runtime error in hover:', chrome.runtime.lastError);
                        reject(new Error(chrome.runtime.lastError.message));
                        return;
                    }
                    
                    console.log('📨 Hover response received:', response);
                    console.log('📨 Response.data type:', typeof response.data, 'Length:', response.data?.length);
                    if (response.data && response.data.length > 0) {
                        console.log('📨 First item in response.data:', response.data[0]);
                    }
                    resolve(response);
                }
            );
        });
        
        if (response && response.success && response.data && response.data.length > 0) {
            // New searchCards action returns data directly
            console.log('💰 Hover prices found:', response.data.length, 'results');
            return response.data;
        }
        
        console.log('❌ No prices found for hover card');
        return null;
    } catch (error) {
        console.error('❌ Error querying hover card prices:', error);
        return null;
    }
}

// Create and show tooltip with price data (Task 11)
function showPriceTooltip(element, priceData, cardInfo) {
    // Remove existing tooltip
    hideTooltip();
    
    // Use first price result (in case multiple cards match)
    const data = priceData[0];
    
    console.log('💡 Creating tooltip for:', data);
    
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.className = 'card-price-tooltip';
    tooltip.innerHTML = `
        <div class="card-price-tooltip-header">
            ${data.name || cardInfo.name || 'Card'} (${(data.set_number || cardInfo.set_number || '').toUpperCase()})
            ${data.card_type ? ' - ' + data.card_type.toUpperCase() : ''}
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
    
    console.log('✅ Tooltip shown for:', data.name || cardInfo.name);
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
        return;
    }
    
    const element = event.target;
    
    // Skip if same element or if we're hovering too fast
    if (element === lastHoveredElement) {
        return;
    }
    
    // Clear previous timeout and hide tooltip
    if (hoverTimeout) {
        clearTimeout(hoverTimeout);
    }
    hideTooltip();
    
    // Set new timeout to avoid spam
    hoverTimeout = setTimeout(async () => {
        console.log('👆 Hover triggered on:', element.tagName, element.className || '(no class)');
        lastHoveredElement = element;
        
        // Get text content from element
        let textContent = '';
        
        // Try different ways to get meaningful text
        if (element.textContent && element.textContent.trim()) {
            textContent = element.textContent.trim();
        } else if (element.innerText && element.innerText.trim()) {
            textContent = element.innerText.trim();
        } else if (element.title) {
            textContent = element.title.trim();
        } else if (element.alt) {
            textContent = element.alt.trim();
        }
        
        // Only process if we have text and it's not too long
        if (textContent && textContent.length > 2 && textContent.length < 200) {
            console.log('📝 Processing hover text:', textContent.substring(0, 100));
            
            // Task 9: Parse this text for card information
            const cardInfo = parseHoverText(textContent);
            if (cardInfo) {
                console.log('🎯 Card info extracted:', cardInfo);
                
                // Task 10: Query Supabase with this card info
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
        }
    }, 500); // Increased delay to prevent spam
    
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

console.log('🎯 Hover detection activated - hover over card text to see prices');
