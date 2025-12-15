import { Handler, schedule } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import stringSimilarity from 'string-similarity';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const parser = new Parser();

const categorizePeril = (text: string): string => {
  const t = text.toLowerCase();
  if (t.includes('quake') || t.includes('seismic')) return 'Earthquake';
  if (t.includes('hurricane') || t.includes('cyclone')) return 'Storm';
  if (t.includes('flood')) return 'Flood';
  if (t.includes('fire')) return 'Wildfire';
  if (t.includes('cyber')) return 'Cyber';
  return 'Other';
};

async function fetchRSS(source: any) {
  try {
    const feed = await parser.parseURL(source.base_url);
    return feed.items.map(item => ({
      title: item.title || 'Untitled',
      url: item.link || '',
      summary: item.contentSnippet?.slice(0, 300) || '',
      published_at: new Date(item.pubDate || new Date()),
      source_id: source.id,
      peril: categorizePeril((item.title || '') + ' ' + (item.contentSnippet || '')),
    }));
  } catch (e) { console.error(e); return []; }
}

async function fetchUSGS(source: any) {
  try {
    const { data } = await axios.get(source.base_url);
    return data.features.map((f: any) => ({
      title: `M${f.properties.mag} Earthquake - ${f.properties.place}`,
      url: f.properties.url,
      summary: `Magnitude ${f.properties.mag} near ${f.properties.place}.`,
      published_at: new Date(f.properties.time),
      source_id: source.id,
      peril: 'Earthquake',
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
      location_text: f.properties.place
    }));
  } catch (e) { console.error(e); return []; }
}

async function fetchHaggieHTML(source: any) {
  try {
    const { data } = await axios.get(source.base_url, { headers: { 'User-Agent': 'Bot/1.0' } });
    const $ = cheerio.load(data);
    const articles: any[] = [];
    $('article, .post').each((i, el) => {
      const title = $(el).find('h2, .title').text().trim();
      const link = $(el).find('a').attr('href');
      if (title && link) {
        articles.push({
          title,
          url: link,
          summary: $(el).text().slice(0, 200).trim(),
          published_at: new Date(),
          source_id: source.id,
          peril: categorizePeril(title)
        });
      }
    });
    return articles;
  } catch (e) { console.error(e); return []; }
}

const ingestParams: Handler = async (event) => {
  const sources = await supabase.from('sources').select('*').eq('enabled', true);
  if (sources.error) return { statusCode: 500, body: 'DB Error' };

  let count = 0;
  for (const source of sources.data) {
    let articles: any[] = [];
    if (source.type === 'rss') articles = await fetchRSS(source);
    else if (source.type === 'json_api') articles = await fetchUSGS(source);
    else if (source.type === 'html') articles = await fetchHaggieHTML(source);

    for (const article of articles) {
      const { data: existing } = await supabase.from('articles').select('id').eq('external_url', article.url).single();
      if (existing) continue;

      // Simple dedupe logic
      const recent = await supabase.from('events').select('*').gte('last_updated_at', new Date(Date.now() - 7*24*3600*1000).toISOString());
      let eventId = null;

      if (recent.data) {
          const normTitle = article.title.toLowerCase().replace(/[^\w]/g, '');
          for (const ev of recent.data) {
              const evTitle = ev.canonical_title.toLowerCase().replace(/[^\w]/g, '');
              if (stringSimilarity.compareTwoStrings(normTitle, evTitle) > 0.65 && ev.peril === article.peril) {
                  eventId = ev.id;
                  break;
              }
          }
      }

      if (!eventId) {
        const { data: newEv } = await supabase.from('events').insert({
          canonical_title: article.title,
          peril: article.peril,
          location_text: article.location_text,
          lat: article.lat,
          lng: article.lng,
          event_key: `${article.peril}-${Date.now()}-${Math.random()}`,
          last_updated_at: article.published_at
        }).select().single();
        eventId = newEv?.id;
      } else {
          await supabase.from('events').update({ last_updated_at: article.published_at }).eq('id', eventId);
      }

      if (eventId) {
          await supabase.from('articles').insert({ ...article, event_id: eventId });
          count++;
      }
    }
  }
  return { statusCode: 200, body: JSON.stringify({ count }) };
};

export const handler = schedule('0 * * * *', ingestParams);
