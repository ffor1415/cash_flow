import { useState, useEffect, useCallback } from 'react';
import { Search, UserPlus, Check, X, Users, UserMinus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';

interface Profile { id: string; username: string; }
interface FriendRow { id: string; user_id: string; friend_id: string; status: 'pending' | 'accepted' | 'rejected'; }
interface Friend extends Profile { rowId: string; }
interface PendingRequest extends Profile { rowId: string; direction: 'inbound' | 'outbound'; }

const Friends = () => {
  const { user } = useAuth();
  const [friends, setFriends]         = useState<Friend[]>([]);
  const [pending, setPending]         = useState<PendingRequest[]>([]);
  const [search, setSearch]           = useState('');
  const [loading, setLoading]         = useState(true);
  const [showAdd, setShowAdd]         = useState(false);
  const [query, setQuery]             = useState('');
  const [searching, setSearching]     = useState(false);
  const [foundUser, setFoundUser]     = useState<Profile | null>(null);
  const [searchError, setSearchError] = useState('');
  const [sending, setSending]         = useState(false);

  const fetchFriends = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('friends')
      .select('id, user_id, friend_id, status')
      .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

    if (error) { toast.error('Failed to load friends'); setLoading(false); return; }

    const friendRows = (rows || []) as FriendRow[];
    const otherIds = [...new Set(friendRows.map(r => r.user_id === user.id ? r.friend_id : r.user_id))];
    let profileMap: Record<string, string> = {};

    if (otherIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, username').in('id', otherIds);
      (profiles || []).forEach((p: Profile) => { profileMap[p.id] = p.username; });
    }

    const acceptedFriends: Friend[] = [];
    const pendingRequests: PendingRequest[] = [];

    for (const row of friendRows) {
      const otherId = row.user_id === user.id ? row.friend_id : row.user_id;
      const username = profileMap[otherId] || 'Unknown';
      if (row.status === 'accepted') {
        acceptedFriends.push({ id: otherId, username, rowId: row.id });
      } else if (row.status === 'pending') {
        const direction: 'inbound' | 'outbound' = row.friend_id === user.id ? 'inbound' : 'outbound';
        pendingRequests.push({ id: otherId, username, rowId: row.id, direction });
      }
    }

    setFriends(acceptedFriends);
    setPending(pendingRequests);
    setLoading(false);
  }, [user]);

  useEffect(() => { fetchFriends(); }, [fetchFriends]);

  const handleSearch = async () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    setSearching(true); setFoundUser(null); setSearchError('');
    const { data, error } = await supabase.from('profiles').select('id, username').eq('username', trimmed).single();
    setSearching(false);
    if (error || !data) { setSearchError(`No user found with username "${trimmed}"`); return; }
    if (data.id === user!.id) { setSearchError("That's your own username!"); return; }
    if (friends.some(f => f.id === data.id)) { setSearchError('You are already friends with this user.'); return; }
    if (pending.some(p => p.id === data.id)) { setSearchError('A friend request already exists with this user.'); return; }
    setFoundUser(data as Profile);
  };

  const handleSendRequest = async () => {
    if (!foundUser || !user) return;
    setSending(true);
    const { error } = await supabase.from('friends').insert({ user_id: user.id, friend_id: foundUser.id, status: 'pending' });
    setSending(false);
    if (error) {
      toast.error(error.code === '23505' ? 'Friend request already sent.' : 'Failed: ' + error.message);
      return;
    }
    toast.success(`Friend request sent to @${foundUser.username}!`);
    setShowAdd(false); setQuery(''); setFoundUser(null);
    fetchFriends();
  };

  const handleAccept = async (rowId: string, username: string) => {
    const { error } = await supabase.from('friends').update({ status: 'accepted' }).eq('id', rowId);
    if (error) { toast.error('Failed to accept request'); return; }
    toast.success(`You and @${username} are now friends!`);
    fetchFriends();
  };

  const handleReject = async (rowId: string) => {
    const { error } = await supabase.from('friends').delete().eq('id', rowId);
    if (error) { toast.error('Failed to remove request'); return; }
    fetchFriends();
  };

  const handleUnfriend = async (rowId: string, username: string) => {
    const { error } = await supabase.from('friends').delete().eq('id', rowId);
    if (error) { toast.error('Failed to unfriend'); return; }
    toast.success(`Removed @${username} from friends.`);
    fetchFriends();
  };

  const filteredFriends = friends.filter(f => f.username.toLowerCase().includes(search.toLowerCase()));
  const inbound  = pending.filter(p => p.direction === 'inbound');
  const outbound = pending.filter(p => p.direction === 'outbound');

  return (
    <div className="min-h-screen bg-background px-5 pt-12 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-heading font-bold text-foreground">Friends</h1>
        <button
          onClick={() => { setShowAdd(true); setQuery(''); setFoundUser(null); setSearchError(''); }}
          className="w-10 h-10 gradient-primary rounded-xl flex items-center justify-center">
          <UserPlus className="w-5 h-5 text-primary-foreground" />
        </button>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Search friends..." value={search} onChange={e => setSearch(e.target.value)} className="bg-secondary border-border pl-10" />
      </div>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
      ) : (
        <>
          {inbound.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Friend Requests ({inbound.length})</h3>
              <div className="space-y-2">
                {inbound.map(req => (
                  <div key={req.rowId} className="glass-card p-4 flex items-center gap-3 animate-slide-up">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                      {req.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">@{req.username}</p>
                      <p className="text-xs text-muted-foreground">Wants to be your friend</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => handleAccept(req.rowId, req.username)}
                        className="w-9 h-9 rounded-xl bg-success/20 hover:bg-success/30 flex items-center justify-center transition-colors">
                        <Check className="w-4 h-4 text-success" />
                      </button>
                      <button onClick={() => handleReject(req.rowId)}
                        className="w-9 h-9 rounded-xl bg-destructive/20 hover:bg-destructive/30 flex items-center justify-center transition-colors">
                        <X className="w-4 h-4 text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {outbound.length > 0 && (
            <div className="mb-6">
              <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Sent Requests ({outbound.length})</h3>
              <div className="space-y-2">
                {outbound.map(req => (
                  <div key={req.rowId} className="glass-card p-4 flex items-center gap-3 animate-slide-up">
                    <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center text-lg font-bold text-muted-foreground">
                      {req.username[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground">@{req.username}</p>
                      <p className="text-xs text-muted-foreground">Request pending...</p>
                    </div>
                    <button onClick={() => handleReject(req.rowId)}
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded-lg border border-border">
                      Cancel
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <h3 className="text-xs font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Friends ({friends.length})</h3>

          {filteredFriends.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">{search ? 'No friends match your search' : 'No friends yet'}</p>
              <p className="text-sm mt-1">{!search && 'Tap + to add friends by username'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredFriends.map(friend => (
                <div key={friend.rowId} className="glass-card p-4 flex items-center gap-3 animate-fade-in">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                    {friend.username[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">@{friend.username}</p>
                  </div>
                  <button onClick={() => handleUnfriend(friend.rowId, friend.username)}
                    className="w-8 h-8 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center transition-colors">
                    <UserMinus className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Sheet open={showAdd} onOpenChange={setShowAdd}>
        <SheetContent side="bottom" className="bg-card border-border rounded-t-3xl">
          <SheetHeader>
            <SheetTitle className="font-heading text-foreground">Add Friend</SheetTitle>
          </SheetHeader>
          <div className="space-y-4 mt-5 pb-6 px-5">
            <p className="text-sm text-muted-foreground">Search by exact username to send a friend request.</p>
            <div className="flex gap-2">
              <Input
                placeholder="Enter username exactly..."
                value={query}
                onChange={e => { setQuery(e.target.value); setFoundUser(null); setSearchError(''); }}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                className="bg-secondary border-border"
              />
              <Button onClick={handleSearch} disabled={searching || !query.trim()} variant="secondary" className="shrink-0">
                {searching ? '...' : 'Search'}
              </Button>
            </div>
            {searchError && <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-xl">{searchError}</p>}
            {foundUser && (
              <div className="glass-card p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {foundUser.username[0].toUpperCase()}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-foreground">@{foundUser.username}</p>
                  <p className="text-xs text-muted-foreground">Found! Ready to send request.</p>
                </div>
                <Button onClick={handleSendRequest} disabled={sending} size="sm" className="gradient-primary text-primary-foreground shrink-0">
                  {sending ? 'Sending...' : 'Add Friend'}
                </Button>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default Friends;
