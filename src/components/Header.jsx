import { useEffect, useState } from 'react'
import HsbcLogo from './HsbcLogo.jsx'

const TABS = ['Home']

function initialTheme() {
  try { return localStorage.getItem('theme') } catch { return null }
}

export default function Header({ tab, onTab }) {
  const [theme, setTheme] = useState(initialTheme) // null follows the OS

  useEffect(() => {
    const root = document.documentElement
    if (theme) root.dataset.theme = theme
    else delete root.dataset.theme
    try { theme ? localStorage.setItem('theme', theme) : localStorage.removeItem('theme') } catch { /* storage blocked */ }
  }, [theme])

  function toggle() {
    const dark = theme ? theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches
    setTheme(dark ? 'light' : 'dark')
  }

  return (
    <header className="bar">
      <div className="brand">
        <HsbcLogo className="hsbc-logo" />
        <span className="brand-sep" aria-hidden="true" />
        Architecture Bot <small>v1.0</small>
      </div>
      <nav className="tabs" aria-label="Sections">
        {TABS.map((t) => (
          <button key={t} className="tab" aria-current={t === tab ? 'page' : undefined} onClick={() => onTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <div className="bar-end">
        <div className="status"><span className="dot" />Gateway online</div>
        <button className="theme-btn" onClick={toggle} aria-label="Switch light or dark theme" title="Switch theme">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16.5 11.5A6.5 6.5 0 0 1 8.5 3.5a6.5 6.5 0 1 0 8 8Z" />
          </svg>
        </button>
      </div>
    </header>
  )
}
