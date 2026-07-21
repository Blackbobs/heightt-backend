-- Create extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Create additional databases if needed
-- CREATE DATABASE heightt_test;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE heightt_db TO postgres;