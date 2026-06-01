INSERT INTO public.user_roles (user_id, role)
VALUES ('efe1db9f-d822-4e9d-85a6-0fe98ab00ddd', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.audit_events (event_type, actor_id, resource_type, resource_id, payload)
VALUES ('admin_granted', 'efe1db9f-d822-4e9d-85a6-0fe98ab00ddd', 'user',
        'efe1db9f-d822-4e9d-85a6-0fe98ab00ddd',
        jsonb_build_object('method','manual_promotion','email','satawatrishabh@gmail.com'));