import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Send, ArrowLeft, Plus, Users,
  Check, CheckCheck, Smile, Reply, Trash2,
  X, Crown, MoreVertical, ChevronDown,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';

interface DM { id: string; sender_id: string; receiver_id: string; content: string; read: boolean; created_at: string; reaction?: string; reply_to_id?: string; deleted_for_sender?: boolean; deleted_for_receiver?: boolean; }
interface GroupMsg { id: string; group_id: string; sender_id: string; content: string; created_at: string; deleted: boolean; reaction?: string; reply_to_id?: string; message_type?: string; sender_username?: string; }
type ChatMessage = DM | GroupMsg;
interface Convo { id: string; type: 'dm' | 'group'; name: string; lastMessage: string; lastTime: string; unread: number; }
interface ActiveChat { id: string; type: 'dm' | 'group'; name: string; members?: { user_id: string; username: string }[]; created_by?: string; }

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDay = (iso: string) => {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7)  return new Date(iso).toLocaleDateString([], { weekday: 'long' });
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtConvTime = (iso: string) => {
  const diffMins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMins < 1)  return 'now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });
};
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

const Avatar = ({ name, isGroup = false, size = 'md' }: { name: string; isGroup?: boolean; size?: 'sm' | 'md' | 'lg' }) => {
  const sz = { sm: 'w-8 h-8 text-xs', md: 'w-12 h-12 text-sm', lg: 'w-14 h-14 text-base' }[size];
  return (
    <div className={`${sz} rounded-full flex items-center justify-center font-bold flex-shrink-0 leading-none select-none aspect-square ${isGroup ? 'bg-accent/20 text-accent' : 'bg-primary/15 text-primary'}`}>
      {isGroup ? <Users className={size === 'sm' ? 'w-3.5 h-3.5' : 'w-5 h-5'} /> : name[0]?.toUpperCase()}
    </div>
  );
};

const Messages = () => {
  const { user } = useAuth();
  const [convos, setConvos]       = useState<Convo[]>([]);
  const [friends, setFriends]     = useState<{ id: string; username: string }[]>([]);
  const [myGroups, setMyGroups]   = useState<any[]>([]);
  const [search, setSearch]       = useState('');
  const [loading, setLoading]     = useState(true);
  const [tab, setTab]             = useState<'all' | 'dm' | 'groups'>('all');
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [activeChat, setActiveChat]   = useState<ActiveChat | null>(null);
  const [messages, setMessages]       = useState<ChatMessage[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [newMsg, setNewMsg]           = useState('');
  const [sending, setSending]         = useState(false);
  const [replyTo, setReplyTo]         = useState<ChatMessage | null>(null);
  const [showReactions, setShowReactions] = useState<string | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [newGroupName, setNewGroupName]       = useState('');
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup]     = useState(false);
  const [msgOptions, setMsgOptions]           = useState<ChatMessage | null>(null);
  const [showForward, setShowForward]         = useState<ChatMessage | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLInputElement>(null);
  const pollRef   = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchFriends = useCallback(async () => {
    if (!user) return;
    const { data: rows } = await supabase.from('friends').select('user_id, friend_id').eq('status', 'accepted').or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);
    const ids = (rows || []).map((r: any) => r.user_id === user.id ? r.friend_id : r.user_id);
    if (!ids.length) { setFriends([]); return; }
    const { data: p } = await supabase.from('profiles').select('id, username').in('id', ids);
    setFriends((p || []).map((x: any) => ({ id: x.id, username: x.username })));
  }, [user]);

  const fetchMyGroups = useCallback(async () => {
    if (!user) return;
    const { data: mem } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
    const ids = (mem || []).map((r: any) => r.group_id);
    if (!ids.length) { setMyGroups([]); return; }
    const { data: grps } = await supabase.from('groups').select('id, name, created_by').in('id', ids);
    setMyGroups(grps || []);
  }, [user]);

  const buildConvoList = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: dms } = await supabase.from('messages').select('sender_id, receiver_id, content, read, created_at').or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`).order('created_at', { ascending: false });
    const dmOtherIds = [...new Set((dms || []).map((m: any) => m.sender_id === user.id ? m.receiver_id : m.sender_id))];
    let profileMap: Record<string, string> = {};
    if (dmOtherIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id, username').in('id', dmOtherIds);
      (profs || []).forEach((p: any) => { profileMap[p.id] = p.username; });
    }
    const dmMap: Record<string, Convo> = {};
    for (const m of (dms || []) as any[]) {
      const otherId = m.sender_id === user.id ? m.receiver_id : m.sender_id;
      if (!dmMap[otherId]) {
        dmMap[otherId] = { id: otherId, type: 'dm', name: profileMap[otherId] || 'Unknown', lastMessage: m.content, lastTime: m.created_at, unread: (!m.read && m.receiver_id === user.id) ? 1 : 0 };
      } else if (!m.read && m.receiver_id === user.id) { dmMap[otherId].unread++; }
    }
    const { data: memRows } = await supabase.from('group_members').select('group_id').eq('user_id', user.id);
    const groupIds = (memRows || []).map((r: any) => r.group_id);
    const groupConvos: Convo[] = [];
    if (groupIds.length) {
      const { data: grps } = await supabase.from('groups').select('id, name').in('id', groupIds);
      for (const g of (grps || []) as any[]) {
        const { data: lastMsgs } = await supabase.from('group_messages').select('content, created_at').eq('group_id', g.id).eq('deleted', false).order('created_at', { ascending: false }).limit(1);
        const last = lastMsgs?.[0];
        const { data: allMsgs } = await supabase.from('group_messages').select('id').eq('group_id', g.id).eq('deleted', false).neq('sender_id', user.id);
        const { data: readRows } = await supabase.from('group_message_reads').select('message_id').eq('user_id', user.id);
        const readIds = new Set((readRows || []).map((r: any) => r.message_id));
        const unread = (allMsgs || []).filter((m: any) => !readIds.has(m.id)).length;
        groupConvos.push({ id: g.id, type: 'group', name: g.name, lastMessage: last?.content || 'No messages yet', lastTime: last?.created_at || new Date(0).toISOString(), unread });
      }
    }
    const all = [...Object.values(dmMap), ...groupConvos].sort((a, b) => new Date(b.lastTime).getTime() - new Date(a.lastTime).getTime());
    setConvos(all);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchFriends(); fetchMyGroups(); buildConvoList(); }, [fetchFriends, fetchMyGroups, buildConvoList]);

  const openDM = async (otherId: string, username: string) => {
    setActiveChat({ id: otherId, type: 'dm', name: username });
    setMessages([]); setLoadingMsgs(true); setReplyTo(null); setShowGroupInfo(false);
    const { data } = await supabase.from('messages').select('*').or(`and(sender_id.eq.${user!.id},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${user!.id})`).order('created_at', { ascending: true });
    setMessages((data || []) as DM[]);
    setLoadingMsgs(false);
    await supabase.from('messages').update({ read: true }).eq('sender_id', otherId).eq('receiver_id', user!.id).eq('read', false);
    buildConvoList();
    setTimeout(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); inputRef.current?.focus(); }, 100);
  };

  const openGroupChat = async (groupId: string, groupName: string) => {
    const { data: memRows } = await supabase.from('group_members').select('user_id').eq('group_id', groupId);
    const memberIds = (memRows || []).map((r: any) => r.user_id);
    const { data: profs } = await supabase.from('profiles').select('id, username').in('id', memberIds);
    const members = (profs || []).map((p: any) => ({ user_id: p.id, username: p.username }));
    const grp = myGroups.find(g => g.id === groupId);
    setActiveChat({ id: groupId, type: 'group', name: groupName, members, created_by: grp?.created_by });
    setMessages([]); setLoadingMsgs(true); setReplyTo(null); setShowGroupInfo(false);
    const profileMap: Record<string, string> = {};
    members.forEach(m => { profileMap[m.user_id] = m.username; });
    const { data } = await supabase.from('group_messages').select('*').eq('group_id', groupId).eq('deleted', false).order('created_at', { ascending: true });
    const enriched = (data || []).map((m: any) => ({ ...m, sender_username: profileMap[m.sender_id] || 'Unknown' }));
    setMessages(enriched as GroupMsg[]);
    setLoadingMsgs(false);
    for (const m of (data || []).filter((m: any) => m.sender_id !== user!.id)) {
      await supabase.from('group_message_reads').upsert({ message_id: m.id, user_id: user!.id }, { onConflict: 'message_id,user_id' });
    }
    buildConvoList();
    setTimeout(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); inputRef.current?.focus(); }, 100);
  };

  useEffect(() => {
    if (!activeChat || !user) return;
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      if (activeChat.type === 'dm') {
        const { data } = await supabase.from('messages').select('*').or(`and(sender_id.eq.${user.id},receiver_id.eq.${activeChat.id}),and(sender_id.eq.${activeChat.id},receiver_id.eq.${user.id})`).order('created_at', { ascending: true });
        if (data && data.length > messages.length) {
          setMessages(data as DM[]);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          await supabase.from('messages').update({ read: true }).eq('sender_id', activeChat.id).eq('receiver_id', user.id).eq('read', false);
          buildConvoList();
        }
      } else {
        const profileMap: Record<string, string> = {};
        (activeChat.members || []).forEach(m => { profileMap[m.user_id] = m.username; });
        const { data } = await supabase.from('group_messages').select('*').eq('group_id', activeChat.id).eq('deleted', false).order('created_at', { ascending: true });
        if (data && data.length > messages.length) {
          const enriched = data.map((m: any) => ({ ...m, sender_username: profileMap[m.sender_id] || 'Unknown' }));
          setMessages(enriched as GroupMsg[]);
          setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          for (const m of data.filter((m: any) => m.sender_id !== user.id)) {
            await supabase.from('group_message_reads').upsert({ message_id: m.id, user_id: user.id }, { onConflict: 'message_id,user_id' });
          }
          buildConvoList();
        }
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [activeChat, user, messages.length, buildConvoList]);

  const handleSend = async () => {
    const content = newMsg.trim();
    if (!content || !activeChat || sending) return;
    setNewMsg(''); setSending(true);
    const replyId = replyTo?.id || null;
    setReplyTo(null);
    if (activeChat.type === 'dm') {
      const { data, error } = await supabase.from('messages').insert({ sender_id: user!.id, receiver_id: activeChat.id, content, read: false, reply_to_id: replyId }).select().single();
      if (!error && data) { setMessages(prev => [...prev, data as DM]); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); buildConvoList(); }
    } else {
      const profileMap: Record<string, string> = {};
      (activeChat.members || []).forEach(m => { profileMap[m.user_id] = m.username; });
      const { data, error } = await supabase.from('group_messages').insert({ group_id: activeChat.id, sender_id: user!.id, content, reply_to_id: replyId }).select().single();
      if (!error && data) { setMessages(prev => [...prev, { ...data, sender_username: profileMap[user!.id] || 'You', deleted: false } as GroupMsg]); setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50); buildConvoList(); }
    }
    setSending(false);
  };

  const handleReact = async (msgId: string, emoji: string) => {
    setShowReactions(null);
    const table = activeChat?.type === 'dm' ? 'messages' : 'group_messages';
    const newEmoji: string | undefined = messages.find(m => m.id === msgId)?.reaction === emoji ? undefined : emoji;
    await supabase.from(table).update({ reaction: newEmoji ?? null }).eq('id', msgId);
    setMessages(prev => prev.map(m => m.id === msgId ? { ...m, reaction: newEmoji } : m) as typeof prev);
  };

  const handleDelete = async (type: 'me' | 'everyone') => {
    if (!msgOptions || !user) return;
    const msg = msgOptions;
    setMsgOptions(null);
    const table = activeChat?.type === 'dm' ? 'messages' : 'group_messages';
    const isMine = msg.sender_id === user.id;

    if (activeChat?.type === 'dm') {
      const update = type === 'everyone' && isMine 
        ? { deleted_for_sender: true, deleted_for_receiver: true } 
        : (isMine ? { deleted_for_sender: true } : { deleted_for_receiver: true });
      await supabase.from(table).update(update).eq('id', msg.id);
      setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, ...update } : m));
    } else {
      if (type === 'everyone' && isMine) {
        await supabase.from(table).update({ deleted: true }).eq('id', msg.id);
        setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, deleted: true } : m));
      } else {
        // Group messages don't have delete for me currently in schema, just ignore or hide locally
        toast.info("Cannot delete for me in groups yet");
        return;
      }
    }
    toast.success('Message deleted');
  };

  const handleCopy = () => {
    if (!msgOptions) return;
    navigator.clipboard.writeText(msgOptions.content);
    setMsgOptions(null);
    toast.success('Message copied');
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) { toast.error('Enter a group name'); return; }
    setCreatingGroup(true);
    const { data: grp, error } = await supabase.from('groups').insert({ name: newGroupName.trim(), created_by: user!.id }).select().single();
    if (error || !grp) { toast.error('Failed: ' + error?.message); setCreatingGroup(false); return; }
    await supabase.from('group_members').insert({ group_id: grp.id, user_id: user!.id });
    for (const fid of newGroupMembers) await supabase.from('group_members').insert({ group_id: grp.id, user_id: fid });
    await supabase.from('group_messages').insert({ group_id: grp.id, sender_id: user!.id, content: `Group "${grp.name}" was created`, message_type: 'expense_update' });
    toast.success(`"${grp.name}" created!`);
    setCreatingGroup(false); setShowNewGroup(false); setNewGroupName(''); setNewGroupMembers([]);
    await fetchMyGroups(); await buildConvoList();
    openGroupChat(grp.id, grp.name);
  };

  if (activeChat) {
    const isGroup = activeChat.type === 'group';
    const isAdmin = isGroup && activeChat.created_by === user!.id;
    const profileMap: Record<string, string> = {};
    (activeChat.members || []).forEach(m => { profileMap[m.user_id] = m.username; });
    const dayGroups: { day: string; msgs: ChatMessage[] }[] = [];
    let currentDay = '';
    for (const m of messages) {
      const day = fmtDay(m.created_at);
      if (day !== currentDay) { dayGroups.push({ day, msgs: [] }); currentDay = day; }
      dayGroups[dayGroups.length - 1].msgs.push(m);
    }
    const getReplyPreview = (replyId?: string) => messages.find(m => m.id === replyId)?.content || '';

    return (
      <div className="fixed inset-0 z-[60] flex flex-col bg-background" onClick={() => setShowReactions(null)}>
        <div className="flex items-center gap-3 px-4 pt-[max(env(safe-area-inset-top),16px)] pb-3 bg-card border-b border-border flex-shrink-0 shadow-sm">
          <button onClick={() => { setActiveChat(null); buildConvoList(); setShowGroupInfo(false); }} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </button>
          <button className="flex items-center gap-2.5 flex-1 min-w-0" onClick={() => isGroup && setShowGroupInfo(v => !v)}>
            <Avatar name={activeChat.name} isGroup={isGroup} />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{isGroup ? activeChat.name : `@${activeChat.name}`}</p>
              <p className="text-[11px] text-muted-foreground">{isGroup ? `${activeChat.members?.length || 0} members${isAdmin ? ' · You are admin' : ''}` : 'Direct message'}</p>
            </div>
          </button>
          {isGroup && <button onClick={() => setShowGroupInfo(v => !v)} className="w-9 h-9 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0"><MoreVertical className="w-4 h-4 text-muted-foreground" /></button>}
        </div>

        {isGroup && showGroupInfo && (
          <div className="bg-card border-b border-border px-4 py-3 flex-shrink-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Members · {activeChat.members?.length}</p>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {(activeChat.members || []).map(m => {
                const isCreator = m.user_id === activeChat.created_by;
                return (
                  <div key={m.user_id} className="flex flex-col items-center gap-1 flex-shrink-0">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold ${isCreator ? 'bg-yellow-500/20 text-yellow-500' : 'bg-primary/10 text-primary'}`}>
                      {isCreator ? <Crown className="w-4 h-4" /> : m.username[0].toUpperCase()}
                    </div>
                    <span className="text-[9px] text-muted-foreground max-w-[44px] truncate">{m.user_id === user!.id ? 'You' : `@${m.username}`}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3">
          {loadingMsgs ? (
            <div className="space-y-3 pt-4">{[1,2,3].map(i => <div key={i} className={`flex ${i%2?'justify-start':'justify-end'}`}><div className="h-10 rounded-2xl bg-secondary animate-pulse" style={{width:`${130+i*30}px`}}/></div>)}</div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
              <Avatar name={activeChat.name} size="lg" isGroup={isGroup} />
              <div><p className="text-sm font-semibold text-foreground">{isGroup ? activeChat.name : `@${activeChat.name}`}</p><p className="text-xs mt-1">No messages yet — say hello! 👋</p></div>
            </div>
          ) : (
            dayGroups.map(({ day, msgs }) => (
              <div key={day}>
                <div className="flex items-center gap-2 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground font-medium bg-secondary px-2.5 py-1 rounded-full whitespace-nowrap">{day}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-1">
                  {msgs.map((m, idx) => {
                    const isMine    = m.sender_id === user!.id;
                    const isSystem  = (m as GroupMsg).message_type === 'expense_update';
                    const deletedForMe = isMine ? (m as DM).deleted_for_sender : (m as DM).deleted_for_receiver;
                    const deletedForEveryone = activeChat.type === 'dm' ? ((m as DM).deleted_for_sender && (m as DM).deleted_for_receiver) : (m as GroupMsg).deleted;

                    // If deleted only for me, it vanishes completely from my chat
                    if (deletedForMe && !deletedForEveryone) return null;

                    const prevMsg   = idx > 0 ? msgs[idx - 1] : null;
                    const sameAuth  = prevMsg?.sender_id === m.sender_id;
                    const senderName = isGroup ? (m as GroupMsg).sender_username || 'Unknown' : '';
                    const replyPreview = (m as any).reply_to_id ? getReplyPreview((m as any).reply_to_id) : null;
                    const showTail = !sameAuth;

                    if (isSystem) return (
                      <div key={m.id} className="flex justify-center my-2">
                        <span className="text-[10px] text-muted-foreground bg-secondary/60 px-3 py-1.5 rounded-full">{m.content}</span>
                      </div>
                    );

                    return (
                      <div key={m.id} className={`flex gap-2 ${isMine ? 'justify-end' : 'justify-start'} ${showTail ? 'mt-3' : 'mt-0.5'}`}>
                        {isGroup && !isMine ? (showTail ? <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary flex-shrink-0 self-end mb-1">{senderName[0]?.toUpperCase()}</div> : <div className="w-8 flex-shrink-0" />) : null}
                        <div className={`flex flex-col max-w-[75%] ${isMine ? 'items-end' : 'items-start'} relative group`}>
                          {isGroup && !isMine && showTail && <p className="text-[10px] font-semibold text-primary ml-1 mb-0.5">@{senderName}</p>}
                          
                          <div
                            className={`relative px-3 py-2 text-[15px] leading-snug shadow-sm cursor-pointer ${
                              isMine 
                                ? `bg-[#dcf8c6] text-black ${showTail ? 'rounded-tl-xl rounded-bl-xl rounded-tr-xl rounded-br-none' : 'rounded-xl'}` 
                                : `bg-white text-black ${showTail ? 'rounded-tr-xl rounded-br-xl rounded-tl-xl rounded-bl-none' : 'rounded-xl'}`
                            }`}
                            onClick={() => setMsgOptions(m)}
                            onDoubleClick={() => !deletedForEveryone && setReplyTo(m)}
                          >
                            {/* Tail implementation */}
                            {showTail && (
                              <div className={`absolute bottom-0 w-3 h-3 ${isMine ? '-right-2' : '-left-2'}`}>
                                <svg viewBox="0 0 8 13" width="8" height="13" className={isMine ? 'text-[#dcf8c6]' : 'text-white'} style={{ transform: isMine ? 'scaleX(-1)' : 'none' }}>
                                  <path opacity="1" fill="currentColor" d="M1.533,3.568L8,12.193V1H2.812 C1.042,1,0.474,2.156,1.533,3.568z"></path>
                                </svg>
                              </div>
                            )}

                            {replyPreview && !deletedForEveryone && (
                              <div className="flex flex-col gap-0.5 px-2.5 py-1.5 mb-1.5 rounded bg-black/5 border-l-[3px] border-emerald-500 text-[11px] max-w-full">
                                <span className="font-semibold text-emerald-600">Replied Message</span>
                                <span className="truncate text-black/70">{replyPreview}</span>
                              </div>
                            )}

                            {deletedForEveryone ? (
                              <div className="flex items-center gap-1.5 italic text-black/50 pr-4">
                                <span>🚫</span>
                                <span>{isMine ? 'You deleted this message' : 'This message was deleted'}</span>
                              </div>
                            ) : (
                              <div className="flex flex-col">
                                <span className="whitespace-pre-wrap break-words">{m.content}</span>
                                <div className={`flex items-center justify-end gap-1 mt-0.5 -mb-1 -mr-1 text-[10px] ${isMine ? 'text-black/50' : 'text-black/40'}`}>
                                  <span>{fmtTime(m.created_at)}</span>
                                  {isMine && activeChat.type === 'dm' && (
                                    (m as DM).read ? <CheckCheck className="w-3.5 h-3.5 text-blue-500" /> : <Check className="w-3.5 h-3.5" />
                                  )}
                                  {isMine && activeChat.type === 'group' && <Check className="w-3.5 h-3.5" />}
                                </div>
                              </div>
                            )}
                          </div>
                          {(m as any).reaction && <button onClick={() => handleReact(m.id, (m as any).reaction)} className="text-[13px] absolute -bottom-3 -right-2 px-1.5 py-0.5 bg-card rounded-full shadow border border-border hover:scale-110 transition-transform">{(m as any).reaction}</button>}

                          {/* Desktop hover menu */}
                          {!deletedForEveryone && (
                            <div className={`absolute top-0 ${isMine ? '-left-20' : '-right-20'} hidden group-hover:flex items-center gap-0.5 bg-card border border-border rounded-full px-1.5 py-1 shadow-md z-10`}>
                              <button onClick={e => { e.stopPropagation(); setShowReactions(showReactions === m.id ? null : m.id); }} className="w-6 h-6 rounded-full hover:bg-secondary flex items-center justify-center"><Smile className="w-3.5 h-3.5 text-muted-foreground" /></button>
                              <button onClick={e => { e.stopPropagation(); setReplyTo(m); inputRef.current?.focus(); }} className="w-6 h-6 rounded-full hover:bg-secondary flex items-center justify-center"><Reply className="w-3.5 h-3.5 text-muted-foreground" /></button>
                              {(isMine || activeChat.type === 'dm') && (
                                <button onClick={e => { e.stopPropagation(); setMsgOptions(m); }} className="w-6 h-6 rounded-full hover:bg-destructive/10 flex items-center justify-center"><Trash2 className="w-3.5 h-3.5 text-muted-foreground" /></button>
                              )}
                            </div>
                          )}
                          
                          {showReactions === m.id && (
                            <div onClick={e => e.stopPropagation()} className={`absolute z-50 ${isMine ? 'right-0' : 'left-0'} -top-10 flex gap-1 bg-card border border-border rounded-full px-2 py-1.5 shadow-xl`}>
                              {REACTIONS.map(r => <button key={r} onClick={() => handleReact(m.id, r)} className="text-base hover:scale-125 transition-transform active:scale-95">{r}</button>)}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} className="h-1" />
        </div>

        {replyTo && (
          <div className="flex items-center gap-3 px-4 py-2.5 bg-secondary border-t border-border flex-shrink-0">
            <Reply className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-primary font-semibold">Replying to {replyTo.sender_id === user!.id ? 'yourself' : `@${activeChat.type === 'dm' ? activeChat.name : (replyTo as GroupMsg).sender_username}`}</p>
              <p className="text-xs text-muted-foreground truncate">{replyTo.content}</p>
            </div>
            <button onClick={() => setReplyTo(null)}><X className="w-4 h-4 text-muted-foreground" /></button>
          </div>
        )}

        <div className="flex-shrink-0 px-3 pt-3 pb-[max(env(safe-area-inset-bottom),16px)] bg-card border-t border-border">
          <div className="flex items-center gap-2">
            <div className="flex-1 flex items-center bg-secondary rounded-2xl px-4 py-2.5 min-h-[44px]">
              <Input ref={inputRef} placeholder={`Message ${isGroup ? activeChat.name : `@${activeChat.name}`}...`} value={newMsg} onChange={e => setNewMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }} className="bg-transparent border-0 p-0 h-auto text-sm focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:outline-none shadow-none flex-1" />
            </div>
            <button onClick={handleSend} disabled={!newMsg.trim() || sending} className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${newMsg.trim() ? 'gradient-primary shadow-md' : 'bg-secondary opacity-50'}`}>
              <Send className="w-4 h-4 text-primary-foreground" />
            </button>
          </div>
        </div>

        {/* Message Options Sheet */}
        <Sheet open={!!msgOptions} onOpenChange={(open) => !open && setMsgOptions(null)}>
          <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl pb-10">
            <SheetHeader className="text-left mb-4"><SheetTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Message Options</SheetTitle></SheetHeader>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setReplyTo(msgOptions); setMsgOptions(null); inputRef.current?.focus(); }} className="w-full text-left px-4 py-3 rounded-xl hover:bg-secondary font-medium transition-colors flex items-center gap-3">
                <Reply className="w-5 h-5 text-primary" /> Reply
              </button>
              <button onClick={() => { setShowReactions(msgOptions?.id || null); setMsgOptions(null); }} className="w-full text-left px-4 py-3 rounded-xl hover:bg-secondary font-medium transition-colors flex items-center gap-3">
                <Smile className="w-5 h-5 text-emerald-500" /> React
              </button>
              <button onClick={handleCopy} className="w-full text-left px-4 py-3 rounded-xl hover:bg-secondary font-medium transition-colors flex items-center gap-3">
                <svg className="w-5 h-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg> Copy
              </button>
              {msgOptions?.sender_id === user?.id && (
                <>
                  <div className="h-px bg-border my-1" />
                  <button onClick={() => handleDelete('me')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-destructive/10 text-destructive font-medium transition-colors flex items-center gap-3">
                    <Trash2 className="w-5 h-5" /> Delete for me
                  </button>
                  <button onClick={() => handleDelete('everyone')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-destructive/10 text-destructive font-medium transition-colors flex items-center gap-3">
                    <Trash2 className="w-5 h-5" /> Delete for everyone
                  </button>
                </>
              )}
              {msgOptions?.sender_id !== user?.id && activeChat?.type === 'dm' && (
                <>
                  <div className="h-px bg-border my-1" />
                  <button onClick={() => handleDelete('me')} className="w-full text-left px-4 py-3 rounded-xl hover:bg-destructive/10 text-destructive font-medium transition-colors flex items-center gap-3">
                    <Trash2 className="w-5 h-5" /> Delete for me
                  </button>
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    );
  }

  const unmessaged = friends.filter(f => !new Set(convos.filter(c => c.type === 'dm').map(c => c.id)).has(f.id));
  const filtered   = convos.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) && (tab === 'all' || (tab === 'dm' ? c.type === 'dm' : c.type === 'group')));
  const totalUnread = convos.reduce((s, c) => s + c.unread, 0);

  return (
    <div className="min-h-screen bg-background pb-24">
      <div className="px-5 pt-12 pb-4 bg-card border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-foreground">Messages</h1>
            {totalUnread > 0 && <p className="text-xs text-primary font-medium">{totalUnread} unread</p>}
          </div>
          <button onClick={() => setShowNewGroup(true)} className="flex items-center gap-1.5 px-3 py-2 gradient-primary rounded-xl text-xs font-semibold text-primary-foreground">
            <Plus className="w-3.5 h-3.5" /> New Group
          </button>
        </div>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search messages..." value={search} onChange={e => setSearch(e.target.value)} className="bg-secondary border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary pl-10" />
        </div>
        <div className="flex gap-2">
          {(['all', 'dm', 'groups'] as const).map(t => {
            const count = t === 'all' ? convos.length : convos.filter(c => c.type === (t === 'dm' ? 'dm' : 'group')).length;
            return (
              <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${tab === t ? 'gradient-primary text-primary-foreground' : 'bg-secondary text-muted-foreground'}`}>
                {t === 'all' ? 'All' : t === 'dm' ? '💬 DMs' : '👥 Groups'}{count > 0 ? ` (${count})` : ''}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 pt-4">
        {(tab === 'all' || tab === 'dm') && unmessaged.length > 0 && (
          <div className="mb-5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">New message</p>
            <div className="flex gap-4 overflow-x-auto pb-3 pt-2 px-2 -mx-2">
              {unmessaged.map(f => (
                <button key={f.id} onClick={() => openDM(f.id, f.username)} className="flex flex-col items-center gap-1.5 flex-shrink-0">
                  <div className="w-14 h-14 aspect-square rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-base leading-none select-none flex-shrink-0 ring-2 ring-primary/40 ring-offset-2 ring-offset-background">{f.username[0].toUpperCase()}</div>
                  <span className="text-[10px] text-muted-foreground max-w-[52px] truncate">@{f.username}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="flex items-center gap-3 p-3"><div className="w-12 h-12 rounded-full bg-secondary animate-pulse flex-shrink-0" /><div className="flex-1 space-y-2"><div className="h-3 bg-secondary rounded-full animate-pulse w-2/3"/><div className="h-2 bg-secondary rounded-full animate-pulse w-1/2"/></div></div>)}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="text-4xl mb-3">{tab === 'groups' ? '👥' : '💬'}</p>
            <p className="font-medium text-foreground">{tab === 'groups' ? 'No group chats' : 'No conversations'}</p>
            <p className="text-xs mt-1">{tab === 'groups' ? 'Tap "New Group" above' : friends.length > 0 ? 'Tap a friend above to start' : 'Add friends to start messaging'}</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {filtered.map(conv => (
              <button key={`${conv.type}-${conv.id}`} onClick={() => conv.type === 'dm' ? openDM(conv.id, conv.name) : openGroupChat(conv.id, conv.name)} className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-secondary/50 active:bg-secondary/70 transition-colors text-left">
                <div className="relative flex-shrink-0">
                  <Avatar name={conv.name} isGroup={conv.type === 'group'} />
                  {conv.unread > 0 && (
                    <div className="absolute -top-1 -right-1 min-w-[20px] h-5 bg-red-500 rounded-full flex items-center justify-center px-1 shadow-sm" style={{ boxShadow: '0 0 0 2px white' }}>
                      <span className="text-[10px] font-bold text-white leading-none">{conv.unread > 99 ? '99+' : conv.unread}</span>
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className={`text-sm truncate ${conv.unread > 0 ? 'font-bold' : 'font-semibold'} text-foreground`}>{conv.type === 'group' ? conv.name : `@${conv.name}`}</p>
                      {conv.type === 'group' && <span className="text-[9px] bg-accent/15 text-accent px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">GROUP</span>}
                    </div>
                    <span className={`text-[10px] flex-shrink-0 ${conv.unread > 0 ? 'text-primary font-bold' : 'text-muted-foreground'}`}>{fmtConvTime(conv.lastTime)}</span>
                  </div>
                  <p className={`text-xs truncate ${conv.unread > 0 ? 'text-foreground font-medium' : 'text-muted-foreground'}`}>{conv.lastMessage}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <Sheet open={showNewGroup} onOpenChange={setShowNewGroup}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl max-h-[85vh] overflow-y-auto">
          <SheetHeader><SheetTitle className="font-heading text-foreground">New Group Chat</SheetTitle></SheetHeader>
          <div className="space-y-5 mt-5 pb-8 px-5">
            <div>
              <Label className="text-xs text-muted-foreground uppercase tracking-wider">Group Name</Label>
              <Input placeholder="e.g. Goa Trip 🏖️" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} className="bg-secondary border-transparent focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-primary mt-2" />
            </div>
            {friends.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">Add friends first to create a group.</p>
            ) : (
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wider">Add Members {newGroupMembers.length > 0 && `· ${newGroupMembers.length} selected`}</Label>
                <div className="space-y-2 mt-2 max-h-56 overflow-y-auto">
                  {friends.map(f => {
                    const sel = newGroupMembers.includes(f.id);
                    return (
                      <button key={f.id} onClick={() => setNewGroupMembers(p => p.includes(f.id) ? p.filter(x => x !== f.id) : [...p, f.id])}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all ${sel ? 'border-primary bg-primary/10' : 'border-border bg-secondary'}`}>
                        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary text-sm">{f.username[0].toUpperCase()}</div>
                        <span className="flex-1 text-sm font-medium text-foreground text-left">@{f.username}</span>
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${sel ? 'border-primary bg-primary' : 'border-muted-foreground'}`}>{sel && <div className="w-2 h-2 rounded-full bg-white" />}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <Button onClick={handleCreateGroup} disabled={creatingGroup || !newGroupName.trim()} className="w-full gradient-primary text-primary-foreground h-12 font-bold">
              {creatingGroup ? 'Creating...' : `Create Group${newGroupMembers.length > 0 ? ` · ${newGroupMembers.length + 1} members` : ''}`}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Messages;