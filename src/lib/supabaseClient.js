import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

function createAuthFallback() {
  const missingMessage =
    "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.";

  const reject = async () => ({ data: null, error: new Error(missingMessage) });

  return {
    auth: {
      getSession: reject,
      getUser: reject,
      signOut: reject,
      signInWithPassword: reject,
      signUp: reject,
      resetPasswordForEmail: reject,
      updateUser: reject,
      refreshSession: reject,
      onAuthStateChange: (callback) => {
        queueMicrotask(() => callback?.("SIGNED_OUT", null));
        return {
          data: {
            subscription: {
              unsubscribe() {}
            }
          }
        };
      }
    },
    from() {
      throw new Error(missingMessage);
    }
  };
}

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars missing. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
  );
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createAuthFallback();
