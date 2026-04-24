import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  BarChart3,
  Users,
  MessageCircle,
  Wallet,
  UsersRound,
} from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Home' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transactions' },
  { to: '/reports', icon: BarChart3, label: 'Reports' },
  { to: '/friends', icon: Users, label: 'Friends' },
  { to: '/groups', icon: UsersRound, label: 'Groups' },
  { to: '/messages', icon: MessageCircle, label: 'Chat' },
  { to: '/borrow-lend', icon: Wallet, label: 'Borrow' },
];

const BottomNav = () => {
  const location = useLocation();
  const { user } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!user) return;

    // Count unread DMs
    const { data: dmRows } = await supabase
      .from('messages')
      .select('id')
      .eq('receiver_id', user.id)
      .eq('read', false);

    const dmUnread = (dmRows || []).length;

    // Count unread group messages
    const { data: memRows } = await supabase
      .from('group_members')
      .select('group_id')
      .eq('user_id', user.id);

    const groupIds = (memRows || []).map((r: any) => r.group_id);
    let groupUnread = 0;

    if (groupIds.length) {
      const { data: allMsgs } = await supabase
        .from('group_messages')
        .select('id')
        .in('group_id', groupIds)
        .eq('deleted', false)
        .neq('sender_id', user.id);

      const { data: readRows } = await supabase
        .from('group_message_reads')
        .select('message_id')
        .eq('user_id', user.id);

      const readIds = new Set((readRows || []).map((r: any) => r.message_id));
      groupUnread = (allMsgs || []).filter((m: any) => !readIds.has(m.id)).length;
    }

    setUnreadCount(dmUnread + groupUnread);
  }, [user]);

  useEffect(() => {
    fetchUnread();
    // Poll every 10 seconds for new messages
    const interval = setInterval(fetchUnread, 10000);
    return () => clearInterval(interval);
  }, [fetchUnread]);

  // Reset badge when user navigates to messages
  useEffect(() => {
    if (location.pathname === '/messages') {
      setTimeout(fetchUnread, 1500);
    }
  }, [location.pathname, fetchUnread]);

  return (
    <nav
      className="sticky bottom-0 z-50 bg-card border-t border-border safe-bottom"
      style={{ boxShadow: '0 -1px 3px 0 hsl(215 25% 12% / 0.06)' }}
    >
      <div className="flex items-center justify-around px-1 py-2">
        {navItems.map(({ to, icon: Icon, label }) => {
          const isActive = location.pathname === to;
          const isChatTab = to === '/messages';

          return (
            <NavLink
              key={to}
              to={to}
              className="flex flex-col items-center gap-1 py-0.5 px-1.5 rounded-xl transition-all duration-200 flex-1"
            >
              <div className={`relative p-2 rounded-xl transition-all duration-200 ${
                isActive ? 'gradient-primary shadow-md' : ''
              }`}>
                <Icon className={`w-6 h-6 transition-colors ${
                  isActive ? 'text-primary-foreground' : 'text-muted-foreground'
                }`} />

                {/* Instagram-style red badge for unread messages */}
                {isChatTab && unreadCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[17px] h-[17px] bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center px-[3px] leading-none shadow-sm"
                    style={{ boxShadow: '0 0 0 1.5px var(--background, #fff)' }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </div>
              <span className={`text-[11px] font-semibold leading-none transition-colors ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}>
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