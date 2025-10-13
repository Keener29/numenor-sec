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
```

## Test Structure

### Current Test Files

1. **`app/api/services/detector/__tests__/emailAuthDetector.test.ts`**
   - Comprehensive unit tests for Email Authentication Detector
   - Tests SPF, DKIM, and DMARC authentication analysis
   - Tests risk scoring for normal and allow-listed domains
   - Tests recommendation generation
   - Tests real-world email scenarios

### Test Organization

Tests are organized in `__tests__` directories alongside the code they test:

```
app/
├── api/
│   └── services/
│       └── detector/
│           ├── emailAuthDetector.ts
│           └── __tests__/
│               └── emailAuthDetector.test.ts
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
import { beforeEach, describe, expect, jest, test } from '@jest/globals';

// Mock external dependencies
jest.mock('../../../db/connection.js', () => ({
  query: jest.fn()
}));

import { ServiceClass } from '../serviceClass.js';

describe('ServiceClass', () => {
  let service: ServiceClass;

  beforeEach(() => {
    service = new ServiceClass();
  });

  describe('Method Group', () => {
    test('should handle success case', () => {
      // Arrange
      const input = 'test input';
      
      // Act
      const result = service.method(input);
      
      // Assert
      expect(result).toBe('expected output');
    });

    test('should handle error case', () => {
      // Arrange
      const input = 'invalid input';
      
      // Act & Assert
      expect(() => service.method(input)).toThrow('Error message');
    });
  });
});
```

## Coverage Goals

- **Statements**: 80%+
- **Branches**: 80%+
- **Functions**: 80%+
- **Lines**: 80%+

## Test Commands

| Command | Description |
|---------|-------------|
| `npm test` | Run all tests once |
| `npm run test:watch` | Run tests in watch mode |
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
