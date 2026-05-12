'use client'

import { useEffect, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Agent } from '@atproto/api'
import { restoreSession, signOut, COLLECTION, SETTINGS_COLLECTION, LIST_COLLECTION, FOLLOW_COLLECTION } from '@/lib/atproto'
import { applyAccent, saveAccent } from '@/components/AccentColorApplier'
import { GameRef, IgdbGame } from '@/types'
import { formatIgdbGame } from '@/lib/igdb'

type FormattedGame = IgdbGame & { coverUrl?: string }

interface Settings {
  displayName?: string
  pronouns?: string
  profileView?: 'list' | 'grid'
  avatarBlob?: unknown
  bannerBlob?: unknown
  favouriteGame?: GameRef
  accentColor?: string
}


const ACCENT_PRESETS = [
  '#10D275', '#3B82F6', '#8B5CF6', '#EC4899',
  '#EF4444', '#F97316', '#EAB308', '#14B8A6',
]

async function resolvePds(did: string): Promise<string> {
  try {
    let url: string
    if (did.startsWith('did:web:')) {
      const host = did.slice('did:web:'.length).split(':')[0]
      if (/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host)) {
        return 'https://bsky.social'
      }
      url = `https://${host}/.well-known/did.json`
    } else {
      url = `https://plc.directory/${did}`
    }
    const res = await fetch(url)
    if (res.ok) {
      const doc = await res.json()
      const pds = doc.service?.find((s: { id: string; serviceEndpoint: string }) => s.id === '#atproto_pds')
      if (pds?.serviceEndpoint) return pds.serviceEndpoint
    }
  } catch { /* fall back */ }
  return 'https://bsky.social'
}

function extractCid(ref: unknown): string | null {
  if (!ref) return null
  // Plain ATProto JSON: { $link: '...' }
  if (typeof (ref as any)['$link'] === 'string') return (ref as any)['$link']
  // DAG-JSON: { '/': '...' }
  if (typeof (ref as any)['/'] === 'string') return (ref as any)['/']
  // CID class instance from @atproto/api
  const s = (ref as any).toString?.()
  if (typeof s === 'string' && s !== '[object Object]') return s
  return null
}

function blobUrl(pdsUrl: string, did: string, blob: unknown): string | null {
  const cid = extractCid((blob as any)?.ref)
  if (!cid) return null
  return `${pdsUrl}/xrpc/com.atproto.sync.getBlob?did=${encodeURIComponent(did)}&cid=${encodeURIComponent(cid)}`
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
  const [accentColor, setAccentColor] = useState('#10D275')
  const [favouriteGame, setFavouriteGame] = useState<GameRef | null>(null)
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
        if (value.accentColor) {
          setAccentColor(value.accentColor)
          applyAccent(value.accentColor)
          saveAccent(value.accentColor)
        }
      } catch { if (bskyName) setDisplayName(bskyName) }

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
        accentColor,
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(pronouns ? { pronouns } : {}),
        ...(newAvatarBlob ? { avatarBlob: newAvatarBlob } : {}),
        ...(newBannerBlob ? { bannerBlob: newBannerBlob } : {}),
        ...(favouriteGame ? { favouriteGame } : {}),
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
      saveAccent(accentColor)
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
        <div className="container">
          <div className="page-header" style={{ marginBottom: 24 }}>
            <h1>Settings</h1>
          </div>

          <div style={{ maxWidth: 480 }}>
            <form onSubmit={handleSave}>

            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Profile</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.4 }}>
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
                <span className="settings-subtext">1600 x 500 for best results</span>
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


              {/* Accent colour */}
              <div className="form-field" style={{ marginTop: 8 }}>
                <label>Accent colour</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {ACCENT_PRESETS.map(color => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => { setAccentColor(color); applyAccent(color) }}
                      style={{
                        width: 28, height: 28, borderRadius: '50%', background: color, border: 'none',
                        cursor: 'pointer', flexShrink: 0,
                        outline: accentColor.toLowerCase() === color.toLowerCase() ? '2px solid var(--text)' : '2px solid transparent',
                        outlineOffset: 2,
                      }}
                      title={color}
                    />
                  ))}
                  <label style={{ position: 'relative', width: 28, height: 28, flexShrink: 0, cursor: 'pointer', display: 'flex', marginBottom: 0 }} title="Custom colour">
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: accentColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1rem', color: 'var(--accent-text)', lineHeight: 1,
                    }}>+</div>
                    <input
                      type="color"
                      value={accentColor}
                      onChange={(e) => { setAccentColor(e.target.value); applyAccent(e.target.value) }}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
                    />
                  </label>
                </div>
              </div>

{fileError && <p style={{ fontSize: '0.8125rem', color: 'var(--danger)', marginTop: 8 }}>{fileError}</p>}

<div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 24 }}>
                <button className="btn btn-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {saved && <span style={{ fontSize: '0.8125rem', color: 'var(--accent)' }}>Saved</span>}
              </div>
            </form>
          </div>

          <div style={{ maxWidth: 480, marginTop: 42, paddingTop: 32, borderTop: '2px solid var(--tertiary)' }}>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: 8 }}>Danger zone</h2>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
              Permanently delete all your CRASH THE ARCADE data, including games, lists, follows, and settings. Your Atmosphere Account and other connected apps will not be affected.
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
                <p style={{ fontSize: '0.875rem', color: 'var(--danger)' }}>
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
                {deleteError && <p style={{ fontSize: '0.8125rem', color: 'var(--danger)' }}>{deleteError}</p>}
              </div>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
