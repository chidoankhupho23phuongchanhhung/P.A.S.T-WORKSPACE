'use client'

import { useEffect, useRef, useState, useCallback, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

// ─── Types ────────────────────────────────────────────────────
export interface Profile {
  id: string
  fullName: string
  avatarUrl?: string
  role: 'admin' | 'leader' | 'member'
}

export interface PinnedItemData {
  id: string
  label?: string
  externalUrl?: string
  messageId?: string
  pinnedBy: Pick<Profile, 'fullName'>
}

export interface ReadStatus {
  userId: string
  readAt: string
}

export interface Message {
  id: string
  content: string
  senderId: string
  channelId: string
  parentId?: string | null
  isTaskCard: boolean
  createdAt: string
  editedAt?: string | null
  sender: Pick<Profile, 'id' | 'fullName' | 'avatarUrl'>
  replies?: Message[]
  readStatus?: ReadStatus[]
  replyCount?: number
}

interface ChatWindowProps {
  channelId: string
  channelName: string
  channelType: 'PUBLIC' | 'PRIVATE'
  currentUser: Profile
  pinnedItems?: PinnedItemData[]
  totalMembers?: number
}

// ─── Utility: initials from name ──────────────────────────────
function initials(name: string) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

// ─── Utility: format timestamp ────────────────────────────────
function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function formatDate(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Hôm nay'
  if (d.toDateString() === yesterday.toDateString()) return 'Hôm qua'
  return d.toLocaleDateString('vi-VN', { day: 'numeric', month: 'long' })
}

// ─── Pin Bar ──────────────────────────────────────────────────
function PinBar({ pins }: { pins: PinnedItemData[] }) {
  const popoverRef = useRef<HTMLDivElement>(null)

  const handlePinClick = () => {
    if (popoverRef.current) {
      // Use Popover API (Baseline widely available)
      ;(popoverRef.current as any).showPopover?.()
    }
  }

  if (pins.length === 0) return null

  return (
    <>
      <div className="pin-bar" role="toolbar" aria-label="Tài liệu được ghim">
        <span className="pin-bar__label">
          <span aria-hidden>📌</span> Ghim
        </span>
        {pins.slice(0, 5).map((pin) => (
          <button
            key={pin.id}
            className="pin-chip"
            onClick={handlePinClick}
            title={pin.label ?? pin.externalUrl ?? 'Tài liệu được ghim'}
            aria-haspopup="dialog"
          >
            <span className="pin-chip__icon" aria-hidden>
              {pin.externalUrl ? '🔗' : '📄'}
            </span>
            <span className="truncate" style={{ maxInlineSize: '160px' }}>
              {pin.label ?? pin.externalUrl ?? 'Tài liệu'}
            </span>
          </button>
        ))}
        {pins.length > 5 && (
          <button className="pin-chip" onClick={handlePinClick}>
            +{pins.length - 5} nữa
          </button>
        )}
      </div>

      {/* Popover (native Popover API) */}
      <div
        ref={popoverRef}
        className="pin-popover"
        popover="auto"
        id="pin-popover"
        role="dialog"
        aria-label="Danh sách tài liệu được ghim"
      >
        <div className="pin-popover__header">
          <span aria-hidden>📌</span>
          Tài liệu được ghim ({pins.length})
        </div>
        <ul className="pin-popover__list" role="list">
          {pins.map((pin) => (
            <li key={pin.id}>
              <a
                href={pin.externalUrl ?? '#'}
                target={pin.externalUrl ? '_blank' : undefined}
                rel="noopener noreferrer"
                className="pin-popover__item"
              >
                <span className="pin-popover__item-icon" aria-hidden>
                  {pin.externalUrl ? '🔗' : '📄'}
                </span>
                <div>
                  <div className="pin-popover__item-label">
                    {pin.label ?? pin.externalUrl ?? 'Tài liệu'}
                  </div>
                  <div className="pin-popover__item-meta">
                    Ghim bởi {pin.pinnedBy.fullName}
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

// ─── Read Receipts ────────────────────────────────────────────
function ReadReceipts({
  readCount,
  totalMembers,
}: {
  readCount: number
  totalMembers: number
}) {
  if (readCount === 0) return null
  return (
    <div className="read-receipts" title={`${readCount}/${totalMembers} thành viên đã xem`}>
      <span className="read-receipts__icon" aria-hidden>✓✓</span>
      <span aria-label={`Đã xem ${readCount} trên ${totalMembers} thành viên`}>
        {readCount}/{totalMembers}
      </span>
    </div>
  )
}

// ─── Bubble Actions ───────────────────────────────────────────
function BubbleActions({
  onReply,
  onPin,
  isAdmin,
}: {
  onReply: () => void
  onPin?: () => void
  isAdmin: boolean
}) {
  return (
    <div className="bubble-actions" role="toolbar" aria-label="Thao tác tin nhắn">
      <button
        className="bubble-action-btn"
        onClick={onReply}
        title="Trả lời trong luồng"
        aria-label="Trả lời tin nhắn này"
      >
        💬 Trả lời
      </button>
      {isAdmin && onPin && (
        <button
          className="bubble-action-btn"
          onClick={onPin}
          title="Ghim tài liệu"
          aria-label="Ghim tin nhắn này"
        >
          📌
        </button>
      )}
      <button className="bubble-action-btn" title="Thêm reaction" aria-label="Thêm phản hồi">
        😊
      </button>
    </div>
  )
}

// ─── Single Message Bubble ────────────────────────────────────
function MessageBubble({
  message,
  isOwn,
  currentUser,
  totalMembers,
  onReply,
  onPin,
}: {
  message: Message
  isOwn: boolean
  currentUser: Profile
  totalMembers: number
  onReply: (msg: Message) => void
  onPin?: (msg: Message) => void
}) {
  const readCount = message.readStatus?.length ?? 0

  return (
    <div className={`msg-group ${isOwn ? 'msg-group--own' : ''}`}>
      {!isOwn && (
        <div
          className="msg-group__avatar"
          aria-label={message.sender.fullName}
          title={message.sender.fullName}
        >
          {message.sender.avatarUrl ? (
            <img
              src={message.sender.avatarUrl}
              alt={message.sender.fullName}
              style={{ borderRadius: '50%', width: '100%', height: '100%', objectFit: 'cover' }}
            />
          ) : (
            initials(message.sender.fullName)
          )}
        </div>
      )}

      <div className="msg-group__content">
        {!isOwn && (
          <div className="msg-group__meta">
            <span className="msg-group__sender">{message.sender.fullName}</span>
            <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
          </div>
        )}

        <div className="bubble-wrapper" style={{ position: 'relative' }}>
          <div
            className={[
              'bubble',
              isOwn ? 'bubble--own' : 'bubble--other',
              message.isTaskCard ? 'bubble--task-card' : '',
            ].filter(Boolean).join(' ')}
          >
            {message.isTaskCard && (
              <div className="bubble__task-badge">🎯 Thẻ công việc</div>
            )}
            <p>{message.content}</p>
            {isOwn && (
              <time
                dateTime={message.createdAt}
                style={{
                  display: 'block',
                  fontSize: '10px',
                  color: 'var(--clr-text-muted)',
                  marginBlockStart: '4px',
                  textAlign: 'right',
                }}
              >
                {formatTime(message.createdAt)}
                {message.editedAt && ' · đã chỉnh sửa'}
              </time>
            )}

            <BubbleActions
              onReply={() => onReply(message)}
              onPin={currentUser.role === 'admin' ? () => onPin?.(message) : undefined}
              isAdmin={currentUser.role === 'admin'}
            />
          </div>

          {/* Thread reply count badge */}
          {(message.replyCount ?? 0) > 0 && (
            <button
              onClick={() => onReply(message)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '11px',
                color: 'var(--clr-accent)',
                marginBlockStart: '4px',
                paddingInlineStart: isOwn ? 0 : 'var(--sp-2)',
                background: 'none',
              }}
              aria-label={`Xem ${message.replyCount} phản hồi trong luồng`}
            >
              💬 {message.replyCount} phản hồi
            </button>
          )}
        </div>

        {isOwn && (
          <ReadReceipts readCount={readCount} totalMembers={totalMembers} />
        )}
      </div>
    </div>
  )
}

// ─── Date Divider ─────────────────────────────────────────────
function DateDivider({ date }: { date: string }) {
  return (
    <div
      role="separator"
      aria-label={`Tin nhắn ngày ${date}`}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--sp-3)',
        color: 'var(--clr-text-muted)',
        fontSize: 'var(--text-xs)',
        margin: 'var(--sp-2) 0',
      }}
    >
      <div style={{ flex: 1, height: '1px', background: 'var(--clr-border)' }} />
      <span>{date}</span>
      <div style={{ flex: 1, height: '1px', background: 'var(--clr-border)' }} />
    </div>
  )
}

// ─── Thread Panel ─────────────────────────────────────────────
function ThreadPanel({
  parentMessage,
  replies,
  currentUser,
  totalMembers,
  onClose,
  onSendReply,
  isOpen,
}: {
  parentMessage: Message | null
  replies: Message[]
  currentUser: Profile
  totalMembers: number
  onClose: () => void
  onSendReply: (content: string) => Promise<void>
  isOpen: boolean
}) {
  const [replyText, setReplyText] = useState('')
  const [sending, startSending] = useTransition()
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleSend = () => {
    if (!replyText.trim()) return
    startSending(async () => {
      await onSendReply(replyText.trim())
      setReplyText('')
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <aside
      className="thread-panel"
      data-open={isOpen ? 'true' : 'false'}
      aria-label="Luồng thảo luận"
      aria-hidden={!isOpen}
    >
      <header className="thread-panel__header">
        <h2 className="thread-panel__title">💬 Luồng thảo luận</h2>
        <button
          className="thread-panel__close"
          onClick={onClose}
          aria-label="Đóng luồng thảo luận"
        >
          ✕
        </button>
      </header>

      <div className="thread-panel__messages">
        {/* Parent message preview */}
        {parentMessage && (
          <div className="thread-panel__parent" aria-label="Tin nhắn gốc">
            <div style={{ fontWeight: 600, marginBlockEnd: '4px', fontSize: '11px', color: 'var(--clr-accent)' }}>
              {parentMessage.sender.fullName}
            </div>
            <p style={{ fontSize: 'var(--text-xs)', lineHeight: '1.4' }}>
              {parentMessage.content}
            </p>
          </div>
        )}

        {/* Thread replies */}
        {replies.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--sp-8) var(--sp-4)' }}>
            <div className="empty-state__icon">💭</div>
            <p className="empty-state__text">Chưa có phản hồi nào.<br />Hãy là người đầu tiên!</p>
          </div>
        ) : (
          replies.map((reply) => (
            <MessageBubble
              key={reply.id}
              message={reply}
              isOwn={reply.senderId === currentUser.id}
              currentUser={currentUser}
              totalMembers={totalMembers}
              onReply={() => {}} // no nested threads
              onPin={undefined}
            />
          ))
        )}
      </div>

      {/* Thread input */}
      <div className="chat-input-area chat-input-area--thread">
        <div className="chat-input-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-input"
            placeholder="Trả lời trong luồng..."
            value={replyText}
            onChange={(e) => setReplyText(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label="Nhập phản hồi"
            disabled={!parentMessage || sending}
          />
        </div>
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!replyText.trim() || sending || !parentMessage}
          aria-label="Gửi phản hồi"
        >
          {sending ? '...' : '↑'}
        </button>
      </div>
    </aside>
  )
}

// ─── Typing Indicator ─────────────────────────────────────────
function TypingIndicator({ names }: { names: string[] }) {
  if (names.length === 0) return null
  const label = names.length === 1
    ? `${names[0]} đang nhập...`
    : `${names.slice(0, 2).join(', ')} đang nhập...`

  return (
    <div className="typing-indicator" role="status" aria-live="polite" aria-label={label}>
      <div className="typing-dot" aria-hidden />
      <div className="typing-dot" aria-hidden />
      <div className="typing-dot" aria-hidden />
      <span style={{ fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)', marginInlineStart: '4px' }}>
        {label}
      </span>
    </div>
  )
}

// ─── Main Chat Window ─────────────────────────────────────────
export default function ChatWindow({
  channelId,
  channelName,
  channelType,
  currentUser,
  pinnedItems = [],
  totalMembers = 1,
}: ChatWindowProps) {
  const supabase = createClient()

  const [messages, setMessages] = useState<Message[]>([])
  const [typingUsers, setTypingUsers] = useState<string[]>([])
  const [inputText, setInputText] = useState('')
  const [sending, startSending] = useTransition()
  const [threadOpen, setThreadOpen] = useState(false)
  const [threadParent, setThreadParent] = useState<Message | null>(null)
  const [threadReplies, setThreadReplies] = useState<Message[]>([])
  const [isConnected, setIsConnected] = useState(false)

  const messageListRef = useRef<HTMLDivElement>(null)
  const realtimeRef = useRef<RealtimeChannel | null>(null)
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Scroll to bottom ────────────────────────────────────────
  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = messageListRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  // ── Mark messages as read ───────────────────────────────────
  const markAsRead = useCallback(async (messageIds: string[]) => {
    if (!messageIds.length) return
    try {
      await fetch('/api/messages/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds, userId: currentUser.id }),
      })
    } catch { /* silent fail */ }
  }, [currentUser.id])

  // ── Load initial messages ────────────────────────────────────
  useEffect(() => {
    const loadMessages = async () => {
      try {
        const res = await fetch(`/api/channels/${channelId}/messages`)
        if (!res.ok) return
        const data: Message[] = await res.json()
        setMessages(data)
        // Mark unread messages as read
        const unread = data
          .filter(m => !m.readStatus?.some(r => r.userId === currentUser.id))
          .map(m => m.id)
        markAsRead(unread)
      } catch { /* handled gracefully */ }
    }
    loadMessages()
  }, [channelId, currentUser.id, markAsRead])

  // ── Scroll on new messages ───────────────────────────────────
  useEffect(() => {
    scrollToBottom()
  }, [messages.length, scrollToBottom])

  // ── Supabase Realtime ────────────────────────────────────────
  useEffect(() => {
    const channel = supabase.channel(`chat:${channelId}`, {
      config: { broadcast: { self: false }, presence: { key: currentUser.id } },
    })

    // New message
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `channel_id=eq.${channelId}`,
      },
      async (payload) => {
        const newMsg = payload.new as Message
        // Fetch sender info
        try {
          const res = await fetch(`/api/messages/${newMsg.id}`)
          if (res.ok) {
            const full: Message = await res.json()
            if (full.parentId) {
              // It's a reply — update thread if open
              setThreadReplies(prev =>
                full.parentId === threadParent?.id ? [...prev, full] : prev
              )
              // Increment reply count on parent
              setMessages(prev =>
                prev.map(m =>
                  m.id === full.parentId
                    ? { ...m, replyCount: (m.replyCount ?? 0) + 1 }
                    : m
                )
              )
            } else {
              setMessages(prev => [...prev, full])
              markAsRead([full.id])
            }
          }
        } catch { /* graceful */ }
      }
    )

    // Read receipt updates
    channel.on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'message_read_status',
      },
      (payload) => {
        const { message_id, user_id, read_at } = payload.new as {
          message_id: string; user_id: string; read_at: string
        }
        setMessages(prev =>
          prev.map(m =>
            m.id === message_id
              ? {
                  ...m,
                  readStatus: [
                    ...(m.readStatus ?? []).filter(r => r.userId !== user_id),
                    { userId: user_id, readAt: read_at },
                  ],
                }
              : m
          )
        )
      }
    )

    // Typing presence
    channel.on('broadcast', { event: 'typing' }, ({ payload }) => {
      const { userId, userName, isTyping } = payload as {
        userId: string; userName: string; isTyping: boolean
      }
      if (userId === currentUser.id) return
      setTypingUsers(prev =>
        isTyping
          ? prev.includes(userName) ? prev : [...prev, userName]
          : prev.filter(n => n !== userName)
      )
    })

    channel.subscribe((status) => {
      setIsConnected(status === 'SUBSCRIBED')
    })

    realtimeRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [channelId, currentUser.id, threadParent?.id, markAsRead, supabase])

  // ── Broadcast typing ─────────────────────────────────────────
  const broadcastTyping = useCallback((isTyping: boolean) => {
    realtimeRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId: currentUser.id, userName: currentUser.fullName, isTyping },
    })
  }, [currentUser.id, currentUser.fullName])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputText(e.target.value)
    broadcastTyping(true)
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    typingTimerRef.current = setTimeout(() => broadcastTyping(false), 2000)
  }

  // ── Send message ─────────────────────────────────────────────
  const sendMessage = useCallback(async (content: string, parentId?: string) => {
    if (!content.trim()) return
    try {
      await fetch('/api/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channelId,
          senderId: currentUser.id,
          content: content.trim(),
          parentId: parentId ?? null,
        }),
      })
      broadcastTyping(false)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }, [channelId, currentUser.id, broadcastTyping])

  const handleSend = () => {
    if (!inputText.trim()) return
    startSending(async () => {
      await sendMessage(inputText.trim())
      setInputText('')
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // ── Open thread ──────────────────────────────────────────────
  const openThread = useCallback(async (msg: Message) => {
    setThreadParent(msg)
    setThreadOpen(true)
    // Load replies
    try {
      const res = await fetch(`/api/messages/${msg.id}/replies`)
      if (res.ok) {
        const replies: Message[] = await res.json()
        setThreadReplies(replies)
      }
    } catch { /* graceful */ }
  }, [])

  const closeThread = useCallback(() => {
    setThreadOpen(false)
    setThreadParent(null)
    setThreadReplies([])
  }, [])

  const sendReply = useCallback(async (content: string) => {
    if (!threadParent) return
    await sendMessage(content, threadParent.id)
  }, [threadParent, sendMessage])

  // ── Group messages by date ───────────────────────────────────
  const groupedMessages = messages.reduce<Array<{ date: string; messages: Message[] }>>((groups, msg) => {
    const date = formatDate(msg.createdAt)
    const last = groups[groups.length - 1]
    if (last && last.date === date) {
      last.messages.push(msg)
    } else {
      groups.push({ date, messages: [msg] })
    }
    return groups
  }, [])

  // ─────────────────────────────────────────────────────────────
  return (
    <div className="chat-area" aria-label={`Kênh ${channelName}`}>
      {/* Pin Bar */}
      <PinBar pins={pinnedItems} />

      {/* Channel Header */}
      <header
        className="channel-header"
        style={{ gridColumn: '1', gridRow: '1', borderBlockEnd: 'none' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)' }}>
          <span style={{ fontSize: 'var(--text-lg)', fontWeight: 700 }}>
            {channelType === 'PRIVATE' ? '🔒' : '#'} {channelName}
          </span>
          {isConnected && (
            <span title="Kết nối realtime đang hoạt động">
              <span className="status-dot" aria-label="Đang kết nối" />
            </span>
          )}
        </div>
        <div style={{ marginInlineStart: 'auto', fontSize: 'var(--text-xs)', color: 'var(--clr-text-muted)' }}>
          👥 {totalMembers} thành viên
        </div>
      </header>

      {/* Message List */}
      <main
        className="message-list"
        ref={messageListRef}
        aria-label="Tin nhắn"
        aria-live="polite"
        aria-atomic="false"
      >
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state__icon">💬</div>
            <p className="empty-state__text">Chưa có tin nhắn nào.<br />Hãy bắt đầu cuộc trò chuyện!</p>
          </div>
        ) : (
          groupedMessages.map(({ date, messages: dayMsgs }) => (
            <div key={date}>
              <DateDivider date={date} />
              {dayMsgs.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isOwn={msg.senderId === currentUser.id}
                  currentUser={currentUser}
                  totalMembers={totalMembers}
                  onReply={openThread}
                  onPin={async (m) => {
                    // POST /api/channels/:id/pins
                    await fetch(`/api/channels/${channelId}/pins`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ messageId: m.id, pinnedById: currentUser.id }),
                    })
                  }}
                />
              ))}
            </div>
          ))
        )}

        <TypingIndicator names={typingUsers} />
      </main>

      {/* Main Chat Input */}
      <div className="chat-input-area" style={{ gridColumn: '1' }}>
        <div className="chat-input-wrapper">
          <textarea
            className="chat-input"
            placeholder={`Nhắn tin tới #${channelName}...`}
            value={inputText}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            rows={1}
            aria-label={`Nhắn tin tới kênh ${channelName}`}
            disabled={sending}
          />
        </div>
        <button
          className="chat-send-btn"
          onClick={handleSend}
          disabled={!inputText.trim() || sending}
          aria-label="Gửi tin nhắn"
        >
          {sending ? '...' : '↑'}
        </button>
      </div>

      {/* Thread Panel */}
      <ThreadPanel
        parentMessage={threadParent}
        replies={threadReplies}
        currentUser={currentUser}
        totalMembers={totalMembers}
        onClose={closeThread}
        onSendReply={sendReply}
        isOpen={threadOpen}
      />
    </div>
  )
}
