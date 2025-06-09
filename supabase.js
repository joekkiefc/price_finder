// Supabase configuration
const SUPABASE_URL = 'https://buapbvrzrzkholjkzizo.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YXBidnJ6cnpraG9samt6aXpvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDkzMzAxMDAsImV4cCI6MjA2NDkwNjEwMH0.ERMqrikRCz6uHTOA8eUPre_hg3Ymp2rbRHeeKrMkzb0';

// Simple Supabase REST API client for Chrome extensions
const supabase = {
    from: function(table) {
        return {
            select: function(columns = '*') {
                let query = `${SUPABASE_URL}/rest/v1/${table}?select=${columns}`;
                let filters = [];
                
                return {
                    eq: function(column, value) {
                        filters.push(`${column}=eq.${encodeURIComponent(value)}`);
                        return this;
                    },
                    ilike: function(column, value) {
                        filters.push(`${column}=ilike.${encodeURIComponent(value)}`);
                        return this;
                    },
                    then: async function(resolve, reject) {
                        try {
                            const finalQuery = query + (filters.length > 0 ? '&' + filters.join('&') : '');
                            console.log('Supabase query:', finalQuery);
                            
                            const response = await fetch(finalQuery, {
                                headers: {
                                    'apikey': SUPABASE_ANON_KEY,
                                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                                    'Content-Type': 'application/json'
                                }
                            });
                            
                            if (!response.ok) {
                                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                            }
                            
                            const data = await response.json();
                            resolve({ data, error: null });
                        } catch (error) {
                            console.error('Supabase error:', error);
                            resolve({ data: null, error });
                        }
                    }
                };
            }
        };
    }
};

// Initialize function for compatibility
function initSupabase() {
    console.log('Supabase REST client ready');
    return supabase;
}
