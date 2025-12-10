// src/app/components/SidebarWrapper.tsx
import Sidebar from './Sidebar'
import { getRoutes } from '../lib/getRoutes'

export default function SidebarWrapper() {
  const links = getRoutes()
  return <Sidebar links={links} />
}