'use client'

import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { relativeTime } from '@/lib/feed'

interface Facet {
  index: { byteStart: number; byteEnd: number }
  features: { $type: string; uri?: string; did?: string; tag?: string }[]
}

interface Post {
  uri: string
  text: string
  facets?: Facet[]
  indexedAt: string
  images?: string[]
  externalThumb?: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function renderRichText(text: string, facets?: Facet[]) {
  if (!facets || facets.length === 0) return text
  const bytes = encoder.encode(text)
  const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart)
  const nodes: React.ReactNode[] = []
  let pos = 0
  for (const facet of sorted) {
    const { byteStart, byteEnd } = facet.index
    if (byteStart < pos) continue
    if (byteStart > pos) nodes.push(decoder.decode(bytes.slice(pos, byteStart)))
    const segment = decoder.decode(bytes.slice(byteStart, byteEnd))
    const feature = facet.features?.[0]
    if (feature?.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
      nodes.push(<a key={byteStart} href={feature.uri} target="_blank" rel="noopener noreferrer" className="game-update-link">{segment}</a>)
    } else if (feature?.$type === 'app.bsky.richtext.facet#tag' && feature.tag) {
      nodes.push(<a key={byteStart} href={`https://bsky.app/hashtag/${encodeURIComponent(feature.tag)}`} target="_blank" rel="noopener noreferrer" className="game-update-link">{segment}</a>)
    } else if (feature?.$type === 'app.bsky.richtext.facet#mention' && feature.did) {
      nodes.push(<a key={byteStart} href={`https://bsky.app/profile/${feature.did}`} target="_blank" rel="noopener noreferrer" className="game-update-link">{segment}</a>)
    } else {
      nodes.push(segment)
    }
    pos = byteEnd
  }
  if (pos < bytes.length) nodes.push(decoder.decode(bytes.slice(pos)))
  return nodes
}

export default function GameBlueskyUpdates({ handle }: { handle: string }) {
  const [posts, setPosts] = useState<Post[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?actor=${encodeURIComponent(handle)}&limit=25&filter=posts_no_replies`)
      .then(r => r.json())
      .then(data => {
        const items: Post[] = (data.feed ?? []).filter((item: any) => {
          if (item.reason) return false
          if (item.post?.record?.reply) return false
          const embedType = item.post?.embed?.$type
          if (embedType === 'app.bsky.embed.record#view') return false
          if (embedType === 'app.bsky.embed.recordWithMedia#view') return false
          return true
        }).map((item: any) => {
          const post = item.post
          const record = post.record
          const embed = post.embed
          let images: string[] | undefined
          let externalThumb: string | undefined
          if (embed?.$type === 'app.bsky.embed.images#view') {
            images = (embed.images ?? []).map((img: any) => img.thumb).filter(Boolean)
          } else if (embed?.$type === 'app.bsky.embed.external#view') {
            externalThumb = embed.external?.thumb
          } else if (embed?.$type === 'app.bsky.embed.recordWithMedia#view') {
            const media = embed.media
            if (media?.$type === 'app.bsky.embed.images#view') {
              images = (media.images ?? []).map((img: any) => img.thumb).filter(Boolean)
            } else if (media?.$type === 'app.bsky.embed.external#view') {
              externalThumb = media.external?.thumb
            }
          }
          return {
            uri: post.uri,
            text: record?.text ?? '',
            facets: record?.facets,
            indexedAt: post.indexedAt,
            images,
            externalThumb,
          }
        }).filter((p: Post) => p.text || p.images?.length)
        setPosts(items)
      })
      .catch(() => {})
  }, [handle])

  function postUrl(uri: string) {
    const rkey = uri.split('/').pop()
    return `https://bsky.app/profile/${handle}/post/${rkey}`
  }

  function scroll(dir: 'left' | 'right') {
    if (!scrollRef.current) return
    const card = scrollRef.current.querySelector('.game-update-card') as HTMLElement | null
    const step = card ? card.offsetWidth + 12 : scrollRef.current.offsetWidth * 0.7
    scrollRef.current.scrollBy({ left: dir === 'left' ? -step : step, behavior: 'smooth' })
  }

  if (posts.length === 0) return null

  return (
    <div className="game-updates">
      <div className="game-updates-header">
        <span className="game-updates-title">Updates</span>
        <div className="game-updates-nav-row">
          <button className="game-updates-nav-btn" onClick={() => scroll('left')} aria-label="Previous">
            <ChevronLeft size={16} />
          </button>
          <button className="game-updates-nav-btn" onClick={() => scroll('right')} aria-label="Next">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
      <div className="game-updates-carousel" ref={scrollRef}>
        {posts.map(post => {
          const thumb = post.images?.[0] ?? post.externalThumb
          return (
            <div key={post.uri} className="game-update-card">
              {thumb && <img src={thumb} alt="" className="game-update-img" />}
              <p className="game-update-text">{renderRichText(post.text, post.facets)}</p>
              <a href={postUrl(post.uri)} target="_blank" rel="noopener noreferrer" className="game-update-time">
                {relativeTime(post.indexedAt)}
              </a>
            </div>
          )
        })}
      </div>
    </div>
  )
}
