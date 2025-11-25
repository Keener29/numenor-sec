import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { query } from './connection.js';

// database migration script that automatically sets 
// up your PostgreSQL database schema by reading and 
// executing SQL statements from schema.sql

const handleDollarQuote = (trimmedLine: string, inDollarQuote: boolean, dollarQuoteTag: string): { inDollarQuote: boolean, dollarQuoteTag: string } => {
  // Handle dollar-quoted strings (used in PostgreSQL functions)
  if (trimmedLine.includes('$$')) {
    if (!inDollarQuote) {
      // Start of dollar quote
      const regex = /\$([^$]*)\$/;
      const match = regex.exec(trimmedLine);
      if (match) {
        dollarQuoteTag = match[0];
        inDollarQuote = true;
      }
    } else if (trimmedLine.includes(dollarQuoteTag)) {
      // End of dollar quote
      inDollarQuote = false;
      dollarQuoteTag = '';
    }
  }
  return { inDollarQuote, dollarQuoteTag };
};

const handleEndOfStatement = (trimmedLine: string, inDollarQuote: boolean, inFunction: boolean, statements: string[], currentStatement: string): { inFunction: boolean, currentStatement: string } => {
  // End of statement (semicolon not in dollar quote and not in function body)
  if (trimmedLine.endsWith(';') && !inDollarQuote) {
    if (inFunction) {
      // Check if this is the end of the function
      if (trimmedLine.includes('$$ LANGUAGE') || trimmedLine.includes('$$;')) {
        inFunction = false;
      }
    }

    if (!inFunction || trimmedLine.includes('$$ LANGUAGE')) {
      statements.push(currentStatement.trim());
      currentStatement = '';
    }
  }
  return { inFunction, currentStatement };
};
// Parse SQL statements properly, handling PostgreSQL functions
const parseSQLStatements = (sql: string): string[] => {
  const statements: string[] = [];
  let currentStatement = '';
  let inFunction = false;
  let inDollarQuote = false;
  let dollarQuoteTag: string = '';
  const lines = sql.split('\n');

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip comments
    if (trimmedLine.startsWith('--')) {
      continue;
    }

    ({ inDollarQuote, dollarQuoteTag } = handleDollarQuote(trimmedLine, inDollarQuote, dollarQuoteTag));

    // Check if we're starting a function
    if (trimmedLine.toUpperCase().includes('CREATE OR REPLACE FUNCTION') ||
      trimmedLine.toUpperCase().includes('CREATE FUNCTION')) {
      inFunction = true;
    }

    currentStatement += line + '\n';

    ({ inFunction, currentStatement } = handleEndOfStatement(trimmedLine, inDollarQuote, inFunction, statements, currentStatement));
  }

  // Add any remaining statement
  if (currentStatement.trim()) {
    statements.push(currentStatement.trim());
  }

  return statements.filter(stmt => stmt.length > 0);
};

export const runMigrations = async (): Promise<void> => {
  try {
    console.log('Running database migrations...');

    // Read the schema file
    const schemaPath = join(process.cwd(), 'app', 'db', 'schema.sql');
    const schema = readFileSync(schemaPath, 'utf8');

    // Parse SQL statements properly
    const statements = parseSQLStatements(schema);

    // Execute each statement with error handling
    for (const statement of statements) {
      if (statement.trim()) {
        try {
          await query(statement);
        } catch (error: any) {
          // Skip errors for things that already exist
          if (error.code === '42P07' || // relation already exists
            error.code === '42710' || // object already exists (constraints, indexes)
            error.code === '42723' || // function already exists
            error.code === '42P16' || // index already exists
            error.message?.includes('already exists')) {
            console.log(`✓ Skipping (already exists): ${statement.substring(0, 60)}...`);
            continue;
          }
          throw error;
        }
      }
    }

    console.log('Database migrations completed successfully!');
  } catch (error) {
    console.error('Error running migrations:', error);
    throw error;
  }
};

// Run migrations if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runMigrations();
    console.log('Migrations completed');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}
