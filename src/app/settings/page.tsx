'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Agent } from '@atproto/api'
import { restoreSession, signOut, COLLECTION, SETTINGS_COLLECTION, LIST_COLLECTION, FOLLOW_COLLECTION } from '@/lib/atproto'
import { GameRef, IgdbGame } from '@/types'
import { formatIgdbGame } from '@/lib/igdb'
import { resolvePds, extractCid, blobUrl } from '@/lib/appview-fetch'

type FormattedGame = IgdbGame & { coverUrl?: string }

interface Settings {
  displayName?: string
  pronouns?: string
  profileView?: 'list' | 'grid'
  avatarBlob?: unknown
  bannerBlob?: unknown
  favouriteGame?: GameRef
  blogPublicationUri?: string
  blogTag?: string
}

export default function SettingsPage() {
  const [session, setSession] = useState<{ agent: Agent; did: string } | null>(null)
  const [pdsUrl, setPdsUrl] = useState('https://bsky.social')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const [pronouns, setPronouns] = useState('')
  const [profileView] = useState<'list' | 'grid'>('grid')
  const [bskyAvatar, setBskyAvatar] = useState<string | null>(null)
  const [bskyDisplayName, setBskyDisplayName] = useState<string | null>(null)
  const [avatarBlob, setAvatarBlob] = useState<unknown>(null)
  const [bannerBlob, setBannerBlob] = useState<unknown>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [bannerPreview, setBannerPreview] = useState<string | null>(null)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [bannerFile, setBannerFile] = useState<File | null>(null)
  const [favouriteGame, setFavouriteGame] = useState<GameRef | null>(null)
  const [blogPublicationUri, setBlogPublicationUri] = useState('')
  const [blogTag, setBlogTag] = useState('')
  const [userBlogs, setUserBlogs] = useState<{ uri: string; name: string }[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [fileError, setFileError] = useState('')
  const [favSearchQuery, setFavSearchQuery] = useState('')
  const [favSearchResults, setFavSearchResults] = useState<FormattedGame[]>([])
  const [favSearchOpen, setFavSearchOpen] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const favSearchRef = useRef<HTMLDivElement>(null)
  const favSearchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    restoreSession().then(async (s) => {
      if (!s) { window.location.href = '/'; return }
      setSession(s)

      const pds = await resolvePds(s.did)
      setPdsUrl(pds)

      let bskyName: string | null = null
      try {
        const profileRes = await fetch(
          `https://public.api.bsky.app/xrpc/app.bsky.actor.getProfile?actor=${encodeURIComponent(s.did)}`
        )
        if (profileRes.ok) {
          const profile = await profileRes.json()
          setBskyAvatar(profile.avatar ?? null)
          bskyName = profile.displayName ?? null
          setBskyDisplayName(bskyName)
        }
      } catch { /* ignore */ }

      try {
        const res = await s.agent.com.atproto.repo.getRecord({
          repo: s.did,
          collection: SETTINGS_COLLECTION,
          rkey: 'self',
        })
        const value = res.data.value as Settings
        setDisplayName(value.displayName ?? bskyName ?? '')
        setPronouns(value.pronouns ?? '')
        if (value.avatarBlob) setAvatarBlob(value.avatarBlob)
        if (value.bannerBlob) setBannerBlob(value.bannerBlob)
        if (value.favouriteGame) setFavouriteGame(value.favouriteGame)
        if (value.blogPublicationUri) setBlogPublicationUri(value.blogPublicationUri)
        if (value.blogTag) setBlogTag(value.blogTag)
      } catch { if (bskyName) setDisplayName(bskyName) }

      // Fetch user's blogs (site.standard.publication)
      try {
        const blogsRes = await s.agent.com.atproto.repo.listRecords({
          repo: s.did,
          collection: 'site.standard.publication',
          limit: 100,
        })
        const list = (blogsRes.data.records ?? []).map((r: any) => ({
          uri: r.uri,
          name: r.value?.name || r.value?.title || 'Untitled Blog',
        }))
        setUserBlogs(list)
      } catch (e) {
        console.error('Failed to list publications:', e)
      }

      setLoading(false)
    }).catch(() => { window.location.href = '/' })
  }, [])

  useEffect(() => {
    if (favSearchTimeout.current) clearTimeout(favSearchTimeout.current)
    if (favSearchQuery.length < 2) { setFavSearchResults([]); setFavSearchOpen(false); return }
    favSearchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/igdb/search?q=${encodeURIComponent(favSearchQuery)}`)
        const data = await res.json()
        setFavSearchResults((data.games ?? []).map(formatIgdbGame))
        setFavSearchOpen(true)
      } catch { setFavSearchResults([]) }
    }, 400)
  }, [favSearchQuery])

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (favSearchRef.current && !favSearchRef.current.contains(e.target as Node)) {
        setFavSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [])

  function pickFile(type: 'avatar' | 'banner', file: File) {
    const MAX_SIZE = 5 * 1024 * 1024
    const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (file.size > MAX_SIZE) { setFileError('Image must be under 5 MB.'); return }
    if (!ALLOWED.includes(file.type)) { setFileError('Only JPEG, PNG, WebP, or GIF images are allowed.'); return }
    setFileError('')
    const preview = URL.createObjectURL(file)
    if (type === 'avatar') { setAvatarFile(file); setAvatarPreview(preview) }
    else { setBannerFile(file); setBannerPreview(preview) }
  }

  async function uploadBlob(file: File): Promise<unknown> {
    const ab = await file.arrayBuffer()
    const res = await session!.agent.uploadBlob(new Uint8Array(ab), { encoding: file.type })
    return res.data.blob
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!session) return
    setSaving(true)
    setSaved(false)
    try {
      let newAvatarBlob = avatarBlob
      let newBannerBlob = bannerBlob
      if (avatarFile) newAvatarBlob = await uploadBlob(avatarFile)
      if (bannerFile) newBannerBlob = await uploadBlob(bannerFile)

      const record: Settings & { $type: string } = {
        $type: SETTINGS_COLLECTION,
        profileView,
...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(pronouns ? { pronouns } : {}),
        ...(newAvatarBlob ? { avatarBlob: newAvatarBlob } : {}),
        ...(newBannerBlob ? { bannerBlob: newBannerBlob } : {}),
        ...(favouriteGame ? { favouriteGame } : {}),
        ...(blogPublicationUri ? { blogPublicationUri } : {}),
        ...(blogTag.trim() ? { blogTag: blogTag.trim() } : {}),
      }
      await session.agent.com.atproto.repo.putRecord({
        repo: session.did,
        collection: SETTINGS_COLLECTION,
        rkey: 'self',
        record: record as unknown as Record<string, unknown>,
      })
      if (newAvatarBlob) setAvatarBlob(newAvatarBlob)
      if (newBannerBlob) setBannerBlob(newBannerBlob)
      setAvatarFile(null)
      setBannerFile(null)
      setSaved(true)
    } catch (err) {
      console.error('Failed to save settings:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteData() {
    if (!session) return
    setDeleting(true)
    setDeleteError('')
    try {
      const { agent, did } = session
      for (const collection of [COLLECTION, LIST_COLLECTION, FOLLOW_COLLECTION, SETTINGS_COLLECTION]) {
        let cursor: string | undefined
        do {
          const res = await agent.com.atproto.repo.listRecords({ repo: did, collection, limit: 100, cursor })
          await Promise.all(
            res.data.records.map((r) =>
              agent.com.atproto.repo.deleteRecord({ repo: did, collection, rkey: r.uri.split('/').pop()! })
            )
          )
          cursor = res.data.cursor
        } while (cursor)
      }
      await signOut(did)
      window.location.href = '/'
    } catch (err: any) {
      setDeleteError(err?.message ?? 'Something went wrong. Some records may not have been deleted.')
      setDeleting(false)
    }
  }

  if (loading) return <main style={{ flex: 1 }} />

  const currentAvatar = avatarPreview ?? (avatarBlob ? blobUrl(pdsUrl, session!.did, avatarBlob) : bskyAvatar)
  const currentBanner = bannerPreview ?? (bannerBlob ? blobUrl(pdsUrl, session!.did, bannerBlob) : null)

  return (
    <>
      <main>
        <div className="container page-top">
          <h1 className="browse-section-title">Settings</h1>

          <div style={{ maxWidth: 480 }}>
            <form onSubmit={handleSave}>

            <h2 className="faq-section-heading">Profile</h2>
            <p className="faq-answer" style={{ marginBottom: 16 }}>
              Adjust the look and feel of your public profile. By default, we'll use the avatar and display name from your Atmosphere Account.
            </p>

              {/* Avatar */}
              <div className="form-field">
                <label>Avatar</label>
                <div className="settings-avatar-wrap">
                  {currentAvatar
                    ? <div style={{ width: 80, height: 80, borderRadius: '50%', border: '2px solid var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                        <img src={currentAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                      </div>
                    : <div style={{ width: 80, height: 80, border: '1px solid var(--border)', background: 'var(--tertiary)', borderRadius: '50%' }} />
                  }
                  <button type="button" className="browse-card-action" onClick={() => avatarInputRef.current?.click()}>
                    <Upload size={16} strokeWidth={2} />
                    <span>Upload</span>
                  </button>
                </div>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files?.[0] && pickFile('avatar', e.target.files[0])}
                />
              </div>

              {/* Display name */}
              <div className="form-field">
                <label>Display name</label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  type="text"
                  placeholder="Your name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={64}
                />
              </div>
              
              {/* Pronouns */}
              <div className="form-field">
                <label>Pronouns</label>
                <input
                  className="input"
                  style={{ width: '100%' }}
                  type="text"
                  placeholder="e.g. they/them"
                  value={pronouns}
                  onChange={(e) => setPronouns(e.target.value)}
                  maxLength={40}
                />
              </div>

              {/* Banner */}
              <div className="form-field">
                <label>Profile banner</label>
                <span className="settings-subtext">2400 x 760 for best results</span>
                <div
                  className="settings-banner-preview"
                  style={currentBanner ? { backgroundImage: `url(${currentBanner})` } : undefined}
                >
                  <button type="button" className="browse-card-action" onClick={() => bannerInputRef.current?.click()}>
                    <Upload size={18} strokeWidth={2} />
                    <span>Upload</span>
                  </button>
                </div>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => e.target.files?.[0] && pickFile('banner', e.target.files[0])}
                />
              </div>

              {/* Blog Settings Section */}
              <div>
                <h2 className="faq-section-heading">Posts</h2>
                <p className="faq-answer" style={{ marginBottom: 16 }}>
                  Link a publication from your Atmosphere account to display your latest posts on your profile or link to published reviews.
                </p>

                <div className="form-field">
                  <label>Select publication</label>
                  <select
                    className="input"
                    style={{ width: '100%' }}
                    value={blogPublicationUri}
                    onChange={(e) => setBlogPublicationUri(e.target.value)}
                  >
                    <option value="">— None —</option>
                    {userBlogs.map((b) => (
                      <option key={b.uri} value={b.uri}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field" style={{ marginTop: 16 }}>
                  <label>Filter tag</label>
                  <span className="settings-subtext">Only display posts tagged with this keyword (e.g. "video games")</span>
                  <input
                    className="input"
                    style={{ width: '100%' }}
                    type="text"
                    placeholder="e.g. video games"
                    value={blogTag}
                    onChange={(e) => setBlogTag(e.target.value)}
                    maxLength={50}
                  />
                </div>
              </div>



{fileError && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)', marginTop: 8 }}>{fileError}</p>}

<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {saved && <span style={{ fontSize: 'var(--text-sm)', color: 'var(--accent)' }}>Saved</span>}
              </div>
            </form>
          </div>

          <div style={{ maxWidth: 480, marginTop: 42, paddingTop: 32, borderTop: '2px solid var(--tertiary)' }}>
            <h2 className="faq-section-heading">Danger zone</h2>
            <p className="faq-answer" style={{ marginBottom: 16 }}>
              Permanently delete all your postgame data, including games, lists, follows, and settings. Your Atmosphere Account and other connected apps will not be affected.
            </p>
            {!confirmDelete ? (
              <button
                className="btn btn-ghost"
                style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={() => setConfirmDelete(true)}
              >
                Delete all data
              </button>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>
                  This will delete all your games, lists, follows, and settings. This cannot be undone.
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-ghost"
                    style={{ color: 'var(--danger)', borderColor: 'var(--danger)' }}
                    onClick={handleDeleteData}
                    disabled={deleting}
                  >
                    {deleting ? 'Deleting…' : 'Yes, delete everything'}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => { setConfirmDelete(false); setDeleteError('') }}
                    disabled={deleting}
                  >
                    Cancel
                  </button>
                </div>
                {deleteError && <p style={{ fontSize: 'var(--text-sm)', color: 'var(--danger)' }}>{deleteError}</p>}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
