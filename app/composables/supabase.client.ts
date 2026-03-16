// composables/supabase.client.ts
// Direct Supabase client — bypasses @nuxtjs/supabase's plugin system entirely.
// This avoids redirect middleware and session-check issues on page load.

import { createClient } from '@supabase/supabase-js'
import type { Database } from '~/types/sprintpoint'

let _client: ReturnType<typeof createClient<Database>> | null = null

export function useSupabase() {
  if (!_client) {
    const config = useRuntimeConfig()
    _client = createClient<Database>(
      config.public.supabaseUrl as string,
      config.public.supabaseAnonKey as string,
      {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 20 } },
      }
    )
  }
  return _client
}