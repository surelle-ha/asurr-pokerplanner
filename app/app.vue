<template>
  <NuxtLayout>
    <h1 class="sr-only">
      Free Planning Poker Tool for Agile Sprint Planning
    </h1>

    <p class="sr-only">
      Asurr SprintPoint is a free online <strong>Planning Poker</strong> tool for
      <strong>Agile Scrum teams</strong> to estimate <strong>story points</strong>
      during <strong>sprint planning</strong>. Collaborate with your team,
      vote using Fibonacci cards, and reach estimation consensus faster.
    </p>

    <NuxtPage />
  </NuxtLayout>
</template>

<script setup lang="ts">

const route = useRoute()

useSeoMeta({
  title: 'Asurr SprintPoint — Free Planning Poker for Agile & Scrum Teams',

  ogTitle: 'Asurr SprintPoint — Free Planning Poker Tool',
  twitterTitle: 'Asurr SprintPoint — Free Planning Poker Tool',

  description:
    'Free Planning Poker tool for Agile and Scrum teams. Estimate story points collaboratively, run sprint planning sessions online, and reach consensus faster.',

  ogDescription:
    'Run Agile sprint planning sessions online with this free Planning Poker tool. Perfect for Scrum teams estimating story points.',

  twitterDescription:
    'Free Planning Poker tool for Agile teams. Estimate story points and run sprint planning sessions online.',

  keywords:
    'planning poker, planning poker online, free planning poker, agile estimation tool, scrum story points, sprint planning tool, fibonacci estimation, agile scrum estimation',

  robots: 'index, follow',

  ogType: 'website',
  ogSiteName: 'Asurr SprintPoint',

  ogImage: 'https://asurr-pokerplanner.vercel.app/og-image.png',
  twitterImage: 'https://asurr-pokerplanner.vercel.app/og-image.png',

  twitterCard: 'summary_large_image'
})

useHead({
  htmlAttrs: {
    lang: 'en'
  },

  link: [
    {
      rel: 'canonical',
      href: `https://asurr-pokerplanner.vercel.app${route.path}`
    }
  ],

  meta: [
    {
      name: 'author',
      content: 'Asurr'
    },
    {
      name: 'theme-color',
      content: '#0a0b14'
    },
    {
      property: 'og:url',
      content: `https://asurr-pokerplanner.vercel.app${route.path}`
    },
    {
      name: 'google-site-verification',
      content: 'nowmjx7GBb0sex2cuV5TIAd7vduccclRSa-B9NyHNf8'
    }
  ]
})

</script>

<style>
*,
*::before,
*::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html,
body {
  margin: 0;
  padding: 0;
  background: #0a0b14;
  overflow-x: hidden;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0,0,0,0);
  border: 0;
}
</style>