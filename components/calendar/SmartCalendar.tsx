// components/calendar/SmartCalendar.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Profile {
  id: string
  fullName: string
  avatarUrl: string | null
  role: 'admin' | 'leader' | 'member'
}

interface EventAttendance {
  id: string
  eventId: string
  userId: string
  status: 'pending' | 'yes' | 'no'
  excuse: string | null
  user: {
    id: string
    fullName: string
    avatarUrl: string | null
  }
}

interface Event {
  id: string
  title: string
  content: string | null
  location: string | null
  startTime: string
  endTime: string
  createdById: string
  createdBy: {
    id: string
    fullName: string
    avatarUrl: string | null
  }
  attendance: EventAttendance[]
}

export function SmartCalendar() {
  const [events, setEvents] = useState<Event[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; role: 'admin' | 'leader' | 'member'; fullName: string } | null>(null)
  
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selected event for RSVP Modal
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null)
  const [myAttendance, setMyAttendance] = useState<{ status: 'pending' | 'yes' | 'no'; excuse: string }>({ status: 'pending', excuse: '' })
  const [isUpdatingRsvp, setIsUpdatingRsvp] = useState(false)

  // Event Creation Modal (Admin only)
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [eventTitle, setEventTitle] = useState('')
  const [eventContent, setEventContent] = useState('')
  const [eventLocation, setEventLocation] = useState('')
  const [eventStartDate, setEventStartDate] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [eventEndDate, setEventEndDate] = useState('')
  const [eventEndTime, setEventEndTime] = useState('')
  const [isSubmittingEvent, setIsSubmittingEvent] = useState(false)

  const detailDialogRef = useRef<HTMLDialogElement>(null)
  const createDialogRef = useRef<HTMLDialogElement>(null)
  const supabase = createClient()

  // Fetch initial data
  const fetchEvents = async () => {
    try {
      const res = await fetch('/api/events')
      if (!res.ok) throw new Error('Lỗi tải danh sách sự kiện')
      const data = await res.json()
      setEvents(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || 'Không thể đồng bộ lịch công tác')
    }
  }

  useEffect(() => {
    async function initData() {
      try {
        setIsLoading(true)
        
        // 1. Get authenticated user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          setError('Vui lòng đăng nhập để truy cập lịch công tác')
          return
        }

        // 2. Get user profile role
        const profileRes = await fetch('/api/profiles')
        if (!profileRes.ok) throw new Error('Lỗi đồng bộ hồ sơ thành viên')
        const profiles: Profile[] = await profileRes.json()
        const myProfile = profiles.find((p) => p.id === user.id)

        if (myProfile) {
          setCurrentUser({
            id: user.id,
            role: myProfile.role,
            fullName: myProfile.fullName,
          })
        }

        // 3. Fetch events
        await fetchEvents()
      } catch (err: any) {
        console.error(err)
        setError(err.message)
      } finally {
        setIsLoading(false)
      }
    }

    initData()
  }, [])

  // Open Event RSVP details modal
  const handleOpenDetail = (event: Event) => {
    setSelectedEvent(event)
    
    // Find current user's attendance status
    const att = event.attendance.find((a) => a.userId === currentUser?.id)
    setMyAttendance({
      status: att?.status || 'pending',
      excuse: att?.excuse || '',
    })

    detailDialogRef.current?.showModal()
  }

  const handleCloseDetail = () => {
    setSelectedEvent(null)
    detailDialogRef.current?.close()
  }

  // Open Event Creation modal
  const handleOpenCreate = () => {
    if (currentUser?.role !== 'admin') return // Guard client side
    
    // Default start time: today at next hour
    const now = new Date()
    const nextHour = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours() + 1, 0, 0)
    const endHour = new Date(nextHour.getTime() + 60 * 60 * 1000)

    const toDateString = (d: Date) => d.toISOString().split('T')[0]
    const toTimeString = (d: Date) => d.toTimeString().split(' ')[0].substring(0, 5)

    setEventTitle('')
    setEventContent('')
    setEventLocation('')
    setEventStartDate(toDateString(nextHour))
    setEventStartTime(toTimeString(nextHour))
    setEventEndDate(toDateString(endHour))
    setEventEndTime(toTimeString(endHour))
    
    setIsCreateOpen(true)
    createDialogRef.current?.showModal()
  }

  const handleCloseCreate = () => {
    setIsCreateOpen(false)
    createDialogRef.current?.close()
  }

  // Submit RSVP
  const handleRsvpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedEvent || !currentUser) return

    // Validate excuse if 'no' is selected
    if (myAttendance.status === 'no' && !myAttendance.excuse.trim()) {
      alert('Bạn bắt buộc phải giải trình lý do vắng mặt.')
      return
    }

    try {
      setIsUpdatingRsvp(true)
      const res = await fetch(`/api/events/${selectedEvent.id}/attendance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: myAttendance.status,
          excuse: myAttendance.status === 'no' ? myAttendance.excuse : undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Lỗi gửi bình chọn RSVP')
      }

      // Refresh events to show updated RSVP stats
      await fetchEvents()
      
      // Update selectedEvent reference to reflect change immediately in the modal
      const updatedEvent = events.find(e => e.id === selectedEvent.id)
      if (updatedEvent) {
        // Find updated event in fresh list
        const refreshedRes = await fetch('/api/events')
        const refreshedList: Event[] = await refreshedRes.json()
        const match = refreshedList.find(e => e.id === selectedEvent.id)
        if (match) setSelectedEvent(match)
      }

      handleCloseDetail()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsUpdatingRsvp(false)
    }
  }

  // Create Event Submit (Admin only)
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault()
    if (currentUser?.role !== 'admin') return

    const startTime = new Date(`${eventStartDate}T${eventStartTime}`)
    const endTime = new Date(`${eventEndDate}T${eventEndTime}`)

    if (startTime >= endTime) {
      alert('Thời gian bắt đầu phải nhỏ hơn thời gian kết thúc')
      return
    }

    try {
      setIsSubmittingEvent(true)
      const res = await fetch('/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: eventTitle,
          content: eventContent || undefined,
          location: eventLocation || undefined,
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Lỗi tạo lịch công tác')
      }

      await fetchEvents()
      handleCloseCreate()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsSubmittingEvent(false)
    }
  }

  // Helper calendar navigation functions
  const handlePrev = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'month') {
      newDate.setMonth(currentDate.getMonth() - 1)
    } else if (viewMode === 'week') {
      newDate.setDate(currentDate.getDate() - 7)
    } else {
      newDate.setDate(currentDate.getDate() - 1)
    }
    setCurrentDate(newDate)
  }

  const handleNext = () => {
    const newDate = new Date(currentDate)
    if (viewMode === 'month') {
      newDate.setMonth(currentDate.getMonth() + 1)
    } else if (viewMode === 'week') {
      newDate.setDate(currentDate.getDate() + 7)
    } else {
      newDate.setDate(currentDate.getDate() + 1)
    }
    setCurrentDate(newDate)
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // Generate Month View Calendar Cells
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    
    // First day of active month
    const firstDay = new Date(year, month, 1)
    // Starting day-of-week index (0 = Sun, 1 = Mon, ..., 6 = Sat)
    let startDayOfWeek = firstDay.getDay()
    // Align with Monday starting: 0 -> Mon, 6 -> Sun
    startDayOfWeek = startDayOfWeek === 0 ? 6 : startDayOfWeek - 1

    // Total days in active month
    const daysCount = new Date(year, month + 1, 0).getDate()
    
    // Total days in previous month
    const prevDaysCount = new Date(year, month, 0).getDate()

    const cells: { date: Date; isCurrentMonth: boolean }[] = []

    // Prev month padding cells
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      cells.push({
        date: new Date(year, month - 1, prevDaysCount - i),
        isCurrentMonth: false,
      })
    }

    // Current month cells
    for (let i = 1; i <= daysCount; i++) {
      cells.push({
        date: new Date(year, month, i),
        isCurrentMonth: true,
      })
    }

    // Next month padding cells to complete grids of 6 rows (42 cells)
    const remaining = 42 - cells.length
    for (let i = 1; i <= remaining; i++) {
      cells.push({
        date: new Date(year, month + 1, i),
        isCurrentMonth: false,
      })
    }

    return cells
  }

  // Generate Week View Columns
  const getDaysInWeek = () => {
    const dayIndex = currentDate.getDay()
    // Align with Monday as start index
    const diff = currentDate.getDate() - dayIndex + (dayIndex === 0 ? -6 : 1)
    const monday = new Date(currentDate)
    monday.setDate(diff)

    const days: Date[] = []
    for (let i = 0; i < 7; i++) {
      const nextDay = new Date(monday)
      nextDay.setDate(monday.getDate() + i)
      days.push(nextDay)
    }
    return days
  }

  // Match events to a particular date
  const getEventsForDate = (date: Date) => {
    return events.filter((e) => {
      const start = new Date(e.startTime)
      const end = new Date(e.endTime)
      const checkDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      
      const startCompare = new Date(start.getFullYear(), start.getMonth(), start.getDate())
      const endCompare = new Date(end.getFullYear(), end.getMonth(), end.getDate())
      
      return checkDate >= startCompare && checkDate <= endCompare
    })
  }

  const daysCells = getDaysInMonth()
  const weekDays = getDaysInWeek()
  
  const formattedMonthYear = currentDate.toLocaleDateString('vi-VN', {
    month: 'long',
    year: 'numeric',
  })

  const weekdayNames = ['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'Chủ Nhật']

  const isRsvpExcuseRequired = myAttendance.status === 'no' && !myAttendance.excuse.trim()
  const isAdmin = currentUser?.role === 'admin'

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <span className="text-white/60 text-sm">Đang tải lịch công tác...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl backdrop-blur-md bg-red-500/10 border border-red-500/20 text-center text-red-200">
        <p className="font-semibold">{error}</p>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6">
      {/* Calendar Navigation & Mode Selector Header */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-center p-4 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 shadow-xl text-white">
        {/* Navigation Controls */}
        <div className="flex items-center gap-3">
          <button
            onClick={handlePrev}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          
          <button
            onClick={handleToday}
            className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-medium transition-colors"
          >
            Hôm nay
          </button>

          <button
            onClick={handleNext}
            className="p-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/80 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <span className="font-bold text-lg ml-2 capitalize">{formattedMonthYear}</span>
        </div>

        {/* Views Tabs + Add Event */}
        <div className="flex items-center gap-3 w-full md:w-auto justify-end">
          <div className="flex p-0.5 rounded-lg bg-white/5 border border-white/10 text-sm">
            {(['month', 'week', 'day'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={`px-3 py-1 rounded-md capitalize transition-all ${
                  viewMode === mode
                    ? 'bg-blue-500/20 text-blue-200 font-semibold shadow-sm'
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {mode === 'month' ? 'Tháng' : mode === 'week' ? 'Tuần' : 'Ngày'}
              </button>
            ))}
          </div>

          {/* Add Event (Locked to Admin only) */}
          {isAdmin ? (
            <button
              onClick={handleOpenCreate}
              className="flex items-center gap-1 px-3.5 py-1.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white text-sm font-semibold rounded-lg shadow-lg hover:shadow-blue-500/10 transform hover:-translate-y-0.5 transition-all duration-200"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Tạo lịch</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/40 select-none">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              <span>Chỉ đọc (Member)</span>
            </div>
          )}
        </div>
      </div>

      {/* Calendar Views Content Area */}
      <div className="backdrop-blur-md bg-white/5 border border-white/10 rounded-2xl shadow-2xl overflow-hidden text-white">
        
        {/* 1. MONTH VIEW */}
        {viewMode === 'month' && (
          <div className="w-full">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 border-b border-white/10 bg-white/5 text-center text-xs font-semibold py-2">
              {weekdayNames.map((name, idx) => (
                <div key={idx} className="text-white/60">{name}</div>
              ))}
            </div>

            {/* Calendar gridcells */}
            <div className="grid grid-cols-7 grid-rows-6 min-h-[480px]">
              {daysCells.map((cell, idx) => {
                const cellEvents = getEventsForDate(cell.date)
                const isToday = cell.date.toDateString() === new Date().toDateString()
                
                return (
                  <div
                    key={idx}
                    className={`border-b border-r border-white/10 p-1 md:p-2 min-h-[80px] flex flex-col gap-1 transition-colors relative ${
                      cell.isCurrentMonth ? 'bg-transparent' : 'bg-black/20 opacity-40'
                    } ${isToday ? 'bg-blue-500/5' : ''}`}
                  >
                    {/* Day number */}
                    <div className="flex justify-between items-center text-xs md:text-sm">
                      <span
                        className={`font-semibold flex items-center justify-center w-6 h-6 rounded-full ${
                          isToday 
                            ? 'bg-blue-500 text-white shadow-md' 
                            : cell.isCurrentMonth ? 'text-white/80' : 'text-white/40'
                        }`}
                      >
                        {cell.date.getDate()}
                      </span>
                    </div>

                    {/* Events list within cell */}
                    <div className="flex-1 overflow-y-auto space-y-1 mt-1 scrollbar-none max-h-[80px]">
                      {cellEvents.map((evt) => {
                        // Color styling for quick RSVP review
                        const myRsv = evt.attendance.find((a) => a.userId === currentUser?.id)
                        let badgeBorder = 'border-white/10 bg-white/5 text-white/80'
                        if (myRsv?.status === 'yes') badgeBorder = 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                        if (myRsv?.status === 'no') badgeBorder = 'border-red-500/30 bg-red-500/10 text-red-300'
                        if (myRsv?.status === 'pending') badgeBorder = 'border-amber-500/30 bg-amber-500/10 text-amber-300'

                        return (
                          <button
                            key={evt.id}
                            onClick={() => handleOpenDetail(evt)}
                            className={`w-full text-left truncate text-[10px] md:text-xs px-1.5 py-0.5 rounded border transition-all hover:scale-[1.02] active:scale-95 ${badgeBorder}`}
                            title={`${evt.title}\n${new Date(evt.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}
                          >
                            {evt.title}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* 2. WEEK VIEW */}
        {viewMode === 'week' && (
          <div className="grid grid-cols-7 divide-x divide-white/10 min-h-[400px]">
            {weekDays.map((day, idx) => {
              const dayEvents = getEventsForDate(day)
              const isToday = day.toDateString() === new Date().toDateString()

              return (
                <div key={idx} className="flex flex-col min-h-full">
                  {/* Header Column */}
                  <div className={`p-3 text-center border-b border-white/10 bg-white/5 ${isToday ? 'bg-blue-500/5' : ''}`}>
                    <div className="text-xs text-white/50">{weekdayNames[idx]}</div>
                    <div className={`text-base font-bold mt-1 inline-flex items-center justify-center w-7 h-7 rounded-full ${
                      isToday ? 'bg-blue-500 text-white' : ''
                    }`}>
                      {day.getDate()}
                    </div>
                  </div>

                  {/* Daily event list */}
                  <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[350px] scrollbar-thin">
                    {dayEvents.map((evt) => {
                      const myRsv = evt.attendance.find((a) => a.userId === currentUser?.id)
                      let cardStyle = 'bg-white/5 border-white/10 text-white/95'
                      if (myRsv?.status === 'yes') cardStyle = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                      if (myRsv?.status === 'no') cardStyle = 'bg-red-500/10 border-red-500/20 text-red-200'
                      if (myRsv?.status === 'pending') cardStyle = 'bg-amber-500/10 border-amber-500/20 text-amber-200'

                      return (
                        <div
                          key={evt.id}
                          onClick={() => handleOpenDetail(evt)}
                          className={`p-2 rounded-lg border text-xs cursor-pointer hover:bg-white/10 transition-all hover:translate-x-0.5 ${cardStyle}`}
                        >
                          <div className="font-semibold truncate">{evt.title}</div>
                          <div className="text-[10px] text-white/40 mt-1">
                            {new Date(evt.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(evt.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </div>
                        </div>
                      )
                    })}
                    {dayEvents.length === 0 && (
                      <div className="text-center text-[10px] text-white/30 pt-12">Không có sự kiện</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* 3. DAY VIEW */}
        {viewMode === 'day' && (
          <div className="p-4 flex flex-col gap-4 min-h-[400px]">
            <div className="flex items-center gap-2 border-b border-white/10 pb-3">
              <span className="text-xl font-bold bg-blue-500/20 text-blue-200 px-3 py-1 rounded-lg">
                {currentDate.toLocaleDateString('vi-VN', { weekday: 'long', day: 'numeric', month: 'numeric' })}
              </span>
            </div>

            <div className="flex-1 divide-y divide-white/10 overflow-y-auto max-h-[350px] scrollbar-thin">
              {getEventsForDate(currentDate).map((evt) => {
                const myRsv = evt.attendance.find((a) => a.userId === currentUser?.id)
                let cardStyle = 'bg-white/5 border-white/10 text-white/95'
                if (myRsv?.status === 'yes') cardStyle = 'bg-emerald-500/10 border-emerald-500/20 text-emerald-200'
                if (myRsv?.status === 'no') cardStyle = 'bg-red-500/10 border-red-500/20 text-red-200'
                if (myRsv?.status === 'pending') cardStyle = 'bg-amber-500/10 border-amber-500/20 text-amber-200'

                return (
                  <div
                    key={evt.id}
                    onClick={() => handleOpenDetail(evt)}
                    className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-white/10 transition-all ${cardStyle} mb-3`}
                  >
                    <div className="space-y-1.5">
                      <h4 className="font-bold text-base">{evt.title}</h4>
                      {evt.content && <p className="text-white/60 text-sm">{evt.content}</p>}
                      <div className="flex flex-wrap gap-3 text-xs text-white/40">
                        <span className="flex items-center gap-1">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {new Date(evt.startTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} - {new Date(evt.endTime).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {evt.location && (
                          <span className="flex items-center gap-1">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                            </svg>
                            {evt.location}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Quick status preview badge */}
                    {myRsv && (
                      <span className="text-xs px-3 py-1 rounded-full font-semibold border uppercase tracking-wider self-start md:self-auto">
                        {myRsv.status === 'yes' ? 'Tham gia' : myRsv.status === 'no' ? 'Vắng mặt' : 'Đang đợi'}
                      </span>
                    )}
                  </div>
                )
              })}

              {getEventsForDate(currentDate).length === 0 && (
                <div className="text-center text-white/40 py-20">Không có sự kiện nào trong ngày hôm nay</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* NATIVE DIALOG MODAL: RSVP & Event Details voting */}
      <dialog
        ref={detailDialogRef}
        className="backdrop:bg-black/50 backdrop:backdrop-blur-sm bg-transparent rounded-2xl shadow-2xl p-0 w-full max-w-lg border border-white/10 focus:outline-none"
        onClose={handleCloseDetail}
      >
        {selectedEvent && (
          <div className="backdrop-blur-xl bg-[#090b16]/90 p-6 flex flex-col gap-4 text-white">
            
            {/* Header details */}
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedEvent.title}</h3>
                <span className="text-xs text-white/40 mt-1 block">
                  Đăng bởi {selectedEvent.createdBy.fullName}
                </span>
              </div>
              <button
                onClick={handleCloseDetail}
                className="text-white/40 hover:text-white p-1 hover:bg-white/5 rounded transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Event Description Content */}
            <div className="space-y-2 text-sm text-white/80">
              {selectedEvent.content && <p className="leading-relaxed bg-white/5 p-3 rounded-lg border border-white/5">{selectedEvent.content}</p>}
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-white/60 pt-2">
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <span>
                    Bắt đầu: {new Date(selectedEvent.startTime).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>
                    Kết thúc: {new Date(selectedEvent.endTime).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
                {selectedEvent.location && (
                  <div className="flex items-center gap-1.5 col-span-1 sm:col-span-2">
                    <svg className="w-4 h-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                    <span>Địa điểm: {selectedEvent.location}</span>
                  </div>
                )}
              </div>
            </div>

            {/* RSVP Stats Bar */}
            <div className="p-3 bg-white/5 border border-white/10 rounded-xl">
              <span className="text-xs font-semibold text-white/50 uppercase tracking-wider block mb-2">
                Kết quả điểm danh (RSVP)
              </span>
              <div className="grid grid-cols-3 gap-2 text-center text-xs font-bold">
                <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  {selectedEvent.attendance.filter((a) => a.status === 'yes').length} Có mặt
                </div>
                <div className="p-2 rounded bg-red-500/10 border border-red-500/20 text-red-300">
                  {selectedEvent.attendance.filter((a) => a.status === 'no').length} Vắng mặt
                </div>
                <div className="p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-300">
                  {selectedEvent.attendance.filter((a) => a.status === 'pending').length} Chờ duyệt
                </div>
              </div>

              {/* Show Excuse list for members absent */}
              {selectedEvent.attendance.some((a) => a.status === 'no' && a.excuse) && (
                <div className="mt-3 pt-3 border-t border-white/5 space-y-1.5 max-h-28 overflow-y-auto scrollbar-thin">
                  <span className="text-[10px] font-semibold text-white/40 uppercase block">Lý do giải trình vắng mặt:</span>
                  {selectedEvent.attendance
                    .filter((a) => a.status === 'no' && a.excuse)
                    .map((att) => (
                      <div key={att.id} className="text-xs text-white/70 bg-black/20 p-2 rounded border border-white/5">
                        <span className="font-semibold text-white/90">{att.user.fullName}</span>: {att.excuse}
                      </div>
                    ))}
                </div>
              )}
            </div>

            {/* RSVP Selection voting Form */}
            <form onSubmit={handleRsvpSubmit} className="space-y-4 pt-2 border-t border-white/10">
              <div className="flex flex-col gap-2">
                <label className="text-white/70 font-semibold text-xs uppercase tracking-wider">
                  Biểu quyết tham gia sự kiện của bạn:
                </label>
                
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setMyAttendance({ ...myAttendance, status: 'yes' })}
                    className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${
                      myAttendance.status === 'yes'
                        ? 'bg-emerald-500/25 border-emerald-500 text-emerald-200 shadow-lg'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    Tham gia (Yes)
                  </button>

                  <button
                    type="button"
                    onClick={() => setMyAttendance({ ...myAttendance, status: 'no' })}
                    className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition-all ${
                      myAttendance.status === 'no'
                        ? 'bg-red-500/25 border-red-500 text-red-200 shadow-lg'
                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                    }`}
                  >
                    Vắng mặt (No)
                  </button>
                </div>
              </div>

              {/* Textarea for RSVP excuse (MANDATORY if Status === 'no') */}
              {myAttendance.status === 'no' && (
                <div className="flex flex-col gap-1.5 transition-all duration-300">
                  <label className="text-red-400 font-medium text-xs">
                    Giải trình lý do vắng mặt * (Bắt buộc)
                  </label>
                  <textarea
                    required
                    placeholder="Vui lòng nêu rõ lý do vắng mặt (Ví dụ: bận lịch học quân sự, trùng lịch thi...)"
                    value={myAttendance.excuse}
                    onChange={(e) => setMyAttendance({ ...myAttendance, excuse: e.target.value })}
                    rows={2}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-red-500/30 text-white placeholder-white/30 text-sm focus:outline-none focus:border-red-500 transition-colors resize-none"
                  />
                </div>
              )}

              {/* Submit / Cancel Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={handleCloseDetail}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium transition-all text-xs"
                >
                  Đóng lại
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingRsvp || isRsvpExcuseRequired}
                  className="px-5 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold transition-all shadow-lg text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isUpdatingRsvp ? 'Đang gửi...' : 'Xác nhận RSVP'}
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>

      {/* NATIVE DIALOG MODAL: Create Event Dialog (Admin Only) */}
      <dialog
        ref={createDialogRef}
        className="backdrop:bg-black/50 backdrop:backdrop-blur-sm bg-transparent rounded-2xl shadow-2xl p-0 w-full max-w-lg border border-white/10 focus:outline-none"
        onClose={handleCloseCreate}
      >
        {isCreateOpen && (
          <div className="backdrop-blur-xl bg-[#090b16]/90 p-6 flex flex-col gap-4 text-white">
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white">Tạo lịch công tác sự kiện mới</h3>
              <button
                onClick={handleCloseCreate}
                className="text-white/40 hover:text-white p-1 hover:bg-white/5 rounded transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreateEvent} className="space-y-4 text-sm">
              {/* Event Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-white/70 font-medium text-xs">Tiêu đề sự kiện *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Đại hội CLB P.A.S.T Thường Niên"
                  value={eventTitle}
                  onChange={(e) => setEventTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Event Content */}
              <div className="flex flex-col gap-1.5">
                <label className="text-white/70 font-medium text-xs">Nội dung / Chương trình chi tiết</label>
                <textarea
                  placeholder="Mô tả nội dung công việc triển khai..."
                  value={eventContent}
                  onChange={(e) => setEventContent(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>

              {/* Location */}
              <div className="flex flex-col gap-1.5">
                <label className="text-white/70 font-medium text-xs">Địa điểm triển khai</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Phòng họp tầng 3 - Toà nhà CLB"
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Start Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/70 font-medium text-xs">Ngày bắt đầu *</label>
                  <input
                    type="date"
                    required
                    value={eventStartDate}
                    onChange={(e) => setEventStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/70 font-medium text-xs">Giờ bắt đầu *</label>
                  <input
                    type="time"
                    required
                    value={eventStartTime}
                    onChange={(e) => setEventStartTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* End Date & Time */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/70 font-medium text-xs">Ngày kết thúc *</label>
                  <input
                    type="date"
                    required
                    value={eventEndDate}
                    onChange={(e) => setEventEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-white/70 font-medium text-xs">Giờ kết thúc *</label>
                  <input
                    type="time"
                    required
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 [color-scheme:dark]"
                  />
                </div>
              </div>

              {/* Submit Actions */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={handleCloseCreate}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium hover:text-white transition-all text-xs"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingEvent || !eventTitle.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold transition-all shadow-lg text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingEvent ? 'Đang tạo...' : 'Tạo sự kiện'}
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>
    </div>
  )
}
