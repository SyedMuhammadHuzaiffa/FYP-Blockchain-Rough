// src/app/lib/getRoutes.ts
import fs from 'fs'
import path from 'path'

export function getRoutes() {
  const appDir = path.join(process.cwd(), 'src/app')
  const dirs = fs.readdirSync(appDir, { withFileTypes: true })
  const routes: { href: string; label: string }[] = []

  dirs.forEach((d) => {
    if (d.isDirectory() && fs.existsSync(path.join(appDir, d.name, 'page.tsx'))) {
      const href = d.name === 'dashboard' ? '/dashboard' : `/${d.name}`
      routes.push({ href, label: d.name.charAt(0).toUpperCase() + d.name.slice(1) })
    }
  })

  // Always include root
  routes.unshift({ href: '/', label: 'Home' })

  return routes
}