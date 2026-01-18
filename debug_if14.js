const axios = require('axios');
const cheerio = require('cheerio');

async function debugIframe(url) {
    try {
        console.log(`Fetching Iframe: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://tbg.seriesturcastv.to/'
            }
        });
        
        console.log('Status:', response.status);
        console.log('Content Sample:', response.data.substring(0, 1000));
        
        if (response.data.includes('eval(function')) {
            console.log('!!! Found Packed Script');
        } else {
            console.log('--- Packed script not found ---');
        }
        
    } catch (e) {
        console.log('Error:', e.message);
    }
}

debugIframe('https://esprinahy.com/f/gratkjdjurrp.html');
