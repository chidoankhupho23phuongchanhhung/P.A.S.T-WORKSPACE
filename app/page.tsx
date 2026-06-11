// app/page.tsx
'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import ChatWindow from '@/components/chat/ChatWindow'
import { TaskTreeView } from '@/components/tasks/TaskTreeView'
import { SmartCalendar } from '@/components/calendar/SmartCalendar'

interface Profile {
  id: string
  fullName: string
  avatarUrl: string | null
  role: 'admin' | 'leader' | 'member'
}

interface Channel {
  id: string
  name: string
  description: string | null
  type: 'PUBLIC' | 'PRIVATE'
  ownerId: string
  _count?: { members: number }
}

export default function Home() {
  const [sessionUser, setSessionUser] = useState<any>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [activeTab, setActiveTab] = useState<'chat' | 'tasks' | 'calendar'>('chat')
  
  // Auth state
  const [isSignUp, setIsSignUp] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [authLoading, setAuthLoading] = useState(false)
  
  // Channels state
  const [channels, setChannels] = useState<Channel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelType, setNewChannelType] = useState<'PUBLIC' | 'PRIVATE'>('PUBLIC')
  const [showChannelModal, setShowChannelModal] = useState(false)
  
  const [appLoading, setAppLoading] = useState(true)

  const supabase = createClient()

  // 1. Load active user session & profile
  useEffect(() => {
    async function loadSession() {
      try {
        setAppLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
          setSessionUser(user)
          // Ensure profile is initialized
          await fetch('/api/auth/profile', { method: 'POST' })
          
          // Get profile details
          const res = await fetch('/api/profiles')
          if (res.ok) {
            const profiles: Profile[] = await res.json()
            const myProfile = profiles.find((p) => p.id === user.id)
            if (myProfile) setProfile(myProfile)
          }

          // Fetch channels
          const channelsRes = await fetch('/api/channels')
          if (channelsRes.ok) {
            const channelsData = await channelsRes.json()
            setChannels(channelsData)
            if (channelsData.length > 0) {
              setSelectedChannel(channelsData[0])
            }
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setAppLoading(false)
      }
    }
    loadSession()
  }, [])

  // 2. Auth handlers
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return

    try {
      setAuthLoading(true)
      if (isSignUp) {
        // Sign Up
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName || email.split('@')[0] }
          }
        })
        if (error) throw error
        
        // Auto sign-in or alert activation
        alert('Đăng ký thành công! Hãy đăng nhập.')
        setIsSignUp(false)
      } else {
        // Sign In
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        
        setSessionUser(data.user)
        // Initialize profile record in database
        await fetch('/api/auth/profile', { method: 'POST' })
        
        // Fetch profiles
        const res = await fetch('/api/profiles')
        if (res.ok) {
          const profiles: Profile[] = await res.json()
          const myProfile = profiles.find((p) => p.id === data.user.id)
          if (myProfile) setProfile(myProfile)
        }

        // Fetch channels
        const channelsRes = await fetch('/api/channels')
        if (channelsRes.ok) {
          const channelsData = await channelsRes.json()
          setChannels(channelsData)
          if (channelsData.length > 0) {
            setSelectedChannel(channelsData[0])
          }
        }
      }
    } catch (err: any) {
      alert(err.message || 'Lỗi xác thực thông tin')
    } finally {
      setAuthLoading(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    setSessionUser(null)
    setProfile(null)
    setChannels([])
    setSelectedChannel(null)
  }

  // Create Channel (Admin/Leader only)
  const handleCreateChannel = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newChannelName.trim()) return

    try {
      const res = await fetch('/api/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newChannelName,
          type: newChannelType
        })
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Lỗi tạo kênh chat')
      }

      const created = await res.json()
      setChannels((prev) => [...prev, created])
      setSelectedChannel(created)
      setNewChannelName('')
      setShowChannelModal(false)
    } catch (err: any) {
      alert(err.message)
    }
  }

  if (appLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#050714] text-white">
        <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
        <span className="text-white/60 text-sm">Đang khởi tạo ứng dụng...</span>
      </div>
    )
  }

  // ─── AUTHENTICATION SCREEN (GLASSMORPHISM) ───────────────────
  if (!sessionUser) {
    return (
      <main className="flex items-center justify-center min-h-screen bg-[#050714] px-4 relative overflow-hidden">
        {/* Decorative ambient orbs background */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 rounded-full bg-blue-500/10 filter blur-[80px]" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full bg-indigo-500/10 filter blur-[80px]" />
        
        <div className="w-full max-w-md backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl space-y-6 relative z-10 transition-all">
          <div className="text-center space-y-2">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent">
              P.A.S.T WORKSPACE
            </h1>
            <p className="text-xs md:text-sm text-white/50">
              {isSignUp ? 'Đăng ký tài khoản thành viên mới' : 'Đăng nhập vào hệ thống làm việc nội bộ'}
            </p>
          </div>

          <form onSubmit={handleAuth} className="space-y-4">
            {isSignUp && (
              <div className="space-y-1">
                <label className="text-xs font-semibold text-white/60">Họ và Tên</label>
                <input
                  type="text"
                  required
                  placeholder="Nguyễn Văn A"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-white/20 transition-all"
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/60">Địa chỉ Email</label>
              <input
                type="email"
                required
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-white/20 transition-all"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-white/60">Mật khẩu</label>
              <input
                type="password"
                required
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500 placeholder-white/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={authLoading}
              className="w-full py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg font-bold text-sm shadow-lg hover:shadow-blue-500/25 transition-all disabled:opacity-50"
            >
              {authLoading ? 'Đang xử lý...' : isSignUp ? 'Đăng ký ngay' : 'Đăng nhập'}
            </button>
          </form>

          <div className="text-center pt-2">
            <button
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-xs text-blue-400 hover:underline"
            >
              {isSignUp ? 'Đã có tài khoản? Đăng nhập' : 'Chưa có tài khoản? Đăng ký ngay'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  const isPrivileged = profile && ['admin', 'leader'].includes(profile.role)

  // ─── MAIN APP WORKSPACE SHELL ────────────────────────────────
  return (
    <main className="app-shell bg-[#050714] text-white">
      {/* 1. LEFT SIDEBAR */}
      <aside className="sidebar">
        {/* Workspace Title & Brand */}
        <div className="sidebar__header">
          <h1 className="sidebar__title">P.A.S.T WORKSPACE</h1>
          <span className="text-[10px] text-white/40 font-mono tracking-wider block mt-0.5">Lark Clone v1.2</span>
        </div>

        {/* User profile card */}
        {profile && (
          <div className="p-3 mx-2 mt-2 rounded-xl bg-white/5 border border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-xs font-bold text-white uppercase flex-shrink-0">
                {profile.fullName.charAt(0)}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold block truncate text-white/95">{profile.fullName}</span>
                <span className="text-[10px] uppercase font-bold text-blue-400 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.2 rounded-full inline-block mt-0.5">
                  {profile.role}
                </span>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-colors"
              title="Đăng xuất"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}

        {/* Navigation Tabs List */}
        <div className="sidebar__section-label">Ứng dụng</div>
        <nav className="flex flex-col gap-1 px-2">
          <button
            onClick={() => setActiveTab('chat')}
            aria-selected={activeTab === 'chat'}
            className="channel-item"
          >
            <span>💬</span>
            <span className="font-medium">Hội thoại nhóm</span>
          </button>
          
          <button
            onClick={() => setActiveTab('tasks')}
            aria-selected={activeTab === 'tasks'}
            className="channel-item"
          >
            <span>🌳</span>
            <span className="font-medium">Cây công việc (Nodes)</span>
          </button>

          <button
            onClick={() => setActiveTab('calendar')}
            aria-selected={activeTab === 'calendar'}
            className="channel-item"
          >
            <span>📅</span>
            <span className="font-medium">Lịch công tác (RSVP)</span>
          </button>
        </nav>

        {/* Channels List (Only displayed when activeTab is chat) */}
        {activeTab === 'chat' && (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="sidebar__section-label flex items-center justify-between">
              <span>Kênh trò chuyện</span>
              {isPrivileged && (
                <button
                  onClick={() => setShowChannelModal(true)}
                  className="p-1 hover:bg-white/10 rounded-full transition-colors text-white/50 hover:text-white"
                  title="Tạo kênh chat mới"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              )}
            </div>

            <div className="sidebar__list scrollbar-thin">
              {channels.map((chan) => (
                <button
                  key={chan.id}
                  onClick={() => setSelectedChannel(chan)}
                  aria-selected={selectedChannel?.id === chan.id}
                  className="channel-item w-[calc(100%-16px)]"
                >
                  <span className="text-white/40">{chan.type === 'PRIVATE' ? '🔒' : '#'}</span>
                  <span className="truncate flex-1 text-left">{chan.name}</span>
                  <span className="channel-item__badge">{chan._count?.members || 1}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* 2. MAIN WORKSPACE PANELS */}
      <section className="flex flex-col h-screen overflow-y-auto scrollbar-thin bg-transparent">
        <div className="p-4 md:p-6 flex-1 flex flex-col min-h-0">
          
          {/* A: Tab CHAT */}
          {activeTab === 'chat' && (
            selectedChannel && profile ? (
              <ChatWindow
                key={selectedChannel.id}
                channelId={selectedChannel.id}
                channelName={selectedChannel.name}
                channelType={selectedChannel.type}
                currentUser={profile}
                pinnedItems={[]} // Can be fetched from channel pins API
                totalMembers={selectedChannel._count?.members || 1}
              />
            ) : (
              <div className="flex-1 flex items-center justify-center p-12 text-center rounded-2xl backdrop-blur-md bg-white/5 border border-white/10">
                <div>
                  <div className="text-3xl mb-3">💬</div>
                  <p className="text-white/50 text-sm">Chưa có kênh trò chuyện nào được chọn hoặc khởi tạo.</p>
                </div>
              </div>
            )
          )}

          {/* B: Tab TASKS TREE */}
          {activeTab === 'tasks' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent mb-1">
                Quản lý công việc dạng Nodes (Google Chips UI)
              </h2>
              <TaskTreeView />
            </div>
          )}

          {/* C: Tab SMART RSVP CALENDAR */}
          {activeTab === 'calendar' && (
            <div className="space-y-4">
              <h2 className="text-xl font-bold tracking-tight bg-gradient-to-r from-blue-400 to-indigo-300 bg-clip-text text-transparent mb-1">
                Lịch Công Tác CLB & Biểu Quyết RSVP
              </h2>
              <SmartCalendar />
            </div>
          )}
        </div>
      </section>

      {/* 3. POPUP DIALOG: Create Channel Modal */}
      {showChannelModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm backdrop-blur-xl bg-[#090b16]/90 border border-white/10 rounded-2xl p-6 shadow-2xl space-y-4 text-white animate-msgSlideIn">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-md font-bold">Tạo kênh thảo luận mới</h3>
              <button
                onClick={() => setShowChannelModal(false)}
                className="text-white/40 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateChannel} className="space-y-4 text-sm">
              <div className="space-y-1">
                <label className="text-xs text-white/60">Tên kênh trò chuyện *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: ban-truyen-thong"
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/20 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs text-white/60">Loại kênh</label>
                <select
                  value={newChannelType}
                  onChange={(e) => setNewChannelType(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                >
                  <option value="PUBLIC" className="bg-[#0b0f19]">Công khai (Public)</option>
                  <option value="PRIVATE" className="bg-[#0b0f19]">Riêng tư (Private)</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowChannelModal(false)}
                  className="px-3.5 py-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs font-semibold"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={!newChannelName.trim()}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-xs font-bold shadow-lg disabled:opacity-50"
                >
                  Tạo kênh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}
