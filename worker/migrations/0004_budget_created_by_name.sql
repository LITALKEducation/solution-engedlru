-- Store the Auth0 display name of whoever recorded a transaction / donation.
-- Old rows stay NULL and fall back to the budget_users display name, then the email.
ALTER TABLE budget_transactions ADD COLUMN created_by_name TEXT;
ALTER TABLE budget_donations ADD COLUMN created_by_name TEXT;
