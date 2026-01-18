const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
    const url = 'https://tbg.seriesturcastv.to/la-novia-de-estambul';
    const res = await axios.get(url, {headers: {'User-Agent': 'Mozilla/5.0'}});
    const $ = cheerio.load(res.data);
    const links = [];
    $('a').each((i, el) => {
        const href = $(el).attr('href');
        if (href && href.includes('capitulo')) {
            links.push(href);
        }
    });
    console.log(JSON.stringify(links.slice(0, 10), null, 2));
}
check();
