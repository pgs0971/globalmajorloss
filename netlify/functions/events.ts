import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

export const handler: Handler = async (event) => {
  const { limit = '100', search } = event.queryStringParameters || {};
  let query = supabase.from('events').select('*, articles(*)').order('last_updated_at', { ascending: false }).limit(parseInt(limit));

  if (search) query = query.ilike('canonical_title', `%${search}%`);

  const { data, error } = await query;
  if (error) return { statusCode: 500, body: JSON.stringify(error) };

  return {
    statusCode: 200,
    body: JSON.stringify(data)
  };
};
