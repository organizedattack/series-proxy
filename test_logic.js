const axios = require('axios');
const cheerio = require('cheerio');

async function testExtraction(url) {
    try {
        console.log(`Step 1: Fetching episode page ${url}`);
        const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(res.data);
        
        let iframeSrc = '';
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && content.includes('iframe')) {
                const match = content.match(/src=["']([^"']+)["']/);
                if (match && match[1]) {
                    const src = match[1];
                    if (src.includes('esprinahy') || src.includes('5777757775')) {
                        iframeSrc = src;
                    }
                }
            }
        });
        
        if (!iframeSrc) {
            console.log('No iframe found in scripts. Checking tags...');
            iframeSrc = $('iframe').attr('src');
        }
        
        console.log(`Step 2: Iframe URL: ${iframeSrc}`);
        
        const res2 = await axios.get(iframeSrc, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': url // Specific episode URL
            }
        });
        
        const html = res2.data;
        const packedMatch = html.match(/eval\(function\(p,a,c,k,e,d\).+?\.split\('\|'\),0,{}\)\)/);
        
        if (!packedMatch) {
            console.log('Step 3 Fail: Packed script not found with regex');
            // Try manual search
            const start = html.indexOf('eval(function(p,a,c,k,e,d)');
            if (start !== -1) {
                console.log('Manual search found it though!');
            }
            return;
        }
        
        const packedScript = packedMatch[0];
        console.log('Step 3: Found Packed Script');
        
        const unpack = (p, a, c, k, e, d) => {
            while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            return p;
        };
        
        const match = packedScript.match(/}\('(.+?)',(\d+),(\d+),'([^']+?)'\.split/);
        if (match) {
            console.log('Step 4: Args parsed');
            const unpacked = unpack(match[1], parseInt(match[2]), parseInt(match[3]), match[4].split('|'), 0, {});
            const m3u8Match = unpacked.match(/file:["']([^"']+)["']/);
            if (m3u8Match) {
                console.log('SUCCESS! M3U8:', m3u8Match[1]);
            } else {
                console.log('Step 4 Fail: M3U8 not found in unpacked code');
                console.log('Unpacked sample:', unpacked.substring(0, 500));
            }
        } else {
            console.log('Step 4 Fail: Could not parse args from packed script');
            console.log('Script sample:', packedScript.substring(packedScript.length - 200));
        }

    } catch (e) {
        console.log('Error:', e.message);
    }
}

testExtraction('https://tbg.seriesturcastv.to/la-novia-de-estambul-capitulo-14/');
