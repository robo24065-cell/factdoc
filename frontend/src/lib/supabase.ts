import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string

// 공개(publishable) 키만 프론트에서 사용. secret 키는 절대 여기서 쓰지 않음.
export const supabase = createClient(url, key)
