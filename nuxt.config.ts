// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  app: {
    head: {
      title: 'Poker Planner — Free Planning Poker for Agile & Scrum Teams',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' }],
      htmlAttrs: {
        lang: 'en',
      },
      link: [
        { rel: 'icon', type: 'image/x-icon', href: '/favicon.ico' },
      ],
    },
  },

  ssr: false,

  compatibilityDate: '2025-07-15',

  devtools: { enabled: true },

  modules: ['@nuxtjs/supabase'],

  css: [
    '~/assets/css/sp-tokens.css',
    '~/assets/css/sp-base.css'
  ],

  supabase: {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_ANON_KEY,
    redirect: false,
    redirectOptions: {
      login: '/',
      callback: '/confirm',
      exclude: ['/*'],
    },
  },

  runtimeConfig: {
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    public: {
      supabaseUrl: process.env.SUPABASE_URL,
      supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    },
  },

})
