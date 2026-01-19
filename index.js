const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3000;

// Helper to unpack Javascript
const unpack = (p, a, c, k, e, d) => {
    while (c--) if (k[c]) p = p.replace(new RegExp('\\b' + c.toString(a) + '\\b', 'g'), k[c]);
    return p;
};

async function getM3u8FromIframe(iframeUrl, referer) {
    try {
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
            if (content && content.includes('eval(function(p,a,c,k,e,d)')) packedScript = content;
        });

        if (!packedScript) return null;

        const payloadMatch = packedScript.match(/}\('(.+?)',(\d+),(\d+),'([^']+?)'\.split/);
        if (payloadMatch) {
            const unpacked = unpack(payloadMatch[1], parseInt(payloadMatch[2]), parseInt(payloadMatch[3]), payloadMatch[4].split('|'), 0, {});
            const m3u8Match = unpacked.match(/file:"([^"]+)"/);
            return m3u8Match ? m3u8Match[1] : null;
        }
        return null;
    } catch (e) { return null; }
}

function generatePlayerHtml(m3u8Url, currentUrl) {
    let prevUrl = null, nextUrl = null;
    const match = currentUrl.match(/(.*-capitulo-)(\d+)(\/?.*)/);
    let currentNum = null;
    if (match) {
        const base = match[1], num = parseInt(match[2]), suffix = match[3];
        currentNum = num;
        if (num > 1) prevUrl = `${base}${num - 1}${suffix}`;
        if (num < 301) nextUrl = `${base}${num + 1}${suffix}`;
    }

    return `
        <html>
            <head>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { margin:0; background:black; color:white; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; height:100vh; overflow: hidden; }
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
                        var currentUrl = "${currentUrl}";
                        var currentNum = ${currentNum !== null ? currentNum : 'null'};
                        try {
                            if (currentUrl) {
                                localStorage.setItem('lastEpisodeUrl', currentUrl);
                            }
                            if (currentNum !== null) {
                                localStorage.setItem('lastEpisodeNum', String(currentNum));
                            }
                            localStorage.setItem('lastEpisodeAt', String(Date.now()));
                        } catch (e) {}
                        var finishThresholdSec = 3;
                        function clearResumeState() {
                            try {
                                localStorage.removeItem('lastEpisodeTimeSec');
                                localStorage.removeItem('lastEpisodeUrl');
                                localStorage.removeItem('lastEpisodeNum');
                                localStorage.removeItem('lastEpisodeAt');
                            } catch (e) {}
                        }
                        function saveResumeTime() {
                            try {
                                if (isFinite(video.duration) && isFinite(video.currentTime) && video.currentTime >= video.duration - finishThresholdSec) {
                                    clearResumeState();
                                    return;
                                }
                                if (isFinite(video.currentTime)) {
                                    localStorage.setItem('lastEpisodeTimeSec', String(Math.floor(video.currentTime)));
                                }
                            } catch (e) {}
                        }
                        try {
                            var lastUrl = localStorage.getItem('lastEpisodeUrl');
                            var lastTime = parseFloat(localStorage.getItem('lastEpisodeTimeSec') || '0');
                            if (lastUrl === currentUrl && lastTime > 5) {
                                video.addEventListener('loadedmetadata', function () {
                                    if (isFinite(video.duration) && lastTime > video.duration - 5) return;
                                    video.currentTime = lastTime;
                                });
                            }
                        } catch (e) {}
                        var lastSaveAt = 0;
                        video.addEventListener('timeupdate', function () {
                            var now = Date.now();
                            if (now - lastSaveAt > 5000) {
                                lastSaveAt = now;
                                saveResumeTime();
                            }
                        });
                        video.addEventListener('ended', function () {
                            clearResumeState();
                        });
                        document.addEventListener('visibilitychange', function () {
                            if (document.hidden) saveResumeTime();
                        });
                        window.addEventListener('beforeunload', saveResumeTime);
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
    if (!url) return res.status(400).send('Missing url');

    try {
        const response = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(response.data);
        let iframes = [];
        
        $('script').each((i, el) => {
            const content = $(el).html();
            if (content && content.includes('copyText') && content.includes('src="')) {
                const match = content.match(/src="([^"]+)"/);
                if (match) iframes.push(match[1]);
            }
        });

        for (const src of iframes) {
            const m3u8Url = await getM3u8FromIframe(src, url);
            if (m3u8Url) return res.send(generatePlayerHtml(m3u8Url, url));
        }
        res.status(404).send('Stream not found. The site might be blocking the server.');
    } catch (e) { res.status(500).send('Error: ' + e.message); }
});

app.get('/', (req, res) => {
    // Generate manual list 301 to 1
    const episodes = [];
    for (let i = 301; i >= 1; i--) {
        episodes.push({
            num: i,
            url: `https://tbg.seriesturcastv.to/la-novia-de-estambul-capitulo-${i}/`
        });
    }

    res.send(`
        <html>
            <head>
                <title>La Novia de Estambul</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    body { background: #111; color: white; font-family: sans-serif; padding: 15px; margin: 0; display: flex; flex-direction: column; align-items: center; }
                    h1 { color: #00d1b2; font-size: 1.5rem; }
                    .container { max-width: 1000px; width: 100%; }
                    #search { width: 100%; padding: 12px; border-radius: 8px; border: 1px solid #333; background: #222; color: white; margin-bottom: 20px; box-sizing: border-box; }
                    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; }
                    .episode { background: #222; padding: 12px 5px; text-align: center; border-radius: 8px; text-decoration: none; color: white; font-size: 0.85rem; border: 1px solid #333; }
                    .episode.resume { border-color: #00d1b2; box-shadow: 0 0 0 1px #00d1b2 inset; }
                    .episode.hidden { display: none; }
                    @media (max-width: 480px) { .grid { grid-template-columns: repeat(3, 1fr); } }
                </style>
            </head>
            <body>
                <h1>La Novia de Estambul</h1>
                <div class="container">
                    <div id="continue" style="display:none; margin-bottom: 15px; padding: 12px; border: 1px solid #333; border-radius: 8px; background: #1a1a1a;">
                        <div style="margin-bottom: 8px;">Continue watching</div>
                        <a id="continueLink" href="#" style="display:inline-block; background:#00d1b2; color:#fff; padding:10px 14px; border-radius:8px; text-decoration:none; font-weight:bold;">Resume</a>
                    </div>
                    <input type="text" id="search" placeholder="🔍 Search episode..." onkeyup="filter()">
                    <div class="grid" id="grid">
                        ${episodes.map(ep => `<a class="episode" href="/video?url=${encodeURIComponent(ep.url)}" data-num="${ep.num}">E${ep.num}</a>`).join('')}
                    </div>
                </div>
                <script>
                    (function () {
                        try {
                            var lastUrl = localStorage.getItem('lastEpisodeUrl');
                            var lastNum = localStorage.getItem('lastEpisodeNum');
                            var lastTime = parseInt(localStorage.getItem('lastEpisodeTimeSec') || '0', 10);
                            function formatTime(totalSeconds) {
                                var s = Math.max(0, totalSeconds || 0);
                                var m = Math.floor(s / 60);
                                var r = s % 60;
                                return m + ":" + (r < 10 ? "0" + r : r);
                            }
                            if (lastUrl) {
                                var c = document.getElementById('continue');
                                var link = document.getElementById('continueLink');
                                link.href = "/video?url=" + encodeURIComponent(lastUrl);
                                if (lastNum) {
                                    link.textContent = "Resume E" + lastNum + (lastTime > 0 ? " at " + formatTime(lastTime) : "");
                                }
                                c.style.display = "block";
                            }
                            if (lastNum) {
                                var el = document.querySelector('.episode[data-num="' + lastNum + '"]');
                                if (el) el.classList.add('resume');
                            }
                        } catch (e) {}
                    })();
                    function filter() {
                        var val = document.getElementById('search').value;
                        var items = document.getElementsByClassName('episode');
                        for (var i = 0; i < items.length; i++) {
                            items[i].classList.toggle('hidden', val && !items[i].getAttribute('data-num').includes(val));
                        }
                    }
                </script>
            </body>
        </html>
    `);
});

app.listen(PORT, '0.0.0.0', () => console.log(`Server on port ${PORT}`));


