import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'

export type MobileShellContextValue = {
  hasTabs: boolean
  setActionBar: (node: ReactNode | null) => void
}

export const MobileShellContext = createContext<MobileShellContextValue | null>(null)

export function useMobileShell() {
  return useContext(MobileShellContext)
}
