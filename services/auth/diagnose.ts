console.log('[DIAGNOSE] Starting network diagnostics...');

export async function diagnoseSupabaseConnection() {
  const url = 'https://qzoknfwfvdqcnbsirwlf.supabase.co';

  console.log('[DIAGNOSE] Testing Supabase connectivity to:', url);

  try {
    const response = await fetch(`${url}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'Accept': 'application/json',
      },
    });
    console.log('[DIAGNOSE] Success! Status:', response.status);
    return { ok: true, status: response.status };
  } catch (error: any) {
    console.error('[DIAGNOSE] Failed:', error.message);
    console.error('[DIAGNOSE] Error type:', error.name);
    console.error('[DIAGNOSE] Error code:', error.code);
    return { ok: false, error: error.message };
  }
}
