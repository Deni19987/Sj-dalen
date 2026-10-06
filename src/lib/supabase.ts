import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null = demoläge (ingen databas kopplad, data hålls i minnet). */
export const supabase = url && anonKey ? createClient(url, anonKey) : null;

if (!supabase && import.meta.env.DEV) {
  console.info(
    "[Sjödalen Bilar] VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY saknas – kör i demoläge med lokal data.",
  );
}
