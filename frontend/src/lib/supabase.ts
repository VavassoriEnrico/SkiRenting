import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();

// Senza configurazione mostriamo istruzioni nel login, senza interrompere l'app.
export const supabase = url && key ? createClient(url, key) : null;
