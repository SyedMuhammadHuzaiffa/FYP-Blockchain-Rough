import './globals.css'
import Sidebar from './components/Sidebar' // ✅ make sure path is correct
import Topbar from './components/Topbar'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const sidebarLinks = [
    { href: '/', label: 'Home' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/revoke', label: 'Revoke' },
    // add more routes if needed
  ]

  return (
    <html lang="en">
      <body className="min-h-screen antialiased bg-[var(--background)] text-[var(--foreground)]">
        <div className="min-h-screen flex">
          <Sidebar links={sidebarLinks} />
          <div className="flex-1 min-h-screen flex flex-col">
            <Topbar />
            <main className="flex-1 p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}