import { NavLink } from 'react-router-dom'

type TabItem = {
  to: string
  label: string
  disabled?: boolean
}

export function TabBar({ items }: { items: TabItem[] }) {
  return (
    <nav className="tab-bar">
      {items.map((item) => (
        item.disabled ? (
          <span key={item.to} className="tab-bar-link disabled">
            {item.label}
          </span>
        ) : (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) => `tab-bar-link ${isActive ? 'active' : ''}`}
          >
            {item.label}
          </NavLink>
        )
      ))}
    </nav>
  )
}
