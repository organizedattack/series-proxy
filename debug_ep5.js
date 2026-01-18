const axios = require('axios');
const cheerio = require('cheerio');

async function debugEpisode(url) {
    try {
        console.log(`Analyzing: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        
        console.log('\n--- Searching for player script variants ---');
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && (content.includes('iframe') || content.includes('src=') || content.includes('copyText'))) {
                console.log(`Script ${i} content sample:`, content.trim().substring(0, 300));
                
                // Try to find ANY URL inside an iframe tag within the script
                const iframeMatch = content.match(/src=["']([^"']+)["']/);
                if (iframeMatch) {
                    console.log(`>>> Potential Iframe URL found: ${iframeMatch[1]}`);
                }
            }
        });

        console.log('\n--- Searching for direct iframes ---');
        $('iframe').each((i, el) => {
            console.log(`Iframe ${i} src:`, $(el).attr('src'));
        });
        
    } catch (e) {
        console.error('Debug failed:', e.message);
    }
}

debugEpisode('https://tbg.seriesturcastv.to/la-novia-de-estambul-capitulo-5/');
