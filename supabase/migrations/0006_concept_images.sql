-- withmini Demo Mode — 컨셉 이미지 지원
-- 사용자(사람) 요청 기능 확장: 컨셉 선택 카드에 컨셉별 이미지를 배경으로 깔고 중앙에 컨셉명을 표시한다.
-- 사용자 승인 완료, team-lead 지시에 따라 architect가 계약(스펙 섹션 2/3) 변경 절차를 진행한다
-- (CLAUDE.md 섹션 3). 0001_init.sql의 concepts 테이블에 컬럼을 추가하고, 0002_storage_buckets.sql의
-- frame-previews 버킷과 동일한 정책 패턴으로 concept-images 버킷을 추가한다.

-- ---------------------------------------------------------------------------
-- 1. concepts.image_url 컬럼 추가 (nullable — 기존 컨셉/기존 코드에 영향 없음)
-- ---------------------------------------------------------------------------
alter table public.concepts
  add column if not exists image_url text;

comment on column public.concepts.image_url is '컨셉 카드 배경 이미지 (Supabase Storage concept-images 버킷 경로). 미설정 시 null.';

-- ---------------------------------------------------------------------------
-- 2. concept-images 버킷: frame-previews와 동일하게 공개 읽기, super_admin만 쓰기
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('concept-images', 'concept-images', true)
on conflict (id) do nothing;

create policy concept_images_public_read
  on storage.objects for select
  using (bucket_id = 'concept-images');

create policy concept_images_admin_write
  on storage.objects for insert
  with check (bucket_id = 'concept-images' and public.is_super_admin());

create policy concept_images_admin_update
  on storage.objects for update
  using (bucket_id = 'concept-images' and public.is_super_admin());

create policy concept_images_admin_delete
  on storage.objects for delete
  using (bucket_id = 'concept-images' and public.is_super_admin());
