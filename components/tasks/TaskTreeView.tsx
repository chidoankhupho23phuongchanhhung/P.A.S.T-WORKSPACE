// components/tasks/TaskTreeView.tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { TaskTreeNode, type Task, type Profile } from './TaskTreeNode'

export function TaskTreeView() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentUser, setCurrentUser] = useState<{ id: string; role: 'admin' | 'leader' | 'member'; fullName: string } | null>(null)
  
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Filtering and searching states
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [assigneeFilter, setAssigneeFilter] = useState<'all' | 'me'>('all')

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalTitle, setModalTitle] = useState('')
  const [modalDesc, setModalDesc] = useState('')
  const [modalAssigneeId, setModalAssigneeId] = useState('')
  const [modalDueDate, setModalDueDate] = useState('')
  const [modalParentId, setModalParentId] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const dialogRef = useRef<HTMLDialogElement>(null)
  const supabase = createClient()

  // Load initial data
  useEffect(() => {
    async function initData() {
      try {
        setIsLoading(true)
        
        // 1. Get auth user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
          setError('Vui lòng đăng nhập để truy cập công việc')
          return
        }

        // 2. Fetch profiles & tasks list
        const [profilesRes, tasksRes] = await Promise.all([
          fetch('/api/profiles'),
          fetch('/api/tasks')
        ])

        if (!profilesRes.ok || !tasksRes.ok) {
          throw new Error('Lỗi tải dữ liệu hệ thống')
        }

        const profilesData = await profilesRes.json()
        const tasksData = await tasksRes.json()

        setProfiles(profilesData)
        setTasks(tasksData)

        // Find current logged-in user profile
        const myProfile = profilesData.find((p: any) => p.id === user.id)
        if (myProfile) {
          setCurrentUser({
            id: user.id,
            role: myProfile.role,
            fullName: myProfile.fullName,
          })
        }
      } catch (err: any) {
        console.error(err)
        setError(err.message || 'Không thể đồng bộ công việc')
      } finally {
        setIsLoading(false)
      }
    }

    initData()
  }, [])

  // Open modal handler
  const handleOpenModal = (parentId: string | null = null) => {
    setModalParentId(parentId)
    setModalTitle('')
    setModalDesc('')
    setModalAssigneeId('')
    setModalDueDate('')
    setIsModalOpen(true)
    dialogRef.current?.showModal()
  }

  // Close modal handler
  const handleCloseModal = () => {
    setIsModalOpen(false)
    dialogRef.current?.close()
  }

  // Submit task creation
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!modalTitle.trim()) return

    try {
      setIsSubmitting(true)
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: modalTitle,
          description: modalDesc || undefined,
          parentId: modalParentId || undefined,
          assigneeId: modalAssigneeId || undefined,
          dueDate: modalDueDate || undefined,
        }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Lỗi thêm công việc mới')
      }

      const newTask = await res.ok ? await res.json() : null
      if (newTask) {
        setTasks((prev) => [...prev, newTask])
      }
      handleCloseModal()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  // Handle task status transitions
  const handleStatusChange = async (taskId: string, newStatus: Task['status']) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })

      if (!res.ok) {
        const errData = await res.json()
        throw new Error(errData.error || 'Lỗi cập nhật trạng thái')
      }

      const updatedData = await res.json()
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: updatedData.status } : t))
      )
    } catch (err: any) {
      alert(err.message)
    }
  }

  // Filter tasks tree: Keep root tasks which matches constraints OR has children matching constraints
  const getFilteredTasks = () => {
    // 1. Get matching IDs based on query and status filters
    const matchesConstraints = (t: Task) => {
      const matchesSearch = t.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
        (t.description && t.description.toLowerCase().includes(searchQuery.toLowerCase()))
      
      const matchesStatus = statusFilter === 'all' || t.status === statusFilter
      
      const matchesAssignee = assigneeFilter === 'all' || t.assigneeId === currentUser?.id

      return !!(matchesSearch && matchesStatus && matchesAssignee)
    }

    // A helper to verify if a task or any of its descendants matches the filter criteria
    const isOrHasMatchingDescendant = (t: Task): boolean => {
      if (matchesConstraints(t)) return true
      const children = tasks.filter((child) => child.parentId === t.id)
      return children.some(isOrHasMatchingDescendant)
    }

    // Only render root tasks (parentId === null) that meet our criteria or have children that do
    return tasks.filter((t) => t.parentId === null && isOrHasMatchingDescendant(t))
  }

  const rootTasks = getFilteredTasks()
  const canCreateTask = currentUser && ['admin', 'leader'].includes(currentUser.role)

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[400px]">
        <div className="w-10 h-10 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4" />
        <span className="text-white/60 text-sm">Đang tải danh sách công việc...</span>
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
      {/* Search & Filtering Panel */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center p-4 rounded-xl backdrop-blur-md bg-white/5 border border-white/10 shadow-xl">
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Search Box */}
          <div className="relative w-full sm:w-64">
            <input
              type="text"
              placeholder="Tìm kiếm công việc..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
            <svg
              className="absolute left-3 top-2.5 w-4 h-4 text-white/40"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Status Select Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all" className="bg-[#0b0f19]">Tất cả trạng thái</option>
            <option value="todo" className="bg-[#0b0f19]">Cần làm (Todo)</option>
            <option value="in_progress" className="bg-[#0b0f19]">Đang làm</option>
            <option value="review" className="bg-[#0b0f19]">Đang duyệt</option>
            <option value="done" className="bg-[#0b0f19]">Hoàn thành</option>
          </select>

          {/* Assignee Filter Toggle */}
          {currentUser && (
            <button
              onClick={() => setAssigneeFilter(assigneeFilter === 'all' ? 'me' : 'all')}
              className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${
                assigneeFilter === 'me'
                  ? 'bg-blue-500/20 border-blue-500/40 text-blue-200'
                  : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10'
              }`}
            >
              Việc của tôi
            </button>
          )}
        </div>

        {/* Create Root Task Button */}
        {canCreateTask && (
          <button
            onClick={() => handleOpenModal(null)}
            className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white rounded-lg text-sm font-semibold shadow-lg hover:shadow-blue-500/20 transform hover:-translate-y-0.5 transition-all duration-200"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Tạo việc mới
          </button>
        )}
      </div>

      {/* Task Tree Nodes Content */}
      <div className="flex flex-col gap-4">
        {rootTasks.length > 0 ? (
          rootTasks.map((task) => (
            <TaskTreeNode
              key={task.id}
              task={task}
              allTasks={tasks}
              level={0}
              onStatusChange={handleStatusChange}
              onAddSubtask={handleOpenModal}
              userRole={currentUser?.role}
              currentUserId={currentUser?.id}
            />
          ))
        ) : (
          <div className="p-12 text-center rounded-xl backdrop-blur-md bg-white/5 border border-white/10">
            <svg className="w-12 h-12 text-white/20 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-white/50 text-sm">Không tìm thấy công việc nào thỏa mãn bộ lọc</p>
          </div>
        )}
      </div>

      {/* Native dialog HTML5 modal glassmorphic for Task Creation */}
      <dialog
        ref={dialogRef}
        className="backdrop:bg-black/50 backdrop:backdrop-blur-sm bg-transparent rounded-2xl shadow-2xl p-0 w-full max-w-lg border border-white/10 focus:outline-none"
        onClose={handleCloseModal}
      >
        {isModalOpen && (
          <div className="backdrop-blur-xl bg-[#090b16]/90 p-6 flex flex-col gap-4 text-white">
            {/* Header */}
            <div className="flex justify-between items-center border-b border-white/10 pb-3">
              <h3 className="text-lg font-bold text-white">
                {modalParentId ? 'Bóc tách công việc con' : 'Tạo đầu mục công việc mới'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-white/40 hover:text-white p-1 hover:bg-white/5 rounded transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Parent Task Preview Info */}
            {modalParentId && (
              <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-200">
                <span className="font-semibold text-white/50 block">Công việc cha:</span>
                <span className="font-medium text-blue-100">
                  {tasks.find((t) => t.id === modalParentId)?.title}
                </span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCreateTask} className="space-y-4 text-sm">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-white/70 font-medium text-xs">Tiêu đề công việc *</label>
                <input
                  type="text"
                  required
                  placeholder="Ví dụ: Lên outline bài post truyền thông"
                  value={modalTitle}
                  onChange={(e) => setModalTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>

              {/* Description */}
              <div className="flex flex-col gap-1.5">
                <label className="text-white/70 font-medium text-xs">Mô tả chi tiết</label>
                <textarea
                  placeholder="Mô tả các yêu cầu, kết quả cần đạt..."
                  value={modalDesc}
                  onChange={(e) => setModalDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:border-blue-500 transition-colors resize-none"
                />
              </div>

              {/* Assignee Selection Grid */}
              <div className="flex flex-col gap-1.5">
                <label className="text-white/70 font-medium text-xs">Giao cho thành viên</label>
                <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto p-1 rounded bg-white/5 border border-white/10 scrollbar-thin">
                  <button
                    type="button"
                    onClick={() => setModalAssigneeId('')}
                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                      modalAssigneeId === ''
                        ? 'bg-blue-500/20 border-blue-500/30 text-blue-200'
                        : 'bg-transparent border-transparent text-white/60 hover:bg-white/5'
                    }`}
                  >
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/50">
                      ?
                    </div>
                    <span>Để trống (Chưa giao)</span>
                  </button>

                  {profiles.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setModalAssigneeId(p.id)}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-left text-xs transition-all ${
                        modalAssigneeId === p.id
                          ? 'bg-blue-500/20 border-blue-500/30 text-blue-200'
                          : 'bg-transparent border-transparent text-white/60 hover:bg-white/5'
                      }`}
                    >
                      {p.avatarUrl ? (
                        <div className="w-5 h-5 rounded-full overflow-hidden relative">
                          <img
                            src={p.avatarUrl}
                            alt={p.fullName}
                            className="object-cover w-full h-full"
                          />
                        </div>
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white uppercase">
                          {p.fullName.charAt(0)}
                        </div>
                      )}
                      <span className="truncate">{p.fullName}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Due Date */}
              <div className="flex flex-col gap-1.5">
                <label className="text-white/70 font-medium text-xs">Thời hạn hoàn thành (Deadline)</label>
                <input
                  type="date"
                  value={modalDueDate}
                  onChange={(e) => setModalDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white focus:outline-none focus:border-blue-500 transition-colors [color-scheme:dark]"
                />
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-3 border-t border-white/10 mt-2">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white font-medium hover:text-white transition-all text-xs"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || !modalTitle.trim()}
                  className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-bold transition-all shadow-lg text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Đang tạo...' : 'Tạo việc'}
                </button>
              </div>
            </form>
          </div>
        )}
      </dialog>
    </div>
  )
}
