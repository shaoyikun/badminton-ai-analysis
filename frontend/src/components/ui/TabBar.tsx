import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import styles from './TabBar.module.scss'

type TabItem = {
  to?: string
  label: string
  disabled?: boolean
}

export function TabBar({ items }: { items: TabItem[] }) {
  return (
    <nav aria-label="主导航" className={styles.tabBar}>
      {items.map((item) => (
        item.disabled || !item.to ? (
          <span key={item.label} className={cn(styles.link, styles.disabled)} aria-disabled="true">
            {item.label}
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => cn(styles.link, isActive && styles.active)}
          >
            {item.label}
          </NavLink>
        )
      ))}
    </nav>
  )
}
