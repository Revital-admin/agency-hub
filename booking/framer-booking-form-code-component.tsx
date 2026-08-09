// BookingContactForm.tsx
//
// Drop-in replacement for the native "Name / Email / Company name /
// Description" Form on revitalproductions.com. Visually matches the
// existing dark/orange brand. On submit, instead of whatever the current
// form does, it sends the visitor straight to the booking page with
// their info attached as URL query params - book.revitalproductions.com
// reads those and skips straight to time-picking instead of asking for
// the same info twice (see the isPrefilled logic in booking/index.html).
//
// How to add this in Framer:
//   1. Open your Framer project.
//   2. Left sidebar -> Assets panel -> "Code" section -> "+ New Code File".
//   3. Name it BookingContactForm, delete the placeholder content, and
//      paste everything below in.
//   4. It'll now show up as a component in the Insert panel (Code
//      Components section, usually near the bottom of the left sidebar's
//      "+" / Insert menu). Drag it onto the page where your current
//      contact form is.
//   5. Resize/reposition it to fill the same spot, then delete (or hide)
//      the old native Form component.
//   6. Publish. Test by filling it out - it should redirect you to
//      book.revitalproductions.com/booking/?name=...&email=...
//
// If the colors/spacing don't quite match once it's on the page, the
// style objects at the bottom (labelStyle/inputStyle/buttonStyle) are
// plain inline styles - easy to tweak numbers directly in this file.

import { useState } from "react"

const BOOKING_URL = "https://book.revitalproductions.com/booking/"

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function BookingContactForm() {
    const [name, setName] = useState("")
    const [email, setEmail] = useState("")
    const [company, setCompany] = useState("")
    const [notes, setNotes] = useState("")
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState("")

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault()
        if (!name.trim() || !email.trim()) {
            setError("Please enter your name and email.")
            return
        }
        setError("")
        setSubmitting(true)
        const params = new URLSearchParams({
            name: name.trim(),
            email: email.trim(),
            company: company.trim(),
            notes: notes.trim(),
        })
        window.location.href = BOOKING_URL + "?" + params.toString()
    }

    return (
        <form onSubmit={handleSubmit} style={formStyle}>
            <div style={fieldWrapStyle}>
                <label style={labelStyle}>Name</label>
                <input
                    style={inputStyle}
                    type="text"
                    placeholder="Jane Smith"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                />
            </div>
            <div style={fieldWrapStyle}>
                <label style={labelStyle}>Email</label>
                <input
                    style={inputStyle}
                    type="email"
                    placeholder="jane@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />
            </div>
            <div style={fieldWrapStyle}>
                <label style={labelStyle}>Company name</label>
                <input
                    style={inputStyle}
                    type="text"
                    placeholder="Company name"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                />
            </div>
            <div style={fieldWrapStyle}>
                <label style={labelStyle}>Description</label>
                <textarea
                    style={{ ...inputStyle, minHeight: 120, resize: "vertical" }}
                    placeholder="Tell us a bit about your project"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>
            {error && <div style={errorStyle}>{error}</div>}
            <button type="submit" disabled={submitting} style={buttonStyle}>
                {submitting ? "..." : "BOOK 15 MIN CALL"}
            </button>
        </form>
    )
}

// Matches the old native form's look (solid orange card, bold white
// uppercase labels, dark input fields, dark button) rather than the
// dark-card style the rest of the booking page uses - same field
// set/behavior, just visually styled to what was already on the page.
const formStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: 24,
    width: "100%",
    height: "100%",
    boxSizing: "border-box",
    background: "#f5805f",
    border: "5px dashed #ffffff",
    borderRadius: 4,
    padding: 40,
    fontFamily: "'Inter', sans-serif",
}
const fieldWrapStyle: React.CSSProperties = { display: "flex", flexDirection: "column", gap: 8 }
const labelStyle: React.CSSProperties = {
    fontSize: 15,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    color: "#1a1a1a",
}
const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "16px 18px",
    borderRadius: 4,
    border: "1px solid #ffffff",
    background: "#1a1a1a",
    color: "#f1eadb",
    fontSize: 17,
    boxSizing: "border-box",
    fontFamily: "'Inter', sans-serif",
}
const buttonStyle: React.CSSProperties = {
    background: "#1a1a1a",
    color: "#f1eadb",
    border: "none",
    borderRadius: 4,
    padding: "18px 26px",
    fontWeight: 700,
    fontSize: 15,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    cursor: "pointer",
    marginTop: 4,
}
const errorStyle: React.CSSProperties = { color: "#1a1a1a", fontWeight: 600, fontSize: 13 }
