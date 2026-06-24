import type { Config } from 'jest';

const baseTransform = {
  '^.+\\.ts$': 'ts-jest',
};

const config: Config = {
  projects: [
    // Shared package
    {
      displayName: 'shared',
      testMatch: [
        '<rootDir>/packages/shared/src/**/*.test.ts',
        '<rootDir>/tests/unit/shared/**/*.test.ts',
        '<rootDir>/tests/property/shared/**/*.test.ts',
      ],
      transform: baseTransform,
      moduleFileExtensions: ['ts', 'js', 'json'],
      collectCoverageFrom: ['packages/shared/src/**/*.ts', '!packages/shared/src/**/*.test.ts'],
    },
    // Scheduler API service
    {
      displayName: 'scheduler-api',
      testMatch: [
        '<rootDir>/services/scheduler-api/src/**/*.test.ts',
        '<rootDir>/tests/unit/scheduler-api/**/*.test.ts',
        '<rootDir>/tests/property/scheduler-api/**/*.test.ts',
      ],
      transform: baseTransform,
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: {
        '^@task-orchestrator/shared$': '<rootDir>/packages/shared/src',
      },
      collectCoverageFrom: [
        'services/scheduler-api/src/**/*.ts',
        '!services/scheduler-api/src/**/*.test.ts',
      ],
    },
    // Executor Service
    {
      displayName: 'executor-service',
      testMatch: [
        '<rootDir>/services/executor-service/src/**/*.test.ts',
        '<rootDir>/tests/unit/executor-service/**/*.test.ts',
        '<rootDir>/tests/property/executor-service/**/*.test.ts',
      ],
      transform: baseTransform,
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: {
        '^@task-orchestrator/shared$': '<rootDir>/packages/shared/src',
      },
      collectCoverageFrom: [
        'services/executor-service/src/**/*.ts',
        '!services/executor-service/src/**/*.test.ts',
      ],
    },
    // Webhook Gateway
    {
      displayName: 'webhook-gateway',
      testMatch: [
        '<rootDir>/services/webhook-gateway/src/**/*.test.ts',
        '<rootDir>/tests/unit/webhook-gateway/**/*.test.ts',
        '<rootDir>/tests/property/webhook-gateway/**/*.test.ts',
      ],
      transform: baseTransform,
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: {
        '^@task-orchestrator/shared$': '<rootDir>/packages/shared/src',
      },
      collectCoverageFrom: [
        'services/webhook-gateway/src/**/*.ts',
        '!services/webhook-gateway/src/**/*.test.ts',
      ],
    },
    // Monitor Service
    {
      displayName: 'monitor-service',
      testMatch: [
        '<rootDir>/services/monitor-service/src/**/*.test.ts',
        '<rootDir>/tests/unit/monitor-service/**/*.test.ts',
        '<rootDir>/tests/property/monitor-service/**/*.test.ts',
      ],
      transform: baseTransform,
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: {
        '^@task-orchestrator/shared$': '<rootDir>/packages/shared/src',
      },
      collectCoverageFrom: [
        'services/monitor-service/src/**/*.ts',
        '!services/monitor-service/src/**/*.test.ts',
      ],
    },
    // Integration tests (longer timeout)
    {
      displayName: 'integration',
      testMatch: ['<rootDir>/tests/integration/**/*.test.ts'],
      transform: baseTransform,
      moduleFileExtensions: ['ts', 'js', 'json'],
      moduleNameMapper: {
        '^@task-orchestrator/shared$': '<rootDir>/packages/shared/src',
      },
      collectCoverageFrom: [
        'packages/shared/src/**/*.ts',
        'services/*/src/**/*.ts',
        '!**/*.test.ts',
      ],
    },
  ],
  coverageDirectory: '<rootDir>/coverage',
  coverageReporters: ['text', 'lcov', 'clover'],
};

export default config;
