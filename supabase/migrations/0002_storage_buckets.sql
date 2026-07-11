-- withmini Demo Mode — Storage 버킷 구조
-- docs/withmini_demo_spec.md 섹션 3을 그대로 반영한다.
-- 프레임 관련 버킷(frame-previews, frame-videos)은 공개 읽기, 세션 관련 버킷은 비공개.
-- 세션 관련 버킷의 signed URL 세부 정책은 infra-agent(섹션 6, 9)가 최종 정리한다.

insert into storage.buckets (id, name, public)
values
  ('frame-previews', 'frame-previews', true),
  ('frame-videos', 'frame-videos', true),
  ('session-raw', 'session-raw', false),
  ('session-results', 'session-results', false),
  ('session-timelapse', 'session-timelapse', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- frame-previews / frame-videos: 공개 읽기, super_admin만 쓰기/수정/삭제
-- ---------------------------------------------------------------------------
create policy frame_previews_public_read
  on storage.objects for select
  using (bucket_id = 'frame-previews');

create policy frame_previews_admin_write
  on storage.objects for insert
  with check (bucket_id = 'frame-previews' and public.is_super_admin());

create policy frame_previews_admin_update
  on storage.objects for update
  using (bucket_id = 'frame-previews' and public.is_super_admin());

create policy frame_previews_admin_delete
  on storage.objects for delete
  using (bucket_id = 'frame-previews' and public.is_super_admin());

create policy frame_videos_public_read
  on storage.objects for select
  using (bucket_id = 'frame-videos');

create policy frame_videos_admin_write
  on storage.objects for insert
  with check (bucket_id = 'frame-videos' and public.is_super_admin());

create policy frame_videos_admin_update
  on storage.objects for update
  using (bucket_id = 'frame-videos' and public.is_super_admin());

create policy frame_videos_admin_delete
  on storage.objects for delete
  using (bucket_id = 'frame-videos' and public.is_super_admin());

-- ---------------------------------------------------------------------------
-- session-raw / session-results / session-timelapse: 비공개 버킷.
-- booth 앱은 로그인 없이 anon key로 직접 업로드/조회하므로 baseline은 anon 허용으로 시작한다.
-- 폴더 경로가 session-raw/{sessionId}/... 형태(추측 불가능한 uuid)라는 점으로 최소한의 접근 제어를
-- 삼되, 목록 조회(list) 자체를 막는 signed URL 전용 방식으로의 전환은 infra-agent가 검토/적용한다.
-- super_admin은 세션 수동 삭제(스펙 5.4) 목적으로 delete 권한을 가진다.
-- ---------------------------------------------------------------------------
create policy session_raw_anon_read
  on storage.objects for select
  using (bucket_id = 'session-raw');

create policy session_raw_anon_write
  on storage.objects for insert
  with check (bucket_id = 'session-raw');

create policy session_raw_admin_delete
  on storage.objects for delete
  using (bucket_id = 'session-raw' and public.is_super_admin());

create policy session_results_anon_read
  on storage.objects for select
  using (bucket_id = 'session-results');

create policy session_results_anon_write
  on storage.objects for insert
  with check (bucket_id = 'session-results');

create policy session_results_admin_delete
  on storage.objects for delete
  using (bucket_id = 'session-results' and public.is_super_admin());

create policy session_timelapse_anon_read
  on storage.objects for select
  using (bucket_id = 'session-timelapse');

create policy session_timelapse_anon_write
  on storage.objects for insert
  with check (bucket_id = 'session-timelapse');

create policy session_timelapse_admin_delete
  on storage.objects for delete
  using (bucket_id = 'session-timelapse' and public.is_super_admin());
