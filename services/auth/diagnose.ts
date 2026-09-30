export async function diagnoseSupabaseConnection() {
  const url = 'https://qzoknfwfvdqcnbsirwlf.supabase.co';

  console.log('[DIAGNOSE] Starting network diagnostics...');
  console.log('[DIAGNOSE] Testing Supabase connectivity to:', url);

  try {
    console.log('[DIAGNOSE] Attempting HEAD fetch...');
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      console.log('[DIAGNOSE] Fetch timeout triggered');
      controller.abort();
    }, 5000);

    const response = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const status = response.status;
    console.log('[DIAGNOSE] Fetch successful! Status:', status);
    return { ok: true, status };
  } catch (error: any) {
    console.error('[DIAGNOSE] Fetch failed!');
    console.error('[DIAGNOSE] Error message:', error.message);
    console.error('[DIAGNOSE] Error name:', error.name);
    console.error('[DIAGNOSE] Error code:', error.code);
    console.error('[DIAGNOSE] Error toString:', error.toString());
    return { ok: false, error: error.message };
  }
}
