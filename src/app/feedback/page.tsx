'use client'

import { useState } from 'react'

export default function FeedbackPage() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Failed to send.')
      setSubmitted(true)
    } catch (err: any) {
      setError(err.message ?? 'Failed to send. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <>
      <main>
        <div className="container page-top">
          <h1 className="browse-section-title">Feedback</h1>

          <div className="faq-section-container feedback-form">
            {submitted ? (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9375rem' }}>
                Thanks for your feedback! We'll be in touch if we have any questions.
              </p>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="form-field">
                  <label>Name</label>
                  <input
                    className="input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Email</label>
                  <input
                    className="input"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="your@email.com"
                    required
                  />
                </div>
                <div className="form-field">
                  <label>Message</label>
                  <textarea
                    className="input"
                    rows={6}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="What's on your mind?"
                    required
                  />
                </div>
                {error && <p className="error-msg" style={{ marginBottom: 14 }}>{error}</p>}
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Send feedback'}
                </button>
              </form>
            )}
          </div>
        </div>
      </main>
    </>
  )
}
