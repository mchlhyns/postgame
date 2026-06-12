'use client'

import { ReactNode } from 'react'

type Section = { heading: string; items: { q: string; a: ReactNode }[] }

const sections: Section[] = [
  {
    heading: 'Authentication',
    items: [
      {
        q: 'How do I sign in?',
        a: <>You sign in with your Atmosphere Account. This is the same one you use for Bluesky, Blacksky, Eurosky, or any of the other sites that support the <a href="https://atproto.com/" target="_blank">AT Protocol</a>.</>,
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
        a: <>Yep. Your collection is stored in your PDS. If you ever want to move PDS hosts or export your data, your records go with you. You can use tools like <a href="https://atproto.at/">atproto.at</a> to review or download the information on your PDS, including your games, lists, and settings from postgame.</>,
      },
      {
        q: 'Does postgame store anything on its own servers?',
        a: 'Game metadata (covers, titles, release dates) is fetched from IGDB and cached on our server. No personal data or collection records are stored though, that lives on your PDS.',
      },
      {
        q: 'Can I delete my postgame account?',
        a: <>Yes. Go to <a href="/settings">Settings</a> and you'll find the option at the bottom of the page. This will permanently delete all your games, lists, follows, and settings. Your Atmosphere Account won't be affected.</>,
      },
    ],
  },
  {
    heading: 'Privacy',
    items: [
      {
        q: 'Are my games, collections, and lists public?',
        a: <>AT Protocol repositories are public by default, the same way Bluesky posts are. Anyone who knows your DID or handle can look up your collection records directly via the AT Protocol. Like many other apps on the AT Protocol, we show user activity in the Network section of the <a href="/community">Community</a> page.</>,
      },
      {
        q: 'What analytics or tracking does the site use?',
        a: <>We run a self-hosted <a href="https://plausible.io/">Plausible</a> setup to review basic information like page visits and referrers. No cookies, no personal data.</>,
      },
    ],
  },
  {
    heading: 'Integrations',
    items: [
      {
        q: 'How do I show my blog posts on my profile?',
        a: <>postgame integrates with <a href="https://standard.site" target="_blank">Standard Site</a>, a shared publishing standard for the AT Protocol used by <a href="https://pckt.net" target="_blank">Pckt</a>, <a href="https://leaflet.pub" target="_blank">Leaflet</a>, <a href="https://offprint.pub" target="_blank">Offprint</a>, and WordPress blogs with the Standard Site plugin installed. If your publication is supported, go to <a href="/settings">Settings</a> and select it under the Posts section.</>,
      },
      {
        q: 'Where will my posts appear?',
        a: <>Your latest post will appear on your profile's overview screen and in the "Posts" tab. Once you connect your publication, you'll also have the ability to link individual reviews to specific games in your library. When you are adding/editing a game, this field will appear when you mark a game as played, completed, mastered, or abandoned.</>,
      },
      {
        q: 'How do I filter which posts show up?',
        a: 'In Settings under Posts, you can set a filter tag and only posts with that tag will appear on your profile. This is useful if your blog covers multiple topics and you only want to surface gaming related posts.',
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
