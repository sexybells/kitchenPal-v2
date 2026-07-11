/** Jest config for unit (*.spec.ts near sources) and e2e (*.e2e-spec.ts) suites. */
module.exports = {
  rootDir: ".",
  testEnvironment: "node",
  moduleFileExtensions: ["ts", "js", "json"],
  testRegex: ".*\\.(spec|e2e-spec)\\.ts$",
  transform: {
    "^.+\\.ts$": ["ts-jest", { tsconfig: "tsconfig.json" }],
  },
  setupFiles: ["<rootDir>/test/jest.setup.ts"],
  testTimeout: 60000,
};
