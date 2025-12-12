# Testing Documentation

This document outlines the testing setup and guidelines for the ClickSafe project.

## Testing Framework

- **Jest**: JavaScript testing framework
- **ts-jest**: TypeScript preprocessor for Jest
- **@types/jest**: TypeScript definitions for Jest

## Test Configuration

### Jest Configuration (`jest.config.js`)

- Uses `ts-jest/presets/default-esm` preset for ESM support
- Test environment: Node.js
- Test files: `**/__tests__/**/*.test.ts` and `**/?(*.)+(spec|test).ts`
- TypeScript configuration: `tsconfig.test.json`

### TypeScript Test Configuration (`tsconfig.test.json`)

- Extends main `tsconfig.json`
- Includes Jest and Node types
- ESM module support enabled
- Strict type checking enabled

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
# npm test -- --coverage --coverageReporters=lcov
```

## Test Structure

### Current Test Files

1. **`app/api/services/detector/__tests__/textAnalyzer.test.ts`**
   - Comprehensive unit tests for Text Analyzer with intelligent text analysis
   - Tests subject vs body distinction with 1.5x subject weighting
   - Tests legitimate business pattern recognition to reduce false positives
   - Tests low severity pattern capping to prevent accumulation
   - Tests context detection (meeting, financial, support, newsletter, general)
   - Tests pattern detection for high/medium/low confidence patterns
   - Tests keyword density analysis with appropriate thresholds
   - Tests excessive punctuation and caps detection
   - Tests false positive reduction for legitimate business communications

2. **`app/api/services/detector/__tests__/emailAuthDetector.test.ts`**
   - Comprehensive unit tests for Email Authentication Detector
   - Tests SPF, DKIM, and DMARC authentication analysis
   - Tests risk scoring for normal and allow-listed domains
   - Tests recommendation generation
   - Tests real-world email scenarios

3. **`app/api/services/detector/__tests__/headerAnalyzer.test.ts`**
   - Comprehensive unit tests for Email Header Analyzer
   - Tests missing header detection (From, Return-Path, Message-ID, Received)
   - Tests From/Return-Path domain mismatch detection (high-risk spoofing indicator)
   - Tests Reply-To vs From mismatch detection
   - Tests trusted domain logic (localhost, 127.0.0.1, monitored emails)
   - Tests suspicious header patterns (User-Agent, X- headers, excessive Received)
   - Tests recommendation generation for header analysis
   - Tests edge cases and error handling

4. **`app/api/services/detector/__tests__/domainAnalyzer.test.ts`**
   - Comprehensive unit tests for Domain Analyzer
   - Tests typosquatting detection using Levenshtein distance
   - Tests homoglyph detection with confusables library
   - Tests suspicious domain pattern matching
   - Tests URL shortener detection
   - Tests IP address validation
   - Tests domain extraction from emails and URLs

5. **`app/api/services/detector/__tests__/domainAgeAnalyzer.test.ts`**
   - Comprehensive unit tests for Domain Age Analyzer
   - Tests WHOIS lookup with multiple API endpoints
   - Tests domain age risk scoring (very high, high, medium, low)
   - Tests intelligent caching system
   - Tests trusted domain allowlist functionality
   - Tests error handling and fallback mechanisms
   - Tests malformed date handling

6. **`app/api/services/detector/__tests__/attachmentAnalyzer.test.ts`**
   - Comprehensive unit tests for Attachment Analyzer
   - Tests malicious file type detection
   - Tests executable file identification
   - Tests archive and script file analysis
   - Tests allow-listed domain attachment handling
   - Tests risk scoring for different attachment types

7. **`app/api/services/detector/__tests__/linkAnalyzer.test.ts`**
   - Comprehensive unit tests for Link Analyzer
   - Tests URL validation and parsing
   - Tests domain analysis integration
   - Tests suspicious link pattern detection
   - Tests risk scoring for different link types
   - Tests integration with domain age analysis

### Test Organization

Tests are organized in `__tests__` directories alongside the code they test:

```
app/
├── api/
│   └── services/
│       └── detector/
│           ├── textAnalyzer.ts
│           ├── emailAuthDetector.ts
│           ├── headerAnalyzer.ts
│           ├── domainAnalyzer.ts
│           ├── domainAgeAnalyzer.ts
│           ├── attachmentAnalyzer.ts
│           ├── linkAnalyzer.ts
│           ├── phishingDetector.ts
│           └── __tests__/
│               ├── textAnalyzer.test.ts
│               ├── emailAuthDetector.test.ts
│               ├── headerAnalyzer.test.ts
│               ├── domainAnalyzer.test.ts
│               ├── domainAgeAnalyzer.test.ts
│               ├── attachmentAnalyzer.test.ts
│               └── linkAnalyzer.test.ts
```

## Test Categories

### 1. Unit Tests

- Test individual functions and methods
- Mock external dependencies
- Focus on specific functionality

### 2. Integration Tests

- Test component interactions
- Test API endpoints
- Test database operations

### 3. End-to-End Tests

- Test complete user workflows
- Test system behavior from user perspective

## Testing Best Practices

### 1. Test Structure

- Use `describe` blocks to group related tests
- Use descriptive test names that explain what is being tested
- Follow the Arrange-Act-Assert pattern

### 2. Mocking

- Mock external dependencies (database, APIs, etc.)
- Use Jest's built-in mocking capabilities
- Mock at the module level when possible

### 3. Test Data

- Use realistic test data
- Create test fixtures for complex data structures
- Avoid hardcoded values when possible

### 4. Assertions

- Use specific assertions (`toBe`, `toEqual`, `toContain`)
- Test both positive and negative cases
- Verify error conditions

## Example Test Structure

```typescript
import { beforeEach, describe, expect, jest, test } from "@jest/globals";

// Mock external dependencies
jest.mock("../../../db/connection.js", () => ({
  query: jest.fn(),
}));

import { ServiceClass } from "../serviceClass.js";

describe("ServiceClass", () => {
  let service: ServiceClass;

  beforeEach(() => {
    service = new ServiceClass();
  });

  describe("Method Group", () => {
    test("should handle success case", () => {
      // Arrange
      const input = "test input";

      // Act
      const result = service.method(input);

      // Assert
      expect(result).toBe("expected output");
    });

    test("should handle error case", () => {
      // Arrange
      const input = "invalid input";

      // Act & Assert
      expect(() => service.method(input)).toThrow("Error message");
    });
  });
});
```

## Coverage Goals

- **Statements**: 80%+
- **Branches**: 80%+
- **Functions**: 80%+
- **Lines**: 80%+

## Current Test Results

**All Tests Passing**: ✅ 264/264 tests passed across 7 test suites

### Test Suite Coverage:

- **Text Analyzer**: 23 tests - Intelligent text analysis with subject/body distinction
- **Domain Analyzer**: 45 tests - Domain analysis and typosquatting detection
- **Domain Age Analyzer**: 67 tests - WHOIS lookups and domain age analysis
- **Attachment Analyzer**: 23 tests - File attachment security analysis
- **Email Auth Detector**: 45 tests - SPF, DKIM, DMARC authentication
- **Link Analyzer**: 45 tests - URL and link security analysis
- **Header Analyzer**: 16 tests - Email header analysis

## Test Commands

| Command                 | Description                    |
| ----------------------- | ------------------------------ |
| `npm test`              | Run all tests once             |
| `npm run test:watch`    | Run tests in watch mode        |
| `npm run test:coverage` | Run tests with coverage report |

## Adding New Tests

1. Create test files in `__tests__` directories
2. Use `.test.ts` extension
3. Import Jest globals: `import { beforeEach, describe, expect, jest, test } from '@jest/globals';`
4. Mock external dependencies
5. Write descriptive test cases
6. Run tests to ensure they pass

## Test Data Management

- Use factories for creating test data
- Keep test data minimal and focused
- Use realistic but anonymized data
- Clean up test data after tests complete

## Continuous Integration

Tests should be run automatically on:

- Pull requests
- Main branch pushes
- Scheduled runs

## Troubleshooting

### Common Issues

1. **"Cannot find name 'jest'"**
   - Solution: Import Jest globals: `import { jest } from '@jest/globals';`

2. **Module resolution errors**
   - Check `moduleNameMapper` in Jest config
   - Ensure file extensions are correct

3. **TypeScript errors in tests**
   - Verify `tsconfig.test.json` includes test files
   - Check Jest types are installed

### Debug Mode

Run tests with debug output:

```bash
npm test -- --verbose
```

## Future Testing Plans

- [ ] Add integration tests for API endpoints
- [ ] Add end-to-end tests for user workflows
- [ ] Add performance tests for critical paths
- [ ] Add security tests for authentication flows
- [ ] Add visual regression tests for UI components
