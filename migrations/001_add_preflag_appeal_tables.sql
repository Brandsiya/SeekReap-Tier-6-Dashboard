-- =====================================================
-- SeekReap Migration: Add Pre-flag and Appeal System
-- Version: 1.0.0
-- Date: 2026-02-25
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CREATORS TABLE (extends your existing creator system)
-- =====================================================
CREATE TABLE IF NOT EXISTS creators (
    creator_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    legacy_creator_id   INTEGER UNIQUE,                    -- Maps to your existing creator_id (1,2,3...)
    youtube_channel_id  VARCHAR(64) UNIQUE,
    channel_name        VARCHAR(255),
    email               VARCHAR(320),
    joined_at           TIMESTAMPTZ DEFAULT NOW(),
    appeal_credits      INTEGER DEFAULT 3,
    updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_creators_legacy_id ON creators(legacy_creator_id);
CREATE INDEX IF NOT EXISTS idx_creators_youtube_channel ON creators(youtube_channel_id);

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_creators_updated_at 
    BEFORE UPDATE ON creators 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- 2. CONTENT SUBMISSIONS (Pre-flag submissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS content_submissions (
    submission_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id          UUID NOT NULL REFERENCES creators(creator_id),
    channel_id          VARCHAR(64) NOT NULL,
    title               VARCHAR(500),
    description         TEXT,
    tags                TEXT[],
    video_file_ref      VARCHAR(1024),       -- S3/GCS path, not raw content
    thumbnail_ref       VARCHAR(1024),
    duration_seconds    INTEGER,
    category_id         INTEGER,             -- YouTube category
    made_for_kids       BOOLEAN DEFAULT FALSE,
    submitted_at        TIMESTAMPTZ DEFAULT NOW(),
    status              VARCHAR(32) DEFAULT 'pending'
                            CHECK (status IN ('pending','processing','complete','error'))
);

CREATE INDEX IF NOT EXISTS idx_submissions_creator ON content_submissions(creator_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status ON content_submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_submitted_at ON content_submissions(submitted_at);

-- =====================================================
-- 3. POLICY CHECKS (Individual policy dimensions)
-- =====================================================
CREATE TABLE IF NOT EXISTS policy_checks (
    check_id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id       UUID NOT NULL REFERENCES content_submissions(submission_id) ON DELETE CASCADE,
    policy_category     VARCHAR(64) NOT NULL
                            CHECK (policy_category IN (
                                'spam_deceptive_scams',
                                'sensitive_content',
                                'violent_extremist',
                                'harmful_dangerous',
                                'misinformation',
                                'copyright',
                                'privacy',
                                'child_safety',
                                'hate_speech',
                                'harassment_cyberbullying',
                                'advertiser_friendly'
                            )),
    severity_score      NUMERIC(5,2) CHECK (severity_score BETWEEN 0 AND 100),
    risk_level          VARCHAR(16) CHECK (risk_level IN ('low','medium','high','critical')),
    triggered_rules     JSONB,               -- which sub-rules flagged
    recommendation      VARCHAR(32) CHECK (recommendation IN (
                            'proceed','caution','edit_required','do_not_upload'
                        )),
    details             TEXT,
    checked_at          TIMESTAMPTZ DEFAULT NOW(),
    checker_version     VARCHAR(32)          -- model/engine version for auditability
);

CREATE INDEX IF NOT EXISTS idx_policy_checks_submission ON policy_checks(submission_id);
CREATE INDEX IF NOT EXISTS idx_policy_checks_category ON policy_checks(policy_category);
CREATE INDEX IF NOT EXISTS idx_policy_checks_risk ON policy_checks(risk_level);

-- =====================================================
-- 4. FLAGGED SEGMENTS (Specific parts flagged)
-- =====================================================
CREATE TABLE IF NOT EXISTS flagged_segments (
    segment_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    check_id            UUID NOT NULL REFERENCES policy_checks(check_id) ON DELETE CASCADE,
    segment_type        VARCHAR(32) CHECK (segment_type IN (
                            'timestamp','thumbnail_region','title','description','tag','card'
                        )),
    start_time_ms       INTEGER,             -- for timestamp-based flags
    end_time_ms         INTEGER,
    bounding_box        JSONB,               -- {x, y, w, h} for thumbnail regions
    text_excerpt        TEXT,                -- offending text snippet (sanitized)
    confidence          NUMERIC(5,4),
    suggested_edit      TEXT
);

CREATE INDEX IF NOT EXISTS idx_segments_check ON flagged_segments(check_id);

-- =====================================================
-- 5. SUBMISSION RESULTS (Aggregated results)
-- =====================================================
CREATE TABLE IF NOT EXISTS submission_results (
    result_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id       UUID NOT NULL REFERENCES content_submissions(submission_id) ON DELETE CASCADE UNIQUE,
    overall_risk        VARCHAR(16) CHECK (overall_risk IN ('low','medium','high','critical')),
    monetization_eligible   BOOLEAN,
    age_restriction_likely  BOOLEAN,
    limited_views_likely    BOOLEAN,         -- "limited or no ads" yellow dollar sign
    final_recommendation    VARCHAR(32),
    summary_notes       TEXT,
    completed_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_results_submission ON submission_results(submission_id);

-- =====================================================
-- 6. CONTENT REVISIONS (Edits made by creators)
-- =====================================================
CREATE TABLE IF NOT EXISTS content_revisions (
    revision_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    submission_id       UUID NOT NULL REFERENCES content_submissions(submission_id) ON DELETE CASCADE,
    revision_number     INTEGER NOT NULL,
    changes_made        JSONB,               -- log of what was changed
    recheck_triggered   BOOLEAN DEFAULT FALSE,
    revised_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_revisions_submission ON content_revisions(submission_id);

-- =====================================================
-- 7. ENFORCEMENT ACTIONS (YouTube actions that prompted appeals)
-- =====================================================
CREATE TABLE IF NOT EXISTS enforcement_actions (
    action_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    creator_id          UUID NOT NULL REFERENCES creators(creator_id),
    youtube_video_id    VARCHAR(32) NOT NULL,
    video_title         VARCHAR(500),
    action_type         VARCHAR(64) NOT NULL
                            CHECK (action_type IN (
                                'demonetization',
                                'age_restriction',
                                'limited_distribution',
                                'content_removal',
                                'strike',
                                'channel_suspension'
                            )),
    policy_violated     VARCHAR(128),        -- as stated by YouTube
    youtube_notified_at TIMESTAMPTZ,
    youtube_decision_url VARCHAR(1024),      -- deep link to Studio notification
    raw_yt_notice       TEXT,               -- verbatim notice text
    recorded_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_enforcement_creator ON enforcement_actions(creator_id);
CREATE INDEX IF NOT EXISTS idx_enforcement_video ON enforcement_actions(youtube_video_id);

-- =====================================================
-- 8. APPEALS (Creator appeal submissions)
-- =====================================================
CREATE TABLE IF NOT EXISTS appeals (
    appeal_id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    action_id           UUID NOT NULL REFERENCES enforcement_actions(action_id) ON DELETE CASCADE,
    creator_id          UUID NOT NULL REFERENCES creators(creator_id),
    appeal_channel      VARCHAR(32) CHECK (appeal_channel IN (
                            'youtube_studio',   -- in-platform appeal
                            'yt_help_forum',
                            'legal_dispute',
                            'copyright_counter_notification'
                        )),
    grounds             VARCHAR(64) CHECK (grounds IN (
                            'misclassification',
                            'context_misunderstood',
                            'educational_news_documentary',
                            'satire_parody',
                            'fair_use',
                            'original_content',
                            'policy_change',
                            'technical_error',
                            'other'
                        )),
    creator_statement   TEXT NOT NULL,
    submitted_at        TIMESTAMPTZ DEFAULT NOW(),
    status              VARCHAR(32) DEFAULT 'draft'
                            CHECK (status IN (
                                'draft','submitted','under_review',
                                'upheld','overturned','partially_overturned',
                                'expired','withdrawn'
                            )),
    yt_appeal_ref       VARCHAR(128)         -- YouTube's own case/ticket number
);

CREATE INDEX IF NOT EXISTS idx_appeals_creator ON appeals(creator_id);
CREATE INDEX IF NOT EXISTS idx_appeals_action ON appeals(action_id);
CREATE INDEX IF NOT EXISTS idx_appeals_status ON appeals(status);

-- =====================================================
-- 9. APPEAL EVIDENCE (Supporting documents)
-- =====================================================
CREATE TABLE IF NOT EXISTS appeal_evidence (
    evidence_id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appeal_id           UUID NOT NULL REFERENCES appeals(appeal_id) ON DELETE CASCADE,
    evidence_type       VARCHAR(64) CHECK (evidence_type IN (
                            'script_or_transcript',
                            'research_source',
                            'license_document',
                            'prior_approval',
                            'third_party_statement',
                            'policy_reference',
                            'timestamp_context',
                            'other'
                        )),
    file_ref            VARCHAR(1024),       -- stored securely; never raw PII
    description         TEXT,
    added_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evidence_appeal ON appeal_evidence(appeal_id);

-- =====================================================
-- 10. APPEAL STATUS HISTORY (Audit trail)
-- =====================================================
CREATE TABLE IF NOT EXISTS appeal_status_history (
    history_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appeal_id           UUID NOT NULL REFERENCES appeals(appeal_id) ON DELETE CASCADE,
    old_status          VARCHAR(32),
    new_status          VARCHAR(32),
    changed_by          VARCHAR(64),         -- 'creator', 'youtube', 'system'
    note                TEXT,
    changed_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_history_appeal ON appeal_status_history(appeal_id);

-- =====================================================
-- 11. APPEAL OUTCOMES (YouTube's final response)
-- =====================================================
CREATE TABLE IF NOT EXISTS appeal_outcomes (
    outcome_id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appeal_id           UUID NOT NULL REFERENCES appeals(appeal_id) ON DELETE CASCADE UNIQUE,
    outcome             VARCHAR(32) CHECK (outcome IN (
                            'reinstated_full',
                            'reinstated_partial',
                            'denied',
                            'escalated_legal'
                        )),
    monetization_restored   BOOLEAN,
    distribution_restored   BOOLEAN,
    yt_response_text    TEXT,
    responded_at        TIMESTAMPTZ,
    next_action         TEXT                 -- e.g., "eligible to re-appeal in 90 days"
);

CREATE INDEX IF NOT EXISTS idx_outcomes_appeal ON appeal_outcomes(appeal_id);

-- =====================================================
-- 12. LEGAL ESCALATIONS (DMCA, legal action)
-- =====================================================
CREATE TABLE IF NOT EXISTS legal_escalations (
    escalation_id       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    appeal_id           UUID NOT NULL REFERENCES appeals(appeal_id) ON DELETE CASCADE,
    escalation_type     VARCHAR(64) CHECK (escalation_type IN (
                            'dmca_counter_notification',
                            'legal_representation',
                            'regulatory_complaint',
                            'arbitration'
                        )),
    legal_counsel       VARCHAR(255),        -- firm name only, no PII
    filed_at            TIMESTAMPTZ,
    status              VARCHAR(32),
    notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_appeal ON legal_escalations(appeal_id);

-- =====================================================
-- 13. Update existing tables to link with new schema
-- =====================================================

-- Add submission_id to job_queue
ALTER TABLE job_queue 
ADD COLUMN IF NOT EXISTS submission_id UUID REFERENCES content_submissions(submission_id);

-- Add appeal_id to content_results
ALTER TABLE content_results 
ADD COLUMN IF NOT EXISTS appeal_id UUID REFERENCES appeals(appeal_id);

-- Create indexes on new columns
CREATE INDEX IF NOT EXISTS idx_job_queue_submission ON job_queue(submission_id);
CREATE INDEX IF NOT EXISTS idx_content_results_appeal ON content_results(appeal_id);

-- =====================================================
-- 14. Migrate existing creator data
-- =====================================================

-- Insert existing creators from job_queue
INSERT INTO creators (legacy_creator_id, joined_at)
SELECT DISTINCT creator_id, MIN(created_at)
FROM job_queue
WHERE creator_id IS NOT NULL
GROUP BY creator_id
ON CONFLICT (legacy_creator_id) DO NOTHING;

-- =====================================================
-- 15. Create views for common queries
-- =====================================================

-- View for creator dashboard
CREATE OR REPLACE VIEW creator_dashboard AS
SELECT 
    c.creator_id,
    c.legacy_creator_id,
    c.channel_name,
    COUNT(DISTINCT cs.submission_id) as total_prechecks,
    COUNT(DISTINCT ea.action_id) as total_enforcements,
    COUNT(DISTINCT a.appeal_id) as total_appeals,
    SUM(CASE WHEN ao.outcome IN ('reinstated_full', 'reinstated_partial') THEN 1 ELSE 0 END) as successful_appeals
FROM creators c
LEFT JOIN content_submissions cs ON c.creator_id = cs.creator_id
LEFT JOIN enforcement_actions ea ON c.creator_id = ea.creator_id
LEFT JOIN appeals a ON c.creator_id = a.creator_id
LEFT JOIN appeal_outcomes ao ON a.appeal_id = ao.appeal_id
GROUP BY c.creator_id, c.legacy_creator_id, c.channel_name;

-- View for policy check summary
CREATE OR REPLACE VIEW policy_summary AS
SELECT 
    pc.policy_category,
    COUNT(*) as total_checks,
    AVG(pc.severity_score) as avg_severity,
    SUM(CASE WHEN pc.risk_level = 'critical' THEN 1 ELSE 0 END) as critical_count,
    SUM(CASE WHEN pc.recommendation = 'edit_required' THEN 1 ELSE 0 END) as edits_needed
FROM policy_checks pc
GROUP BY pc.policy_category;

-- =====================================================
-- 16. Grant permissions (adjust as needed)
-- =====================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO neondb_owner;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO neondb_owner;

-- =====================================================
-- Migration complete
-- =====================================================
SELECT '✅ Migration completed successfully!' as status;
SELECT COUNT(*) as creators_migrated FROM creators;
