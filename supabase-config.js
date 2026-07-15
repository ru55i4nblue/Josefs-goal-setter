/* ============================================================
   Supabase configuration
   ------------------------------------------------------------
   To turn on cloud + realtime sync across desktop and mobile:
     1. Create a free project at https://supabase.com
     2. In the project: Settings → API, copy the Project URL and the
        "anon public" key (the anon key is safe to ship in a client app).
     3. Paste them below and rebuild (update.bat).
     4. Run the SQL in supabase/schema.sql once (SQL Editor → Run).

   Leave these blank to keep the app fully local.
   ============================================================ */
window.SUPABASE_CONFIG = {
  url: 'https://jbrlyvpfornjbkbksbwd.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Impicmx5dnBmb3JuamJrYmtzYndkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIzNjkzMjQsImV4cCI6MjA5Nzk0NTMyNH0.ukCUf4OfzHVnBUiR4tCVFhWOY3x3PuxGXknoBhuaS38'
};

window.SUPABASE_ENABLED = !!(window.SUPABASE_CONFIG.url && window.SUPABASE_CONFIG.anonKey);
