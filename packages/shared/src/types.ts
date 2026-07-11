/**
 * withmini Demo Mode DB 타입 정의.
 * docs/withmini_demo_spec.md 섹션 2(데이터 모델)와 1:1로 일치해야 한다.
 * 스키마 변경은 architect 승인 후 이 파일과 supabase/migrations/*.sql을 함께 갱신한다.
 */

// 아래 Row 타입들은 의도적으로 `interface`가 아닌 `type`으로 선언한다.
// postgrest-js는 `Row extends Record<string, unknown>` 형태의 조건부 타입 체크로
// select/insert/update 반환·인자 타입을 추론하는데, interface는 선언 병합(declaration
// merging) 가능성 때문에 이 조건부 체크에서 예상대로 매칭되지 않아 `never`로 추론되는
// TS quirk가 있다(Supabase 공식 codegen 결과물도 항상 type을 사용하는 이유). 컬럼 구성
// 자체는 이전과 동일하다 — 선언 키워드만 바뀐 순수 타입 레벨 정정이다.

export type AdminRole = 'super_admin' | 'staff'

export type Admin = {
  id: string
  name: string | null
  role: AdminRole
  is_active: boolean
  created_at: string
}

export type AdminAuditLog = {
  id: string
  admin_id: string
  action: string
  target_table: string
  target_id: string
  detail: Record<string, unknown> | null
  created_at: string
}

export type Concept = {
  id: string
  name: string
  is_visible: boolean
  display_order: number
  image_url: string | null
  created_at: string
  updated_at: string
}

export type FrameSlot = {
  x: number
  y: number
  width: number
  height: number
  rotation?: number
}

export type FrameLayoutData = {
  slots: FrameSlot[]
}

export type Frame = {
  id: string
  concept_id: string
  name: string
  slot_count: number
  preview_image_url: string | null
  layout_data: FrameLayoutData | null
  frame_video_url: string | null
  is_active: boolean
  is_general: boolean
  created_at: string
  updated_at: string
}

export type SessionStatus = 'in_progress' | 'completed' | 'expired' | 'deleted'

export type Session = {
  id: string
  concept_id: string
  frame_id: string
  raw_photo_urls: string[]
  selected_photo_urls: string[]
  result_image_url: string | null
  timelapse_video_url: string | null
  qr_url: string | null
  created_at: string
  expires_at: string
  status: SessionStatus
}

export type Setting = {
  key: string
  value: string
  updated_at: string
}

/**
 * Supabase JS 클라이언트에 넘길 수 있는 최소한의 Database 제네릭 타입.
 * @supabase/supabase-js(postgrest-js)의 GenericSchema/GenericTable이 각 테이블에
 * `Relationships`를, public 스키마에 `Views`/`Functions`를 요구하므로 (없으면
 * insert/update/upsert 인자가 전부 `never`로 추론됨) 명시적으로 빈 값을 채워둔다.
 * 이 테이블에는 아직 FK 관계를 select 임베드용으로 노출하지 않으므로 Relationships는
 * 모두 빈 배열이다. DB 컬럼/타입 자체는 변경되지 않았다 — 순수 타입 레벨 정정.
 * interface가 아닌 type으로 선언하는 이유는 위 Row 타입들 주석 참고.
 */
export type Database = {
  public: {
    Tables: {
      admins: {
        Row: Admin
        Insert: Partial<Admin> & { id: string }
        Update: Partial<Admin>
        Relationships: []
      }
      admin_audit_logs: {
        Row: AdminAuditLog
        Insert: Partial<AdminAuditLog> & Pick<AdminAuditLog, 'admin_id' | 'action' | 'target_table' | 'target_id'>
        Update: Partial<AdminAuditLog>
        Relationships: []
      }
      concepts: {
        Row: Concept
        Insert: Partial<Concept> & Pick<Concept, 'name'>
        Update: Partial<Concept>
        Relationships: []
      }
      frames: {
        Row: Frame
        Insert: Partial<Frame> & Pick<Frame, 'concept_id' | 'name' | 'slot_count'>
        Update: Partial<Frame>
        Relationships: []
      }
      sessions: {
        Row: Session
        Insert: Partial<Session> & Pick<Session, 'concept_id' | 'frame_id'>
        Update: Partial<Session>
        Relationships: []
      }
      settings: {
        Row: Setting
        Insert: Setting
        Update: Partial<Setting>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
  }
}
