import { supabase } from '@withmini/shared'

/**
 * 스펙 섹션 2 admin_audit_logs — 관리자의 주요 CRUD 행동을 기록한다.
 * 실패해도 원래 작업을 막지 않도록 호출부에서 await 후 에러만 콘솔에 남긴다.
 */
export async function logAdminAction(params: {
  adminId: string
  action: string
  targetTable: string
  targetId: string | null
  detail?: Record<string, unknown>
}) {
  const { error } = await supabase.from('admin_audit_logs').insert({
    admin_id: params.adminId,
    action: params.action,
    target_table: params.targetTable,
    // admin_audit_logs.target_id는 DB상 nullable(uuid)이다. settings처럼 PK가 uuid가 아닌
    // 대상은 target_id 없이 기록해야 하므로, 공유 타입(Insert)의 non-null 제약을 여기서만 우회한다.
    target_id: params.targetId as unknown as string,
    detail: params.detail ?? null,
  })

  if (error) {
    console.error('[audit log] failed to record action', params.action, error)
  }
}
