// Precisa bater exatamente com o URI de redirecionamento cadastrado no
// cliente OAuth "Argos Calendar" no Google Cloud Console (SOLO-013). Fica em
// arquivo próprio porque tanto api/calendar.ts (authorize) quanto
// api/calendar-callback.ts (troca do código) precisam do mesmo valor.
export const REDIRECT_URI = 'https://argos-blue.vercel.app/api/calendar-callback';
export const NATIVE_REDIRECT = 'argos://integrations/google-calendar/callback';
export const WEB_REDIRECT = 'https://argos-blue.vercel.app/agenda';
