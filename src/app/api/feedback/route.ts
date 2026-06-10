import { NextRequest, NextResponse } from 'next/server'
import { Resend } from 'resend'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

const resend = new Resend(process.env.RESEND_API_KEY)

export async function POST(req: NextRequest) {
  if (!rateLimit(`feedback:${getClientIp(req)}`, 3, 3_600_000)) {
    return NextResponse.json({ error: 'Too many requests.' }, { status: 429 })
  }

  let body: { name?: string; email?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 })
  }

  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 100) : ''
  const email = typeof body.email === 'string' ? body.email.trim().slice(0, 254) : ''
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 5000) : ''

  if (!name || !email || !message) {
    return NextResponse.json({ error: 'All fields are required.' }, { status: 400 })
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Invalid email address.' }, { status: 400 })
  }

  // Strip CR/LF so user input can't inject email headers via the subject
  const safeName = name.replace(/[\r\n]+/g, ' ')

  try {
    await resend.emails.send({
      from: 'Feedback <feedback@postgame.at>',
      to: 'feedback@postgame.at',
      replyTo: email,
      subject: `Feedback from ${safeName}`,
      text: `From: ${safeName} <${email}>\n\n${message}`,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Failed to send feedback email:', err)
    return NextResponse.json({ error: 'Failed to send. Please try again.' }, { status: 500 })
  }
}
