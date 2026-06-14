import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

// 공개(publishable) 키만 프론트에서 사용. 환경변수가 없으면 null → 앱은 로컬 모드로 동작.
export const supabase = url && key ? createClient(url, key) : null
