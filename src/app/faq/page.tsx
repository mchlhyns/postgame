'use client'

import { ReactNode } from 'react'

type Section = { heading: string; items: { q: string; a: ReactNode }[] }

const sections: Section[] = [
  {
    heading: 'Authentication',
    items: [
      {
        q: 'How do I sign in?',
        a: <>You sign in with your <a href="https://atmosphereaccount.com/" target="_blank">Atmosphere Account</a>. This is the same one you use for Bluesky, Blacksky, Eurosky, or any of the other sites that support the AT Protocol.</>,
      },
    ],
  },
  {
    heading: 'Data & storage',
    items: [
      {
        q: 'Where is my data stored?',
        a: "Your game collection is stored as records in your AT Protocol repository, the same infrastructure that powers sites like Bluesky. This means your data lives on your Personal Data Server (PDS), not on our servers. You own it.",
      },
      {
        q: 'Can I take my data with me?',
        a: 'Yep. Your collection is stored in your PDS. If you ever delete your account or move PDS hosts, your records go with you.',
      },
      {
        q: 'Does postgame store anything on its own servers?',
        a: 'Game metadata (covers, titles, release dates) is fetched from IGDB and cached on our server. No personal data or collection records are stored though, only your PDS holds those.',
      },
      {
        q: 'Can I delete my postgame account?',
        a: <>You bet. Just head over to <a href="/settings">Settings</a> and you'll find the option at the bottom of the page. This will permanently delete all your games, lists, follows, and settings. Your Atmosphere Account won't be affected.</>,
      },
    ],
  },
  {
    heading: 'Privacy',
    items: [
      {
        q: 'Are my games, collections, and lists public?',
        a: 'AT Protocol repositories are public by default, the same way Bluesky posts are. Anyone who knows your DID or handle can look up your collection records directly via the AT Protocol. Like many other apps on the AT Protocol, we show user activity in the Network section of the /community page.',
      },
      {
        q: 'What analytics or tracking does the site use?',
        a: <>We use <a href="https://plausible.io/">Plausible</a> to track basic information like page visits and referrers. No cookies, no personal data.</>,
      },
    ],
  },
  {
    heading: 'Posts',
    items: [
      {
        q: 'How do I show my blog posts on my profile?',
        a: <>postgame integrates with <a href="https://standard.site" target="_blank">Standard Site</a>, a shared publishing standard for the AT Protocol. If you publish on a supported service, go to <a href="/settings">Settings</a> and select your publication under the Posts section. Your latest post will then appear on your profile's overview screen, and you can link individual reviews to specific games in your library.</>,
      },
      {
        q: 'What is Standard Site?',
        a: <>Standard Site provides shared lexicons for long-form publishing on the AT Protocol. Apps that support it include <a href="https://pckt.net" target="_blank">Pckt</a>, <a href="https://leaflet.pub" target="_blank">Leaflet</a>, <a href="https://offprint.pub" target="_blank">Offprint</a>, and WordPress blogs with the Standard Site plugin installed. Learn more at <a href="https://standard.site" target="_blank">standard.site</a>.</>,
      },
      {
        q: 'Can I filter which posts show up?',
        a: 'You can! In Settings under Posts, you can set a filter tag and only posts with that tag will appear on your profile. This is useful if your blog covers multiple topics and you only want to surface gaming related posts.',
      },
    ],
  },
]

export default function FaqPage() {
  return (
    <>
      <main>
        <div className="container page-top">
          <h1 className="browse-section-title">FAQ</h1>

          <div className="faq-section-container">
            {sections.map((section) => (
              <div key={section.heading} className="faq-section">
                <h2 className="faq-section-heading">{section.heading}</h2>
                {section.items.map((item) => (
                  <div key={item.q} className="faq-item">
                    <p className="faq-question">{item.q}</p>
                    <p className="faq-answer">{item.a}</p>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
