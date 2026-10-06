import { useState, useEffect, useCallback } from 'react'
import { useToast } from '../../contexts/ToastContext'
import {
  Settings, Shield, Zap, Database, ClipboardList, BarChart3,
  Edit2, Trash2, Plus, RefreshCw, ChevronLeft, ChevronRight,
  CheckCircle, XCircle, AlertTriangle, Calculator, TrendingUp,
  DollarSign, Users, FileText, Download, Search, Clock
} from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface SubscriptionTier {
  tierId: number; tierCode: string; name: string; description: string
  priceVnd: number; billingCycle: string; commissionBps: number
  maxCapacityLimit: number; hasAdvancedReports: boolean; isActive: boolean; updatedAt: string
}
interface RoleFeePolicy {
  roleCode: string; name: string; description: string; commissionBps: number
  maxCapacityLimit: number; hasAdvancedReports: boolean; isActive: boolean; updatedAt: string
}
interface FeeOverride {
  overrideId: number; organizerId: number; organizerName?: string; commissionBps: number
  reason: string; startDate: string; endDate: string; createdBy: number; createdAt: string
}
interface SystemParameter { paramKey: string; paramValue: string; description: string; updatedAt: string }
interface AuditLog {
  logId: number; targetEntity: string; targetId: string; action: string
  oldValue?: string; newValue?: string; reason: string; changedByName?: string; changedBy: number; createdAt: string
}
interface FinanceOverview {
  totalGrossRevenue: number; totalCommissionCollected: number; totalNetPaidToOrganizers: number
  totalReceiptsCount: number; totalRefundedAmount: number; totalSubscriptionRevenue: number
  pendingPayoutAmount: number; pendingPayoutCount: number
}
type FeeTab = 'TIERS' | 'ROLE_POLICY' | 'OVERRIDES' | 'PARAMS' | 'AUDIT' | 'FINANCE' | 'SANDBOX'

// ─── Formatters ───────────────────────────────────────────────────────────────

const fmtVND = (v: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v)
const fmtBps = (bps: number) => `${(bps / 100).toFixed(2)}%`
const fmtCap = (cap: number) => cap === -1 ? '∞ Không giới hạn' : `${cap.toLocaleString()} người`
const fmtDate = (d: string) => {
  try { return new Date(d).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' }) }
  catch { return d }
}
const TIER_COLORS: Record<string, string> = {
  FREE: 'from-slate-500 to-slate-600',
  PRO: 'from-orange-500 to-orange-600',
  BUSINESS: 'from-purple-500 to-purple-600',
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Row({ label, value, badge, muted }: {
  label: string; value: string; badge?: string; muted?: boolean
}) {
  const bc: Record<string, string> = {
    green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
  }
  return (
    <div className="flex justify-between items-center">
      <span className={`text-xs font-medium ${muted ? 'text-slate-400' : 'text-slate-500 dark:text-slate-400'}`}>{label}</span>
      {badge
        ? <span className={`text-xs font-black px-2 py-0.5 rounded-full ${bc[badge] || ''}`}>{value}</span>
        : <span className={`text-xs font-bold ${muted ? 'text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>{value}</span>}
    </div>
  )
}

function CommissionBadge({ bps }: { bps: number }) {
  const c = bps === 0
    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
    : bps <= 250
      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400'
      : 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400'
  return <span className={`text-xs font-black px-2.5 py-1 rounded-full ${c}`}>{(bps / 100).toFixed(2)}%</span>
}

function FinKpi({ icon, label, value, color }: {
  icon: React.ReactNode; label: string; value: string; color: string
}) {
  const cs: Record<string, string> = {
    blue: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20',
    orange: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20',
    green: 'text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20',
    purple: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/20',
  }
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${cs[color]}`}>{icon}</div>
      <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
      <p className="text-lg font-black text-slate-800 dark:text-white mt-1">{value}</p>
    </div>
  )
}

function SandboxKpi({ label, value, color }: { label: string; value: string; color: string }) {
  const cs: Record<string, string> = {
    slate: 'text-slate-600 dark:text-slate-300',
    orange: 'text-orange-600 dark:text-orange-400',
    amber: 'text-amber-600 dark:text-amber-400',
    green: 'text-green-600 dark:text-green-400',
  }
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
      <p className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{label}</p>
      <p className={`text-base font-black mt-0.5 ${cs[color]}`}>{value}</p>
    </div>
  )
}

function EmptyState({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
      {icon}
      <p className="text-sm font-medium">{text}</p>
    </div>
  )
}

function Modal({ title, children, onClose }: {
  title: string; children: React.ReactNode; onClose: () => void
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl w-full max-w-lg shadow-2xl">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <h3 className="font-extrabold text-base text-slate-800 dark:text-white">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition">&#x2715;</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

function LabeledInput({ label, type, value, onChange, placeholder }: {
  label: string; type: string; value: string; onChange: (v: string) => void; placeholder?: string
}) {
  return (
    <div>
      <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">{label}</label>
      <input
        type={type} value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200"
      />
    </div>
  )
}

function EntityBadge({ entity }: { entity: string }) {
  const m: Record<string, string> = {
    SUBSCRIPTION_TIER: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
    ROLE_POLICY: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    FEE_OVERRIDE: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    SYSTEM_PARAM: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    USER_ROLE: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
  }
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${m[entity] || 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'}`}>
      {entity.replace(/_/g, ' ')}
    </span>
  )
}

function ActionBadge({ action }: { action: string }) {
  const m: Record<string, string> = {
    CREATE: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400',
    UPDATE: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400',
    DEACTIVATE: 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
    ROLE_ASSIGN: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400',
    ROLE_REVOKE: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400',
  }
  return (
    <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${m[action] || 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
      {action}
    </span>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AdminFeeManagement() {
  const { showToast } = useToast()
  const [feeTab, setFeeTab] = useState<FeeTab>('TIERS')
  const [loading, setLoading] = useState(false)

  const [tiers, setTiers] = useState<SubscriptionTier[]>([])
  const [rolePolicies, setRolePolicies] = useState<RoleFeePolicy[]>([])
  const [overrides, setOverrides] = useState<FeeOverride[]>([])
  const [params, setParams] = useState<SystemParameter[]>([])
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [auditTotal, setAuditTotal] = useState(0)
  const [auditPage, setAuditPage] = useState(1)
  const [auditEntity, setAuditEntity] = useState('')
  const [finance, setFinance] = useState<FinanceOverview | null>(null)

  const [editTier, setEditTier] = useState<SubscriptionTier | null>(null)
  const [tierForm, setTierForm] = useState({
    priceVnd: 0, commissionBps: 0, maxCapacityLimit: 0,
    hasAdvancedReports: false, isActive: true, reason: ''
  })

  const [editPolicy, setEditPolicy] = useState<RoleFeePolicy | null>(null)
  const [policyForm, setPolicyForm] = useState({
    commissionBps: 0, maxCapacityLimit: 0, hasAdvancedReports: true, isActive: true, reason: ''
  })

  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [overrideForm, setOverrideForm] = useState({
    organizerId: '', commissionBps: '', reason: '', startTime: '', endTime: ''
  })
  const [overrideWarning, setOverrideWarning] = useState('')

  const [editParam, setEditParam] = useState<SystemParameter | null>(null)
  const [paramForm, setParamForm] = useState({ paramValue: '', reason: '' })

  const [sandbox, setSandbox] = useState({ organizerId: '', grossAmount: '', ticketCount: '1' })
  const [sandboxResult, setSandboxResult] = useState<Record<string, unknown> | null>(null)
  const [sandboxLoading, setSandboxLoading] = useState(false)

  const [showSchoolRoleModal, setShowSchoolRoleModal] = useState(false)
  const [schoolRoleForm, setSchoolRoleForm] = useState({
    userId: '', reason: '', action: 'assign' as 'assign' | 'revoke'
  })

  // ─── API helpers ─────────────────────────────────────────────────────────────

  const apiFetch = useCallback(async (url: string, opts: RequestInit = {}) => {
    const res = await fetch(url, {
      credentials: 'include',
      ...opts,
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) throw new Error(
      (data as Record<string, string>)?.message ||
      (data as Record<string, string>)?.error ||
      `HTTP ${res.status}`
    )
    return data
  }, [])

  const loadTiers = useCallback(async () => {
    setLoading(true)
    try { setTiers(await apiFetch('/api/v1/admin/subscription-tiers')) }
    catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
    finally { setLoading(false) }
  }, [apiFetch, showToast])

  const loadRolePolicies = useCallback(async () => {
    setLoading(true)
    try { setRolePolicies(await apiFetch('/api/v1/admin/role-policies')) }
    catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
    finally { setLoading(false) }
  }, [apiFetch, showToast])

  const loadOverrides = useCallback(async () => {
    setLoading(true)
    try { setOverrides(await apiFetch('/api/v1/admin/fee-overrides')) }
    catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
    finally { setLoading(false) }
  }, [apiFetch, showToast])

  const loadParams = useCallback(async () => {
    setLoading(true)
    try { setParams(await apiFetch('/api/v1/admin/system-parameters')) }
    catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
    finally { setLoading(false) }
  }, [apiFetch, showToast])

  const loadFinance = useCallback(async () => {
    setLoading(true)
    try { setFinance(await apiFetch('/api/v1/admin/finance/overview')) }
    catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
    finally { setLoading(false) }
  }, [apiFetch, showToast])

  const loadAuditLogs = useCallback(async (page: number, entity: string) => {
    setLoading(true)
    try {
      const qs = new URLSearchParams({ page: String(page), limit: '15' })
      if (entity) qs.set('entity', entity)
      const data = await apiFetch(`/api/v1/admin/fee-audit-logs?${qs}`) as Record<string, unknown>
      setAuditLogs((data.logs as AuditLog[]) || [])
      setAuditTotal((data.totalRecords as number) || 0)
    } catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
    finally { setLoading(false) }
  }, [apiFetch, showToast])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (feeTab === 'TIERS') loadTiers()
    else if (feeTab === 'ROLE_POLICY') loadRolePolicies()
    else if (feeTab === 'OVERRIDES') loadOverrides()
    else if (feeTab === 'PARAMS') loadParams()
    else if (feeTab === 'AUDIT') loadAuditLogs(1, '')
    else if (feeTab === 'FINANCE') loadFinance()
  }, [feeTab])

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (feeTab === 'AUDIT') loadAuditLogs(auditPage, auditEntity)
  }, [auditPage, auditEntity])

  // ─── Handlers ────────────────────────────────────────────────────────────────

  const handleSaveTier = async () => {
    if (!editTier) return
    if (!tierForm.reason.trim()) { showToast('error', 'Vui lòng nhập lý do thay đổi'); return }
    try {
      await apiFetch('/api/v1/admin/subscription-tiers', {
        method: 'PUT',
        body: JSON.stringify({ tierId: editTier.tierId, ...tierForm }),
      })
      showToast('success', 'Cập nhật gói dịch vụ thành công')
      setEditTier(null)
      loadTiers()
    } catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
  }

  const handleSavePolicy = async () => {
    if (!editPolicy) return
    if (!policyForm.reason.trim()) { showToast('error', 'Vui lòng nhập lý do'); return }
    try {
      await apiFetch('/api/v1/admin/role-policies', {
        method: 'PUT',
        body: JSON.stringify({ roleCode: editPolicy.roleCode, ...policyForm }),
      })
      showToast('success', 'Cập nhật chính sách phí thành công')
      setEditPolicy(null)
      loadRolePolicies()
    } catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
  }

  const handleCreateOverride = async (confirmHigher = false) => {
    if (!overrideForm.organizerId || !overrideForm.commissionBps || !overrideForm.startTime || !overrideForm.endTime) {
      showToast('error', 'Vui lòng điền đầy đủ thông tin'); return
    }
    if (!overrideForm.reason.trim()) {
      showToast('error', 'Vui lòng nhập lý do cấp ưu đãi'); return
    }
    try {
      await apiFetch('/api/v1/admin/fee-overrides', {
        method: 'POST',
        body: JSON.stringify({
          organizerId: Number(overrideForm.organizerId),
          commissionBps: Number(overrideForm.commissionBps),
          reason: overrideForm.reason.trim(),
          startTime: overrideForm.startTime,
          endTime: overrideForm.endTime,
          confirmHigher,
        }),
      })
      showToast('success', 'Tạo ưu đãi hoa hồng thành công')
      setShowOverrideForm(false)
      setOverrideWarning('')
      setOverrideForm({ organizerId: '', commissionBps: '', reason: '', startTime: '', endTime: '' })
      loadOverrides()
    } catch (e: unknown) {
      if (e && typeof e === 'object' && ('requiresConfirmation' in e || (e as any).status === 422 || String((e as any).message).includes('CONFIRMATION_REQUIRED'))) {
        setOverrideWarning((e as any).warning || (e as any).message || 'Mức phí ưu đãi cao hơn gói hiện tại của Organizer. Bạn có chắc chắn muốn tiếp tục?')
      } else {
        showToast('error', e instanceof Error ? e.message : 'Lỗi tạo ưu đãi')
      }
    }
  }

  const handleDeleteOverride = async (id: number) => {
    if (!confirm('Xóa ưu đãi này?')) return
    try {
      await apiFetch(`/api/v1/admin/fee-overrides?overrideId=${id}`, { method: 'DELETE' })
      showToast('success', 'Đã xóa ưu đãi')
      loadOverrides()
    } catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
  }

  const handleSaveParam = async () => {
    if (!editParam) return
    if (!paramForm.reason.trim()) { showToast('error', 'Vui lòng nhập lý do'); return }
    try {
      await apiFetch('/api/v1/admin/system-parameters', {
        method: 'PUT',
        body: JSON.stringify({ paramKey: editParam.paramKey, paramValue: paramForm.paramValue, reason: paramForm.reason.trim() }),
      })
      showToast('success', 'Cập nhật tham số thành công')
      setEditParam(null)
      loadParams()
    } catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
  }

  const handleSchoolRole = async () => {
    if (!schoolRoleForm.userId) { showToast('error', 'Nhập userId'); return }
    if (!schoolRoleForm.reason.trim()) { showToast('error', 'Vui lòng nhập lý do thao tác'); return }
    try {
      await apiFetch('/api/v1/admin/users/school-role', {
        method: schoolRoleForm.action === 'assign' ? 'POST' : 'DELETE',
        body: JSON.stringify({
          userId: Number(schoolRoleForm.userId),
          reason: schoolRoleForm.reason.trim(),
        }),
      })
      showToast('success', schoolRoleForm.action === 'assign' ? 'Đã cấp quyền School Organizer' : 'Đã thu hồi quyền School Organizer')
      setShowSchoolRoleModal(false)
    } catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
  }

  const handleSandbox = async () => {
    if (!sandbox.organizerId || !sandbox.grossAmount) { showToast('error', 'Nhập đủ thông tin'); return }
    setSandboxLoading(true)
    try {
      setSandboxResult(await apiFetch('/api/v1/admin/fee-sandbox/simulate', {
        method: 'POST',
        body: JSON.stringify({
          organizerId: Number(sandbox.organizerId),
          grossAmount: Number(sandbox.grossAmount),
          ticketCount: Number(sandbox.ticketCount) || 1,
        }),
      }))
    } catch (e: unknown) { showToast('error', e instanceof Error ? e.message : 'Lỗi') }
    finally { setSandboxLoading(false) }
  }

  // ─── Tab helpers ─────────────────────────────────────────────────────────────

  const tabBtn = (tab: FeeTab, icon: React.ReactNode, label: string) => (
    <button
      key={tab}
      onClick={() => setFeeTab(tab)}
      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all duration-200 whitespace-nowrap ${feeTab === tab ? 'bg-gradient-to-r from-orange-600 to-orange-500 text-white shadow shadow-orange-500/20' : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
    >
      {icon}{label}
    </button>
  )

  const auditPageCount = Math.max(1, Math.ceil(auditTotal / 15))

  return (
    <div className="space-y-5">
      {/* Sub-tab Bar */}
      <div className="flex flex-wrap gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-950 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 overflow-x-auto">
        {tabBtn('TIERS',       <Zap size={13} />,           'Gói dịch vụ')}
        {tabBtn('ROLE_POLICY', <Shield size={13} />,        'Chính sách Role')}
        {tabBtn('OVERRIDES',   <Settings size={13} />,      'Ʈu đãi Organizer')}
        {tabBtn('PARAMS',      <Database size={13} />,      'Tham số hệ thống')}
        {tabBtn('SANDBOX',     <Calculator size={13} />,    'Sandbox phí')}
        {tabBtn('FINANCE',     <BarChart3 size={13} />,     'Tài chính Platform')}
        {tabBtn('AUDIT',       <ClipboardList size={13} />, 'Nhật ký kiểm toán')}
      </div>

      {loading && (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* TIERS */}
      {!loading && feeTab === 'TIERS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Cấu hình Gói Dịch Vụ Organizer</h2>
            <button onClick={loadTiers} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"><RefreshCw size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {tiers.map(tier => (
              <div key={tier.tierId} className={`bg-white dark:bg-slate-900 rounded-2xl border ${tier.isActive ? 'border-slate-200 dark:border-slate-700' : 'border-red-200 dark:border-red-900 opacity-70'} overflow-hidden shadow-sm`}>
                <div className={`bg-gradient-to-r ${TIER_COLORS[tier.tierCode] || 'from-slate-500 to-slate-600'} px-5 py-4 text-white`}>
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="text-xs font-bold tracking-widest opacity-80 uppercase">{tier.tierCode}</span>
                      <p className="text-lg font-extrabold mt-0.5">{tier.name}</p>
                    </div>
                    {!tier.isActive && <span className="bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Tắt</span>}
                  </div>
                  <p className="text-2xl font-black mt-2">{fmtVND(tier.priceVnd)}<span className="text-sm font-normal opacity-70">/tháng</span></p>
                </div>
                <div className="p-5 space-y-3 text-sm">
                  <Row label="Hoa hồng sàn" value={fmtBps(tier.commissionBps)} badge={tier.commissionBps === 0 ? 'green' : tier.commissionBps <= 250 ? 'blue' : 'orange'} />
                  <Row label="Sức chứa tối đa" value={fmtCap(tier.maxCapacityLimit)} />
                  <Row label="Báo cáo nâng cao" value={tier.hasAdvancedReports ? '✅ Mở khóa' : '🔒 Khóa'} />
                  <Row label="Cập nhật" value={fmtDate(tier.updatedAt)} muted />
                  {tier.tierCode !== 'FREE' ? (
                    <button
                      onClick={() => {
                        setEditTier(tier)
                        setTierForm({ priceVnd: tier.priceVnd, commissionBps: tier.commissionBps, maxCapacityLimit: tier.maxCapacityLimit, hasAdvancedReports: tier.hasAdvancedReports, isActive: tier.isActive, reason: '' })
                      }}
                      className="w-full flex items-center justify-center gap-2 py-2 mt-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-xl font-bold text-xs transition"
                    >
                      <Edit2 size={13} />Chỉnh sửa gói
                    </button>
                  ) : (
                    <div className="text-center text-xs text-slate-400 dark:text-slate-500 mt-2 italic">Gói FREE được bảo vệ</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ROLE POLICY */}
      {!loading && feeTab === 'ROLE_POLICY' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Chính sách phí theo Role đặc thù</h2>
            <div className="flex gap-2">
              <button onClick={() => setShowSchoolRoleModal(true)} className="flex items-center gap-1.5 px-4 py-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-600 dark:text-purple-400 rounded-xl font-bold text-xs transition">
                <Shield size={13} />Cấp / Thu hồi Role
              </button>
              <button onClick={loadRolePolicies} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"><RefreshCw size={16} /></button>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Hoa hồng</th>
                  <th className="px-5 py-3">Sức chứa</th>
                  <th className="px-5 py-3">Báo cáo NC</th>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3">Cập nhật</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rolePolicies.map(p => (
                  <tr key={p.roleCode} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-black text-slate-800 dark:text-white">{p.roleCode}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">{p.name}</div>
                    </td>
                    <td className="px-5 py-3.5"><CommissionBadge bps={p.commissionBps} /></td>
                    <td className="px-5 py-3.5 text-slate-700 dark:text-slate-300">{fmtCap(p.maxCapacityLimit)}</td>
                    <td className="px-5 py-3.5">
                      {p.hasAdvancedReports
                        ? <CheckCircle size={16} className="text-green-500" />
                        : <XCircle size={16} className="text-red-400" />}
                    </td>
                    <td className="px-5 py-3.5">
                      {p.isActive
                        ? <span className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-2 py-0.5 rounded-full text-xs font-bold">Hoạt động</span>
                        : <span className="bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full text-xs font-bold">Tắt</span>}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">{fmtDate(p.updatedAt)}</td>
                    <td className="px-5 py-3.5">
                      <button
                        onClick={() => {
                          setEditPolicy(p)
                          setPolicyForm({ commissionBps: p.commissionBps, maxCapacityLimit: p.maxCapacityLimit, hasAdvancedReports: p.hasAdvancedReports, isActive: p.isActive, reason: '' })
                        }}
                        className="p-1.5 rounded-lg hover:bg-orange-100 dark:hover:bg-orange-900/20 text-orange-500 transition"
                      >
                        <Edit2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* OVERRIDES */}
      {!loading && feeTab === 'OVERRIDES' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Ʈu đãi hoa hồng riêng Organizer</h2>
            <div className="flex gap-2">
              <button
                onClick={() => { setShowOverrideForm(true); setOverrideWarning('') }}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-xl font-bold text-xs shadow-sm shadow-orange-500/20 transition hover:scale-[1.02]"
              >
                <Plus size={13} />Tạo ưu đãi mới
              </button>
              <button onClick={loadOverrides} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"><RefreshCw size={16} /></button>
            </div>
          </div>
          {overrides.length === 0
            ? <EmptyState icon={<Settings size={28} />} text="Chưa có ưu đãi hoa hồng nào được thiết lập" />
            : (
              <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <th className="px-5 py-3">Organizer</th>
                      <th className="px-5 py-3">Hoa hồng</th>
                      <th className="px-5 py-3">Hiệu lực</th>
                      <th className="px-5 py-3">Lý do</th>
                      <th className="px-5 py-3"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {overrides.map(ov => (
                      <tr key={ov.overrideId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                        <td className="px-5 py-3.5">
                          <div className="font-bold text-slate-800 dark:text-white">{ov.organizerName || `Organizer #${ov.organizerId}`}</div>
                          <div className="text-xs text-slate-400">ID: {ov.organizerId}</div>
                        </td>
                        <td className="px-5 py-3.5"><CommissionBadge bps={ov.commissionBps} /></td>
                        <td className="px-5 py-3.5 text-xs text-slate-600 dark:text-slate-300">
                          <div>{fmtDate(ov.startDate)}</div>
                          <div className="text-slate-400">→ {fmtDate(ov.endDate)}</div>
                        </td>
                        <td className="px-5 py-3.5 text-xs text-slate-500 dark:text-slate-400 max-w-[180px] truncate">{ov.reason}</td>
                        <td className="px-5 py-3.5">
                          <button onClick={() => handleDeleteOverride(ov.overrideId)} className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 text-red-500 transition">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* SYSTEM PARAMS */}
      {!loading && feeTab === 'PARAMS' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Tham số cấu hình hệ thống</h2>
            <button onClick={loadParams} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"><RefreshCw size={16} /></button>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {params.map(param => (
              <div key={param.paramKey} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-black text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20 px-2 py-0.5 rounded">{param.paramKey}</code>
                    <span className="text-lg font-black text-slate-800 dark:text-white">{param.paramValue}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{param.description}</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Cập nhật: {fmtDate(param.updatedAt)}</p>
                </div>
                <button
                  onClick={() => { setEditParam(param); setParamForm({ paramValue: param.paramValue, reason: '' }) }}
                  className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 bg-orange-500/10 hover:bg-orange-500/20 text-orange-600 dark:text-orange-400 rounded-xl font-bold text-xs transition"
                >
                  <Edit2 size={13} />Chỉnh sửa
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SANDBOX */}
      {feeTab === 'SANDBOX' && (
        <div className="space-y-4">
          <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Sandbox Mô phỏng Tính Phí</h2>
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 space-y-4">
            <p className="text-sm text-slate-500 dark:text-slate-400">Mô phỏng kết quả tính phí cho Organizer với số tiền tùy ý — không tác động dữ liệu thật.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <LabeledInput label="Organizer ID" type="number" value={sandbox.organizerId} onChange={v => setSandbox(s => ({ ...s, organizerId: v }))} placeholder="Ví dụ: 18" />
              <LabeledInput label="Doanh thu gộp (VNĐ)" type="number" value={sandbox.grossAmount} onChange={v => setSandbox(s => ({ ...s, grossAmount: v }))} placeholder="Ví dụ: 500000" />
              <LabeledInput label="Số lượng vé" type="number" value={sandbox.ticketCount} onChange={v => setSandbox(s => ({ ...s, ticketCount: v }))} placeholder="Ví dụ: 1" />
            </div>
            <button
              onClick={handleSandbox}
              disabled={sandboxLoading}
              className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-xl font-bold text-sm shadow-md shadow-orange-500/20 hover:scale-[1.02] transition disabled:opacity-60"
            >
              {sandboxLoading ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Calculator size={16} />}
              Mô phỏng ngay
            </button>
            {sandboxResult && (
              <div className="mt-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="font-black text-slate-800 dark:text-white text-sm">Kết quả Sandbox</h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <SandboxKpi label="Doanh thu gộp" value={fmtVND(Number(sandboxResult.grossAmount) || 0)} color="slate" />
                  <SandboxKpi label="Phí sàn" value={fmtVND(Number(sandboxResult.commissionAmount) || 0)} color="orange" />
                  <SandboxKpi label="Phí cố định/vé" value={fmtVND(Number(sandboxResult.fixedFeeTotal) || 0)} color="amber" />
                  <SandboxKpi label="Lợi nhuận thuần" value={fmtVND(Number(sandboxResult.netAmount) || 0)} color="green" />
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-200 dark:border-slate-700">
                  <span className="font-bold">Nguồn phí:</span> {String(sandboxResult.feeSource ?? '')} &nbsp;|&nbsp;
                  <span className="font-bold">Tier:</span> {String(sandboxResult.tierCode ?? '')} &nbsp;|&nbsp;
                  <span className="font-bold">Hoa hồng:</span> {fmtBps(Number(sandboxResult.commissionBps) || 0)} &nbsp;|&nbsp;
                  Config v{String(sandboxResult.configVersion ?? '')}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FINANCE */}
      {!loading && feeTab === 'FINANCE' && finance && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Tổng quan Tài chính Platform</h2>
            <div className="flex gap-2">
              <a href="/api/v1/admin/finance/receipts/export" target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-4 py-2 bg-green-500/10 hover:bg-green-500/20 text-green-600 dark:text-green-400 rounded-xl font-bold text-xs transition">
                <Download size={13} />Export CSV
              </a>
              <button onClick={loadFinance} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"><RefreshCw size={16} /></button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <FinKpi icon={<TrendingUp size={18} />} label="Tổng doanh thu gộp" value={fmtVND(finance.totalGrossRevenue)} color="blue" />
            <FinKpi icon={<DollarSign size={18} />} label="Phí sàn thu được" value={fmtVND(finance.totalCommissionCollected)} color="orange" />
            <FinKpi icon={<Users size={18} />} label="Đã chi cho Organizer" value={fmtVND(finance.totalNetPaidToOrganizers)} color="green" />
            <FinKpi icon={<FileText size={18} />} label="Tổng biên lai" value={String(finance.totalReceiptsCount)} color="purple" />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Doanh thu Subscription</p>
              <p className="text-2xl font-black text-purple-600 dark:text-purple-400">{fmtVND(finance.totalSubscriptionRevenue)}</p>
            </div>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5">
              <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Hoàn tiền</p>
              <p className="text-2xl font-black text-red-600 dark:text-red-400">{fmtVND(finance.totalRefundedAmount)}</p>
            </div>
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
              <p className="text-xs font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
                Chờ rút tiền ({finance.pendingPayoutCount})
              </p>
              <p className="text-2xl font-black text-amber-600 dark:text-amber-400">{fmtVND(finance.pendingPayoutAmount)}</p>
            </div>
          </div>
        </div>
      )}
      {!loading && feeTab === 'FINANCE' && !finance && (
        <EmptyState icon={<BarChart3 size={28} />} text="Không thể tải dữ liệu tài chính" />
      )}

      {/* AUDIT LOG */}
      {!loading && feeTab === 'AUDIT' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-white">Nhật ký kiểm toán biểu phí</h2>
            <div className="flex gap-2 items-center">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={auditEntity} onChange={e => { setAuditEntity(e.target.value); setAuditPage(1) }}
                  className="pl-8 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300 font-bold focus:outline-none focus:ring-2 focus:ring-orange-500/20">
                  <option value="">Tất cả loại</option>
                  <option value="SUBSCRIPTION_TIER">Gói dịch vụ</option>
                  <option value="ROLE_POLICY">Role Policy</option>
                  <option value="FEE_OVERRIDE">Fee Override</option>
                  <option value="SYSTEM_PARAM">Tham số hệ thống</option>
                  <option value="USER_ROLE">Role người dùng</option>
                </select>
              </div>
              <button onClick={() => loadAuditLogs(auditPage, auditEntity)} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"><RefreshCw size={15} /></button>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-left text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3">Thời gian</th>
                  <th className="px-5 py-3">Loại</th>
                  <th className="px-5 py-3">Hành động</th>
                  <th className="px-5 py-3">Target ID</th>
                  <th className="px-5 py-3">Lý do</th>
                  <th className="px-5 py-3">Người thực hiện</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.length === 0 ? (
                  <tr><td colSpan={6} className="text-center py-10 text-slate-400 text-sm">Không có nhật ký nào</td></tr>
                ) : auditLogs.map(log => (
                  <tr key={log.logId} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition">
                    <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      <div className="flex items-center gap-1.5"><Clock size={12} />{fmtDate(log.createdAt)}</div>
                    </td>
                    <td className="px-5 py-3"><EntityBadge entity={log.targetEntity} /></td>
                    <td className="px-5 py-3"><ActionBadge action={log.action} /></td>
                    <td className="px-5 py-3 text-xs font-mono text-slate-600 dark:text-slate-300">{log.targetId}</td>
                    <td className="px-5 py-3 text-xs text-slate-500 dark:text-slate-400 max-w-[200px] truncate">{log.reason}</td>
                    <td className="px-5 py-3 text-xs text-slate-600 dark:text-slate-300">{log.changedByName || `Admin #${log.changedBy}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {auditTotal > 15 && (
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-slate-500">{auditTotal} bản ghi — Trang {auditPage}/{auditPageCount}</span>
              <div className="flex gap-1">
                <button disabled={auditPage <= 1} onClick={() => setAuditPage(p => p - 1)} className="p-1.5 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition">
                  <ChevronLeft size={16} />
                </button>
                <button disabled={auditPage >= auditPageCount} onClick={() => setAuditPage(p => p + 1)} className="p-1.5 rounded-lg disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── MODALS ─────────────────────────────────────────────────────────────── */}

      {/* Edit Tier */}
      {editTier && (
        <Modal title={`Chỉnh sửa: ${editTier.name}`} onClose={() => setEditTier(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="Giá (VNĐ/tháng)" type="number" value={String(tierForm.priceVnd)} onChange={v => setTierForm(f => ({ ...f, priceVnd: Number(v) }))} />
              <LabeledInput label="Hoa hồng (BPS, 100=1%)" type="number" value={String(tierForm.commissionBps)} onChange={v => setTierForm(f => ({ ...f, commissionBps: Number(v) }))} />
              <LabeledInput label="Sức chứa tối đa (-1=∞)" type="number" value={String(tierForm.maxCapacityLimit)} onChange={v => setTierForm(f => ({ ...f, maxCapacityLimit: Number(v) }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tierForm.hasAdvancedReports} onChange={e => setTierForm(f => ({ ...f, hasAdvancedReports: e.target.checked }))} className="w-4 h-4 accent-orange-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Mở khóa Báo cáo nâng cao</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={tierForm.isActive} onChange={e => setTierForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-orange-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Kích hoạt gói</span>
            </label>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Lý do thay đổi *</label>
              <textarea value={tierForm.reason} onChange={e => setTierForm(f => ({ ...f, reason: e.target.value }))} rows={2}
                placeholder="Ví dụ: Điều chỉnh hoa hồng theo kế hoạch Q4-2026..."
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200 resize-none" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setEditTier(null)} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Hủy</button>
              <button onClick={handleSaveTier} className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-xl shadow-sm shadow-orange-500/20 hover:scale-[1.02] transition">Lưu thay đổi</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit Role Policy */}
      {editPolicy && (
        <Modal title={`Chỉnh sửa Role: ${editPolicy.roleCode}`} onClose={() => setEditPolicy(null)}>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="Hoa hồng (BPS, 100=1%)" type="number" value={String(policyForm.commissionBps)} onChange={v => setPolicyForm(f => ({ ...f, commissionBps: Number(v) }))} />
              <LabeledInput label="Sức chứa tối đa (-1=∞)" type="number" value={String(policyForm.maxCapacityLimit)} onChange={v => setPolicyForm(f => ({ ...f, maxCapacityLimit: Number(v) }))} />
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={policyForm.hasAdvancedReports} onChange={e => setPolicyForm(f => ({ ...f, hasAdvancedReports: e.target.checked }))} className="w-4 h-4 accent-orange-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Mở khóa Báo cáo nâng cao</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={policyForm.isActive} onChange={e => setPolicyForm(f => ({ ...f, isActive: e.target.checked }))} className="w-4 h-4 accent-orange-500" />
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300">Kích hoạt chính sách</span>
            </label>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Lý do thay đổi *</label>
              <textarea value={policyForm.reason} onChange={e => setPolicyForm(f => ({ ...f, reason: e.target.value }))} rows={2}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200 resize-none" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setEditPolicy(null)} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Hủy</button>
              <button onClick={handleSavePolicy} className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-xl shadow-sm shadow-orange-500/20 hover:scale-[1.02] transition">Lưu thay đổi</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Create Override */}
      {showOverrideForm && (
        <Modal title="Tạo ưu đãi hoa hồng riêng" onClose={() => { setShowOverrideForm(false); setOverrideWarning('') }}>
          <div className="space-y-4">
            {overrideWarning && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex gap-2.5">
                <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  <p className="font-bold mb-1">Yêu cầu xác nhận</p>
                  <p>{overrideWarning.replace('CONFIRMATION_REQUIRED: ', '')}</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={() => handleCreateOverride(true)} className="px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-bold hover:bg-amber-600 transition">Xác nhận tạo</button>
                    <button onClick={() => setOverrideWarning('')} className="px-3 py-1.5 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 rounded-lg text-xs font-bold transition">Hủy</button>
                  </div>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <LabeledInput label="Organizer ID" type="number" value={overrideForm.organizerId} onChange={v => setOverrideForm(f => ({ ...f, organizerId: v }))} placeholder="Ví dụ: 18" />
              <LabeledInput label="Hoa hồng (BPS)" type="number" value={overrideForm.commissionBps} onChange={v => setOverrideForm(f => ({ ...f, commissionBps: v }))} placeholder="Ví dụ: 200 = 2%" />
              <LabeledInput label="Bắt đầu" type="datetime-local" value={overrideForm.startTime} onChange={v => setOverrideForm(f => ({ ...f, startTime: v }))} />
              <LabeledInput label="Kết thúc" type="datetime-local" value={overrideForm.endTime} onChange={v => setOverrideForm(f => ({ ...f, endTime: v }))} />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Lý do ưu đãi</label>
              <input value={overrideForm.reason} onChange={e => setOverrideForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Ví dụ: Ʈu đãi đối tác chiến lược Q4"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => { setShowOverrideForm(false); setOverrideWarning('') }} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Hủy</button>
              <button onClick={() => handleCreateOverride(false)} className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-xl shadow-sm shadow-orange-500/20 hover:scale-[1.02] transition">Tạo ưu đãi</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Edit System Param */}
      {editParam && (
        <Modal title={`Cập nhật: ${editParam.paramKey}`} onClose={() => setEditParam(null)}>
          <div className="space-y-4">
            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-3 text-xs text-slate-500">{editParam.description}</div>
            <LabeledInput label="Giá trị mới" type="text" value={paramForm.paramValue} onChange={v => setParamForm(f => ({ ...f, paramValue: v }))} placeholder="Nhập giá trị mới..." />
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Lý do thay đổi *</label>
              <textarea value={paramForm.reason} onChange={e => setParamForm(f => ({ ...f, reason: e.target.value }))} rows={2}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200 resize-none" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setEditParam(null)} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Hủy</button>
              <button onClick={handleSaveParam} className="px-5 py-2 text-xs font-bold bg-gradient-to-r from-orange-600 to-orange-500 text-white rounded-xl shadow-sm shadow-orange-500/20 hover:scale-[1.02] transition">Lưu thay đổi</button>
            </div>
          </div>
        </Modal>
      )}

      {/* School Role Modal */}
      {showSchoolRoleModal && (
        <Modal title="Cấp / Thu hồi quyền School Organizer" onClose={() => setShowSchoolRoleModal(false)}>
          <div className="space-y-4">
            <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
              {(['assign', 'revoke'] as const).map(action => (
                <button
                  key={action}
                  onClick={() => setSchoolRoleForm(f => ({ ...f, action }))}
                  className={`flex-1 py-2.5 text-xs font-bold transition ${schoolRoleForm.action === action ? 'bg-orange-500 text-white' : 'bg-white dark:bg-slate-900 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'}`}
                >
                  {action === 'assign' ? '✅ Cấp quyền' : '❌ Thu hồi'}
                </button>
              ))}
            </div>
            <LabeledInput label="User ID (Organizer)" type="number" value={schoolRoleForm.userId} onChange={v => setSchoolRoleForm(f => ({ ...f, userId: v }))} placeholder="Ví dụ: 18" />
            <div>
              <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1.5">Lý do</label>
              <input value={schoolRoleForm.reason} onChange={e => setSchoolRoleForm(f => ({ ...f, reason: e.target.value }))}
                placeholder="Ví dụ: Cấp quyền cho cán bộ phòng HSSV"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 text-slate-800 dark:text-slate-200" />
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setShowSchoolRoleModal(false)} className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition">Hủy</button>
              <button
                onClick={handleSchoolRole}
                className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-sm transition hover:scale-[1.02] ${schoolRoleForm.action === 'assign' ? 'bg-gradient-to-r from-green-600 to-green-500 shadow-green-500/20' : 'bg-gradient-to-r from-red-600 to-red-500 shadow-red-500/20'}`}
              >
                {schoolRoleForm.action === 'assign' ? 'Cấp quyền' : 'Thu hồi quyền'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
