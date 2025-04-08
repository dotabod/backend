-- Add advanced_bets table for storing advanced bet types
CREATE TABLE IF NOT EXISTS advanced_bets (
  id SERIAL PRIMARY KEY,
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  bet_type TEXT NOT NULL,
  predictionId TEXT,
  title TEXT NOT NULL,
  outcome_1 TEXT NOT NULL,
  outcome_2 TEXT NOT NULL,
  winning_outcome INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  data JSONB DEFAULT '{}'::jsonb
);

-- Add indexes for common query paths
CREATE INDEX IF NOT EXISTS idx_advanced_bets_match_id ON advanced_bets(match_id);
CREATE INDEX IF NOT EXISTS idx_advanced_bets_bet_type ON advanced_bets(bet_type);
CREATE INDEX IF NOT EXISTS idx_advanced_bets_predictionId ON advanced_bets(predictionId);

-- Add comments for documentation
COMMENT ON TABLE advanced_bets IS 'Stores advanced bet types linked to the original matches table for match tracking';
COMMENT ON COLUMN advanced_bets.match_id IS 'References the matches table ID for match tracking';
COMMENT ON COLUMN advanced_bets.bet_type IS 'Type of bet (e.g., win_loss, first_tower, etc.)';
COMMENT ON COLUMN advanced_bets.predictionId IS 'Twitch prediction ID';
COMMENT ON COLUMN advanced_bets.title IS 'Title of the prediction shown to users';
COMMENT ON COLUMN advanced_bets.outcome_1 IS 'Text for the first outcome option';
COMMENT ON COLUMN advanced_bets.outcome_2 IS 'Text for the second outcome option';
COMMENT ON COLUMN advanced_bets.winning_outcome IS 'Index of winning outcome (0 or 1, or -1 for refunded)';
COMMENT ON COLUMN advanced_bets.data IS 'JSON data specific to this bet type for determining winners';
