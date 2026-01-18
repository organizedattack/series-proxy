const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

async function getM3u8FromIframe(iframeUrl, referer) {
    try {
        console.log(`Fetching iframe: ${iframeUrl}`);
        const response = await axios.get(iframeUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': referer
            },
            timeout: 10000
        });
        
        const $ = cheerio.load(response.data);
        let packedScript = '';
        
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && content.includes('eval(function(p,a,c,k,e,d)')) {
                packedScript = content;
            }
        });

        if (!packedScript) return null;

        const unpack = (p, a, c, k, e, d) => {
            while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
            return p;
        };
        
        const payloadMatch = packedScript.match(/}\('(.+?)',(\d+),(\d+),'([^']+?)'\.split/);
        
        if (payloadMatch) {
            const p = payloadMatch[1];
            const a = parseInt(payloadMatch[2]);
            const c = parseInt(payloadMatch[3]);
            const k = payloadMatch[4].split('|');
            
            const unpacked = unpack(p, a, c, k, 0, {});
            const m3u8Match = unpacked.match(/file:"([^"]+)"/);
            if (m3u8Match) {
                return m3u8Match[1];
            }
        }
        
        return null;

    } catch (e) {
        console.error('Error in getM3u8FromIframe:', e.message);
        return null;
    }
}

function generatePlayerHtml(m3u8Url, currentUrl) {
    let prevUrl = null;
    let nextUrl = null;
    const match = currentUrl.match(/(.*-capitulo-)(\d+)(\/?.*)/);
    if (match) {
        const base = match[1];
        const num = parseInt(match[2]);
        const suffix = match[3];
        if (num > 1) prevUrl = `${base}${num - 1}${suffix}`;
        nextUrl = `${base}${num + 1}${suffix}`;
    }

    return `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { margin:0; background:black; color:white; font-family:-apple-system, system-ui, sans-serif; display:flex; flex-direction:column; align-items:center; height:100vh; overflow: hidden; }
                    .nav { padding: 10px; width: 100%; display: flex; justify-content: center; background: #111; gap: 10px; z-index: 10; box-sizing: border-box; }
                    .nav a { flex: 1; max-width: 150px; background: #00d1b2; color: white; padding: 12px 0; text-decoration: none; border-radius: 8px; text-align: center; font-weight: bold; font-size: 0.9rem; }
                    .nav a.home { max-width: 50px; background: #444; }
                    .video-wrapper { flex: 1; width: 100%; display: flex; align-items: center; justify-content: center; background: black; position: relative; }
                    video { width: 100%; height: auto; max-height: 100%; outline: none; }
                </style>
            </head>
            <body>
                <div class="nav">
                    <a href="/" class="home">🏠</a>
                    ${prevUrl ? `<a href="/video?url=${encodeURIComponent(prevUrl)}">PREV</a>` : '<a style="visibility:hidden"></a>'}
                    ${nextUrl ? `<a href="/video?url=${encodeURIComponent(nextUrl)}">NEXT</a>` : '<a style="visibility:hidden"></a>'}
                </div>
                <div class="video-wrapper">
                    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
                    <video id="video" controls autoplay playsinline></video>
                    <script>
                        var video = document.getElementById('video');
                        var videoSrc = "${m3u8Url}";
                        if (Hls.isSupported()) {
                            var hls = new Hls();
                            hls.loadSource(videoSrc);
                            hls.attachMedia(video);
                        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
                            video.src = videoSrc;
                        }
                    </script>
                </div>
            </body>
        </html>
    `;
}

app.get('/video', async (req, res) => {
    const { url } = req.query;
    
    if (!url) {
        return res.status(400).send('Missing url parameter');
    }

    try {
        console.log(`Fetching episode page: ${url}`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        let iframes = [];
        
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && content.includes('copyText') && content.includes('src="')) {
                const match = content.match(/src="([^"]+)"/);
                if (match && match[1]) {
                     const src = match[1];
                     if (src.includes('esprinahy') || src.includes('5777757775') || src.includes('argtesa') || src.includes('aporodiko')) {
                         iframes.push(src);
                     }
                }
            }
        });

        // Use the first one that works
        for (const src of iframes) {
            const m3u8Url = await getM3u8FromIframe(src, url);
            if (m3u8Url) {
                console.log(`Successfully extracted m3u8 from ${src}`);
                return res.send(generatePlayerHtml(m3u8Url, url));
            }
        }

        return res.status(404).send('Could not find a working video stream');
        
    } catch (e) {
        res.status(500).send('Server Error: ' + e.message);
    }
});

app.get('/', async (req, res) => {
    try {
        const seriesUrl = 'https://tbg.seriesturcastv.to/la-novia-de-estambul';
        console.log(`Fetching series list: ${seriesUrl}`);
        const response = await axios.get(seriesUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(response.data);
        const episodes = [];
        
        $('a').each((i, el) => {
            const href = $(el).attr('href');
            const text = $(el).text().trim();
            if (href && href.includes('capitulo-') && !href.endsWith('/capitulos/')) {
                if (!episodes.find(e => e.url === href)) {
                    episodes.push({ 
                        title: text.replace('La Novia De Estambul – ', '').trim() || href.split('/').filter(Boolean).pop(), 
                        url: href 
                    });
                }
            }
        });

        // Numerical sort (Descending: 301 to 1)
        episodes.sort((a, b) => {
            const numA = parseInt(a.url.match(/capitulo-(\d+)/)?.[1] || 0);
            const numB = parseInt(b.url.match(/capitulo-(\d+)/)?.[1] || 0);
            return numB - numA;
        });

        res.send(`
            <html>
                <head>
                    <title>La Novia de Estambul - Episode List</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <style>
                        body { background: #111; color: white; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; padding: 15px; margin: 0; display: flex; flex-direction: column; align-items: center; }
                        h1 { color: #00d1b2; margin-bottom: 10px; font-size: 1.5rem; text-align: center; }
                        .container { max-width: 1000px; width: 100%; }
                        .paste-box { background: #222; padding: 20px; border-radius: 10px; margin-bottom: 20px; text-align: center; box-shadow: 0 4px 10px rgba(0,0,0,0.3); }
                        .paste-box p { margin-top: 0; font-size: 0.9rem; color: #ccc; }
                        form { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; }
                        input { flex: 1; min-width: 200px; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #1a1a1a; color: white; outline: none; }
                        input:focus { border-color: #00d1b2; }
                        button { padding: 12px 24px; background: #00d1b2; color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: bold; transition: background 0.2s; }
                        button:hover { background: #00b8a9; }
                        
                        .search-container { margin-bottom: 20px; width: 100%; }
                        #episodeSearch { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #222; color: white; box-sizing: border-box; font-size: 1rem; }
                        #episodeSearch:focus { border-color: #00d1b2; outline: none; }

                        h3 { margin-bottom: 15px; font-size: 1.1rem; border-left: 4px solid #00d1b2; padding-left: 10px; }
                        .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; }
                        .episode { background: #222; padding: 12px 5px; text-align: center; border-radius: 8px; text-decoration: none; color: white; font-size: 0.85rem; transition: 0.2s; border: 1px solid #333; }
                        .episode:hover { background: #00d1b2; border-color: #00d1b2; transform: translateY(-2px); }
                        .episode.hidden { display: none; }

                        @media (max-width: 480px) {
                            .grid { grid-template-columns: repeat(3, 1fr); }
                            button { width: 100%; }
                        }
                    </style>
                </head>
                <body>
                    <h1>La Novia de Estambul</h1>
                    
                    <div class="container">
                        <div class="search-container">
                            <input type="text" id="episodeSearch" placeholder="🔍 Search episode number (e.g. 99)..." onkeyup="filterEpisodes()">
                        </div>

                        <h3>Episode List</h3>
                        <div class="grid" id="episodeGrid">
                            ${episodes.map(ep => `
                                <a class="episode" href="/video?url=${encodeURIComponent(ep.url)}" data-title="${ep.title.toLowerCase()}">
                                    ${ep.title.replace('Capitulo ', 'E')}
                                </a>
                            `).join('')}
                        </div>
                    </div>

                    <script>
                        function filterEpisodes() {
                            var input = document.getElementById('episodeSearch');
                            var filter = input.value.toLowerCase();
                            var grid = document.getElementById('episodeGrid');
                            var items = grid.getElementsByClassName('episode');

                            for (var i = 0; i < items.length; i++) {
                                var title = items[i].getAttribute('data-title');
                                if (title.includes(filter)) {
                                    items[i].classList.remove('hidden');
                                } else {
                                    items[i].classList.add('hidden');
                                }
                            }
                        }
                    </script>
                </body>
            </html>
        `);
    } catch (e) {
        res.status(500).send("Error loading episode list: " + e.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Accessible on your network at http://192.168.1.116:${PORT}`);
});
