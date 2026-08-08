// Crea el cliente de Supabase una sola vez, usando la config que expone el backend.
// Otros scripts pueden hacer: const supabase = await window.supabaseClientPromise;
window.supabaseClientPromise = (async () => {
    const res = await fetch('/api/config');
    const { url, anonKey } = await res.json();
    return window.supabase.createClient(url, anonKey);
})();