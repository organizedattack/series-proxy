const axios = require('axios');
const cheerio = require('cheerio');

async function debugIframe(url, referer) {
    try {
        console.log(`Fetching Iframe: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': referer
            }
        });
        
        console.log('Iframe Status:', response.status);
        if (response.data.includes('eval(function(p,a,c,k,e,d)')) {
            console.log('Found packed script!');
        } else {
            console.log('Packed script NOT found. Content sample:');
            console.log(response.data.substring(0, 500));
        }
    } catch (e) {
        console.log('Error:', e.message);
    }
}

debugIframe('https://esprinahy.com/f/pjgjprhupgar.html', 'https://tbg.seriesturcastv.to/');
