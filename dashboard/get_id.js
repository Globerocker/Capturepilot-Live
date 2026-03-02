const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
(async () => {
  const { data } = await supabase.from('opportunities').select('id, title').limit(1);
  console.log(data[0].id);
})();
