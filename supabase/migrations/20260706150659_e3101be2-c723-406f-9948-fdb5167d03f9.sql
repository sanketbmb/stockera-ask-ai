
-- paid-videos: fully private, staff-only, own-folder
CREATE POLICY "paid_videos_staff_write_own_folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'paid-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "paid_videos_staff_update_own_folder"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'paid-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "paid_videos_staff_delete_own_folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'paid-videos'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "paid_videos_staff_read_all"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'paid-videos'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

-- End-user playback ONLY via server-issued signed URLs (no direct SELECT for end users).

-- video-thumbnails
CREATE POLICY "video_thumbs_staff_write_own_folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'video-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "video_thumbs_staff_update_own_folder"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'video-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "video_thumbs_staff_delete_own_folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'video-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "video_thumbs_read_all"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'video-thumbnails');

-- curated-thumbnails
CREATE POLICY "curated_thumbs_staff_write_own_folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'curated-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "curated_thumbs_staff_update_own_folder"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'curated-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "curated_thumbs_staff_delete_own_folder"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'curated-thumbnails'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analyst'))
);

CREATE POLICY "curated_thumbs_read_all"
ON storage.objects FOR SELECT TO anon, authenticated
USING (bucket_id = 'curated-thumbnails');
