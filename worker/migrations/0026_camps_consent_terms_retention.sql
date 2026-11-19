-- Consent and retention bookkeeping for camp_students:
--  health_consent_*  when / under which policy version the student ticked the consent for the optional health and food details
--  terms_*           when / which version of the terms + privacy policy the student accepted
--  status_end_*      the day the student's status ended (graduated, left, transferred ...) and why: personal data is erased 2 years later
ALTER TABLE camp_students ADD COLUMN health_consent_at TEXT;
ALTER TABLE camp_students ADD COLUMN health_consent_ver TEXT;
ALTER TABLE camp_students ADD COLUMN terms_accepted_at TEXT;
ALTER TABLE camp_students ADD COLUMN terms_ver TEXT;
ALTER TABLE camp_students ADD COLUMN status_end_date TEXT;
ALTER TABLE camp_students ADD COLUMN status_end_reason TEXT;
