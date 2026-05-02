import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, ArrowLeftRight, BarChart3,
  Users, Wallet, UsersRound,
} from 'lucide-react';

const navItems = [
  { to: '/',             icon: LayoutDashboard, label: 'Home'    },
  { to: '/transactions', icon: ArrowLeftRight,  label: 'Txns'    },
  { to: '/reports',      icon: BarChart3,       label: 'Reports' },
  { to: '/friends',      icon: Users,           label: 'Friends' },
  { to: '/groups',       icon: UsersRound,      label: 'Events'  },
  { to: '/borrow-lend',  icon: Wallet,          label: 'Borrow'  },
];

const BottomNav = () => {
  const location = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border"
      style={{
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft:   'env(safe-area-inset-left, 0px)',
        paddingRight:  'env(safe-area-inset-right, 0px)',
        boxShadow: '0 -1px 6px 0 hsl(215 25% 12% / 0.07)',
      }}
    >
      {/* Inner row constrained to same max-width as content */}
      <div className="mx-auto w-full max-w-[600px] flex items-stretch justify-around">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;

          return (
            <NavLink
              key={to}
              to={to}
              className="flex flex-col items-center justify-center gap-0.5 flex-1 min-w-0 pt-2 pb-1.5"
              style={{ minHeight: 56 }}
            >
              {/* Icon pill */}
              <div
                className={`relative flex items-center justify-center rounded-xl transition-all duration-200 ${
                  isActive ? 'gradient-primary shadow-sm' : ''
                }`}
                style={{ width: 40, height: 30 }}
              >
                <Icon
                  className={`flex-shrink-0 transition-colors ${
                    isActive ? 'text-primary-foreground' : 'text-muted-foreground'
                  }`}
                  style={{ width: 18, height: 18 }}
                />
              </div>

              {/* Label */}
              <span
                className={`font-semibold leading-none truncate w-full text-center transition-colors ${
                  isActive ? 'text-primary' : 'text-muted-foreground'
                }`}
                style={{ fontSize: 'clamp(9px, 2.2vw, 11px)' }}
              >
                {label}
              </span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;