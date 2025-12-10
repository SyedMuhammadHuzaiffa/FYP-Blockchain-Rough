import './globals.css'
import Sidebar from '../app/components/Sidebar'
import Topbar from '../app/components/Topbar'

export const metadata = {
  title: 'FYP Certificates',
  description: 'Admin dashboard & public verification',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-neutral-900 min-h-screen text-white">
        <div className="flex min-h-screen">
          <Sidebar />
          <div className="flex-1 flex flex-col">
            <Topbar />
            <main className="p-6">{children}</main>
          </div>
        </div>
      </body>
    </html>
  )
}